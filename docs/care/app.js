// 부모님 돌봄 첫걸음 — 천안 가족을 위한 AI 돌봄 길잡이
// 원칙: 기관명·주소·연락처는 공공데이터 값만 표시한다. AI는 분류·질문·설명·메모 문장만 만든다.
'use strict';

/* ───────── 서비스 범주 (쉬운 말 설명은 '제도 일반' 설명이며 특정 기관 정보가 아님) ───────── */
const CATS = {
  day:    { label: '낮 시간 돌봄', icon: '☀️', kw: ['주야간', '주간보호', '데이케어', '단기보호', '낮', '출근', '직장', '주간'],
            easy: '낮 동안 센터에 다니시며 식사·운동·프로그램을 함께 하는 서비스예요. 보통 "주야간보호"라고 불러요. 이용 조건(장기요양등급 등)과 차량 지원 여부는 기관마다 달라요.' },
  home:   { label: '집에서 도움', icon: '🏠', kw: ['방문요양', '방문목욕', '방문간호', '재가', '가사', '목욕', '청소', '빨래', '집에서', '요양보호사', '방문'],
            easy: '요양보호사 등이 집으로 찾아와 씻기·식사·집안일을 돕는 서비스예요. "방문요양·방문목욕·방문간호" 같은 이름으로 나뉘어 있어요.' },
  meal:   { label: '식사·영양', icon: '🍚', kw: ['식사', '도시락', '반찬', '영양', '밥', '끼니', '급식'],
            easy: '도시락·반찬 배달이나 영양 관리를 돕는 서비스예요. 대상 조건은 지역 프로그램마다 달라요.' },
  move:   { label: '병원 동행·이동', icon: '🚐', kw: ['이동', '동행', '병원', '외출', '교통', '차량', '통원'],
            easy: '병원 가실 때 함께 가 드리거나 이동을 돕는 서비스예요. 예약 방법과 비용은 기관에 확인이 필요해요.' },
  health: { label: '건강관리·재활', icon: '🩺', kw: ['건강', '보건', '재활', '의료', '간호', '방문진료', '약', '운동', '치매', '기억'],
            easy: '보건소·의료기관 등이 건강 상태를 살피고 관리 방법을 안내하는 서비스예요. 진단이나 치료 판단은 의료진에게 받으세요.' },
  safe:   { label: '안부·안전·주거', icon: '📞', kw: ['안부', '안전', '응급', '주거', '집수리', '혼자', '독거', '고독', '말벗', '정서', '외로'],
            easy: '안부 전화·방문, 응급 안전 장치, 집 안전 개선 등을 돕는 서비스예요.' },
  etc:    { label: '기타 돌봄', icon: '🤝', kw: [],
            easy: '위 분류에 딱 맞지 않는 지역 돌봄 프로그램이에요. 내용은 기관에 확인해 주세요.' },
};
const NEED_CHOICES = ['day', 'home', 'meal', 'move', 'health', 'safe'];

/* 확인 질문 묶음 (규칙 모드). AI 모드에서는 서버가 이 중 빠진 것만 골라 문장을 다듬는다 */
const QUESTION_POOL = {
  living:  { q: '부모님은 지금 어디에서 지내시나요?', opts: ['집에서 혼자', '집에서 가족과', '병원에 입원 중', '요양시설'] },
  time:    { q: '도움이 필요한 시간대는 언제인가요?', opts: ['평일 낮', '아침·저녁', '주말', '하루 종일', '잘 모르겠어요'] },
  grade:   { q: '장기요양등급을 받으셨나요?', opts: ['받았어요', '신청 중이에요', '아직 안 받았어요', '잘 모르겠어요'] },
  asked:   { q: '이미 문의해 본 곳이 있나요?', opts: ['없어요', '주민센터(행정복지센터)', '국민건강보험공단', '다른 기관'] },
  move:    { q: '혼자 걸어서 이동하실 수 있나요?', opts: ['혼자 가능', '부축이 필요', '휠체어 이용', '잘 모르겠어요'] },
};

