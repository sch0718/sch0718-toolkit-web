import { describe, expect, it, vi } from 'vitest';
import { createTestD1 } from '../../test/d1.js';
import { CLIENT_ID, socialBody, socialToken } from '../../test/social.js';
import { certs, ME, PROJECT, T0, token } from '../../test/tokens.js';
import { CertsUnavailableError } from './certs.js';
import { HttpError } from './http.js';
import { handleSessionRoute, type SessionRouteOptions } from './index.js';
import { createSessionAuth, SESSION_TTL, type SessionAuthOptions } from './session.js';

async function setup(extra: Partial<SessionAuthOptions> = {}) {
  const db = createTestD1();
  const auth = createSessionAuth({
    db,
    projectId: PROJECT,
    allowedEmails: ME,
    certs,
    sessionHeader: 'X-S',
    now: () => T0,
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    uuid: () => crypto.randomUUID(),
    social: {
      allowedAccounts: 'kakao:AbC',
      kakao: { clientId: CLIENT_ID },
      keys: { kakao: certs, naver: certs },
      fetch: async () => Response.json({ id_token: await socialToken() }),
    },
    ...extra,
  });
  const headers = { Authorization: `Bearer ${await token(T0)}` };
  const req = (method: string, path: string, sessionId?: string, body?: unknown) =>
    new Request(`https://api.test${path}`, {
      method,
      headers: { ...headers, ...(sessionId && { 'X-S': sessionId }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  const login = (label = '휴대폰') => auth.create(req('POST', '/v1/session'), { label });
  const revoked = () =>
    db.raw.prepare('SELECT count(*) AS n FROM sessions WHERE revoked_at IS NOT NULL').get();
  return { auth, db, req, login, revoked };
}

async function response(p: Promise<Response | null>, status: number, body: unknown) {
  const res = await p;
  expect(res).not.toBeNull();
  expect(res!.status).toBe(status);
  expect(res!.headers.get('Cache-Control')).toBe('no-store');
  expect(res!.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  expect(await res!.json()).toEqual(body);
  return res!;
}

const created = {
  sessionId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: T0 + SESSION_TTL,
};

describe('세션 라우트', () => {
  it('Google 세션을 만들고 본문의 기기 이름을 저장한다', async () => {
    const s = await setup();
    await response(
      handleSessionRoute(s.req('POST', '/v1/session', undefined, { label: '노트북' }), s.auth),
      200,
      created,
    );
    expect(s.db.raw.prepare('SELECT label FROM sessions').get()).toEqual({ label: '노트북' });
  });
  it('소셜 세션을 만들고 사용자 정보를 돌려준다', async () => {
    const s = await setup();
    await response(
      handleSessionRoute(
        new Request('https://api.test/v1/session/social', {
          method: 'POST',
          body: JSON.stringify(socialBody),
        }),
        s.auth,
      ),
      200,
      {
        ...created,
        user: { sub: 'kakao:AbC', email: '', provider: 'kakao', unverifiedEmail: ME },
      },
    );
  });
  it('인증한 기기의 세션 목록을 돌려준다', async () => {
    const s = await setup();
    const current = await s.login();
    const ctx = await s.auth.authenticate(s.req('GET', '/v1/sessions', current.sessionId));
    await response(
      handleSessionRoute(s.req('GET', '/v1/sessions', current.sessionId), s.auth),
      200,
      {
        sessions: [
          {
            id: ctx.sessionHash.slice(0, 12),
            label: '휴대폰',
            createdAt: T0,
            lastUsedAt: T0,
            expiresAt: T0 + SESSION_TTL,
            current: true,
          },
        ],
      },
    );
  });
  it.each(['current', 'others', 'id'] as const)('%s 철회 뒤에 훅을 부른다', async (mode) => {
    const s = await setup();
    const current = await s.login();
    await s.login('다른 기기');
    await s.login('세 번째 기기');
    const ctx = await s.auth.authenticate(s.req('GET', '/v1/sessions', current.sessionId));
    const id = (await s.auth.list(ctx)).find((r) => !r.current)!.id;
    const target = mode === 'id' ? { id } : mode;
    const path =
      mode === 'current'
        ? '/v1/session'
        : mode === 'others'
          ? '/v1/sessions?others=1'
          : `/v1/sessions/${id}`;
    const count = mode === 'others' ? 2 : 1;
    const events: string[] = [];
    const onRoute = vi.fn((pattern: string) => events.push(pattern));
    const onRevoke = vi.fn<NonNullable<SessionRouteOptions['onRevoke']>>(
      async (actualCtx, actualTarget, n) => {
        expect(actualCtx).toEqual(ctx);
        expect(actualTarget).toEqual(target);
        expect(n).toBe(count);
        expect(s.revoked()).toEqual({ n: count });
        await Promise.resolve();
        events.push('철회 뒤');
      },
    );
    await response(
      handleSessionRoute(s.req('DELETE', path, current.sessionId), s.auth, { onRoute, onRevoke }),
      200,
      { revoked: count },
    );
    expect(onRoute).toHaveBeenCalledExactlyOnceWith(
      mode === 'id' ? '/v1/sessions/:id' : path.split('?')[0],
    );
    expect(onRevoke).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toBe('철회 뒤');
  });
  it('철회할 다른 기기가 없어도 0으로 훅을 부른다', async () => {
    const s = await setup();
    const { sessionId } = await s.login();
    const onRevoke = vi.fn();
    await response(
      handleSessionRoute(s.req('DELETE', '/v1/sessions?others=1', sessionId), s.auth, { onRevoke }),
      200,
      { revoked: 0 },
    );
    expect(onRevoke).toHaveBeenCalledWith(expect.any(Object), 'others', 0);
  });
  it.each([
    '/v1/other',
    '/v1/session/',
    '/v1/sessions/',
    '/v1/sessions/a/b',
    '/v1/sessions-extra/a',
    '/v1/session/social/',
  ])('세션 경로 밖 %s는 null이고 훅을 부르지 않는다', async (path) => {
    const s = await setup();
    const onRoute = vi.fn();
    const beforeCreate = vi.fn();
    const onRevoke = vi.fn();
    expect(
      await handleSessionRoute(s.req('POST', path, undefined, {}), s.auth, {
        onRoute,
        beforeCreate,
        onRevoke,
      }),
    ).toBeNull();
    expect(onRoute).not.toHaveBeenCalled();
    expect(beforeCreate).not.toHaveBeenCalled();
    expect(onRevoke).not.toHaveBeenCalled();
  });
  it.each([
    ['/v1/session', '/v1/session', ['GET', 'PUT', 'OPTIONS']],
    ['/v1/session/social', '/v1/session/social', ['GET', 'DELETE', 'OPTIONS']],
    ['/v1/sessions', '/v1/sessions', ['POST', 'PATCH', 'OPTIONS']],
    ['/v1/sessions/abcdef123456', '/v1/sessions/:id', ['GET', 'POST', 'OPTIONS']],
  ] as const)(
    '%s의 다른 메서드는 인증 전에 405이고 패턴을 한 번 알린다',
    async (path, pattern, methods) => {
      const s = await setup();
      for (const method of methods) {
        const onRoute = vi.fn();
        const beforeCreate = vi.fn();
        await response(
          handleSessionRoute(new Request(`https://api.test${path}`, { method }), s.auth, {
            onRoute,
            beforeCreate,
          }),
          405,
          { error: 'method' },
        );
        expect(onRoute).toHaveBeenCalledExactlyOnceWith(pattern);
        expect(beforeCreate).not.toHaveBeenCalled();
      }
    },
  );
  it('path로 접두어를 떼고 쿼리는 원래 요청에서 읽는다', async () => {
    const s = await setup();
    const { sessionId } = await s.login();
    const onRoute = vi.fn();
    await response(
      handleSessionRoute(s.req('DELETE', '/api/sync/v1/sessions?others=1', sessionId), s.auth, {
        path: '/v1/sessions',
        onRoute,
      }),
      200,
      { revoked: 0 },
    );
    expect(onRoute).toHaveBeenCalledExactlyOnceWith('/v1/sessions');
  });
  it.each(['', '?others=0', '?others=1&x=1', '?others=1&others=1', '?x=1'])(
    '잘못된 쿼리 %s는 400이고 철회하지 않는다',
    async (query) => {
      const s = await setup();
      const { sessionId } = await s.login();
      await s.login();
      const onRevoke = vi.fn();
      await response(
        handleSessionRoute(s.req('DELETE', `/v1/sessions${query}`, sessionId), s.auth, {
          onRevoke,
        }),
        400,
        { error: 'bad-request' },
      );
      expect(s.revoked()).toEqual({ n: 0 });
      expect(onRevoke).not.toHaveBeenCalled();
    },
  );
  it('ID를 디코딩해 철회한다', async () => {
    const s = await setup();
    const { sessionId } = await s.login();
    const ctx = await s.auth.authenticate(s.req('GET', '/v1/sessions', sessionId));
    const id = ctx.sessionHash.slice(0, 12);
    const encoded = [...id].map((c) => `%${c.charCodeAt(0).toString(16)}`).join('');
    const onRevoke = vi.fn();
    await response(
      handleSessionRoute(s.req('DELETE', `/v1/sessions/${encoded}`, sessionId), s.auth, {
        onRevoke,
      }),
      200,
      { revoked: 1 },
    );
    expect(onRevoke).toHaveBeenCalledWith(ctx, { id }, 1);
  });
  it.each(['%E0%A4%A', '%2F', 'invalid', '000000000000'])(
    '디코딩 실패·없는 ID %s는 404이고 훅을 부르지 않는다',
    async (id) => {
      const s = await setup();
      const { sessionId } = await s.login();
      const onRoute = vi.fn();
      const onRevoke = vi.fn();
      await response(
        handleSessionRoute(s.req('DELETE', `/v1/sessions/${id}`, sessionId), s.auth, {
          onRoute,
          onRevoke,
        }),
        404,
        { error: 'not-found' },
      );
      expect(onRoute).toHaveBeenCalledExactlyOnceWith('/v1/sessions/:id');
      expect(onRevoke).not.toHaveBeenCalled();
      expect(s.revoked()).toEqual({ n: 0 });
    },
  );
  it.each(['/v1/session', '/v1/sessions', '/v1/sessions/%E0%A4%A'])(
    '인증 실패 %s는 쿼리·디코딩보다 먼저 401이고 훅을 부르지 않는다',
    async (path) => {
      const s = await setup();
      const onRevoke = vi.fn();
      await response(handleSessionRoute(s.req('DELETE', path), s.auth, { onRevoke }), 401, {
        error: 'no-session',
      });
      expect(onRevoke).not.toHaveBeenCalled();
    },
  );
});

describe('라우트 훅과 오류 변환', () => {
  it.each(['/v1/session', '/v1/session/social'])(
    '%s는 라우트 알림 → 빈도 제한 → 본문 읽기 순서다',
    async (path) => {
      const s = await setup();
      const req = s.req(
        'POST',
        path,
        undefined,
        path.endsWith('/social') ? socialBody : { label: '폰' },
      );
      const events: string[] = [];
      const onRoute = vi.fn((pattern: string) => {
        expect(req.bodyUsed).toBe(false);
        events.push(pattern);
      });
      const beforeCreate = vi.fn(async () => {
        expect(req.bodyUsed).toBe(false);
        await Promise.resolve();
        events.push('본문 전');
      });
      const res = await handleSessionRoute(req, s.auth, { onRoute, beforeCreate });
      expect(res!.status).toBe(200);
      expect(req.bodyUsed).toBe(true);
      expect(onRoute).toHaveBeenCalledExactlyOnceWith(path);
      expect(beforeCreate).toHaveBeenCalledExactlyOnceWith();
      expect(events).toEqual([path, '본문 전']);
    },
  );
  it.each(['/v1/session', '/v1/session/social'])(
    '%s 빈도 제한의 HttpError와 extra를 응답에 담고 본문을 읽지 않는다',
    async (path) => {
      const s = await setup();
      const req = new Request(`https://api.test${path}`, { method: 'POST', body: '잘못된 JSON' });
      await response(
        handleSessionRoute(req, s.auth, {
          beforeCreate: () => {
            throw new HttpError(429, 'rate-limit', { retryAfter: 30 });
          },
        }),
        429,
        { error: 'rate-limit', retryAfter: 30 },
      );
      expect(req.bodyUsed).toBe(false);
    },
  );
  it('소셜을 꺼도 빈도 제한 → 본문 검사 → 404 순서를 지킨다', async () => {
    const s = await setup({ social: undefined });
    const beforeCreate = vi.fn();
    await response(
      handleSessionRoute(
        new Request('https://api.test/v1/session/social', { method: 'POST', body: '잘못된 JSON' }),
        s.auth,
        { beforeCreate },
      ),
      400,
      { error: 'bad-json' },
    );
    await response(
      handleSessionRoute(s.req('POST', '/v1/session/social', undefined, socialBody), s.auth, {
        beforeCreate,
      }),
      404,
      { error: 'not-found' },
    );
    expect(beforeCreate).toHaveBeenCalledTimes(2);
  });
  it('인증서 장애를 503으로 바꾼다', async () => {
    const s = await setup({
      certs: {
        key: async () => {
          throw new CertsUnavailableError('장애');
        },
      },
    });
    const log = vi.fn();
    await response(
      handleSessionRoute(s.req('POST', '/v1/session', undefined, {}), s.auth, { log }),
      503,
      { error: 'certs-unavailable' },
    );
    expect(log).not.toHaveBeenCalled();
  });
  it.each([
    [new TypeError('비밀 요청 정보'), '@sch0718/firebase-session: internal TypeError'],
    ['비밀 요청 정보', '@sch0718/firebase-session: internal error'],
    [
      new Error('@sch0718/firebase-session: 마이그레이션을 적용해야 합니다'),
      '@sch0718/firebase-session: 마이그레이션을 적용해야 합니다',
    ],
  ])('예상 밖 오류는 500이고 안전한 문구만 기록한다: %s', async (error, message) => {
    const s = await setup();
    const log = vi.fn();
    await response(
      handleSessionRoute(s.req('POST', '/v1/session', undefined, {}), s.auth, {
        beforeCreate: async () => {
          throw error;
        },
        log,
      }),
      500,
      { error: 'internal' },
    );
    expect(log).toHaveBeenCalledExactlyOnceWith(message);
  });
  it('기본 로그는 console.error를 쓴다', async () => {
    const s = await setup();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await response(
        handleSessionRoute(s.req('POST', '/v1/session', undefined, {}), s.auth, {
          beforeCreate: () => {
            throw new Error('비밀');
          },
        }),
        500,
        { error: 'internal' },
      );
      expect(log).toHaveBeenCalledExactlyOnceWith('@sch0718/firebase-session: internal Error');
    } finally {
      log.mockRestore();
    }
  });
  it('onRoute에서 던진 HttpError도 응답으로 바꾼다', async () => {
    const s = await setup();
    await response(
      handleSessionRoute(s.req('GET', '/v1/sessions'), s.auth, {
        onRoute: () => {
          throw new HttpError(503, 'off');
        },
      }),
      503,
      { error: 'off' },
    );
  });
  it('onRevoke 오류도 변환하고 이미 성공한 철회는 유지한다', async () => {
    const s = await setup();
    const { sessionId } = await s.login();
    await response(
      handleSessionRoute(s.req('DELETE', '/v1/session', sessionId), s.auth, {
        onRevoke: async () => {
          throw new HttpError(503, 'cleanup');
        },
      }),
      503,
      { error: 'cleanup' },
    );
    expect(s.revoked()).toEqual({ n: 1 });
  });
});
