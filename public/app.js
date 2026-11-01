// 나의 AI 사무실 — 화면 동작
const $ = (s) => document.querySelector(s);
let S = null; // 서버 상태
const lastSig = {}; // 화면별 마지막 렌더 서명 (입력 중인 글이 지워지지 않도록 바뀐 부분만 다시 그림)

const STATUS = {
  working: { label: '작업 중', icon: '⏳' },
  review: { label: '결재 대기', icon: '📥' },
  done: { label: '완료', icon: '✅' },
  error: { label: '오류', icon: '⚠️' },
  rejected: { label: '반려', icon: '🗑️' },
};
const EXAMPLES = [
  '이번 달 은퇴설계 세미나 열자. 커리큘럼, 홍보글, 기존 고객 초대 문자 준비해 줘',
  'AI 얼굴분석심리상담사 자격증 1급 예상문제 20개 만들어 줘',
  '충남AIXR 이사회 회의 안내 공문이랑 회원 안내문 써 줘',
  '컬러테라피 힐링 특강 인스타 홍보 카드뉴스 문구 5장',
];

// ───────── 서버 통신 ─────────
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    showAuth(false);
    throw new Error('로그인이 필요합니다.');
  }
  if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.');
  return data;
}
async function refresh() {
  if (!loggedIn) return;
  try {
    S = await api('GET', '/api/state');
    render();
  } catch (e) {
    console.warn(e);
  }
}
function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}
async function act(btn, fn, okMsg) {
  if (btn) btn.disabled = true;
  try {
    await fn();
    if (okMsg) toast(okMsg);
    await refresh();
  } catch (e) {
    alert(e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ───────── 유틸 ─────────
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const emp = (id) => S.employees.find((e) => e.id === id) || { name: '퇴사한 직원', emoji: '👤', role: '' };
const when = (iso) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// 아주 가벼운 마크다운 → HTML (제목, 굵게, 목록, 표, 인용, 코드, 구분선)
function md(src = '') {
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = src.split('\n');
  let html = '';
  let list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      closeList();
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      html += '<table><tr>' + cells(l).map((c) => `<th>${c}</th>`).join('') + '</tr>';
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) html += '<tr>' + cells(lines[i++]).map((c) => `<td>${c}</td>`).join('') + '</tr>';
      i--;
      html += '</table>';
      continue;
    }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { closeList(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^>\s?(.*)/))) { closeList(); html += `<blockquote>${inline(m[1])}</blockquote>`; }
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { closeList(); html += '<hr>'; }
    else if (!l.trim()) { closeList(); }
    else { closeList(); html += `<p>${inline(l)}</p>`; }
  }
  closeList();
  return html;
}

