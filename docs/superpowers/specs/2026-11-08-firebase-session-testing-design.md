# firebase-session 개발·시험 진입점 설계 (2026-11-08)

## 전제와 이유

- 전제: 운영자 1명, 소수 지인, Cloudflare 무료. 쓰는 곳은 가즈아·repass·랜드마크·synctx 네 서비스.
- 이미 있는 것으로 안 되는 이유: 가짜 카카오·네이버 공급자, 가짜 인가 주소 바꾸기, 시험용 D1, 시험용 ID 토큰 서명기가 서비스마다 복사되어 따로 고쳐지고 있다(repass `7d87381`의 `dev-` 접두 수정이 가즈아에는 없다). 패키지의 소셜 로그인 형식이 바뀌면 사본이 모두 따라 바뀌어야 하므로 패키지가 함께 가진다.
- 운영 번들에 들어가지 않는다. 기존 `/worker`·`/client`·`/vite`는 새 코드를 import하지 않는다.

## 진입점

| 진입점                                 | 실행 환경                           | 내용                                                                                      |
| -------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `@sch0718/firebase-session/testing`    | Worker(workerd)·Node·브라우저(개발) | 가짜 공급자(서버), 가짜 인가 주소 바꾸기(브라우저), 가짜 client ID, 시험용 ID 토큰 서명기 |
| `@sch0718/firebase-session/testing/d1` | Node만(`node:sqlite`)               | 시험용 D1                                                                                 |

- 둘로 나누는 이유: synctx 시험은 workerd(`@cloudflare/vitest-plugin`)에서 돌아 `node:sqlite`를 불러올 수 없다. 가즈아 개발 Worker 진입점도 workerd에서 돈다. 그래서 Node 전용인 D1만 따로 둔다.
- 브라우저 코드와 서버 코드를 더 나누지 않는다. 브라우저는 개발 모드 분기 안에서 동적 import로만 부르므로 크기·의존성이 문제 되지 않는다. `/testing`은 `../worker`의 `SOCIAL_PROVIDERS`를 통해 jose를 함께 불러오지만 개발 중에만 그렇다.
- 시험 전용이라 `.size-limit.json`에 넣지 않는다. 기존 `/client`·`/worker` 한도가 운영 번들의 변화를 그대로 잡는다.

## API

### `/testing` — 가짜 공급자

```ts
export const FAKE_CLIENT_IDS: Readonly<Record<SocialProvider, string>>; // { kakao: 'dev-fake-kakao', naver: 'dev-fake-naver' }
export const FAKE_CLIENT_SECRET: string; // 'dev-fake-secret'
export type FakeSocialResult = 'ok' | 'cancel' | 'provider-error' | 'bad-code' | 'down';

export interface FakeSocialOptions {
  /** 가짜 화면 경로 접두사. 예: '/dev/fake-social', '/api/sync/dev/fake-social', '/__dev/social' */
  basePath: string;
  now?: () => number; // 기본 Date.now
  /** 인가 화면 계정 입력의 기본값. 기본 'dev-user' */
  defaultSub?: string;
  /** approve 응답. 'redirect'(기본) = 302, 'refresh' = 200 HTML meta refresh(Playwright route.fulfill 등 302를 따라가지 않는 환경용) */
  approveResponse?: 'redirect' | 'refresh';
}
export interface FakeSocial {
  /** createSessionAuth의 social.keys에 넣는다. */
  keys: Record<SocialProvider, CertSource>;
  /** createSessionAuth의 social.fetch에 넣는다. 공급자 토큰 주소만 받고 그 밖의 주소는 던진다. */
  fetch: typeof fetch;
  /** `${basePath}/authorize`·`${basePath}/approve`의 GET을 처리한다. 경로가 다르거나 요청 주소가 로컬이 아니면 null. */
  handle(request: Request, redirectUris: readonly string[]): Promise<Response | null>;
  /** approve와 같은 검사로 콜백 주소를 만든다(시험에서 화면 없이 코드를 얻을 때). 요청이 틀리면 null. */
  approve(query: URLSearchParams, redirectUris: readonly string[]): string | null;
}
export function createFakeSocial(o: FakeSocialOptions): FakeSocial;

/** 요청 주소의 호스트가 localhost·127.0.0.1·[::1]인지. 서비스가 가짜 keys·fetch·client ID를 연결할지 정할 때 쓴다. */
export function isLocalRequest(request: Request): boolean;

/** 실제 공급자 인가 URL을 `${fakeBase}/authorize?<같은 질의>&provider=<공급자>`로 바꾼다. 모르는 주소면 던진다. */
export function fakeAuthorizeUrl(realUrl: string, fakeBase: string): string;
```

