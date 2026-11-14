# @sch0718/firebase-session

## 0.6.0

### Minor Changes

- [#38](https://github.com/sch0718/sch0718-toolkit-web/pull/38) [`6c47c08`](https://github.com/sch0718/sch0718-toolkit-web/commit/6c47c08b8f041749f2135438c5dc1f94f7a598eb) Thanks [@sch0718](https://github.com/sch0718)! - 카카오·네이버 로그인 결과에 표시용 이름과 이메일을 제공하고, `socialProfile` 옵션으로 세션에 저장·복원할 수 있게 했습니다. 저장하려면 0003 마이그레이션을 먼저 적용해야 하며 기본 설정에서는 기존 SQL을 유지합니다. 네이버 프로필 조회 실패는 로그인을 막지 않습니다. 카카오 기존 사용자의 추가 동의를 위해 인가 요청에 `scope` 선택 입력을 추가했습니다. 이름과 이메일은 검증되지 않은 표시용으로 권한 판단에는 쓰지 않습니다.
  
  카카오 `unverifiedEmail`은 전에는 소문자화만 했지만 이제 앞뒤 공백을 자르고, 형식(254자 이하, 공백·제어 문자 없음, `@` 하나)이 맞지 않으면 넣지 않습니다.
  
  `VerifiedUser`에 선택 필드 `name`·`unverifiedEmail`이 늘었습니다.

## 0.5.0

### Minor Changes

- [#28](https://github.com/sch0718/sch0718-toolkit-web/pull/28) [`6e90ee5`](https://github.com/sch0718/sch0718-toolkit-web/commit/6e90ee59c80665316d1b11618469e7dd751dd228) Thanks [@sch0718](https://github.com/sch0718)! - Worker 진입점에 세션 API 6개를 처리하는 `handleSessionRoute`와 `SessionRouteOptions`, 소셜 설정을 조립하는 `socialLoginOptions`, redirect 허용 목록을 정리하는 `parseRedirectUris`를 추가합니다. `SessionAuthOptions.social`에 `undefined`를 명시해 넘길 수 있습니다.
  
  로그인 본문의 `redirectUri`에 사용자 이름이나 비밀번호가 있으면 400 `bad-request`로 거절합니다.

- [#31](https://github.com/sch0718/sch0718-toolkit-web/pull/31) [`e2cbf9f`](https://github.com/sch0718/sch0718-toolkit-web/commit/e2cbf9f468b4f11a7c53b7e4b8e9f5471289f26a) Thanks [@sch0718](https://github.com/sch0718)! - 로컬 개발용 카카오·네이버 가짜 공급자와 인가 주소 변환, 시험용 ID 토큰 서명기를 `/testing`으로 내보냅니다. Node 22.16 이상에서 쓰는 SQLite 기반 시험용 D1은 `/testing/d1`으로 나누고, 서비스별 이행 방법과 로컬 요청 연결 조건을 안내합니다.

## 0.4.0

### Minor Changes

- [#26](https://github.com/sch0718/sch0718-toolkit-web/pull/26) [`0671e56`](https://github.com/sch0718/sch0718-toolkit-web/commit/0671e56beaccd37093ad51ed36f2d7ceb4f49ba0) Thanks [@sch0718](https://github.com/sch0718)! - `googleSessionOnly` 옵션을 더했습니다. 켜면 Google 세션의 `identity`에 소문자 이메일을 넣고, ID 토큰 없이 세션만으로 인증합니다(허용 목록·`isAllowed`는 매 요청 확인). 끄면 지금과 같습니다.

## 0.3.0

### Minor Changes

- [#24](https://github.com/sch0718/sch0718-toolkit-web/pull/24) [`84dc344`](https://github.com/sch0718/sch0718-toolkit-web/commit/84dc34446484e81049712cb1a72915bc65ee3415) Thanks [@sch0718](https://github.com/sch0718)! - `createSessionAuth`에 `isAllowed` 옵션을 더했습니다. 고정 목록(`allowedEmails`·`social.allowedAccounts`)에 없는 사용자를 서비스가 판단하고, 세션을 만드는 요청에서는 본문(예: 초대 코드)을 함께 받습니다. 브라우저 `createSession`·`createSocialSession`은 본문에 더할 `extra`를 받습니다. 기존 고정 목록 동작은 그대로입니다.

## 0.2.1

### Patch Changes

- [#19](https://github.com/sch0718/sch0718-toolkit-web/pull/19) [`2fe9944`](https://github.com/sch0718/sch0718-toolkit-web/commit/2fe99443165f259ee8401ace37152db6ab45d128) Thanks [@sch0718](https://github.com/sch0718)! - 토큰 엔드포인트 429를 503 `provider-unavailable`로 분류합니다.
  캐시가 없거나 stale 한도를 넘긴 뒤 JWKS 조회가 실패하면 30초 negative cache를 적용합니다.

## 0.2.0

### Minor Changes

- [#17](https://github.com/sch0718/sch0718-toolkit-web/pull/17) [`6c5a6ba`](https://github.com/sch0718/sch0718-toolkit-web/commit/6c5a6baaf7067bc33383c77cd9a5d79354ddcc35) Thanks [@sch0718](https://github.com/sch0718)! - 카카오·네이버 OIDC 로그인과 공급자 계정 허용 목록을 추가합니다. Worker의 코드 교환·JWKS 검증·세션 전용 인증, 브라우저의 PKCE·state·nonce 리다이렉트 도우미와 세션 API를 제공합니다.
  
  소셜 로그인을 켜는 서비스는 새 `migrations/firebase-session-0002_social_sessions.sql`을 복사해 적용해야 합니다. 기존 Google 로그인은 새 옵션과 마이그레이션 없이 그대로 동작합니다.
  
  nonce는 PKCE verifier에서 SHA-256으로 파생하며 세션 생성 본문에는 보내지 않습니다. 소셜 사용자의 `email`은 빈 문자열이고, 토큰 이메일은 생성 응답의 `unverifiedEmail`로만 제공합니다. 공급자 설정의 `redirectUris`로 콜백 주소를 정확히 제한할 수 있습니다.
  
  `SessionAuth`·`SessionClient` 인터페이스를 직접 구현(목·래퍼)하는 코드는 새 필수 메서드 `createSocial`·`createSocialSession`을 추가해야 합니다.

## 0.1.0

### Minor Changes

- [#12](https://github.com/sch0718/sch0718-toolkit-web/pull/12) [`2c44f23`](https://github.com/sch0718/sch0718-toolkit-web/commit/2c44f23707358a7d1e819bb9ac8027163066d73c) Thanks [@sch0718](https://github.com/sch0718)! - 첫 버전. 가즈아의 Firebase ID 토큰 검증·이메일 허용 목록·D1 기기 세션(`/worker`), 로그인·세션 API 클라이언트(`/client`), 로그인 도우미·CSP Vite 플러그인(`/vite`)을 옮겼다. users·sessions 마이그레이션 SQL을 함께 배포한다.
