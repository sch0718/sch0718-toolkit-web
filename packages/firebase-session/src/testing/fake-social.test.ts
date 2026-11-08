// 가짜 공급자를 실제 클라이언트·Worker 인증 흐름과 함께 시험한다.
import { afterEach, describe, expect, it } from 'vitest';
import { beginSocialSignIn, readSocialCallback, SOCIAL_AUTHORIZE_URLS } from '../client/social.js';
import { createSessionAuth, SOCIAL_PROVIDERS, type SocialProvider } from '../worker/index.js';
import { createTestD1 } from './d1.js';
import { certs, PROJECT, T0 } from '../../test/tokens.js';
import {
  createFakeSocial,
  fakeAuthorizeUrl,
  FAKE_CLIENT_IDS,
  FAKE_CLIENT_SECRET,
  isLocalRequest,
} from './fake-social.js';

const BASE = 'http://localhost:8787/dev/fake-social';
const REDIRECT = 'http://localhost:5173/auth/callback';
const redirectUris = [REDIRECT];
const databases: ReturnType<typeof createTestD1>[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.raw.close();
});

async function start(provider: SocialProvider = 'kakao') {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
    removeItem: (key: string) => {
      saved.delete(key);
    },
  };
  let real = '';
  await beginSocialSignIn(provider, {
    clientId: FAKE_CLIENT_IDS[provider],
    redirectUri: REDIRECT,
    storage,
    navigate: (url) => {
      real = url;
    },
    random: (n) => new Uint8Array(n).fill(7),
    now: () => T0,
  });
  const url = new URL(fakeAuthorizeUrl(real, BASE + '/'));
  const query = new URLSearchParams(url.search);
  query.set('sub', 'user');
  query.set('result', 'ok');
  return { url, query, storage };
}

function form(query: URLSearchParams, code: string) {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: query.get('client_id')!,
    client_secret: FAKE_CLIENT_SECRET,
    redirect_uri: REDIRECT,
    code,
    code_verifier: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))).replace(/=+$/, ''),
  });
}

function setupAuth(fake: ReturnType<typeof createFakeSocial>) {
  const db = createTestD1({ migrations: new URL('../../migrations/', import.meta.url) });
  databases.push(db);
  return createSessionAuth({
    db,
    projectId: PROJECT,
    allowedEmails: undefined,
    certs,
    sessionHeader: 'X-S',
    now: () => T0,
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    uuid: () => crypto.randomUUID(),
    social: {
      allowedAccounts: 'kakao:dev-user,naver:dev-user',
      kakao: { clientId: FAKE_CLIENT_IDS.kakao, clientSecret: FAKE_CLIENT_SECRET, redirectUris },
      naver: { clientId: FAKE_CLIENT_IDS.naver, clientSecret: FAKE_CLIENT_SECRET, redirectUris },
      keys: fake.keys,
      fetch: fake.fetch,
    },
  });
}

