import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  beginSocialSignIn,
  readSocialCallback,
  readSocialConfig,
  socialAuthorizeUrl,
  socialNonce,
  stripSocialCallback,
} from './social.js';

const KEY = '@sch0718/firebase-session:social-pending';
const T0 = 1_000_000;
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const redirectUri = 'https://app.test/callback?keep=한글';
const pending = {
  provider: 'kakao',
  state: 'state',
  verifier,
  redirectUri,
  createdAt: T0,
};
function storage(value: unknown = pending) {
  const data = new Map<string, string>(value === null ? [] : [[KEY, JSON.stringify(value)]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: vi.fn((k: string) => {
      data.delete(k);
    }),
  };
}

describe('소셜 인가 URL', () => {
  it.each(['kakao', 'naver'] as const)('%s OIDC·S256·state·nonce를 인코딩한다', (provider) => {
    const url = new URL(
      socialAuthorizeUrl(provider, {
        clientId: 'public-id',
        redirectUri,
        state: 'a+b',
        nonce: 'n&c',
        codeChallenge: 'challenge',
        prompt: 'select_account',
      }),
    );
    expect(url.origin + url.pathname).toBe(
      provider === 'kakao'
        ? 'https://kauth.kakao.com/oauth/authorize'
        : 'https://nid.naver.com/oauth2/authorize',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'public-id',
      redirect_uri: redirectUri,
      // 카카오는 OIDC를 앱 설정으로 켜고 scope는 추가 동의 때만 쓴다. 네이버 OIDC는 scope=openid가 필수다.
      ...(provider === 'naver' && { scope: 'openid' }),
      state: 'a+b',
      nonce: 'n&c',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
  });
  it('prompt는 기본으로 보내지 않는다', () => {
    expect(
      new URL(
        socialAuthorizeUrl('kakao', {
          clientId: 'id',
          redirectUri,
          state: 's',
          nonce: 'n',
          codeChallenge: 'c',
        }),
      ).searchParams.has('prompt'),
    ).toBe(false);
  });
});

describe('beginSocialSignIn', () => {
  it('RFC 7636 Appendix B 벡터로 challenge를 만들고 저장 후 이동한다', async () => {
    const s = storage(null);
    const navigate = vi.fn();
    const bytes = new Uint8Array(Buffer.from(verifier, 'base64url'));
    const random = vi.fn((n: number) => {
      expect(n).toBe(32);
      return bytes;
    });
    await beginSocialSignIn('naver', {
      clientId: 'public-id',
      redirectUri,
      storage: s,
      navigate,
      random,
      now: () => T0,
    });
    const saved = JSON.parse(s.getItem(KEY)!);
    expect(saved).toEqual({
      provider: 'naver',
      state: verifier,
      verifier,
      redirectUri,
      createdAt: T0,
    });
    const url = new URL(navigate.mock.calls[0]![0] as string);
    expect(url.searchParams.get('code_challenge')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
    expect(url.searchParams.get('state')).toBe(saved.state);
    expect(url.searchParams.get('nonce')).toBe(await socialNonce(verifier));
    expect(random).toHaveBeenCalledTimes(2);
  });
  it('요청에 적힌 다른 verifier도 SHA-256으로 계산한다', async () => {
    const navigate = vi.fn();
    await beginSocialSignIn('kakao', {
      clientId: 'id',
      redirectUri,
      storage: storage(null),
      navigate,
      random: () =>
        new Uint8Array(Buffer.from('dBjftJeZ4CVP-mJ92K9rRrtNUmXNSjmcLe9rEP0Udoo', 'base64url')),
    });
    expect(new URL(navigate.mock.calls[0]![0] as string).searchParams.get('code_challenge')).toBe(
      'OVt-3AsIU0mwIgsjDBQCSxBYJF4soYaWyzIvI8nEZxs',
    );
  });
  it('새로 시작하면 덮어쓰고 기본 난수는 매번 달라진다', async () => {
    const s = storage();
    const navigate = vi.fn();
    await beginSocialSignIn('kakao', { clientId: 'id', redirectUri, storage: s, navigate });
    const a = s.getItem(KEY);
    await beginSocialSignIn('naver', { clientId: 'id', redirectUri, storage: s, navigate });
    expect(s.getItem(KEY)).not.toBe(a);
  });
  it('저장할 수 없으면 reject하고 이동하지 않는다', async () => {
    const navigate = vi.fn();
    const s = storage();
    s.setItem = () => {
      throw new Error('storage');
    };
    await expect(
      beginSocialSignIn('kakao', { clientId: 'id', redirectUri, storage: s, navigate }),
    ).rejects.toThrow();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('readSocialCallback', () => {
  it('성공하면 verifier를 돌려주고 한 번만 읽는다', () => {
    const s = storage();
    const url = 'https://app.test/callback?code=abc&state=state';
    expect(readSocialCallback(url, { storage: s, now: () => T0 })).toEqual({
      ok: true,
      provider: 'kakao',
      code: 'abc',
      codeVerifier: verifier,
      redirectUri,
    });
    expect(s.removeItem).toHaveBeenCalledWith(KEY);
    expect(readSocialCallback(url, { storage: s, now: () => T0 })).toBeNull();
  });
  it.each([
    ['code=abc&state=wrong', 0, 'state-mismatch'],
    ['code=abc', 0, 'state-mismatch'],
    ['code=abc&state=state', 600_000, 'expired'],
    ['error=access_denied&state=state', 0, 'cancelled'],
    ['error=server_error&state=state', 0, 'provider-error'],
    ['code=&state=state', 0, 'provider-error'],
  ] as const)('%s → %s %s, 실패도 한 번만 읽는다', (query, delta, reason) => {
    const s = storage();
    const url = `https://app.test/callback?${query}`;
    expect(readSocialCallback(url, { storage: s, now: () => T0 + delta })).toMatchObject({
      ok: false,
      provider: 'kakao',
      reason,
    });
    expect(readSocialCallback(url, { storage: s, now: () => T0 })).toBeNull();
  });
  it('공급자 오류 코드는 제한하고 설명은 돌려주지 않는다', () => {
    const read = (error: string) =>
      readSocialCallback(
        `https://app.test/callback?state=state&error=${encodeURIComponent(error)}&error_description=secret`,
        { storage: storage(), now: () => T0 },
      );
    expect(read('server_error')).toEqual({
      ok: false,
      provider: 'kakao',
      reason: 'provider-error',
      error: 'server_error',
    });
    for (const error of ['<script>', 'x'.repeat(65), 'server_error\n'])
      expect(read(error)).toEqual({ ok: false, provider: 'kakao', reason: 'provider-error' });
  });
  it('pending이 없거나 깨졌으면 null', () => {
    for (const value of [
      null,
      {},
      42,
      { ...pending, provider: 'google' },
      { ...pending, redirectUri: 'not-url' },
    ]) {
      expect(
        readSocialCallback('https://app.test/callback?code=c&state=state', {
          storage: storage(value),
        }),
      ).toBeNull();
    }
    const s = storage();
    s.setItem(KEY, '{bad');
    expect(readSocialCallback('https://app.test/callback?code=c', { storage: s })).toBeNull();
  });
  it('콜백이 아니면 저장값을 보존한다', () => {
    const s = storage();
    expect(readSocialCallback('https://app.test/?keep=x', { storage: s })).toBeNull();
    expect(s.removeItem).not.toHaveBeenCalled();
  });
});

it('stripSocialCallback은 콜백 매개변수만 지운다', () => {
  expect(
    stripSocialCallback(
      new URL('https://app.test/cb?code=c&state=s&error=e&error_description=d&keep=1#anchor'),
    ),
  ).toBe('https://app.test/cb?keep=1#anchor');
});
it('readSocialConfig는 공개 clientId만 읽고 공백을 지운다', () => {
  expect(readSocialConfig({})).toBeNull();
  expect(
    readSocialConfig({ VITE_KAKAO_LOGIN_CLIENT_ID: true, VITE_NAVER_LOGIN_CLIENT_ID: ' ' }),
  ).toBeNull();
  expect(
    readSocialConfig({
      VITE_KAKAO_LOGIN_CLIENT_ID: ' k ',
      VITE_NAVER_LOGIN_CLIENT_ID: ' n ',
      NAVER_CLIENT_SECRET: 'secret',
    }),
  ).toEqual({ kakao: { clientId: 'k' }, naver: { clientId: 'n' } });
  expect(readSocialConfig({ VITE_NAVER_LOGIN_CLIENT_ID: 'n' })).toEqual({
    naver: { clientId: 'n' },
  });
});

it('socialNonce는 UTF-8 SHA-256 고정 벡터와 같다', async () => {
  expect(await socialNonce(verifier)).toBe(
    createHash('sha256')
      .update('nonce:' + verifier)
      .digest('base64url'),
  );
});

describe('콜백 redirect 경로 확인', () => {
  it.each(['https://app.test/other', 'https://other.test/callback'])(
    '%s는 state·만료·공급자 오류보다 먼저 거절하고 한 번만 읽는다',
    (base) => {
      const s = storage();
      const url = base + '?error=access_denied&state=wrong';
      expect(readSocialCallback(url, { storage: s, now: () => T0 + 600_000 })).toEqual({
        ok: false,
        reason: 'redirect-mismatch',
        provider: 'kakao',
      });
      expect(readSocialCallback(url, { storage: s })).toBeNull();
    },
  );
  it('쿼리 차이는 무시한다', () => {
    expect(
      readSocialCallback('https://app.test/callback?code=c&state=state&keep=other', {
        storage: storage(),
        now: () => T0,
      }),
    ).toEqual({
      ok: true,
      provider: 'kakao',
      code: 'c',
      codeVerifier: verifier,
      redirectUri,
    });
  });
});
