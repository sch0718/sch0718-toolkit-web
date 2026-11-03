---
'@sch0718/firebase-session': minor
---

`createSessionAuth`에 `isAllowed` 옵션을 더했습니다. 고정 목록(`allowedEmails`·`social.allowedAccounts`)에 없는 사용자를 서비스가 판단하고, 세션을 만드는 요청에서는 본문(예: 초대 코드)을 함께 받습니다. 브라우저 `createSession`·`createSocialSession`은 본문에 더할 `extra`를 받습니다. 기존 고정 목록 동작은 그대로입니다.
