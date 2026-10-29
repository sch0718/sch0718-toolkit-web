// D1 자체 세션: 기기별, 마지막 사용 후 30일 슬라이딩 만료, 기기별·전체 철회.
// 세션 원문은 기기에만 있고 D1에는 SHA-256 hex만 둔다. 소셜 세션만 ID 토큰 없이 인증한다.
// 테이블: migrations/0001_users_sessions.sql, 소셜 세션은 firebase-session-0002_social_sessions.sql도 적용.
import {
  parseAccountList,
  exchangeSocial,
  type SocialLoginOptions,
  type SocialProvider,
} from './social.js';
import type { CertSource } from './certs.js';
import type { D1Database, D1Result } from './d1.js';
import { base64url, HttpError, sha256Hex } from './http.js';
import { AuthError, bearer, parseAllowList, verifyIdToken, type VerifiedUser } from './verify.js';

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL = 30 * DAY;
/** last_used_at 갱신 간격. D1 쓰기를 아낀다. */
export const TOUCH_INTERVAL = 60 * 60 * 1000;
/** 새 세션은 방금 Google 로그인을 거친 토큰으로만 만든다(철회된 기기가 갱신 토큰만으로 돌아오지 못하게). */
export const REAUTH_WINDOW = 5 * 60 * 1000;
export const LABEL_MAX = 40;
/** 만료·철회된 세션도 이 기간 뒤에 지운다(그동안은 목록에서 상태를 볼 수 있다). */
export const KEEP_AFTER_END = 30 * DAY;
/** 세션 엔드포인트. 라우팅은 서비스가 한다. */
export const SESSION_PATHS = {
  /** POST: 만들기, DELETE: 이 기기 철회 */
  session: '/v1/session',
  social: '/v1/session/social',
  /** GET: 목록, DELETE ?others=1: 다른 기기 모두 철회, DELETE /:id: 하나 철회 */
  sessions: '/v1/sessions',
} as const;

export interface AuthContext {
  userId: string;
  sessionHash: string;
  user: VerifiedUser;
}

export interface DeviceSessionRow {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  current: boolean;
}

export interface SessionAuthOptions {
  db: D1Database;
  social?: SocialLoginOptions;
  /** Firebase 프로젝트 ID. 토큰의 aud·iss를 이것으로 검사한다. */
  projectId: string;
  /** 콤마로 구분한 허용 이메일(secret). 비어 있으면 아무도 들어오지 못한다. */
  allowedEmails: string | undefined;
  certs: CertSource;
  /** 기기 세션을 실어 오는 요청 헤더 이름(예: 'X-Gazua-Session'). */
  sessionHeader: string;
  /** 기기 이름이 비었을 때. 기본 '이름 없는 기기' */
  defaultLabel?: string;
  now: () => number;
  /** n바이트 무작위 값 */
  random: (n: number) => Uint8Array;
  uuid: () => string;
}

export interface SessionAuth {
  /** POST /v1/session/social. social 옵션이 없으면 404. */
  createSocial(
    req: Request,
    body: unknown,
  ): Promise<{
    sessionId: string;
    expiresAt: number;
    user: { sub: string; email: string; provider: SocialProvider };
  }>;
  /** 토큰 검증 + 허용 목록. 실패는 HttpError(401·403)로 바꾼다. */
  verifiedUser(req: Request): Promise<VerifiedUser>;
  /** POST /v1/session. 사용자를 만들거나 갱신하고 새 세션을 돌려준다. */
  create(req: Request, body: unknown): Promise<{ sessionId: string; expiresAt: number }>;
  /** 개인 API 공통 검사: 토큰·허용 목록·세션(같은 사용자, 철회·만료 아님). */
  authenticate(req: Request): Promise<AuthContext>;
  list(ctx: AuthContext): Promise<DeviceSessionRow[]>;
  /** 기기 하나(공개 ID), 이 기기(current), 또는 이 기기를 뺀 전부(others)를 철회한다. */
  revoke(ctx: AuthContext, target: { id: string } | 'current' | 'others'): Promise<number>;
}

export const publicSessionId = (hash: string) => hash.slice(0, 12);

export function cleanLabel(v: unknown, fallback: string): string {
  // 제어 문자를 지우는 것이 목적이므로 no-control-regex는 끈다.
  // eslint-disable-next-line no-control-regex
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  return [...s].slice(0, LABEL_MAX).join('') || fallback;
}

