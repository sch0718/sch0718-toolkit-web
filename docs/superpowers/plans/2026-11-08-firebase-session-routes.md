# firebase-session 세션 라우트·소셜 설정 도우미 구현 계획

설계: [2026-11-08-firebase-session-routes-design.md](../specs/2026-11-08-firebase-session-routes-design.md). 모든 경로는 `packages/firebase-session/` 기준이다. 구현은 Codex CLI가 하고, 각 단계는 시험을 먼저 쓴다.

## 1. 소셜 설정 도우미 (`src/worker/social.ts`)

- `isRedirectUri(s: string): boolean`(내보내지 않음): 설계 3.3 규칙.
- `readBody()`의 redirect 검사를 `isRedirectUri()`로 바꾼다(2048자·`#`·파싱·https/localhost 검사를 옮기고 사용자 정보 거부를 더함).
- `parseRedirectUris()`, `socialLoginOptions()`를 더한다(설계 3.1·3.2).
- 시험(`src/worker/social.test.ts`에 더함):
  - `parseRedirectUris`: 콤마 문자열·배열(배열도 항목마다 trim), 공백·빈 값, 중복, 원문 유지(`https://a.test`가 `https://a.test/`로 바뀌지 않음), `#`, 사용자 이름, 비밀번호, `http://example.test`, `http://localhost:5173/cb` 허용, 잘못된 URL, 2049자, `undefined` → `[]`
  - `socialLoginOptions`: 둘 다 없음 → `undefined`, 카카오 ID만(시크릿 없음 → `clientSecret` 키 없음), 카카오 ID 공백만 → 꺼짐, 네이버 ID만 → 꺼짐, 네이버 둘 다 → 켜짐, 값 trim, `redirectUris`가 두 공급자에 같게 들어감, `fetch` 있을 때만 키가 있음
  - `exchangeSocial`: 본문 `redirectUri`에 `user:pass@`가 있으면 400 `bad-request`이고 fetch를 부르지 않음

## 2. `SessionAuthOptions.social` 타입 (`src/worker/session.ts`)

- `social?: SocialLoginOptions | undefined`로 넓힌다. 코드 동작은 그대로(`o.social` 참·거짓만 본다).
- 시험: 타입만 바뀌므로 `pnpm typecheck`로 확인한다.

## 3. 라우트 처리기 (`src/worker/routes.ts` 새 파일)

- `handleSessionRoute()`, `SessionRouteOptions`(설계 2.1). `SESSION_PATHS`를 써서 경로를 맞춘다.
- 시험(`src/worker/routes.test.ts` 새 파일): `test/d1.ts`·`test/tokens.ts`·`test/social.ts`로 실제 `createSessionAuth`를 만든다.
  - 6개 경로 성공(상태 200, 본문 모양, `Cache-Control: no-store`)
  - 세션 경로 밖(`/v1/other`, `/v1/session/`, `/v1/sessions/a/b`) → `null`, 같은 경로 다른 메서드 → 405 `method`
  - `path` 옵션으로 접두어를 뗀 경로를 맞춤
  - `DELETE /v1/sessions`: 쿼리 없음·`others=0`·`others=1&x=1` → 400 `bad-request`, 세션이 철회되지 않음
  - `DELETE /v1/sessions/%E0%A4%A` → 404 `not-found`
  - 인증 실패(세션 헤더 없음) → 401, 이때 `onRevoke`를 부르지 않음
  - `onRoute` 패턴 값, `beforeCreate`가 본문을 읽기 전에 불리고 `HttpError`를 던지면 그 응답, `onRevoke` 인자(대상·`revoked` 수)
  - 오류 변환: `CertsUnavailableError` → 503, 일반 `Error` → 500과 `log`의 `internal <이름>`, `Error`가 아닌 값 → `internal error`, `@sch0718/firebase-session:` 문구 → 500과 그 문구
- `src/worker/index.ts`에 `handleSessionRoute`, `type SessionRouteOptions`, `parseRedirectUris`, `socialLoginOptions`를 더한다.

## 4. 문서·기록

- `README.md`의 Worker 절만 고친다: 라우터 예시를 `handleSessionRoute`로, 소셜 예시를 `socialLoginOptions`로, 상태 코드 결정 한 줄. 개발·시험 절은 건드리지 않는다.
- `.changeset/<이름>.md`: `@sch0718/firebase-session` minor. 새 API와 동작 변화(본문 redirect 사용자 정보 거부).
- `.size-limit.json`의 worker 항목 import에 `handleSessionRoute`·`socialLoginOptions`를 더한다. 한도(4.1 kB)를 넘으면 실제 크기에 맞춰 올리고 PR에 적는다.

## 5. 검증

1. `pnpm vitest run packages/firebase-session` — 새 시험과 기존 시험 통과
2. `pnpm run verify`
3. `pnpm compat`(빌드 뒤)
4. 병합 직전 `origin/main`에 rebase하고 1~3을 다시 돈다.
