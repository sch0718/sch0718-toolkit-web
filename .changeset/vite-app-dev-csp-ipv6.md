---
'@sch0718/vite-app': patch
---

`devCsp` 기본 출처에서 `http://[::1]:*`를 뺐다. IPv6 리터럴은 CSP 출처 문법에 없어 브라우저가 무시하고 콘솔 경고만 냈다.
