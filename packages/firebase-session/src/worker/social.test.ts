import { SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { createTestD1 } from '../../test/d1.js';
import { CLIENT_ID, publicJwk, socialBody, socialToken } from '../../test/social.js';
import { certs, otherKeys, PROJECT, T0 } from '../../test/tokens.js';
import { HttpError } from './http.js';
import { createSessionAuth, SESSION_PATHS, SESSION_TTL } from './session.js';
import {
  parseAccountList,
  SOCIAL_PROVIDERS,
  socialKeys,
  type SocialLoginOptions,
} from './social.js';

function setup(extra: Partial<SocialLoginOptions> = {}, enabled = true, noKakao = false) {
  const db = createTestD1();
  const f = vi.fn<typeof fetch>(async () => Response.json({ id_token: await socialToken() }));
  const social: SocialLoginOptions = {
    allowedAccounts: 'kakao:AbC,naver:AbC',
    kakao: { clientId: CLIENT_ID, clientSecret: 'test-secret' },
    naver: { clientId: CLIENT_ID },
    keys: { kakao: certs, naver: certs },
    fetch: f,
    ...extra,
  };
  if (noKakao) delete social.kakao;
  const auth = createSessionAuth({
    db,
    projectId: PROJECT,
    allowedEmails: undefined,
    certs,
    sessionHeader: 'X-S',
    now: () => T0,
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    uuid: () => crypto.randomUUID(),
    ...(enabled && { social }),
  });
  return {
    auth,
    db,
    f,
    create: (body: unknown = socialBody) =>
      auth.createSocial(new Request('https://api.test'), body),
  };
}
const fails = async (p: Promise<unknown>, status: number, code: string, extra = {}) => {
  const error = await p.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(HttpError);
  expect(error).toMatchObject({ status, code, extra });
};

describe('소셜 설정', () => {
  it('공급자 접두어만 소문자화하고 ID 대소문자는 유지한다', () => {
    expect(parseAccountList(' KAKAO:AbC, nAvEr:DeF, ,google:X,bad,kakao: ,kakao:AbC')).toEqual(
      new Set(['kakao:AbC', 'naver:DeF']),
    );
    expect(parseAccountList(undefined)).toEqual(new Set());
  });
  it('공급자 접두어 뒤의 ID는 그대로 보존한다', () => {
    expect(parseAccountList('KAKAO:Ab:C, NAVER:사용자')).toEqual(
      new Set(['kakao:Ab:C', 'naver:사용자']),
    );
  });
  it('공급자별 JWKS 캐시를 만든다', async () => {
    const f = vi.fn<typeof fetch>(async () => Response.json({ keys: [publicJwk] }));
    const sources = socialKeys(f, () => T0);
    await sources.kakao.key('k1');
    await sources.naver.key('k1');
    expect(f.mock.calls.map(([url]) => url)).toEqual([
      SOCIAL_PROVIDERS.kakao.jwksUrl,
      SOCIAL_PROVIDERS.naver.jwksUrl,
    ]);
    expect(SESSION_PATHS.social).toBe('/v1/session/social');
  });
});

describe('createSocial', () => {
  it.each(['kakao', 'naver'] as const)(
    '%s 세션과 사용자를 만들고 form으로 교환한다',
    async (provider) => {
      const s = setup();
      s.f.mockImplementation(async () =>
        Response.json({
          id_token: await socialToken({
            iss: SOCIAL_PROVIDERS[provider].issuer,
            email: provider === 'kakao' ? 'ME@EXAMPLE.TEST' : undefined,
          }),
        }),
      );
      const body = { ...socialBody, provider, label: '폰\u0000' };
      const result = await s.create(body);
      expect(result).toEqual({
        sessionId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        expiresAt: T0 + SESSION_TTL,
        user: {
          sub: `${provider}:AbC`,
          email: provider === 'kakao' ? 'me@example.test' : '',
          provider,
        },
      });
      const [url, init] = s.f.mock.calls[0]!;
      expect(url).toBe(SOCIAL_PROVIDERS[provider].tokenUrl);
      expect(init).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: expect.any(AbortSignal),
      });
      expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code: body.code,
        redirect_uri: body.redirectUri,
        code_verifier: body.codeVerifier,
        ...(provider === 'kakao' && { client_secret: 'test-secret' }),
      });
      expect(s.db.raw.prepare('SELECT identity, label FROM sessions').get()).toEqual({
        identity: `${provider}:AbC`,
        label: '폰',
      });
      expect(JSON.stringify(s.db.raw.prepare('SELECT * FROM sessions').all())).not.toContain(
        result.sessionId,
      );
    },
  );
  it.each([
    null,
    [],
    {},
    { provider: 'google' },
    { provider: null },
    ...['code', 'codeVerifier', 'nonce', 'redirectUri'].flatMap((field) => [
      { [field]: undefined },
      { [field]: 42 },
      { [field]: '' },
    ]),
    { code: 'a b' },
    { code: 'abc\n' },
    { codeVerifier: 'x'.repeat(43) + '\n' },
    { nonce: 'x'.repeat(16) + '\n' },
    { code: 'x'.repeat(1025) },
    { code: '한글' },
    { code: '\n' },
    { codeVerifier: 'x'.repeat(42) },
    { codeVerifier: 'x'.repeat(129) },
    { codeVerifier: '+'.repeat(43) },
    { nonce: 'x'.repeat(15) },
    { nonce: 'x'.repeat(129) },
    { nonce: '.'.repeat(16) },
    { redirectUri: 'not-url' },
    { redirectUri: 'https://app.test/#x' },
    { redirectUri: 'https://app.test/#' },
    { redirectUri: 'http://evil.test/x' },
    { redirectUri: 'ftp://localhost/x' },
    { redirectUri: `https://app.test/${'x'.repeat(2048)}` },
  ])('본문 형식 오류 %j: fetch 전에 거절', async (bad) => {
    const s = setup();
    await fails(
      s.create(
        bad === null || Array.isArray(bad) || Object.keys(bad).length === 0
          ? bad
          : { ...socialBody, ...bad },
      ),
      400,
      'bad-request',
    );
    expect(s.f).not.toHaveBeenCalled();
  });
  it.each(['http://localhost:123/cb', 'http://127.0.0.1/cb', 'http://[::1]/cb'])(
    '개발용 redirect %s',
    async (redirectUri) => {
      expect(await setup().create({ ...socialBody, redirectUri })).toHaveProperty('sessionId');
    },
  );
  it('설정 안 된 공급자는 호출하지 않는다', async () => {
    const s = setup({}, true, true);
    await fails(s.create(), 400, 'bad-request');
    expect(s.f).not.toHaveBeenCalled();
  });
  it('social 옵션이 없으면 404', async () => {
    const s = setup({}, false);
    await fails(s.create(), 404, 'not-found');
    expect(s.f).not.toHaveBeenCalled();
  });
  it.each(['', undefined, 'kakao:abc'])(
    '허용 밖이면 403에 account 포함: %s',
    async (allowedAccounts) => {
      const s = setup({ allowedAccounts });
      await fails(s.create(), 403, 'not-allowed', { account: 'kakao:AbC' });
      expect(s.db.raw.prepare('SELECT * FROM users').all()).toEqual([]);
    },
  );
  it.each([
    ['4xx', 401, 'invalid-code'],
    ['5xx', 503, 'provider-unavailable'],
    ['network', 503, 'provider-unavailable'],
    ['json', 401, 'invalid-token'],
    ['missing', 401, 'invalid-token'],
    ['number', 401, 'invalid-token'],
    ['null', 401, 'invalid-token'],
  ] as const)('토큰 엔드포인트 %s', async (mode, status, code) => {
    const s = setup();
    s.f.mockImplementation(async () => {
      if (mode === 'network') throw new Error('test-secret');
      if (mode === '4xx' || mode === '5xx')
        return new Response('test-secret', { status: mode === '4xx' ? 400 : 500 });
      if (mode === 'json') return new Response('test-secret');
      return Response.json(mode === 'null' ? null : mode === 'missing' ? {} : { id_token: 42 });
    });
    await fails(s.create(), status, code);
  });
  it.each([
    { iss: 'wrong' },
    { aud: 'wrong' },
    { azp: 'wrong' },
    { exp: T0 / 1000 - 61 },
    { exp: undefined },
    { iat: T0 / 1000 + 61 },
    { iat: T0 / 1000 - 301 },
    { iat: undefined },
    { iat: 'bad' },
    { nonce: 'wrong' },
    { nonce: undefined },
    { sub: undefined },
    { sub: '' },
    { sub: 'x'.repeat(129) },
  ])('클레임 위반 %j', async (claims) => {
    const s = setup();
    s.f.mockResolvedValue(Response.json({ id_token: await socialToken(claims) }));
    await fails(s.create(), 401, 'invalid-token');
  });
  it('서명 위조·모르는 kid·none·HS256 거절', async () => {
    const s = setup();
    for (const id_token of [
      await socialToken({}, { key: otherKeys.privateKey }),
      await socialToken({}, { kid: 'unknown' }),
      new UnsecuredJWT({ sub: 'AbC' }).encode(),
      await new SignJWT({ sub: 'AbC' })
        .setProtectedHeader({ alg: 'HS256', kid: 'k1' })
        .sign(new Uint8Array(32)),
      'bad-token',
    ]) {
      s.f.mockResolvedValue(Response.json({ id_token }));
      await fails(s.create(), 401, 'invalid-token');
    }
  });
  it('주입한 키 소스가 실패해도 오류 내용을 노출하지 않고 503', async () => {
    const source = {
      key: async () => {
        throw new Error('test-secret');
      },
    };
    await fails(
      setup({ keys: { kakao: source, naver: source } }).create(),
      503,
      'provider-unavailable',
    );
  });
  it('JWKS 장애는 503', async () => {
    const down = socialKeys(async () => {
      throw new Error('network');
    });
    await fails(setup({ keys: down }).create(), 503, 'provider-unavailable');
  });
});
