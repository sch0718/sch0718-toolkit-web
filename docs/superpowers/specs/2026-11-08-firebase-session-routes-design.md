# firebase-session 세션 API 라우트 처리기·소셜 설정 도우미 설계

- 날짜: 2026-11-08
- 대상: `@sch0718/firebase-session/worker`. 서비스(가즈아·repass·랜드마크·synctx) 적용은 범위 밖이며, 발행 뒤 서비스마다 따로 한다.
- 전제: 운영자 1명, 소수 지인, Cloudflare 무료 운영. 쓸모 있는 가장 작은 버전으로 만든다.

## 1. 왜 패키지에 넣는가

공용 `/client`가 부르는 세션 API 6개와 환경변수 → `social` 옵션 조립을 2026-10-29 소셜 로그인 도입 때 서비스마다 따로 만들었다. 같은 요청에 응답이 서로 다르다.

| 항목                | 가즈아                                | repass                             | 랜드마크                     | synctx                       |
| ------------------- | ------------------------------------- | ---------------------------------- | ---------------------------- | ---------------------------- |
| `?others=1`이 틀림  | 400 `bad-request`                     | 400 `invalid {path:'query'}`       | 422 `invalid`                | (API 없음)                   |
| 세션 ID 디코딩 실패 | URIError가 `guard()` 밖에서 새어 나감 | 400 `invalid`                      | 디코딩 안 함                 | (API 없음)                   |
| 카카오 시크릿       | 필수                                  | 선택                               | 선택                         | 선택                         |
| redirect 기본값     | 명시한 값만                           | `ALLOWED_ORIGINS`+`/auth/callback` | 요청 origin+`/auth/callback` | 요청 origin+`/auth/callback` |
| redirect 주소 검사  | 없음                                  | `#`·https/localhost                | 위 + 사용자 정보 거부        | 없음                         |

이미 있는 것(`createSessionAuth`, `SESSION_PATHS`)은 메서드만 주고 라우팅·상태 코드·오류 변환은 서비스에 맡겨서 이 차이가 생겼다. 세 서비스가 같은 코드를 쓰므로 「넣는 기준」 2를 만족하고, 헤더 이름·환경변수 이름·redirect 기본값은 계속 서비스가 넘긴다(기준 4).

## 2. 세션 API 라우트 처리기

### 2.1 모양

```ts
export function handleSessionRoute(
  req: Request,
  auth: SessionAuth,
  o?: SessionRouteOptions,
): Promise<Response | null>;

export interface SessionRouteOptions {
  /** 라우팅할 경로. 기본 new URL(req.url).pathname. 접두어(예: '/api/sync')를 뗀 값을 넘긴다. */
  path?: string;
  /** 세션 경로가 맞으면(405 포함) 로그용 패턴으로 한 번 부른다. 예: '/v1/sessions/:id' */
  onRoute?: (pattern: string) => void;
  /** POST /v1/session·/v1/session/social에서 본문을 읽기 전에 부른다(로그인 빈도 제한 등). */
  beforeCreate?: () => void | Promise<void>;
  /** 철회가 성공한 뒤 부른다(서비스 데이터 정리 등). */
  onRevoke?: (
    ctx: AuthContext,
    target: { id: string } | 'current' | 'others',
    revoked: number,
  ) => void | Promise<void>;
  /** 500으로 바꾼 오류를 남긴다. 기본 console.error */
  log?: (message: string) => void;
}
```

- 서비스는 CORS·출처 검사·preflight(OPTIONS)를 먼저 처리하고, 자기 라우터 앞에서 부른다. `null`이면 자기 라우터로 넘긴다.
- `auth`는 서비스가 요청마다 만든 `SessionAuth`다(세 서비스 모두 env를 요청마다 읽는다).
- 응답 헤더는 `json()` 그대로(`Content-Type`, `Cache-Control: no-store`). CORS 헤더는 서비스가 응답에 더한다(Response 헤더는 바꿀 수 있다).
- 서비스 고유의 로그인 앞뒤 처리는 새 훅 없이 이렇게 맞춘다(예: 랜드마크 `library-sync/router.ts`의 `create()`·off 차단).
  - 기능 꺼짐(off) 차단처럼 라우팅 전에 하던 검사는 처리기를 부르기 전에 서비스가 한다(CORS·출처 검사와 같은 자리).
  - 빈도 제한은 `beforeCreate`에서 하되, 서비스 오류(예: `SyncHttpError` 429·503)는 `HttpError`로 바꿔 던진다(2.4).
  - 생성 성공 뒤의 정리(세션·카운터 purge 등)는 처리기가 돌려준 응답을 보고 서비스가 건다. `onRoute`로 받은 패턴이 생성 경로이고 상태가 200이면 `waitUntil`로 부른다.

