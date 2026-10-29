---
'@sch0718/firebase-session': patch
---

토큰 엔드포인트 429를 503 `provider-unavailable`로 분류합니다.
캐시가 없거나 stale 한도를 넘긴 뒤 JWKS 조회가 실패하면 30초 negative cache를 적용합니다.
