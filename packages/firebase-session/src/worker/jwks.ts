// 공급자 JWKS를 isolate 메모리에 캐시한다. 모르는 kid로 조회를 남발하지 않는다.
import { PROVIDER_TIMEOUT_MS } from './http.js';
import { importJWK, type CryptoKey as JoseKey } from 'jose';
import { CertsUnavailableError, type CertSource } from './certs.js';

const JWKS_DEFAULT_TTL = 60 * 60 * 1000;
const JWKS_MIN_TTL = 10 * 60 * 1000;
const JWKS_MAX_TTL = 24 * JWKS_DEFAULT_TTL;
const JWKS_STALE_MAX = 6 * JWKS_DEFAULT_TTL;
const JWKS_NEGATIVE_TTL = 30 * 1000;
const REFRESH_INTERVAL = 5 * 60 * 1000;

export function jwksKeys(
  url: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): CertSource {
  let cached: { until: number; keys: Map<string, JoseKey> } | null = null;
  let lastFetch = -Infinity;
  let failedAt = -Infinity;
  let inflight: Promise<void> | null = null;

  async function load(): Promise<void> {
    lastFetch = now();
    try {
      const res = await fetchImpl(url, {
        ...(typeof AbortSignal.timeout === 'function' && {
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        }),
      });
      if (!res.ok) throw new Error();
      const body: unknown = await res.json();
      if (!body || typeof body !== 'object' || !('keys' in body) || !Array.isArray(body.keys))
        throw new Error();
      const keys = new Map<string, JoseKey>();
      for (const raw of body.keys as unknown[]) {
        if (!raw || typeof raw !== 'object') continue;
        const k = raw as Record<string, unknown>;
        if (
          k['kty'] !== 'RSA' ||
          typeof k['kid'] !== 'string' ||
          (k['use'] !== undefined && k['use'] !== 'sig') ||
          (k['alg'] !== undefined && k['alg'] !== 'RS256')
        )
          continue;
        try {
          const key = await importJWK(k, 'RS256');
          if (key instanceof CryptoKey && key.type === 'public') keys.set(k['kid'], key);
        } catch {
          /* 깨진 키 하나 때문에 나머지 키까지 버리지 않는다. */
        }
      }
      const control = res.headers.get('Cache-Control') ?? '';
      const age = Number(/max-age=(\d+)/i.exec(control)?.[1] ?? 0) * 1000;
      const ttl =
        /\bno-store\b|\bno-cache\b/i.test(control) || !age
          ? JWKS_DEFAULT_TTL
          : Math.max(JWKS_MIN_TTL, Math.min(age, JWKS_MAX_TTL));
      cached = { until: now() + ttl, keys };
      failedAt = -Infinity;
    } catch {
      if (cached && now() < cached.until + JWKS_STALE_MAX) return;
      failedAt = now();
      throw new CertsUnavailableError('jwks unavailable');
    }
  }

  return {
    async key(kid) {
      if (
        !cached ||
        now() >= cached.until + JWKS_STALE_MAX ||
        ((now() >= cached.until || !cached.keys.has(kid)) && now() - lastFetch >= REFRESH_INTERVAL)
      ) {
        if (now() - failedAt < JWKS_NEGATIVE_TTL)
          throw new CertsUnavailableError('jwks unavailable');
        inflight ??= load().finally(() => {
          inflight = null;
        });
        await inflight;
      }
      return cached!.keys.get(kid) ?? null;
    },
  };
}
