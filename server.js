// AI 사무실 서버 — 실행: npm start  →  http://localhost:3000
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

try {
  process.loadEnvFile(); // .env 파일이 있으면 읽기
} catch {}

const { db, save, uid, now } = await import('./src/store.js');
const ai = await import('./src/ai.js');
const auth = await import('./src/auth.js');
const google = await import('./src/google.js');
const kakao = await import('./src/kakao.js');
const slides = await import('./src/slides.js');
const { SECRETARY } = await import('./src/seed.js');

// 비밀번호를 잊었을 때: npm run reset-password
if (process.argv.includes('--reset-password')) {
  db.auth = null;
  db.sessions = [];
  save();
  console.log('🔑 비밀번호를 초기화했습니다. 앱을 다시 켜고 브라우저에서 새 비밀번호를 정해 주세요.');
  process.exit(0);
}

const PORT = Number(process.env.PORT) || 3000;
const SECURE = google.appUrl().startsWith('https://');
// 인터넷에 공개된 상태에서 처음 비밀번호를 정할 때 필요한 설정 코드 (다른 사람이 먼저 차지하지 못하게)
const SETUP_CODE = (process.env.SETUP_CODE || '').trim();
const setupCodeRequired = () => auth.needsSetup() && (Boolean(SETUP_CODE) || SECURE);