동작은 repass·랜드마크 사본을 그대로 옮긴다.

- 코드 `fake.<base64url(JSON)>`에 `FakeCode{v,p,s,c,n,r,a,x,e}`를 담는다. 서버에 상태를 두지 않아 요청마다 `createFakeSocial`을 새로 불러도 된다(랜드마크 방식).
- RSA 키는 모듈 변수 하나에 지연 생성한다(Web Crypto, 내보낼 수 없는 키, kid `dev-fake-1`).
- 토큰 교환은 `grant_type`, `client_id === code.a === FAKE_CLIENT_IDS[p]`, `client_secret === FAKE_CLIENT_SECRET`, `redirect_uri`, 만료 5분, PKCE S256을 확인한다. `bad-code`는 400 `invalid_grant`, `down`은 503이다.
- 인가 화면은 질의를 hidden으로 옮기고 계정 ID와 결과 5종을 고른다. 헤더는 `Content-Type`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, CSP `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' <콜백 출처>; base-uri 'none'; frame-ancestors 'none'`.
- `cancel`은 `error=access_denied`, `provider-error`는 `error=server_error`로 콜백한다.

서비스마다 다르던 값은 이렇게 맞춘다.

| 값                | repass             | 랜드마크                    | 가즈아              | 패키지                                                       |
| ----------------- | ------------------ | --------------------------- | ------------------- | ------------------------------------------------------------ |
| 경로 접두사       | `/dev/fake-social` | `/api/sync/dev/fake-social` | `/__dev/social/<p>` | `basePath` 옵션. 공급자는 질의 `provider`로(가즈아가 맞춘다) |
| `Cache-Control`   | `no-store`         | `private, no-store`         | `no-store`          | `private, no-store` 하나                                     |
| 기본 sub          | `dev-user`         | `dev-me`                    | `dev-user`          | `defaultSub` 옵션, 기본 `dev-user`                           |
| approve 응답      | 302                | meta refresh                | 302                 | `approveResponse` 옵션, 기본 302                             |
| redirect URI 목록 | env에서            | 인자                        | env에서             | `handle`·`approve`의 인자                                    |
| client ID·시크릿  | `dev-fake-*` 고정  | `dev-fake-*` 고정           | env 값              | `dev-fake-*` 고정(가즈아가 맞춘다)                           |

안전장치:

1. `handle`은 `isLocalRequest(request)`일 때만 응답한다. 아니면 null(서비스의 기본 404로 넘어감).
2. `handle`의 검사는 화면 경로만 지킨다. **가짜 `keys`·`fetch`·client ID를 인증 처리기에 연결하는 조건은 서비스가 정하고, 그 조건에 로컬 요청 검사를 반드시 넣는다**(repass `dev.ts`의 진입점 전체 `isLocalDev`, 랜드마크 `devFakeEnabled`처럼). 패키지는 같은 검사를 `isLocalRequest`로 내보낸다. README에 적는다.
3. 계정 ID는 `dev-` 접두를 강제한다(approve에서 붙이고, 토큰 교환에서 다시 확인). 허용 목록에 실제 계정만 있으면 가짜가 잘못 연결돼도 로그인되지 않는 두 번째 방어선이다. 허용 목록이 비면 모두 허용하는 서비스(랜드마크 `allowListOpen`)에서는 이 방어선이 없으므로 2번이 유일한 장치다.
4. client ID·시크릿은 `dev-fake-*` 고정값만 받는다.
5. 별도 진입점이라 운영 코드가 import하지 않는다. 브라우저는 `import.meta.env.DEV` 분기 안의 동적 import로만 부른다(README에 적는다).

`fakeAuthorizeUrl`은 실제 URL의 `origin + pathname`이 `SOCIAL_AUTHORIZE_URLS`의 값과 정확히 같을 때만 공급자로 인정한다(세 사본 중 가장 엄격한 가즈아 방식). `fakeBase` 끝의 `/`는 무시한다.

### `/testing` — 시험용 ID 토큰 서명기

