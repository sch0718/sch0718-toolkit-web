# @sch0718/license-notices

앱이 쓰는 운영 의존성(과 번들에 들어가는 devDependencies)의 라이선스 전문을 모아 하나의 고지 파일로 만듭니다. 번들러가 라이선스 주석을 지우므로 MIT·BSD·Apache의 고지 의무를 이 파일로 지킵니다. `pnpm licenses list`를 쓰므로 pnpm 프로젝트에서만 동작합니다.

```js
// scripts/build-notices.mjs
import { fileURLToPath } from 'node:url';
import { writeNotices } from '@sch0718/license-notices';

const { count } = writeNotices({
  out: fileURLToPath(new URL('../public/licenses.txt', import.meta.url)),
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  appName: '가즈아',
  licenseUrl: 'https://github.com/sch0718/gazua/blob/main/LICENSE',
  upstreamDir: fileURLToPath(new URL('./licenses/', import.meta.url)),
  upstream: (name) =>
    name === 'firebase' || name.startsWith('@firebase/') ? 'firebase.txt' : null,
  bundledDev: (name) => name === 'svelte' || /^workbox-(?!build$)/.test(name),
});
console.log(`licenses.txt: 패키지 ${count}개`);
```

- 패키지 폴더(없으면 `dist/`)의 `LICENSE*`, `COPYING*`, `NOTICE*` 파일을 싣습니다.
- 배포본에 라이선스 파일이 없는 패키지는 `upstreamDir`에 둔 원문을 싣습니다. 같은 원문은 한 번만 싣습니다. 원문을 찾지 못하면 멈춥니다.
- 임시 파일에 쓴 뒤 이름을 바꿉니다.

라이선스: [PolyForm Noncommercial 1.0.0](./LICENSE)