function download(name, content) {
  clickLink(URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' })), name);
}

// ───────── 렌더링 ─────────
function once(key, sig, fn) {
  if (lastSig[key] === sig) return;
  lastSig[key] = sig;
  fn();
}

function render() {
  $('#owner').textContent = `${S.owner.name} ${S.owner.title}`;
  const mode = $('#mode');
  mode.textContent = S.demo ? '🧪 데모 모드: API 키를 넣으면 실제로 일합니다' : '🤖 AI 직원 근무 중';
  mode.classList.toggle('demo', S.demo);
  const reviewN = S.tasks.filter((t) => t.status === 'review').length;
  $('#reviewCount').textContent = reviewN || '';

  const taskSig = S.tasks.map((t) => t.id + t.status + t.updatedAt).join();
  once('home', taskSig + S.orders.map((o) => o.status + o.summary).join() + S.employees.length, renderHome);
  once('briefing', S.briefing?.at || '', () => { if (S.briefing) { $('#briefing').classList.remove('muted'); $('#briefing').innerHTML = md(S.briefing.text) + `<small class="muted">${when(S.briefing.at)}</small>`; } });
  once('review', S.tasks.filter((t) => t.status === 'review').map((t) => t.id + t.updatedAt).join() + S.employees.map((e) => e.name).join(), renderReview);
  once('staff', JSON.stringify(S.employees) + taskSig, renderStaff);
  once('kb', JSON.stringify(S.knowledge), renderKB);
  once('settings', JSON.stringify([S.settings, S.google, S.kakao]), () => { renderSettings(); renderKakao(); });
  once('calendarConn', String(S.google.connected), loadCalendar);
}

function renderHome() {
  const count = (s) => S.tasks.filter((t) => t.status === s).length;
  $('#stats').innerHTML = ['working', 'review', 'done', 'error']
    .map((s) => `<div class="stat"><b>${count(s)}</b><span>${STATUS[s].icon} ${STATUS[s].label}</span></div>`)
    .join('');
  $('#orders').innerHTML =
    S.orders.slice(0, 5).map((o) => `<li>${o.status === 'planning' ? '<span class="spin">⏳</span> ' : ''}${esc(o.text)}<small>${esc(o.summary || '')} · ${when(o.createdAt)}</small></li>`).join('') ||
    '<li class="muted">아직 지시한 업무가 없습니다.</li>';

  const cols = [
    ['working', '⏳ 작업 중'],
    ['review', '📥 결재 대기'],
    ['done', '✅ 완료'],
    ['error', '⚠️ 오류 · 반려'],
  ];
  $('#board').innerHTML = cols
    .map(([s, title]) => {
      const list = S.tasks.filter((t) => (s === 'error' ? t.status === 'error' || t.status === 'rejected' : t.status === s));
      return `<div class="col"><h3><span>${title}</span><span class="muted">${list.length}</span></h3>${
        list.slice(0, 30).map((t) => {
          const e = emp(t.employeeId);
          return `<div class="task ${t.status}" data-task="${t.id}"><div>${t.status === 'working' ? '<span class="spin">⏳</span> ' : ''}${esc(t.title)}</div><div class="who">${e.emoji} ${esc(e.name)} · ${esc(e.role)} · ${when(t.updatedAt)}</div></div>`;
        }).join('') || '<p class="muted">비어 있음</p>'
      }</div>`;
    })
    .join('');
}

function reviewActions(t) {
  return `<textarea rows="2" placeholder="수정할 점을 적어 주세요 (예: 더 짧게, 50대 여성 눈높이로)" data-fb="${t.id}"></textarea>
    <div class="actions">
      <button class="ok" data-approve="${t.id}">✅ 승인</button>
      <button data-revise="${t.id}">✏️ 수정 요청</button>
      <button data-copy="${t.id}">📋 복사</button>
      <button data-dl="${t.id}">⬇️ 저장(.md)</button>
      <button data-studio="${t.id}" data-kind="ppt">📊 PPT</button><button data-studio="${t.id}" data-kind="cards">🖼️ 카드뉴스</button>
      <button class="bad" data-reject="${t.id}">반려</button>
    </div>`;
}

function renderReview() {
  const list = S.tasks.filter((t) => t.status === 'review');
  $('#reviewList').innerHTML =
    list.map((t) => {
      const e = emp(t.employeeId);
      return `<div class="review-item">
        <div class="row"><h2>${e.emoji} ${esc(t.title)}</h2><span class="muted">${esc(e.name)} · ${esc(e.role)}${t.history.length ? ` · 수정 ${t.history.length}차` : ''}</span></div>
        <small class="muted">대표 지시: ${esc(t.orderText)}</small>
        <div class="md">${md(t.result)}</div>
        ${reviewActions(t)}
      </div>`;
    }).join('') || '<div class="card"><h2>🎉 결재할 업무가 없습니다</h2><p class="muted">대시보드에서 새 업무를 지시해 보세요.</p></div>';
}

function renderStaff() {
  $('#org').innerHTML = [S.secretary, ...S.employees]
    .map((e) => {
      const isSec = e.id === 'secretary';
      const active = S.tasks.filter((t) => t.employeeId === e.id && (t.status === 'working' || t.status === 'review')).length;
      const done = S.tasks.filter((t) => t.employeeId === e.id && t.status === 'done').length;
      return `<div class="emp">
        <div class="face">${e.emoji}</div>
        <div class="dept">${esc(e.dept)}</div>
        <b>${esc(e.name)} · ${esc(e.role)}</b>
        <p>${esc(e.guide)}</p>
        ${isSec ? '<span class="load muted">모든 지시를 받아 분배합니다</span>' : `<span class="load">진행 ${active}건 · 완료 ${done}건</span>
        <div class="actions"><button data-direct="${e.id}">💬 직접 지시</button><button data-edit="${e.id}">편집</button></div>`}
      </div>`;
    })
    .join('');
}

function renderKB() {
  $('#kbList').innerHTML =
    S.knowledge.map((k) => `<div class="kb"><div class="row"><b>${esc(k.title)}</b><button class="bad ghost" data-delkb="${k.id}">삭제</button></div><pre>${esc(k.content)}</pre></div>`).join('') ||
    '<p class="muted">아직 저장된 자료가 없습니다.</p>';
}

// ───────── 모달 ─────────
const modal = $('#modal');
function openModal(html) {
  $('#modalBody').innerHTML = html + '<div style="text-align:right;margin-top:12px"><button data-close>닫기</button></div>';
  modal.showModal();
}
modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.close(); });

function showTask(id) {
  const t = S.tasks.find((x) => x.id === id);
  if (!t) return;
  const e = emp(t.employeeId);
  const body =
    t.status === 'working' ? '<p><span class="spin">⏳</span> 작업 중입니다… 잠시만 기다려 주세요.</p>'
    : t.status === 'error' ? `<p class="err">⚠️ ${esc(t.error)}</p><button class="primary" data-retry="${t.id}">다시 시도</button>`
    : `<div class="md">${md(t.result)}</div>`;
  openModal(`<h2>${e.emoji} ${esc(t.title)}</h2>
    <p class="muted">${esc(e.name)} · ${esc(e.role)} · ${STATUS[t.status].icon} ${STATUS[t.status].label}</p>
    <details><summary>작업 지시 보기</summary><p><b>대표 지시:</b> ${esc(t.orderText)}</p><p><b>배정 내용:</b> ${esc(t.instructions)}</p>${t.history.map((h, i) => `<p><b>수정 요청 ${i + 1}:</b> ${esc(h.feedback)}</p>`).join('')}</details>
    ${body}
    ${t.status === 'review' ? reviewActions(t) : ''}
    ${t.status === 'done' ? `<div class="actions"><button data-copy="${t.id}">📋 복사</button><button data-dl="${t.id}">⬇️ 저장(.md)</button><button data-studio="${t.id}" data-kind="ppt">📊 PPT</button><button data-studio="${t.id}" data-kind="cards">🖼️ 카드뉴스</button>${
      S.google.connected ? `<button data-gmail="${t.id}">📧 Gmail 임시보관함</button><button data-drive="${t.id}">📁 Drive에 저장</button>` : ''
    }</div>${S.google.connected ? '' : '<p class="muted links">⚙️ 설정에서 Google을 연결하면 Gmail 임시보관함·Drive로 바로 보낼 수 있습니다.</p>'}
    <div class="links">${t.driveLink ? `<a href="${esc(t.driveLink)}" target="_blank" rel="noopener">📁 Drive 문서 열기</a>` : ''}${t.gmailDraftAt ? `<span class="ok-text">📧 Gmail 임시보관함에 저장됨 (${when(t.gmailDraftAt)})</span>` : ''}</div>` : ''}
    ${t.status !== 'working' ? `<p style="margin-top:12px"><button class="bad ghost" data-deltask="${t.id}">이 업무 삭제</button></p>` : ''}`);
}

