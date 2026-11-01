// AI 사무실 서버 — 실행: npm start  →  http://localhost:3000
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(); // .env 파일이 있으면 읽기
} catch {}

const { db, save, uid, now } = await import('./src/store.js');
const ai = await import('./src/ai.js');
const { SECRETARY } = await import('./src/seed.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const ctx = () => ({ owner: db.owner, employees: db.employees, knowledge: db.knowledge, tasks: db.tasks });

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

// ───────────── 라우팅 ─────────────
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`), handler });
const fail = (status, message) => Object.assign(new Error(message), { status });
const findTask = (id) => db.tasks.find((t) => t.id === id) ?? (() => { throw fail(404, '업무를 찾을 수 없습니다.'); })();
const text = (v, field, max = 20000) => {
  if (typeof v !== 'string' || !v.trim()) throw fail(400, `${field}을(를) 입력해 주세요.`);
  return v.trim().slice(0, max);
};

route('GET', '/api/state', () => ({
  demo: ai.DEMO,
  owner: db.owner,
  secretary: SECRETARY,
  employees: db.employees,
  knowledge: db.knowledge,
  orders: db.orders.slice(0, 50),
  tasks: db.tasks.slice(0, 200),
  briefing: db.briefing,
}));

// 업무 지시
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

// 결재: 승인 / 수정 요청 / 반려 / 재시도
route('POST', '/api/tasks/:id/approve', (_b, [id]) => {
  const t = findTask(id);
  if (t.status !== 'review') throw fail(409, '결재 대기 중인 업무만 승인할 수 있습니다.');
  Object.assign(t, { status: 'done', updatedAt: now() });
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

// 아침 브리핑
route('POST', '/api/briefing', async () => {
  db.briefing = { text: await ai.makeBriefing(ctx()), at: now() };
  save();
  return db.briefing;
});

// 직원 관리
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

// 지식창고
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

// ───────────── HTTP 서버 ─────────────
async function readBody(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1_000_000) throw fail(413, '내용이 너무 깁니다.');
  }
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    throw fail(400, '잘못된 요청 형식입니다.');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const r = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    try {
      if (!r) throw fail(404, '없는 주소입니다.');
      const params = url.pathname.match(r.re).slice(1).map(decodeURIComponent);
      const out = await r.handler(await readBody(req), params);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(out));
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
  console.log(`\n🏢 AI 사무실이 열렸습니다 → http://localhost:${PORT}`);
  console.log(ai.DEMO ? '🧪 데모 모드 (API 키 없음): 예시 결과물로 동작합니다.\n' : '🤖 Claude 연결됨: AI 직원들이 실제로 일합니다.\n');
});
