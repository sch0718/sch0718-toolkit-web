# @sch0718/firebase-session

## 0.2.0

### Minor Changes

- [#17](https://github.com/sch0718/sch0718-toolkit-web/pull/17) [`6c5a6ba`](https://github.com/sch0718/sch0718-toolkit-web/commit/6c5a6baaf7067bc33383c77cd9a5d79354ddcc35) Thanks [@sch0718](https://github.com/sch0718)! - 카카오·네이버 OIDC 로그인과 공급자 계정 허용 목록을 추가합니다. Worker의 코드 교환·JWKS 검증·세션 전용 인증, 브라우저의 PKCE·state·nonce 리다이렉트 도우미와 세션 API를 제공합니다.
  
  소셜 로그인을 켜는 서비스는 새 `migrations/firebase-session-0002_social_sessions.sql`을 복사해 적용해야 합니다. 기존 Google 로그인은 새 옵션과 마이그레이션 없이 그대로 동작합니다.
  
  nonce는 PKCE verifier에서 SHA-256으로 파생하며 세션 생성 본문에는 보내지 않습니다. 소셜 사용자의 `email`은 빈 문자열이고, 토큰 이메일은 생성 응답의 `unverifiedEmail`로만 제공합니다. 공급자 설정의 `redirectUris`로 콜백 주소를 정확히 제한할 수 있습니다.
  
  `SessionAuth`·`SessionClient` 인터페이스를 직접 구현(목·래퍼)하는 코드는 새 필수 메서드 `createSocial`·`createSocialSession`을 추가해야 합니다.

## 0.1.0

### Minor Changes

- [#12](https://github.com/sch0718/sch0718-toolkit-web/pull/12) [`2c44f23`](https://github.com/sch0718/sch0718-toolkit-web/commit/2c44f23707358a7d1e819bb9ac8027163066d73c) Thanks [@sch0718](https://github.com/sch0718)! - 첫 버전. 가즈아의 Firebase ID 토큰 검증·이메일 허용 목록·D1 기기 세션(`/worker`), 로그인·세션 API 클라이언트(`/client`), 로그인 도우미·CSP Vite 플러그인(`/vite`)을 옮겼다. users·sessions 마이그레이션 SQL을 함께 배포한다.
