import { describe, expect, it } from 'vitest';
import { createPwaOptions, PWA_GLOB_PATTERNS } from './pwa.js';

type Rule = { urlPattern: unknown; handler: unknown; options?: { cacheName?: string } };
const match = (r: Rule, url: string, sameOrigin: boolean) =>
  (r.urlPattern as (c: { url: URL; sameOrigin: boolean }) => boolean)({
    url: new URL(url),
    sameOrigin,
  });

const extraRule = {
  urlPattern: ({ url }: { url: URL }) => url.pathname.endsWith('/data.json'),
  handler: 'StaleWhileRevalidate' as const,
  options: { cacheName: 'app-data' },
};

describe('createPwaOptions', () => {
  const o = createPwaOptions({
    manifest: { name: '시험앱', short_name: '시험', theme_color: '#000000', start_url: '/home' },
    cachePrefix: 'app',
    globIgnores: ['help/**'],
    navigateFallbackDenylist: [/^\/__\//],
    runtimeCaching: [extraRule],
  });
  const wb = o.workbox ?? {};

  it('같은 출처 registerSW.js로 등록하고 자동 갱신한다(CSP script-src self)', () => {
    expect(o.registerType).toBe('autoUpdate');
    expect(o.injectRegister).toBe('script');
  });

  it('새 서비스 워커를 바로 활성화한다', () => {
    expect(wb.skipWaiting).toBe(true);
    expect(wb.clientsClaim).toBe(true);
  });

  it('매니페스트 공통값 위에 서비스 값을 얹는다', () => {
    expect(o.manifest).toMatchObject({
      name: '시험앱',
      short_name: '시험',
      lang: 'ko',
      scope: './',
      display: 'standalone',
      start_url: '/home',
    });
  });

  it('앱 셸만 미리 담고, 서비스가 뺄 것을 뺀다', () => {
    expect(wb.globPatterns).toEqual(PWA_GLOB_PATTERNS);
    expect(wb.globIgnores).toEqual(['help/**']);
  });

  it('확장자 있는 주소와 서비스가 정한 주소는 앱 셸로 답하지 않는다', () => {
    const denied = (p: string) => (wb.navigateFallbackDenylist ?? []).some((re) => re.test(p));
    expect(denied('/data.json')).toBe(true);
    expect(denied('/assets/index-abc.js')).toBe(true);
    expect(denied('/__/auth/handler')).toBe(true);
    expect(denied('/')).toBe(false);
    expect(denied('/compare/g1')).toBe(false);
  });

  // Workbox는 거절 목록을 pathname + search에 맞춘다. 확장자는 경로에서만 본다.
  it('확장자는 질의 문자열을 빼고 경로에서만 본다', () => {
    const denied = (p: string) => (wb.navigateFallbackDenylist ?? []).some((re) => re.test(p));
    expect(denied('/data.json?v=1')).toBe(true);
    expect(denied('/compare/item?next=data.json')).toBe(false);
  });

  it('같은 출처 글꼴은 <prefix>-fonts에 CacheFirst로 담고, 서비스 규칙은 뒤에 붙는다', () => {
    const rules = (wb.runtimeCaching ?? []) as Rule[];
    expect(rules.map((r) => r.options?.cacheName)).toEqual(['app-fonts', 'app-data']);
    const font = rules[0] as Rule;
    expect(font.handler).toBe('CacheFirst');
    expect(match(font, 'https://app.test/assets/a.woff2', true)).toBe(true);
    expect(match(font, 'https://cdn.test/a.woff2', false)).toBe(false);
  });

  it('옵션을 주지 않아도 동작한다', () => {
    const d = createPwaOptions({ manifest: { name: 'x' }, cachePrefix: 'x' });
    expect(d.workbox?.globIgnores).toEqual([]);
    expect(d.workbox?.runtimeCaching).toHaveLength(1);
  });
});
