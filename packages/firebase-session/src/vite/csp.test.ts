import { describe, expect, it } from 'vitest';
import { applyFirebaseCsp, firebaseCsp } from './csp.js';
import { AUTH_GLOB_IGNORES, AUTH_NAVIGATE_DENYLIST } from './index.js';

// 가즈아 index.html의 CSP와 같은 모양
const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src 'self' https:; img-src 'self' data:; style-src 'self' 'unsafe-inline'" />`;
const directive = (doc: string, name: string) =>
  new RegExp(`${name} ([^;"]*)`).exec(doc)?.[1]?.trim().split(/\s+/) ?? null;

describe('Firebase Auth CSP', () => {
  it('설정이 없으면 CSP를 그대로 둔다', () => {
    expect(applyFirebaseCsp(html, undefined)).toBe(html);
    expect(applyFirebaseCsp(html, '')).toBe(html);
  });

  it('인증 도메인이 있으면 gapi 스크립트와 그 인증 프레임만 더한다', () => {
    const out = applyFirebaseCsp(html, 'toolkit-test.firebaseapp.com');
    expect(directive(out, 'script-src')).toEqual(["'self'", 'https://apis.google.com']);
    expect(directive(out, 'frame-src')).toEqual(['https://toolkit-test.firebaseapp.com']);
    expect(directive(out, 'connect-src')).toEqual(["'self'", 'https:']);
    expect(directive(out, 'default-src')).toEqual(["'self'"]);
  });

  it('CSP 토큰을 끼워 넣을 수 있는 도메인은 거절한다', () => {
    expect(() => applyFirebaseCsp(html, 'x.com; script-src *')).toThrow();
    expect(() => applyFirebaseCsp(html, 'https://x.firebaseapp.com')).toThrow();
  });

  it('index.html에 기준 문구가 없으면 멈춘다', () => {
    expect(() => applyFirebaseCsp('<meta content="default-src \'self\';">', 'a.test')).toThrow();
  });

  it('빌드와 개발 서버 모두에 적용한다', () => {
    const p = firebaseCsp();
    expect(p.apply).toBeUndefined();
    expect(p.name).toBe('sch0718-firebase-csp');
  });
});

describe('PWA용 상수', () => {
  it('Firebase 청크와 로그인 도우미는 미리 담지 않는다', () => {
    expect(AUTH_GLOB_IGNORES).toEqual(['assets/firebaseImpl-*.js', '__/**']);
  });
  it('로그인 도우미 주소는 앱 셸로 대신 답하지 않는다', () => {
    const denied = (p: string) => AUTH_NAVIGATE_DENYLIST.some((re) => re.test(p));
    expect(denied('/__/auth/handler')).toBe(true);
    expect(denied('/__/auth/iframe')).toBe(true);
    expect(denied('/')).toBe(false);
  });
});
