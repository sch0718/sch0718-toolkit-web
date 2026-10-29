// 토큰·기기 세션을 붙여 Worker를 부르는 HTTP 클라이언트. 응답을 몇 가지 결과로 나눈다.
// ID 토큰은 매 요청 Authorization: Bearer로, 기기 세션은 서비스가 정한 헤더로 보낸다. 토큰·세션은 로그에 남기지 않는다.

import type { SocialProvider } from './social.js';

export type BaseFail =
  /**
   * 다시 로그인해야 한다. code: missing-token·invalid-token·no-session·session-revoked·session-expired·reauth-required
   * session: 실패한 요청이 쓴 기기 세션(그 사이 새로 로그인했으면 이 실패는 무시해야 한다).
   */
  | { ok: false; kind: 'auth'; code: string; session?: string }
  | { ok: false; kind: 'not-allowed'; account?: string }
  /** 네트워크 실패, 또는 성공 응답의 본문을 다 받지 못했거나 JSON이 아님(다시 시도하면 된다) */
  | { ok: false; kind: 'offline' }
  /** 서비스 한도·무료 한도 초과(429·503) */
  | { ok: false; kind: 'limit'; code: string }
  | { ok: false; kind: 'invalid'; code: string; path?: string }
  | { ok: false; kind: 'not-found' }
  | { ok: false; kind: 'server'; status: number };

/** 서비스 고유 실패(mapStatus가 만든다)의 최소 모양 */
export interface Fail {
  ok: false;
  kind: string;
}

export type ApiResult<T, F = BaseFail> = { ok: true; data: T } | F;

export interface Credentials {
  /** forceRefresh면 SDK에서 새 ID 토큰을 받는다. 로그인돼 있지 않으면 null. */
  idToken(forceRefresh?: boolean): Promise<string | null>;
  sessionId(): Promise<string | null>;
}

export interface DeviceSession {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  current: boolean;
}

export interface SendOptions {
  body?: unknown;
  /** session: 토큰+세션(기본), token: 토큰만, none: 둘 다 없이 */
  auth?: 'session' | 'token' | 'none';
  headers?: Record<string, string>;
  /** 이 토큰을 그대로 쓴다(새로 받지 않는다). 세션 만들기에 쓴다. */
  token?: string;
}

export interface SessionClientOptions<X extends Fail> {
  baseUrl: string;
  /** ID 토큰이 없을 때 세션만 보내도록 허용한다. 기본 false. */
  allowSessionOnly?: boolean;
  credentials: Credentials;
  sessionHeader: string;
  fetch?: typeof fetch;
  /**
   * 공통 매핑 전에 불린다. 서비스 고유 상태(예: 409 conflict)를 바꾼다. undefined면 공통 매핑.
   * 던지면 안 된다. 던지면 send가 실패 결과를 돌려주지 않고 reject된다.
   */
  mapStatus?: (status: number, body: Record<string, unknown>) => X | undefined;
}

export interface SessionClient<X extends Fail = never> {
  send<T>(method: string, path: string, opts?: SendOptions): Promise<ApiResult<T, BaseFail | X>>;
  createSession(
    idToken: string,
    label: string,
  ): Promise<ApiResult<{ sessionId: string; expiresAt: number }, BaseFail | X>>;
  createSocialSession(
    input: {
      provider: SocialProvider;
      code: string;
      codeVerifier: string;
      redirectUri: string;
    },
    label: string,
  ): Promise<
    ApiResult<
      {
        sessionId: string;
        expiresAt: number;
        user: { sub: string; email: string; provider: SocialProvider; unverifiedEmail?: string };
      },
      BaseFail | X
    >
  >;
  endSession(): Promise<ApiResult<unknown, BaseFail | X>>;
  listSessions(): Promise<ApiResult<{ sessions: DeviceSession[] }, BaseFail | X>>;
  revokeSession(id: string | 'others'): Promise<ApiResult<{ revoked: number }, BaseFail | X>>;
}

export const AUTH_CODES = new Set([
  'missing-token',
  'invalid-token',
  'invalid-code',
  'no-session',
  'session-revoked',
  'session-expired',
  'reauth-required',
]);

type AuthFail = Extract<BaseFail, { kind: 'auth' }>;
const isAuthFail = (r: { ok: boolean; kind?: string }): r is AuthFail => !r.ok && r.kind === 'auth';

