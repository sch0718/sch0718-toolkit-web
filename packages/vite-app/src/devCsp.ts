// 개발 서버에서만 로컬 http 출처(Node 프록시·wrangler dev)를 connect-src에 더한다. 빌드 CSP는 그대로다.
// IPv6 리터럴(http://[::1]:*)은 CSP 출처 문법에 없어 브라우저가 무시하고 경고만 내므로 넣지 않는다.
import type { Plugin } from 'vite';

export const DEV_LOCAL_PROXY_SOURCES: readonly string[] = [
  'http://localhost:*',
  'http://127.0.0.1:*',
];

const BUILD_CONNECT_SRC = "connect-src 'self' https:";

export function applyDevCsp(
  html: string,
  sources: readonly string[] = DEV_LOCAL_PROXY_SOURCES,
): string {
  if (!html.includes(BUILD_CONNECT_SRC))
    throw new Error(`index.html CSP has no "${BUILD_CONNECT_SRC}"`);
  return html.replace(BUILD_CONNECT_SRC, `${BUILD_CONNECT_SRC} ${sources.join(' ')}`);
}

export function devCsp(opts: { connectSources?: readonly string[] } = {}): Plugin {
  return {
    name: 'sch0718-dev-csp',
    apply: 'serve',
    transformIndexHtml: (html) => applyDevCsp(html, opts.connectSources),
  };
}