// 접속한 사람의 IP (Render 같은 배포 환경에서는 프록시가 붙여 준 마지막 주소를 사용)
function clientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress;
}
function sameText(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const ctx = (extra = {}) => ({ owner: db.owner, employees: db.employees, knowledge: db.knowledge, tasks: db.tasks, ...extra });

// ───────────── 업무 실행 (백그라운드) ─────────────
async function runTask(task) {
  const employee = db.employees.find((e) => e.id === task.employeeId);
  task.status = 'working';
  task.error = null;
  task.updatedAt = now();
  save();
  try {
    if (!employee) throw new Error('담당 직원이 삭제되었습니다. 다른 직원에게 다시 지시해 주세요.');
    task.result = await ai.doTask(task, employee, ctx());
    task.status = 'review';
    queueReviewNotice(task, employee);
  } catch (err) {
    task.status = 'error';
    task.error = err.message;
  }
  task.updatedAt = now();
  save();
}

async function processOrder(order) {
  try {
    const plan = await ai.planOrder(order.text, ctx());
    order.summary = plan.summary;
    order.status = 'assigned';
    const tasks = plan.assignments.map((a) => ({
      id: uid('t'),
      orderId: order.id,
      orderText: order.text,
      employeeId: a.employee_id,
      title: a.title,
      instructions: a.instructions,
      status: 'working',
      result: '',
      history: [],
      error: null,
      createdAt: now(),
      updatedAt: now(),
    }));
    db.tasks.unshift(...tasks);
    save();
    await Promise.all(tasks.map(runTask));
  } catch (err) {
    order.status = 'error';
    order.summary = `업무 분배 실패: ${err.message}`;
    save();
  }
}

// ───────────── 브리핑 (수동 + 매일 자동) ─────────────
let briefingRunning = null;
function makeBriefing(kind) {
  if (briefingRunning) return briefingRunning;
  briefingRunning = (async () => {
    let calendar = null;
    let calendarError = null;
    if (google.connected()) {
      try {
        calendar = google.eventsText(await google.upcomingEvents({ fresh: true }));
      } catch (err) {
        calendarError = err.message;
      }
    }
    const text = await ai.makeBriefing(ctx({ calendar }));
    db.briefing = { text: calendarError ? `${text}\n\n> ⚠️ 캘린더를 읽지 못했습니다: ${calendarError}` : text, at: now(), kind, date: google.seoulDate(0) };
    save();
    return db.briefing;
  })().finally(() => (briefingRunning = null));
  return briefingRunning;
}

function seoulHHMM() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: google.TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

let autoFailedDate = null;
async function briefingTick() {
  const s = db.settings;
  if (!s?.autoBriefing || briefingRunning) return;
  const today = google.seoulDate(0);
  if (db.autoBriefingDate === today) return; // 오늘 자동 브리핑 이미 완료
  if (autoFailedDate === today) return; // 오늘 실패했으면 반복 시도하지 않음 (요금 낭비 방지)
  if (seoulHHMM() < s.briefingTime) return;
  try {
    const b = await makeBriefing('auto');
    db.autoBriefingDate = today;
    save();
    if (db.settings.notifyBriefing) notify(`☀️ 오늘의 브리핑\n\n${plain(b.text)}`, '브리핑 보기');
    if (db.settings.notifyWeekly && isMonday()) weeklyAuto();
    console.log(`☀️  ${today} 아침 브리핑을 자동으로 만들었습니다.`);
  } catch (err) {
    autoFailedDate = today;
    console.error('자동 브리핑 실패:', err.message);
  }
}

// ───────────── 라우팅 ─────────────
const routes = [];
// opts.public: 로그인 없이 접근 가능
const route = (method, pattern, handler, opts = {}) =>
  routes.push({ method, re: new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`), handler, ...opts });
const fail = (status, message) => Object.assign(new Error(message), { status });
const findTask = (id) => db.tasks.find((t) => t.id === id) ?? (() => { throw fail(404, '업무를 찾을 수 없습니다.'); })();
const text = (v, field, max = 20000) => {
  if (typeof v !== 'string' || !v.trim()) throw fail(400, `${field}을(를) 입력해 주세요.`);
  return v.trim().slice(0, max);
};

// ── 로그인 ──
route('GET', '/api/auth/status', (_b, _p, req) => ({ needsSetup: auth.needsSetup(), setupCodeRequired: setupCodeRequired(), loggedIn: auth.isLoggedIn(req) }), { public: true });

route('POST', '/api/auth/setup', (body, _p, req, res) => {
  if (!auth.needsSetup()) throw fail(409, '이미 비밀번호가 설정되어 있습니다.');
  if (setupCodeRequired()) {
    const ip = clientIp(req);
    if (auth.loginBlocked(ip)) throw fail(429, '여러 번 틀렸습니다. 15분 뒤에 다시 시도해 주세요.');
    if (!SETUP_CODE) throw fail(403, '인터넷에 공개된 상태에서는 설정 코드가 필요합니다. 서버 환경변수 SETUP_CODE 를 정한 뒤 다시 시도해 주세요.');
    if (!sameText(String(body.code || '').trim(), SETUP_CODE)) {
      auth.recordFail(ip);
      throw fail(401, '설정 코드가 맞지 않습니다. Render의 Environment 화면에서 SETUP_CODE 값을 확인해 주세요.');
    }
  }
  const err = auth.validateNewPassword(body.password);
  if (err) throw fail(400, err);
  auth.setPassword(body.password);
  res.setHeader('set-cookie', auth.sessionCookie(auth.createSession(), SECURE));
  return { ok: true };
}, { public: true });

route('POST', '/api/auth/login', (body, _p, req, res) => {
  const ip = clientIp(req);
  if (auth.loginBlocked(ip)) throw fail(429, '비밀번호를 여러 번 틀렸습니다. 15분 뒤에 다시 시도해 주세요.');
  if (!auth.checkPassword(body.password)) {
    auth.recordFail(ip);
    throw fail(401, '비밀번호가 맞지 않습니다.');
  }
  auth.clearFails(ip);
  res.setHeader('set-cookie', auth.sessionCookie(auth.createSession(), SECURE));
  return { ok: true };
}, { public: true });

route('POST', '/api/auth/logout', (_b, _p, req, res) => {
  auth.destroySession(auth.readToken(req));
  res.setHeader('set-cookie', auth.sessionCookie(null, SECURE));
  return { ok: true };
}, { public: true });

route('POST', '/api/auth/password', (body, _p, _req, res) => {
  if (!auth.checkPassword(body.current)) throw fail(400, '현재 비밀번호가 맞지 않습니다.');
  const err = auth.validateNewPassword(body.password);
  if (err) throw fail(400, err);
  auth.setPassword(body.password);
  res.setHeader('set-cookie', auth.sessionCookie(auth.createSession(), SECURE));
  return { ok: true };
});

// ── 상태 ──
route('GET', '/api/state', () => ({
  demo: ai.DEMO,
  owner: db.owner,
  secretary: SECRETARY,
  employees: db.employees,
  knowledge: db.knowledge,
  orders: db.orders.slice(0, 50),
  tasks: db.tasks.slice(0, 200),
  briefing: db.briefing,
  settings: db.settings,
  google: google.status(),
  kakao: kakao.status(),
  themes: slides.THEMES,
}));

// ── 설정 ──
route('PUT', '/api/settings', (body) => {
  const s = { ...db.settings };
  if ('autoBriefing' in body) s.autoBriefing = Boolean(body.autoBriefing);
  if ('briefingTime' in body) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.briefingTime)) throw fail(400, '시간 형식이 올바르지 않습니다 (예: 08:00).');
    s.briefingTime = body.briefingTime;
  }
  for (const key of ['notifyReview', 'notifyBriefing', 'notifyWeekly']) if (key in body) s[key] = Boolean(body[key]);
  if ('minutesPerTask' in body) {
    const m = Number(body.minutesPerTask);
    if (!Number.isFinite(m) || m < 1 || m > 600) throw fail(400, '업무 1건당 절약 시간은 1~600분 사이로 적어 주세요.');
    s.minutesPerTask = Math.round(m);
  }
  if ('slideTheme' in body && slides.THEMES[body.slideTheme]) s.slideTheme = body.slideTheme;
  db.settings = s;
  save();
  return s;
});

// ── 업무 지시 ──
route('POST', '/api/orders', (body) => {
  const order = { id: uid('o'), text: text(body.text, '지시 내용', 4000), summary: '비서실장이 업무를 나누는 중…', status: 'planning', createdAt: now() };
  db.orders.unshift(order);
  save();
  processOrder(order);
  return order;
});

// 특정 직원에게 직접 지시 (비서실장 거치지 않음)
route('POST', '/api/employees/:id/tasks', (body, [id]) => {
  const emp = db.employees.find((e) => e.id === id);
  if (!emp) throw fail(404, '직원을 찾을 수 없습니다.');
  const orderText = text(body.text, '지시 내용', 4000);
  const order = { id: uid('o'), text: orderText, summary: `${emp.name}에게 직접 지시`, status: 'assigned', createdAt: now() };
  const task = { id: uid('t'), orderId: order.id, orderText, employeeId: id, title: orderText.slice(0, 24), instructions: orderText, status: 'working', result: '', history: [], error: null, createdAt: now(), updatedAt: now() };
  db.orders.unshift(order);
  db.tasks.unshift(task);
  save();
  runTask(task);
  return task;
});

// ── 결재: 승인 / 수정 요청 / 반려 / 재시도 ──
route('POST', '/api/tasks/:id/approve', (_b, [id]) => {
  const t = findTask(id);
  if (t.status !== 'review') throw fail(409, '결재 대기 중인 업무만 승인할 수 있습니다.');
  Object.assign(t, { status: 'done', approvedAt: now(), updatedAt: now() });
  save();
  return t;
});
route('POST', '/api/tasks/:id/revise', (body, [id]) => {
  const t = findTask(id);
  if (t.status !== 'review') throw fail(409, '결재 대기 중인 업무만 수정 요청할 수 있습니다.');
  t.history.push({ feedback: text(body.feedback, '수정 요청 내용', 4000), result: t.result, at: now() });
  runTask(t);
  return t;
});
route('POST', '/api/tasks/:id/reject', (_b, [id]) => {
  const t = findTask(id);
  if (t.status === 'working') throw fail(409, '작업 중인 업무는 끝난 뒤 반려할 수 있습니다.');
  Object.assign(t, { status: 'rejected', updatedAt: now() });
  save();
  return t;
});
route('POST', '/api/tasks/:id/retry', (_b, [id]) => {
  const t = findTask(id);
  if (t.status !== 'error') throw fail(409, '오류가 난 업무만 다시 시도할 수 있습니다.');
  runTask(t);
  return t;
});
route('DELETE', '/api/tasks/:id', (_b, [id]) => {
  const t = findTask(id);
  if (t.status === 'working') throw fail(409, '작업 중인 업무는 삭제할 수 없습니다.');
  db.tasks.splice(db.tasks.indexOf(t), 1);
  save();
  return { ok: true };
});

// ── 승인된 결과물 → Google (Gmail 임시보관함 / Drive) ──
const approvedTask = (id) => {
  const t = findTask(id);
  if (t.status !== 'done') throw fail(409, '결재(승인)된 업무만 Google로 보낼 수 있습니다.');
  return t;
};
route('POST', '/api/tasks/:id/gmail-draft', async (body, [id]) => {
  const t = approvedTask(id);
  const draft = await google.createDraft({
    to: typeof body.to === 'string' ? body.to.trim() : '',
    subject: (typeof body.subject === 'string' && body.subject.trim()) || t.title,
    html: text(body.html, '본문', 500000),
  });
  t.gmailDraftAt = now();
  save();
  return draft;
});
route('POST', '/api/tasks/:id/drive', async (body, [id]) => {
  const t = approvedTask(id);
  const date = google.seoulDate(0);
  const file = await google.saveToDrive({ name: `${date} ${t.title}`, html: text(body.html, '본문', 500000) });
  t.driveLink = file.webViewLink;
  save();
  return file;
});

// ── 캘린더 / 브리핑 ──
route('GET', '/api/calendar', async () => ({ connected: google.connected(), events: await google.upcomingEvents() }));
route('POST', '/api/briefing', () => makeBriefing('manual'));

// ── Google 연결 해제 ──
route('POST', '/api/google/disconnect', async () => {
  await google.disconnect();
  return google.status();
});

// ── 직원 관리 ──
const cleanEmployee = (b) => ({
  name: text(b.name, '이름', 20),
  role: text(b.role, '직무', 40),
  dept: text(b.dept, '부서', 40),
  emoji: (typeof b.emoji === 'string' && b.emoji.trim().slice(0, 4)) || '🙂',
  guide: text(b.guide, '업무 지침서', 4000),
  keywords: (Array.isArray(b.keywords) ? b.keywords : String(b.keywords ?? '').split(','))
    .map((k) => String(k).trim())
    .filter(Boolean)
    .slice(0, 30),
});
route('POST', '/api/employees', (body) => {
  const emp = { id: uid('e'), ...cleanEmployee(body) };
  db.employees.push(emp);
  save();
  return emp;
});
route('PUT', '/api/employees/:id', (body, [id]) => {
  const emp = db.employees.find((e) => e.id === id);
  if (!emp) throw fail(404, '직원을 찾을 수 없습니다.');
  Object.assign(emp, cleanEmployee(body));
  save();
  return emp;
});
route('DELETE', '/api/employees/:id', (_b, [id]) => {
  const i = db.employees.findIndex((e) => e.id === id);
  if (i < 0) throw fail(404, '직원을 찾을 수 없습니다.');
  if (db.employees.length === 1) throw fail(409, '직원이 최소 한 명은 있어야 합니다.');
  db.employees.splice(i, 1);
  save();
  return { ok: true };
});

// ── 지식창고 ──
route('POST', '/api/knowledge', (body) => {
  const k = { id: uid('k'), title: text(body.title, '제목', 100), content: text(body.content, '내용', 20000) };
  db.knowledge.push(k);
  save();
  return k;
});
route('DELETE', '/api/knowledge/:id', (_b, [id]) => {
  db.knowledge = db.knowledge.filter((k) => k.id !== id);
  save();
  return { ok: true };
});

// ───────────── 카카오톡 알림 ─────────────
// 마크다운을 카톡용 일반 글자로
function plain(md) {
  return String(md)
    .replace(/\*\*|__|`/g, '')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function notify(text, buttonTitle) {
  if (!kakao.connected()) return;
  kakao.sendToMe(text, { buttonTitle }).catch((err) => console.error('카카오톡 알림 실패:', err.message));
}

// 결과물이 연달아 도착하면 모아서 한 번에 알림 (기본 1분)
const NOTIFY_DELAY = Number(process.env.NOTIFY_DELAY_MS) || 60_000;
let reviewQueue = [];
let reviewTimer = null;
function queueReviewNotice(task, employee) {
  if (!db.settings.notifyReview || !kakao.connected()) return;
  reviewQueue.push(`• ${task.title} (${employee.name})`);
  clearTimeout(reviewTimer);
  reviewTimer = setTimeout(() => {
    const items = reviewQueue;
    reviewQueue = [];
    notify(`📥 결재함에 ${items.length}건이 도착했습니다\n\n${items.slice(0, 6).join('\n')}${items.length > 6 ? `\n외 ${items.length - 6}건` : ''}`, '결재하러 가기');
  }, NOTIFY_DELAY);
}

route('POST', '/api/kakao/test', async () => {
  await kakao.sendToMe('🏢 AI 사무실 알림 테스트입니다. 이 메시지가 보이면 카카오톡 알림이 잘 연결된 것입니다 😊');
  return { ok: true };
});
route('POST', '/api/kakao/disconnect', async () => {
  await kakao.disconnect();
  return kakao.status();
});

// ───────────── PPT · 카드뉴스 ─────────────
class FileReply {
  constructor(data, name, type) {
    Object.assign(this, { data, name, type });
  }
}
const KINDS = ['ppt', 'cards'];
const slideReady = (id) => {
  const t = findTask(id);
  if (t.status !== 'review' && t.status !== 'done') throw fail(409, '결과물이 완성된 업무만 PPT·카드뉴스로 만들 수 있습니다.');
  return t;
};

// 슬라이드 구성 만들기 (AI) → 미리보기용으로 저장
route('POST', '/api/tasks/:id/slides', async (body, [id]) => {
  const t = slideReady(id);
  const kind = KINDS.includes(body.kind) ? body.kind : 'ppt';
  const data = await ai.toSlides(t, kind, ctx());
  t.slides = { ...(t.slides || {}), [kind]: { data, resultAt: t.updatedAt, at: now() } };
  save();
  return { kind, data };
});

// 파일 받기
route('GET', '/api/tasks/:id/pptx', (_b, [id], req) => {
  const t = slideReady(id);
  const q = new URL(req.url, 'http://x').searchParams;
  const kind = KINDS.includes(q.get('kind')) ? q.get('kind') : 'ppt';
  const saved = t.slides?.[kind];
  if (!saved) throw fail(409, '먼저 미리보기를 만들어 주세요.');
  const theme = slides.THEMES[q.get('theme')] ? q.get('theme') : db.settings.slideTheme;
  const footer = `${db.owner.name} ${db.owner.title}`;
  return slides.buildPptx(kind, saved.data, theme, footer).then((buf) => {
    const safe = t.title.replace(/[\\/:*?"<>|]/g, '_');
    return new FileReply(buf, `${safe}_${kind === 'cards' ? '카드뉴스' : '강의자료'}.pptx`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  });
});

// ───────────── 주간 업무 보고서 ─────────────
const DAY = 864e5;
function weekRange(offset = 0) {
  const today = google.seoulDate(0);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0=일
  const monday = new Date(Date.parse(`${today}T00:00:00+09:00`) - ((dow + 6) % 7) * DAY + offset * 7 * DAY);
  const from = monday.getTime();
  const to = from + 7 * DAY;
  return { from, to, key: google.seoulDate(0, monday), label: [google.seoulDate(0, monday), google.seoulDate(0, new Date(to - DAY))] };
}
const isMonday = () => new Date(`${google.seoulDate(0)}T00:00:00Z`).getUTCDay() === 1;

function buildReport(offset = 0) {
  const { from, to, key, label } = weekRange(offset);
  const inRange = (iso) => iso && Date.parse(iso) >= from && Date.parse(iso) < to;
  const current = offset === 0;
  const per = new Map(db.employees.map((e) => [e.id, { id: e.id, name: e.name, role: e.role, emoji: e.emoji, done: 0, review: 0, rejected: 0, revisions: 0 }]));
  const totals = { orders: db.orders.filter((o) => inRange(o.createdAt)).length, done: 0, review: 0, rejected: 0, revisions: 0 };
  const doneTitles = [];
  const daily = Array.from({ length: 7 }, (_, i) => ({ date: google.seoulDate(0, new Date(from + i * DAY)), done: 0 }));
  for (const t of db.tasks) {
    const e = per.get(t.employeeId);
    const doneAt = t.approvedAt || t.updatedAt;
    if (t.status === 'done' && inRange(doneAt)) {
      totals.done++;
      if (e) e.done++;
      doneTitles.push(t.title);
      const d = daily.find((x) => x.date === google.seoulDate(0, new Date(doneAt)));
      if (d) d.done++;
    }
    if (current && t.status === 'review') {
      totals.review++;
      if (e) e.review++;
    }
    if (t.status === 'rejected' && inRange(t.updatedAt)) {
      totals.rejected++;
      if (e) e.rejected++;
    }
    const revs = (t.history || []).filter((h) => inRange(h.at)).length;
    totals.revisions += revs;
    if (e) e.revisions += revs;
  }
  totals.savedHours = Math.round(((totals.done * db.settings.minutesPerTask) / 60) * 10) / 10;
  return {
    key,
    offset,
    from: label[0],
    to: label[1],
    totals,
    daily,
    byEmployee: [...per.values()].filter((e) => e.done || e.review || e.rejected || e.revisions),
    doneTitles,
    minutesPerTask: db.settings.minutesPerTask,
    review: db.weeklyReviews?.[key] || null,
  };
}

route('GET', '/api/report', (_b, _p, req) => {
  const offset = Math.max(-52, Math.min(0, Number(new URL(req.url, 'http://x').searchParams.get('week')) || 0));
  return buildReport(offset);
});
route('POST', '/api/report/review', async (body) => {
  const offset = Math.max(-52, Math.min(0, Number(body.week) || 0));
  const report = buildReport(offset);
  const text = await ai.weeklyReview(report, ctx());
  db.weeklyReviews = { ...(db.weeklyReviews || {}), [report.key]: { text, at: now() } };
  save();
  return buildReport(offset);
});

// 월요일 아침: 지난주 보고서 총평을 만들고 카톡으로 알림
let weeklyRunning = false;
async function weeklyAuto() {
  const last = buildReport(-1);
  if (weeklyRunning || db.weeklyReviews?.[last.key]) return;
  weeklyRunning = true;
  try {
    const text = await ai.weeklyReview(last, ctx());
    db.weeklyReviews = { ...(db.weeklyReviews || {}), [last.key]: { text, at: now() } };
    save();
    notify(`📈 지난주 업무 보고 (${last.from} ~ ${last.to})\n완료 ${last.totals.done}건 · 절약 약 ${last.totals.savedHours}시간\n\n${plain(text)}`, '보고서 보기');
  } catch (err) {
    console.error('주간 보고서 자동 생성 실패:', err.message);
  } finally {
    weeklyRunning = false;
  }
}

// ───────────── 카카오 OAuth (브라우저 이동) ─────────────
async function handleKakaoAuth(url, req, res) {
  if (!auth.isLoggedIn(req)) return redirect(res, '/');
  if (url.pathname === '/auth/kakao/start') {
    if (!kakao.configured()) return redirect(res, '/?kakao=not-configured');
    return redirect(res, kakao.authUrl());
  }
  const q = url.searchParams;
  if (q.get('error')) return redirect(res, '/?kakao=denied');
  if (!kakao.takeState(q.get('state') || '')) return redirect(res, '/?kakao=expired');
  try {
    await kakao.finishConnect(q.get('code') || '');
    redirect(res, '/?kakao=connected');
  } catch (err) {
    console.error('카카오 연결 실패:', err.message);
    redirect(res, `/?kakao=error&msg=${encodeURIComponent(err.message)}`);
  }
}

// ───────────── Google OAuth (브라우저 이동) ─────────────
function redirect(res, to) {
  res.writeHead(302, { location: to }).end();
}
async function handleGoogleAuth(url, req, res) {
  if (!auth.isLoggedIn(req)) return redirect(res, '/');
  if (url.pathname === '/auth/google/start') {
    if (!google.configured()) return redirect(res, '/?google=not-configured');
    return redirect(res, google.authUrl());
  }
  // /auth/google/callback
  const q = url.searchParams;
  if (q.get('error')) return redirect(res, `/?google=denied`);
  if (!google.takeState(q.get('state') || '')) return redirect(res, '/?google=expired');
  try {
    await google.finishConnect(q.get('code') || '');
    redirect(res, '/?google=connected');
  } catch (err) {
    console.error('Google 연결 실패:', err.message);
    redirect(res, `/?google=error&msg=${encodeURIComponent(err.message)}`);
  }
}

// ───────────── HTTP 서버 ─────────────
async function readBody(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 2_000_000) throw fail(413, '내용이 너무 깁니다.');
  }
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    throw fail(400, '잘못된 요청 형식입니다.');
  }
}

// 다른 사이트에서 몰래 요청을 보내는 것(CSRF) 차단
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // 브라우저가 아닌 요청이거나 같은 사이트의 일부 요청
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  ...(SECURE ? { 'strict-transport-security': 'max-age=31536000' } : {}),
};

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://localhost');

  // 배포 서비스가 "살아 있나" 확인하는 주소
  if (url.pathname === '/healthz') return res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');

  if (url.pathname === '/auth/kakao/start' || url.pathname === '/auth/kakao/callback') {
    return handleKakaoAuth(url, req, res).catch((err) => {
      console.error(err);
      res.writeHead(500).end('오류가 발생했습니다.');
    });
  }
  if (url.pathname === '/auth/google/start' || url.pathname === '/auth/google/callback') {
    return handleGoogleAuth(url, req, res).catch((err) => {
      console.error(err);
      res.writeHead(500).end('오류가 발생했습니다.');
    });
  }

  if (url.pathname.startsWith('/api/')) {
    const r = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    try {
      if (!r) throw fail(404, '없는 주소입니다.');
      if (req.method !== 'GET' && !sameOrigin(req)) throw fail(403, '허용되지 않은 요청입니다.');
      if (!r.public && !auth.isLoggedIn(req)) throw fail(401, '로그인이 필요합니다.');
      const params = url.pathname.match(r.re).slice(1).map(decodeURIComponent);
      const out = await r.handler(await readBody(req), params, req, res);
      if (out instanceof FileReply) {
        res.writeHead(200, {
          'content-type': out.type,
          'content-disposition': `attachment; filename="file${path.extname(out.name)}"; filename*=UTF-8''${encodeURIComponent(out.name)}`,
          'cache-control': 'no-store',
        });
        return res.end(out.data);
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(out));
    } catch (err) {
      if (!err.status) console.error(err);
      res.writeHead(err.status || 500, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  // 정적 파일
  const file = path.join(PUBLIC, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(PUBLIC)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

// 서버가 꺼졌다 켜지면 '작업 중'이던 업무는 오류로 표시 (재시도 가능)
for (const t of db.tasks) if (t.status === 'working') Object.assign(t, { status: 'error', error: '서버가 다시 시작되어 작업이 중단되었습니다. 다시 시도해 주세요.' });
for (const o of db.orders) if (o.status === 'planning') Object.assign(o, { status: 'error', summary: '서버가 다시 시작되어 분배가 중단되었습니다.' });

server.listen(PORT, () => {
  console.log(`\n🏢 AI 사무실이 열렸습니다 → ${google.appUrl()}`);
  console.log(ai.DEMO ? '🧪 데모 모드: 예시 결과물로 동작합니다.' : '🤖 Claude 연결됨: AI 직원들이 실제로 일합니다.');
  console.log(google.configured() ? `🔗 Google 연동 준비됨${google.connected() ? ` (${db.google.email || '연결됨'})` : ' (앱의 [설정]에서 연결하세요)'}` : '🔗 Google 연동: .env 에 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 를 넣으면 사용할 수 있습니다.');
  console.log(kakao.configured() ? `💬 카카오톡 알림 준비됨${kakao.connected() ? ' (연결됨)' : ' (앱의 [설정]에서 연결하세요)'}` : '💬 카카오톡 알림: .env 에 KAKAO_REST_API_KEY 를 넣으면 사용할 수 있습니다.');
  console.log(auth.needsSetup() ? '🔐 처음 실행입니다. 브라우저에서 비밀번호를 정해 주세요.\n' : '');
  setInterval(briefingTick, 30_000);
  briefingTick();
});
