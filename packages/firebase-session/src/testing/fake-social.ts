// 로컬 개발용 소셜 공급자: 상태 없는 코드와 시험용 서명 키를 쓴다.
import {
  base64url,
  SOCIAL_PROVIDERS,
  type CertSource,
  type SocialProvider,
} from '../worker/index.js';
import { SOCIAL_AUTHORIZE_URLS } from '../client/social.js';

const printable = /^[\x20-\x7e]{1,512}$/;
const results = ['ok', 'cancel', 'provider-error', 'bad-code', 'down'] as const;
export type FakeSocialResult = (typeof results)[number];

export const FAKE_CLIENT_IDS: Readonly<Record<SocialProvider, string>> = {
  kakao: 'dev-fake-kakao',
  naver: 'dev-fake-naver',
};
export const FAKE_CLIENT_SECRET = 'dev-fake-secret';

export interface FakeSocialOptions {
  basePath: string;
  now?: () => number;
  defaultSub?: string;
  approveResponse?: 'redirect' | 'refresh';
}

export interface FakeSocial {
  keys: Record<SocialProvider, CertSource>;
  fetch: typeof fetch;
  handle(request: Request, redirectUris: readonly string[]): Promise<Response | null>;
  approve(query: URLSearchParams, redirectUris: readonly string[]): string | null;
}
interface Authorization {
  provider: SocialProvider;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  challenge: string;
}
interface FakeCode {
  v: 1;
  p: SocialProvider;
  s: string;
  c: string;
  n: string;
  r: string;
  a: string;
  x: FakeSocialResult;
  e: number;
}
let keyPair: Promise<CryptoKeyPair> | undefined;
function signingKeys(): Promise<CryptoKeyPair> {
  return (keyPair ??= crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    false,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>);
}
const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
const hash = async (text: string) =>
  base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );
const bad = () =>
  new Response('로그인 요청을 확인하지 못했어요. 개발용 설정과 매개변수를 확인해 주세요.', {
    status: 400,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });

function authorization(
  query: URLSearchParams,
  redirectUris: readonly string[],
): Authorization | null {
  const provider = query.get('provider');
  if (provider !== 'kakao' && provider !== 'naver') return null;
  const clientId = query.get('client_id');
  const redirectUri = query.get('redirect_uri');
  const state = query.get('state');
  const nonce = query.get('nonce');
  const challenge = query.get('code_challenge');
  if (
    query.get('response_type') !== 'code' ||
    clientId !== FAKE_CLIENT_IDS[provider] ||
    !redirectUri ||
    !redirectUris.includes(redirectUri) ||
    !state ||
    !printable.test(state) ||
    !nonce ||
    !printable.test(nonce) ||
    !challenge ||
    !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
    query.get('code_challenge_method') !== 'S256' ||
    (provider === 'naver' && query.get('scope') !== 'openid')
  )
    return null;
  return { provider, clientId, redirectUri, state, nonce, challenge };
}
function decodeCode(raw: string): FakeCode | null {
  try {
    if (raw.length > 1024 || !/^fake\.[A-Za-z0-9_-]+$/.test(raw)) return null;
    const code = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        Uint8Array.from(atob(raw.slice(5).replace(/-/g, '+').replace(/_/g, '/')), (ch) =>
          ch.charCodeAt(0),
        ),
      ),
    ) as FakeCode;
    if (
      code.v !== 1 ||
      !['kakao', 'naver'].includes(code.p) ||
      typeof code.s !== 'string' ||
      !code.s.startsWith('dev-') ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(code.s) ||
      typeof code.c !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(code.c) ||
      typeof code.n !== 'string' ||
      !printable.test(code.n) ||
      typeof code.r !== 'string' ||
      typeof code.a !== 'string' ||
      !results.includes(code.x) ||
      !Number.isFinite(code.e)
    )
      return null;
    return code;
  } catch {
    return null;
  }
}

