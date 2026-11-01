// Google 연동: 캘린더(읽기), Gmail(임시보관함 저장만, 발송 안 함), Drive(앱이 만든 파일만)
import { randomBytes } from 'node:crypto';
import { db, save } from './store.js';

export const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/drive.file',
];
export const TZ = 'Asia/Seoul';
const DRIVE_FOLDER = 'AI 사무실';

// 테스트용: GOOGLE_TEST_ROOT 가 있으면 모든 Google 주소를 그쪽으로 보냄
const g = (url) => {
  const root = process.env.GOOGLE_TEST_ROOT;
  if (!root) return url;
  const u = new URL(url);
  return `${root}/${u.hostname}${u.pathname}${u.search}`;
};

const clientId = () => process.env.GOOGLE_CLIENT_ID;
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET;
// 인터넷 배포 시: APP_URL(직접 지정) → RENDER_EXTERNAL_URL(Render가 자동으로 넣어 줌) → 내 PC 주소
export const appUrl = () => (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const redirectUri = () => `${appUrl()}/auth/google/callback`;

export const configured = () => Boolean(clientId() && clientSecret());
export const connected = () => Boolean(db.google?.refreshToken);
export const status = () => ({ configured: configured(), connected: connected(), email: db.google?.email || null, redirectUri: redirectUri() });

// ───────── OAuth ─────────
const pendingStates = new Map(); // state → 만료시각
export function authUrl() {
  const state = randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + 10 * 60 * 1000);
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${g('https://accounts.google.com/o/oauth2/v2/auth')}?${p}`;
}

export function takeState(state) {
  const exp = pendingStates.get(state);
  pendingStates.delete(state);
  return Boolean(exp && exp > Date.now());
}

let access = null; // { token, exp }

async function tokenRequest(params) {
  const res = await fetch(g('https://oauth2.googleapis.com/token'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || `Google 토큰 오류 (${res.status})`);
    err.code = data.error;
    throw err;
  }
  return data;
}

export async function finishConnect(code) {
  const data = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
  if (!data.refresh_token) throw new Error('Google에서 장기 접근 권한(refresh token)을 받지 못했습니다. 연결을 해제한 뒤 다시 시도해 주세요.');
  let email = null;
  try {
    email = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64url').toString()).email || null;
  } catch {}
  const granted = String(data.scope || '').split(' ');
  db.google = { refreshToken: data.refresh_token, email, scopes: granted, connectedAt: new Date().toISOString(), folderId: null };
  save();
  access = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  return status();
}

export async function disconnect() {
  const token = db.google?.refreshToken;
  db.google = null;
  access = null;
  calendarCache = null;
  save();
  if (token) {
    await fetch(g(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`), { method: 'POST' }).catch(() => {});
  }
}

async function accessToken() {
  if (!connected()) throw Object.assign(new Error('Google 계정이 연결되어 있지 않습니다. [설정]에서 연결해 주세요.'), { status: 409 });
  if (access && access.exp > Date.now()) return access.token;
  try {
    const data = await tokenRequest({ refresh_token: db.google.refreshToken, grant_type: 'refresh_token' });
    access = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
    return access.token;
  } catch (err) {
    if (err.code === 'invalid_grant') {
      // 권한이 취소되었거나 만료됨 → 연결 해제 상태로
      db.google = null;
      save();
      throw Object.assign(new Error('Google 연결이 만료되었습니다. [설정]에서 다시 연결해 주세요.'), { status: 409 });
    }
    throw err;
  }
}

async function gfetch(url, opts = {}) {
  const res = await fetch(g(url), { ...opts, headers: { authorization: `Bearer ${await accessToken()}`, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || `Google 오류 (${res.status})`;
    throw Object.assign(new Error(res.status === 403 ? `권한이 부족합니다: ${msg}. [설정]에서 Google을 다시 연결해 주세요.` : msg), { status: 502 });
  }
  return data;
}

// ───────── 캘린더 (오늘·내일 일정) ─────────
export function seoulDate(offsetDays = 0, at = new Date()) {
  const d = new Date(at.getTime() + offsetDays * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); // YYYY-MM-DD
}

let calendarCache = null; // { at, events }
export async function upcomingEvents({ fresh = false } = {}) {
  if (!connected()) return [];
  if (!fresh && calendarCache && Date.now() - calendarCache.at < 2 * 60 * 1000) return calendarCache.events;
  const p = new URLSearchParams({
    timeMin: `${seoulDate(0)}T00:00:00+09:00`,
    timeMax: `${seoulDate(2)}T00:00:00+09:00`,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '30',
    timeZone: TZ,
  });
  const data = await gfetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`);
  const events = (data.items || [])
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({
      title: e.summary || '(제목 없음)',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      allDay: Boolean(e.start?.date && !e.start?.dateTime),
      location: e.location || '',
      link: e.htmlLink || '',
    }));
  calendarCache = { at: Date.now(), events };
  return events;
}

// 브리핑에 넣을 일정 텍스트
export function eventsText(events) {
  if (!events.length) return '(등록된 일정 없음)';
  const today = seoulDate(0);
  const fmt = new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  return events
    .map((e) => {
      const day = (e.allDay ? e.start : seoulDate(0, new Date(e.start))) === today ? '오늘' : '내일';
      const time = e.allDay ? '종일' : fmt.format(new Date(e.start));
      return `- ${day} ${time} ${e.title}${e.location ? ` @${e.location}` : ''}`;
    })
    .join('\n');
}

// ───────── Gmail: 임시보관함에 저장 (발송하지 않음) ─────────
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const headerSafe = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();

export async function createDraft({ to, subject, html }) {
  if (to && !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to)) throw Object.assign(new Error('받는 사람 이메일 형식이 올바르지 않습니다.'), { status: 400 });
  const lines = [
    ...(to ? [`To: ${headerSafe(to)}`] : []),
    `Subject: =?UTF-8?B?${b64(headerSafe(subject))}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(`<div style="font-family:sans-serif;line-height:1.6">${html}</div>`).replace(/.{76}/g, '$&\r\n'),
  ];
  const raw = Buffer.from(lines.join('\r\n')).toString('base64url');
  const data = await gfetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: { raw } }),
  });
  return { id: data.id, link: 'https://mail.google.com/mail/u/0/#drafts' };
}

// ───────── Drive: "AI 사무실" 폴더에 Google 문서로 저장 ─────────
async function folderId() {
  if (db.google.folderId) return db.google.folderId;
  const data = await gfetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  });
  db.google.folderId = data.id;
  save();
  return data.id;
}

export async function saveToDrive({ name, html }) {
  const upload = async (parent) => {
    const boundary = `aio${randomBytes(8).toString('hex')}`;
    const meta = { name, mimeType: 'application/vnd.google-apps.document', parents: [parent] };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<html><body>${html}</body></html>\r\n--${boundary}--`;
    return gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: { 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    });
  };
  try {
    return await upload(await folderId());
  } catch (err) {
    // 폴더를 대표님이 지웠다면 새로 만들어 다시 시도
    if (db.google?.folderId && err.status === 502) {
      db.google.folderId = null;
      return upload(await folderId());
    }
    throw err;
  }
}
