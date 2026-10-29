import { describe, expect, it, vi } from 'vitest';
import { createTestD1 } from '../../test/d1.js';
import { CLIENT_ID, socialBody, socialToken } from '../../test/social.js';
import { certs, ME, PROJECT, T0, token } from '../../test/tokens.js';
import { createSessionAuth, SESSION_TTL, TOUCH_INTERVAL } from './session.js';
import type { SocialLoginOptions } from './social.js';

function setup(enabled = true, legacy = false) {
  const db = createTestD1(legacy ? ['0001_users_sessions.sql'] : undefined);
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

describe('세션 전용 authenticate', () => {
  it('소셜 세션을 인증하고 touch 간격마다 연장한다', async () => {
    const s = setup();
    const { sessionId } = await s.login();
    const expected = { sub: 'kakao:AbC', email: ME, authTime: T0, provider: 'kakao' };
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
  it('create·verifiedUser·authenticate·list·revoke는 identity 열 없이 동작한다', async () => {
    const s = setup(false, true);
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
  });
});