describe('가짜 소셜 공급자', () => {
  it.each(['kakao', 'naver'] as const)(
    '%s 인가 화면부터 세션 생성까지 연결된다',
    async (provider) => {
      const { url, query, storage } = await start(provider);
      const fake = createFakeSocial({ basePath: '/dev/fake-social', now: () => T0 });
      const screen = await fake.handle(new Request(url), redirectUris);
      expect(screen?.status).toBe(200);
      expect(screen?.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      expect(screen?.headers.get('Cache-Control')).toBe('private, no-store');
      expect(screen?.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(screen?.headers.get('Content-Security-Policy')).toBe(
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' http://localhost:5173; base-uri 'none'; frame-ancestors 'none'",
      );
      const html = await screen!.text();
      for (const [name, value] of url.searchParams) {
        expect(html).toContain(`name="${name}" value="${value}"`);
      }
      for (const result of ['ok', 'cancel', 'provider-error', 'bad-code', 'down']) {
        expect(html).toContain(`name="result" value="${result}"`);
      }
      expect(html).toContain('value="dev-user"');
      const approved = await fake.handle(new Request(`${BASE}/approve?${query}`), redirectUris);
      expect(approved?.status).toBe(302);
      expect(approved?.headers.get('Cache-Control')).toBe('private, no-store');
      const callback = readSocialCallback(approved!.headers.get('Location')!, {
        storage,
        now: () => T0,
      });
      expect(callback?.ok).toBe(true);
      if (!callback?.ok) throw new Error('성공 콜백이 필요합니다.');
      // 요청마다 새 인스턴스를 만들어도 코드와 서명 키를 쓸 수 있다.
      const auth = setupAuth(createFakeSocial({ basePath: '/dev/fake-social', now: () => T0 }));
      const session = await auth.createSocial(new Request('http://localhost'), callback);
      expect(session.user.sub).toBe(`${provider}:dev-user`);
      expect(
        (
          await auth.authenticate(
            new Request('http://localhost', { headers: { 'X-S': session.sessionId } }),
          )
        ).user.sub,
      ).toBe(`${provider}:dev-user`);
      expect(await fake.keys[provider].key('unknown')).toBeNull();
    },
  );

  it.each([
    ['cancel', 'access_denied'],
    ['provider-error', 'server_error'],
  ] as const)('%s는 오류 콜백을 만든다', async (result, error) => {
    const { query } = await start();
    query.set('result', result);
    const fake = createFakeSocial({ basePath: '/dev/fake-social' });
    const response = await fake.handle(new Request(`${BASE}/approve?${query}`), redirectUris);
    const callback = new URL(response!.headers.get('Location')!);
    expect(callback.searchParams.get('error')).toBe(error);
    expect(callback.searchParams.get('state')).toBe(query.get('state'));
    expect(callback.searchParams.has('code')).toBe(false);
  });

  it.each([
    ['bad-code', 401, 'invalid-code'],
    ['down', 503, 'provider-unavailable'],
  ] as const)('%s는 토큰 교환 오류를 Worker에 전달한다', async (result, status, code) => {
    const { query, storage } = await start();
    query.set('result', result);
    const fake = createFakeSocial({ basePath: '/dev/fake-social', now: () => T0 });
    const callback = readSocialCallback(fake.approve(query, redirectUris)!, {
      storage,
      now: () => T0,
    });
    await expect(
      setupAuth(fake).createSocial(new Request('http://localhost'), callback),
    ).rejects.toMatchObject({ status, code });
  });

  it.each(['https://example.test', 'http://localhost.evil.test', 'http://192.168.0.1'])(
    '외부 호스트 %s는 응답하지 않는다',
    async (origin) => {
      const { url } = await start();
      url.host = new URL(origin).host;
      url.protocol = new URL(origin).protocol;
      expect(isLocalRequest(new Request(url))).toBe(false);
      expect(
        await createFakeSocial({ basePath: '/dev/fake-social' }).handle(
          new Request(url),
          redirectUris,
        ),
      ).toBeNull();
    },
  );
  it.each(['localhost', '127.0.0.1', '[::1]'])('로컬 호스트 %s를 받는다', (host) => {
    expect(isLocalRequest(new Request(`http://${host}:8787`))).toBe(true);
  });
  it('다른 경로는 null, GET 이외는 400이다', async () => {
    const fake = createFakeSocial({ basePath: '/dev/fake-social/' });
    expect(await fake.handle(new Request('http://localhost/other'), redirectUris)).toBeNull();
    const { url } = await start();
    expect((await fake.handle(new Request(url, { method: 'POST' }), redirectUris))?.status).toBe(
      400,
    );
  });
  it.each([
    ['provider', 'google'],
    ['client_id', 'real-client'],
    ['redirect_uri', 'https://evil.test'],
    ['response_type', 'token'],
    ['state', ''],
    ['nonce', '\n'],
    ['code_challenge', 'bad'],
    ['code_challenge_method', 'plain'],
    ['sub', ''],
    ['sub', 'x'.repeat(64)],
    ['result', 'unknown'],
  ])('잘못된 %s를 거절한다', async (name, value) => {
    const { query } = await start();
    query.set(name, value);
    const fake = createFakeSocial({ basePath: '/dev/fake-social' });
    expect(fake.approve(query, redirectUris)).toBeNull();
  });
  it('잘못된 approve 요청은 400이다', async () => {
    const { query } = await start();
    query.set('result', 'unknown');
    const fake = createFakeSocial({ basePath: '/dev/fake-social' });
    expect((await fake.handle(new Request(`${BASE}/approve?${query}`), redirectUris))?.status).toBe(
      400,
    );
  });
  it('인가 화면은 질의의 sub·result를 hidden으로 옮기지 않는다', async () => {
    const { url } = await start();
    url.searchParams.set('sub', 'dev-x');
    url.searchParams.set('result', 'bad-code');
    const res = await createFakeSocial({ basePath: '/dev/fake-social' }).handle(
      new Request(url),
      redirectUris,
    );
    const html = await res!.text();
    expect(html).not.toContain('type="hidden" name="sub"');
    expect(html).not.toContain('type="hidden" name="result"');
  });
  it('네이버는 openid scope가 있어야 한다', async () => {
    const { query } = await start('naver');
    query.delete('scope');
    expect(
      createFakeSocial({ basePath: '/dev/fake-social' }).approve(query, redirectUris),
    ).toBeNull();
  });
  it('설정한 기본 계정과 HTML 값을 이스케이프한다', async () => {
    const { url } = await start();
    url.searchParams.set('state', '<"&\'>');
    const fake = createFakeSocial({ basePath: '/dev/fake-social', defaultSub: 'dev-me' });
    const response = await fake.handle(new Request(url), redirectUris);
    const html = await response!.text();
    expect(html).toContain('value="dev-me"');
    expect(html).toContain('value="&lt;&quot;&amp;&#39;&gt;"');
  });
  it('refresh 응답은 200 HTML로 콜백을 안내한다', async () => {
    const { query } = await start();
    const fake = createFakeSocial({ basePath: '/dev/fake-social', approveResponse: 'refresh' });
    const response = await fake.handle(new Request(`${BASE}/approve?${query}`), redirectUris);
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await response!.text()).toContain(
      '<meta http-equiv="refresh" content="0;url=http://localhost:5173/auth/callback?state=',
    );
  });
  it.each([
    ['grant_type', 'refresh_token'],
    ['client_id', 'real'],
    ['client_secret', 'real'],
    ['redirect_uri', 'http://localhost/other'],
    ['code_verifier', 'wrong'],
    ['code', 'fake.bad'],
  ])('토큰 교환의 %s를 검사한다', async (name, value) => {
    const { query } = await start();
    const fake = createFakeSocial({ basePath: '/dev/fake-social', now: () => T0 });
    const code = new URL(fake.approve(query, redirectUris)!).searchParams.get('code')!;
    const body = form(query, code);
    body.set(name, value);
    const response = await fake.fetch(SOCIAL_PROVIDERS.kakao.tokenUrl, { method: 'POST', body });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_grant' });
  });
  it('dev- 접두 없는 위조 코드와 만료된 코드를 거절한다', async () => {
    const { query } = await start();
    let now = T0;
    const fake = createFakeSocial({ basePath: '/dev/fake-social', now: () => now });
    const code = new URL(fake.approve(query, redirectUris)!).searchParams.get('code')!;
    const decoded = JSON.parse(atob(code.slice(5).replace(/-/g, '+').replace(/_/g, '/'))) as Record<
      string,
      unknown
    >;
    expect(decoded['s']).toBe('dev-user');
    decoded['s'] = 'real-user';
    const forged =
      'fake.' +
      btoa(JSON.stringify(decoded)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(
      (
        await fake.fetch(SOCIAL_PROVIDERS.kakao.tokenUrl, {
          method: 'POST',
          body: form(query, forged),
        })
      ).status,
    ).toBe(400);
    now += 5 * 60 * 1000;
    expect(
      (
        await fake.fetch(
          new Request(SOCIAL_PROVIDERS.kakao.tokenUrl, { method: 'POST', body: form(query, code) }),
        )
      ).status,
    ).toBe(400);
  });
  it('모르는 토큰 주소는 외부 호출 없이 던진다', async () => {
    await expect(
      createFakeSocial({ basePath: '/dev/fake-social' }).fetch('https://example.test'),
    ).rejects.toThrow();
  });
});

describe('fakeAuthorizeUrl', () => {
  it.each(['kakao', 'naver'] as const)('%s 질의를 보존하고 끝 슬래시를 무시한다', (provider) => {
    const url = new URL(
      fakeAuthorizeUrl(SOCIAL_AUTHORIZE_URLS[provider] + '?state=s&scope=openid', BASE + '///'),
    );
    expect(url.href).toBe(`${BASE}/authorize?state=s&scope=openid&provider=${provider}`);
  });
  it.each([
    'http://kauth.kakao.com/oauth/authorize',
    'https://kauth.kakao.com/other',
    'https://kauth.kakao.com:444/oauth/authorize',
    'https://kauth.kakao.com.evil.test/oauth/authorize',
    'https://nid.naver.com/oauth/authorize',
  ])('정확한 origin과 경로가 아닌 %s를 거절한다', (url) => {
    expect(() => fakeAuthorizeUrl(url, BASE)).toThrow();
  });
});
