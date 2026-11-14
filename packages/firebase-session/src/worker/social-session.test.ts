import { describe, expect, it, vi } from 'vitest';
import { createTestD1 } from '../../test/d1.js';
import { CLIENT_ID, socialBody, socialToken } from '../../test/social.js';
import { certs, ME, PROJECT, T0, token } from '../../test/tokens.js';
import { HttpError } from './http.js';
import {
  createSessionAuth,
  SESSION_TTL,
  TOUCH_INTERVAL,
  type SessionAuthOptions,
} from './session.js';
import type { SocialLoginOptions } from './social.js';

function setup(
  enabled = true,
  legacy: boolean | '0002' = false,
  extra: Partial<SessionAuthOptions> = {},
) {
  const db = createTestD1(
    legacy === '0002'
      ? ['firebase-session-0002_social_sessions.sql']
      : legacy
        ? ['0001_users_sessions.sql']
        : undefined,
  );
  const clock = { now: T0 };
  const social: SocialLoginOptions = {
    allowedAccounts: 'kakao:AbC',
    kakao: { clientId: CLIENT_ID },
    keys: { kakao: certs, naver: certs },
    fetch: async () => Response.json({ id_token: await socialToken() }),
  };
  const auth = createSessionAuth({
    db,
    projectId: PROJECT,
    allowedEmails: ME,
    certs,
    sessionHeader: 'X-S',
    now: () => clock.now,
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    uuid: () => crypto.randomUUID(),
    ...(enabled && { social }),
    ...extra,
  });
  const req = (sessionId?: string, authorization?: string) =>
    new Request('https://api.test', {
      headers: {
        ...(sessionId && { 'X-S': sessionId }),
        ...(authorization !== undefined && { Authorization: authorization }),
      },
    });
  const login = () => auth.createSocial(req(), socialBody);
  return { auth, db, clock, social, req, login };
}

describe('소셜 표시 정보의 세션 저장·복원', () => {
  it('켜면 세션별로 표시 정보를 고정해 복원하고 허용 판정에는 넘기지 않는다', async () => {
    const isAllowed = vi.fn(() => true);
    const s = setup(true, false, { socialProfile: true, isAllowed });
    s.social.allowedAccounts = '';
    s.social.fetch = async () =>
      Response.json({ id_token: await socialToken({ nickname: '첫 이름', email: 'first@test' }) });
    const a = await s.login();
    s.social.fetch = async () =>
      Response.json({ id_token: await socialToken({ nickname: '새 이름', email: 'new@test' }) });
    const b = await s.login();
    isAllowed.mockClear();
    expect((await s.auth.authenticate(s.req(a.sessionId))).user).toEqual({
      sub: 'kakao:AbC',
      email: '',
      provider: 'kakao',
      authTime: T0,
      name: '첫 이름',
      unverifiedEmail: 'first@test',
    });
    expect((await s.auth.authenticate(s.req(b.sessionId))).user).toMatchObject({
      name: '새 이름',
      unverifiedEmail: 'new@test',
    });
    expect(isAllowed.mock.calls).toEqual([
      [{ identity: 'kakao:AbC', provider: 'kakao' }, undefined],
      [{ identity: 'kakao:AbC', provider: 'kakao' }, undefined],
    ]);
  });
  it('표시 정보가 없으면 NULL로 저장하고 사용자 필드는 넣지 않는다', async () => {
    const s = setup(true, false, { socialProfile: true });
    s.social.fetch = async () =>
      Response.json({ id_token: await socialToken({ email: undefined }) });
    const { sessionId } = await s.login();
    expect(s.db.raw.prepare('SELECT display_name, unverified_email FROM sessions').get()).toEqual({
      display_name: null,
      unverified_email: null,
    });
    expect((await s.auth.authenticate(s.req(sessionId))).user).toEqual({
      sub: 'kakao:AbC',
      email: '',
      provider: 'kakao',
      authTime: T0,
    });
  });
  it('0002까지만 적용해도 옵션을 끄면 기존 로그인과 인증이 동작한다', async () => {
    const s = setup(true, '0002');
    s.social.fetch = async () =>
      Response.json({ id_token: await socialToken({ nickname: '표시 이름', email: 'me@test' }) });
    const { sessionId } = await s.login();
    expect((await s.auth.authenticate(s.req(sessionId))).user).toEqual({
      sub: 'kakao:AbC',
      email: '',
      provider: 'kakao',
      authTime: T0,
    });
  });
  it.each(['createSocial', 'authenticate'] as const)(
    '0003이 없고 켜면 %s에서 안내한다',
    async (method) => {
      const s = setup(true, '0002', { socialProfile: true });
      await expect(
        method === 'createSocial' ? s.login() : s.auth.authenticate(s.req('x'.repeat(43))),
      ).rejects.toThrow(
        '@sch0718/firebase-session: socialProfile 옵션을 쓰려면 migrations/firebase-session-0003_social_profile.sql을 적용해야 합니다',
      );
    },
  );
  it('Google 세션 전용 인증은 표시 열을 읽어도 사용자 객체에 더하지 않는다', async () => {
    const s = setup(false, false, { socialProfile: true, googleSessionOnly: true });
    const bearer = `Bearer ${await token(T0)}`;
    const { sessionId } = await s.auth.create(s.req(undefined, bearer), {});
    s.db.raw.exec(
      "UPDATE sessions SET display_name = '표시 이름', unverified_email = 'unverified@test'",
    );
    expect((await s.auth.authenticate(s.req(sessionId))).user).toEqual({
      sub: 'uid-me',
      email: ME,
      authTime: T0,
    });
  });
  it('0003이 없으면 Google 세션 전용 인증도 안내하되 토큰 경로는 동작한다', async () => {
    const s = setup(false, '0002', { socialProfile: true, googleSessionOnly: true });
    const bearer = `Bearer ${await token(T0)}`;
    const { sessionId } = await s.auth.create(s.req(undefined, bearer), {});
    expect((await s.auth.authenticate(s.req(sessionId, bearer))).user).toEqual({
      sub: 'uid-me',
      email: ME,
      authTime: T0,
    });
    await expect(s.auth.authenticate(s.req(sessionId))).rejects.toThrow(
      'socialProfile 옵션을 쓰려면 migrations/firebase-session-0003_social_profile.sql',
    );
  });
});

