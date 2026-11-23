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

## 배포하기 — 클릭만으로 (명령어 필요 없음)

데이터베이스(D1)는 첫 배포 때 자동으로 만들어지고, 표도 사이트가 처음 쓰일 때 자동으로 생깁니다.

### 1. GitHub 저장소 연결

1. [dash.cloudflare.com](https://dash.cloudflare.com) 로그인 → 왼쪽 메뉴 **Workers & Pages** (또는 **Compute → Workers & Pages**)
2. **Create** (애플리케이션 만들기) → **Import a repository** (Git 저장소 가져오기)
3. GitHub 연결 → 저장소 `super-duper-happiness` 선택
4. 설정 화면에서 이렇게 입력합니다.

| 항목 | 값 |
|---|---|
| Project name | `unipath-life` |
| Production branch | `claude/quirky-planck-gedxfe` (나중에 main 에 합치면 `main`) |
| Root directory (Advanced settings 안) | `unipath-life` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

5. **Deploy** 를 누르면 2~3분 뒤 `https://unipath-life.<계정이름>.workers.dev` 주소가 생깁니다.

### 2. 관리자 비밀번호 등록

배포된 `unipath-life` → **Settings → Variables and Secrets → Add** 에서 **Type: Secret** 으로 두 개를 추가합니다.

| 이름 | 값 |
|---|---|
| `ADMIN_PASSWORD` | 관리자 화면 비밀번호 (8자 이상) |
| `SESSION_SECRET` | 아무도 모르는 32자 이상 임의 문자열 (영문·숫자 마구 섞어서) |

저장하면 바로 적용됩니다. 이제 `주소/admin` 에서 로그인할 수 있습니다.

### 3. 기존 홈페이지에 연결

배포 주소를 기존 홈페이지 메뉴나 버튼 링크로 넣으면 됩니다. 예시:

```html
<a href="https://unipath-life.<계정이름>.workers.dev" target="_blank" rel="noopener">노후·간병·연금 상담 신청</a>
```

이후 GitHub 에 코드를 올리면 자동으로 다시 배포됩니다.

### (선택) 명령어로 배포

```bash
cd unipath-life && npm install && npx wrangler login && npm run deploy
```

비밀번호는 `npx wrangler secret put ADMIN_PASSWORD`, `npx wrangler secret put SESSION_SECRET` 로 등록합니다.

---

## 내 컴퓨터에서 미리 보기

```bash
cp .env.example .dev.vars
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
| `drizzle/*.sql` | 데이터베이스 표 구조 (사이트가 `lib/server.ts` 에서 자동으로 만듦) |
| `wrangler.jsonc` | Cloudflare 설정 (Worker 이름, D1 자동 생성) |

## 공개 운영 전에 확인할 것

관리자 화면 하단 안내와 같습니다.

1. 상담 가격 · 제공 범위 · 환불 기준 확정
2. 상담사 제휴 계약 및 자격 검토
3. 개인정보 처리방침의 위탁 · 국외이전 고지 확정 (Cloudflare 이용)
4. 결제 · 문자 알림 연동이 필요하면 추가