function editEmployee(id) {
  const e = id ? S.employees.find((x) => x.id === id) : { name: '', role: '', dept: '', emoji: '🙂', guide: '', keywords: [] };
  openModal(`<h2>${id ? '직원 정보 편집' : '새 AI 직원 채용'}</h2>
    <form id="empForm" class="stack">
      <label>이모지 <input name="emoji" value="${esc(e.emoji)}" /></label>
      <label>이름 <input name="name" value="${esc(e.name)}" placeholder="예: 수아" /></label>
      <label>부서 <input name="dept" value="${esc(e.dept)}" placeholder="예: 마케팅팀" /></label>
      <label>직무 <input name="role" value="${esc(e.role)}" placeholder="예: 유튜브 PD" /></label>
      <label>업무 지침서 (이 직원이 어떻게 일해야 하는지 자세히 적을수록 좋아요)
        <textarea name="guide" rows="6">${esc(e.guide)}</textarea></label>
      <label>키워드 (쉼표로 구분, 데모 모드에서 업무 배정에 사용)
        <input name="keywords" value="${esc(e.keywords.join(', '))}" /></label>
      <div class="actions"><button class="primary" type="submit">저장</button>${id ? `<button type="button" class="bad" data-delemp="${id}">퇴사 처리</button>` : ''}</div>
    </form>`);
  $('#empForm').onsubmit = (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target));
    act(ev.submitter, async () => {
      await api(id ? 'PUT' : 'POST', id ? `/api/employees/${id}` : '/api/employees', data);
      modal.close();
    }, id ? '저장했습니다' : `${data.name} 직원이 입사했습니다 🎉`);
  };
}

function directOrder(id) {
  const e = emp(id);
  openModal(`<h2>${e.emoji} ${esc(e.name)}에게 직접 지시</h2>
    <form id="directForm" class="stack"><textarea name="text" rows="4" placeholder="${esc(e.role)}에게 맡길 일을 적어 주세요"></textarea>
    <button class="primary" type="submit">지시하기</button></form>`);
  $('#directForm').onsubmit = (ev) => {
    ev.preventDefault();
    act(ev.submitter, async () => {
      await api('POST', `/api/employees/${id}/tasks`, { text: ev.target.text.value });
      modal.close();
    }, `${e.name}에게 지시했습니다`);
  };
}

// ───────── 로그인 ─────────
let loggedIn = false;
let authMode = 'login';
function showAuth(setup) {
  loggedIn = false;
  authMode = setup ? 'setup' : 'login';
  $('#authScreen').classList.remove('hidden');
  $('#authTitle').textContent = setup ? '처음 오셨네요! 비밀번호를 정해 주세요' : '나의 AI 사무실';
  $('#authDesc').textContent = setup ? '이 비밀번호로 대표님만 사무실에 들어올 수 있습니다. (8자 이상)' : '대표님 비밀번호를 입력해 주세요.';
  $('#authPw2').classList.toggle('hidden', !setup);
  $('#authPw').autocomplete = setup ? 'new-password' : 'current-password';
  $('#authBtn').textContent = setup ? '시작하기' : '로그인';
  $('#authErr').textContent = '';
  $('#authPw').focus();
}
async function enter() {
  loggedIn = true;
  $('#authScreen').classList.add('hidden');
  $('#authPw').value = $('#authPw2').value = '';
  for (const k of Object.keys(lastSig)) delete lastSig[k];
  await refresh();
}
$('#authForm').onsubmit = async (ev) => {
  ev.preventDefault();
  const pw = $('#authPw').value;
  if (authMode === 'setup' && pw !== $('#authPw2').value) return ($('#authErr').textContent = '두 비밀번호가 서로 다릅니다.');
  $('#authBtn').disabled = true;
  try {
    await api('POST', authMode === 'setup' ? '/api/auth/setup' : '/api/auth/login', { password: pw });
    await enter();
  } catch (e) {
    $('#authErr').textContent = e.message;
  } finally {
    $('#authBtn').disabled = false;
  }
};