describe('세션 전용 authenticate', () => {
  it('소셜 세션을 인증하고 touch 간격마다 연장한다', async () => {
    const s = setup();
    const { sessionId } = await s.login();
    const expected = { sub: 'kakao:AbC', email: '', authTime: T0, provider: 'kakao' };
    expect((await s.auth.authenticate(s.req(sessionId))).user).toEqual(expected);
    s.clock.now += TOUCH_INTERVAL - 1;
    await s.auth.authenticate(s.req(sessionId));
    expect(s.db.raw.prepare('SELECT last_used_at FROM sessions').get()).toEqual({
      last_used_at: T0,
    });
    s.clock.now++;
    await s.auth.authenticate(s.req(sessionId));
    expect(s.db.raw.prepare('SELECT last_used_at FROM sessions').get()).toEqual({
      last_used_at: s.clock.now,
    });
  });
  it('users.email에 값이 저장돼 있어도 소셜 사용자의 email은 빈 문자열', async () => {
    const s = setup();
    const { sessionId } = await s.login();
    s.db.raw.prepare('UPDATE users SET email = ?').run('legacy@example.com');
    expect((await s.auth.authenticate(s.req(sessionId))).user.email).toBe('');
  });
  it.each([undefined, 'bad'])('세션 없음/형식 오류 %s → missing-token', async (sessionId) => {
    const s = setup();
    await expect(s.auth.authenticate(s.req(sessionId))).rejects.toMatchObject({
      status: 401,
      code: 'missing-token',
    });
  });
  it('모르는 세션 → no-session', async () => {
    const s = setup();
    await expect(s.auth.authenticate(s.req('x'.repeat(43)))).rejects.toMatchObject({
      status: 401,
      code: 'no-session',
    });
  });
  it('Google 세션은 토큰 필수', async () => {
    const s = setup();
    const { sessionId } = await s.auth.create(s.req(undefined, `Bearer ${await token(T0)}`), {});
    await expect(s.auth.authenticate(s.req(sessionId))).rejects.toMatchObject({
      status: 401,
      code: 'missing-token',
    });
  });
  it('만료된 소셜 세션', async () => {
    const s = setup();
    const { sessionId } = await s.login();
    s.clock.now += SESSION_TTL;
    await expect(s.auth.authenticate(s.req(sessionId))).rejects.toMatchObject({
      status: 401,
      code: 'session-expired',
    });
  });
  it('현재 허용 목록에서 빠지면 403', async () => {
    const s = setup();
    const { sessionId } = await s.login();
    s.social.allowedAccounts = '';
    await expect(s.auth.authenticate(s.req(sessionId))).rejects.toMatchObject({
      status: 403,
      code: 'not-allowed',
    });
  });
  it('토큰이 있으면 기존 검증 경로: Google 토큰 + 소셜 세션은 no-session', async () => {
    const s = setup();
    const { sessionId } = await s.login();
    await expect(
      s.auth.authenticate(s.req(sessionId, `Bearer ${await token(T0)}`)),
    ).rejects.toMatchObject({ status: 401, code: 'no-session' });
    await expect(s.auth.authenticate(s.req(sessionId, ''))).rejects.toMatchObject({
      status: 401,
      code: 'missing-token',
    });
  });
  it('social 옵션 없으면 DB에 접근하지 않고 missing-token', async () => {
    const s = setup(false);
    const prepare = vi.spyOn(s.db, 'prepare');
    await expect(s.auth.authenticate(s.req('x'.repeat(43)))).rejects.toMatchObject({
      status: 401,
      code: 'missing-token',
    });
    expect(prepare).not.toHaveBeenCalled();
  });
  it('list와 모든 revoke가 소셜 세션에서도 동작한다', async () => {
    const s = setup();
    const a = await s.login();
    const b = await s.login();
    const c = await s.login();
    const ctx = await s.auth.authenticate(s.req(a.sessionId));
    const list = await s.auth.list(ctx);
    expect(list).toHaveLength(3);
    const bctx = await s.auth.authenticate(s.req(b.sessionId));
    expect(
      await s.auth.revoke(ctx, { id: (await s.auth.list(bctx)).find((r) => r.current)!.id }),
    ).toBe(1);
    await expect(s.auth.authenticate(s.req(b.sessionId))).rejects.toMatchObject({
      code: 'session-revoked',
    });
    expect(await s.auth.revoke(ctx, 'others')).toBe(1);
    await expect(s.auth.authenticate(s.req(c.sessionId))).rejects.toMatchObject({
      code: 'session-revoked',
    });
    expect(await s.auth.revoke(ctx, 'current')).toBe(1);
    await expect(s.auth.authenticate(s.req(a.sessionId))).rejects.toMatchObject({
      code: 'session-revoked',
    });
  });
});

