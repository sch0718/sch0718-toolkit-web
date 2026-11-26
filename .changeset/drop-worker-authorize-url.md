---
'@sch0718/firebase-session': patch
---

`/worker`의 `SOCIAL_PROVIDERS`에서 쓰지 않던 `authorizeUrl`을 뺀다. 인가 주소는 `/client`의 `socialAuthorizeUrl()`이 만든다.