### 2.2 경로와 동작

| 메서드·경로               | 동작                                                                                              | 성공 본문      |
| ------------------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| `POST /v1/session/social` | `beforeCreate` → `createSocial(req, readJson(req))`                                               | 그 결과        |
| `POST /v1/session`        | `beforeCreate` → `create(req, readJson(req))`                                                     | 그 결과        |
| `DELETE /v1/session`      | `authenticate` → `revoke(ctx, 'current')` → `onRevoke`                                            | `{ revoked }`  |
| `GET /v1/sessions`        | `authenticate` → `list(ctx)`                                                                      | `{ sessions }` |
| `DELETE /v1/sessions`     | `authenticate` → 쿼리가 정확히 `others=1` 하나가 아니면 400 → `revoke(ctx,'others')` → `onRevoke` | `{ revoked }`  |
| `DELETE /v1/sessions/:id` | `authenticate` → `:id` 디코딩(실패하면 404) → `revoke(ctx,{id})` → `onRevoke`                     | `{ revoked }`  |

- 경로는 `SESSION_PATHS`와 정확히 같아야 한다(끝 슬래시 없음). `:id`는 `/`가 없는 한 조각이다.
- 경로가 맞고 메서드가 다르면 405 `method`. 세 서비스의 지금 동작과 같다. 세션 경로가 아니면 `null`.
- 상태 응답은 모두 200이다(지금과 같음).
- `social`이 없는 서비스에서도 `POST /v1/session/social`은 `beforeCreate` → 본문 읽기 → `createSocial`의 404 순서로 돈다. 빈도 제한 카운터가 줄어드는 것은 받아들인다(이 경로를 부르는 것은 소셜을 켠 클라이언트뿐이다).

### 2.3 상태 코드 결정

공용 `/client`의 `toResult()`는 400을 `{ kind: 'server', status: 400 }`로, 404를 `{ kind: 'not-found' }`로, 422를 `{ kind: 'invalid', code, path }`로 바꾼다.

- **`?others=1`이 틀림 → 400 `bad-request`.** `/client`의 `revokeSession('others')`는 늘 정확히 `?others=1`을 보낸다. 다른 쿼리는 사용자가 고칠 수 있는 입력이 아니라 부르는 코드의 잘못이므로 `server`로 드러나는 400이 맞다. 422 `invalid`는 사용자 입력 검증(`path`로 필드를 가리킴)에 쓰는 결과다. 패키지가 이미 형식이 틀린 소셜 본문에 400 `bad-request`를 쓰므로 같은 코드로 맞춘다.
- **세션 ID 디코딩 실패 → 404 `not-found`.** 공개 ID는 16진 12자라 디코딩에 실패하는 값은 존재할 수 없는 ID다. `revoke()`가 형식이 틀리거나 없는 ID에 이미 404 `not-found`를 주므로 같게 둔다. `/client`는 이것을 `not-found`로 돌려준다.

### 2.4 오류 변환

처리기 안(콜백 포함)에서 던진 오류를 응답으로 바꾼다. 서비스 `guard()`와 같은 규칙이다.

- `HttpError` → `json(status, errorBody(code, extra))`
- `CertsUnavailableError` → 503 `certs-unavailable`
- 나머지 → 500 `internal`. `log`로 한 줄 남긴다. 메시지가 `@sch0718/firebase-session:`로 시작하면(설정 안내, 예: 0002 마이그레이션 누락) 그 문구를, 아니면 `@sch0718/firebase-session: internal <오류 이름>`만 남긴다(요청 정보가 섞일 수 있어 메시지는 남기지 않는다). `Error`가 아닌 값이면 이름 자리에 `error`를 쓴다.
- 콜백이 상태 응답을 내려면 `HttpError`를 던진다. 서비스 고유 오류 클래스는 500이 된다.

## 3. 소셜 설정 도우미

### 3.1 모양

```ts
export function parseRedirectUris(raw: string | readonly string[] | undefined): string[];

export function socialLoginOptions(i: {
  allowedAccounts: string | undefined;
  kakao?: { clientId?: string | undefined; clientSecret?: string | undefined };
  naver?: { clientId?: string | undefined; clientSecret?: string | undefined };
  /** 콤마로 구분한 문자열이나 목록. 기본값 정책(요청 origin 등)은 서비스가 정해 넘긴다. */
  redirectUris: string | readonly string[] | undefined;
  keys: Record<SocialProvider, CertSource>;
  fetch?: typeof fetch | undefined;
}): SocialLoginOptions | undefined;
```

서비스 쓰는 예:

