// Firebase Auth 팝업에 필요한 CSP 출처를 index.html의 meta CSP에 더한다.
// 동기화 설정(VITE_FIREBASE_AUTH_DOMAIN)이 없으면 CSP를 그대로 둔다. connect-src(https:)는 이미 Firebase API를 허용한다고 본다.
import type { Plugin } from 'vite';

/** Google 로그인 팝업이 쓰는 gapi 스크립트. */
export const FIREBASE_SCRIPT_SOURCES: readonly string[] = ['https://apis.google.com'];

const DOMAIN_RE = /^[a-z0-9.-]+$/;
// 이미 있는 frame-src 지시문과 그 출처 목록(다음 ; 또는 속성 끝 " 앞까지)
const FRAME_SRC_RE = /(?<=^|[\s;"])frame-src(?=[\s;"]|$)([^;"]*)/;

/**
 * script-src에 gapi, frame-src에 인증 도메인을 더한다. 기준 문구가 없으면 던진다.
 * frame-src가 이미 있으면 그 목록에 더한다(브라우저는 두 번째 frame-src를 무시한다). 없으면 default-src 뒤에 넣는다.
 */
export function applyFirebaseCsp(html: string, authDomain: string | undefined): string {
  if (!authDomain) return html;
  if (!DOMAIN_RE.test(authDomain))
    throw new Error(`invalid VITE_FIREBASE_AUTH_DOMAIN: ${authDomain}`);
  const script = "script-src 'self'";
  if (!html.includes(script)) throw new Error(`index.html CSP has no "${script}"`);
  const base = "default-src 'self';";
  if (!html.includes(base)) throw new Error(`index.html CSP has no "${base}"`);
  const frame = `https://${authDomain}`;
  const out = html.replace(script, `${script} ${FIREBASE_SCRIPT_SOURCES.join(' ')}`);
  const existing = FRAME_SRC_RE.exec(out);
  if (!existing) return out.replace(base, `${base} frame-src ${frame};`);
  const list = existing[1] ?? '';
  if (list.trim().split(/\s+/).includes(frame)) return out;
  const trailing = /\s*$/.exec(list)?.[0] ?? '';
  return out.replace(FRAME_SRC_RE, () => `frame-src${list.trimEnd()} ${frame}${trailing}`);
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
