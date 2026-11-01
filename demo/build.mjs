// 체험판 만들기: node demo/build.mjs  →  demo/ai-office-demo.html
// 실제 앱 화면(public/)을 그대로 쓰고, 서버 대신 demo/mock.js 가 브라우저 안에서 응답합니다.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const must = (s, a, b) => {
  if (!s.includes(a)) throw new Error(`체험판 빌드 실패: "${a.slice(0, 50)}" 를 찾지 못했습니다`);
  return s.replace(a, b);
};

const seed = await import(path.join(root, 'src/seed.js'));
const { THEMES } = await import(path.join(root, 'src/slides.js'));
const SEED = JSON.stringify({ OWNER: seed.OWNER, SECRETARY: seed.SECRETARY, EMPLOYEES: seed.EMPLOYEES, KNOWLEDGE: seed.KNOWLEDGE });

// ── HTML 본문 ──
const html = read('public/index.html');
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
body = body.replace(/<script[^>]*src="\/app\.js"[^>]*><\/script>/, '');
body = must(body, '<nav class="tabs" id="tabs">', `<div class="demo-banner" role="note">
    <div class="intro">
      <p class="intro-title"><b>1인 창업자를 위한 AI 직원 사무실</b> 체험판</p>
      <p>AI 비서실장과 직원 11명이 업무를 나눠 맡고, 대표는 결재만 합니다. 전경숙 대표의 실제 사무실 구성을 예시로 보여 드립니다.</p>
      <p class="tour"><span>① 아래 보라색 예시를 누르고 <b>[지시하기]</b></span><span>② <b>결재함</b>에서 승인·수정 요청</span><span>③ <b>카드뉴스·PPT</b> 만들기와 <b>주간 보고</b> 보기</span></p>
      <p class="fine">체험판에서는 AI 작성, Google·카카오톡 연결, 파일 저장이 실제로 이루어지지 않고 예시가 표시됩니다. 새로고침하면 처음 상태로 돌아갑니다.</p>
    </div>
    <div class="cta">
      <a href="https://www.aijemu.ai.kr" target="_blank" rel="noopener" class="cta-main">도입·교육 문의</a>
      <a href="https://www.gptstore2.ai.kr" target="_blank" rel="noopener" class="cta-sub">AI 강의 보기</a>
    </div>
  </div>
  <nav class="tabs" id="tabs">`);

// ── CSS: 보기 화면의 라이트/다크 설정을 따르도록 ──
let css = read('public/style.css');
const darkMatch = css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}\s*\}/);
if (!darkMatch) throw new Error('체험판 빌드 실패: 다크 테마 블록을 찾지 못했습니다');
const darkVars = darkMatch[1];
css = css.replace(
  darkMatch[0],
  `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {${darkVars} color-scheme: dark; }\n}\n:root[data-theme="dark"] {${darkVars} color-scheme: dark; }`,
);
css = must(css, ':root {', ':root {\n  --banner-bg: #fff3d6;\n  --banner-fg: #6b4700;');
css = css.replace(/(:root:not\(\[data-theme="light"\]\) \{)/, '$1 --banner-bg: #3a2f14; --banner-fg: #f5d58a;');
css = css.replace(/(:root\[data-theme="dark"\] \{)/, '$1 --banner-bg: #3a2f14; --banner-fg: #f5d58a;');
css += `
body { font-family: 'Noto Sans KR', 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif; }
.demo-banner { background: var(--banner-bg); color: var(--banner-fg); font-size: .88rem; padding-block: 14px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.demo-banner .intro { flex: 1 1 520px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.demo-banner p { margin: 0; }
.demo-banner .intro-title { font-size: 1.02rem; }
.demo-banner .tour { display: flex; flex-wrap: wrap; gap: 4px 14px; }
.demo-banner .fine { font-size: .78rem; opacity: .85; }
.demo-banner .cta { display: flex; gap: 8px; flex-wrap: wrap; }
.demo-banner .cta a { text-decoration: none; font-weight: 700; padding: 9px 16px; border-radius: 10px; white-space: nowrap; }
.demo-banner .cta-main { background: var(--accent); color: #fff; }
.demo-banner .cta-sub { border: 1px solid var(--banner-fg); color: var(--banner-fg); }
.badge.demo { background: var(--banner-bg); color: var(--banner-fg); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`;

// ── JS: 체험판에서 막히는 기능(파일 저장, 확인창) 대체 ──
let js = read('public/app.js');
js = must(
  js,
  'function download(name, content) {',
  "function download(name, content) {\n  return toast('체험판에서는 파일 저장이 되지 않습니다. 실제 앱에서는 .md 파일로 저장됩니다.');",
);
js = must(js, "'Gmail 임시보관함에 저장했습니다'", "'(체험판) 실제 앱에서는 Gmail 임시보관함에 저장됩니다'");
js = must(js, `'Drive "AI 사무실" 폴더에 저장했습니다'`, `'(체험판) 실제 앱에서는 Drive "AI 사무실" 폴더에 저장됩니다'`);
js = must(js, 'async function downloadUrl(url) {', "async function downloadUrl(url) {\n  return toast('체험판에서는 파일을 받을 수 없습니다. 실제 앱에서는 PowerPoint 파일(.pptx)로 저장됩니다.');");
js = must(js, 'function savePng(dataUrl, name) {', "function savePng(dataUrl, name) {\n  return toast('체험판에서는 저장되지 않습니다. 실제 앱에서는 PNG 이미지로 저장됩니다.');");
js = must(js, "'카카오톡을 확인해 보세요'", "'(체험판) 실제 앱에서는 카카오톡으로 테스트 메시지가 갑니다'");
js = must(js, "'🧪 데모 모드: API 키를 넣으면 실제로 일합니다'", "'🧪 체험판'");
js = js.replace(/^export /gm, '');
js += '\nwindow.__demoToast = toast;\n';

const mock = read('demo/mock.js').replace('__SEED__', SEED).replace('__THEMES__', JSON.stringify(THEMES));
// 보기 화면에서는 alert/confirm 창이 뜨지 않으므로 토스트와 '예'로 대체
const shim = `window.alert = (m) => window.__demoToast ? window.__demoToast(m) : console.log(m);\nwindow.confirm = () => true;`;

const out = `<title>나의 AI 사무실</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&display=swap" />
<style>
${css}
</style>
${body}
<script>
${shim}
${mock}
</script>
<script type="module">
${js}
</script>
`;
const dest = path.join(root, 'demo/ai-office-demo.html');
writeFileSync(dest, out);
console.log(`체험판을 만들었습니다 → ${path.relative(root, dest)} (${(out.length / 1024).toFixed(0)} KB)`);
