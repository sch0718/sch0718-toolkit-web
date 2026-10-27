import { describe, expect, it } from 'vitest';
import { allowedOrigins, corsHeaders, matchOrigin, preflight } from './cors.js';

const req = (origin: string | null) =>
  new Request('https://api.example.test/x', origin === null ? {} : { headers: { Origin: origin } });
const LIST = 'https://app.example.test, https://second.example.test';

describe('CORS', () => {
  it('목록을 콤마로 나누고 공백을 지운다', () => {
    expect(allowedOrigins(` ${LIST} ,`)).toEqual([
      'https://app.example.test',
      'https://second.example.test',
    ]);
  });
  it.each([
    ['https://app.example.test', 'https://app.example.test'],
    ['https://second.example.test', 'https://second.example.test'],
    ['https://app.example.test.evil.test', null],
    ['http://app.example.test', null],
    ['null', null],
    [null, null],
  ])('%s → %s', (origin, expected) => {
    expect(matchOrigin(req(origin), LIST)).toBe(expected);
  });
  it('preflight는 주어진 메서드·헤더만 허용하고 캐시하지 않는다', () => {
    const r = preflight('https://app.example.test', {
      methods: 'GET, POST',
      headers: 'Authorization, X-S',
    });
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.test');
    expect(r.headers.get('Vary')).toBe('Origin');
    expect(r.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST');
    expect(r.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, X-S');
    expect(r.headers.get('Access-Control-Max-Age')).toBe('600');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
  it('corsHeaders', () => {
    expect(corsHeaders('https://a.test')).toEqual({
      'Access-Control-Allow-Origin': 'https://a.test',
      Vary: 'Origin',
    });
  });
});
