---
'@sch0718/firebase-session': minor
---

카카오·네이버 OIDC 로그인과 공급자 계정 허용 목록을 추가합니다. Worker의 코드 교환·JWKS 검증·세션 전용 인증, 브라우저의 PKCE·state·nonce 리다이렉트 도우미와 세션 API를 제공합니다.

소셜 로그인을 켜는 서비스는 새 `migrations/firebase-session-0002_social_sessions.sql`을 복사해 적용해야 합니다. 기존 Google 로그인은 새 옵션과 마이그레이션 없이 그대로 동작합니다.
