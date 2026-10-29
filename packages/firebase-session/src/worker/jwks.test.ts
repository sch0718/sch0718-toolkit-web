import { exportJWK } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { keys, T0 } from '../../test/tokens.js';
import { CertsUnavailableError } from './certs.js';
import { jwksKeys } from './jwks.js';

const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'k1', use: 'sig', alg: 'RS256' };
const reply = (age?: number) =>
  Response.json(
    { keys: [jwk] },
    {
      headers: age === undefined ? {} : { 'Cache-Control': `public, max-age=${age}` },
    },
  );

describe('jwksKeys', () => {
  it('RSA 공개키를 가져와 캐시하고 동시 요청을 합친다', async () => {
    const f = vi.fn(async () => reply());
    const c = jwksKeys('https://keys.test', f, () => T0);
    const result = await Promise.all([c.key('k1'), c.key('k1'), c.key('other')]);
    expect(result[0]).toBeInstanceOf(CryptoKey);
    expect(result[1]).toBe(result[0]);
    expect(result[2]).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it.each([
    [10, 10_000],
    [undefined, 3_600_000],
    [172800, 86_400_000],
  ])('max-age %s, 상한 24시간', async (age, ttl) => {
    let now = T0;
    const f = vi.fn(async () => reply(age));
    const c = jwksKeys('https://keys.test', f, () => now);
    await c.key('k1');
    now += ttl! - 1;
    await c.key('k1');
    expect(f).toHaveBeenCalledTimes(1);
    now++;
    await c.key('k1');
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('모르는 kid는 마지막 조회 5분 후에만 재조회한다', async () => {
    let now = T0;
    const f = vi.fn(async () => reply());
    const c = jwksKeys('https://keys.test', f, () => now);
    await c.key('k1');
    now += 299_999;
    expect(await c.key('unknown')).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    now++;
    await Promise.all([c.key('unknown'), c.key('unknown2')]);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it.each(['network', 'status', 'json', 'shape'])(
    '%s 장애는 CertsUnavailableError',
    async (mode) => {
      const f = vi.fn(async () => {
        if (mode === 'network') throw new Error('network');
        if (mode === 'status') return new Response('', { status: 503 });
        if (mode === 'json') return new Response('not json');
        return Response.json({ keys: null });
      });
      await expect(jwksKeys('https://keys.test', f).key('k1')).rejects.toBeInstanceOf(
        CertsUnavailableError,
      );
    },
  );
  it('RSA 아닌 키, enc 용도, 다른 알고리즘과 깨진 키를 무시한다', async () => {
    const f = vi.fn(async () =>
      Response.json({
        keys: [
          { ...jwk, kid: 'enc', use: 'enc' },
          { kid: 'ec', kty: 'EC' },
          { ...jwk, kid: 'hs', alg: 'HS256' },
          { kid: 'broken', kty: 'RSA' },
          jwk,
        ],
      }),
    );
    const c = jwksKeys('https://keys.test', f);
    for (const kid of ['enc', 'ec', 'hs', 'broken']) expect(await c.key(kid)).toBeNull();
    expect(await c.key('k1')).toBeInstanceOf(CryptoKey);
  });
});
