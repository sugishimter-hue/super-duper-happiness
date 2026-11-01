// 체험판 전용: 서버 대신 브라우저 안에서 동작하는 가짜 백엔드
// (실제 AI·Google·파일 저장 없이 화면 흐름만 보여 줍니다. 새로고침하면 처음 상태로 돌아갑니다.)
(() => {
  const SEED = __SEED__; // 빌드 때 src/seed.js 내용이 들어갑니다
  const THEMES = __THEMES__; // 빌드 때 src/slides.js 색상이 들어갑니다
  const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
  const now = () => new Date().toISOString();
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const kst = (dayOffset, hh, mm) => {
    const d = new Date(Date.now() + 9 * 3600e3 + dayOffset * 864e5).toISOString().slice(0, 10);
    return `${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`;
  };
  const kstDate = (dayOffset) => new Date(Date.now() + 9 * 3600e3 + dayOffset * 864e5).toISOString().slice(0, 10);

  // ───────── 직원별 예시 결과물 ─────────
  const SAMPLE = {
    'fin-analyst': (o) => `# 은퇴자금 분석 요약 카드 (초안)

**관련 지시:** ${o}

## 가정
| 항목 | 값 |
|---|---|
| 현재 나이 / 은퇴 희망 나이 | 52세 / 63세 |
| 은퇴 후 희망 월 생활비 | 280만 원 (현재 가치) |
| 예상 국민연금 (65세부터) | 월 115만 원 [확인 필요: 연금공단 예상액 조회] |
| 물가상승률 가정 | 연 2.5% |

## 부족자금 계산
- 63~65세 연금 공백기 2년: 약 **6,700만 원** 필요
- 65세 이후 월 부족분 165만 원 × 25년 → 은퇴 시점 기준 약 **4억 1천만 원** 필요
- 현재 준비 자산(퇴직연금·개인연금): 약 1억 8천만 원 → **부족 약 2억 9,700만 원**

## 상담 때 함께 볼 질문
1. 은퇴 후에도 강의·상담 등 소득 활동을 이어 갈 계획이 있으신가요?
2. 주택을 활용(주택연금 등)할 의향이 있으신가요?
3. 자녀 교육·결혼 자금 계획은 어떻게 되시나요?

---
*최종 판단은 대표 상담 후 확정합니다. 특정 상품 권유가 아닌 분석 자료입니다.*`,
    crm: (o) => `# 고객 안내 문자 (3안)

**관련 지시:** ${o}

**① 따뜻한 버전**
> [고객명]님, 안녕하세요 😊 재무솔루션연구소 전경숙입니다. 이번 달 '든든한 은퇴설계 세미나'에 [고객명]님을 꼭 초대하고 싶어 연락드려요. 편하게 오셔서 차 한잔하며 함께 이야기 나눠요.

**② 간결한 버전**
> [고객명]님, 전경숙입니다. ○월 ○일(토) 오전 10시 은퇴설계 세미나에 초대합니다. 참석 여부만 회신 주시면 자리 마련해 둘게요.

**③ 혜택 강조 버전**
> [고객명]님! 은퇴 후 매달 얼마가 필요한지, 한 번에 계산해 드리는 세미나를 엽니다. 참석하시면 1:1 은퇴자금 진단표를 드려요 📋

---
*발송은 대표님 승인 후 직접 진행합니다.*`,
    'lecture-planner': (o) => `# 강의계획서 (초안)

**관련 지시:** ${o}

| 항목 | 내용 |
|---|---|
| 대상 | 50~60대 직장인·예비 은퇴자 20명 |
| 시간 | 2시간 (휴식 10분 포함) |
| 목표 | 내 은퇴자금 규모를 스스로 계산하고, 오늘 할 일 1가지를 정한다 |

## 진행표
| 시간 | 내용 | 활동 |
|---|---|---|
| 0:00–0:15 | 여는 이야기: 나다운 은퇴란? | 컬러카드로 '은퇴 후 나의 하루' 고르기 |
| 0:15–0:50 | 은퇴자금, 얼마면 될까 | 생활비 체크리스트 작성 |
| 0:50–1:00 | 휴식 | |
| 1:00–1:35 | 3층 연금 이해하기 | 내 연금 예상액 조회 실습 |
| 1:35–2:00 | 나의 실행 계획 1가지 | 짝 나눔, 질의응답 |

## 슬라이드 구성 (12장)
1. 표지 · 2. 강사 소개 · 3. 은퇴 후 시간은 10만 시간 · 4~6. 생활비 계산 · 7~9. 3층 연금 · 10. 사례 · 11. 실행 계획 · 12. 마무리`,
    'exam-writer': (o) => `# 예상문제 (일부 예시)

**관련 지시:** ${o}

**1. (난이도 하)** AI 얼굴분석 상담에서 상담자가 가장 먼저 해야 할 일은?
1) 분석 결과를 단정적으로 전달한다
2) 내담자의 동의를 받고 분석 목적을 설명한다
3) 사진을 SNS에 공유한다
4) 결과를 의학적 진단으로 안내한다

**정답:** 2 · **해설:** 상담은 동의와 목적 설명에서 시작하며, 결과는 참고 자료로 다룹니다.

**2. (난이도 중)** 생성형 AI 결과물을 상담 자료로 쓸 때 옳지 않은 것은?
1) 사실 여부를 확인한다
2) 개인정보를 가린다
3) AI 답변을 그대로 최종 판단으로 쓴다
4) 출처와 한계를 함께 안내한다

**정답:** 3 · **해설:** AI 결과는 초안이며 최종 판단은 전문가가 합니다.

*(실제 사용 시 요청한 개수만큼 만들어집니다)*`,
    'student-care': (o) => `# 수강 안내문 (초안)

**관련 지시:** ${o}

안녕하세요, 에이아이글로벌유니패스아카데미입니다 🌿

신청해 주신 강의 안내드립니다.
- **일시:** [확인 필요: 날짜] 오전 10시 ~ 12시
- **장소:** [확인 필요: 장소] (천안)
- **준비물:** 스마트폰(충전), 필기도구
- **문의:** [대표 연락처]

수업 전날 한 번 더 안내 문자를 드릴게요. 함께 배우는 시간 기대하겠습니다!`,
    sns: (o) => `# 인스타그램 홍보 문구 (초안)

**관련 지시:** ${o}

## 카드뉴스 5장 문구
1. **"요즘 마음이 무슨 색인가요?"**
2. 색은 말보다 먼저 마음을 보여 줍니다
3. 컬러테라피 힐링 특강: 나에게 맞는 색으로 쉬어 가는 2시간
4. 이런 분께 추천해요: 지친 직장인 · 쉼이 필요한 엄마 · 나를 알고 싶은 분
5. 신청은 프로필 링크에서 🌈 (선착순 20명)

## 캡션
오늘 하루, 내 마음의 색을 들여다본 적 있으신가요? 🎨
따뜻한 색 한 가지로도 마음은 달라질 수 있어요.
함께 쉬어 가는 시간에 초대합니다.

#컬러테라피 #힐링특강 #천안강의 #마음챙김 #나다운삶 #전경숙강사`,
    proposal: (o) => `# 강의 제안서 (초안)

**관련 지시:** ${o}

## 1. 배경
생성형 AI가 업무 방식을 빠르게 바꾸고 있지만, 현장에서는 "어디서부터 써야 할지 모르겠다"는 목소리가 많습니다.

## 2. 목표
- 업무에 바로 쓰는 AI 활용법 3가지 익히기
- 보고서·공문 초안 작성 시간 절반으로 줄이기

## 3. 프로그램
| 회차 | 주제 | 시간 |
|---|---|---|
| 1 | AI와 친해지기: 질문 잘하는 법 | 1시간 |
| 2 | 공문·보고서 초안 실습 | 1시간 |

## 4. 강사 소개
전경숙 대표: 충남AIXR미래교육총연합회 회장, AI 활용·금융테라피 강사

## 5. 비용
[확인 필요: 기관 예산 기준]`,
    web: (o) => `# 사이트 공지사항 (초안)

**관련 지시:** ${o}

**[공지] 11월 AI 활용 특강 수강생 모집**

안녕하세요. 11월 AI 활용 특강 수강생을 모집합니다.
- 대상: AI를 처음 배우는 누구나
- 신청: 홈페이지 [교육 신청] 메뉴
- 문의: [확인 필요: 연락처]

많은 관심 부탁드립니다.`,
    association: (o) => `# 공문 (초안)

**관련 지시:** ${o}

**충남AIXR미래교육총연합회**

수신: 이사 및 회원 여러분
제목: 정기 이사회 개최 안내

1. 귀하의 건승을 기원합니다.
2. 본회 정기 이사회를 아래와 같이 개최하오니 참석하여 주시기 바랍니다.
   - 일시: [확인 필요]
   - 장소: [확인 필요]
   - 안건: 하반기 사업 보고, 내년도 교육사업 계획

**충남AIXR미래교육총연합회 회장 전경숙**`,
    writer: (o) => `# 칼럼 초안

**관련 지시:** ${o}

## 돈 이야기는 결국 마음 이야기다

상담을 하다 보면 숫자보다 먼저 마음이 보일 때가 있다. "얼마가 필요할까요?"라는 질문 뒤에는 늘 "괜찮을까요?"라는 마음이 숨어 있다.

오늘 아침 필사한 문장이 떠오른다. *"준비된 사람에게 미래는 두려움이 아니라 기대가 된다."*

재무설계는 결국 나다운 삶을 위한 준비다. …(이어서 작성)`,
    'face-counsel': (o) => `# 상담 기록 정리 (초안)

**관련 지시:** ${o}

| 항목 | 내용 |
|---|---|
| 상담 일시 | [날짜] |
| 상담 주제 | 진로 고민, 대인관계 |
| AI 분석 참고 | 인상 특징: 부드러운 눈매, 안정된 표정 (참고용) |
| 대표 해석 | [대표님 작성] |
| 다음 상담 | 2주 후 |

*AI 분석은 참고 자료이며 의학적·심리 진단이 아닙니다. 해석은 상담사가 합니다.*`,
  };
  const generic = (t, e) => `# ${t.title}\n\n**담당:** ${e.emoji} ${e.name} (${e.role})\n\n${t.instructions}\n\n- (체험판 예시 결과물입니다. 실제 앱에서는 이 직원이 지시에 맞춰 직접 작성합니다.)`;
  const resultFor = (t) => {
    const e = db.employees.find((x) => x.id === t.employeeId) || { name: '', role: '', emoji: '' };
    let body = (SAMPLE[t.employeeId] || (() => generic(t, e)))(t.orderText);
    if (t.history.length) body = `> ✏️ 수정 반영 (${t.history.length}차): ${t.history.at(-1).feedback}\n\n${body}`;
    return `> 🧪 체험판 예시 결과물입니다. 실제 앱에서는 AI 직원이 지시 내용에 맞춰 직접 작성합니다.\n\n${body}`;
  };

  // ───────── 체험판 초기 상태 (예시 업무가 들어 있는 상태로 시작) ─────────
  const db = {
    owner: SEED.OWNER,
    employees: structuredClone(SEED.EMPLOYEES),
    knowledge: structuredClone(SEED.KNOWLEDGE),
    orders: [],
    tasks: [],
    briefing: null,
    settings: { autoBriefing: true, briefingTime: '08:00', notifyReview: true, notifyBriefing: true, notifyWeekly: true, minutesPerTask: 40, slideTheme: 'lavender' },
    kakao: { configured: true, connected: true, nickname: '전경숙', redirectUri: 'http://localhost:3000/auth/kakao/callback', lastError: null },
    weeklyReviews: {},
    google: { configured: true, connected: true, email: 'sugishimter@gmail.com', redirectUri: '' },
    loggedIn: true,
    password: null,
  };
  const addOrder = (text, summary, minAgo, assigns) => {
    // assigns: [직원, 제목, 상태]
    const o = { id: uid('o'), text, summary, status: 'assigned', createdAt: ago(minAgo) };
    db.orders.unshift(o);
    for (const [employeeId, title, status] of assigns) {
      const t = { id: uid('t'), orderId: o.id, orderText: text, employeeId, title, instructions: `${title}: 대표 지시에 맞춰 초안 작성`, status, result: '', history: [], error: null, createdAt: ago(minAgo), updatedAt: ago(minAgo - 3) };
      t.result = resultFor(t);
      if (status === 'done') t.approvedAt = ago(minAgo - 5);
      db.tasks.unshift(t);
    }
  };
  // 지난 며칠간 처리한 업무 (주간 보고서 예시용)
  [
    [6, 'sns', '블로그 글: 연금 3층 구조'], [6, 'exam-writer', 'AI 자격증 예상문제 20개'], [5, 'proposal', '아산시 평생학습관 강의 제안서'],
    [5, 'crm', '11월 생일 고객 축하 문자'], [4, 'lecture-planner', '컬러테라피 특강 교안'], [3, 'web', 'gptstore2 수강 신청 공지'],
    [3, 'writer', '칼럼: 돈 이야기는 마음 이야기'], [2, 'fin-analyst', '박OO 고객 보장 분석 요약'], [1, 'face-counsel', '상담 리포트 양식'],
    [1, 'sns', '유튜브 쇼츠 대본 3편'],
  ].forEach(([days, emp, title]) => addOrder(title + ' 해 줘', `${title} 업무를 배정했습니다.`, days * 1440 + 120, [[emp, title, 'done']]));
  db.tasks.find((t) => t.employeeId === 'proposal').history.push({ feedback: '비용 항목을 표로 정리해 줘', result: '', at: ago(5 * 1440) });
  addOrder('충남AIXR 이사회 회의 안내 공문 써 줘', '협회 사무국장 보람에게 공문 작성을 배정했습니다.', 180, [['association', '이사회 안내 공문', 'done']]);
  addOrder(
    '이번 달 은퇴설계 세미나 열자. 커리큘럼, 홍보글, 기존 고객 초대 문자 준비해 줘',
    '세미나 준비를 4개 업무로 나눠 지우, 리아, 하나, 재희에게 배정했습니다.',
    40,
    [
      ['lecture-planner', '세미나 커리큘럼', 'review'],
      ['sns', '세미나 홍보글', 'review'],
      ['crm', '고객 초대 문자 3안', 'review'],
      ['fin-analyst', '은퇴자금 예시 계산표', 'done'],
    ],
  );

  const EVENTS = [
    { title: '천안시청 공무원 AI 활용 특강', start: kst(0, 14, 0), end: kst(0, 16, 0), allDay: false, location: '천안시청 대회의실', link: '' },
    { title: '김OO 고객 은퇴설계 상담', start: kst(0, 17, 30), end: kst(0, 18, 30), allDay: false, location: '재무솔루션연구소', link: '' },
    { title: '충남AIXR 정기 이사회', start: kstDate(1), end: kstDate(2), allDay: true, location: '', link: '' },
    { title: '컬러테라피 힐링 특강', start: kst(1, 10, 0), end: kst(1, 12, 0), allDay: false, location: '아산 평생학습관', link: '' },
  ];
  const count = (s) => db.tasks.filter((t) => t.status === s).length;
  const makeBriefing = () => ({
    text: [
      `☀️ 좋은 아침입니다, ${db.owner.name} 대표님! 오늘은 강의와 상담이 이어지는 바쁜 하루예요.`,
      '',
      '**📅 오늘 일정**',
      '- 오후 2시 천안시청 공무원 AI 활용 특강 (천안시청 대회의실)',
      '- 오후 5시 30분 김OO 고객 은퇴설계 상담 → 재희가 만든 **은퇴자금 계산표**를 미리 보시면 좋아요',
      '',
      `**📊 업무 현황** 결재 대기 ${count('review')}건 · 작업 중 ${count('working')}건 · 완료 ${count('done')}건`,
      '',
      '**✅ 오늘 꼭 처리할 3가지**',
      '1. 은퇴설계 세미나 커리큘럼 결재 (지우)',
      '2. 세미나 홍보글 결재 후 인스타 게시 (리아)',
      '3. 고객 초대 문자 결재 후 발송 (하나)',
      '',
      '**💡 제안** 내일 컬러테라피 특강 홍보가 아직 없어요. 리아에게 카드뉴스를 맡겨 보시겠어요?',
      '',
      '*(체험판 예시 브리핑입니다)*',
    ].join('\n'),
    at: now(),
    kind: db.briefing ? 'manual' : 'auto',
  });
  db.briefing = makeBriefing();
  db.briefing.at = ago(90);

  // ───────── 업무 처리 흉내 ─────────
  const work = (t) => {
    t.status = 'working';
    t.updatedAt = now();
    setTimeout(() => {
      t.result = resultFor(t);
      t.status = 'review';
      t.updatedAt = now();
    }, 1800 + Math.random() * 2500);
  };
  const planOrder = (text) => {
    const scored = db.employees
      .map((e) => ({ e, s: e.keywords.filter((k) => text.toLowerCase().includes(k.toLowerCase())).length }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((x) => x.e);
    return scored.length ? scored : [db.employees.find((e) => e.id === 'proposal') || db.employees[0]];
  };

  const fail = (status, message) => Object.assign(new Error(message), { status });
  const findTask = (id) => db.tasks.find((t) => t.id === id) || (() => { throw fail(404, '업무를 찾을 수 없습니다.'); })();
  const need = (v, f) => { if (typeof v !== 'string' || !v.trim()) throw fail(400, `${f}을(를) 입력해 주세요.`); return v.trim(); };

  const routes = [
    ['GET', /^\/api\/auth\/status$/, () => ({ needsSetup: false, loggedIn: db.loggedIn })],
    ['POST', /^\/api\/auth\/login$/, (b) => {
      if (!b.password || b.password.length < 1) throw fail(401, '비밀번호를 입력해 주세요.');
      db.loggedIn = true;
      return { ok: true };
    }],
    ['POST', /^\/api\/auth\/setup$/, () => ((db.loggedIn = true), { ok: true })],
    ['POST', /^\/api\/auth\/logout$/, () => ((db.loggedIn = false), { ok: true })],
    ['POST', /^\/api\/auth\/password$/, (b) => {
      const err = !b.password || b.password.length < 8 ? '비밀번호는 8자 이상으로 정해 주세요.' : null;
      if (err) throw fail(400, err);
      return { ok: true };
    }],
    ['GET', /^\/api\/state$/, () => ({
      demo: true, owner: db.owner, secretary: SEED.SECRETARY, employees: db.employees, knowledge: db.knowledge,
      orders: db.orders.slice(0, 50), tasks: db.tasks, briefing: db.briefing, settings: db.settings, google: db.google, kakao: db.kakao, themes: THEMES,
    })],
    ['POST', /^\/api\/tasks\/([^/]+)\/slides$/, (b, [id]) => {
      const t = findTask(id);
      const kind = b.kind === 'cards' ? 'cards' : 'ppt';
      const data = sampleSlides(t, kind);
      t.slides = { ...(t.slides || {}), [kind]: { data, at: now() } };
      return { kind, data };
    }],
    ['GET', /^\/api\/report/, (_b, _p, url) => buildReport(Number(new URL(url, 'http://x').searchParams.get('week')) || 0)],
    ['POST', /^\/api\/report\/review$/, (b) => {
      const r = buildReport(Number(b.week) || 0);
      const top = [...r.byEmployee].sort((x, y) => y.done - x.done)[0];
      db.weeklyReviews[r.key] = {
        text: [
          `이번 주 AI 직원들이 **${r.totals.done}건**을 완료해 대표님 시간을 약 **${r.totals.savedHours}시간** 아꼈습니다.`,
          '',
          '**잘된 점**',
          top ? `- ${top.emoji} ${top.name}(${top.role})가 ${top.done}건으로 가장 많이 처리했습니다.` : '- 꾸준히 업무가 처리되었습니다.',
          '- 강의·홍보·고객관리가 고르게 진행되어 세미나 준비가 순조롭습니다.',
          '',
          '**다음 주 제안**',
          '- 제안서 작성자 도윤에게 수정 요청이 있었어요. 업무 지침서에 "비용은 표로 정리"를 추가해 보세요.',
          `- 결재 대기 ${r.totals.review}건을 월요일 오전에 먼저 처리하시면 홍보 일정이 앞당겨집니다.`,
          '',
          '*(체험판 예시 총평입니다)*',
        ].join('\n'),
        at: now(),
      };
      return buildReport(Number(b.week) || 0);
    }],
    ['POST', /^\/api\/kakao\/test$/, () => ({ ok: true })],
    ['POST', /^\/api\/kakao\/disconnect$/, () => Object.assign(db.kakao, { connected: false, nickname: null })],
    ['PUT', /^\/api\/settings$/, (b) => Object.assign(db.settings, b)],
    ['POST', /^\/api\/orders$/, (b) => {
      const text = need(b.text, '지시 내용');
      const o = { id: uid('o'), text, summary: '비서실장이 업무를 나누는 중…', status: 'planning', createdAt: now() };
      db.orders.unshift(o);
      setTimeout(() => {
        const picked = planOrder(text);
        o.summary = `지시를 ${picked.length}개 업무로 나눠 ${picked.map((e) => e.name).join(', ')}에게 배정했습니다.`;
        o.status = 'assigned';
        for (const e of picked) {
          const t = { id: uid('t'), orderId: o.id, orderText: text, employeeId: e.id, title: `${e.role} 업무`, instructions: `대표 지시 "${text}"에 대해 ${e.role} 관점의 결과물 초안 작성`, status: 'working', result: '', history: [], error: null, createdAt: now(), updatedAt: now() };
          db.tasks.unshift(t);
          work(t);
        }
      }, 1200);
      return o;
    }],
    ['POST', /^\/api\/employees\/([^/]+)\/tasks$/, (b, [id]) => {
      const e = db.employees.find((x) => x.id === id);
      const text = need(b.text, '지시 내용');
      const o = { id: uid('o'), text, summary: `${e.name}에게 직접 지시`, status: 'assigned', createdAt: now() };
      const t = { id: uid('t'), orderId: o.id, orderText: text, employeeId: id, title: text.slice(0, 24), instructions: text, status: 'working', result: '', history: [], error: null, createdAt: now(), updatedAt: now() };
      db.orders.unshift(o);
      db.tasks.unshift(t);
      work(t);
      return t;
    }],
    ['POST', /^\/api\/tasks\/([^/]+)\/approve$/, (_b, [id]) => Object.assign(findTask(id), { status: 'done', updatedAt: now() })],
    ['POST', /^\/api\/tasks\/([^/]+)\/revise$/, (b, [id]) => {
      const t = findTask(id);
      t.history.push({ feedback: need(b.feedback, '수정 요청 내용'), result: t.result, at: now() });
      work(t);
      return t;
    }],
    ['POST', /^\/api\/tasks\/([^/]+)\/reject$/, (_b, [id]) => Object.assign(findTask(id), { status: 'rejected', updatedAt: now() })],
    ['POST', /^\/api\/tasks\/([^/]+)\/retry$/, (_b, [id]) => (work(findTask(id)), findTask(id))],
    ['DELETE', /^\/api\/tasks\/([^/]+)$/, (_b, [id]) => { db.tasks = db.tasks.filter((t) => t.id !== id); return { ok: true }; }],
    ['POST', /^\/api\/tasks\/([^/]+)\/gmail-draft$/, (_b, [id]) => { findTask(id).gmailDraftAt = now(); return { id: 'demo', link: 'https://mail.google.com/mail/u/0/#drafts' }; }],
    ['POST', /^\/api\/tasks\/([^/]+)\/drive$/, (_b, [id]) => { findTask(id).driveLink = ''; return { id: 'demo', webViewLink: '' }; }],
    ['GET', /^\/api\/calendar$/, () => ({ connected: db.google.connected, events: db.google.connected ? EVENTS : [] })],
    ['POST', /^\/api\/briefing$/, () => (db.briefing = makeBriefing())],
    ['POST', /^\/api\/google\/disconnect$/, () => Object.assign(db.google, { connected: false, email: null })],
    ['POST', /^\/api\/employees$/, (b) => { const e = { id: uid('e'), ...b, keywords: String(b.keywords || '').split(',').map((k) => k.trim()).filter(Boolean) }; db.employees.push(e); return e; }],
    ['PUT', /^\/api\/employees\/([^/]+)$/, (b, [id]) => Object.assign(db.employees.find((e) => e.id === id), { ...b, keywords: String(b.keywords || '').split(',').map((k) => k.trim()).filter(Boolean) })],
    ['DELETE', /^\/api\/employees\/([^/]+)$/, (_b, [id]) => { db.employees = db.employees.filter((e) => e.id !== id); return { ok: true }; }],
    ['POST', /^\/api\/knowledge$/, (b) => { const k = { id: uid('k'), title: need(b.title, '제목'), content: need(b.content, '내용') }; db.knowledge.push(k); return k; }],
    ['DELETE', /^\/api\/knowledge\/([^/]+)$/, (_b, [id]) => { db.knowledge = db.knowledge.filter((k) => k.id !== id); return { ok: true }; }],
  ];

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  window.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const r = routes.find(([m, re]) => m === method && re.test(url.split('?')[0]));
    await new Promise((res) => setTimeout(res, 120));
    if (!r) return json(404, { error: '없는 주소입니다.' });
    try {
      const body = opts.body ? JSON.parse(opts.body) : {};
      return json(200, structuredClone(await r[2](body, url.match(r[1]).slice(1), url)));
    } catch (err) {
      return json(err.status || 500, { error: err.message });
    }
  };

  // ───────── PPT · 카드뉴스 예시 ─────────
  function sampleSlides(t, kind) {
    const sections = [];
    let cur = null;
    for (const raw of t.result.split('\n')) {
      const line = raw.trim().replace(/\*\*/g, '');
      if (!line || line.startsWith('>') || /^[-|]{3,}/.test(line) || /^\|[\s:|-]+\|$/.test(line)) continue;
      const h = line.match(/^#{1,4}\s+(.*)/);
      if (h) { cur = { title: h[1], bullets: [] }; sections.push(cur); continue; }
      if (!cur) continue;
      const text = line.replace(/^([-*•]|\d+[.)])\s+/, '').replace(/^\|(.*)\|$/, (_, c) => c.split('|').map((x) => x.trim()).filter(Boolean).join(' · '));
      if (text && cur.bullets.length < 5) cur.bullets.push(text.slice(0, 70));
    }
    const filled = sections.filter((x) => x.bullets.length);
    if (kind === 'cards') {
      if (t.employeeId === 'sns') {
        return {
          cards: [
            { headline: '요즘 마음이 무슨 색인가요?', body: '색은 말보다 먼저 마음을 보여 줍니다' },
            { headline: '나에게 맞는 색으로 쉬어 가는 2시간', body: '컬러테라피 힐링 특강에 초대합니다' },
            { headline: '이런 분께 추천해요', body: '지친 직장인 · 쉼이 필요한 엄마 · 나를 알고 싶은 분' },
            { headline: '전경숙 강사와 함께', body: '금융테라피 · 컬러테라피 · AI 활용 강의' },
            { headline: '신청은 프로필 링크에서 🌈', body: '선착순 20명 · 천안' },
          ],
          caption: '오늘 하루, 내 마음의 색을 들여다본 적 있으신가요? 🎨\n함께 쉬어 가는 시간에 초대합니다.\n\n#컬러테라피 #힐링특강 #천안강의 #마음챙김 #나다운삶',
        };
      }
      return { cards: (filled.length ? filled : [{ title: t.title, bullets: [] }]).slice(0, 6).map((x) => ({ headline: x.title.slice(0, 22), body: x.bullets.slice(0, 2).join(' ').slice(0, 70) })), caption: '' };
    }
    return { title: t.title, subtitle: `${db.owner.name} ${db.owner.title}`, slides: filled.map((x) => ({ title: x.title, bullets: x.bullets, notes: '' })) };
  }

  // ───────── 주간 보고서 계산 ─────────
  function buildReport(offset) {
    offset = Math.max(-52, Math.min(0, offset));
    const DAY = 864e5;
    const today = kstDate(0);
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const from = Date.parse(`${today}T00:00:00+09:00`) - ((dow + 6) % 7) * DAY + offset * 7 * DAY;
    const to = from + 7 * DAY;
    const kd = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
    const inRange = (iso) => iso && Date.parse(iso) >= from && Date.parse(iso) < to;
    const per = new Map(db.employees.map((e) => [e.id, { id: e.id, name: e.name, role: e.role, emoji: e.emoji, done: 0, review: 0, rejected: 0, revisions: 0 }]));
    const totals = { orders: db.orders.filter((o) => inRange(o.createdAt)).length, done: 0, review: 0, rejected: 0, revisions: 0 };
    const daily = Array.from({ length: 7 }, (_, i) => ({ date: kd(from + i * DAY), done: 0 }));
    const doneTitles = [];
    for (const t of db.tasks) {
      const e = per.get(t.employeeId);
      const at = t.approvedAt || t.updatedAt;
      if (t.status === 'done' && inRange(at)) { totals.done++; if (e) e.done++; doneTitles.push(t.title); const d = daily.find((x) => x.date === kd(Date.parse(at))); if (d) d.done++; }
      if (offset === 0 && t.status === 'review') { totals.review++; if (e) e.review++; }
      if (t.status === 'rejected' && inRange(t.updatedAt)) { totals.rejected++; if (e) e.rejected++; }
      const rv = t.history.filter((h) => inRange(h.at)).length;
      totals.revisions += rv;
      if (e) e.revisions += rv;
    }
    totals.savedHours = Math.round(((totals.done * db.settings.minutesPerTask) / 60) * 10) / 10;
    const key = kd(from);
    return { key, offset, from: key, to: kd(to - DAY), totals, daily, byEmployee: [...per.values()].filter((e) => e.done || e.review || e.rejected || e.revisions), doneTitles, minutesPerTask: db.settings.minutesPerTask, review: db.weeklyReviews[key] || null };
  }

  // Google 연결 버튼: 실제 Google 대신 연결된 것처럼 보여 줌
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href="/auth/google/start"], a[href="/auth/kakao/start"]');
    if (!a) return;
    ev.preventDefault();
    if (a.getAttribute('href').includes('kakao')) {
      Object.assign(db.kakao, { connected: true, nickname: '전경숙' });
      window.__demoToast?.('✅ (체험판) 카카오톡을 연결했습니다');
    } else {
      Object.assign(db.google, { connected: true, email: 'sugishimter@gmail.com' });
      window.__demoToast?.('✅ (체험판) Google 계정을 연결했습니다');
    }
  }, true);
})();
