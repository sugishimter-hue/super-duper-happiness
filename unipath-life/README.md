# 유니패스 라이프 (Unipath Life) — Cloudflare 배포판

노후설계 · 간병 준비 · 연금 점검 상담을 받는 사이트와, 접수 내역을 관리하는 관리자 화면입니다.
ChatGPT 사이트(`unipath-life-connect.remugin.chatgpt.site`)에서 만든 v4를 **Cloudflare Workers + D1**에서 독립적으로 돌아가도록 고쳤습니다.

## 원본에서 바뀐 점

| 항목 | 원본(ChatGPT 사이트) | 배포판 |
|---|---|---|
| 방문자 접속 | ChatGPT 로그인 필요 | **누구나 바로 접속** |
| 관리자 로그인 | ChatGPT 계정 | **관리자 비밀번호** (5번 틀리면 15분 잠금, 12시간 로그인 유지) |
| 데이터베이스 | OpenAI 쪽에서 자동 연결 | **Cloudflare D1** (`wrangler.jsonc`) |
| 빌드 설정 | OpenAI 전용 스크립트·플러그인 | 일반 `npm` + `wrangler` |
| 검색 노출 | 제목·설명만 | 키워드, 공유 미리보기(OG), `robots.txt`(관리자 화면은 검색 제외) |
| 모바일 | — | 화면 오른쪽 아래 **전화 상담 버튼** |
| 하단 | — | AI 재무 플랫폼 · AI글로벌유니패스아카데미 링크, 저작권 표시 |

상담 신청 폼, 생활비 계산기, 개인정보 처리방침, 관리자 화면(접수 관리 · 운영 설정)은 원본 그대로입니다.

## 화면 주소

- `/` 홈페이지 (상담 신청, 상담사 참여 신청)
- `/admin` 상담 운영 관리 → 로그인 안 되어 있으면 `/admin/login`으로 이동

---

## 처음 배포하기 (한 번만)

준비물: [Cloudflare 계정](https://dash.cloudflare.com/sign-up)(무료), Node.js 22 이상

### 1. 설치하고 Cloudflare에 로그인

```bash
cd unipath-life
npm install
npx wrangler login
```

브라우저가 열리면 Cloudflare 계정으로 허용을 누르세요.

### 2. 데이터베이스(D1) 만들기

```bash
npx wrangler d1 create unipath-life-db
```

출력에 나오는 `database_id` 값을 복사해서 `wrangler.jsonc`의
`"database_id": "00000000-0000-4000-8000-000000000000"` 자리에 붙여 넣습니다.

### 3. 관리자 비밀번호 등록 (비밀값)

```bash
npx wrangler secret put ADMIN_PASSWORD
```

관리자 화면에서 쓸 비밀번호를 입력합니다 (8자 이상).

```bash
npx wrangler secret put SESSION_SECRET
```

로그인 유지용 서명 키입니다. 아무도 모르는 32자 이상 임의 문자열을 넣으세요.
아래 명령으로 만들어 복사하면 편합니다.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> 처음 배포 전이라 `secret put`이 Worker를 먼저 만들지 물어보면 **Yes**를 고르세요.

### 4. 배포

```bash
npm run deploy
```

데이터베이스 표를 만들고(마이그레이션) → 빌드하고 → Cloudflare에 올립니다.
끝나면 `https://unipath-life.<계정이름>.workers.dev` 주소가 나옵니다.

### 5. 내 도메인 연결 (선택)

Cloudflare 대시보드 → **Workers & Pages** → `unipath-life` → **Settings → Domains & Routes → Add → Custom domain**
에서 `life.aijemu.ai.kr` 같은 주소를 넣으면 됩니다. (도메인 DNS가 Cloudflare에 등록되어 있어야 합니다.)

---

## 수정 후 다시 배포

```bash
npm run deploy
```

### GitHub에 올리면 자동 배포되게 하기 (선택)

Cloudflare 대시보드 → **Workers & Pages** → `unipath-life` → **Settings → Build → Connect** 에서 이 GitHub 저장소를 연결하고:

- **Root directory**: `unipath-life`
- **Build command**: `npm run build`
- **Deploy command**: `npx wrangler deploy`

데이터베이스 구조를 바꾼 경우(`drizzle/` 폴더에 SQL 추가)에는 한 번 `npm run db:migrate:remote`를 실행하세요.

---

## 내 컴퓨터에서 미리 보기

```bash
cp .env.example .dev.vars
npm run db:migrate:local
npm run dev
```

`http://localhost:5173` 에서 확인합니다. 관리자 비밀번호는 `.dev.vars`에 적은 값입니다.

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `app/page.tsx`, `app/portal.tsx` | 홈페이지 화면과 문구 |
| `app/admin/` | 관리자 화면, 로그인 화면 |
| `app/api/requests` | 상담 신청 저장 |
| `app/api/admin` | 접수 조회·수정·삭제, 운영 설정 |
| `app/api/auth` | 관리자 로그인·로그아웃 |
| `lib/auth.ts` | 비밀번호 확인, 로그인 쿠키 |
| `drizzle/*.sql` | 데이터베이스 표 만들기 |
| `wrangler.jsonc` | Cloudflare 설정 (Worker 이름, D1 연결) |

## 공개 운영 전에 확인할 것

관리자 화면 하단 안내와 같습니다.

1. 상담 가격 · 제공 범위 · 환불 기준 확정
2. 상담사 제휴 계약 및 자격 검토
3. 개인정보 처리방침의 위탁 · 국외이전 고지 확정 (Cloudflare 이용)
4. 결제 · 문자 알림 연동이 필요하면 추가
