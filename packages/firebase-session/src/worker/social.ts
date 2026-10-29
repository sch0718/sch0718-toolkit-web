// 공급자 인가 코드 교환과 OIDC 검증. 공급자 시크릿·토큰·코드는 오류에 담지 않는다.
import { decodeProtectedHeader, jwtVerify } from 'jose';
import type { CertSource } from './certs.js';
import { base64url, HttpError, PROVIDER_TIMEOUT_MS } from './http.js';
import { jwksKeys } from './jwks.js';
import { CLOCK_SKEW_SEC } from './verify.js';

export type SocialProvider = 'kakao' | 'naver';
export const SOCIAL_PROVIDERS: Record<
  SocialProvider,
  {
    issuer: string;
    authorizeUrl: string;
    tokenUrl: string;
    jwksUrl: string;
  }
> = {
  kakao: {
    issuer: 'https://kauth.kakao.com',
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    jwksUrl: 'https://kauth.kakao.com/.well-known/jwks.json',
  },
  naver: {
    issuer: 'https://nid.naver.com',
    authorizeUrl: 'https://nid.naver.com/oauth2/authorize',
    tokenUrl: 'https://nid.naver.com/oauth2/token',
    jwksUrl: 'https://nid.naver.com/oauth2/jwks',
  },
};
export interface SocialProviderConfig {
  clientId: string;
  clientSecret?: string;
  /** 주면 본문 redirectUri와 정확히 일치해야 한다. 빈 배열은 모두 거절하고, 없으면 형식만 검사한다. */
  redirectUris?: readonly string[];
}
export interface SocialLoginOptions {
  allowedAccounts: string | undefined;
  kakao?: SocialProviderConfig;
  naver?: SocialProviderConfig;
  keys: Record<SocialProvider, CertSource>;
  fetch?: typeof fetch;
}
export function socialKeys(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Record<SocialProvider, CertSource> {
  return {
    kakao: jwksKeys(SOCIAL_PROVIDERS.kakao.jwksUrl, fetchImpl, now),
    naver: jwksKeys(SOCIAL_PROVIDERS.naver.jwksUrl, fetchImpl, now),
  };
}
export function parseAccountList(raw: string | undefined): Set<string> {
  const accounts = new Set<string>();
  for (const part of (raw ?? '').split(',')) {
    const m = /^(kakao|naver):(.+)$/i.exec(part.trim());
    if (m) accounts.add(`${m[1]!.toLowerCase()}:${m[2]!}`);
  }
  return accounts;
}
interface SocialBody {
  provider: SocialProvider;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  label?: unknown;
}
function readBody(body: unknown, o: SocialLoginOptions): SocialBody {
  const bad = () => new HttpError(400, 'bad-request');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad();
  const b = body as Record<string, unknown>;
  if (Object.hasOwn(b, 'nonce')) throw bad();
  const provider = b['provider'];
  if ((provider !== 'kakao' && provider !== 'naver') || !o[provider]?.clientId) throw bad();
  const matches = (key: string, re: RegExp) => typeof b[key] === 'string' && re.test(b[key]);
  if (
    !matches('code', /^[\x21-\x7e]{1,1024}$/) ||
    !matches('codeVerifier', /^[A-Za-z0-9._~-]{43,128}$/)
  )
    throw bad();
  const redirect = b['redirectUri'];
  if (typeof redirect !== 'string' || redirect.length > 2048 || redirect.includes('#')) throw bad();
  let url: URL;
  try {
    url = new URL(redirect);
  } catch {
    throw bad();
  }
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw bad();
  const allowed = o[provider]!.redirectUris;
  if (allowed !== undefined && !allowed.includes(redirect)) throw bad();
  return body as SocialBody;
}

const SOCIAL_NONCE_PREFIX = 'nonce:';

async function verifySocialIdToken(
  token: string,
  b: SocialBody,
  o: SocialLoginOptions,
  now: number,
  reauthWindow: number,
): Promise<{ sub: string; email: string; unverifiedEmail?: string }> {
  const invalid = () => new HttpError(401, 'invalid-token');
  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw invalid();
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw invalid();
  let key;
  try {
    key = await o.keys[b.provider].key(header.kid);
  } catch {
    throw new HttpError(503, 'provider-unavailable');
  }
  if (!key) throw invalid();
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['RS256'],
      issuer: SOCIAL_PROVIDERS[b.provider].issuer,
      audience: o[b.provider]!.clientId,
      currentDate: new Date(now),
      clockTolerance: CLOCK_SKEW_SEC,
      requiredClaims: ['exp', 'iat', 'sub'],
    });
    const nonce = base64url(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(SOCIAL_NONCE_PREFIX + b.codeVerifier),
        ),
      ),
    );
    if (
      typeof payload.iat !== 'number' ||
      payload.iat > now / 1000 + CLOCK_SKEW_SEC ||
      now - payload.iat * 1000 > reauthWindow ||
      payload['nonce'] !== nonce ||
      (Array.isArray(payload.aud) &&
        payload.aud.length > 1 &&
        payload['azp'] !== o[b.provider]!.clientId) ||
      (payload['azp'] !== undefined && payload['azp'] !== o[b.provider]!.clientId) ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      payload.sub.length > 128
    )
      throw invalid();
    return {
      sub: payload.sub,
      email: '',
      ...(typeof payload['email'] === 'string' && {
        unverifiedEmail: payload['email'].toLowerCase(),
      }),
    };
  } catch {
    throw invalid();
  }
}

/** 본문 검사를 끝낸 뒤에만 공급자를 부른다. */
export async function exchangeSocial(
  body: unknown,
  o: SocialLoginOptions,
  now: number,
  reauthWindow: number,
) {
  const b = readBody(body, o);
  const config = o[b.provider]!;
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code: b.code,
    redirect_uri: b.redirectUri,
    code_verifier: b.codeVerifier,
  });
  if (config.clientSecret !== undefined) form.set('client_secret', config.clientSecret);
  let res: Response;
  try {
    res = await (o.fetch ?? fetch)(SOCIAL_PROVIDERS[b.provider].tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      ...(typeof AbortSignal.timeout === 'function' && {
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      }),
    });
  } catch {
    throw new HttpError(503, 'provider-unavailable');
  }
  if (res.status === 429 || res.status >= 500) throw new HttpError(503, 'provider-unavailable');
  if (res.status >= 400) throw new HttpError(401, 'invalid-code');
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new HttpError(401, 'invalid-token');
  }
  if (!raw || typeof raw !== 'object' || !('id_token' in raw) || typeof raw.id_token !== 'string')
    throw new HttpError(401, 'invalid-token');
  const verified = await verifySocialIdToken(raw.id_token, b, o, now, reauthWindow);
  const account = `${b.provider}:${verified.sub}`;
  if (!parseAccountList(o.allowedAccounts).has(account))
    throw new HttpError(403, 'not-allowed', { account });
  return { user: { ...verified, sub: account, provider: b.provider }, label: b.label };
}
