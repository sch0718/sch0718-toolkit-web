// Firebase Auth 팝업에 필요한 CSP 출처를 index.html의 meta CSP에 더한다.
// 동기화 설정(VITE_FIREBASE_AUTH_DOMAIN)이 없으면 CSP를 그대로 둔다. connect-src(https:)는 이미 Firebase API를 허용한다고 본다.
import type { Plugin } from 'vite';

/** Google 로그인 팝업이 쓰는 gapi 스크립트. */
export const FIREBASE_SCRIPT_SOURCES = ['https://apis.google.com'];

const DOMAIN_RE = /^[a-z0-9.-]+$/;

/** script-src에 gapi, frame-src에 인증 도메인을 더한다. 기준 문구가 없으면 던진다. */
export function applyFirebaseCsp(html: string, authDomain: string | undefined): string {
  if (!authDomain) return html;
  if (!DOMAIN_RE.test(authDomain))
    throw new Error(`invalid VITE_FIREBASE_AUTH_DOMAIN: ${authDomain}`);
  const script = "script-src 'self'";
  if (!html.includes(script)) throw new Error(`index.html CSP has no "${script}"`);
  const base = "default-src 'self';";
  if (!html.includes(base)) throw new Error(`index.html CSP has no "${base}"`);
  return html
    .replace(script, `${script} ${FIREBASE_SCRIPT_SOURCES.join(' ')}`)
    .replace(base, `${base} frame-src https://${authDomain};`);
}

export function firebaseCsp(): Plugin {
  let authDomain: string | undefined;
  return {
    name: 'sch0718-firebase-csp',
    configResolved(c) {
      const v: unknown = c.env['VITE_FIREBASE_AUTH_DOMAIN'];
      authDomain = typeof v === 'string' && v.trim() ? v.trim() : undefined;
    },
    transformIndexHtml: (html) => applyFirebaseCsp(html, authDomain),
  };
}