/* 비슷한 검색어 추천 (일상어 → 제도 용어) */
const SYNONYMS = [
  ['낮에', '주야간보호'], ['출근', '주야간보호'], ['목욕', '방문목욕'], ['씻', '방문목욕'],
  ['집으로', '방문요양'], ['도시락', '식사 지원'], ['병원', '병원 동행'], ['혼자', '안부 확인'],
  ['치매', '치매안심센터 문의'], ['기억', '치매안심센터 문의'], ['등급', '장기요양등급 신청'],
];

/* ───────── 상태 ───────── */
const S = {
  area: '천안시 전체', who: '', needs: new Set(), text: '',
  analysis: null, answers: {}, filter: 'all', picked: new Set(),
  rows: [], source: null, // {kind:'csv'|'sample', name, baseDate}
  ai: false,
};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}

/* ───────── CSV 읽기 ───────── */
function parseCSV(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('euc-kr').decode(buf); } // 공공데이터포털 CSV는 EUC-KR인 경우가 많음
}
function findCol(header, tests) {
  const h = header.map((x) => x.replace(/\s/g, ''));
  for (const t of tests) { const i = h.findIndex((x) => t(x)); if (i >= 0) return i; }
  return -1;
}
function categorize(text) {
  for (const k of ['day', 'home', 'meal', 'move', 'health', 'safe']) {
    if (CATS[k].kw.some((w) => text.includes(w))) return k;
  }
  return 'etc';
}
function rowsFromCSV(text) {
  const all = parseCSV(text);
  if (all.length < 2) throw new Error('CSV에 자료가 없습니다.');
  const H = all[0];
  const col = {
    sido: findCol(H, [(x) => x.includes('시도')]),
    sgg: findCol(H, [(x) => x.includes('시군구')]),
    name: findCol(H, [(x) => x.includes('제공기관명'), (x) => x.includes('기관명'), (x) => x.includes('기관')]),
    tel: findCol(H, [(x) => x.includes('연락처'), (x) => x.includes('전화')]),
    addr: findCol(H, [(x) => x.includes('주소')]),
    cls: findCol(H, [(x) => x.includes('서비스') && x.includes('분류'), (x) => x.includes('분류'), (x) => x.includes('서비스')]),
    prog: findCol(H, [(x) => x.includes('프로그램')]),
  };
  if (col.name < 0) throw new Error('"기관명" 열을 찾지 못했습니다. 「통합돌봄 서비스 자원」 CSV가 맞는지 확인해 주세요.');
  const get = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');
  const out = [];
  for (const r of all.slice(1)) {
    const rec = { sido: get(r, col.sido), sgg: get(r, col.sgg), name: get(r, col.name), tel: get(r, col.tel), addr: get(r, col.addr), cls: get(r, col.cls), prog: get(r, col.prog) };
    if (!rec.name) continue;
    if (!(rec.sgg + rec.addr).includes('천안')) continue; // 천안시 행만 사용
    rec.cat = categorize(rec.cls + ' ' + rec.prog);
    out.push(rec);
  }
  if (!out.length) throw new Error('이 파일에는 천안시 자료가 없습니다.');
  return out;
}

async function loadSample() {
  const res = await fetch('data/sample.csv');
  const text = decode(await res.arrayBuffer());
  S.rows = rowsFromCSV(text).map((r) => ({ ...r, sample: true }));
  S.source = { kind: 'sample', name: '시연용 가상 자료', baseDate: '' };
}
async function loadData() {
  // 1) 이 브라우저에 불러 둔 실제 자료  2) 운영자가 data/resources.csv 로 올린 자료  3) 시연용 가상 자료
  const saved = store.get('care.csv');
  if (saved) {
    try {
      S.rows = rowsFromCSV(saved);
      S.source = JSON.parse(store.get('care.src') || '{}');
      S.source.kind = 'csv';
      return;
    } catch { store.del('care.csv'); }
  }
  try {
    const res = await fetch('data/resources.csv', { cache: 'no-cache' });
    if (res.ok) {
      S.rows = rowsFromCSV(decode(await res.arrayBuffer()));
      const meta = await fetch('data/resources.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      S.source = { kind: 'csv', name: meta.name || '국민건강보험공단 「통합돌봄 서비스 자원」', baseDate: meta.baseDate || '' };
      return;
    }
  } catch {}
  await loadSample();
}

/* ───────── AI (서버가 있으면 Claude, 없으면 규칙) ───────── */
async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('AI 응답 오류');
  return res.json();
}
async function checkAI() {
  try {
    const r = await fetch('api/care/status');
    S.ai = r.ok && (await r.json()).ai === true;
  } catch { S.ai = false; }
  $('#aiMode').textContent = S.ai ? '🤖 AI 언어모델이 상황 정리·확인 질문·문의 메모 문장을 돕고 있어요.' : '📋 간편 모드: 미리 정한 규칙으로 상황을 정리합니다. (AI 서버에 연결되면 더 자연스럽게 정리돼요)';
}

