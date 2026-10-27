import { describe, expect, it } from 'vitest';
import { applyDevCsp, DEV_LOCAL_PROXY_SOURCES, devCsp } from './devCsp.js';

const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src 'self' https:; img-src 'self' data:" />`;
const connectSrc = (doc: string) =>
  /connect-src ([^;"]*)/.exec(doc)?.[1]?.trim().split(/\s+/) ?? [];

describe('개발 서버 CSP', () => {
  it('빌드 CSP는 self와 https만', () => {
    expect(connectSrc(html)).toEqual(["'self'", 'https:']);
  });
  it('개발 서버에서는 localhost·127.0.0.1·[::1] http를 더한다', () => {
    expect(connectSrc(applyDevCsp(html))).toEqual(["'self'", 'https:', ...DEV_LOCAL_PROXY_SOURCES]);
  });
  it('출처를 바꿔 줄 수 있다', () => {
    expect(connectSrc(applyDevCsp(html, ['http://localhost:8788']))).toEqual([
      "'self'",
      'https:',
      'http://localhost:8788',
    ]);
  });
  it('개발 서버에만 적용한다', () => {
    const p = devCsp();
    expect(p.apply).toBe('serve');
    expect(p.name).toBe('sch0718-dev-csp');
  });
  it('기준 connect-src가 없으면 멈춘다', () => {
    expect(() => applyDevCsp('<meta content="default-src \'self\'">')).toThrow();
  });
});
