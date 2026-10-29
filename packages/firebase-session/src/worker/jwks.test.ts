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
    expect(f).toHaveBeenCalledWith('https://keys.test', {
      signal: expect.any(AbortSignal),
    });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it.each([
    [60, 600_000],
    [undefined, 3_600_000],
    [0, 3_600_000],
    [172800, 86_400_000],
  ])('max-age %s, 하한 10분·상한 24시간', async (age, ttl) => {
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

describe('JWKS 캐시 정책과 장애 복구', () => {
  it.each(['no-store', 'no-cache', 'no-cache, no-store, max-age=0', 'no-store, max-age=60'])(
    '%s도 기본 1시간 캐시한다',
    async (control) => {
      let now = T0;
      const f = vi.fn(async () =>
        Response.json(
          { keys: [jwk] },
          {
            headers: { 'Cache-Control': control },
          },
        ),
      );
      const c = jwksKeys('https://keys.test', f, () => now);
      await c.key('k1');
      now += 3_599_999;
      await c.key('k1');
      expect(f).toHaveBeenCalledTimes(1);
      now++;
      await c.key('k1');
      expect(f).toHaveBeenCalledTimes(2);
    },
  );
  it('만료 후 실패하면 이전 키를 쓰고 5분마다 재시도하며 6시간 경계에서 중단한다', async () => {
    let now = T0;
    const f = vi.fn(async () => reply());
    const c = jwksKeys('https://keys.test', f, () => now);
    const key = await c.key('k1');
    f.mockRejectedValue(new Error('network'));
    now += 3_600_000;
    expect(await c.key('k1')).toBe(key);
    expect(f).toHaveBeenCalledTimes(2);
    now += 299_999;
    expect(await c.key('k1')).toBe(key);
    expect(f).toHaveBeenCalledTimes(2);
    now++;
    expect(await c.key('k1')).toBe(key);
    expect(f).toHaveBeenCalledTimes(3);
    now = T0 + 3_600_000 + 6 * 3_600_000 - 1;
    expect(await c.key('k1')).toBe(key);
    now++;
    await expect(c.key('k1')).rejects.toBeInstanceOf(CertsUnavailableError);
    expect(f).toHaveBeenCalledTimes(5);
    now += 29_999;
    await expect(c.key('k1')).rejects.toThrow(new CertsUnavailableError('jwks unavailable'));
    expect(f).toHaveBeenCalledTimes(5);
    now++;
    await expect(c.key('k1')).rejects.toBeInstanceOf(CertsUnavailableError);
    expect(f).toHaveBeenCalledTimes(6);
  });
  it('모르는 kid 재조회가 실패하면 유효한 캐시 조회 결과를 돌려준다', async () => {
    let now = T0;
    const f = vi.fn(async () => reply());
    const c = jwksKeys('https://keys.test', f, () => now);
    const key = await c.key('k1');
    f.mockRejectedValue(new Error('network'));
    now += 300_000;
    expect(await c.key('unknown')).toBeNull();
    expect(await c.key('k1')).toBe(key);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('캐시가 없으면 실패 뒤 정확히 30초가 지나야 다시 시도한다', async () => {
    let now = T0;
    const f = vi.fn(async () => {
      throw new Error('network');
    });
    const c = jwksKeys('https://keys.test', f, () => now);
    await expect(c.key('k1')).rejects.toBeInstanceOf(CertsUnavailableError);
    expect(f).toHaveBeenCalledTimes(1);
    now += 29_999;
    await expect(c.key('other')).rejects.toThrow(new CertsUnavailableError('jwks unavailable'));
    expect(f).toHaveBeenCalledTimes(1);
    now++;
    await expect(c.key('k1')).rejects.toBeInstanceOf(CertsUnavailableError);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('캐시 없이 실패한 뒤 시계가 뒤로 가면 바로 다시 조회한다', async () => {
    let now = T0;
    const f = vi.fn(async () => {
      throw new Error('network');
    });
    const c = jwksKeys('https://keys.test', f, () => now);
    await expect(c.key('k1')).rejects.toBeInstanceOf(CertsUnavailableError);
    expect(f).toHaveBeenCalledTimes(1);
    now -= 3_600_000;
    await expect(c.key('k1')).rejects.toBeInstanceOf(CertsUnavailableError);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])('stale 한도 경과 %s: 실패 30초 뒤 성공하면 복구한다', async (stale) => {
    let now = T0;
    const f = vi.fn(async () => reply());
    const c = jwksKeys('https://keys.test', f, () => now);
    if (stale) {
      await c.key('k1');
      now += 7 * 3_600_000;
    }
    f.mockRejectedValue(new Error('network'));
    await expect(c.key('k1')).rejects.toBeInstanceOf(CertsUnavailableError);
    const calls = stale ? 2 : 1;
    f.mockImplementation(async () => reply());
    now += 29_999;
    await expect(c.key('k1')).rejects.toBeInstanceOf(CertsUnavailableError);
    expect(f).toHaveBeenCalledTimes(calls);
    now++;
    const result = await Promise.all([c.key('k1'), c.key('k1'), c.key('other')]);
    expect(result[0]).toBeInstanceOf(CryptoKey);
    expect(result[1]).toBe(result[0]);
    expect(result[2]).toBeNull();
    expect(await c.key('k1')).toBe(result[0]);
    expect(f).toHaveBeenCalledTimes(calls + 1);
  });
});
