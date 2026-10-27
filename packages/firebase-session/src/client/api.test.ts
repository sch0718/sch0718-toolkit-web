import { describe, expect, it, vi } from 'vitest';
import { createSessionClient, type Credentials } from './api.js';

const BASE = 'https://sync.example.test/';
const creds = (o: Partial<Credentials> = {}): Credentials => ({
  idToken: async (force) => (force ? 'fresh' : 'tok'),
  sessionId: async () => 's1',
  ...o,
});
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

function client(fetchImpl: typeof fetch, c = creds()) {
  return createSessionClient({
    baseUrl: BASE,
    credentials: c,
    sessionHeader: 'X-Test-Session',
    fetch: fetchImpl,
  });
}

describe('createSessionClient', () => {
  it('토큰과 서비스가 정한 세션 헤더를 붙이고, 쿠키·리퍼러·캐시 없이 보낸다', async () => {
    const f = vi.fn(async () => reply(200, { sessions: [] }));
    expect(await client(f).listSessions()).toEqual({ ok: true, data: { sessions: [] } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sync.example.test/v1/sessions');
    expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'X-Test-Session': 's1' });
    expect(init).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  });

  it('createSession은 넘겨받은 토큰만 쓰고 세션 헤더를 붙이지 않는다', async () => {
    const f = vi.fn(async () => reply(200, { sessionId: 'x', expiresAt: 1 }));
    await client(f).createSession('login-token', '노트북');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sync.example.test/v1/session');
    expect(init.headers).toEqual({
      Authorization: 'Bearer login-token',
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe(JSON.stringify({ label: '노트북' }));
  });

  it('revokeSession: others와 ID', async () => {
    const f = vi.fn(async () => reply(200, { revoked: 1 }));
    await client(f).revokeSession('others');
    await client(f).revokeSession('a/b');
    expect(f.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      'https://sync.example.test/v1/sessions?others=1',
      'https://sync.example.test/v1/sessions/a%2Fb',
    ]);
  });

  // 가즈아 Codex 리뷰(PR #39) 3: 오프라인에서 토큰 갱신이 실패해도 예외로 새지 않는다.
  it('ID 토큰을 받다 실패하면 offline', async () => {
    const f = vi.fn();
    const c = client(
      f,
      creds({ idToken: async () => Promise.reject(new Error('auth/network-request-failed')) }),
    );
    expect(await c.listSessions()).toEqual({ ok: false, kind: 'offline' });
    expect(f).not.toHaveBeenCalled();
  });

  it('fetch가 실패하면 offline', async () => {
    const c = client(vi.fn(async () => Promise.reject(new TypeError('network'))));
    expect(await c.endSession()).toEqual({ ok: false, kind: 'offline' });
  });

  it('로그인돼 있지 않거나 세션이 없으면 보내지 않는다', async () => {
    const f = vi.fn();
    expect(await client(f, creds({ idToken: async () => null })).listSessions()).toEqual({
      ok: false,
      kind: 'auth',
      code: 'missing-token',
    });
    expect(await client(f, creds({ sessionId: async () => null })).listSessions()).toEqual({
      ok: false,
      kind: 'auth',
      code: 'no-session',
    });
    expect(f).not.toHaveBeenCalled();
  });

  it('invalid-token이면 토큰을 한 번 새로 받아 다시 보낸다', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply(401, { error: 'invalid-token' }))
      .mockResolvedValueOnce(reply(200, {}));
    expect((await client(f).listSessions()).ok).toBe(true);
    expect((f.mock.calls[1] as unknown as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer fresh',
    });
  });

  it('인증 실패에는 그 요청이 쓴 세션을 실어 준다', async () => {
    const f = vi.fn(async () => reply(401, { error: 'session-revoked' }));
    expect(await client(f).listSessions()).toEqual({
      ok: false,
      kind: 'auth',
      code: 'session-revoked',
      session: 's1',
    });
  });

  it.each([
    [401, { error: 'weird' }, { ok: false, kind: 'auth', code: 'invalid-token' }],
    [403, { error: 'not-allowed' }, { ok: false, kind: 'not-allowed' }],
    [403, { error: 'origin' }, { ok: false, kind: 'server', status: 403 }],
    [404, undefined, { ok: false, kind: 'not-found' }],
    [413, undefined, { ok: false, kind: 'invalid', code: 'too-large' }],
    [422, { error: 'bad', path: 'a.b' }, { ok: false, kind: 'invalid', code: 'bad', path: 'a.b' }],
    [429, undefined, { ok: false, kind: 'limit', code: '429' }],
    [503, { error: 'certs-unavailable' }, { ok: false, kind: 'limit', code: 'certs-unavailable' }],
    [500, undefined, { ok: false, kind: 'server', status: 500 }],
  ])('%i %j → %j', async (status, body, expected) => {
    const r = await client(vi.fn(async () => reply(status, body))).send('GET', '/x', {
      auth: 'none',
    });
    expect(r).toEqual(expected);
  });

  it('mapStatus가 돌려준 서비스 고유 실패가 공통 매핑보다 먼저다', async () => {
    const c = createSessionClient<{ ok: false; kind: 'conflict'; revision: number }>({
      baseUrl: BASE,
      credentials: creds(),
      sessionHeader: 'X-Test-Session',
      fetch: vi.fn(async () => reply(409, { revision: 7 })),
      mapStatus: (status, body) =>
        status === 409
          ? { ok: false, kind: 'conflict', revision: Number(body['revision']) }
          : undefined,
    });
    expect(await c.send('PUT', '/p')).toEqual({ ok: false, kind: 'conflict', revision: 7 });
  });

  // JSON이지만 객체가 아닌 실패 본문(null·수·문자열·배열)은 빈 객체로 보고 실패 결과를 돌려준다.
  it.each([[null], [42], ['oops'], [['error']]])(
    '500 본문 %j → server 실패(reject하지 않는다)',
    async (body) => {
      const r = await client(vi.fn(async () => reply(500, body))).send('GET', '/x', {
        auth: 'none',
      });
      expect(r).toEqual({ ok: false, kind: 'server', status: 500 });
    },
  );

  it.each([[null], [['revision']]])('409 본문 %j → mapStatus는 빈 객체를 받는다', async (body) => {
    const mapStatus = vi.fn(() => undefined);
    const c = createSessionClient({
      baseUrl: BASE,
      credentials: creds(),
      sessionHeader: 'X-Test-Session',
      fetch: vi.fn(async () => reply(409, body)),
      mapStatus,
    });
    expect(await c.send('PUT', '/p', { auth: 'none' })).toEqual({
      ok: false,
      kind: 'server',
      status: 409,
    });
    expect(mapStatus).toHaveBeenCalledWith(409, {});
  });

  it('성공 본문은 null이어도 그대로 넘긴다', async () => {
    const r = await client(vi.fn(async () => reply(200, null))).send('GET', '/x', {
      auth: 'none',
    });
    expect(r).toEqual({ ok: true, data: null });
  });

  // 성공 응답의 본문을 다 받지 못했거나 JSON이 아니면 성공으로 보지 않는다(예: sessionId 없는 createSession).
  const send200 = (res: Response) =>
    client(vi.fn(async () => res)).send('GET', '/x', { auth: 'none' });

  it('2xx 본문을 읽다 스트림이 끊기면 offline', async () => {
    const broken = new ReadableStream({
      start: (c) => c.error(new TypeError('network')),
    });
    expect(await send200(new Response(broken, { status: 200 }))).toEqual({
      ok: false,
      kind: 'offline',
    });
  });

  it('2xx 본문이 JSON이 아니면 offline', async () => {
    expect(await send200(new Response('<html>', { status: 200 }))).toEqual({
      ok: false,
      kind: 'offline',
    });
    expect(await send200(new Response('', { status: 200 }))).toEqual({
      ok: false,
      kind: 'offline',
    });
  });

  it('204나 Content-Length: 0인 성공은 본문 없는 성공({})', async () => {
    expect(await send200(new Response(null, { status: 204 }))).toEqual({ ok: true, data: {} });
    const empty = new Response('', { status: 200, headers: { 'Content-Length': '0' } });
    expect(await send200(empty)).toEqual({ ok: true, data: {} });
  });

  it('실패 응답의 본문이 JSON이 아니면 지금처럼 빈 객체로 매핑한다', async () => {
    expect(await send200(new Response('<html>', { status: 500 }))).toEqual({
      ok: false,
      kind: 'server',
      status: 500,
    });
  });

  it("auth 'none'은 토큰 없이 보낸다", async () => {
    const f = vi.fn(async () => reply(200, {}));
    await client(f, creds({ idToken: async () => null })).send('GET', '/public', {
      auth: 'none',
      headers: { 'X-Share-Token': 'c' },
    });
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({
      'X-Share-Token': 'c',
    });
  });
});