function ruleAnalyze() {
  const t = S.text;
  const cats = new Set(S.needs);
  for (const k of NEED_CHOICES) if (CATS[k].kw.some((w) => t.includes(w))) cats.add(k);
  const flags = [];
  if (/혼자|독거|홀로/.test(t)) flags.push('혼자 지내심');
  if (/치매|기억|깜빡/.test(t)) flags.push('기억력 걱정');
  if (/넘어|낙상|거동|걷/.test(t)) flags.push('거동 불편');
  if (/퇴원|입원/.test(t)) flags.push('퇴원 전후');
  if (/출근|직장|맞벌이/.test(t)) flags.push('가족이 낮에 일함');
  // 이미 문장에 나온 조건은 묻지 않는다
  const missing = [];
  if (!/혼자|가족과|같이 살|입원|요양원|시설/.test(t)) missing.push('living');
  if (!/낮|아침|저녁|밤|주말|평일|하루/.test(t) && !cats.has('day')) missing.push('time');
  if (cats.has('move') || flags.includes('거동 불편')) missing.push('move');
  if (!/등급/.test(t) && (cats.has('day') || cats.has('home'))) missing.push('grade');
  missing.push('asked');
  return {
    who: S.who || (/(어머니|엄마)/.test(t) ? '어머니' : /(아버지|아빠)/.test(t) ? '아버지' : ''),
    categories: [...cats],
    flags,
    summary: '',
    questions: [...new Set(missing)].slice(0, 3).map((id) => ({ id, ...QUESTION_POOL[id] })),
  };
}
async function analyze() {
  const base = ruleAnalyze();
  if (!S.ai || !S.text.trim()) return base;
  try {
    const r = await api('api/care/analyze', { text: S.text, who: S.who, needs: [...S.needs], area: S.area, questionIds: Object.keys(QUESTION_POOL) });
    const cats = (r.categories || []).filter((c) => CATS[c]);
    const qs = (r.questions || []).filter((q) => QUESTION_POOL[q.id]).slice(0, 3)
      .map((q) => ({ id: q.id, q: q.question || QUESTION_POOL[q.id].q, opts: QUESTION_POOL[q.id].opts }));
    return {
      who: r.who || base.who,
      categories: [...new Set([...S.needs, ...cats])],
      flags: r.flags || base.flags,
      summary: r.summary || '',
      questions: qs.length ? qs : base.questions,
    };
  } catch { return base; }
}

function situationText() {
  const a = S.analysis || {};
  const parts = [];
  parts.push(`${a.who || S.who || '부모님'} 돌봄 문의 (지역: 천안시${S.area === '천안시 전체' ? '' : ' ' + S.area})`);
  if (a.categories?.length) parts.push('필요한 도움: ' + a.categories.map((c) => CATS[c].label).join(', '));
  if (a.flags?.length) parts.push('상황: ' + a.flags.join(', '));
  for (const [id, v] of Object.entries(S.answers)) if (v) parts.push(`${QUESTION_POOL[id].q.replace(/\?$/, '')} → ${v}`);
  return parts;
}

