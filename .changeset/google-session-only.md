---
'@sch0718/firebase-session': minor
---

`googleSessionOnly` 옵션을 더했습니다. 켜면 Google 세션의 `identity`에 소문자 이메일을 넣고, ID 토큰 없이 세션만으로 인증합니다(허용 목록·`isAllowed`는 매 요청 확인). 끄면 지금과 같습니다.