```ts
social: socialLoginOptions({
  allowedAccounts: env.ALLOWED_ACCOUNTS,
  kakao: { clientId: env.KAKAO_CLIENT_ID, clientSecret: env.KAKAO_CLIENT_SECRET },
  naver: { clientId: env.NAVER_CLIENT_ID, clientSecret: env.NAVER_CLIENT_SECRET },
  redirectUris: env.SOCIAL_REDIRECT_URIS?.trim() || `${new URL(req.url).origin}/auth/callback`,
  keys,
}),
```

### 3.2 규칙

- 값은 앞뒤 공백을 지운다. 빈 문자열은 없는 것으로 본다.
- 카카오: Client ID가 있으면 켠다. 시크릿은 있을 때만 넣는다(카카오 앱에서 끌 수 있다).
- 네이버: Client ID와 시크릿이 둘 다 있어야 켠다(네이버는 늘 시크릿이 필요하다).
- 둘 다 꺼지면 `undefined`. `createSessionAuth`의 `social`은 `SocialLoginOptions | undefined`를 받도록 넓힌다(`exactOptionalPropertyTypes`에서도 그대로 넘길 수 있게).
- `redirectUris`는 `parseRedirectUris()`로 거른 목록을 두 공급자에 똑같이 넣는다. 결과가 비면 모든 소셜 로그인이 거절된다(빈 배열 = 모두 거절, 지금 의미 그대로).
- `parseRedirectUris()`: 문자열이면 `,`로 나누고, 문자열·배열 입력 모두 항목마다 앞뒤 공백을 지우고, 빈 값·잘못된 값을 버리고, 중복을 없앤다. 잘못된 값을 버리는 것은 repass·랜드마크의 지금 동작과 같다. `URL` 파싱은 검사에만 쓰고, 목록에는 앞뒤 공백만 지운 원문을 넣는다(`new URL(v).href`로 정규화하지 않는다). 로그인 본문의 `redirectUri`와 정확히 같은 문자열로 비교하는 기존 규칙을 유지한다.

### 3.3 redirect 주소 검사

한 함수 `isRedirectUri()`(내부용)로 정하고 로그인 요청 본문 검사(`readBody`)도 같은 함수를 쓴다.

- 2048자 이하, `#` 없음, `URL`로 파싱됨
- 사용자 이름·비밀번호 없음
- `https:`, 또는 `http:`이고 호스트가 `localhost`·`127.0.0.1`·`[::1]`

본문 검사에 사용자 정보 거부가 새로 더해진다. 공급자에 등록할 수 없는 주소라 정상 로그인에는 영향이 없다.

## 4. 파일과 시험

- 처리기는 `src/worker/routes.ts`(새 파일), 도우미 둘과 `isRedirectUri()`는 `src/worker/social.ts`에 둔다. `src/worker/index.ts`가 `handleSessionRoute`·`SessionRouteOptions`·`parseRedirectUris`·`socialLoginOptions`를 내보낸다.
- `.size-limit.json`의 worker 항목 import에 `handleSessionRoute`·`socialLoginOptions`를 더한다(서비스가 함께 import할 것이라 실제 크기에 가깝게 잰다).

- `routes.test.ts`: 기존 `test/d1.ts`(실제 SQLite)·`test/tokens.ts`·`test/social.ts`로 실제 `createSessionAuth`를 만들어 6개 경로의 성공 본문, 405, `null`, `path` 옵션, `?others` 400, `:id` 디코딩 실패 404, `onRoute`·`beforeCreate`·`onRevoke` 호출과 순서, 오류 변환 세 가지(HttpError·CertsUnavailable·나머지와 설정 안내 로그)를 본다.
- `social.test.ts`에 더함: `socialLoginOptions()`의 켜짐 조건·공백·`undefined`, `parseRedirectUris()`의 거르기(사용자 정보·`#`·http 비 localhost·잘못된 URL·중복), 본문의 사용자 정보 redirect가 400인지.
- 기존 시험은 그대로 통과해야 한다.

## 5. 범위 밖

- 서비스 적용(라우터 교체, 지울 파일), 소셜 외 서비스 API 라우팅, 빈도 제한 장치 자체, CORS 헤더 자동 추가.
- `firebase-session/testing` 진입점과 `package.json` exports, README의 개발·시험 절은 다른 세션 몫이다. 이 작업은 `src/worker/`와 README의 Worker 절만 고친다.

## 6. 하위 호환

- 새 export만 더한다. `SessionAuthOptions.social` 타입을 넓히는 것은 호환된다.
- 동작 변화는 하나: 로그인 본문의 `redirectUri`에 사용자 정보가 있으면 400 `bad-request`. changeset은 minor.