const Q_BY_CAT = {
  day:    ['이용하려면 어떤 조건(장기요양등급 등)이 필요한가요?', '운영 시간과 집까지 오가는 차량이 있나요?', '비용은 어떻게 정해지고, 어디서 확인하나요?'],
  home:   ['방문 가능한 요일·시간은 어떻게 되나요?', '이용 조건과 신청 절차를 알려 주세요.', '비용(본인부담)은 어떻게 확인하나요?'],
  meal:   ['어떤 분이 대상인가요?', '배달 횟수와 신청 방법을 알려 주세요.', '비용이 있나요?'],
  move:   ['병원 동행은 어떻게 예약하나요?', '대상 조건이 있나요?', '비용과 이용 가능한 횟수를 알려 주세요.'],
  health: ['어떤 건강관리 서비스를 받을 수 있나요?', '대상 조건과 신청 방법을 알려 주세요.', '집으로 방문도 가능한가요?'],
  safe:   ['안부 확인은 어떤 방식으로 하나요?', '대상 조건과 신청 방법을 알려 주세요.', '비용이 있나요?'],
  etc:    ['이 프로그램은 어떤 분이 이용할 수 있나요?', '신청 방법과 운영 시간을 알려 주세요.', '비용은 어떻게 되나요?'],
};
function ruleMemo(insts) {
  const next = ['기관에 전화해 이용 조건·비용·대기 여부를 확인하기'];
  if (!S.answers.grade || /안 받|모르/.test(S.answers.grade)) next.push('장기요양등급이 필요한지 물어보고, 필요하면 국민건강보험공단(1577-1000)에 신청 방법 문의하기');
  next.push('천안시 읍·면·동 행정복지센터에 통합돌봄 상담 창구가 있는지 문의하기');
  return { summary: situationText(), perInstitution: insts.map((r) => ({ questions: Q_BY_CAT[r.cat] })), nextSteps: next };
}
async function makeMemo(insts) {
  const base = ruleMemo(insts);
  if (!S.ai) return base;
  try {
    const r = await api('api/care/memo', {
      situation: situationText(), text: S.text,
      institutions: insts.map((x) => ({ service: CATS[x.cat].label, classification: x.cls, program: x.prog })),
    });
    return {
      summary: Array.isArray(r.summary) && r.summary.length ? r.summary : base.summary,
      perInstitution: insts.map((_, i) => ({ questions: r.perInstitution?.[i]?.questions?.slice(0, 3) || base.perInstitution[i].questions })),
      nextSteps: r.nextSteps?.length ? r.nextSteps : base.nextSteps,
    };
  } catch { return base; }
}

