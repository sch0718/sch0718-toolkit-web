import { describe, expect, it, vi } from 'vitest';
import { createTestD1 } from '../../test/d1.js';
import { CLIENT_ID, socialBody, socialToken } from '../../test/social.js';
import { certs, ME, PROJECT, T0, token } from '../../test/tokens.js';
import { HttpError } from './http.js';
import { createSessionAuth, REAUTH_WINDOW, type SessionAuthOptions } from './session.js';

const HEADER = 'X-S';
const STRANGER = 'stranger@example.test';

function setup(isAllowed: NonNullable<SessionAuthOptions['isAllowed']>) {
  const db = createTestD1();
  const clock = { now: T0 };
  const spy = vi.fn(isAllowed);
  const auth = createSessionAuth({
    db,
    projectId: PROJECT,
    allowedEmails: ME,
    certs,
    sessionHeader: HEADER,
    now: () => clock.now,
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    uuid: () => crypto.randomUUID(),
    isAllowed: spy,
    social: {
      allowedAccounts: 'kakao:listed',
      kakao: { clientId: CLIENT_ID },
      keys: { kakao: certs, naver: certs },
      fetch: async () => Response.json({ id_token: await socialToken() }),
    },
  });
  const req = (h: Record<string, string> = {}) => new Request('https://api.test', { headers: h });
  const bearer = async (claims: Record<string, unknown> = {}, at = clock.now) => ({
    Authorization: `Bearer ${await token(at, claims)}`,
  });
  return { db, clock, auth, spy, req, bearer };
}

describe('isAllowed: Google', () => {
  it('고정 목록에 있으면 부르지 않는다', async () => {
    const s = setup(() => false);
    await s.auth.create(s.req(await s.bearer()), { label: 'a' });
    expect(s.spy).not.toHaveBeenCalled();
  });

  it('세션 만들기에서는 본문을 signup으로 넘기고, 매 요청에서는 signup 없이 부른다', async () => {
    const s = setup(() => true);
    const body = { label: 'a', invite: 'code' };
    const { sessionId } = await s.auth.create(s.req(await s.bearer({ email: STRANGER })), body);
    expect(s.spy).toHaveBeenLastCalledWith({ identity: STRANGER, provider: 'google' }, { body });
    const ctx = await s.auth.authenticate(
      s.req({ ...(await s.bearer({ email: STRANGER })), [HEADER]: sessionId }),
    );
    expect(ctx.user.email).toBe(STRANGER);
    expect(s.spy).toHaveBeenLastCalledWith({ identity: STRANGER, provider: 'google' }, undefined);
  });

  it('이메일은 소문자로 넘긴다', async () => {
    const s = setup(() => true);
    await s.auth.create(s.req(await s.bearer({ email: 'Stranger@Example.TEST' })), {});
    expect(s.spy.mock.calls[0]![0]).toEqual({ identity: STRANGER, provider: 'google' });
  });

  it('false면 403 not-allowed이고 사용자를 만들지 않는다', async () => {
    const s = setup(() => false);
    const e = await s.auth.create(s.req(await s.bearer({ email: STRANGER })), {}).catch((x) => x);
    expect(e).toMatchObject({ status: 403, code: 'not-allowed' });
    expect(s.db.raw.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 0 });
  });

  it.each([
    ['검증 안 된 이메일', { email: STRANGER, email_verified: false }],
    ['빈 이메일', { email: '' }],
    ['이메일 없음', { email: undefined }],
  ])('%s이면 부르지 않고 not-allowed', async (_, claims) => {
    const s = setup(() => true);
    const e = await s.auth.create(s.req(await s.bearer(claims)), {}).catch((x) => x);
    expect(e).toMatchObject({ status: 403, code: 'not-allowed' });
    expect(s.spy).not.toHaveBeenCalled();
  });

  it('재인증 창이 지난 토큰으로는 가입 경로에서 부르지 않는다', async () => {
    const s = setup(() => true);
    const old = s.clock.now;
    s.clock.now += REAUTH_WINDOW + 1;
    const e = await s.auth
      .create(s.req(await s.bearer({ email: STRANGER, auth_time: Math.floor(old / 1000) })), {})
      .catch((x) => x);
    expect(e).toMatchObject({ status: 401, code: 'reauth-required' });
    expect(s.spy).not.toHaveBeenCalled();
  });

  it('던진 HttpError가 그대로 응답이 된다', async () => {
    const s = setup(() => {
      throw new HttpError(403, 'invite-invalid');
    });
    const e = await s.auth.create(s.req(await s.bearer({ email: STRANGER })), {}).catch((x) => x);
    expect(e).toMatchObject({ status: 403, code: 'invite-invalid' });
  });

  it('매 요청에서 false가 되면 403 not-allowed', async () => {
    let allowed = true;
    const s = setup(() => allowed);
    const { sessionId } = await s.auth.create(s.req(await s.bearer({ email: STRANGER })), {});
    allowed = false;
    const e = await s.auth
      .authenticate(s.req({ ...(await s.bearer({ email: STRANGER })), [HEADER]: sessionId }))
      .catch((x) => x);
    expect(e).toMatchObject({ status: 403, code: 'not-allowed' });
  });
});

describe('isAllowed: 소셜', () => {
  it('고정 목록 밖 계정은 본문과 함께 부르고, true면 세션을 만든다', async () => {
    const s = setup(() => true);
    const body = { ...socialBody, invite: 'code' };
    const r = await s.auth.createSocial(s.req(), body);
    expect(r.user.sub).toBe('kakao:AbC');
    const rest: Record<string, unknown> = { ...body };
    delete rest['code'];
    delete rest['codeVerifier'];
    expect(s.spy).toHaveBeenCalledWith(
      { identity: 'kakao:AbC', provider: 'kakao' },
      { body: rest },
    );
    expect(JSON.stringify(s.spy.mock.calls)).not.toContain(socialBody.codeVerifier);
  });

  it('false면 403 not-allowed와 account', async () => {
    const s = setup(() => false);
    const e = await s.auth.createSocial(s.req(), socialBody).catch((x) => x);
    expect(e).toMatchObject({ status: 403, code: 'not-allowed', extra: { account: 'kakao:AbC' } });
  });

  it('세션 인증 때 signup 없이 다시 부르고, false면 403', async () => {
    let allowed = true;
    const s = setup(() => allowed);
    const { sessionId } = await s.auth.createSocial(s.req(), socialBody);
    await s.auth.authenticate(s.req({ [HEADER]: sessionId }));
    expect(s.spy).toHaveBeenLastCalledWith({ identity: 'kakao:AbC', provider: 'kakao' }, undefined);
    allowed = false;
    const e = await s.auth.authenticate(s.req({ [HEADER]: sessionId })).catch((x) => x);
    expect(e).toMatchObject({ status: 403, code: 'not-allowed' });
  });

  it('공급자 토큰이 틀리면 부르지 않는다', async () => {
    const s = setup(() => true);
    const e = await s.auth
      .createSocial(s.req(), { ...socialBody, codeVerifier: 'w'.repeat(43) })
      .catch((x) => x);
    expect(e).toMatchObject({ status: 401 });
    expect(s.spy).not.toHaveBeenCalled();
  });
});
