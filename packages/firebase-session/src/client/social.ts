// 최상위 리다이렉트 로그인. Firebase SDK나 공급자 SDK 없이 Web Crypto만 쓴다.
export type SocialProvider = 'kakao' | 'naver';
export const SOCIAL_AUTHORIZE_URLS: Record<SocialProvider, string> = {
  kakao: 'https://kauth.kakao.com/oauth/authorize',
  naver: 'https://nid.naver.com/oauth2/authorize',
};
const PENDING_KEY = '@sch0718/firebase-session:social-pending';
const SOCIAL_PENDING_TTL = 10 * 60 * 1000;
type SocialStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface SocialSignInOptions {
  clientId: string;
  redirectUri: string;
  prompt?: string;
  storage?: SocialStorage;
  navigate?: (url: string) => void;
  random?: (n: number) => Uint8Array;
  now?: () => number;
}
export type SocialCallback =
  | {
      ok: true;
      provider: SocialProvider;
      code: string;
      codeVerifier: string;
      redirectUri: string;
    }
  | {
      ok: false;
      reason: 'redirect-mismatch' | 'state-mismatch' | 'expired' | 'cancelled' | 'provider-error';
      provider: SocialProvider;
      error?: string;
    };

export function socialAuthorizeUrl(
  provider: SocialProvider,
  p: {
    clientId: string;
    redirectUri: string;
    state: string;
    nonce: string;
    codeChallenge: string;
    prompt?: string;
  },
): string {
  const url = new URL(SOCIAL_AUTHORIZE_URLS[provider]);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    // 카카오: OIDC는 앱 설정으로 켜고, scope는 추가 동의 요청 때만 쓴다(REST API 문서). 네이버 OIDC: scope=openid 필수.
    ...(provider === 'naver' && { scope: 'openid' }),
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.codeChallenge,
    code_challenge_method: 'S256',
    ...(p.prompt !== undefined && { prompt: p.prompt }),
  }).toString();
  return url.href;
}
function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const SOCIAL_NONCE_PREFIX = 'nonce:';
async function sha256base64url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64url(new Uint8Array(digest));
}
/** 인가 요청의 nonce를 PKCE verifier에 묶는다. */
export function socialNonce(verifier: string): Promise<string> {
  return sha256base64url(SOCIAL_NONCE_PREFIX + verifier);
}
export async function beginSocialSignIn(
  provider: SocialProvider,
  o: SocialSignInOptions,
): Promise<void> {
  const random = o.random ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)));
  const verifier = base64url(random(32));
  const state = base64url(random(32));
  const nonce = await socialNonce(verifier);
  const url = socialAuthorizeUrl(provider, {
    ...o,
    state,
    nonce,
    codeChallenge: await sha256base64url(verifier),
  });
  (o.storage ?? localStorage).setItem(
    PENDING_KEY,
    JSON.stringify({
      provider,
      state,
      verifier,
      redirectUri: o.redirectUri,
      createdAt: (o.now ?? Date.now)(),
    }),
  );
  (o.navigate ?? ((url: string) => location.assign(url)))(url);
}

export function readSocialCallback(
  url: string | URL,
  o: { storage?: SocialStorage; now?: () => number } = {},
): SocialCallback | null {
  const current = new URL(url);
  const params = current.searchParams;
  if (!params.has('code') && !params.has('error')) return null;
  let raw: unknown;
  try {
    const storage = o.storage ?? localStorage;
    const saved = storage.getItem(PENDING_KEY);
    storage.removeItem(PENDING_KEY); // 실패한 콜백도 다시 사용할 수 없다.
    if (!saved) return null;
    raw = JSON.parse(saved);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const provider = p['provider'];
  if (
    (provider !== 'kakao' && provider !== 'naver') ||
    typeof p['state'] !== 'string' ||
    typeof p['verifier'] !== 'string' ||
    typeof p['redirectUri'] !== 'string' ||
    typeof p['createdAt'] !== 'number'
  )
    return null;
  let redirect: URL;
  try {
    redirect = new URL(p['redirectUri']);
  } catch {
    return null;
  }
  if (current.origin !== redirect.origin || current.pathname !== redirect.pathname)
    return { ok: false, reason: 'redirect-mismatch', provider };
  if (params.get('state') !== p['state']) return { ok: false, reason: 'state-mismatch', provider };
  if ((o.now ?? Date.now)() - p['createdAt'] >= SOCIAL_PENDING_TTL)
    return { ok: false, reason: 'expired', provider };
  const error = params.get('error');
  if (error !== null) {
    if (error === 'access_denied') return { ok: false, reason: 'cancelled', provider };
    return {
      ok: false,
      reason: 'provider-error',
      provider,
      ...(/^[A-Za-z0-9_]{1,64}$/.test(error) && { error }),
    };
  }
  const code = params.get('code');
  if (!code) return { ok: false, reason: 'provider-error', provider };
  return {
    ok: true,
    provider,
    code,
    codeVerifier: p['verifier'],
    redirectUri: p['redirectUri'],
  };
}
export function stripSocialCallback(url: string | URL): string {
  const clean = new URL(url);
  for (const key of ['code', 'state', 'error', 'error_description']) clean.searchParams.delete(key);
  return clean.href;
}
export function readSocialConfig(
  env: Record<string, string | boolean | undefined>,
): { kakao?: { clientId: string }; naver?: { clientId: string } } | null {
  const read = (key: string) => (typeof env[key] === 'string' ? env[key].trim() : '');
  const kakao = read('VITE_KAKAO_LOGIN_CLIENT_ID');
  const naver = read('VITE_NAVER_LOGIN_CLIENT_ID');
  return kakao || naver
    ? { ...(kakao && { kakao: { clientId: kakao } }), ...(naver && { naver: { clientId: naver } }) }
    : null;
}