/* ───────── 화면 ───────── */
function go(id) {
  $$('.screen').forEach((s) => (s.hidden = s.id !== id));
  const n = Number(id.replace('s', '')) || 0;
  $$('.steps li').forEach((li) => {
    const k = Number(li.dataset.step);
    li.classList.toggle('on', k === n);
    li.classList.toggle('done', k < n);
  });
  $('#sampleBanner').hidden = S.source?.kind !== 'sample' || id === 'sData';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderNeeds() {
  $('#needChips').innerHTML = NEED_CHOICES.map((k) => `<button type="button" class="chip" data-need="${k}">${CATS[k].icon} ${CATS[k].label}</button>`).join('')
    + '<button type="button" class="chip" data-need="unknown">🤔 아직 모르겠어요</button>';
}
function updateSuggest() {
  const t = $('#freeText').value;
  const hits = [...new Set(SYNONYMS.filter(([w]) => t.includes(w)).map(([, s]) => s))];
  const box = $('#suggest');
  box.hidden = !hits.length;
  box.innerHTML = '이런 말로도 찾아요: ' + hits.map((h) => `<span class="chip">${esc(h)}</span>`).join('');
}

async function toS2() {
  S.text = $('#freeText').value.trim();
  if (!S.text && !S.needs.size && !S.who) { toast('필요한 도움을 하나 고르거나 상황을 적어 주세요.'); return; }
  const btn = $('#toS2'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 정리하는 중…';
  S.analysis = await analyze();
  btn.disabled = false; btn.textContent = '다음으로';
  S.answers = {};
  const a = S.analysis;
  const cats = a.categories.length ? a.categories.map((c) => `${CATS[c].icon} ${CATS[c].label}`).join(', ') : '아직 정해지지 않음 (전체 보기)';
  $('#understood').innerHTML = `<span class="tag">${S.ai ? '🤖 AI가 이해한 내용' : '📋 정리한 내용'}</span><br>
    ${a.summary ? esc(a.summary) + '<br>' : ''}
    대상: <b>${esc(a.who || '부모님')}</b> · 지역: <b>천안시${S.area === '천안시 전체' ? '' : ' ' + esc(S.area)}</b><br>
    필요한 도움: <b>${esc(cats)}</b>${a.flags.length ? `<br>살펴볼 점: ${esc(a.flags.join(', '))}` : ''}
    <br><small>자격·비용·건강 상태는 여기서 판단하지 않아요.</small>`;
  $('#questions').innerHTML = a.questions.map((q, i) => `
    <div class="q" data-q="${q.id}">
      <h2>${i + 1}. ${esc(q.q)}</h2>
      <div class="chips">${q.opts.map((o) => `<button type="button" class="chip" data-ans="${esc(o)}">${esc(o)}</button>`).join('')}</div>
    </div>`).join('') + '<p class="note">답하기 어려우면 건너뛰어도 괜찮아요.</p>';
  go('s2');
}

function visibleRows() {
  let rows = S.rows;
  if (S.area !== '천안시 전체') rows = rows.filter((r) => (r.sgg + r.addr).includes(S.area));
  if (S.filter !== 'all') rows = rows.filter((r) => r.cat === S.filter);
  return rows;
}
function renderResults() {
  const cats = S.analysis?.categories || [];
  const present = new Set(S.rows.map((r) => r.cat));
  const order = [...cats.filter((c) => present.has(c)), ...Object.keys(CATS).filter((c) => present.has(c) && !cats.includes(c))];
  $('#catFilters').innerHTML = `<button type="button" class="chip ${S.filter === 'all' ? 'on' : ''}" data-filter="all">전체</button>`
    + order.map((c) => `<button type="button" class="chip ${S.filter === c ? 'on' : ''}" data-filter="${c}">${CATS[c].icon} ${CATS[c].label}</button>`).join('');
  $('#explain').innerHTML = S.filter === 'all'
    ? '찾는 도움 종류를 위에서 눌러 보세요. 종류별로 쉬운 설명이 나와요.'
    : `<b>${CATS[S.filter].icon} ${CATS[S.filter].label}이란?</b> ${esc(CATS[S.filter].easy)}`;
  const rows = visibleRows();
  $('#resultCount').textContent = `천안시${S.area === '천안시 전체' ? '' : ' ' + S.area} · ${rows.length}곳 · 문의할 곳을 골라 주세요`;
  const src = S.source || {};
  const srcLine = src.kind === 'sample'
    ? '⚠️ 시연용 가상 자료 · 실제 기관 아님'
    : `출처: ${esc(src.name || '국민건강보험공단 「통합돌봄 서비스 자원」')} (공공데이터포털) · 기준일: ${esc(src.baseDate || '자료 확인 필요')}`;
  $('#results').innerHTML = rows.length ? rows.map((r) => {
    const i = S.rows.indexOf(r);
    const tel = r.tel.replace(/[^0-9]/g, '');
    const callable = !r.sample && tel.length >= 8;
    return `<article class="card ${S.picked.has(i) ? 'picked' : ''}">
      <span class="type">${CATS[r.cat].icon} ${esc(r.cls || CATS[r.cat].label)}</span>
      <h3>${esc(r.name)}</h3>
      ${r.prog ? `<p class="prog">${esc(r.prog)}</p>` : ''}
      <dl><dt>주소</dt><dd>${esc(r.addr || '자료에 없음')}</dd><dt>전화</dt><dd>${esc(r.tel || '자료에 없음')}</dd></dl>
      <p class="src">${srcLine}</p>
      <div class="acts">
        <a class="call" href="${callable ? 'tel:' + tel : '#'}" aria-disabled="${!callable}">📞 전화 걸기</a>
        <button type="button" class="${S.picked.has(i) ? 'primary' : 'ghost'}" data-pick="${i}">${S.picked.has(i) ? '✓ 메모에 담음' : '메모에 담기'}</button>
      </div>
    </article>`;
  }).join('') : `<div class="empty">이 조건에 맞는 자료가 없어요.<br>‘전체’를 눌러 다른 종류도 살펴보세요.<br><small>기관 정보가 없을 때는 결과를 만들어 내지 않습니다.</small></div>`;
  $('#pickCount').textContent = S.picked.size ? `(${S.picked.size}곳)` : '';
}
function toS3() {
  const cats = S.analysis?.categories || [];
  const present = new Set(S.rows.map((r) => r.cat));
  S.filter = cats.find((c) => present.has(c)) || 'all';
  renderResults();
  go('s3');
}

async function toS4() {
  if (!S.picked.size) { toast('문의할 기관을 하나 이상 "메모에 담기" 해 주세요.'); return; }
  const insts = [...S.picked].map((i) => S.rows[i]);
  const btn = $('#toS4'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 메모 만드는 중…';
  const m = await makeMemo(insts);
  btn.disabled = false; btn.innerHTML = '전화 문의 준비 <span id="pickCount"></span>';
  const src = S.source || {};
  S.memo = { m, insts };
  $('#memo').innerHTML = `<div class="memo-sheet">
    <h2>부모님 상황 요약</h2>
    <ul>${m.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    <h2>기관별로 물어볼 것</h2>
    ${insts.map((r, i) => `<div class="inst">
      <h3>${esc(r.name)}</h3>
      <div class="meta">${esc(r.cls || CATS[r.cat].label)} · ☎ ${esc(r.tel || '자료에 없음')}${r.sample ? ' · ⚠️ 가상 자료' : ''}</div>
      <ol>${m.perInstitution[i].questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
    </div>`).join('')}
    <h2>다음에 할 일</h2>
    <ul>${m.nextSteps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    <p class="meta">${src.kind === 'sample' ? '⚠️ 시연용 가상 자료로 만든 메모입니다.' : `기관 정보 출처: ${esc(src.name || '')} · 기준일 ${esc(src.baseDate || '확인 필요')}`}<br>
    <span class="check">기관 확인 필요</span> 실제 이용 가능 여부·자격·비용은 기관에서 확인해 주세요.</p>
  </div>`;
  go('s4');
}
function memoText() {
  if (!S.memo) return '';
  const { m, insts } = S.memo;
  const L = ['[부모님 돌봄 문의 메모]', '', '■ 상황 요약', ...m.summary.map((s) => '- ' + s), '', '■ 기관별로 물어볼 것'];
  insts.forEach((r, i) => { L.push(`▶ ${r.name} (${r.cls || CATS[r.cat].label}) ☎ ${r.tel || '자료에 없음'}`); m.perInstitution[i].questions.forEach((q, j) => L.push(`  ${j + 1}. ${q}`)); });
  L.push('', '■ 다음에 할 일', ...m.nextSteps.map((s) => '- ' + s), '', '※ 실제 이용 가능 여부·자격·비용은 기관 확인 필요');
  L.push(S.source?.kind === 'sample' ? '※ 시연용 가상 자료' : `※ 출처: ${S.source?.name || ''} · 기준일 ${S.source?.baseDate || '확인 필요'}`);
  return L.join('\n');
}

/* ───────── 자료 화면 ───────── */
function renderDataStatus() {
  const s = S.source || {};
  $('#dataStatus').innerHTML = s.kind === 'sample'
    ? '지금은 <b>시연용 가상 자료</b>를 쓰고 있어요. 실제 기관 정보를 보려면 CSV를 불러와 주세요.'
    : `<b>${esc(s.name || '불러온 자료')}</b><br>천안시 자료 ${S.rows.length}건 · 기준일 ${esc(s.baseDate || '입력 필요')}`;
  $('#baseDate').value = s.kind === 'csv' ? s.baseDate || '' : '';
}

/* ───────── 이벤트 ───────── */
document.addEventListener('click', (e) => {
  const b = e.target.closest('button, a');
  if (!b) return;
  if (b.dataset.area) { S.area = b.dataset.area; $$('#areaChips .chip').forEach((c) => c.classList.toggle('on', c === b)); }
  else if (b.dataset.who) { S.who = S.who === b.dataset.who ? '' : b.dataset.who; $$('#whoChips .chip').forEach((c) => c.classList.toggle('on', c.dataset.who === S.who)); }
  else if (b.dataset.need) {
    const k = b.dataset.need;
    if (k === 'unknown') { S.needs.clear(); $$('#needChips .chip').forEach((c) => c.classList.toggle('on', c === b && !b.classList.contains('on'))); }
    else { S.needs.has(k) ? S.needs.delete(k) : S.needs.add(k); $('#needChips [data-need="unknown"]').classList.remove('on'); b.classList.toggle('on', S.needs.has(k)); }
  }
  else if (b.dataset.ans) {
    const box = b.closest('.q'); const id = box.dataset.q;
    S.answers[id] = S.answers[id] === b.dataset.ans ? '' : b.dataset.ans;
    $$('.chip', box).forEach((c) => c.classList.toggle('on', c.dataset.ans === S.answers[id]));
  }
  else if (b.dataset.filter) { S.filter = b.dataset.filter; renderResults(); }
  else if (b.dataset.pick !== undefined) { const i = Number(b.dataset.pick); S.picked.has(i) ? S.picked.delete(i) : S.picked.add(i); renderResults(); }
  else if (b.dataset.back) go('s' + b.dataset.back);
  else if (b.hasAttribute('data-open-data')) { renderDataStatus(); go('sData'); }
});
$('#freeText').addEventListener('input', updateSuggest);
$('#toS2').addEventListener('click', toS2);
$('#toS3').addEventListener('click', toS3);
$('#toS4').addEventListener('click', toS4);
$('#dataBtn').addEventListener('click', () => { renderDataStatus(); go('sData'); });
$('#fontBtn').addEventListener('click', () => {
  const on = document.documentElement.classList.toggle('big');
  store.set('care.big', on ? '1' : '');
});
$('#copyMemo').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(memoText()); toast('메모를 복사했어요. 문자나 카톡에 붙여 넣으세요.'); }
  catch { toast('복사가 안 되면 "메모 저장"을 눌러 주세요.'); }
});
$('#saveMemo').addEventListener('click', () => {
  const blob = new Blob(['﻿' + memoText()], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `돌봄문의메모_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('메모를 저장했어요.');
});
$('#restart').addEventListener('click', () => {
  Object.assign(S, { who: '', text: '', analysis: null, answers: {}, filter: 'all', memo: null });
  S.needs.clear(); S.picked.clear();
  $('#freeText').value = ''; updateSuggest();
  $$('#whoChips .chip, #needChips .chip').forEach((c) => c.classList.remove('on'));
  go('s1');
});
$('#csvFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const text = decode(await f.arrayBuffer());
    S.rows = rowsFromCSV(text);
    const m = f.name.match(/(20\d{2})[.\-_]?(\d{2})[.\-_]?(\d{2})/);
    S.source = { kind: 'csv', name: '국민건강보험공단 「통합돌봄 서비스 자원」', baseDate: m ? `${m[1]}-${m[2]}-${m[3]}` : ($('#baseDate').value || '') };
    S.picked.clear();
    if (text.length < 4_000_000) { store.set('care.csv', text); store.set('care.src', JSON.stringify(S.source)); }
    toast(`천안시 자료 ${S.rows.length}건을 불러왔어요.`);
  } catch (err) { toast(err.message); }
  e.target.value = '';
  renderDataStatus();
});
$('#baseDate').addEventListener('change', (e) => {
  if (S.source?.kind !== 'csv') return;
  S.source.baseDate = e.target.value; store.set('care.src', JSON.stringify(S.source)); renderDataStatus();
});
$('#useSample').addEventListener('click', async () => { store.del('care.csv'); await loadSample(); S.picked.clear(); renderDataStatus(); toast('시연용 가상 자료로 바꿨어요.'); });
$('#clearData').addEventListener('click', async () => { store.del('care.csv'); store.del('care.src'); await loadData(); S.picked.clear(); renderDataStatus(); toast('불러온 자료를 지웠어요.'); });

/* ───────── 시작 ───────── */
(async function init() {
  if (store.get('care.big')) document.documentElement.classList.add('big');
  renderNeeds();
  go('s1');
  await Promise.all([loadData(), checkAI()]);
  go('s1');
})();