// ───────── 캘린더 ─────────
async function loadCalendar() {
  const box = $('#calendar');
  if (!S?.google.connected) {
    box.className = 'muted';
    box.innerHTML = S?.google.configured
      ? 'Google 캘린더가 연결되지 않았습니다. <a href="#" data-goto="settings">⚙️ 설정에서 연결</a>하면 오늘·내일 일정이 여기에 나오고 브리핑에도 들어갑니다.'
      : 'Google 연동을 준비하면 오늘·내일 일정이 여기에 나옵니다. <a href="#" data-goto="settings">⚙️ 설정 안내 보기</a>';
    return;
  }
  try {
    const { events } = await api('GET', '/api/calendar');
    const dayKey = (e) => new Date(e.allDay ? e.start + 'T00:00:00+09:00' : e.start).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' });
    const time = (e) => (e.allDay ? '종일' : new Date(e.start).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }));
    let html = '<ul class="events">';
    let last = '';
    for (const e of events) {
      const d = dayKey(e);
      if (d !== last) { html += `<li class="day">${esc(d)}</li>`; last = d; }
      html += `<li><span class="t">${time(e)}</span><span>${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title)}${e.location ? `<small>📍 ${esc(e.location)}</small>` : ''}</span></li>`;
    }
    box.className = '';
    box.innerHTML = events.length ? html + '</ul>' : '<p class="muted">오늘·내일 등록된 일정이 없습니다. 여유로운 하루 되세요 🌿</p>';
  } catch (e) {
    box.className = 'err';
    box.textContent = `일정을 불러오지 못했습니다: ${e.message}`;
  }
}

// ───────── 설정 ─────────
function renderSettings() {
  const g = S.google;
  $('#autoBriefing').checked = S.settings.autoBriefing;
  $('#briefingTime').value = S.settings.briefingTime;
  if (!g.configured) {
    $('#googleBox').innerHTML = `<p>Google 캘린더·Gmail·Drive를 쓰려면 <b>한 번만</b> 준비가 필요합니다. (약 10분, 자세한 안내는 README의 "Google 연동 준비" 참고)</p>
      <ol class="guide">
        <li><a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud 콘솔</a>에서 새 프로젝트 만들기</li>
        <li><b>API 및 서비스 → 라이브러리</b>에서 Google Calendar API, Gmail API, Google Drive API 사용 설정</li>
        <li><b>OAuth 동의 화면</b> 만들기 (외부, 테스트 사용자에 내 Gmail 추가)</li>
        <li><b>사용자 인증 정보 → OAuth 클라이언트 ID</b> (웹 애플리케이션), 승인된 리디렉션 URI에 <code>${esc(g.redirectUri)}</code> 입력</li>
        <li>받은 클라이언트 ID·보안 비밀을 <code>.env</code>의 <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>에 넣고 앱 다시 켜기</li>
      </ol>`;
  } else if (!g.connected) {
    $('#googleBox').innerHTML = `<p>Google 계정을 연결하면:</p>
      <ul><li>📅 대시보드와 아침 브리핑에 <b>오늘·내일 캘린더 일정</b>이 들어갑니다 (읽기만 함)</li>
      <li>📧 승인한 결과물을 <b>Gmail 임시보관함</b>에 저장합니다 (자동 발송하지 않음)</li>
      <li>📁 승인한 결과물을 Drive의 <b>"AI 사무실" 폴더</b>에 Google 문서로 저장합니다</li></ul>
      <a class="btn-link" href="/auth/google/start">Google 계정 연결하기</a>`;
  } else {
    $('#googleBox').innerHTML = `<p class="ok-text">✅ 연결됨: <b>${esc(g.email || 'Google 계정')}</b></p>
      <p class="muted">캘린더 읽기 · Gmail 임시보관함 저장 · Drive "AI 사무실" 폴더 저장 권한을 사용 중입니다.</p>
      <button class="bad" id="gDisconnect">연결 해제</button>`;
    $('#gDisconnect').onclick = (ev) => { if (confirm('Google 연결을 해제할까요?')) act(ev.target, () => api('POST', '/api/google/disconnect'), '연결을 해제했습니다'); };
  }
}
$('#briefSettings').onsubmit = (ev) => {
  ev.preventDefault();
  act(ev.submitter, () => api('PUT', '/api/settings', { autoBriefing: $('#autoBriefing').checked, briefingTime: $('#briefingTime').value }), '저장했습니다');
};
$('#pwForm').onsubmit = (ev) => {
  ev.preventDefault();
  if ($('#pwNew').value !== $('#pwNew2').value) return alert('새 비밀번호 두 개가 서로 다릅니다.');
  act(ev.submitter, async () => {
    await api('POST', '/api/auth/password', { current: $('#pwCur').value, password: $('#pwNew').value });
    $('#pwCur').value = $('#pwNew').value = $('#pwNew2').value = '';
  }, '비밀번호를 바꿨습니다');
};
$('#logoutBtn').onclick = async () => {
  await api('POST', '/api/auth/logout').catch(() => {});
  showAuth(false);
};
$('#calBtn').onclick = () => loadCalendar();

function gmailDraft(id) {
  const t = S.tasks.find((x) => x.id === id);
  openModal(`<h2>📧 Gmail 임시보관함에 저장</h2>
    <p class="muted">메일은 <b>보내지 않고 임시보관함에만</b> 저장됩니다. Gmail에서 확인한 뒤 직접 보내 주세요.</p>
    <form id="gmailForm" class="stack">
      <label>받는 사람 (비워 두면 Gmail에서 입력) <input name="to" type="email" placeholder="example@email.com" /></label>
      <label>제목 <input name="subject" value="${esc(t.title)}" /></label>
      <button class="primary" type="submit">임시보관함에 저장</button>
    </form>`);
  $('#gmailForm').onsubmit = (ev) => {
    ev.preventDefault();
    const f = ev.target;
    act(ev.submitter, async () => {
      const r = await api('POST', `/api/tasks/${id}/gmail-draft`, { to: f.to.value, subject: f.subject.value, html: md(t.result) });
      openModal(`<h2>📧 저장했습니다</h2><p>Gmail 임시보관함에서 확인한 뒤 보내 주세요.</p><p><a href="${esc(r.link)}" target="_blank" rel="noopener">Gmail 임시보관함 열기 →</a></p>`);
    }, 'Gmail 임시보관함에 저장했습니다');
  };
}


