---
'@sch0718/app-update': minor
'@sch0718/vite-app': minor
---

`@sch0718/app-update`: 자동 새로고침하면 안 되는 순간을 묻는 `canAutoReload` 선택지와, 서비스 워커가 없는 서비스용 `watchVersion`(배포 루트 `version.json`의 id 비교)을 더했습니다. `@sch0718/vite-app`: 빌드마다 앱 버전 id를 `import.meta.env.APP_VERSION`과 `version.json`에 넣는 `appVersion()`을 `@sch0718/vite-app/app-version`으로 더했고, `vite-plugin-pwa`를 선택 peer 의존성으로 바꿨습니다.