async function toResult<T, X extends Fail>(
  res: Response,
  mapStatus: SessionClientOptions<X>['mapStatus'],
): Promise<ApiResult<T, BaseFail | X>> {
  // 204·Content-Length: 0은 읽을 본문이 없다. 성공이면 빈 객체를 넘긴다.
  const noBody = res.status === 204 || res.headers.get('Content-Length') === '0';
  let raw: unknown = {};
  if (!noBody) {
    try {
      raw = await res.json();
    } catch {
      // 성공인데 본문을 다 받지 못했거나 JSON이 아니면 성공으로 보지 않는다(예: sessionId 없는 createSession).
      // offline으로 돌려 부르는 쪽의 재시도에 맡긴다. 실패 응답은 지금처럼 빈 객체로 매핑한다.
      if (res.ok) return { ok: false, kind: 'offline' };
    }
  }
  // 성공 본문은 그대로 넘긴다(null 포함)
  if (res.ok) return { ok: true, data: raw as T };
  // 실패 본문이 JSON이어도 객체가 아니면(null·수·문자열·배열) 빈 객체로 본다
  const body: Record<string, unknown> =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const mapped = mapStatus?.(res.status, body);
  if (mapped) return mapped;
  const code = typeof body['error'] === 'string' ? body['error'] : '';
  switch (res.status) {
    case 401:
      return { ok: false, kind: 'auth', code: AUTH_CODES.has(code) ? code : 'invalid-token' };
    case 403:
      return code === 'not-allowed'
        ? {
            ok: false,
            kind: 'not-allowed',
            ...(typeof body['account'] === 'string' &&
              /^(kakao|naver):[\x21-\x7e]{1,128}$/.test(body['account']) && {
                account: body['account'],
              }),
          }
        : { ok: false, kind: 'server', status: 403 };
    case 404:
      return { ok: false, kind: 'not-found' };
    case 413:
      return { ok: false, kind: 'invalid', code: 'too-large' };
    case 422: {
      const path = body['path'];
      return {
        ok: false,
        kind: 'invalid',
        code: code || 'invalid',
        ...(typeof path === 'string' && { path }),
      };
    }
    case 429:
    case 503:
      return { ok: false, kind: 'limit', code: code || String(res.status) };
    default:
      return { ok: false, kind: 'server', status: res.status };
  }
}

export function createSessionClient<X extends Fail = never>(
  o: SessionClientOptions<X>,
): SessionClient<X> {
  const base = o.baseUrl.replace(/\/+$/, '');
  const fetchImpl = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function send<T>(
    method: string,
    path: string,
    opts: SendOptions = {},
  ): Promise<ApiResult<T, BaseFail | X>> {
    const auth = opts.auth ?? 'session';
    let sessionOnly = false;
    // retryOf: 다시 보낼 때 첫 실패(그 요청이 쓴 세션이 실려 있다). 그 사이 세션이 바뀌었으면 보내지 않고 그대로 돌려준다.
    const attempt = async (
      force: boolean,
      retryOf?: AuthFail & { session: string },
    ): Promise<ApiResult<T, BaseFail | X>> => {
      const headers: Record<string, string> = { ...opts.headers };
      let used: string | null = null; // 이 요청이 쓴 기기 세션
      if (auth !== 'none') {
        // 토큰 갱신은 네트워크를 쓴다(오프라인이면 예외). 예외로 새지 않게 offline 실패로 바꿔 부르는 쪽의 재시도에 맡긴다.
        let token: string | null;
        let s: string | null = null;
        try {
          token = opts.token ?? (await o.credentials.idToken(force));
          if ((token || o.allowSessionOnly) && auth === 'session')
            s = await o.credentials.sessionId();
        } catch {
          return { ok: false, kind: 'offline' };
        }
        if (retryOf && s !== retryOf.session) return retryOf;
        if (!token && !(o.allowSessionOnly && auth === 'session' && s))
          return { ok: false, kind: 'auth', code: 'missing-token' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        sessionOnly = !token;
        if (auth === 'session') {
          if (!s) return { ok: false, kind: 'auth', code: 'no-session' };
          headers[o.sessionHeader] = s;
          used = s;
        }
      }
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      let res: Response;
      try {
        res = await fetchImpl(base + path, {
          method,
          headers,
          ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
      } catch {
        return { ok: false, kind: 'offline' };
      }
      const r = await toResult<T, X>(res, o.mapStatus);
      if (isAuthFail(r) && used) return { ...r, session: used };
      return r;
    };
    const first = await attempt(false);
    // 만료 직전에 받은 ID 토큰이면 한 번만 새로 받아 다시 보낸다
    if (
      !isAuthFail(first) ||
      first.code !== 'invalid-token' ||
      sessionOnly ||
      auth === 'none' ||
      opts.token
    )
      return first;
    if (auth === 'token') return attempt(true);
    // 그 사이 다른 계정으로 바꿔 로그인했으면 첫 요청의 본문을 새 계정의 자격으로 보내지 않는다.
    // 첫 실패에는 그 요청이 쓴 세션(session)이 실려 있다. 다시 보내는 안에서도 한 번 더 맞춰 본다.
    const used = first.session;
    if (used === undefined) return first;
    let now: string | null;
    try {
      now = await o.credentials.sessionId();
    } catch {
      return first;
    }
    if (now !== used) return first;
    return attempt(true, { ...first, session: used });
  }

  const enc = encodeURIComponent;
  return {
    send,
    createSession: (idToken, label) =>
      send('POST', '/v1/session', { auth: 'token', token: idToken, body: { label } }),
    createSocialSession: (input, label) =>
      send('POST', '/v1/session/social', { auth: 'none', body: { ...input, label } }),
    endSession: () => send('DELETE', '/v1/session'),
    listSessions: () => send('GET', '/v1/sessions'),
    revokeSession: (id) =>
      id === 'others'
        ? send('DELETE', '/v1/sessions?others=1')
        : send('DELETE', `/v1/sessions/${enc(id)}`),
  };
}
