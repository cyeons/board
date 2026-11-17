# 보드 운영 안내

처음 배포는 README를 따른다. 이 문서는 그 뒤의 일상 작업을 적는다.

## 배포

- `npm run build && npx wrangler deploy`: 실제 주소
- `npm run build && npx wrangler preview --name staging`: 미리보기
- 스키마를 바꿨으면 배포 전에 마이그레이션을 먼저 적용한다.

```sh
npm run db:generate
npx wrangler d1 migrations apply board-preview --remote --config wrangler.preview-migrations.jsonc
npx wrangler d1 migrations apply board-prod --remote
```

되돌릴 수 없는 변경(열 삭제)은 두 번의 배포로 나눈다.

### R2 올리기 설정

- 올리기 주소에 `If-None-Match: *`를 서명해 넣는다. 한 번 올린 파일은 같은 주소로 덮어쓸 수 없다. 그래서 버킷 CORS가 `if-none-match` 헤더를 허용해야 한다. 허용하지 않으면 브라우저 업로드가 CORS 오류로 실패한다.
- 비밀 설정 `R2_ACCOUNT_ID`가 비어 있으면 올리기 주소를 만들지 못해 업로드가 500 오류로 실패한다. 값은 `npx wrangler whoami`의 Account ID다.

```sh
# 버킷 CORS. origins에는 앱이 열리는 주소를 넣는다
printf '{"rules":[{"allowed":{"origins":["https://example.com"],"methods":["GET","PUT","HEAD"],"headers":["content-type","if-none-match"]},"maxAgeSeconds":3600}]}' > cors.json
npx wrangler r2 bucket cors set board-files-prod --file cors.json --force
rm cors.json
# 계정 ID 비밀 설정 (물으면 Account ID를 붙여넣는다)
npx wrangler secret put R2_ACCOUNT_ID
```

## 수업 전 점검

1. 관리자 홈에서 남은 용량 확인
2. 강의 공개 여부와 카드 숨김 상태 확인
3. 수강생으로 보기로 화면 확인
4. 입장 QR 띄우기
5. 시작 누르기

## 백업과 복구

- **데이터**: 과정 관리 화면의 데이터 백업 내려받기 (JSON 파일 하나)
- **파일**: 과정 관리 화면의 강의별 zip으로 내려받기
- **D1 Time Travel**: 무료 요금제는 지난 7일까지 되돌릴 수 있다. 되돌리면 그 시점 이후의 쓰기가 사라지므로, 먼저 미리보기 DB로 실습한다.

```sh
# 되돌릴 시점의 책갈피 확인
npx wrangler d1 time-travel info board-preview --timestamp "2026-11-01T09:00:00+09:00" --config wrangler.preview-migrations.jsonc
# 그 시점으로 되돌리기 (되돌릴 수 없으니 시각을 다시 확인한다)
npx wrangler d1 time-travel restore board-preview --timestamp "2026-11-01T09:00:00+09:00" --config wrangler.preview-migrations.jsonc
```

실제 DB는 같은 명령에서 이름을 `board-prod`로 바꾸고 `--config`를 뺀다.

## 오류 확인

Cloudflare 대시보드 Workers Logs에서 찾는다. 무료 요금제는 3일 보관, 하루 20만 건이다. 요청마다 경로, 상태 코드, 소요 시간, 과정 ID, KST 시각이 남고, 브라우저 오류는 `client error`로 남는다.

## 사용량 알림

Cloudflare 대시보드의 Notifications에서 Workers, D1, R2 사용량 알림을 켜 둔다. 서버는 R2 합계 9GB에서 업로드를 거절한다.

## 배포 후 점검표

로컬에서 확인할 수 없는 항목이라 실제 환경에서 한 번씩 확인한다.

- [ ] 같은 IP에서 1분에 121번째 입장이 429로 막힌다
- [ ] 브라우저에서 R2로 바로 올리기가 된다 (CORS, 100MB 파일, 확인 뒤 덮어쓰기는 412)
- [ ] 한글 이름 파일이 원래 이름으로 내려받아진다
- [ ] 강사 로그인 한 번의 CPU 시간이 10ms 안이다 (PBKDF2 2만 회)
- [ ] 자정 자동 종료 Cron이 실제로 돈다 (다음 날 Workers Logs 확인)
- [ ] TURN 응답에 TLS 443 주소가 있고, 학교와 휴대폰 핫스팟에서 화면 공유가 연결된다
