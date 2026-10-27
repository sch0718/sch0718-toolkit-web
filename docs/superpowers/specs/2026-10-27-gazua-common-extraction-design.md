# 가즈아 공통 코드 추출 설계

- 날짜: 2026-10-27
- 대상 저장소: `sch0718-toolkit-web`(이 저장소), `gazua`(`10.repository/gazua`)
- 배경: repass 1차 설계(`repass/docs/superpowers/specs/2026-10-27-repass-phase1-design.md` 9.4장). repass 웹앱이 가즈아와 같은 스택(Svelte 5, Firebase Google 로그인 + 이메일 허용 목록, Cloudflare Workers/D1, PWA)을 쓰므로, 가즈아의 공통 코드를 패키지로 먼저 추출하고 두 서비스가 함께 쓴다.

## 1. 목표와 완료 기준

- 가즈아의 로그인 도우미·CSP·PWA 설정, Worker 인증·세션·CORS·HTTP, 클라이언트 인증·API 핵심, UI 토큰·컴포넌트, 라이선스 고지 스크립트를 이 저장소의 패키지 4개로 옮긴다.
- 가즈아가 새 패키지를 쓰도록 바꾸고, 가즈아의 기존 검사가 모두 통과한다: `pnpm check`, `pnpm check:e2e`, `pnpm test`, `pnpm test:scripts`, `pnpm build`, `pnpm --filter sync-worker check`, `pnpm --filter sync-worker test`, `pnpm e2e`(Playwright).
- 이 저장소의 `pnpm run verify`와 `pnpm compat`이 통과한다.
- push·PR 병합·발행은 단계마다 사용자 확인 뒤에 한다.

## 2. 넣는 기준 개정

이번 추출은 README 「넣는 기준」 1번·4번과 부딪힌다. 사용자 결정(2026-10-27)에 따라 다음과 같이 고친다.

- **1번(프레임워크 무관):** 원칙은 그대로다. 어댑터 조건("그 프레임워크를 쓰는 서비스가 두 곳 생길 때 별도 패키지로")을 Svelte·Vite는 가즈아·repass로 충족한다. 그래서 `ui-svelte`, `vite-app`, `firebase-session/vite`를 둔다. 프레임워크를 import하는 코드는 패키지 이름이나 서브경로에 그 프레임워크가 드러나게 한다.
- **4번(서비스 데이터 형식·보안 정책 제외):** "장치는 넣고 값은 서비스에"로 바꾼다. 토큰 검증, 세션 처리, CSP 변환 같은 장치는 패키지에 둔다. 허용 이메일, 허용 출처, 세션 헤더 이름, D1 바인딩, 매니페스트 같은 값은 서비스가 주입한다. 패키지가 SQL을 실행하는 테이블은 패키지가 스키마를 소유하고 마이그레이션 SQL을 함께 배포한다. 서비스 고유의 데이터 형식(가즈아의 프로필 문서, 공유 스냅샷)은 계속 넣지 않는다.
- README 「호환 시험」의 "패키지를 추가하면 각 fixture에 추가"는 "그 패키지를 쓰는 서비스의 fixture에 추가"로 고친다.

## 3. 패키지 구성

| 패키지                      | 실행 환경                      | 의존                                                                                                | 진입점                                             |
| --------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `@sch0718/firebase-session` | Workers / 브라우저 / Vite 빌드 | `jose`. peer(선택): `firebase` (`vite`는 타입만 쓰므로 peer로 두지 않는다. 구현 중 결정, 아래 14장) | `./worker`, `./client`, `./vite`, `./migrations/*` |
| `@sch0718/vite-app`         | Vite 빌드                      | peer: `vite`, `vite-plugin-pwa`                                                                     | `.`                                                |
| `@sch0718/ui-svelte`        | 브라우저(Svelte 5)             | peer: `svelte` ^5                                                                                   | `.`, `./tokens.css`                                |
| `@sch0718/license-notices`  | Node                           | 없음                                                                                                | `.`                                                |

- 클라이언트와 Worker는 엔드포인트 경로, 오류 코드, 세션 헤더 전달 방식이라는 약속을 공유한다. 그래서 둘을 한 패키지의 서브경로로 묶어 같은 버전으로 움직이게 한다.
- 진입점이 서로를 import하지 않게 한다. `./worker`를 쓰는 서비스는 firebase나 vite가 없어도 타입 검사와 빌드가 된다.
- `jose`는 `dependencies`에, `firebase`·`vite`는 `peerDependencies` + `peerDependenciesMeta.optional`에 둔다.
- 모든 패키지는 ESM만, `sideEffects: false`(ui-svelte는 `["**/*.css"]`), PolyForm Noncommercial 1.0.0, GitHub Packages 발행이다.

