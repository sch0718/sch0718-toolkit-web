import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createTestD1, type TestD1 } from '../../test/d1.js';
import { CLIENT_ID, socialBody, socialToken } from '../../test/social.js';
import { certs, ME, OTHER, PROJECT, T0, token } from '../../test/tokens.js';
import { HttpError } from './http.js';
import {
  createSessionAuth,
  type SessionAuthOptions,
  KEEP_AFTER_END,
  purgeSessions,
  REAUTH_WINDOW,
  SESSION_TTL,
  TOUCH_INTERVAL,
} from './session.js';

const HEADER = 'X-Test-Session';
const DAY = 24 * 60 * 60 * 1000;

function setup(o: { allowed?: string | undefined; defaultLabel?: string } = {}) {
  const db = createTestD1();
  const clock = { now: T0 };
  let n = 0;
  const auth = createSessionAuth({
    db,
    projectId: PROJECT,
    allowedEmails: 'allowed' in o ? o.allowed : `${ME},${OTHER.toUpperCase()}`,
    certs,
    sessionHeader: HEADER,
    ...(o.defaultLabel !== undefined && { defaultLabel: o.defaultLabel }),
    now: () => clock.now,
    random: (len) => crypto.getRandomValues(new Uint8Array(len)),
    uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  });
  const req = (headers: Record<string, string> = {}) =>
    new Request('https://api.example.test/v1/x', { headers });
  const bearer = async (claims: Record<string, unknown> = {}) => ({
    Authorization: `Bearer ${await token(clock.now, claims)}`,
  });
  async function login(claims: Record<string, unknown> = {}, label: unknown = '노트북') {
    const { sessionId } = await auth.create(req(await bearer(claims)), { label });
    const as = async () => req({ ...(await bearer(claims)), [HEADER]: sessionId });
    return { sessionId, as };
  }
  return { db, clock, auth, req, bearer, login };
}

const fails = async (p: Promise<unknown>, status: number, code: string) => {
  const e = await p.catch((x: unknown) => x);
  expect(e).toBeInstanceOf(HttpError);
  expect(e).toMatchObject({ status, code });
};

describe('create', () => {
  it('사용자와 세션을 만들고, 세션 원문은 DB에 없다', async () => {
    const s = setup();
    const { sessionId } = await s.login();
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(s.db.raw.prepare('SELECT * FROM sessions').all())).not.toContain(
      sessionId,
    );
    expect(s.db.raw.prepare('SELECT firebase_sub, email FROM users').all()).toEqual([
      { firebase_sub: 'uid-me', email: ME },
    ]);
  });

  it('토큰이 없거나 틀리거나 허용 밖이면 만들지 않는다', async () => {
    const s = setup();
    await fails(s.auth.create(s.req(), {}), 401, 'missing-token');
    await fails(
      s.auth.create(s.req({ Authorization: 'Bearer abc.def.ghi' }), {}),
      401,
      'invalid-token',
    );
    await fails(
      s.auth.create(s.req(await s.bearer({ email: 'stranger@example.test' })), {}),
      403,
      'not-allowed',
    );
    expect(s.db.raw.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 0 });
  });

  it('허용 목록이 비어 있으면 아무도 못 들어온다', async () => {
    const s = setup({ allowed: undefined });
    await fails(s.auth.create(s.req(await s.bearer()), {}), 403, 'not-allowed');
  });

  it('auth_time이 5분보다 오래됐으면 다시 로그인해야 한다', async () => {
    const s = setup();
    const old = Math.floor((s.clock.now - REAUTH_WINDOW - 1000) / 1000);
    await fails(
      s.auth.create(s.req(await s.bearer({ auth_time: old })), {}),
      401,
      'reauth-required',
    );
  });

  it('기기 이름은 40자, 제어 문자를 지우고, 비면 기본 이름', async () => {
    const s = setup();
    await s.login({}, `노트북\u0000${'가'.repeat(60)}`);
    await s.login({}, '   ');
    const labels = s.db.raw.prepare('SELECT label FROM sessions ORDER BY rowid').all() as {
      label: string;
    }[];
    expect([...(labels[0]?.label ?? '')]).toHaveLength(40);
    expect(labels[0]?.label.startsWith('노트북가')).toBe(true);
    expect(labels[1]?.label).toBe('이름 없는 기기');
  });

  it('기본 이름은 서비스가 바꿀 수 있다', async () => {
    const s = setup({ defaultLabel: 'Unnamed device' });
    await s.auth.create(s.req(await s.bearer()), {});
    expect(s.db.raw.prepare('SELECT label FROM sessions').get()).toEqual({
      label: 'Unnamed device',
    });
  });
});

