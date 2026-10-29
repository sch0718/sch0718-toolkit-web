---
'@sch0718/firebase-session': minor
---

카카오·네이버 OIDC 로그인과 공급자 계정 허용 목록을 추가합니다. Worker의 코드 교환·JWKS 검증·세션 전용 인증, 브라우저의 PKCE·state·nonce 리다이렉트 도우미와 세션 API를 제공합니다.

소셜 로그인을 켜는 서비스는 새 `migrations/firebase-session-0002_social_sessions.sql`을 복사해 적용해야 합니다. 기존 Google 로그인은 새 옵션과 마이그레이션 없이 그대로 동작합니다.

nonce는 PKCE verifier에서 SHA-256으로 파생하며 세션 생성 본문에는 보내지 않습니다. 소셜 사용자의 `email`은 빈 문자열이고, 토큰 이메일은 생성 응답의 `unverifiedEmail`로만 제공합니다. 공급자 설정의 `redirectUris`로 콜백 주소를 정확히 제한할 수 있습니다.

`SessionAuth`·`SessionClient` 인터페이스를 직접 구현(목·래퍼)하는 코드는 새 필수 메서드 `createSocial`·`createSocialSession`을 추가해야 합니다.