// ───────── 파일 받기 ─────────
async function downloadUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || '파일을 만들지 못했습니다.');
  }
  const blob = await res.blob();
  const m = (res.headers.get('content-disposition') || '').match(/filename\*=UTF-8''([^;]+)/);
  clickLink(URL.createObjectURL(blob), m ? decodeURIComponent(m[1]) : 'download.pptx');
}
function savePng(dataUrl, name) {
  clickLink(dataUrl, name);
}
function clickLink(href, name) {
  const a = Object.assign(document.createElement('a'), { href, download: name, hidden: true });
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); if (href.startsWith('blob:')) URL.revokeObjectURL(href); }, 2000);
}

// ───────── 카드뉴스 그림 그리기 (1080×1080 PNG) ─────────
const CARD_FONT = '"Noto Sans KR", "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
function wrapLines(g, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      if (g.measureText(line + word).width <= maxW) { line += word; continue; }
      if (line.trim()) lines.push(line.trim());
      line = '';
      for (const ch of word.trimStart()) {
        if (g.measureText(line + ch).width > maxW) { lines.push(line); line = ''; }
        line += ch;
      }
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines;
}
function fitText(g, text, maxW, maxLines, start, min, weight) {
  for (let size = start; size >= min; size -= 4) {
    g.font = `${weight} ${size}px ${CARD_FONT}`;
    const lines = wrapLines(g, text, maxW);
    if (lines.length <= maxLines) return { size, lines };
  }
  g.font = `${weight} ${min}px ${CARD_FONT}`;
  const lines = wrapLines(g, text, maxW);
  return { size: min, lines: lines.slice(0, maxLines).map((l, i) => (i === maxLines - 1 && lines.length > maxLines ? l.slice(0, -1) + '…' : l)) };
}
function drawCard(card, i, n, theme, footer) {
  const c = document.createElement('canvas');
  c.width = c.height = 1080;
  const g = c.getContext('2d');
  const col = (k) => '#' + theme[k];
  g.fillStyle = col('bg');
  g.fillRect(0, 0, 1080, 1080);
  g.fillStyle = col('accent');
  g.fillRect(90, 110, 130, 16);
  g.textBaseline = 'top';
  const h = fitText(g, card.headline, 900, 4, 92, 56, 700);
  g.fillStyle = col('text');
  g.font = `700 ${h.size}px ${CARD_FONT}`;
  let y = 180;
  for (const l of h.lines) { g.fillText(l, 90, y); y += h.size * 1.3; }
  if (card.body) {
    y += 40;
    const b = fitText(g, card.body, 900, 6, 50, 34, 400);
    g.fillStyle = col('sub');
    g.font = `400 ${b.size}px ${CARD_FONT}`;
    for (const l of b.lines) { if (y > 900) break; g.fillText(l, 90, y); y += b.size * 1.5; }
  }
  g.font = `700 30px ${CARD_FONT}`;
  g.fillStyle = col('accent');
  g.fillText(footer, 90, 990);
  g.font = `400 28px ${CARD_FONT}`;
  g.fillStyle = col('sub');
  g.textAlign = 'right';
  g.fillText(`${i + 1} / ${n}`, 990, 992);
  return c.toDataURL('image/png');
}

