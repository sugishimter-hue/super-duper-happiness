// 카카오톡 "나에게 보내기" 알림 (대표님 본인 카톡으로만 보냄. 고객에게는 보내지 않음)
import { randomBytes } from 'node:crypto';
import { db, save } from './store.js';
import { appUrl } from './google.js';

// 테스트용: KAKAO_TEST_ROOT 가 있으면 모든 카카오 주소를 그쪽으로 보냄
const k = (url) => {
  const root = process.env.KAKAO_TEST_ROOT;
  if (!root) return url;
  const u = new URL(url);
  return `${root}/${u.hostname}${u.pathname}${u.search}`;
};

const restKey = () => process.env.KAKAO_REST_API_KEY;
const secret = () => process.env.KAKAO_CLIENT_SECRET || '';
const redirectUri = () => `${appUrl()}/auth/kakao/callback`;

export const configured = () => Boolean(restKey());
export const connected = () => Boolean(db.kakao?.refreshToken);
export const status = () => ({ configured: configured(), connected: connected(), nickname: db.kakao?.nickname || null, redirectUri: redirectUri(), lastError: db.kakao?.lastError || null });

const pending = new Map();
export function authUrl() {
  const state = randomBytes(16).toString('hex');
  pending.set(state, Date.now() + 10 * 60 * 1000);
  const p = new URLSearchParams({ client_id: restKey(), redirect_uri: redirectUri(), response_type: 'code', scope: 'talk_message', state });
  return `${k('https://kauth.kakao.com/oauth/authorize')}?${p}`;
}
export function takeState(state) {
  const exp = pending.get(state);
  pending.delete(state);
  return Boolean(exp && exp > Date.now());
}

let access = null; // { token, exp }

async function tokenRequest(params) {
  const body = new URLSearchParams({ client_id: restKey(), ...params });
  if (secret()) body.set('client_secret', secret());
  const res = await fetch(k('https://kauth.kakao.com/oauth/token'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error_description || data.error || `카카오 토큰 오류 (${res.status})`), { code: data.error });
  return data;
}

export async function finishConnect(code) {
  const data = await tokenRequest({ grant_type: 'authorization_code', redirect_uri: redirectUri(), code });
  if (!data.refresh_token) throw new Error('카카오에서 장기 접근 권한을 받지 못했습니다. 다시 시도해 주세요.');
  access = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  let nickname = null;
  try {
    const me = await fetch(k('https://kapi.kakao.com/v2/user/me'), { headers: { authorization: `Bearer ${data.access_token}` } }).then((r) => r.json());
    nickname = me.kakao_account?.profile?.nickname || me.properties?.nickname || null;
  } catch {}
  db.kakao = { refreshToken: data.refresh_token, nickname, connectedAt: new Date().toISOString(), lastError: null };
  save();
}

export async function disconnect() {
  const had = connected();
  let token = null;
  try {
    if (had) token = await accessToken();
  } catch {}
  db.kakao = null;
  access = null;
  save();
  if (token) await fetch(k('https://kapi.kakao.com/v1/user/unlink'), { method: 'POST', headers: { authorization: `Bearer ${token}` } }).catch(() => {});
}

async function accessToken() {
  if (!connected()) throw Object.assign(new Error('카카오톡이 연결되어 있지 않습니다. [설정]에서 연결해 주세요.'), { status: 409 });
  if (access && access.exp > Date.now()) return access.token;
  try {
    const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: db.kakao.refreshToken });
    access = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
    if (data.refresh_token) {
      // 카카오는 만료가 가까워지면 새 갱신 토큰을 줌
      db.kakao.refreshToken = data.refresh_token;
      save();
    }
    return access.token;
  } catch (err) {
    if (err.code === 'invalid_grant') {
      db.kakao = null;
      save();
      throw Object.assign(new Error('카카오톡 연결이 만료되었습니다. [설정]에서 다시 연결해 주세요.'), { status: 409 });
    }
    throw err;
  }
}

// 나에게 보내기 (텍스트 200자 제한)
export async function sendToMe(text, { buttonTitle = '사무실 열기', path = '/' } = {}) {
  const link = `${appUrl()}${path}`;
  const template = {
    object_type: 'text',
    text: text.length > 200 ? text.slice(0, 197) + '…' : text,
    link: { web_url: link, mobile_web_url: link },
    button_title: buttonTitle,
  };
  const res = await fetch(k('https://kapi.kakao.com/v2/api/talk/memo/default/send'), {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams({ template_object: JSON.stringify(template) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.result_code !== 0) {
    const msg = data.msg || `카카오톡 전송 실패 (${res.status})`;
    if (db.kakao) {
      db.kakao.lastError = `${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} ${msg}`;
      save();
    }
    throw Object.assign(new Error(res.status === 403 ? `카카오톡 메시지 권한이 없습니다. 카카오 개발자 콘솔에서 '카카오톡 메시지 전송' 동의항목을 켜 주세요. (${msg})` : msg), { status: 502 });
  }
  if (db.kakao?.lastError) {
    db.kakao.lastError = null;
    save();
  }
}
