# @sch0718/app-update

## 0.2.0

### Minor Changes

- [#44](https://github.com/sch0718/sch0718-toolkit-web/pull/44) [`fd635f2`](https://github.com/sch0718/sch0718-toolkit-web/commit/fd635f2e05c5172ba2f50007d0fd7851b656f70d) Thanks [@sch0718](https://github.com/sch0718)! - `@sch0718/app-update`: 자동 새로고침하면 안 되는 순간을 묻는 `canAutoReload` 선택지와, 서비스 워커가 없는 서비스용 `watchVersion`(배포 루트 `version.json`의 id 비교)을 더했습니다. `@sch0718/vite-app`: 빌드마다 앱 버전 id를 `import.meta.env.APP_VERSION`과 `version.json`에 넣는 `appVersion()`을 `@sch0718/vite-app/app-version`으로 더했고, `vite-plugin-pwa`를 선택 peer 의존성으로 바꿨습니다.

## 0.1.0

### Minor Changes

- [#42](https://github.com/sch0718/sch0718-toolkit-web/pull/42) [`f88bb89`](https://github.com/sch0718/sch0718-toolkit-web/commit/f88bb89ed61f0ed9267c3f5a6cd51847c0a86a6f) Thanks [@sch0718](https://github.com/sch0718)! - 새 패키지 `@sch0718/app-update`: 배포 뒤 새 버전을 알아채 접속 직후면 자동으로 새로고침하고 쓰는 중이면 안내만 하는 `watchAppUpdate`, 안 본 릴리스 내용을 고르는 `takeUnseenReleases`. `@sch0718/ui-svelte`에 도움말용 `ReleaseNotes` 컴포넌트를 더했습니다.