// ───────── PPT · 카드뉴스 스튜디오 ─────────
function openStudio(id, kind) {
  const t = S.tasks.find((x) => x.id === id);
  if (!t) return;
  const label = kind === 'cards' ? '🖼️ 카드뉴스' : '📊 강의 PPT';
  const themeOpts = Object.entries(S.themes).map(([k, v]) => `<option value="${k}" ${k === S.settings.slideTheme ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  openModal(`<h2>${label} 만들기</h2>
    <p class="muted">"${esc(t.title)}" 결과물을 ${kind === 'cards' ? '인스타그램용 정사각형 카드' : '강의용 슬라이드'}로 바꿉니다. 비서실이 내용을 나눠 구성하고, 색상은 언제든 바꿀 수 있습니다.</p>
    <div class="studio-bar">
      <label>색상 <select id="studioTheme">${themeOpts}</select></label>
      <button class="primary" id="studioMake">${t.slides?.[kind] ? '다시 구성하기' : '구성 만들기'}</button>
    </div>
    <div id="studioOut">${t.slides?.[kind] ? '' : '<p class="muted">[구성 만들기]를 누르면 미리보기가 나옵니다.</p>'}</div>`);
  let data = t.slides?.[kind]?.data || null;
  const show = () => {
    if (!data) return;
    const theme = $('#studioTheme').value;
    const th = S.themes[theme];
    const footer = `${S.owner.name} ${S.owner.title}`;
    const file = `/api/tasks/${id}/pptx?kind=${kind}&theme=${theme}`;
    const safe = t.title.replace(/[\\/:*?"<>|]/g, '_');
    let html = `<div class="actions" style="margin-bottom:10px"><button class="primary" data-pptx="${esc(file)}">⬇️ PowerPoint 파일 받기 (.pptx)</button></div>`;
    if (kind === 'cards') {
      html += '<div class="cards-grid">' + data.cards.map((c, i) => `<figure><img alt="${esc(c.headline)}" src="${drawCard(c, i, data.cards.length, th, footer)}" /><a href="#" data-png="${esc(`${safe}_${i + 1}.png`)}">PNG 저장</a></figure>`).join('') + '</div>';
      if (data.caption) html += `<h3>인스타그램 캡션</h3><div class="caption-box">${esc(data.caption)}</div><div class="actions" style="margin-top:6px"><button id="copyCaption">📋 캡션 복사</button></div>`;
    } else {
      html += `<div class="slide-list"><div class="slide-mini"><b>표지 · ${esc(data.title)}</b>${data.subtitle ? `<small>${esc(data.subtitle)}</small>` : ''}</div>` +
        data.slides.map((sl, i) => `<div class="slide-mini"><b>${i + 2}. ${esc(sl.title)}</b><ul>${sl.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>${sl.notes ? `<small>🎤 ${esc(sl.notes)}</small>` : ''}</div>`).join('') + '</div>';
    }
    $('#studioOut').innerHTML = html;
    const cc = $('#copyCaption');
    if (cc) cc.onclick = () => navigator.clipboard.writeText(data.caption).then(() => toast('캡션을 복사했습니다'), () => toast('복사하지 못했습니다'));
  };
  $('#studioTheme').onchange = show;
  $('#studioMake').onclick = async (ev) => {
    const btn = ev.target;
    btn.disabled = true;
    $('#studioOut').innerHTML = '<p><span class="spin">⏳</span> 구성하는 중입니다… (30초 정도 걸릴 수 있어요)</p>';
    try {
      data = (await api('POST', `/api/tasks/${id}/slides`, { kind })).data;
      btn.textContent = '다시 구성하기';
      show();
      refresh();
    } catch (e) {
      $('#studioOut').innerHTML = `<p class="err">${esc(e.message)}</p>`;
    } finally {
      btn.disabled = false;
    }
  };
  show();
}

// ───────── 주간 업무 보고서 ─────────
let week = 0;
let report = null;
async function loadReport() {
  try {
    report = await api('GET', `/api/report?week=${week}`);
    renderReport();
  } catch (e) {
    toast(e.message);
  }
}
function renderReport() {
  const r = report;
  const T = r.totals;
  $('#repRange').textContent = `${r.from} (월) ~ ${r.to} (일)${week === 0 ? ' · 이번 주' : week === -1 ? ' · 지난주' : ''}`;
  $('#repNext').disabled = week === 0;
  $('#repStats').innerHTML = [
    ['💬', '지시', T.orders],
    ['✅', '완료', T.done],
    ['⏱️', '절약 추정', `${T.savedHours}시간`],
    ...(week === 0 ? [['📥', '결재 대기', T.review]] : []),
    ['✏️', '수정 요청', T.revisions],
    ['🗑️', '반려', T.rejected],
  ].map(([i, l, v]) => `<div class="stat"><b>${v}</b><span>${i} ${l}</span></div>`).join('');
  const max = Math.max(1, ...r.daily.map((d) => d.done));
  const wd = ['월', '화', '수', '목', '금', '토', '일'];
  $('#repDaily').innerHTML = r.daily.map((d, i) => `<div class="bar" title="${d.date} 완료 ${d.done}건"><b>${d.done || ''}</b><i style="height:${(d.done / max) * 120}px"></i>${wd[i]}</div>`).join('');
  $('#repTable').innerHTML = `<tr><th>직원</th><th>완료</th>${week === 0 ? '<th>결재 대기</th>' : ''}<th>수정 요청</th><th>반려</th><th>절약(시간)</th></tr>` +
    (r.byEmployee.map((e) => `<tr><td>${e.emoji} ${esc(e.name)} <span class="muted">${esc(e.role)}</span></td><td>${e.done}</td>${week === 0 ? `<td>${e.review}</td>` : ''}<td>${e.revisions}</td><td>${e.rejected}</td><td>${Math.round((e.done * r.minutesPerTask / 60) * 10) / 10}</td></tr>`).join('') ||
    `<tr><td colspan="6" class="muted">이 주에는 기록이 없습니다.</td></tr>`);
  $('#repDone').innerHTML = r.doneTitles.map((x) => `<li>${esc(x)}</li>`).join('') || '<li class="muted">완료한 업무가 없습니다.</li>';
  const rv = $('#repReview');
  rv.classList.toggle('muted', !r.review);
  rv.innerHTML = r.review ? md(r.review.text) + `<small class="muted">${when(r.review.at)}</small>` : '아직 총평이 없습니다. [AI 총평 받기]를 누르면 비서실장이 한 주를 정리해 드립니다. (월요일 아침에는 지난주 총평이 자동으로 만들어집니다)';
  $('#repReviewBtn').textContent = r.review ? '총평 다시 받기' : 'AI 총평 받기';
}
$('#repPrev').onclick = () => { week -= 1; loadReport(); };
$('#repNext').onclick = () => { if (week < 0) { week += 1; loadReport(); } };
$('#repReviewBtn').onclick = (ev) => act(ev.target, async () => { report = await api('POST', '/api/report/review', { week }); renderReport(); }, '총평을 받았습니다');
$('#repDl').onclick = () => {
  if (!report) return;
  const r = report;
  const T = r.totals;
  const lines = [
    `# 주간 업무 보고서 (${r.from} ~ ${r.to})`, '',
    `- 지시 ${T.orders}건 · 완료 ${T.done}건 · 수정 요청 ${T.revisions}회 · 반려 ${T.rejected}건`,
    `- 절약 추정: 약 ${T.savedHours}시간 (업무 1건당 ${r.minutesPerTask}분 기준)`, '',
    '## 비서실장 총평', r.review ? r.review.text : '(없음)', '',
    '## 직원별 실적', '| 직원 | 완료 | 수정 요청 | 반려 |', '|---|---|---|---|',
    ...r.byEmployee.map((e) => `| ${e.name} (${e.role}) | ${e.done} | ${e.revisions} | ${e.rejected} |`), '',
    '## 완료한 업무', ...(r.doneTitles.length ? r.doneTitles.map((x) => `- ${x}`) : ['(없음)']),
  ];
  download(`주간보고서_${r.from}.md`, lines.join('\n'));
};

// ───────── 카카오톡 · 알림 설정 ─────────
function renderKakao() {
  const k = S.kakao;
  const box = $('#kakaoBox');
  if (!k.configured) {
    box.innerHTML = `<p>결재함 도착, 아침 브리핑, 주간 보고를 <b>대표님 카카오톡(나와의 채팅)</b>으로 받을 수 있습니다. 처음 한 번 준비가 필요합니다. (약 10분, README의 "카카오톡 알림 준비" 참고)</p>
      <ol class="guide">
        <li><a href="https://developers.kakao.com/" target="_blank" rel="noopener">카카오 개발자 사이트</a>에 로그인 → <b>내 애플리케이션 → 애플리케이션 추가</b></li>
        <li><b>플랫폼 → Web</b>에 사이트 도메인 <code>${esc(new URL(k.redirectUri).origin)}</code> 등록</li>
        <li><b>카카오 로그인</b> 활성화, Redirect URI에 <code>${esc(k.redirectUri)}</code> 등록</li>
        <li><b>동의항목</b>에서 "카카오톡 메시지 전송"을 <b>선택 동의</b>로 설정</li>
        <li><b>앱 키</b>의 REST API 키를 <code>.env</code>의 <code>KAKAO_REST_API_KEY</code>에 넣고 앱 다시 켜기</li>
      </ol>`;
  } else if (!k.connected) {
    box.innerHTML = `<p>카카오톡을 연결하면 대표님 <b>나와의 채팅</b>으로 알림이 옵니다. 고객이나 다른 사람에게는 보내지 않습니다.</p>
      <a class="btn-link" href="/auth/kakao/start">카카오톡 연결하기</a>`;
  } else {
    box.innerHTML = `<p class="ok-text">✅ 연결됨${k.nickname ? `: <b>${esc(k.nickname)}</b>` : ''}</p>
      ${k.lastError ? `<p class="err">최근 전송 실패: ${esc(k.lastError)}</p>` : ''}
      <div class="actions"><button id="kTest">테스트 메시지 보내기</button><button class="bad" id="kOff">연결 해제</button></div>`;
    $('#kTest').onclick = (ev) => act(ev.target, () => api('POST', '/api/kakao/test'), '카카오톡을 확인해 보세요');
    $('#kOff').onclick = (ev) => { if (confirm('카카오톡 연결을 해제할까요?')) act(ev.target, () => api('POST', '/api/kakao/disconnect'), '연결을 해제했습니다'); };
  }
  const s = S.settings;
  for (const key of ['notifyReview', 'notifyBriefing', 'notifyWeekly']) $('#' + key).checked = s[key];
  $('#minutesPerTask').value = s.minutesPerTask;
  $('#slideTheme').innerHTML = Object.entries(S.themes).map(([key, v]) => `<option value="${key}" ${key === s.slideTheme ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
}
$('#notifySettings').onsubmit = (ev) => {
  ev.preventDefault();
  act(ev.submitter, () => api('PUT', '/api/settings', {
    notifyReview: $('#notifyReview').checked,
    notifyBriefing: $('#notifyBriefing').checked,
    notifyWeekly: $('#notifyWeekly').checked,
    minutesPerTask: Number($('#minutesPerTask').value),
    slideTheme: $('#slideTheme').value,
  }), '저장했습니다');
};

// ───────── 이벤트 ─────────
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  if (b.dataset.view === 'report') loadReport();
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${b.dataset.view}`));
});

