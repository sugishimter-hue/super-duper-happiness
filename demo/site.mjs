// 체험판을 일반 웹사이트로 만들기 (GitHub Pages용): node demo/site.mjs  →  docs/index.html
// claude.ai 로그인 없이 누구나 열 수 있습니다. 먼저 node demo/build.mjs 로 체험판을 만든 뒤 실행하세요.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = process.env.SITE_URL || 'https://sugishimter-hue.github.io/super-duper-happiness/';
const demo = readFileSync(path.join(root, 'demo/ai-office-demo.html'), 'utf8');
const title = '1인 창업자를 위한 AI 직원 사무실 · 체험판';
const desc = 'AI 비서실장과 직원 6명이 업무를 나눠 맡고, 대표는 결재만 합니다. 설치·로그인 없이 바로 체험해 보세요.';

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="description" content="${desc}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:url" content="${SITE_URL}" />
<meta property="og:image" content="${SITE_URL}og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#8a5cf6" />
<link rel="icon" href="icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="apple-touch-icon.png" />
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${demo.replace('<title>나의 AI 사무실</title>', `<title>${title}</title>`)}
</body>
</html>
`;
const out = path.join(root, 'docs');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'index.html'), html);
writeFileSync(path.join(out, '.nojekyll'), '');
for (const f of ['icon.svg', 'apple-touch-icon.png']) copyFileSync(path.join(root, 'public', f), path.join(out, f));
if (!existsSync(path.join(out, 'og.png'))) console.log('⚠️  docs/og.png (공유 미리보기 이미지)가 없습니다.');
console.log(`웹사이트를 만들었습니다 → docs/index.html (${(html.length / 1024).toFixed(0)} KB) · 주소: ${SITE_URL}`);
