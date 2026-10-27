// @sch0718/vite-app은 tsconfig.pwa.json(skipLibCheck: true)으로 따로 검사한다.
// vite-plugin-pwa 2.0.0의 선언 파일이 선택적 peer인 @vite-pwa/assets-generator의 타입을 import하고,
// workbox-core의 선언 파일이 Service Worker 전역 타입(ExtendableEvent)을 써서 DOM lib로는 서드파티 선언 검사가 실패한다.
// 가즈아도 같은 문제가 있어 skipLibCheck를 켠다. 나머지 패키지는 index.ts에서 skipLibCheck: false로 검사한다.
import { AUTH_GLOB_IGNORES, AUTH_NAVIGATE_DENYLIST } from '@sch0718/firebase-session/vite';
import { createPwaOptions, devCsp } from '@sch0718/vite-app';
import type { Plugin } from 'vite';

export const plugins: Plugin[] = [devCsp()];
export const pwa = createPwaOptions({
  manifest: { name: '호환' },
  cachePrefix: 'compat',
  globIgnores: AUTH_GLOB_IGNORES,
  navigateFallbackDenylist: AUTH_NAVIGATE_DENYLIST,
});