$('#examples').innerHTML = EXAMPLES.map((x, i) => `<button type="button" data-ex="${i}">${esc(x.slice(0, 18))}…</button>`).join('');

$('#orderForm').onsubmit = (ev) => {
  ev.preventDefault();
  const text = $('#orderText').value;
  act(ev.submitter, async () => {
    await api('POST', '/api/orders', { text });
    $('#orderText').value = '';
  }, '비서실장 유니가 업무를 나누고 있습니다');
};
$('#briefBtn').onclick = (ev) => act(ev.target, () => api('POST', '/api/briefing'), '브리핑을 받았습니다');
$('#addEmp').onclick = () => editEmployee(null);
$('#kbForm').onsubmit = (ev) => {
  ev.preventDefault();
  act(ev.submitter, async () => {
    await api('POST', '/api/knowledge', { title: $('#kbTitle').value, content: $('#kbContent').value });
    $('#kbTitle').value = $('#kbContent').value = '';
  }, '지식창고에 저장했습니다');
};

document.addEventListener('click', (ev) => {
  const go = ev.target.closest('[data-goto]');
  if (go) { ev.preventDefault(); modal.close(); document.querySelector(`#tabs [data-view="${go.dataset.goto}"]`).click(); return; }
  const el = ev.target.closest('[data-studio],[data-png],[data-pptx],[data-gmail],[data-drive],[data-task],[data-approve],[data-revise],[data-reject],[data-retry],[data-copy],[data-dl],[data-direct],[data-edit],[data-delemp],[data-delkb],[data-deltask],[data-ex]');
  if (!el) return;
  if (el.tagName === 'A') ev.preventDefault();
  const d = el.dataset;
  const task = (id) => S.tasks.find((t) => t.id === id);
  if (d.ex) $('#orderText').value = EXAMPLES[d.ex];
  else if (d.task) showTask(d.task);
  else if (d.approve) act(el, async () => { await api('POST', `/api/tasks/${d.approve}/approve`); modal.close(); }, '승인했습니다 ✅');
  else if (d.revise) {
    const fb = el.closest('.review-item, #modalBody').querySelector(`[data-fb="${d.revise}"]`).value;
    if (!fb.trim()) return alert('수정할 점을 먼저 적어 주세요.');
    act(el, async () => { await api('POST', `/api/tasks/${d.revise}/revise`, { feedback: fb }); modal.close(); }, '수정 요청을 보냈습니다');
  } else if (d.reject) { if (confirm('이 결과물을 반려할까요?')) act(el, async () => { await api('POST', `/api/tasks/${d.reject}/reject`); modal.close(); }, '반려했습니다'); }
  else if (d.retry) act(el, async () => { await api('POST', `/api/tasks/${d.retry}/retry`); modal.close(); }, '다시 시도합니다');
  else if (d.copy) navigator.clipboard.writeText(task(d.copy).result).then(() => toast('복사했습니다'), () => alert('복사하지 못했습니다.'));
  else if (d.dl) { const t = task(d.dl); download(`${t.title.replace(/[\\/:*?"<>|]/g, '_')}.md`, t.result); }
  else if (d.studio) openStudio(d.studio, d.kind);
  else if (d.png) savePng(el.closest('figure').querySelector('img').src, d.png);
  else if (d.pptx) act(el, () => downloadUrl(d.pptx));
  else if (d.gmail) gmailDraft(d.gmail);
  else if (d.drive) act(el, async () => {
    const t = task(d.drive);
    const r = await api('POST', `/api/tasks/${d.drive}/drive`, { html: md(t.result) });
    openModal(`<h2>📁 Drive에 저장했습니다</h2><p>Google Drive의 <b>"AI 사무실"</b> 폴더에 Google 문서로 저장했습니다.</p>${r.webViewLink ? `<p><a href="${esc(r.webViewLink)}" target="_blank" rel="noopener">문서 열기 →</a></p>` : ''}`);
  }, 'Drive "AI 사무실" 폴더에 저장했습니다');
  else if (d.direct) directOrder(d.direct);
  else if (d.edit) editEmployee(d.edit);
  else if (d.delemp) { if (confirm('이 직원을 퇴사 처리할까요?')) act(el, async () => { await api('DELETE', `/api/employees/${d.delemp}`); modal.close(); }, '퇴사 처리했습니다'); }
  else if (d.delkb) { if (confirm('이 자료를 삭제할까요?')) act(el, () => api('DELETE', `/api/knowledge/${d.delkb}`)); }
  else if (d.deltask) { if (confirm('이 업무를 삭제할까요?')) act(el, async () => { await api('DELETE', `/api/tasks/${d.deltask}`); modal.close(); }); }
});