describe('0001만 적용한 Google DB', () => {
  it.each([false, true])(
    'social %s: create·verifiedUser·authenticate·list·revoke는 identity 열 없이 동작한다',
    async (social) => {
      const s = setup(social, true);
      const bearer = `Bearer ${await token(T0)}`;
      const user = { sub: 'uid-me', email: ME, authTime: T0 };
      expect(await s.auth.verifiedUser(s.req(undefined, bearer))).toEqual(user);
      const { sessionId } = await s.auth.create(s.req(undefined, bearer), { label: '노트북' });
      const ctx = await s.auth.authenticate(s.req(sessionId, bearer));
      expect(ctx.user).toEqual(user);
      expect(await s.auth.list(ctx)).toHaveLength(1);
      s.clock.now += TOUCH_INTERVAL;
      await s.auth.authenticate(s.req(sessionId, bearer));
      expect(await s.auth.revoke(ctx, 'current')).toBe(1);
      await expect(s.auth.authenticate(s.req(sessionId, bearer))).rejects.toMatchObject({
        code: 'session-revoked',
      });
    },
  );
});

describe('social의 0002 마이그레이션 안내', () => {
  it.each(['createSocial', 'authenticate'] as const)(
    '%s는 누락된 마이그레이션을 안내한다',
    async (method) => {
      const s = setup(true, true);
      const error: unknown = await (
        method === 'createSocial' ? s.login() : s.auth.authenticate(s.req('x'.repeat(43)))
      ).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(HttpError);
      expect((error as Error).message).toBe(
        '@sch0718/firebase-session: social 옵션을 쓰려면 migrations/firebase-session-0002_social_sessions.sql을 적용해야 합니다',
      );
      expect((error as Error).cause).toBeInstanceOf(Error);
    },
  );
  it.each(['createSocial', 'authenticate'] as const)(
    '%s의 다른 DB 오류는 그대로 던진다',
    async (method) => {
      const s = setup();
      const error = new Error('no such column: unrelated');
      const prepare = s.db.prepare.bind(s.db);
      vi.spyOn(s.db, 'prepare').mockImplementation((sql) => {
        if (sql.includes('identity')) throw error;
        return prepare(sql);
      });
      await expect(
        method === 'createSocial' ? s.login() : s.auth.authenticate(s.req('x'.repeat(43))),
      ).rejects.toBe(error);
    },
  );
});
