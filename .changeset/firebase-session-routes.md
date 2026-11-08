---
'@sch0718/firebase-session': minor
---

Worker 진입점에 세션 API 6개를 처리하는 `handleSessionRoute`와 `SessionRouteOptions`, 소셜 설정을 조립하는 `socialLoginOptions`, redirect 허용 목록을 정리하는 `parseRedirectUris`를 추가합니다. `SessionAuthOptions.social`에 `undefined`를 명시해 넘길 수 있습니다.

로그인 본문의 `redirectUri`에 사용자 이름이나 비밀번호가 있으면 400 `bad-request`로 거절합니다.