export function createSessionAuth(o: SessionAuthOptions): SessionAuth {
  const defaultLabel = o.defaultLabel ?? '이름 없는 기기';

  async function verifiedUser(req: Request): Promise<VerifiedUser> {
    const token = bearer(req);
    if (!token) throw new HttpError(401, 'missing-token');
    try {
      return await verifyIdToken(token, {
        projectId: o.projectId,
        certs: o.certs,
        now: o.now(),
        allowedEmails: parseAllowList(o.allowedEmails),
      });
    } catch (e) {
      if (e instanceof AuthError) throw new HttpError(e.code === 'not-allowed' ? 403 : 401, e.code);
      throw e;
    }
  }

  async function saveSession(
    user: { sub: string; email: string },
    label: string,
    now: number,
    identity?: string,
  ) {
    const row = await o.db
      .prepare(
        `INSERT INTO users (id, firebase_sub, email, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (firebase_sub) DO UPDATE SET email = excluded.email, last_seen_at = excluded.last_seen_at
     RETURNING id`,
      )
      .bind(o.uuid(), user.sub, user.email, now, now)
      .first<{ id: string }>();
    if (!row) throw new Error('users upsert returned no row');
    const sessionId = base64url(o.random(32));
    await o.db
      .prepare(
        identity === undefined
          ? 'INSERT INTO sessions (id_hash, user_id, label, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)'
          : 'INSERT INTO sessions (id_hash, user_id, label, created_at, last_used_at, identity) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(
        await sha256Hex(sessionId),
        row.id,
        label,
        now,
        now,
        ...(identity === undefined ? [] : [identity]),
      )
      .run();
    return { sessionId, expiresAt: now + SESSION_TTL };
  }

  return {
    verifiedUser,

    async create(req, body) {
      const user = await verifiedUser(req);
      const now = o.now();
      if (now - user.authTime > REAUTH_WINDOW) throw new HttpError(401, 'reauth-required');
      const raw =
        typeof body === 'object' && body !== null ? (body as { label?: unknown }).label : undefined;
      const label = cleanLabel(raw, defaultLabel);
      return saveSession(user, label, now);
    },

    async createSocial(_req, body) {
      if (!o.social) throw new HttpError(404, 'not-found');
      const now = o.now();
      const { user, label } = await exchangeSocial(body, o.social, now, REAUTH_WINDOW);
      return { ...(await saveSession(user, cleanLabel(label, defaultLabel), now, user.sub)), user };
    },

    async authenticate(req) {
      const sessionOnly = o.social && !req.headers.has('Authorization');
      let user = sessionOnly ? null : await verifiedUser(req);
      const raw = req.headers.get(o.sessionHeader);
      if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw))
        throw new HttpError(401, sessionOnly ? 'missing-token' : 'no-session');
      const hash = await sha256Hex(raw);
      const row = await o.db
        .prepare(
          sessionOnly
            ? `SELECT s.user_id AS userId, s.last_used_at AS lastUsedAt, s.revoked_at AS revokedAt,
           s.identity, s.created_at AS createdAt, u.email
           FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?`
            : `SELECT s.user_id AS userId, s.last_used_at AS lastUsedAt, s.revoked_at AS revokedAt
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.id_hash = ? AND u.firebase_sub = ?`,
        )
        .bind(hash, ...(user ? [user.sub] : []))
        .first<{
          userId: string;
          lastUsedAt: number;
          revokedAt: number | null;
          identity: string | null;
          createdAt: number;
          email: string;
        }>();
      if (!row) throw new HttpError(401, 'no-session');
      if (sessionOnly && row.identity === null) throw new HttpError(401, 'missing-token');
      if (row.revokedAt !== null) throw new HttpError(401, 'session-revoked');
      const now = o.now();
      if (row.lastUsedAt + SESSION_TTL <= now) throw new HttpError(401, 'session-expired');
      if (sessionOnly) {
        if (!parseAccountList(o.social!.allowedAccounts).has(row.identity!))
          throw new HttpError(403, 'not-allowed');
        user = {
          sub: row.identity!,
          email: row.email,
          authTime: row.createdAt,
          provider: row.identity!.startsWith('kakao:') ? 'kakao' : 'naver',
        };
      }
      if (now - row.lastUsedAt >= TOUCH_INTERVAL) {
        await o.db
          .prepare('UPDATE sessions SET last_used_at = ? WHERE id_hash = ?')
          .bind(now, hash)
          .run();
      }
      return { userId: row.userId, sessionHash: hash, user: user! };
    },

    async list(ctx) {
      const now = o.now();
      const { results } = await o.db
        .prepare(
          `SELECT id_hash AS hash, label, created_at AS createdAt, last_used_at AS lastUsedAt
     FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND last_used_at > ? ORDER BY last_used_at DESC`,
        )
        .bind(ctx.userId, now - SESSION_TTL)
        .all<{ hash: string; label: string; createdAt: number; lastUsedAt: number }>();
      return results.map((r) => ({
        id: publicSessionId(r.hash),
        label: r.label,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
        expiresAt: r.lastUsedAt + SESSION_TTL,
        current: r.hash === ctx.sessionHash,
      }));
    },

    async revoke(ctx, target) {
      const now = o.now();
      const db = o.db;
      let r: D1Result;
      if (target === 'current') {
        r = await db
          .prepare('UPDATE sessions SET revoked_at = ? WHERE id_hash = ? AND revoked_at IS NULL')
          .bind(now, ctx.sessionHash)
          .run();
      } else if (target === 'others') {
        r = await db
          .prepare(
            'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id_hash <> ? AND revoked_at IS NULL',
          )
          .bind(now, ctx.userId, ctx.sessionHash)
          .run();
      } else {
        if (!/^[0-9a-f]{12}$/.test(target.id)) throw new HttpError(404, 'not-found');
        r = await db
          .prepare(
            'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND substr(id_hash, 1, 12) = ? AND revoked_at IS NULL',
          )
          .bind(now, ctx.userId, target.id)
          .run();
        if (r.meta.changes === 0) throw new HttpError(404, 'not-found');
      }
      return r.meta.changes;
    },
  };
}

/** 만료·철회 후 KEEP_AFTER_END가 지난 세션을 한 번에 limit개까지 지운다(무료 쓰기 한도를 아낀다). */
export async function purgeSessions(db: D1Database, now: number, limit = 500): Promise<number> {
  const old = now - KEEP_AFTER_END;
  const r = await db
    .prepare(
      `DELETE FROM sessions WHERE id_hash IN (SELECT id_hash FROM sessions WHERE last_used_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?) LIMIT ?)`,
    )
    .bind(old - SESSION_TTL, old, limit)
    .run();
  return r.meta.changes;
}
