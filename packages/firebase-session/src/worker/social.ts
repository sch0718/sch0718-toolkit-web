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

function isRedirectUri(s: string): boolean {
  if (s.length > 2048 || s.includes('#')) return false;
  try {
    const url = new URL(s);
    return (
      !url.username &&
      !url.password &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}

/** 공백·중복·잘못된 주소를 빼고, 본문과 정확히 비교할 원문은 유지한다. */
export function parseRedirectUris(raw: string | readonly string[] | undefined): string[] {
  const values = typeof raw === 'string' ? raw.split(',') : (raw ?? []);
  return [...new Set(values.map((s) => s.trim()).filter(isRedirectUri))];
}

/** 환경변수에서 켜진 공급자만 소셜 설정에 넣는다. */
export function socialLoginOptions(i: {
  allowedAccounts: string | undefined;
  kakao?: { clientId?: string | undefined; clientSecret?: string | undefined };
  naver?: { clientId?: string | undefined; clientSecret?: string | undefined };
  /** 콤마 문자열이나 목록. 요청 origin 같은 기본값은 서비스가 정해 넘긴다. */
  redirectUris: string | readonly string[] | undefined;
  keys: Record<SocialProvider, CertSource>;
  fetch?: typeof fetch | undefined;
}): SocialLoginOptions | undefined {
  const kakaoId = i.kakao?.clientId?.trim();
  const kakaoSecret = i.kakao?.clientSecret?.trim();
  const naverId = i.naver?.clientId?.trim();
  const naverSecret = i.naver?.clientSecret?.trim();
  if (!kakaoId && !(naverId && naverSecret)) return undefined;
  const redirectUris = parseRedirectUris(i.redirectUris);
  return {
    allowedAccounts: i.allowedAccounts?.trim() || undefined,
    ...(kakaoId && {
      kakao: { clientId: kakaoId, ...(kakaoSecret && { clientSecret: kakaoSecret }), redirectUris },
    }),
    ...(naverId &&
      naverSecret && { naver: { clientId: naverId, clientSecret: naverSecret, redirectUris } }),
    keys: i.keys,
    ...(i.fetch && { fetch: i.fetch }),
  };
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
  if (typeof redirect !== 'string' || !isRedirectUri(redirect)) throw bad();
  const allowed = o[provider]!.redirectUris;
  if (allowed !== undefined && !allowed.includes(redirect)) throw bad();
  return body as SocialBody;
}

const SOCIAL_NONCE_PREFIX = 'nonce:';

function cleanDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // 표시를 흐리는 제어 문자와 양방향 제어 문자를 지운다.
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  return [...name].slice(0, 64).join('') || undefined;
}

function cleanEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const email = value.trim().toLowerCase();
  // 검증된 이메일이 아니라 표시용 형식만 검사한다.
  // eslint-disable-next-line no-control-regex
  if (email.length > 254 || /[\s\u0000-\u001f\u007f-\u009f]/u.test(email)) return undefined;
  return email.split('@').length === 2 ? email : undefined;
}

async function verifySocialIdToken(
  token: string,
  b: SocialBody,
  o: SocialLoginOptions,
  now: number,
  reauthWindow: number,
): Promise<{ sub: string; email: string; name?: string; unverifiedEmail?: string }> {
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
    const name = cleanDisplayName(payload['nickname']);
    const unverifiedEmail = cleanEmail(payload['email']);
    return {
      sub: payload.sub,
      email: '',
      ...(name && { name }),
      ...(unverifiedEmail && { unverifiedEmail }),
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
  isAllowed?: (account: string, provider: SocialProvider) => boolean | Promise<boolean>,
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
  if (
    !parseAccountList(o.allowedAccounts).has(account) &&
    !(await isAllowed?.(account, b.provider))
  )
    throw new HttpError(403, 'not-allowed', { account });
  if (
    b.provider === 'naver' &&
    (!verified.name || !verified.unverifiedEmail) &&
    'access_token' in raw &&
    typeof raw.access_token === 'string'
  ) {
    try {
      const p = (await (
        await (o.fetch ?? fetch)('https://openapi.naver.com/v1/nid/me', {
          headers: { Authorization: `Bearer ${raw.access_token}` },
          signal: AbortSignal.timeout(3000),
        })
      ).json()) as { resultcode?: unknown; response?: Record<string, unknown> } | null;
      const f = p?.resultcode === '00' && typeof p.response === 'object' ? p.response : undefined;
      if (f) {
        const name = cleanDisplayName(f['nickname']) ?? cleanDisplayName(f['name']);
        const email = cleanEmail(f['email']);
        if (name && !verified.name) verified.name = name;
        if (email && !verified.unverifiedEmail) verified.unverifiedEmail = email;
      }
    } catch {
      // 표시 정보 조회 실패는 로그인을 막지 않으며 토큰을 로그나 오류에 남기지 않는다.
    }
  }
  return { user: { ...verified, sub: account, provider: b.provider }, label: b.label };
}
