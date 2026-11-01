// 실제 사무실(claude.ai 페이지판) 만들기: node office/build.mjs  →  office/my-office.html
// 앱 화면(public/)은 그대로 쓰고, 서버 대신 office/backend.js 가 claude.ai의 저장(db)·AI(sample)·파일(downloads) 기능으로 동작합니다.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const must = (s, a, b) => {
  if (!s.includes(a)) throw new Error(`사무실 빌드 실패: "${a.slice(0, 60)}" 를 찾지 못했습니다`);
  return s.replace(a, b);
};

const seed = await import(path.join(root, 'src/seed.js'));

// ── HTML: 서버판에만 있는 기능(Google·카카오·비밀번호)은 숨김 ──
const html = read('public/index.html');
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
body = body.replace(/<script[^>]*src="\/app\.js"[^>]*><\/script>/, '');
body = must(body, '  <nav class="tabs" id="tabs">', '  <div id="officeNotice" class="office-notice" role="status" hidden></div>\n  <nav class="tabs" id="tabs">');
body = must(
  body,
  `        <div class="card">
          <div class="row"><h2>📅 오늘·내일 일정</h2><button id="calBtn" class="ghost">새로고침</button></div>
          <div id="calendar" class="muted">불러오는 중…</div>
        </div>`,
  '        <div hidden><button id="calBtn"></button><div id="calendar"></div></div>',
);
body = must(
  body,
  `      <div class="card">
        <h2>🔗 Google 연동</h2>
        <div id="googleBox"></div>
      </div>
      <div class="card">
        <h2>💬 카카오톡 알림</h2>
        <div id="kakaoBox"></div>
      </div>`,
  `      <div hidden><div id="googleBox"></div><div id="kakaoBox"></div></div>
      <div class="card">
        <h2>💾 이 사무실에 대하여</h2>
        <p>업무·직원·지식창고는 이 페이지의 저장 공간에 <b>자동으로 저장</b>되고, 대표님 계정으로만 볼 수 있습니다. AI 직원은 대표님 <b>Claude 계정</b>으로 일합니다(처음 한 번 허용 창이 뜹니다).</p>
        <p class="muted">Google 캘린더·Gmail·Drive 연동, 카카오톡 알림, 사무실을 닫아 둔 동안의 자동 브리핑은 서버판(Render 배포)에서 사용할 수 있습니다. AI 직원은 이 화면이 열려 있는 동안 일하니, 지시한 뒤 결과가 결재함에 올 때까지 창을 닫지 말아 주세요.</p>
      </div>`,
);
body = must(body, '          <label class="switch"><input type="checkbox" id="notifyReview" /> 결과물이 결재함에 도착하면 카톡 알림</label>', '          <label hidden><input type="checkbox" id="notifyReview" /></label>');
body = must(body, '          <label class="switch"><input type="checkbox" id="notifyBriefing" /> 아침 자동 브리핑을 카톡으로 받기</label>', '          <label hidden><input type="checkbox" id="notifyBriefing" /></label>');
body = must(body, '          <label class="switch"><input type="checkbox" id="notifyWeekly" /> 월요일 아침 지난주 업무 보고를 카톡으로 받기</label>', '          <label hidden><input type="checkbox" id="notifyWeekly" /></label>');
body = must(body, '<h2>🔔 알림 · 보고서 · 디자인</h2>', '<h2>📈 보고서 · 디자인</h2>');
body = must(
  body,
  '정한 시간이 되면 비서실장이 <b>캘린더 일정과 업무 현황</b>을 보고 브리핑을 써 둡니다. (앱이 켜져 있어야 동작하고, 켜져 있지 않았다면 다음에 켤 때 바로 만듭니다.)',
  '정한 시간 이후 그날 <b>처음 사무실을 열면</b> 비서실장이 업무 현황을 보고 브리핑을 써 둡니다.',
);
body = must(body, '<div class="card">\n        <h2>🔐 비밀번호 변경</h2>', '<div class="card" hidden>\n        <h2>🔐 비밀번호 변경</h2>');
body = must(body, '<div class="card row">\n        <span class="muted">이 기기에서 로그아웃합니다.</span>', '<div class="card row" hidden>\n        <span class="muted">이 기기에서 로그아웃합니다.</span>');

// ── CSS: 보기 화면의 라이트/다크 설정을 따르도록 ──
let css = read('public/style.css');
const darkMatch = css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}\s*\}/);
if (!darkMatch) throw new Error('사무실 빌드 실패: 다크 테마 블록을 찾지 못했습니다');
css = css.replace(
  darkMatch[0],
  `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {${darkMatch[1]} color-scheme: dark; }\n}\n:root[data-theme="dark"] {${darkMatch[1]} color-scheme: dark; }`,
);
css += `
[hidden] { display: none !important; }
body { font-family: 'Noto Sans KR', 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif; }
.office-notice { background: var(--accent-soft); color: var(--text); font-size: .9rem; padding-block: 10px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`;

// ── JS: 파일 받기는 claude.ai 저장 창으로 ──
let js = read('public/app.js');
js = must(js, 'function download(name, content) {', 'function download(name, content) {\n  return window.__office.save(name, content).catch((e) => toast(e.message));');
js = must(js, 'async function downloadUrl(url) {', 'async function downloadUrl(url) {\n  return window.__office.pptx(url);');
js = must(js, 'function savePng(dataUrl, name) {', 'function savePng(dataUrl, name) {\n  return window.__office.savePng(dataUrl, name).catch((e) => toast(e.message));');
js = must(js, `\${S.google.connected ? '' : '<p class="muted links">⚙️ 설정에서 Google을 연결하면 Gmail 임시보관함·Drive로 바로 보낼 수 있습니다.</p>'}`, '');
js = js.replace(/^export /gm, '');
js += '\nwindow.__officeToast = toast;\nwindow.__officeRefresh = () => refresh();\n';

// ── 슬라이드 만들기 코드 재사용 (브라우저용으로) ──
let slidesSrc = read('src/slides.js');
slidesSrc = must(slidesSrc, "import PptxGenJS from 'pptxgenjs';", '');
slidesSrc = must(slidesSrc, "outputType: 'nodebuffer'", "outputType: 'blob'");
slidesSrc = slidesSrc.replace(/^export /gm, '');

const backend = read('office/backend.js')
  .replace('__SECRETARY__', JSON.stringify(seed.SECRETARY))
  .replace('__SLIDES_SRC__', slidesSrc);
// 보기 화면에서는 alert/confirm 창이 뜨지 않으므로 알림 문구와 '예'로 대체
const shim = `window.alert = (m) => window.__officeToast ? window.__officeToast(m) : console.log(m);\nwindow.confirm = () => true;`;

const out = `<title>전경숙 AI 사무실</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&display=swap" />
<style>
${css}
</style>
${body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js"></script>
<script>
${shim}
${backend}
</script>
<script type="module">
${js}
</script>
`;
const dest = path.join(root, 'office/my-office.html');
writeFileSync(dest, out);
console.log(`사무실을 만들었습니다 → ${path.relative(root, dest)} (${(out.length / 1024).toFixed(0)} KB)`);
