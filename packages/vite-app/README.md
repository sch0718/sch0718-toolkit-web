# @sch0718/vite-app

서비스마다 되풀이되는 Vite 설정을 모았습니다. PWA 옵션 팩토리(`createPwaOptions`)와 개발 서버 전용 CSP 완화 플러그인(`devCsp`)입니다. `vite`와 `vite-plugin-pwa`는 peer 의존성이라 서비스가 직접 설치합니다.

## PWA 옵션

```ts
// vite.config.ts
import { createPwaOptions } from '@sch0718/vite-app';
import { VitePWA } from 'vite-plugin-pwa';

const pwaOptions = createPwaOptions({
  manifest: {
    name: '가즈아',
    short_name: '가즈아',
    description: '관심종목을 한 차트에 나란히 놓고 비교해요',
    theme_color: '#5b47e0',
    background_color: '#f6f7f9',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  cachePrefix: 'gazua',
  globIgnores: ['help/**', '__/**'],
  navigateFallbackDenylist: [/^\/__\//],
  runtimeCaching: [
    {
      urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('/universe.json'),
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'gazua-universe' },
    },
  ],
});

export default { plugins: [VitePWA(pwaOptions)] };
```

공통 기본값은 다음과 같습니다.

- `registerType: 'autoUpdate'`, `injectRegister: 'script'`. CSP가 `script-src 'self'`여도 되도록 인라인 스크립트 대신 같은 출처의 `registerSW.js`로 등록합니다.
- `skipWaiting`, `clientsClaim`을 켜서 새 버전이 바로 활성화됩니다.
- 매니페스트 기본값은 `lang: 'ko'`, `start_url: './'`, `scope: './'`, `display: 'standalone'`입니다. `manifest`에 같은 키를 주면 덮어씁니다.
- 앱 셸(`PWA_GLOB_PATTERNS`: html·js·css·svg·png·webmanifest)만 미리 담습니다. 뺄 파일은 `globIgnores`로 줍니다.
- 확장자가 있는 주소는 앱 셸 `index.html`로 대신 답하지 않습니다. 더 막을 주소는 `navigateFallbackDenylist`로 줍니다.
- 같은 출처의 `.woff2`는 `<cachePrefix>-fonts`에 `CacheFirst`로 담습니다. `runtimeCaching`으로 준 서비스 규칙은 그 뒤에 붙습니다. 외부 API 요청은 캐시하지 않습니다.

## 개발 서버 CSP

```ts
import { devCsp } from '@sch0718/vite-app';

export default { plugins: [devCsp()] };
```

`vite` 개발 서버(`serve`)에서만 `index.html`의 `connect-src`에 `http://localhost:*`, `http://127.0.0.1:*`, `http://[::1]:*`를 더합니다. Node 프록시나 `wrangler dev`에 붙기 위해서입니다. 빌드 결과의 CSP는 바뀌지 않습니다. 출처를 바꾸려면 `devCsp({ connectSources: ['http://localhost:8788'] })`로 줍니다.

`index.html`의 CSP에 `connect-src 'self' https:`가 그대로 들어 있어야 합니다. 없으면 조용히 넘어가지 않고 오류로 멈춥니다.

라이선스: [PolyForm Noncommercial 1.0.0](./LICENSE)