describe('authenticate', () => {
  it('서비스가 정한 헤더에서 세션을 읽는다', async () => {
    const s = setup();
    const { sessionId } = await s.login();
    const ctx = await s.auth.authenticate(await (await s.login()).as());
    expect(ctx.user.email).toBe(ME);
    await fails(s.auth.authenticate(s.req(await s.bearer())), 401, 'no-session');
    await fails(
      s.auth.authenticate(s.req({ ...(await s.bearer()), 'X-Gazua-Session': sessionId })),
      401,
      'no-session',
    );
  });

  it('형식이 틀리거나 다른 사용자의 세션이면 no-session', async () => {
    const s = setup();
    const other = await s.login({ email: OTHER, sub: 'uid-other' });
    await fails(
      s.auth.authenticate(s.req({ ...(await s.bearer()), [HEADER]: 'x'.repeat(43) })),
      401,
      'no-session',
    );
    await fails(
      s.auth.authenticate(s.req({ ...(await s.bearer()), [HEADER]: 'short' })),
      401,
      'no-session',
    );
    await fails(
      s.auth.authenticate(s.req({ ...(await s.bearer()), [HEADER]: other.sessionId })),
      401,
      'no-session',
    );
  });

  it('마지막 사용 후 30일이 지나면 만료되고, 쓰면 연장된다', async () => {
    const s = setup();
    const me = await s.login();
    s.clock.now += 20 * DAY;
    await s.auth.authenticate(await me.as());
    s.clock.now += 20 * DAY;
    await s.auth.authenticate(await me.as());
    s.clock.now += SESSION_TTL;
    await fails(s.auth.authenticate(await me.as()), 401, 'session-expired');
  });

  it('last_used_at은 갱신 간격마다 한 번만 쓴다', async () => {
    const s = setup();
    const me = await s.login();
    const used = () =>
      (s.db.raw.prepare('SELECT last_used_at AS t FROM sessions').get() as { t: number }).t;
    const t0 = used();
    s.clock.now += TOUCH_INTERVAL / 2;
    await s.auth.authenticate(await me.as());
    expect(used()).toBe(t0);
    s.clock.now += TOUCH_INTERVAL / 2 + 60_000;
    await s.auth.authenticate(await me.as());
    expect(used()).toBe(s.clock.now);
  });
});

describe('googleSessionOnly', () => {
  const clock = { now: T0 };
  function make(
    db: TestD1,
    o: Partial<
      Pick<SessionAuthOptions, 'googleSessionOnly' | 'social' | 'isAllowed' | 'allowedEmails'>
    > = {},
  ) {
    return createSessionAuth({
      db,
      projectId: PROJECT,
      allowedEmails: ME,
      certs,
      sessionHeader: HEADER,
      now: () => clock.now,
      random: (len) => crypto.getRandomValues(new Uint8Array(len)),
      uuid: () => crypto.randomUUID(),
      ...o,
    });
  }
  const social = () => ({
    allowedAccounts: 'kakao:AbC,naver:AbC',
    kakao: { clientId: CLIENT_ID },
    naver: { clientId: CLIENT_ID },
    keys: { kakao: certs, naver: certs },
    fetch: async (url: string | URL | Request) =>
      Response.json({
        id_token: await socialToken(
          String(url).includes('naver') ? { iss: 'https://nid.naver.com' } : {},
        ),
      }),
  });
  const req = (sessionId?: string, authorization?: string) =>
    new Request('https://api.example.test/v1/x', {
      headers: {
        ...(sessionId && { [HEADER]: sessionId }),
        ...(authorization && { Authorization: authorization }),
      },
    });
  const google = async (auth: ReturnType<typeof make>, email = ME.toUpperCase()) =>
    (await auth.create(req(undefined, `Bearer ${await token(clock.now, { email })}`), {}))
      .sessionId;
  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: unknown) => (e instanceof HttpError ? `${e.status} ${e.code}` : e),
    );

  it('켜면 ID 토큰 없이 Google 세션만으로 인증하고, identity는 소문자 이메일', async () => {
    clock.now = T0;
    const db = createTestD1();
    const auth = make(db, { googleSessionOnly: true });
    const sessionId = await google(auth);
    expect(db.raw.prepare('SELECT identity FROM sessions').get()).toEqual({ identity: ME });
    expect((await auth.authenticate(req(sessionId))).user).toEqual({
      sub: 'uid-me',
      email: ME,
      authTime: T0,
    });
  });

  it.each([false, true])(
    '켜서 만든 Google 세션을 끈 인증기(social %s)로 읽으면 missing-token',
    async (withSocial) => {
      clock.now = T0;
      const db = createTestD1();
      const sessionId = await google(make(db, { googleSessionOnly: true }));
      const off = make(db, withSocial ? { social: social() } : {});
      expect(await code(off.authenticate(req(sessionId)))).toBe('401 missing-token');
    },
  );

  it.each([true, false])('Google·소셜 혼합, 옵션 %s', async (on) => {
    clock.now = T0;
    const db = createTestD1();
    const auth = make(db, { social: social(), googleSessionOnly: on });
    const g = await google(make(db, { googleSessionOnly: true }));
    const k = (await auth.createSocial(req(), socialBody)).sessionId;
    const n = (await auth.createSocial(req(), { ...socialBody, provider: 'naver' })).sessionId;
    expect(await code(auth.authenticate(req(g)))).toBe(on ? 'ok' : '401 missing-token');
    expect((await auth.authenticate(req(k))).user.provider).toBe('kakao');
    expect((await auth.authenticate(req(n))).user.provider).toBe('naver');
  });

  it('철회·만료는 401, 허용 목록에서 빠지면 403(isAllowed는 목록 다음)', async () => {
    clock.now = T0;
    const db = createTestD1();
    const auth = make(db, { googleSessionOnly: true });
    const a = await google(auth);
    const b = await google(auth);
    await auth.revoke(await auth.authenticate(req(a)), 'current');
    expect(await code(auth.authenticate(req(a)))).toBe('401 session-revoked');

    const isAllowed = vi.fn(() => false);
    const out = make(db, { googleSessionOnly: true, allowedEmails: '', isAllowed });
    expect(await code(out.authenticate(req(b)))).toBe('403 not-allowed');
    expect(isAllowed).toHaveBeenCalledWith({ identity: ME, provider: 'google' }, undefined);
    isAllowed.mockReturnValue(true);
    expect(await code(out.authenticate(req(b)))).toBe('ok');
    isAllowed.mockClear();
    expect(await code(auth.authenticate(req(b)))).toBe('ok');
    expect(isAllowed).not.toHaveBeenCalled();

    clock.now += SESSION_TTL;
    expect(await code(auth.authenticate(req(b)))).toBe('401 session-expired');
  });

  it('0002 마이그레이션이 없으면 기존 오류 문구', async () => {
    clock.now = T0;
    const auth = make(createTestD1(['0001_users_sessions.sql']), { googleSessionOnly: true });
    for (const call of [() => google(auth), () => auth.authenticate(req('x'.repeat(43)))]) {
      const e = await call().catch((x: unknown) => x);
      expect(e).not.toBeInstanceOf(HttpError);
      expect((e as Error).message).toBe(
        '@sch0718/firebase-session: social 옵션을 쓰려면 migrations/firebase-session-0002_social_sessions.sql을 적용해야 합니다',
      );
    }
  });
});

