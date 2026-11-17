# 보드

연수와 수업에서 쓰는 Padlet식 보드입니다. 강사가 자료를 카드 순서대로 올리면 수강생은 같은 카드에 과제를 올리고, 막히면 강사에게 도움을 요청합니다.

- 과정 → 강의 → 카드 구조. 카드마다 자료 탭과 과제 탭이 있습니다
- 수강생은 로그인 없이 과정 주소나 QR로 들어와 닉네임만 정하면 됩니다
- 과제는 모둠별 칼럼으로 보이고 댓글과 좋아요를 달 수 있습니다
- 도움 요청은 스크린샷이나 실시간 화면 공유(WebRTC, Cloudflare TURN)로 보냅니다
- 실시간 반영, 발표 모드, 강의 복제, 백업 내려받기, 저장 공간 관리를 지원합니다

용어는 [CONTEXT.md](CONTEXT.md)에, 처음 세운 설계 기록은 [plan.md](plan.md)에 있습니다.

## 구조

Cloudflare Worker 하나가 화면(React SPA)과 API를 함께 내보냅니다. 앱은 항상 `/board/` 아래에서 열리기 때문에 기존 사이트의 경로 하나에 붙이거나 workers.dev 주소에서 단독으로 쓸 수 있습니다.

| 부분 | 사용 기술 |
| --- | --- |
| 화면 | React 19, React Router, TanStack Query, Tailwind CSS 4, Motion |
| 서버 | Hono (Cloudflare Workers) |
| 데이터 | D1 (Drizzle ORM), R2 (파일), Durable Objects (실시간 방, 도움 요청함, 요청 제한) |
| 테스트 | Vitest + `@cloudflare/vitest-plugin`, Playwright |

```
src/       화면
worker/    API, Durable Objects, D1 스키마와 마이그레이션
test/      API 테스트
e2e/       브라우저 테스트
```

## 바깥 서비스에 맞추기

화면 설정은 빌드할 때 `.env`에서 읽습니다. `.env.example`을 `.env`로 복사해 고치면 되고, 모두 비워 두어도 됩니다.

| 변수 | 뜻 | 비웠을 때 |
| --- | --- | --- |
| `VITE_APP_NAME` | 탭 제목과 머리에 나오는 이름 | `보드` |
| `VITE_HOME_URL` | 머리의 이름을 누르면 이동할 바깥 홈 주소 | 링크 없음 |
| `VITE_SHARE_PREFIX` | 링크 복사와 QR에 쓰는 과정 주소 앞부분 (예: `example.com/`) | 이 앱의 실제 주소 (`호스트/board/`) |

**내 도메인에 붙이기**: `wrangler.jsonc`의 `routes` 주석을 풀고 도메인을 바꿉니다. `example.com/board/*`만 이 Worker로 가고, 나머지 경로는 원래 사이트가 그대로 처리합니다.

**짧은 주소 쓰기** (`example.com/과정이름`): 바깥 사이트가 `GET /board/api/shortlink/:slug`를 호출하면 `{ "path": "/board/과정이름" }`이 돌아옵니다. 이 경로로 넘겨 주고, 빌드할 때 `VITE_SHARE_PREFIX=example.com/`을 넣습니다. 이름을 바꾼 과정의 옛 주소도 새 주소로 안내됩니다. 바깥 사이트에서 이미 쓰는 첫 단계 경로는 [worker/lib/slug.ts](worker/lib/slug.ts)의 `RESERVED_SLUGS`에 추가해 과정 이름으로 쓰지 못하게 합니다.

## 로컬 개발

Node 22.18 이상이 필요합니다 (`.ts` 스크립트를 node로 바로 실행합니다).

```sh
npm install
cp .dev.vars.example .dev.vars
node scripts/hash-password.ts "로컬 비밀번호"   # 출력된 두 줄을 .dev.vars에 넣는다
# .dev.vars의 SESSION_SECRET에는 아무 긴 임의 문자열을 넣는다
npm run db:local
npm run dev                                      # http://localhost:5173/board/
```

- 강사 화면은 `/board/admin`입니다.
- 로컬에는 R2 S3 API가 없으므로 `DEV_FILE_PROXY=1`일 때 Worker가 파일을 대신 받습니다. 배포 환경에는 이 값을 넣지 마세요.
- 화면 공유 테스트를 하려면 `TURN_KEY_ID`와 `TURN_KEY_API_TOKEN`이 필요합니다. 나머지 기능은 이 값 없이도 동작합니다.

```sh
npm run typecheck
npm test          # API 테스트
npm run e2e       # 브라우저 테스트 (Chrome 필요, 테스트 비밀번호는 board-dev-1234)
```

## 배포 (Cloudflare)

Cloudflare 계정과 `npx wrangler login`이 필요합니다.

1. D1과 R2를 만듭니다.
   ```sh
   npx wrangler d1 create board-prod
   npx wrangler r2 bucket create board-files-prod
   ```
   출력된 `database_id`를 `wrangler.jsonc`의 `00000000-0000-0000-0000-000000000000` 자리에 넣습니다. 미리보기 환경도 쓰려면 `board-preview`와 `board-files-preview`도 만들고 `...0001` 자리에 넣습니다.
2. 표를 만듭니다: `npx wrangler d1 migrations apply board-prod --remote`
3. R2 버킷의 CORS를 설정합니다. 브라우저가 R2로 파일을 직접 올리기 때문입니다. `origins`에는 앱이 열리는 주소를 넣습니다.
   ```sh
   printf '{"rules":[{"allowed":{"origins":["https://example.com"],"methods":["GET","PUT","HEAD"],"headers":["content-type","if-none-match"]},"maxAgeSeconds":3600}]}' > cors.json
   npx wrangler r2 bucket cors set board-files-prod --file cors.json --force && rm cors.json
   ```
4. 비밀 값을 넣습니다. 각 명령을 실행하면 값을 입력하라고 나옵니다.
   | 이름 | 값 |
   | --- | --- |
   | `ADMIN_PASSWORD_SALT`, `ADMIN_PASSWORD_HASH` | `node scripts/hash-password.ts "강사 비밀번호"` 출력값 |
   | `SESSION_SECRET` | 32바이트 이상 임의 문자열 |
   | `R2_ACCOUNT_ID` | `npx wrangler whoami`에 나오는 Account ID |
   | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 API 토큰 (Object Read & Write, 위 버킷만) |
   | `TURN_KEY_ID`, `TURN_KEY_API_TOKEN` | Cloudflare Realtime TURN 키 (화면 공유용) |
   ```sh
   npx wrangler secret put SESSION_SECRET   # 각 이름마다 반복
   ```
5. 배포합니다: `npm run build && npx wrangler deploy`

운영 중 작업(마이그레이션, 백업과 복구, 오류 확인)은 [docs/operations.md](docs/operations.md)에 정리되어 있습니다.
