# @sch0718/vite-app

## 0.1.1

### Patch Changes

- [#30](https://github.com/sch0718/sch0718-toolkit-web/pull/30) [`23bc07d`](https://github.com/sch0718/sch0718-toolkit-web/commit/23bc07d7013b0e9788ee84821ea93c27ca14f46d) Thanks [@sch0718](https://github.com/sch0718)! - `devCsp` 기본 출처에서 `http://[::1]:*`를 뺐다. IPv6 리터럴은 CSP 출처 문법에 없어 브라우저가 무시하고 콘솔 경고만 냈다.

## 0.1.0

### Minor Changes

- [#12](https://github.com/sch0718/sch0718-toolkit-web/pull/12) [`2c44f23`](https://github.com/sch0718/sch0718-toolkit-web/commit/2c44f23707358a7d1e819bb9ac8027163066d73c) Thanks [@sch0718](https://github.com/sch0718)! - 첫 버전. 가즈아의 PWA 설정을 `createPwaOptions()` 팩토리로, 개발 서버 CSP 완화를 `devCsp()` 플러그인으로 옮겼다.