## 4. `@sch0718/firebase-session`

### 4.1 `./worker`

가즈아 `sync-worker/src/{auth/certs.ts, auth/verify.ts, session.ts, cors.ts, http.ts, db.ts}`와 `purge.ts`의 세션 정리 부분을 옮긴다.

```ts
// 인증서·토큰(동작 그대로)
export function googleCerts(fetchImpl?, now?, url?): CertSource;
export class CertsUnavailableError extends Error {}
export function verifyIdToken(
  token,
  { projectId, certs, now, allowedEmails },
): Promise<VerifiedUser>;
export class AuthError extends Error {
  code: 'missing-token' | 'invalid-token' | 'not-allowed';
}
export function bearer(req: Request): string | null;
export function parseAllowList(raw: string | undefined): Set<string>;

// 기기 세션
export function createSessionAuth(opts: {
  db: D1Database;
  projectId: string;
  allowedEmails: string | undefined; // 콤마 구분 원문(secret). 비면 아무도 못 들어온다
  certs: CertSource;
  sessionHeader: string; // 가즈아: 'X-Gazua-Session'
  defaultLabel?: string; // 기본 '이름 없는 기기'
  now: () => number;
  random: (n: number) => Uint8Array;
  uuid: () => string;
}): {
  verifiedUser(req): Promise<VerifiedUser>;
  create(req, body: unknown): Promise<{ sessionId: string; expiresAt: number }>;
  authenticate(req): Promise<AuthContext>;
  list(ctx): Promise<DeviceSessionRow[]>;
  revoke(ctx, target: { id: string } | 'current' | 'others'): Promise<number>;
};
export function purgeSessions(db: D1Database, now: number, limit?: number): Promise<number>;
export const SESSION_TTL, TOUCH_INTERVAL, REAUTH_WINDOW, LABEL_MAX;

// CORS·HTTP
export function matchOrigin(req, allowedOriginsRaw: string): string | null;
export function corsHeaders(origin: string): Record<string, string>;
export function preflight(origin: string, opts: { methods: string; headers: string }): Response;
export class HttpError extends Error {
  status;
  code;
  extra;
}
export function json(status, body, headers?): Response;
export function errorBody(code, extra?): { error: string };
export function readJson(req, max?): Promise<unknown>;
export function sha256Hex(s: string): Promise<string>;
export function base64url(bytes: Uint8Array): string;
export function isCapability(s: string | null): s is string;
export type { D1Database, D1PreparedStatement, D1Result, D1Meta };
```

- 세션 상수(30일 슬라이딩 만료, 1시간 갱신 간격, 5분 재인증 창, 라벨 40자)와 SQL은 지금 값 그대로다.
- `createSessionAuth`가 실패를 `HttpError`(401·403)로 바꾸는 것도 지금과 같다. 인증서를 받지 못하면 `CertsUnavailableError`를 그대로 던지고, 서비스 라우터가 503으로 바꾼다.
- 엔드포인트 경로(`POST/DELETE /v1/session`, `GET /v1/sessions`, `DELETE /v1/sessions?others=1`, `DELETE /v1/sessions/:id`)는 `SESSION_PATHS` 상수와 README로 문서화한다. 라우팅은 서비스가 한다.
- `./migrations/0001_users_sessions.sql`: `users`, `sessions` 테이블과 `sessions_user` 색인. 가즈아 `0001_init.sql`의 해당 부분과 같으므로 가즈아 DB에는 변경이 없다. 새 서비스는 이 파일을 자기 `migrations/`에 복사한다. 스키마를 바꿀 때는 새 번호의 마이그레이션 파일을 더하고 changeset에 적는다.

### 4.2 `./client`

가즈아 `src/lib/sync/{config.ts, auth.ts, firebaseImpl.ts}`와 `api.ts`의 공통 부분을 옮긴다.