// Google · 카카오 연결 결과 안내 (?google=... / ?kakao=...)
const gq = new URLSearchParams(location.search);
if (gq.has('kakao')) {
  const msg = {
    connected: '✅ 카카오톡을 연결했습니다. [테스트 메시지 보내기]로 확인해 보세요',
    denied: '카카오톡 연결을 취소했습니다',
    expired: '연결 시간이 지났습니다. 다시 시도해 주세요',
    'not-configured': '.env 에 KAKAO_REST_API_KEY 를 먼저 넣어 주세요',
    error: `카카오톡 연결 실패: ${gq.get('msg') || ''}`,
  }[gq.get('kakao')];
  if (msg) setTimeout(() => toast(msg), 300);
  history.replaceState(null, '', '/');
}
if (gq.has('google')) {
  const msg = {
    connected: '✅ Google 계정을 연결했습니다',
    denied: 'Google 연결을 취소했습니다',
    expired: '연결 시간이 지났습니다. 다시 시도해 주세요',
    'not-configured': '.env 에 Google 클라이언트 정보를 먼저 넣어 주세요',
    error: `Google 연결 실패: ${gq.get('msg') || ''}`,
  }[gq.get('google')];
  if (msg) setTimeout(() => toast(msg), 300);
  history.replaceState(null, '', '/');
}
if (gq.has('google') || gq.has('kakao')) document.querySelector('#tabs [data-view="settings"]').click();

(async () => {
  const st = await api('GET', '/api/auth/status');
  if (st.loggedIn) enter();
  else showAuth(st.needsSetup);
})();
setInterval(() => { if (!document.hidden) refresh(); }, 3000);
setInterval(() => { if (!document.hidden && S?.google.connected) loadCalendar(); }, 5 * 60 * 1000);
