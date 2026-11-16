# @sch0718/vite-app

## 0.2.0

### Minor Changes

- [#44](https://github.com/sch0718/sch0718-toolkit-web/pull/44) [`fd635f2`](https://github.com/sch0718/sch0718-toolkit-web/commit/fd635f2e05c5172ba2f50007d0fd7851b656f70d) Thanks [@sch0718](https://github.com/sch0718)! - `@sch0718/app-update`: 자동 새로고침하면 안 되는 순간을 묻는 `canAutoReload` 선택지와, 서비스 워커가 없는 서비스용 `watchVersion`(배포 루트 `version.json`의 id 비교)을 더했습니다. `@sch0718/vite-app`: 빌드마다 앱 버전 id를 `import.meta.env.APP_VERSION`과 `version.json`에 넣는 `appVersion()`을 `@sch0718/vite-app/app-version`으로 더했고, `vite-plugin-pwa`를 선택 peer 의존성으로 바꿨습니다.

## 0.1.1

### Patch Changes

- [#30](https://github.com/sch0718/sch0718-toolkit-web/pull/30) [`23bc07d`](https://github.com/sch0718/sch0718-toolkit-web/commit/23bc07d7013b0e9788ee84821ea93c27ca14f46d) Thanks [@sch0718](https://github.com/sch0718)! - `devCsp` 기본 출처에서 `http://[::1]:*`를 뺐다. IPv6 리터럴은 CSP 출처 문법에 없어 브라우저가 무시하고 콘솔 경고만 냈다.

## 0.1.0

### Minor Changes

- [#12](https://github.com/sch0718/sch0718-toolkit-web/pull/12) [`2c44f23`](https://github.com/sch0718/sch0718-toolkit-web/commit/2c44f23707358a7d1e819bb9ac8027163066d73c) Thanks [@sch0718](https://github.com/sch0718)! - 첫 버전. 가즈아의 PWA 설정을 `createPwaOptions()` 팩토리로, 개발 서버 CSP 완화를 `devCsp()` 플러그인으로 옮겼다.