```ts
export interface SyncConfig {
  apiUrl: string;
  firebase: { apiKey; authDomain; projectId; appId };
}
export function readSyncConfig(
  env: Record<string, string | boolean | undefined>,
): SyncConfig | null;

export interface AuthUser {
  uid: string;
  email: string | null;
}
export interface AuthClient {
  ready();
  signIn();
  redirectResult();
  signOut();
  idToken(forceRefresh?);
}
export function firebaseAuth(cfg: SyncConfig['firebase']): AuthClient;

export type BaseFail =
  | { ok: false; kind: 'auth'; code: string; session?: string }
  | { ok: false; kind: 'not-allowed' }
  | { ok: false; kind: 'offline' }
  | { ok: false; kind: 'limit'; code: string }
  | { ok: false; kind: 'invalid'; code: string; path?: string }
  | { ok: false; kind: 'not-found' }
  | { ok: false; kind: 'server'; status: number };
export type ApiResult<T, F = BaseFail> = { ok: true; data: T } | F;

export interface Credentials {
  idToken(forceRefresh?): Promise<string | null>;
  sessionId(): Promise<string | null>;
}

export function createSessionClient<X extends { ok: false; kind: string } = never>(opts: {
  baseUrl: string;
  credentials: Credentials;
  sessionHeader: string;
  fetch?: typeof fetch;
  /** 공통 매핑 전에 불린다. 서비스 고유 상태(가즈아의 409 conflict, 410 gone)를 바꾼다. undefined면 공통 매핑. */
  mapStatus?: (status: number, body: Record<string, unknown>) => X | undefined;
}): {
  send<T>(
    method,
    path,
    opts?: { body?; auth?: 'session' | 'token' | 'none'; headers?; token? },
  ): Promise<ApiResult<T, BaseFail | X>>;
  createSession(
    idToken,
    label,
  ): Promise<ApiResult<{ sessionId: string; expiresAt: number }, BaseFail | X>>;
  endSession();
  listSessions();
  revokeSession(id: string | 'others');
};
export interface DeviceSession {
  id;
  label;
  createdAt;
  lastUsedAt;
  expiresAt;
  current;
}
```

