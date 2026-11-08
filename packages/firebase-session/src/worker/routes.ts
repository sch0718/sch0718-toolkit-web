// 공용 클라이언트가 부르는 세션 경로. CORS·출처 검사·preflight는 서비스가 먼저 처리한다.
import { CertsUnavailableError } from './certs.js';
import { errorBody, HttpError, json, readJson } from './http.js';
import { SESSION_PATHS, type AuthContext, type SessionAuth } from './session.js';

export interface SessionRouteOptions {
  /** 기본은 요청 URL의 pathname. 서비스 접두어를 뗀 경로를 넘긴다. */
  path?: string;
  /** 세션 경로가 맞으면 405를 포함해 로그용 패턴으로 한 번 부른다. */
  onRoute?: (pattern: string) => void;
  /** 두 생성 경로에서 본문을 읽기 전에 부른다(로그인 빈도 제한 등). */
  beforeCreate?: () => void | Promise<void>;
  /** 철회가 성공한 뒤 부른다(서비스 데이터 정리 등). */
  onRevoke?: (
    ctx: AuthContext,
    target: { id: string } | 'current' | 'others',
    revoked: number,
  ) => void | Promise<void>;
  /** 500으로 바꾼 오류를 남긴다. 기본 console.error. */
  log?: (message: string) => void;
}

/** 세션 경로를 처리하고, 다른 경로면 서비스 라우터에 넘기도록 null을 돌려준다. */
export async function handleSessionRoute(
  req: Request,
  auth: SessionAuth,
  o: SessionRouteOptions = {},
): Promise<Response | null> {
  try {
    const url = new URL(req.url);
    const path = o.path ?? url.pathname;
    const prefix = `${SESSION_PATHS.sessions}/`;
    const id = path.startsWith(prefix) ? path.slice(prefix.length) : '';
    const byId = id.length > 0 && !id.includes('/');
    if (
      path !== SESSION_PATHS.session &&
      path !== SESSION_PATHS.social &&
      path !== SESSION_PATHS.sessions &&
      !byId
    )
      return null;

    o.onRoute?.(byId ? `${prefix}:id` : path);
    const method = req.method;
    if (method === 'POST' && (path === SESSION_PATHS.session || path === SESSION_PATHS.social)) {
      await o.beforeCreate?.();
      const body = await readJson(req);
      return json(
        200,
        path === SESSION_PATHS.social
          ? await auth.createSocial(req, body)
          : await auth.create(req, body),
      );
    }
    if (method === 'GET' && path === SESSION_PATHS.sessions) {
      const ctx = await auth.authenticate(req);
      return json(200, { sessions: await auth.list(ctx) });
    }
    if (method !== 'DELETE' || path === SESSION_PATHS.social) throw new HttpError(405, 'method');

    const ctx = await auth.authenticate(req);
    let target: { id: string } | 'current' | 'others';
    if (path === SESSION_PATHS.session) target = 'current';
    else if (path === SESSION_PATHS.sessions) {
      if (url.searchParams.size !== 1 || url.searchParams.get('others') !== '1')
        throw new HttpError(400, 'bad-request');
      target = 'others';
    } else {
      try {
        target = { id: decodeURIComponent(id) };
      } catch {
        throw new HttpError(404, 'not-found');
      }
    }
    const revoked = await auth.revoke(ctx, target);
    await o.onRevoke?.(ctx, target, revoked);
    return json(200, { revoked });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, errorBody(e.code, e.extra));
    if (e instanceof CertsUnavailableError) return json(503, errorBody('certs-unavailable'));
    const message =
      e instanceof Error && e.message.startsWith('@sch0718/firebase-session:')
        ? e.message
        : `@sch0718/firebase-session: internal ${e instanceof Error ? e.name : 'error'}`;
    (o.log ?? console.error)(message);
    return json(500, errorBody('internal'));
  }
}