```ts
export interface TestTokensOptions {
  projectId: string;
  now?: () => number; // 기본 Date.now
}
export interface TestTokens {
  /** jose generateKeyPair('RS256', { extractable: true }) 결과 */
  keys: { publicKey: CryptoKey; privateKey: CryptoKey };
  /** kid가 'k1'이면 publicKey, 아니면 null */
  certs: CertSource;
  /** Firebase 모양 ID 토큰. 값이 undefined인 클레임은 뺀다. */
  token(
    claims?: Record<string, unknown>,
    o?: { now?: number; kid?: string; key?: CryptoKey; alg?: string },
  ): Promise<string>;
}
export function createTestTokens(o: TestTokensOptions): Promise<TestTokens>;
```

기본 클레임은 패키지 `test/tokens.ts`와 같다: `iss: https://securetoken.google.com/<projectId>`, `aud: projectId`, `sub: 'uid-me'`, `auth_time`·`iat: now`, `exp: now + 3600`, `email: 'me@example.test'`, `email_verified: true`, 헤더 kid `k1`. 서비스마다 다른 기본값(repass의 `a@example.test` 등)은 호출마다 `claims`로 덮는다. 공급자 ID 토큰(카카오·네이버)도 `iss`·`aud`·`nonce`를 덮어 같은 함수로 만든다.

### `/testing/d1` — 시험용 D1

```ts
export interface TestD1Options {
  /** 마이그레이션 SQL 폴더(경로 또는 file: URL). .sql을 파일 이름순으로 적용한다. 없으면 빈 DB. */
  migrations?: string | URL;
  /** 이 파일 이름까지(포함)만 적용한다. */
  through?: string;
}
export interface TestD1 extends D1Database {
  readonly raw: DatabaseSync;
  /** 다음 batch 한 번을 0부터 센 이 위치에서 실패시킨다(롤백 확인용). */
  failNextBatchAt(index: number): void;
  /** 참이면 first/all/run 전에 매크로태스크로 양보한다(경쟁 조건 시험용). */
  interleave: boolean;
  close(): void;
}
export function createTestD1(o?: TestD1Options): TestD1;
```

세 사본의 기능을 합친다.

- `PRAGMA foreign_keys = ON`. batch는 `BEGIN`/`COMMIT`, 실패하면 `ROLLBACK`. 다른 DB의 문장은 TypeError(repass·랜드마크).
- 바인딩: `null`·`string`·`number`·`Uint8Array`, `ArrayBuffer`는 `Uint8Array`로. `undefined`·`boolean`·그 밖은 TypeError(실제 D1은 boolean을 1/0으로 넣지만, 사본들처럼 막아 실수를 드러낸다).
- `?1` 번호 매개변수는 `node:sqlite`가 그대로 지원한다(2026-11-08 Node 24에서 확인). 랜드마크의 바꿔 쓰기는 옮기지 않는다.
- 행을 돌려주는 문장인지는 `StatementSync.columns().length > 0`으로 가린다(`PRAGMA`도 맞게 처리). 그래서 `/testing/d1`은 **Node 22.16 이상**을 요구한다(README에 적는다. 정규식 대체 경로는 두지 않는다).
- 변경 수: 행 문장은 `.all()` 전후 `total_changes()` 차이(repass 방식, `INSERT … RETURNING`이 1을 돌려준다), 그 밖은 `run().changes`.
- 행은 null 프로토타입 객체를 평범한 객체로 펼친다(`toEqual` 비교용).
- 선언 파일에 `/// <reference types="node" preserve="true" />`가 들어간다. 쓰는 서비스는 `@types/node`가 있어야 한다(가즈아·랜드마크·repass worker 모두 있음).

## 패키지 안 시험 도우미

- `test/d1.ts`는 몇 줄 감싸개로 줄인다. 기존 서명 `createTestD1(migrations?: readonly string[])`를 그대로 두고, 목록의 마지막 파일 이름을 `through`로 넘긴다(지금 쓰는 목록은 `['0001_users_sessions.sql']` 하나뿐). `src/worker/`의 시험 파일은 고치지 않는다(다른 세션 범위).
- `test/tokens.ts`는 `createTestTokens`로 다시 쓰되 기존 내보내기(`PROJECT`, `ME`, `OTHER`, `T0`, `keys`, `otherKeys`, `certs`, `token(now, claims, o)`)를 유지해 기존 시험 33곳을 고치지 않는다.
- `test/social.ts`는 패키지 시험 전용 값이라 그대로 둔다.

## 시험