- `firebaseAuth`는 지금처럼 SDK를 `import('./firebaseImpl.js')`로 지연 로드한다. 로딩이 실패하면 다음 호출에서 다시 시도한다. 소비 앱의 Vite가 이 동적 import를 별도 청크로 나누고, 파일 이름이 같아서 청크 이름 `firebaseImpl-*.js`가 유지된다.
- 공개 타입(`index.d.ts`)에는 firebase 타입이 드러나지 않는다. `firebaseImpl.d.ts`는 dist에 있지만 소비자가 import하지 않는다.
- `send`의 동작(오프라인이면 offline으로 바꾸기, `invalid-token`이면 토큰을 한 번 새로 받아 다시 보내기, 실패한 요청이 쓴 세션을 `session`에 실어 주기, `cache: 'no-store'`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`)은 그대로다.
- 가즈아의 `SyncApi`(profiles·shares 메서드)와 `ProfileDocV1`·`ShareSnapshot` 타입은 가즈아에 남는다. 가즈아는 이 메서드들을 `send` 위에 만든다.

### 4.3 `./vite`

가즈아 `auth-helper.config.ts`와 `csp.config.ts`의 Firebase 부분을 옮긴다.

```ts
export function firebaseAuthHelper(opts?: { fetch?: FetchFn }): Plugin; // name: 'sch0718-firebase-auth-helper'
export function firebaseCsp(): Plugin; // name: 'sch0718-firebase-csp'
export function fetchAuthHelper(projectId, fetchFn?): Promise<{ fileName; source }[]>;
export function selfHostsAuthHelper(authDomain): boolean;
export function applyFirebaseCsp(html: string, authDomain: string | undefined): string;
export const AUTH_HELPER_FILES, FIREBASE_SCRIPT_SOURCES;
/** PWA 설정용: 로그인할 때만 받는 파일(서비스 워커가 미리 담지 않는다) */
export const AUTH_GLOB_IGNORES = ['assets/firebaseImpl-*.js', '__/**'];
export const AUTH_NAVIGATE_DENYLIST = [/^\/__\//];
```

- `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`를 읽는 것도 지금과 같다.
- index.html의 CSP 원문은 서비스에 둔다. 플러그인은 기준 문구(`script-src 'self'`, `default-src 'self';`)가 없으면 빌드를 멈춘다.

## 5. `@sch0718/vite-app`

가즈아 `pwa.config.ts`와 `csp.config.ts`의 개발 서버 부분을 옮긴다.

```ts
export function createPwaOptions(opts: {
  manifest: Partial<ManifestOptions>; // 이름·색·아이콘 등 앱별 값
  cachePrefix: string; // 가즈아: 'gazua' → 'gazua-fonts'
  runtimeCaching?: RuntimeCaching[]; // 공통 규칙 뒤에 붙는다
  globIgnores?: string[]; // 앱 셸에서 뺄 파일
  navigateFallbackDenylist?: RegExp[]; // 공통 규칙 뒤에 붙는다
}): Partial<VitePWAOptions>;
export function devCsp(opts?: { connectSources?: string[] }): Plugin; // apply: 'serve'
export function applyDevCsp(html: string, sources?: string[]): string;
export const DEV_LOCAL_PROXY_SOURCES;
```

- 공통 기본값은 `registerType: 'autoUpdate'`, `injectRegister: 'script'`(CSP `script-src 'self'`), `skipWaiting`·`clientsClaim`, `globPatterns: ['**/*.{html,js,css,svg,png,webmanifest}']`, 확장자 있는 주소의 fallback 제외(`/\.\w+$/`), 같은 출처 woff2의 CacheFirst다.
- 매니페스트 공통값(`lang: 'ko'`, `start_url`·`scope: './'`, `display: 'standalone'`)은 기본으로 넣고, 서비스 값이 덮어쓴다.
- 가즈아는 `globIgnores: ['help/**', ...AUTH_GLOB_IGNORES]`와 universe·help 캐시 규칙을 넘긴다. 결과 객체는 지금 `pwaOptions`와 같아야 한다(가즈아 `pwa.config.test.ts`가 확인).

## 6. `@sch0718/ui-svelte`

- **`tokens.css`:** 범용 토큰을 라이트(`:root`), 다크 자동(`prefers-color-scheme`), 다크 지정(`[data-theme='dark']`) 세 블록에 둔다. 범용 토큰은 `--bg`, `--surface`, `--surface2`, `--line`, `--t1~3`, `--accent`, `--accent-soft`, `--on-accent`, `--snack-action`, `--ok`, `--warn`, `--err`, `--scrim`, `--shadow`, `--seg-card-*`, 그리고 크기·움직임 토큰이다. 기본 리셋, 버튼·입력 초기화, 포커스 링, 숫자 정렬 유틸리티 `.num`(`tabular-nums`)도 담는다. 값은 지금 가즈아 값이다.
- Pretendard `@import`는 빼고 `--font`에 글꼴 이름 목록만 둔다. 글꼴 로딩(패키지 의존)은 서비스가 한다.
- `body`의 `overscroll-behavior-y: contain`은 가즈아의 당겨서 새로고침 때문에 들어간 것이라 가즈아에 남긴다.
- **`theme.ts`:** `applyTheme(choice)`와 `ThemeChoice`.
- **컴포넌트:** `Badge`, `Banner`, `Chip`, `Segmented`, `Sheet`, `Snackbar`, `SnackbarHost`, `Toggle`. 스낵바 저장소의 `showSnackbar`, `dismissSnackbar`, `holdSnackbar`, `holdSnackbarWhileFocused`, `releaseSnackbar`, `currentSnackbar`, `runSnackbarAction`과 `SnackbarAction`·`SnackbarItem` 타입도 내보낸다.
- Sheet 닫기 단추의 `aria-label="닫기"`는 `closeLabel` prop(기본값 '닫기')으로 바꾼다. 나머지 동작과 마크업은 그대로다.
- 시험 전용 `SheetSegmentedFixture.svelte`는 패키지의 시험 폴더로 옮기고 배포하지 않는다.
- **빌드:** `@sveltejs/package`(svelte-package)로 `src/lib`를 `dist`로 옮기고 `.d.ts`를 만든다. `exports`는 `{ ".": { "types", "svelte", "default" }, "./tokens.css": "./dist/tokens.css" }`이다.
- **검사:** publint는 돌린다. attw와 size-limit은 `.svelte`를 다루지 못해 이 패키지에서 뺀다. 크기는 가즈아 빌드 결과로 확인한다.
- **가즈아에 남는 것:** `--up`, `--down`, `--s1~10`, `--etf-*`, `--line-bench`, `--band`, `--hatch`, `--grid`, `:root.global-colors`, `applyColorConvention`, `.up`·`.down`, Pretendard 로딩. 가즈아 `tokens.css`는 패키지 `tokens.css` 다음에 불러오는 가즈아 전용 토큰 파일이 된다. 라이트·다크 세 블록 구조는 그대로 따른다.
- **`tokens.test.ts` 분리:** 구조 검사(세 블록의 토큰 이름·다크 값 일치, 대비 기준)는 패키지로 옮긴다. 가즈아 팔레트 값과 주식 색 검사는 가즈아에 남긴다.

## 7. `@sch0718/license-notices`

가즈아 `scripts/build-notices.mjs`를 옮긴다. TypeScript로 쓰고 `tsc`로 빌드한다.

```ts
export function writeNotices(opts: {
  out: string; // 예: 'public/licenses.txt'
  cwd?: string; // pnpm licenses list를 실행할 폴더
  appName: string; // '가즈아'
  licenseUrl: string; // 앱 자체 라이선스 주소
  upstreamDir: string; // 배포본에 라이선스 파일이 없는 패키지의 원문 폴더
  upstream: (name: string) => string | null; // 패키지 이름 → upstreamDir 안의 파일
  bundledDev: (name: string) => boolean; // 번들에 들어가는 devDependencies
}): { count: number };
export function flatten(byLicense, keep?): Pkg[];
export function render(pkgs, o: { head; readTexts; upstream; readUpstream; upstreamLabel }): string;
export function noticeHead(appName, licenseUrl, appLicense?): string;
export function readTexts(dir: string): { file: string; text: string }[];
export const NOTICE_FILE: RegExp;
```

- 동작은 그대로다. 같은 upstream 원문은 한 번만 싣고, 원문을 못 찾으면 빌드를 멈추고, 임시 파일에 쓴 뒤 이름을 바꾸고, pnpm을 JS 진입점으로 띄운다(Windows).
- CLI는 두지 않는다. 가즈아 `scripts/build-notices.mjs`는 설정을 넘겨 `writeNotices`를 부르는 십여 줄 스크립트가 된다. `scripts/licenses/*.txt`, upstream 매핑, `BUNDLED_DEV` 목록은 가즈아에 남는다.

## 8. 저장소 정비

- **시험:** 루트 `vitest.config.ts`를 `test.projects`로 나눈다. `node` 프로젝트는 지금 패키지와 firebase-session·vite-app·license-notices를 맡는다. `svelte` 프로젝트는 ui-svelte를 맡고, `@sveltejs/vite-plugin-svelte`, `@testing-library/svelte`, jsdom, `resolve.conditions: ['browser']`를 쓴다. Worker 세션 시험은 `node:sqlite` 위의 작은 D1 가짜(가즈아 `sync-worker/test/d1.ts`를 시험 폴더로 복사)와 패키지 마이그레이션 SQL로 돌린다.
- **타입:** 옮긴 코드는 `@tsconfig/strictest`(`exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature` 등)에 맞게 손본다. 동작은 바꾸지 않는다. ui-svelte는 `svelte-check`로 검사하고 `verify`에 넣는다.
- **패키지 검사:** `check:package`는 seen-store처럼 `publint --strict && attw --pack . --profile esm-only`다. ui-svelte는 publint만 한다.
- **크기 한도(`.size-limit.json`):** `firebase-session/client`(`firebase` 제외), `firebase-session/worker`(`jose` 제외), `vite-app`을 추가한다. 한도는 처음 빌드 크기에 여유를 조금 둔 값으로 정한다.
- **호환 시험:** `fixtures/pnpm-ts59`에 `firebase`, `vite`, `vite-plugin-pwa`, `svelte`, `svelte-check`를 가즈아와 같은 버전으로 더한다. `index.ts`에서 새 TS 진입점을 모두 import해 `tsc`로 검사하고, `App.svelte` 사용 예는 `svelte-check`로 검사한다. `compat.mjs`는 fixture에 `check` 스크립트가 있으면 `tsc` 대신 그것을 실행한다. `yarn1-ts6`(랜드마크)는 바꾸지 않는다.
- **Changesets:** 새 패키지마다 minor(0.1.0) 기록을 남긴다.
- **문서:** 루트 README의 패키지 표·「넣는 기준」·「쓰는 도구」(svelte-package 추가, 별 수와 확인 날짜)·호환 시험 설명을 고친다. 패키지마다 README를 쓴다.

## 9. 가즈아 전환

- 가즈아 `main`을 origin에 맞춘 뒤 새 브랜치에서 작업한다.
- 개발 중에는 `pnpm --filter <패키지> pack`으로 만든 `.tgz`를 임시 설치해 확인한다(커밋하지 않는다).

| 가즈아 파일                                             | 바뀌는 모습                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite.config.ts`                                        | `firebaseAuthHelper()`, `firebaseCsp()`(firebase-session/vite), `devCsp()`, `VitePWA(pwaOptions)`                                                                                                                                                     |
| `auth-helper.config.ts`(+test), `csp.config.ts`(+test)  | 삭제. 시험은 패키지로 옮긴다                                                                                                                                                                                                                          |
| `pwa.config.ts`                                         | `createPwaOptions({ manifest, cachePrefix: 'gazua', globIgnores: ['help/**', ...AUTH_GLOB_IGNORES], navigateFallbackDenylist: AUTH_NAVIGATE_DENYLIST, runtimeCaching: [universe, help] })`. `pwa.config.test.ts`는 남겨 결과가 지금과 같은지 확인한다 |
| `sync-worker/src/auth/*`, `cors.ts`, `http.ts`, `db.ts` | 삭제하고 `@sch0718/firebase-session/worker`에서 import한다                                                                                                                                                                                            |
| `sync-worker/src/session.ts`                            | `createSessionAuth({ ..., sessionHeader: 'X-Gazua-Session' })`를 만들어 내보내는 얇은 파일. `session.test.ts`는 가즈아 라우터를 거치는 통합 시험으로 남긴다                                                                                           |
| `sync-worker/src/purge.ts`                              | 세션 정리는 `purgeSessions()`를 부른다                                                                                                                                                                                                                |
| `sync-worker/src/handler.ts`                            | `preflight(origin, { methods, headers: 'Authorization, Content-Type, X-Gazua-Session, X-Share-Token' })`                                                                                                                                              |
| `src/lib/sync/config.ts`, `auth.ts`, `firebaseImpl.ts`  | `config.ts`·`auth.ts`는 패키지를 다시 내보내는 얇은 파일로 남기고(`readSyncConfig`의 기본값 `import.meta.env`), `firebaseImpl.ts`는 삭제한다                                                                                                          |
| `src/lib/sync/api.ts`                                   | `createSessionClient({ sessionHeader: 'X-Gazua-Session', mapStatus })` 위에 profiles·shares 메서드를 만든다. `SyncApi` 타입은 그대로 둔다                                                                                                             |
| `src/lib/ui/tokens.css`                                 | 가즈아 전용 토큰만 남긴다. `main.ts`에서 Pretendard, `@sch0718/ui-svelte/tokens.css`, 가즈아 `tokens.css` 순서로 불러온다                                                                                                                             |
| `src/lib/ui/theme.ts`                                   | `applyColorConvention`만 남기고 `applyTheme`은 다시 내보낸다                                                                                                                                                                                          |
| `src/lib/ui/components/*`                               | 삭제하고 import 경로를 `@sch0718/ui-svelte`로 바꾼다. 시험은 패키지로 옮긴다                                                                                                                                                                          |
| `scripts/build-notices.mjs`                             | `writeNotices` 설정만 남긴다. `tests/build-notices.test.mjs`는 가즈아 설정(upstream 매핑, `BUNDLED_DEV`) 시험만 남긴다                                                                                                                                |

- 가즈아 루트에서는 네 패키지를 모두 devDependencies로 둔다. 정적 SPA라 런타임 코드도 번들에 들어가고, prod 의존으로 두면 peer(svelte, vite)와 그 의존(esbuild·rollup 등)이 `pnpm licenses list --prod`에 끌려 들어온다. 번들되는 `@sch0718/firebase-session`·`@sch0718/ui-svelte`는 고지 스크립트의 `BUNDLED_DEV`에 넣는다. sync-worker는 `@sch0718/firebase-session`을 dependencies에 둔다.
- 라이선스 고지: `@sch0718/*` 패키지도 `pnpm licenses list --prod`에 나오고 LICENSE 파일을 담고 있으므로 고지 파일에 실린다.
- 동작 변화가 없어야 한다. 바뀌는 것은 Vite 플러그인 이름(`gazua-*` → `sch0718-*`)뿐이다.

## 10. 발행과 반영 순서

각 단계의 push·병합·발행은 사용자 확인 뒤에 한다.

1. toolkit `feat/extract-gazua-common` 브랜치를 push하고 PR을 연다. CI(`verify`, `compat`)가 통과하면 병합한다.
2. 릴리스 워크플로가 연 Version Packages PR을 병합한다. GitHub Packages에 발행되고 스모크 설치가 돈다.
3. 사용자가 GitHub 화면에서 새 패키지 4개마다 Manage Actions access로 `gazua` 저장소에 Read 권한을 준다.
4. 사용자가 로컬 셸에 `GITHUB_PACKAGES_TOKEN`(classic, `read:packages`)을 설정한다.
5. 가즈아 PR:
   - `.npmrc`를 추가한다.
   - 정확한 버전으로 설치하고 lockfile을 커밋한다.
   - `ci.yml`과 `deploy.yml`의 설치 job에 `permissions: packages: read`와 `GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_TOKEN }}`을 넣는다.
   - sync-worker 배포 환경(wrangler를 돌리는 곳)에도 토큰이 필요한지 확인한다.

## 11. 오류 처리

추출 전후로 오류 동작은 같다.

- 토큰·세션 실패는 401·403과 오류 코드, 인증서 실패는 503, 본문 초과는 413, JSON이 아니면 400이다.
- 클라이언트는 이를 `ApiFail` 종류로 바꾼다.
- 빌드 플러그인은 설정값이 잘못됐거나 CSP 기준 문구가 없으면 빌드를 멈춘다.
- 고지 스크립트는 라이선스 원문이 빠지면 빌드를 멈춘다.

## 12. 시험

- 가즈아의 해당 단위 시험(`verify.test.ts`, 인증서 부분, `session.test.ts`의 세션 규칙, `api.test.ts`, `auth.test.ts`, `config.test.ts`, `theme.test.ts`, `tokens.test.ts`의 구조 부분, `components/*.test.ts`, `auth-helper`·`csp` 시험, `build-notices` 함수 시험)은 패키지로 옮겨 그대로 통과시킨다.
- 가즈아에는 연결을 확인하는 시험이 남는다: handler 통합 시험(세션 헤더 이름 포함), `pwa.config.test.ts`, 가즈아 팔레트 시험, 고지 설정 시험.
- 최종 확인은 1장의 가즈아 검사 전부와 이 저장소의 `verify`·`compat`이다.

## 13. 범위 밖

- repass 저장소 변경
- 랜드마크 적용
- 가즈아의 profiles·shares·sync 엔진·라우터
- 시험용 D1 가짜와 토큰 하네스의 공용 패키지화. repass Worker 시험을 만들 때 다시 판단한다.
- 발행 레지스트리 변경(GitHub Packages 유지)

## 14. 구현 중 바뀐 결정 (2026-10-27)

- `@sch0718/firebase-session`은 `vite`를 peer로 선언하지 않는다. 선택적 peer라도 pnpm이 workspace 루트의 vite를 Worker만 쓰는 패키지(가즈아 sync-worker)에 연결해, 라이선스 고지의 prod 목록에 vite·esbuild·rollup이 들어왔다.
- 가즈아 루트의 `@sch0718/*`는 모두 devDependencies다(9장). 번들되는 두 패키지는 `BUNDLED_DEV`로 고지에 싣는다.
- ui-svelte 시험의 jsdom은 29.1.1로 고정한다. jsdom 30은 계산된 `background`를 풀어 쓰고 `var()`를 지워, 가즈아에서 옮긴 Toggle 시험 두 개가 깨진다. Dependabot은 jsdom 메이저를 올리지 않는다.
- svelte 개발 의존은 5.57.2다. 5.57.3은 pnpm 최소 공개 기간 정책에 걸렸다.
- 가즈아 조건 호환 시험은 둘로 나눈다(사용자 결정). vite-app 사용 코드만 `skipLibCheck: true`로 검사한다. vite-plugin-pwa 2.0.0이 선택적 peer `@vite-pwa/assets-generator`를 import하고, workbox 타입이 WebWorker의 `ExtendableEvent`를 쓰기 때문이다.
- toolkit `pnpm-workspace.yaml`의 `allowBuilds`로 firebase가 끌어오는 설치 스크립트(`@firebase/util`, `protobufjs`)를 실행하지 않는다. pnpm 11은 승인하지 않은 빌드 스크립트가 있으면 frozen install을 실패시킨다.
