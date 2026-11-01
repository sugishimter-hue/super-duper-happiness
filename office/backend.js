// 실제 사무실(claude.ai 페이지판)의 "서버" 역할
// 저장: claude.ai db 기능 / AI: claude.ai sample 기능(대표님 Claude 계정) / 파일: downloads 기능
// 화면(public/app.js)은 그대로 쓰고, 화면이 부르는 /api/... 요청을 여기서 처리합니다.
(() => {
  const SECRETARY = __SECRETARY__;
  const SLIDES = (() => {
    __SLIDES_SRC__
    return { THEMES, SCHEMAS, fromMarkdown, normalize, buildPptx };
  })();

  const realFetch = window.fetch.bind(window);
  const now = () => new Date().toISOString();
  const TZ = 'Asia/Seoul';
  const seoulDate = (offsetDays = 0, at = new Date()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at.getTime() + offsetDays * 864e5));
  const seoulHHMM = () => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const DEFAULT_SETTINGS = { autoBriefing: true, briefingTime: '08:00', minutesPerTask: 40, slideTheme: 'lavender' };
  const FALLBACK_OWNER = { name: '대표', title: '', company: '', profile: '' };

  // ───────── 상태 (db에서 실시간으로 받아 둠) ─────────
  const S = { employees: [], knowledge: [], orders: [], tasks: [], reviews: {}, settings: { ...DEFAULT_SETTINGS }, briefing: null, profile: null, loaded: new Set() };
  let db = null;
  let sample = null;
  let downloads = null;
  const active = new Set(); // 이 화면에서 지금 일하고 있는 업무

  function notice(msg) {
    const el = document.getElementById('officeNotice');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  const byDate = (k, dir = -1) => (a, b) => (a[k] < b[k] ? -dir : a[k] > b[k] ? dir : 0);
  const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...structuredClone(d.data()) }));

  // 저장된 내용이 바뀌면 화면을 바로 다시 그림 (여러 변경은 한 번에)
  let uiTimer = null;
  function uiRefresh() {
    clearTimeout(uiTimer);
    uiTimer = setTimeout(() => {
      window.__officeRefresh?.();
      if (S.loaded.size === 7) notice(S.employees.length ? '' : '아직 직원이 없습니다. [직원 관리]에서 직원을 채용해 주세요.');
    }, 80);
  }

  function subscribe(path, apply) {
    const timer = setTimeout(() => !S.loaded.has(path) && notice('저장된 사무실 자료를 불러오는 중입니다… 계속 이 문구가 보이면 인터넷 연결을 확인해 주세요.'), 10000);
    const ref = path.split('/').length % 2 ? db.collection(path) : db.doc(path);
    ref.onSnapshot(
      (snap) => {
        apply(snap);
        uiRefresh();
        if (!snap.metadata.fromCache && !S.loaded.has(path)) {
          S.loaded.add(path);
          clearTimeout(timer);
          if (S.loaded.size === 7) onAllLoaded();
        }
      },
      (e) => {
        clearTimeout(timer);
        notice(e.code === 'revoked' ? '' : `사무실 자료를 불러오지 못했습니다 (${e.code}). 페이지를 새로고침해 주세요.`);
      },
    );
  }

  async function start() {
    const c = window.claude;
    if (!c?.use) return notice('이 사무실은 claude.ai에 로그인한 상태에서 열어야 동작합니다.');
    [db, sample, downloads] = await Promise.all([c.use('db'), c.use('sample'), c.use('downloads')]);
    if (!db) return notice('저장 공간에 연결하지 못했습니다. claude.ai에 로그인한 상태로 이 링크를 열어 주세요.');
    if (!sample) notice('이 화면에서는 AI 직원을 부를 수 없습니다. claude.ai에 로그인한 상태로 열어 주세요.');
    subscribe('employees', (s) => (S.employees = docs(s).sort(byDate('order', 1))));
    subscribe('knowledge', (s) => (S.knowledge = docs(s).sort(byDate('createdAt', 1))));
    subscribe('orders', (s) => (S.orders = docs(s).sort(byDate('createdAt'))));
    subscribe('tasks', (s) => (S.tasks = docs(s).sort(byDate('createdAt'))));
    subscribe('reviews', (s) => (S.reviews = Object.fromEntries(docs(s).map((r) => [r.id, r]))));
    subscribe('office/settings', (d) => (S.settings = { ...DEFAULT_SETTINGS, ...(d.exists ? d.data() : {}) }));
    subscribe('office/profile', (d) => {
      S.profile = d.exists ? d.data() : null;
      S.briefing = S.profile?.briefing || null;
    });
  }

  // 화면이 닫혀 멈춘 업무 정리 + 오늘 첫 브리핑
  let startedChecks = false;
  function onAllLoaded() {
    if (startedChecks) return;
    startedChecks = true;
    const stale = (iso) => Date.now() - Date.parse(iso || 0) > 3 * 60 * 1000;
    for (const t of S.tasks) if (t.status === 'working' && !active.has(t.id) && stale(t.updatedAt)) write(`tasks/${t.id}`, { status: 'error', error: '사무실 화면이 닫혀 작업이 멈췄습니다. [다시 시도]를 눌러 주세요.', updatedAt: now() });
    for (const o of S.orders) if (o.status === 'planning' && stale(o.createdAt)) write(`orders/${o.id}`, { status: 'error', summary: '사무실 화면이 닫혀 업무 분배가 멈췄습니다. 다시 지시해 주세요.' });
    const s = S.settings;
    if (sample && s.autoBriefing && S.briefing?.date !== seoulDate(0) && seoulHHMM() >= s.briefingTime) makeBriefing('auto').catch(() => {});
  }

  // ───────── 저장 ─────────
  const writing = new Map(); // 문서별로 한 번에 하나씩 쓰기
  function write(path, data, replace = false) {
    const prev = writing.get(path) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => (replace ? db.doc(path).set(data) : db.doc(path).update(data)));
    writing.set(path, next);
    return next.catch((e) => {
      throw dbError(e);
    });
  }
  function dbError(e) {
    const msg = {
      quota_exceeded: '저장 공간이 가득 찼습니다. 오래된 업무를 삭제해 주세요.',
      resource_exhausted: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      invalid_argument: '저장하지 못했습니다. 이 사무실에 쓰기 권한이 있는 계정인지 확인해 주세요.',
    }[e?.code];
    return Object.assign(new Error(msg || `저장하지 못했습니다 (${e?.code || '알 수 없는 오류'}). 잠시 후 다시 시도해 주세요.`), { status: 500 });
  }
  const newId = (col) => db.collection(col).doc().id;

  // ───────── AI 호출 ─────────
  const QUEUE_LIMIT = 2;
  let running = 0;
  const waiters = [];
  async function slot(fn) {
    if (running >= QUEUE_LIMIT) await new Promise((r) => waiters.push(r));
    running++;
    try {
      return await fn();
    } finally {
      running--;
      waiters.shift()?.();
    }
  }
  function aiError(e) {
    const msg = {
      not_granted: 'AI 사용이 허용되지 않았습니다. 페이지를 새로고침한 뒤 허용 창에서 [허용]을 눌러 주세요.',
      sampling_disabled: '이 계정에서는 AI를 사용할 수 없습니다.',
      rate_limited: 'AI 사용량이 많아 잠시 쉬어야 합니다. 조금 뒤에 [다시 시도]를 눌러 주세요.',
      session_expired: 'claude.ai 로그인이 만료되었습니다. 다시 로그인해 주세요.',
      refused: 'AI가 이 요청은 처리할 수 없다고 했습니다. 지시 내용을 바꿔 보세요.',
      prompt_too_large: '내용이 너무 깁니다. 지식창고 자료나 지시를 줄여 주세요.',
      invalid_json: 'AI 답변 형식이 맞지 않았습니다. 다시 시도해 주세요.',
      empty_completion: 'AI가 빈 답을 보냈습니다. 지시를 조금 바꿔 다시 시도해 주세요.',
    }[e?.code];
    return Object.assign(new Error(msg || 'AI 연결이 잠시 끊겼습니다. [다시 시도]를 눌러 주세요.'), { status: 502, code: e?.code });
  }
  async function ask(prompt, opts = {}) {
    if (!sample) throw Object.assign(new Error('이 화면에서는 AI를 쓸 수 없습니다. claude.ai에 로그인한 상태로 열어 주세요.'), { status: 409 });
    return slot(async () => {
      try {
        if (opts.json) return await sample.json(prompt, { modelTier: opts.tier || 'default', cache: false });
        const r = await sample(prompt, { modelTier: opts.tier || 'default', cache: false });
        return r.truncated ? `${r.text}\n\n…(분량이 길어 여기서 잘렸습니다. "이어서 써 줘"로 수정 요청하세요)` : r.text;
      } catch (e) {
        throw aiError(e);
      }
    });
  }

  // ───────── 프롬프트 ─────────
  const owner = () => S.profile || FALLBACK_OWNER;
  const COMPANY_RULES = `[회사 공통 업무 규칙]
- 모든 결과물은 "초안"이며, 대표가 결재한 뒤에만 외부(고객·SNS·기관)로 나간다. 직접 발송했다고 말하지 않는다.
- 금융·보험: 분석과 정보 정리까지만 한다. 특정 상품 가입 권유, 수익·보장 확정 표현, 단정적 투자 조언은 쓰지 않는다.
- 개인정보: 주민등록번호, 계좌·카드번호 같은 민감정보는 요구하거나 기록하지 않는다. 필요하면 "[고객명]"처럼 자리표시를 쓴다.
- 얼굴분석·심리 상담: 참고 자료 수준으로 쓰고, 의학적·심리 진단처럼 단정하지 않는다.
- 사실을 모르면 지어내지 말고 "[확인 필요: ...]"로 표시한다.
- 한국어로, 바로 복사해서 쓸 수 있게 제목·소제목·목록·표(마크다운)로 깔끔하게 정리한다.`;
  const ownerBlock = () => {
    const o = owner();
    return `[대표 정보]\n${o.name} ${o.title}${o.company ? ` (${o.company})` : ''}\n${o.profile || ''}`.trim();
  };
  const knowledgeBlock = () => (S.knowledge.length ? '[회사 지식창고 - 업무에 참고]\n' + S.knowledge.map((k) => `■ ${k.title}\n${k.content}`).join('\n\n') : '');
  const staffIntro = (e) =>
    [
      `당신은 ${owner().name} 대표의 1인 기업에서 일하는 AI 직원 "${e.name}"입니다. 직무: ${e.dept} ${e.role}.`,
      `[나의 업무 지침서]\n${e.guide}`,
      ownerBlock(),
      COMPANY_RULES,
      knowledgeBlock(),
    ]
      .filter(Boolean)
      .join('\n\n');

  // ───────── 업무 처리 ─────────
  async function runTask(id) {
    const t = S.tasks.find((x) => x.id === id);
    if (!t) return;
    active.add(id);
    try {
      await write(`tasks/${id}`, { status: 'working', error: null, updatedAt: now() });
      const e = S.employees.find((x) => x.id === t.employeeId);
      if (!e) throw new Error('담당 직원이 퇴사했습니다. 다른 직원에게 다시 지시해 주세요.');
      let prompt = `${staffIntro(e)}\n\n────────\n[대표 원 지시]\n${t.orderText}\n\n[비서실장이 나에게 배정한 업무: ${t.title}]\n${t.instructions}`;
      if (t.history?.length) {
        const last = t.history[t.history.length - 1];
        prompt += `\n\n[내가 이전에 제출한 결과물]\n${last.result.slice(0, 30000)}\n\n[대표 수정 요청]\n${t.history.map((h, i) => `${i + 1}. ${h.feedback}`).join('\n')}\n\n수정 요청을 모두 반영한 전체 결과물을 다시 작성해 주세요.`;
      } else {
        prompt += '\n\n위 업무의 결과물을 바로 작성해 주세요. 인사말이나 설명 없이 결과물만 씁니다.';
      }
      const result = await ask(prompt, { tier: 'default' });
      await write(`tasks/${id}`, { status: 'review', result, updatedAt: now() });
    } catch (err) {
      await write(`tasks/${id}`, { status: 'error', error: err.message, updatedAt: now() }).catch(() => {});
    } finally {
      active.delete(id);
    }
  }

  async function planOrder(order) {
    const staff = S.employees;
    try {
      if (!staff.length) throw new Error('직원이 없습니다. [직원 관리]에서 먼저 직원을 채용해 주세요.');
      const roster = staff.map((e) => `- ${e.id}: ${e.name} (${e.dept} ${e.role}) — ${e.guide.slice(0, 200)}`).join('\n');
      const prompt = [
        `당신은 ${owner().name} 대표의 AI 비서실장 "${SECRETARY.name}"입니다.`,
        '대표의 지시를 읽고, 실제로 필요한 작업만 골라 1~6개로 나눈 뒤 가장 알맞은 직원에게 배정합니다.',
        '각 지시는 그 직원 혼자 읽어도 바로 일할 수 있게 대상·분량·형식·마감 같은 조건을 구체적으로 씁니다. 대표 지시에 없는 사실은 지어내지 않습니다.',
        `[직원 명단] (employee_id: 이름 — 하는 일)\n${roster}`,
        ownerBlock(),
        knowledgeBlock(),
        `[대표 지시]\n${order.text}`,
        '다음 JSON 하나로만 답하세요: {"summary": "대표에게 보고할 한두 문장", "assignments": [{"employee_id": "위 명단의 id", "title": "업무 제목(20자 이내)", "instructions": "구체적인 작업 지시"}]}',
      ]
        .filter(Boolean)
        .join('\n\n');
      const plan = await ask(prompt, { json: true, tier: 'default' });
      const list = (Array.isArray(plan?.assignments) ? plan.assignments : []).filter((a) => staff.some((e) => e.id === String(a.employee_id)) && a.title && a.instructions).slice(0, 6);
      if (!list.length) throw new Error('비서실장이 배정할 직원을 찾지 못했습니다. 지시를 조금 더 구체적으로 써 주세요.');
      const ids = [];
      for (const a of list) {
        const id = newId('tasks');
        ids.push(id);
        await write(
          `tasks/${id}`,
          { orderId: order.id, orderText: order.text, employeeId: String(a.employee_id), title: String(a.title).slice(0, 60), instructions: String(a.instructions).slice(0, 4000), status: 'working', result: '', history: [], error: null, createdAt: now(), updatedAt: now() },
          true,
        );
      }
      await write(`orders/${order.id}`, { summary: String(plan.summary || `${list.length}개 업무로 나눠 배정했습니다.`).slice(0, 500), status: 'assigned' });
      await waitFor(() => ids.every((id) => S.tasks.some((t) => t.id === id)));
      await Promise.all(ids.map(runTask));
    } catch (err) {
      await write(`orders/${order.id}`, { status: 'error', summary: `업무 분배 실패: ${err.message}` }).catch(() => {});
    }
  }
  const waitFor = (cond, ms = 5000) =>
    new Promise((res) => {
      const t0 = Date.now();
      const tick = () => (cond() || Date.now() - t0 > ms ? res() : setTimeout(tick, 100));
      tick();
    });

  // ───────── 브리핑 ─────────
  let briefingRunning = null;
  function makeBriefing(kind) {
    if (briefingRunning) return briefingRunning;
    briefingRunning = (async () => {
      const count = (s) => S.tasks.filter((t) => t.status === s).length;
      const nameOf = (id) => S.employees.find((e) => e.id === id)?.name ?? '퇴사한 직원';
      const lines = S.tasks.filter((t) => t.status !== 'done' && t.status !== 'rejected').slice(0, 40).map((t) => `- [${t.status}] ${t.title} (담당 ${nameOf(t.employeeId)})`).join('\n');
      const today = new Date().toLocaleDateString('ko-KR', { dateStyle: 'full', timeZone: TZ });
      const text = await ask(
        `당신은 ${owner().name} 대표의 AI 비서실장 "${SECRETARY.name}"입니다. 짧고 다정하게, 하지만 핵심만 보고합니다.\n\n${ownerBlock()}\n\n오늘은 ${today}입니다. 아래 업무 현황으로 아침 브리핑을 써 주세요. 구성: 인사 한 줄 → 현황 숫자 → 오늘 꼭 처리할 3가지(결재 대기 우선) → 대표님께 드리는 제안 1가지. 10줄 이내, 마크다운.\n\n결재대기 ${count('review')} / 작업중 ${count('working')} / 완료 ${count('done')} / 오류 ${count('error')}\n${lines || '(진행 중인 업무 없음)'}`,
        { tier: 'quick' },
      );
      const briefing = { text, at: now(), kind, date: seoulDate(0) };
      await write('office/profile', { briefing }, !S.profile);
      S.briefing = briefing;
      return briefing;
    })().finally(() => (briefingRunning = null));
    return briefingRunning;
  }

  // ───────── 주간 보고 ─────────
  function buildReport(offset) {
    offset = Math.max(-52, Math.min(0, Number(offset) || 0));
    const DAY = 864e5;
    const today = seoulDate(0);
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const from = Date.parse(`${today}T00:00:00+09:00`) - ((dow + 6) % 7) * DAY + offset * 7 * DAY;
    const to = from + 7 * DAY;
    const kd = (ms) => seoulDate(0, new Date(ms));
    const inRange = (iso) => iso && Date.parse(iso) >= from && Date.parse(iso) < to;
    const per = new Map(S.employees.map((e) => [e.id, { id: e.id, name: e.name, role: e.role, emoji: e.emoji, done: 0, review: 0, rejected: 0, revisions: 0 }]));
    const totals = { orders: S.orders.filter((o) => inRange(o.createdAt)).length, done: 0, review: 0, rejected: 0, revisions: 0 };
    const daily = Array.from({ length: 7 }, (_, i) => ({ date: kd(from + i * DAY), done: 0 }));
    const doneTitles = [];
    for (const t of S.tasks) {
      const e = per.get(t.employeeId);
      const at = t.approvedAt || t.updatedAt;
      if (t.status === 'done' && inRange(at)) {
        totals.done++;
        if (e) e.done++;
        doneTitles.push(t.title);
        const d = daily.find((x) => x.date === kd(Date.parse(at)));
        if (d) d.done++;
      }
      if (offset === 0 && t.status === 'review') {
        totals.review++;
        if (e) e.review++;
      }
      if (t.status === 'rejected' && inRange(t.updatedAt)) {
        totals.rejected++;
        if (e) e.rejected++;
      }
      const rv = (t.history || []).filter((h) => inRange(h.at)).length;
      totals.revisions += rv;
      if (e) e.revisions += rv;
    }
    totals.savedHours = Math.round(((totals.done * S.settings.minutesPerTask) / 60) * 10) / 10;
    const key = kd(from);
    return { key, offset, from: key, to: kd(to - DAY), totals, daily, byEmployee: [...per.values()].filter((e) => e.done || e.review || e.rejected || e.revisions), doneTitles, minutesPerTask: S.settings.minutesPerTask, review: S.reviews[key] || null };
  }
  async function weeklyReview(week) {
    const r = buildReport(week);
    const lines = r.byEmployee.map((e) => `- ${e.name}(${e.role}): 완료 ${e.done}, 결재대기 ${e.review}, 반려 ${e.rejected}, 수정요청 ${e.revisions}`).join('\n');
    const text = await ask(
      `당신은 ${owner().name} 대표의 AI 비서실장 "${SECRETARY.name}"입니다. 숫자는 주어진 것만 쓰고 지어내지 않습니다.\n\n${ownerBlock()}\n\n주간 업무 보고서의 "비서실장 총평"을 써 주세요. 구성: 한 주 요약 2문장 → 잘된 점 2가지 → 다음 주 제안 2가지(반려·수정이 많은 직원은 업무 지침서 보완 제안). 8줄 이내, 마크다운.\n\n[기간] ${r.from} ~ ${r.to}\n[합계] 지시 ${r.totals.orders}건, 완료 ${r.totals.done}건, 결재대기 ${r.totals.review}건, 반려 ${r.totals.rejected}건, 수정요청 ${r.totals.revisions}회, 절약 추정 ${r.totals.savedHours}시간\n[직원별]\n${lines || '(기록 없음)'}\n[완료한 업무]\n${r.doneTitles.slice(0, 30).map((t) => `- ${t}`).join('\n') || '(없음)'}`,
      { tier: 'quick' },
    );
    await write(`reviews/${r.key}`, { text, at: now() }, true);
    S.reviews[r.key] = { text, at: now() };
    return buildReport(week);
  }

  // ───────── PPT · 카드뉴스 ─────────
  async function makeSlides(t, kind) {
    const ask1 =
      kind === 'cards'
        ? '아래 결과물을 인스타그램 카드뉴스 5~8장으로 구성해 주세요. 첫 장은 눈길을 끄는 질문이나 한 문장, 마지막 장은 행동 안내(신청·문의 등). 각 장은 큰 글씨 한 줄(headline, 20자 이내)과 짧은 설명(body, 60자 이내). 캡션과 해시태그(caption)도 함께.\n다음 JSON 하나로만 답하세요: {"cards": [{"headline": "...", "body": "..."}], "caption": "..."}'
        : '아래 결과물을 강의용 슬라이드로 구성해 주세요. 표지 제목(title)·부제(subtitle), 본문 슬라이드 6~14장. 각 슬라이드는 짧은 핵심 문장 2~5개(bullets, 각 40자 이내)와 강사가 말할 내용(notes).\n다음 JSON 하나로만 답하세요: {"title": "...", "subtitle": "...", "slides": [{"title": "...", "bullets": ["..."], "notes": "..."}]}';
    const data = await ask(`당신은 ${owner().name} 대표 회사의 프레젠테이션 디자이너입니다. 결과물의 사실과 숫자를 바꾸지 말고, 없는 내용은 지어내지 않습니다. "[확인 필요]" 표시는 그대로 둡니다.\n\n${ask1}\n\n[결과물 제목] ${t.title}\n\n[결과물]\n${t.result.slice(0, 60000)}`, { json: true, tier: 'default' });
    return SLIDES.normalize(kind, data || {}, t.title);
  }

  // ───────── 파일 받기 ─────────
  async function save(filename, data) {
    if (!downloads) throw new Error('이 화면에서는 파일을 받을 수 없습니다.');
    try {
      await downloads.save({ filename, data });
    } catch (e) {
      if (e?.code === 'declined') return;
      throw new Error(e?.code === 'rate_limited' ? '저장 창이 이미 열려 있습니다. 잠시 후 다시 눌러 주세요.' : `파일을 저장하지 못했습니다 (${e?.code || '오류'}).`);
    }
  }
  async function pptx(url) {
    const u = new URL(url, location.href);
    const id = decodeURIComponent(u.pathname.split('/')[3] || '');
    const kind = u.searchParams.get('kind') === 'cards' ? 'cards' : 'ppt';
    const theme = SLIDES.THEMES[u.searchParams.get('theme')] ? u.searchParams.get('theme') : S.settings.slideTheme;
    const t = S.tasks.find((x) => x.id === id);
    const saved = t?.slides?.[kind];
    if (!saved) throw new Error('먼저 미리보기를 만들어 주세요.');
    if (typeof PptxGenJS === 'undefined') throw new Error('PowerPoint 만들기 도구를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    const blob = await SLIDES.buildPptx(kind, saved.data, theme, `${owner().name} ${owner().title}`.trim());
    await save(`${t.title.replace(/[\\/:*?"<>|]/g, '_')}_${kind === 'cards' ? '카드뉴스' : '강의자료'}.pptx`, blob);
  }
  function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(',');
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: head.slice(5, head.indexOf(';')) });
  }
  window.__office = { save, pptx, savePng: (dataUrl, name) => save(name, dataUrlToBlob(dataUrl)) };

  // ───────── /api 요청 처리 ─────────
  const fail = (status, message) => Object.assign(new Error(message), { status });
  const need = (v, f, max = 20000) => {
    if (typeof v !== 'string' || !v.trim()) throw fail(400, `${f}을(를) 입력해 주세요.`);
    return v.trim().slice(0, max);
  };
  const findTask = (id) => S.tasks.find((t) => t.id === id) || (() => { throw fail(404, '업무를 찾을 수 없습니다.'); })();
  const ready = () => {
    if (!db) throw fail(503, '저장 공간에 연결되지 않았습니다. claude.ai에 로그인한 상태로 열어 주세요.');
  };
  const cleanEmployee = (b) => ({
    name: need(b.name, '이름', 20),
    role: need(b.role, '직무', 40),
    dept: need(b.dept, '부서', 40),
    emoji: (typeof b.emoji === 'string' && b.emoji.trim().slice(0, 4)) || '🙂',
    guide: need(b.guide, '업무 지침서', 4000),
    keywords: String(Array.isArray(b.keywords) ? b.keywords.join(',') : b.keywords ?? '').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 30),
  });
  const serverOnly = () => {
    throw fail(409, 'Google·카카오톡 연동은 서버판(Render 배포)에서 사용할 수 있습니다.');
  };

  const routes = [
    ['GET', /^\/api\/auth\/status$/, () => ({ needsSetup: false, setupCodeRequired: false, loggedIn: true })],
    ['POST', /^\/api\/auth\/logout$/, () => ({ ok: true })],
    ['GET', /^\/api\/state$/, () => ({
      demo: false,
      owner: owner(),
      secretary: SECRETARY,
      employees: S.employees,
      knowledge: S.knowledge,
      orders: S.orders.slice(0, 50),
      tasks: S.tasks.slice(0, 200),
      briefing: S.briefing,
      settings: S.settings,
      google: { configured: false, connected: false, email: null, redirectUri: 'http://localhost:3000/auth/google/callback' },
      kakao: { configured: false, connected: false, nickname: null, redirectUri: 'http://localhost:3000/auth/kakao/callback', lastError: null },
      themes: SLIDES.THEMES,
    })],
    ['PUT', /^\/api\/settings$/, async (b) => {
      ready();
      const s = { ...S.settings };
      if ('autoBriefing' in b) s.autoBriefing = Boolean(b.autoBriefing);
      if ('briefingTime' in b) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.briefingTime)) throw fail(400, '시간 형식이 올바르지 않습니다 (예: 08:00).');
        s.briefingTime = b.briefingTime;
      }
      if ('minutesPerTask' in b) {
        const m = Number(b.minutesPerTask);
        if (!Number.isFinite(m) || m < 1 || m > 600) throw fail(400, '업무 1건당 절약 시간은 1~600분 사이로 적어 주세요.');
        s.minutesPerTask = Math.round(m);
      }
      if ('slideTheme' in b && SLIDES.THEMES[b.slideTheme]) s.slideTheme = b.slideTheme;
      await write('office/settings', s, true);
      S.settings = s;
      return s;
    }],
    ['POST', /^\/api\/orders$/, async (b) => {
      ready();
      const order = { id: newId('orders'), text: need(b.text, '지시 내용', 4000), summary: '비서실장이 업무를 나누는 중…', status: 'planning', createdAt: now() };
      const { id, ...body } = order;
      await write(`orders/${id}`, body, true);
      planOrder(order);
      return order;
    }],
    ['POST', /^\/api\/employees\/([^/]+)\/tasks$/, async (b, [eid]) => {
      ready();
      const e = S.employees.find((x) => x.id === eid);
      if (!e) throw fail(404, '직원을 찾을 수 없습니다.');
      const text = need(b.text, '지시 내용', 4000);
      const oid = newId('orders');
      const tid = newId('tasks');
      await write(`orders/${oid}`, { text, summary: `${e.name}에게 직접 지시`, status: 'assigned', createdAt: now() }, true);
      await write(`tasks/${tid}`, { orderId: oid, orderText: text, employeeId: eid, title: text.slice(0, 24), instructions: text, status: 'working', result: '', history: [], error: null, createdAt: now(), updatedAt: now() }, true);
      waitFor(() => S.tasks.some((t) => t.id === tid)).then(() => runTask(tid));
      return { id: tid };
    }],
    ['POST', /^\/api\/tasks\/([^/]+)\/approve$/, async (_b, [id]) => {
      const t = findTask(id);
      if (t.status !== 'review') throw fail(409, '결재 대기 중인 업무만 승인할 수 있습니다.');
      await write(`tasks/${id}`, { status: 'done', approvedAt: now(), updatedAt: now() });
      return { ok: true };
    }],
    ['POST', /^\/api\/tasks\/([^/]+)\/revise$/, async (b, [id]) => {
      const t = findTask(id);
      if (t.status !== 'review') throw fail(409, '결재 대기 중인 업무만 수정 요청할 수 있습니다.');
      const history = [...(t.history || []), { feedback: need(b.feedback, '수정 요청 내용', 4000), result: t.result, at: now() }].slice(-5);
      await write(`tasks/${id}`, { history, status: 'working', updatedAt: now() });
      waitFor(() => (S.tasks.find((x) => x.id === id)?.history?.length || 0) === history.length).then(() => runTask(id));
      return { ok: true };
    }],
    ['POST', /^\/api\/tasks\/([^/]+)\/reject$/, async (_b, [id]) => {
      const t = findTask(id);
      if (t.status === 'working') throw fail(409, '작업 중인 업무는 끝난 뒤 반려할 수 있습니다.');
      await write(`tasks/${id}`, { status: 'rejected', updatedAt: now() });
      return { ok: true };
    }],
    ['POST', /^\/api\/tasks\/([^/]+)\/retry$/, (_b, [id]) => {
      const t = findTask(id);
      if (t.status !== 'error') throw fail(409, '오류가 난 업무만 다시 시도할 수 있습니다.');
      runTask(id);
      return { ok: true };
    }],
    ['DELETE', /^\/api\/tasks\/([^/]+)$/, async (_b, [id]) => {
      const t = findTask(id);
      if (t.status === 'working' && active.has(id)) throw fail(409, '작업 중인 업무는 삭제할 수 없습니다.');
      await db.doc(`tasks/${id}`).delete().catch((e) => { throw dbError(e); });
      return { ok: true };
    }],
    ['POST', /^\/api\/tasks\/([^/]+)\/slides$/, async (b, [id]) => {
      const t = findTask(id);
      if (t.status !== 'review' && t.status !== 'done') throw fail(409, '결과물이 완성된 업무만 PPT·카드뉴스로 만들 수 있습니다.');
      const kind = b.kind === 'cards' ? 'cards' : 'ppt';
      const data = await makeSlides(t, kind);
      await write(`tasks/${id}`, { slides: { ...(t.slides || {}), [kind]: { data, at: now() } } });
      return { kind, data };
    }],
    ['POST', /^\/api\/tasks\/([^/]+)\/(gmail-draft|drive)$/, serverOnly],
    ['POST', /^\/api\/(kakao|google)\//, serverOnly],
    ['GET', /^\/api\/calendar$/, () => ({ connected: false, events: [] })],
    ['POST', /^\/api\/briefing$/, () => makeBriefing('manual')],
    ['GET', /^\/api\/report$/, (_b, _p, url) => buildReport(new URL(url, location.href).searchParams.get('week'))],
    ['POST', /^\/api\/report\/review$/, (b) => weeklyReview(b.week)],
    ['POST', /^\/api\/employees$/, async (b) => {
      ready();
      const id = newId('employees');
      const e = { ...cleanEmployee(b), order: Date.now() };
      await write(`employees/${id}`, e, true);
      return { id, ...e };
    }],
    ['PUT', /^\/api\/employees\/([^/]+)$/, async (b, [id]) => {
      if (!S.employees.some((e) => e.id === id)) throw fail(404, '직원을 찾을 수 없습니다.');
      await write(`employees/${id}`, cleanEmployee(b));
      return { ok: true };
    }],
    ['DELETE', /^\/api\/employees\/([^/]+)$/, async (_b, [id]) => {
      if (S.employees.length <= 1) throw fail(409, '직원이 최소 한 명은 있어야 합니다.');
      await db.doc(`employees/${id}`).delete().catch((e) => { throw dbError(e); });
      return { ok: true };
    }],
    ['POST', /^\/api\/knowledge$/, async (b) => {
      ready();
      const id = newId('knowledge');
      const k = { title: need(b.title, '제목', 100), content: need(b.content, '내용', 20000), createdAt: now() };
      await write(`knowledge/${id}`, k, true);
      return { id, ...k };
    }],
    ['DELETE', /^\/api\/knowledge\/([^/]+)$/, async (_b, [id]) => {
      await db.doc(`knowledge/${id}`).delete().catch((e) => { throw dbError(e); });
      return { ok: true };
    }],
  ];

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  window.fetch = async (url, opts = {}) => {
    if (typeof url !== 'string' || !url.startsWith('/api/')) return realFetch(url, opts);
    const method = opts.method || 'GET';
    const path = url.split('?')[0];
    const r = routes.find(([m, re]) => m === method && re.test(path));
    if (!r) return json(404, { error: '없는 주소입니다.' });
    try {
      const body = opts.body ? JSON.parse(opts.body) : {};
      return json(200, structuredClone((await r[2](body, path.match(r[1]).slice(1), url)) ?? { ok: true }));
    } catch (err) {
      return json(err.status || 500, { error: err.message || String(err) });
    }
  };

  start();
})();