- `src/testing/fake-social.test.ts`: `beginSocialSignIn`으로 만든 인가 URL → `fakeAuthorizeUrl` → `handle(authorize)` 200 HTML(CSP·hidden·결과 5종) → `handle(approve)` 302 → 콜백 `code` → 패키지 `createSessionAuth` 소셜 로그인 성공(`kakao:dev-user`). 결과 `cancel`·`provider-error`의 콜백 질의, `bad-code` 401 `invalid-code`, `down` 503 `provider-unavailable`. 로컬이 아닌 요청은 null, `basePath` 밖 경로 null, 틀린 client ID·redirect URI 400, `dev-` 없는 sub는 접두가 붙음, 위조한 코드의 `s`에 `dev-`가 없으면 교환 거절, `approveResponse: 'refresh'`, `approve()` 직접 호출, 모르는 주소의 `fetch`는 던짐, `fakeAuthorizeUrl`의 엄격한 공급자 판별.
- `src/testing/d1.test.ts`: 바인딩 허용·거절, `?1` 재사용, `PRAGMA` 결과, `changes`(`INSERT … RETURNING`은 행과 1), `failNextBatchAt` 롤백, 다른 DB 문장 거절, `migrations`+`through`, `interleave`가 양보하는지, `close`.
- 토큰 서명기는 기존 `verify`·`session` 시험이 `test/tokens.ts`를 거쳐 그대로 덮는다. 따로 시험하지 않는다.
- 호환 시험: 두 fixture에 `/testing` import를 더한다(`@types/node` 없이 검사). `/testing/d1`은 `pnpm-ts59`에만 `@types/node`와 별도 `tsconfig.node.json`으로 검사하고, 기존 `tsconfig.json`은 `types: []`로 node 타입 없이 검사를 유지한다. Are the types wrong?·publint 검사 대상에 새 진입점이 자동으로 들어간다.

## 서비스 이행(이 세션은 하지 않음, README에 적음)

| 서비스   | 지울 파일                                                                               | 바꿀 것                                                                                                                                                                                                                                                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| repass   | `worker/src/devFakeSocial.ts`, `app/src/lib/sync/devFakeSocial.ts`, `worker/test/d1.ts` | `dev.ts`: `createFakeSocial({ basePath: '/dev/fake-social' })`, `handle(req, socialRedirectUris(env))`. `isLocalDev`는 `dev.ts`로 옮기거나 패키지 검사로 충분하면 지운다. 앱: `fakeAuthorizeUrl(url, apiUrl + '/dev/fake-social')`. 시험: `/testing/d1`, `createTestTokens`. 가짜 연결 조건(`isLocalDev`)은 진입점 전체 검사로 유지                                   |
| 랜드마크 | `src/server/library-sync/dev-fake-social.ts`, `tests/helpers/sqlite-d1.ts`              | `createFakeSocial({ basePath: '/api/sync/dev/fake-social', defaultSub: 'dev-me', approveResponse: 'refresh' })`. `login.ts`의 `fakeAuthorizeUrl`을 지우고 개발 분기 안에서 동적 import(지금은 운영 번들에 들어 있음). D1 결과 전체를 `{ results }`와 비교하는 시험(`meet-db.test.ts` 등)은 `.results` 비교로 바꾼다(기존 도우미는 `success`·`meta`를 열거하지 않았다) |
| 가즈아   | `src/lib/sync/socialDev.ts`, `sync-worker/test/d1.ts`                                   | `devSocialEntry.ts`: `createFakeSocial({ basePath: '/__dev/social' })`, 경로가 `/__dev/social/authorize?provider=`로 바뀜, 개발 env의 client ID·시크릿을 `dev-fake-*`로. **`sync-worker/test/fakeSocial.ts`는 남긴다**: 시험이 코드 1회 사용·동시 교환(`social.test.ts:84,92`), `calls`, 키 장애, `no-id-token`에 기대며 이것은 가즈아 시험만 쓰는 상태 있는 대역이다 |
| synctx   | `deploy/pages/test/helpers.ts`의 `fakeGoogle`                                           | `createTestTokens({ projectId: 'synctx-test' })`                                                                                                                                                                                                                                                                                                                      |

## 범위 밖

- 마이그레이션 SQL 사본(README가 안내하는 의도된 복사), 한 곳만 쓰는 것(repass `devAuth.ts` 인증서 바꿔 끼우기), 가즈아 시험 가짜의 `calls`·`fail`·`no-id-token`·카카오 `email` 클레임(가즈아 시험만 쓴다).
- `src/worker/` 수정(다른 세션 범위). 새 코드는 `src/worker`를 import만 한다.
