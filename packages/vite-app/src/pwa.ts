// 서비스 공통 PWA 설정. 매니페스트·캐시 이름·서비스 고유 캐시 규칙은 인자로 받는다.
import type { ManifestOptions, VitePWAOptions } from 'vite-plugin-pwa';

type Workbox = NonNullable<VitePWAOptions['workbox']>;
type RuntimeCaching = NonNullable<Workbox['runtimeCaching']>[number];

/** 앱 셸만 미리 담는다. 글꼴 조각·데이터 파일은 담지 않는다. */
export const PWA_GLOB_PATTERNS: readonly string[] = ['**/*.{html,js,css,svg,png,webmanifest}'];

const MANIFEST_DEFAULTS: Partial<ManifestOptions> = {
  lang: 'ko',
  start_url: './',
  scope: './',
  display: 'standalone',
};

export interface PwaAppOptions {
  /** 이름·설명·색·아이콘 등 앱별 값. lang·start_url·scope·display 기본값을 덮어쓸 수 있다. */
  manifest: Partial<ManifestOptions>;
  /** 런타임 캐시 이름 앞부분(예: 'gazua' → 'gazua-fonts') */
  cachePrefix: string;
  /** 공통 규칙(글꼴) 뒤에 붙는 서비스 규칙 */
  runtimeCaching?: readonly RuntimeCaching[];
  /** 미리 담지 않을 파일 */
  globIgnores?: readonly string[];
  /** 앱 셸로 대신 답하지 않을 주소(확장자 있는 주소는 이미 뺀다) */
  navigateFallbackDenylist?: readonly RegExp[];
}

export function createPwaOptions(o: PwaAppOptions): Partial<VitePWAOptions> {
  return {
    registerType: 'autoUpdate',
    // CSP가 script-src 'self'이므로 인라인 등록 스크립트 대신 같은 출처의 registerSW.js를 쓴다.
    injectRegister: 'script',
    manifest: { ...MANIFEST_DEFAULTS, ...o.manifest },
    workbox: {
      // injectRegister 'script'에서는 플러그인이 autoUpdate의 skipWaiting/clientsClaim 기본값을 넣지 않는다.
      // 직접 켜야 새 버전이 바로 활성화돼 설치된 사용자가 옛 앱 셸에 머무르지 않는다.
      skipWaiting: true,
      clientsClaim: true,
      globPatterns: [...PWA_GLOB_PATTERNS],
      globIgnores: [...(o.globIgnores ?? [])],
      // 확장자가 있는 주소(데이터 파일·assets 등)는 앱 셸 index.html로 대신 답하지 않는다.
      navigateFallbackDenylist: [/\.\w+$/, ...(o.navigateFallbackDenylist ?? [])],
      runtimeCaching: [
        {
          // 글꼴 조각은 쓰는 것만 처음 받을 때 담는다.
          urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('.woff2'),
          handler: 'CacheFirst',
          options: {
            cacheName: `${o.cachePrefix}-fonts`,
            expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [200] },
          },
        },
        ...(o.runtimeCaching ?? []),
        // 외부 API 요청은 캐시하지 않는다(런타임 규칙 없음 = 네트워크 그대로).
      ],
    },
  };
}