describe('list·revoke', () => {
  it('기기 목록, 하나 철회, 이 기기 철회, 다른 기기 모두 철회', async () => {
    const s = setup();
    const a = await s.login({}, '노트북');
    const b = await s.login({}, '휴대폰');
    const c = await s.login({}, '태블릿');
    const ctx = await s.auth.authenticate(await a.as());
    const list = await s.auth.list(ctx);
    expect(list.map((d) => [d.label, d.current]).sort()).toEqual([
      ['노트북', true],
      ['태블릿', false],
      ['휴대폰', false],
    ]);
    expect(list[0]?.expiresAt).toBe(T0 + SESSION_TTL);
    const phone = list.find((d) => d.label === '휴대폰');
    expect(await s.auth.revoke(ctx, { id: phone?.id ?? '' })).toBe(1);
    await fails(s.auth.authenticate(await b.as()), 401, 'session-revoked');
    expect(await s.auth.revoke(ctx, 'others')).toBe(1);
    await fails(s.auth.authenticate(await c.as()), 401, 'session-revoked');
    expect(await s.auth.revoke(ctx, 'current')).toBe(1);
    await fails(s.auth.authenticate(await a.as()), 401, 'session-revoked');
  });

  it('다른 사용자의 기기나 틀린 형식의 ID는 404', async () => {
    const s = setup();
    const a = await s.login();
    const o = await s.login({ email: OTHER, sub: 'uid-other' });
    const octx = await s.auth.authenticate(await o.as());
    const id = (await s.auth.list(octx))[0]?.id ?? '';
    const actx = await s.auth.authenticate(await a.as());
    await fails(s.auth.revoke(actx, { id }), 404, 'not-found');
    await fails(s.auth.revoke(actx, { id: 'ZZZ' }), 404, 'not-found');
  });
});

describe('purgeSessions', () => {
  it('철회 후 보관 기간이 지난 것, 만료 후 보관 기간이 지난 것만 지운다', async () => {
    const s = setup();
    const a = await s.login({}, 'a');
    await s.login({}, 'b');
    await s.login({}, 'c');
    const ctx = await s.auth.authenticate(await a.as());
    await s.auth.revoke(ctx, 'current');
    expect(await purgeSessions(s.db, T0 + KEEP_AFTER_END - 1)).toBe(0);
    expect(await purgeSessions(s.db, T0 + KEEP_AFTER_END)).toBe(1);
    expect(await purgeSessions(s.db, T0 + KEEP_AFTER_END + SESSION_TTL)).toBe(2);
  });

  it('한 번에 limit개까지만 지운다', async () => {
    const s = setup();
    for (const l of ['a', 'b', 'c']) await s.login({}, l);
    expect(await purgeSessions(s.db, T0 + KEEP_AFTER_END + SESSION_TTL, 2)).toBe(2);
  });
});

describe('마이그레이션', () => {
  it('패키지가 users·sessions 스키마를 배포한다', () => {
    const sql = readFileSync(
      new URL('../../migrations/0001_users_sessions.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE users');
    expect(sql).toContain('CREATE TABLE sessions');
  });
});
