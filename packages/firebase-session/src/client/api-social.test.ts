import { describe, expect, it, vi } from 'vitest';
import { AUTH_CODES, createSessionClient, type SessionClientOptions } from './api.js';

const input = {
  provider: 'naver' as const,
  code: 'code',
  codeVerifier: 'v'.repeat(43),
  redirectUri: 'https://app.test/cb',
};
function setup(o: Partial<SessionClientOptions<never>> = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
  const idToken = vi.fn(async () => null);
  const sessionId = vi.fn(async () => 'session');
  const api = createSessionClient({
    baseUrl: 'https://api.test',
    sessionHeader: 'X-S',
    credentials: { idToken, sessionId },
    fetch,
    ...o,
  });
  return { api, fetch, idToken, sessionId };
}

describe('소셜 세션 클라이언트', () => {
  it('createSocialSession은 자격 증명 조회 없이 auth none으로 보낸다', async () => {
    const s = setup();
    await s.api.createSocialSession(input, '폰');
    expect(s.fetch).toHaveBeenCalledWith(
      'https://api.test/v1/session/social',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, label: '폰' }),
      }),
    );
    expect(s.idToken).not.toHaveBeenCalled();
    expect(s.sessionId).not.toHaveBeenCalled();
  });
  it('allowSessionOnly면 세션만 붙인다', async () => {
    const s = setup({ allowSessionOnly: true });
    expect(await s.api.listSessions()).toEqual({ ok: true, data: {} });
    expect(s.fetch.mock.calls[0]?.[1]?.headers).toEqual({ 'X-S': 'session' });
  });
  it('기본값은 토큰 없으면 이전과 같은 missing-token', async () => {
    const s = setup();
    expect(await s.api.listSessions()).toEqual({ ok: false, kind: 'auth', code: 'missing-token' });
    expect(s.sessionId).not.toHaveBeenCalled();
    expect(s.fetch).not.toHaveBeenCalled();
  });
  it('세션도 없거나 auth token이면 missing-token', async () => {
    const s = setup({
      allowSessionOnly: true,
      credentials: { idToken: async () => null, sessionId: async () => null },
    });
    expect(await s.api.listSessions()).toEqual({ ok: false, kind: 'auth', code: 'missing-token' });
    expect(await s.api.send('GET', '/x', { auth: 'token' })).toEqual({
      ok: false,
      kind: 'auth',
      code: 'missing-token',
    });
    expect(s.fetch).not.toHaveBeenCalled();
  });
  it('토큰이 있으면 이전과 같은 두 헤더', async () => {
    const s = setup({
      allowSessionOnly: true,
      credentials: { idToken: async () => 'token', sessionId: async () => 'session' },
    });
    await s.api.listSessions();
    expect(s.fetch.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: 'Bearer token',
      'X-S': 'session',
    });
  });
  it('세션 전용 invalid-token은 새 토큰으로 재시도하지 않는다', async () => {
    const s = setup({ allowSessionOnly: true });
    s.fetch.mockImplementation(async () =>
      Response.json({ error: 'invalid-token' }, { status: 401 }),
    );
    expect(await s.api.listSessions()).toEqual({
      ok: false,
      kind: 'auth',
      code: 'invalid-token',
      session: 'session',
    });
    expect(s.fetch).toHaveBeenCalledTimes(1);
    expect(s.idToken).toHaveBeenCalledTimes(1);
  });
  it('invalid-code를 그대로 매핑하고 소셜 로그인은 재시도하지 않는다', async () => {
    const s = setup();
    s.fetch.mockImplementation(async () =>
      Response.json({ error: 'invalid-code' }, { status: 401 }),
    );
    expect(AUTH_CODES.has('invalid-code')).toBe(true);
    expect(await s.api.createSocialSession(input, '폰')).toEqual({
      ok: false,
      kind: 'auth',
      code: 'invalid-code',
    });
    expect(s.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    'kakao:AbC',
    'kakao:AbC\n',
    'naver:123',
    undefined,
    'google:123',
    'kakao:',
    'kakao:한글',
    'naver:a b',
    `kakao:${'a'.repeat(129)}`,
    42,
  ])('403 account %s는 형식을 검사해 붙인다', async (account) => {
    const s = setup();
    s.fetch.mockImplementation(async () =>
      Response.json({ error: 'not-allowed', account }, { status: 403 }),
    );
    const valid = account === 'kakao:AbC' || account === 'naver:123';
    expect(await s.api.createSocialSession(input, '폰')).toEqual({
      ok: false,
      kind: 'not-allowed',
      ...(valid && { account }),
    });
  });
});