export function createFakeSocial(options: FakeSocialOptions): FakeSocial {
  const basePath = options.basePath.replace(/\/+$/, '');
  const now = options.now ?? Date.now;
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  const source: CertSource = {
    async key(kid) {
      return kid === 'dev-fake-1' ? (await signingKeys()).publicKey : null;
    },
  };
  const keys: Record<SocialProvider, CertSource> = { kakao: source, naver: source };
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const provider = (['kakao', 'naver'] as const).find(
      (p) => url === SOCIAL_PROVIDERS[p].tokenUrl,
    );
    if (!provider) throw new Error('가짜 공급자는 외부 네트워크에 접속하지 않습니다.');
    const request = new Request(input, init);
    const form = new URLSearchParams(await request.text());
    const code = decodeCode(form.get('code') ?? '');
    const invalid = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    if (
      request.method !== 'POST' ||
      form.get('grant_type') !== 'authorization_code' ||
      !code ||
      code.p !== provider ||
      form.get('client_id') !== code.a ||
      code.a !== FAKE_CLIENT_IDS[provider] ||
      form.get('client_secret') !== FAKE_CLIENT_SECRET ||
      form.get('redirect_uri') !== code.r ||
      now() >= code.e ||
      (await hash(form.get('code_verifier') ?? '')) !== code.c ||
      !['ok', 'bad-code', 'down'].includes(code.x)
    )
      return invalid();
    if (code.x === 'bad-code') return invalid();
    if (code.x === 'down')
      return Response.json({ error: 'temporarily_unavailable' }, { status: 503 });
    const iat = Math.floor(now() / 1000);
    const content =
      encode({ alg: 'RS256', kid: 'dev-fake-1', typ: 'JWT' }) +
      '.' +
      encode({
        iss: SOCIAL_PROVIDERS[provider].issuer,
        aud: code.a,
        sub: code.s,
        iat,
        exp: iat + 600,
        nonce: code.n,
      });
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      (await signingKeys()).privateKey,
      new TextEncoder().encode(content),
    );
    return Response.json({
      access_token: 'dev-fake',
      token_type: 'bearer',
      id_token: content + '.' + base64url(new Uint8Array(signature)),
    });
  };
  function approve(query: URLSearchParams, redirectUris: readonly string[]): string | null {
    const auth = authorization(query, redirectUris);
    if (!auth) return null;
    const input = query.get('sub') ?? '';
    const sub = input.startsWith('dev-') ? input : 'dev-' + input;
    const result = query.get('result') as FakeSocialResult;
    if (!input || !/^[A-Za-z0-9._-]{1,64}$/.test(sub) || !results.includes(result)) return null;
    const callback = new URL(auth.redirectUri);
    callback.searchParams.set('state', auth.state);
    if (result === 'cancel') callback.searchParams.set('error', 'access_denied');
    else if (result === 'provider-error') {
      callback.searchParams.set('error', 'server_error');
      callback.searchParams.set('error_description', '개발용 공급자 오류입니다.');
    } else {
      const code =
        'fake.' +
        encode({
          v: 1,
          p: auth.provider,
          s: sub,
          c: auth.challenge,
          n: auth.nonce,
          r: auth.redirectUri,
          a: auth.clientId,
          x: result,
          e: now() + 5 * 60 * 1000,
        } satisfies FakeCode);
      if (code.length > 1024) return null;
      callback.searchParams.set('code', code);
    }
    return callback.href;
  }
  return {
    keys,
    fetch: fakeFetch,
    approve,
    async handle(req: Request, redirectUris: readonly string[]): Promise<Response | null> {
      const url = new URL(req.url);
      if (
        !isLocalRequest(req) ||
        ![basePath + '/authorize', basePath + '/approve'].includes(url.pathname)
      )
        return null;
      if (req.method !== 'GET') return bad();
      const query = url.searchParams;
      const auth = authorization(query, redirectUris);
      if (!auth) return bad();
      if (url.pathname.endsWith('/authorize')) {
        const title = `가짜 ${auth.provider === 'kakao' ? '카카오' : '네이버'} 로그인(개발용)`;
        const hidden = [...query]
          .filter(([name]) => name !== 'sub' && name !== 'result')
          .map(
            ([name, value]) =>
              `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
          )
          .join('');
        const labels = [
          '정상 로그인',
          '취소',
          '공급자 오류',
          '코드 거절(토큰 단계 401)',
          '공급자 장애(토큰 단계 503)',
        ];
        const radios = results
          .map(
            (result, index) =>
              `<label><input type="radio" name="result" value="${result}"${index === 0 ? ' checked' : ''} />${labels[index]}</label>`,
          )
          .join('<br />');
        const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>${title}</title></head><body><h1>${title}</h1><p>개발용 가짜 공급자입니다. 운영에서는 쓰이지 않습니다.</p><form method="GET" action="${escapeHtml(basePath)}/approve">${hidden}<label>계정 ID (dev- 접두가 자동으로 붙어요) <input name="sub" value="${escapeHtml(options.defaultSub ?? 'dev-user')}" pattern="[A-Za-z0-9._-]{1,64}" maxlength="64" required /></label><fieldset><legend>로그인 결과</legend>${radios}</fieldset><button type="submit">계속</button></form></body></html>`;
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'private, no-store',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(auth.redirectUri).origin}; base-uri 'none'; frame-ancestors 'none'`,
          },
        });
      }
      const callback = approve(query, redirectUris);
      if (!callback) return bad();
      if (options.approveResponse !== 'refresh') {
        return new Response(null, { status: 302, headers: { ...headers, Location: callback } });
      }
      return new Response(
        `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${escapeHtml(callback)}"></head><body><a href="${escapeHtml(callback)}">앱으로 돌아가기</a></body></html>`,
        {
          headers: {
            ...headers,
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy':
              "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          },
        },
      );
    },
  };
}

export function isLocalRequest(request: Request): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);
}

export function fakeAuthorizeUrl(realUrl: string, fakeBase: string): string {
  const real = new URL(realUrl);
  const provider = (['kakao', 'naver'] as const).find(
    (p) => real.origin + real.pathname === SOCIAL_AUTHORIZE_URLS[p],
  );
  if (!provider) throw new Error('지원하지 않는 로그인 공급자예요.');
  const fake = new URL(fakeBase.replace(/\/+$/, '') + '/authorize');
  fake.search = real.search;
  fake.searchParams.set('provider', provider);
  return fake.href;
}
