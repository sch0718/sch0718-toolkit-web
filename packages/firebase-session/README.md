# @sch0718/firebase-session

Firebase Google 로그인과 카카오·네이버 OIDC 로그인 + 허용 목록 + D1 기기 세션입니다. 가즈아에서 옮겼습니다. 진입점이 서로를 import하지 않으므로 Worker만 쓰는 곳에는 firebase·vite가 필요 없습니다.

| 진입점                             | 실행 환경          | 내용                                                                                                    |
| ---------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| `@sch0718/firebase-session/worker` | Cloudflare Workers | ID 토큰 검증(jose), Google 인증서·소셜 JWKS 캐시, 코드 교환, 허용 목록, D1 기기 세션, CORS, HTTP 도우미 |
| `@sch0718/firebase-session/client` | 브라우저           | 설정 읽기, Firebase 로그인(SDK 지연 로드), 소셜 리다이렉트 도우미, 토큰·세션 API 클라이언트             |
| `@sch0718/firebase-session/vite`   | Vite 빌드          | 로그인 도우미를 앱 도메인에서 서빙하는 플러그인, Firebase CSP 플러그인, PWA용 상수                      |

## 서비스가 정하는 값

- 세션 헤더 이름(`sessionHeader`). 클라이언트와 Worker에 같은 값을 넘깁니다. CORS 허용 헤더에도 넣습니다.
- 허용 이메일(Worker secret, 콤마 구분. 비면 아무도 못 들어옴), 허용 출처, Firebase 프로젝트 ID
- 기기 이름 기본값(`defaultLabel`, 기본 '이름 없는 기기')

## Worker

```ts
import {
  createSessionAuth,
  googleCerts,
  handleSessionRoute,
  matchOrigin,
  preflight,
  purgeSessions,
} from '@sch0718/firebase-session/worker';

const certs = googleCerts(); // isolate마다 하나
const sessions = createSessionAuth({
  db: env.DB,
  projectId: env.FIREBASE_PROJECT_ID,
  allowedEmails: env.ALLOWED_EMAILS,
  certs,
  sessionHeader: 'X-Repass-Session',
  now: Date.now,
  random: (n) => crypto.getRandomValues(new Uint8Array(n)),
  uuid: () => crypto.randomUUID(),
});

const res = await handleSessionRoute(req, sessions);
if (res) return res;
```

CORS·출처 검사·preflight(OPTIONS)를 먼저 처리한 뒤, 서비스 라우터 앞에서 `await handleSessionRoute(req, sessions)`를 부릅니다. `POST /v1/session`·`POST /v1/session/social`(생성), `DELETE /v1/session`(현재 기기 철회), `GET /v1/sessions`(목록), `DELETE /v1/sessions?others=1`(다른 기기 철회), `DELETE /v1/sessions/:id`(한 기기 철회)를 처리하고, 다른 경로면 `null`을 돌려줍니다. 성공은 200이며 응답은 `json()`처럼 캐시하지 않습니다. CORS 헤더는 서비스가 응답에 더합니다.

경로는 끝 슬래시 없이 정확히 맞추며, 세션 경로의 다른 메서드는 405 `method`입니다. 다른 기기 철회의 쿼리가 정확히 `others=1` 하나가 아니면 400 `bad-request`, 세션 ID 디코딩 실패는 404 `not-found`입니다. `HttpError`는 해당 상태·본문으로, `CertsUnavailableError`는 503 `certs-unavailable`로, 나머지는 500 `internal`로 바꿉니다. 설정 안내 오류는 문구를, 그 밖의 오류는 이름만 `log`(기본 `console.error`)에 남깁니다.

접두어를 뗀 경로는 `path` 옵션으로 넘깁니다. `onRoute(pattern)`은 405를 포함한 세션 경로에서 한 번 불립니다. `beforeCreate()`는 두 생성 경로의 본문을 읽기 전에, `onRevoke(ctx, target, revoked)`는 철회 성공 뒤에 불립니다. 콜백에서 상태 응답을 내려면 `HttpError`를 던집니다. 기능 꺼짐 검사는 처리기를 부르기 전에 하고, 생성 뒤 정리는 `onRoute`로 받은 패턴과 응답 상태 200을 확인해 서비스가 실행합니다.

**서비스가 허용 여부를 판단하기.** 고정 목록 밖의 사용자(예: 초대받은 멤버)를 들이려면 `isAllowed`를 줍니다. 목록에 있으면 부르지 않습니다.

```ts
createSessionAuth({
  // ...위와 같음
  isAllowed: async ({ identity, provider }, signup) => {
    // identity: Google은 email_verified인 소문자 이메일, 소셜은 'kakao:<sub>'·'naver:<sub>'
    // signup: 세션을 만드는 요청에서만 있다. body는 요청 본문 그대로(예: { label, invite })
    if (await isMember(identity)) return true;
    if (!signup) return false;
    return redeemInvite(identity, signup.body); // 틀리면 throw new HttpError(403, 'invite-invalid')
  },
});
```

- 부르는 곳: Google 토큰 검사(매 요청과 `create`), 소셜 `createSocial`(공급자 토큰 검증 뒤), 소셜 세션 인증(매 요청). 매 요청에서 `false`가 되면 403 `not-allowed`이므로 멤버에서 빼면 바로 막힙니다.
- `email_verified`가 아니거나 이메일이 비면 부르지 않습니다. Google 가입(`create`)은 재인증 창(`REAUTH_WINDOW`) 안의 토큰일 때만 부르므로, 가입 부수효과가 오래된 토큰으로 일어나지 않습니다.
- 소셜 가입의 `signup.body`에서는 인가 코드(`code`)와 `codeVerifier`를 뺍니다.
- `true`를 돌려준 뒤 세션 저장이 실패할 수 있습니다. 가입 부수효과는 멱등으로 만드세요(예: 이미 멤버면 다시 통과).
- `HttpError`를 던지면 그 상태·코드로 응답합니다. 브라우저 클라이언트는 `createSession(idToken, label, extra)`·`createSocialSession(input, label, extra)`의 `extra`로 본문 필드를 더합니다(`label`과 소셜 입력 필드가 이깁니다).

**스키마.** 패키지의 `migrations/0001_users_sessions.sql`을 서비스의 `migrations/`에 복사해 적용합니다. 파일 번호는 서비스가 자기 마이그레이션 순서에 맞춰 정합니다. 서비스 마이그레이션 가운데 맨 앞에 두거나, 적어도 `users(id)`를 참조하는 테이블보다 앞에 둡니다. 앞으로 패키지 스키마가 바뀌면 `firebase-session-NNNN_*.sql` 이름의 새 파일로 내보내고 변경 기록에 적습니다. 서비스는 그 파일도 같은 방식으로 복사해 번호를 붙입니다. 오래된 세션은 Cron에서 `purgeSessions(db, now)`로 지웁니다.

## 브라우저

```ts
import {
  createSessionClient,
  firebaseAuth,
  readSyncConfig,
} from '@sch0718/firebase-session/client';

const config = readSyncConfig(import.meta.env); // 하나라도 비면 null
if (config) {
  const auth = firebaseAuth(config.firebase);
  const api = createSessionClient({
    baseUrl: config.apiUrl,
    credentials: { idToken: (f) => auth.idToken(f), sessionId: async () => stored },
    sessionHeader: 'X-Repass-Session',
  });
}
```

환경 변수 이름은 정해져 있습니다. `readSyncConfig`는 `VITE_SYNC_API_URL`과 `VITE_FIREBASE_*`(`API_KEY`·`AUTH_DOMAIN`·`PROJECT_ID`·`APP_ID`)를 읽고, Vite 플러그인은 `VITE_FIREBASE_AUTH_DOMAIN`과 `VITE_FIREBASE_PROJECT_ID`를 읽습니다. 서비스는 이 이름을 그대로 씁니다.

`api.send()` 위에 서비스 API를 만듭니다. 서비스 고유 상태(예: 409)는 `mapStatus`로 바꿉니다. Firebase SDK는 로그인할 때만 받는 별도 청크(`firebaseImpl-*.js`)가 됩니다.

`firebaseAuth`는 `projectId`·`apiKey`가 같은 Firebase 앱이 있으면 그 앱을 쓰고, 앱이 하나도 없으면 기본 앱을, 그 밖에는 설정마다 `@sch0718/firebase-session:<projectId>:<apiKey>` 이름의 앱을 따로 만듭니다(서로 다른 설정을 여럿 써도 이름이 겹치지 않습니다). Auth는 IndexedDB·localStorage 저장과 팝업 resolver로 초기화합니다. 다만 서비스가 그 앱에 `getAuth`·`initializeAuth`를 먼저 불렀다면 그 Auth를 그대로 쓰므로, 저장 방식과 resolver도 서비스가 정한 설정을 따릅니다.

## 카카오·네이버 로그인

Google은 지금처럼 Firebase ID 토큰과 세션을 함께 검사합니다. 소셜 로그인은 Worker가 인가 코드를 공급자 ID 토큰으로 교환해 검증하고, 공급자 계정 허용 목록을 통과하면 D1 기기 세션을 만듭니다. 이후에는 그 세션만으로 인증하며 허용 목록을 매 요청 다시 확인합니다. 공급자마다 별도 사용자이고 계정을 자동 연결하지 않습니다. 브라우저 소셜 코드는 런타임 의존성이 없으며 Firebase SDK를 불러오지 않습니다. Worker 검증은 기존 의존성인 jose를 씁니다.

### 마이그레이션과 Worker

기존 0001 다음에 패키지의 `migrations/firebase-session-0002_social_sessions.sql`을 복사해 적용합니다(서비스의 파일 번호 순서에 맞춰 이름을 붙입니다). 세션에 `identity` 열을 추가합니다. Google만 쓰는 서비스는 0002나 새 옵션 없이 그대로 쓸 수 있습니다. **소셜 옵션을 켜기 전에 0002를 적용해야 합니다.** 빠뜨리면 `createSocial`과 세션 전용 `authenticate`가 `@sch0718/firebase-session: social 옵션을 쓰려면 migrations/firebase-session-0002_social_sessions.sql을 적용해야 합니다` 오류를 던집니다. 클라이언트용 `HttpError`가 아니므로 서비스 로그에서 확인합니다.

```ts
import {
  createSessionAuth,
  googleCerts,
  socialKeys,
  socialLoginOptions,
  handleSessionRoute,
} from '@sch0718/firebase-session/worker';

const certs = googleCerts();
const keys = socialKeys(); // isolate마다 하나. JWKS 캐시와 동시 요청 병합

// env는 서비스 바인딩, req는 서비스 라우터가 받은 요청입니다.
const sessions = createSessionAuth({
  db: env.DB,
  projectId: env.FIREBASE_PROJECT_ID,
  allowedEmails: env.ALLOWED_EMAILS,
  certs,
  sessionHeader: 'X-Repass-Session',
  now: Date.now,
  random: (n) => crypto.getRandomValues(new Uint8Array(n)),
  uuid: () => crypto.randomUUID(),
  social: socialLoginOptions({
    allowedAccounts: env.ALLOWED_ACCOUNTS, // 비면 아무도 로그인하지 못함
    kakao: { clientId: env.KAKAO_CLIENT_ID, clientSecret: env.KAKAO_CLIENT_SECRET },
    naver: { clientId: env.NAVER_CLIENT_ID, clientSecret: env.NAVER_CLIENT_SECRET },
    // 기본값 정책은 서비스가 정합니다.
    redirectUris: env.SOCIAL_REDIRECT_URIS?.trim() || `${new URL(req.url).origin}/auth/callback`,
    keys,
  }),
});

// CORS·출처 검사·preflight와 기능 꺼짐 검사를 먼저 처리합니다.
const response = await handleSessionRoute(req, sessions);
if (response) return response; // 서비스가 CORS 헤더를 더해 반환

const ctx = await sessions.authenticate(req); // 소셜 세션은 Authorization 없이
// ctx로 서비스 API 처리. 서비스 API의 오류 변환은 서비스가 담당
```

`socialLoginOptions()`는 값의 앞뒤 공백을 지우고 빈 값은 없는 것으로 봅니다. 카카오는 Client ID가 있으면 켜고 시크릿은 있을 때만 넣으며, 네이버는 ID와 시크릿이 모두 있어야 켭니다. 둘 다 꺼지면 `undefined`를 돌려줍니다. `social`이 없으면 `createSocial`은 404 `not-found`입니다. 처리기는 이때도 `beforeCreate` → 본문 읽기 → `createSocial` 순서로 실행합니다. 토큰 엔드포인트의 거절(429 제외)은 401 `invalid-code`, ID 토큰 검증 실패는 401 `invalid-token`, 토큰 엔드포인트 429, 공급자·JWKS 장애나 코드 교환 시간 초과(10초)는 503 `provider-unavailable`입니다. 200 응답에 `id_token`이 없으면 OIDC 활성화 여부를 확인하세요. 클라이언트는 503을 `{ kind: 'limit', code: 'provider-unavailable' }`로 돌려줍니다.

`socialLoginOptions()`는 `parseRedirectUris(raw: string | readonly string[] | undefined)`로 거른 목록을 두 공급자에 똑같이 넣습니다. 문자열은 콤마로 나누고 배열도 항목마다 공백을 지운 뒤 빈 값·잘못된 주소·중복을 뺍니다. URL로 정규화하지 않으므로 본문 `redirectUri`는 목록의 원문과 정확히 같아야 합니다(쿼리·끝 슬래시·대소문자 포함). 결과가 빈 배열이면 모두 거절합니다. 직접 `social`을 조립해 `redirectUris`를 생략하면 URL 형식만 검사합니다. 설정 목록과 본문은 모두 2048자 이하, `#`와 사용자 정보가 없는 HTTPS 주소 또는 localhost·127.0.0.1·[::1]의 HTTP 주소만 허용합니다. 본문 주소에 사용자 정보가 있으면 400 `bad-request`입니다. 운영 앱에는 localhost 콜백을 함께 등록하지 말고 개발용 공급자 앱(별도 Client ID)을 따로 쓰는 것을 권장합니다.

JWKS는 기본 1시간 캐시하고, 양수 `max-age`는 10분~24시간으로 제한합니다. `no-store`·`no-cache` 지시자는 무시하고 기본 1시간을 적용하며 `max-age=0`도 같습니다. 재조회 장애 때는 만료 시각부터 최대 6시간 동안 이전 키를 쓰고, 실패를 포함한 마지막 조회 뒤 5분이 지나야 다시 조회합니다. 캐시가 없거나 6시간 stale 한도를 넘긴 뒤 조회가 실패하면 30초 동안 다시 조회하지 않고 바로 `CertsUnavailableError`를 던집니다(negative cache). 30초가 지나면 재시도하며, 성공한 뒤에는 다음 실패까지 negative cache의 영향이 없습니다. 토큰 교환·소셜 JWKS·Google 인증서 요청에는 모두 10초 제한을 둡니다.

허용 목록은 `kakao:<sub>,naver:<sub>` 형식입니다. `parseAccountList()`는 접두어만 소문자로 바꾸고 ID의 대소문자는 유지합니다. 소셜 사용자 객체의 `sub`는 이 계정 값, `provider`는 `kakao` 또는 `naver`, `email`은 항상 빈 문자열입니다. 소셜 사용자의 이메일은 식별·인가에 쓰지 않습니다. 공급자 토큰에 문자열 이메일이 있으면 `createSocial`/`createSocialSession` 결과의 `user.unverifiedEmail`로만 소문자화해 줍니다(검증되지 않은 값, 표시용). 없으면 필드 자체를 넣지 않습니다. DB에 저장하거나 `VerifiedUser`에 더하지 않습니다. 세션 인증의 `authTime`은 세션을 만든 시각입니다. Google 사용자 객체에는 `provider`를 더하지 않습니다.

### Google 세션 전용 인증(`googleSessionOnly`)

Google도 소셜처럼 세션만으로 인증하려면 `googleSessionOnly: true`를 줍니다(예: 세션 쿠키만 실어 오는 정적 사이트). 켜면 `create`가 세션의 `identity`에 소문자 이메일을 넣고, `authenticate`는 `Authorization` 없는 요청을 그 세션만으로 인증합니다. 허용 판정은 매 요청 `allowedEmails`를 보고, 없으면 `isAllowed({ identity: 이메일, provider: 'google' })`에 묻습니다. 사용자 객체는 토큰 경로와 같은 `{ sub, email, authTime }`이고 `authTime`은 세션을 만든 시각입니다. `social` 없이도 쓸 수 있지만 0002 마이그레이션은 필요합니다(빠뜨리면 위와 같은 오류 문구). 옵션을 끄면 이미 만든 이메일 세션도 다시 ID 토큰이 있어야 하고(`missing-token`), 소셜 세션은 `social` 설정대로 인증합니다. 토큰이 있는 요청은 옵션과 무관하게 기존 검증 경로로 갑니다.

### 브라우저

```ts
import {
  readSocialConfig,
  beginSocialSignIn,
  readSocialCallback,
  stripSocialCallback,
  createSessionClient,
} from '@sch0718/firebase-session/client';

const socialConfig = readSocialConfig(import.meta.env); // 둘 다 비면 null
const api = createSessionClient({
  baseUrl: apiUrl, // 서비스가 정하는 Worker 주소
  sessionHeader: 'X-Repass-Session',
  allowSessionOnly: true,
  credentials: {
    // 소셜 계정이면 null. Google 계정이면 기존 auth.idToken(force)를 사용
    idToken: (force) => (isSocialAccount ? Promise.resolve(null) : auth.idToken(force)),
    sessionId: async () => localStorage.getItem('service:session'),
  },
});

// 콜백 페이지에서 다른 작업보다 먼저 읽고 URL을 즉시 지웁니다.
const callback = readSocialCallback(location.href);
history.replaceState(history.state, '', stripSocialCallback(location.href));
if (callback?.ok) {
  const result = await api.createSocialSession(callback, '휴대폰');
  if (result.ok) {
    localStorage.setItem('service:session', result.data.sessionId);
    // result.data.user.provider를 써서 소셜 계정임을 저장·표시
  } else if (result.kind === 'not-allowed' && result.account) {
    // 본인 계정 값을 서비스 관리자에게 알려 허용 목록에 등록
    showAccount(result.account);
  }
} else if (callback) {
  // redirect-mismatch / state-mismatch / expired / cancelled / provider-error: 서비스가 안내
}

// 로그인 버튼에서 최상위 이동. 네이버도 같은 방법입니다.
if (socialConfig?.kakao) {
  await beginSocialSignIn('kakao', {
    clientId: socialConfig.kakao.clientId,
    redirectUri: `${location.origin}/auth/callback`,
  });
}
```

`createSocialSession` 결과가 `kind: 'limit'`(503 `provider-unavailable`)이면 pending 값은 이미 지워졌으므로 “잠시 뒤 처음부터 다시 로그인”하도록 안내합니다.

`beginSocialSignIn()`은 무작위 PKCE S256 verifier·state를 만들고 nonce는 `socialNonce(verifier)`로 파생합니다. 식은 `base64url(SHA-256('nonce:' + verifier))`이며 UTF-8, 패딩 없는 base64url을 씁니다. localStorage의 `@sch0718/firebase-session:social-pending`에는 `{ provider, state, verifier, redirectUri, createdAt }`만 저장하고 이동합니다. 저장소를 쓸 수 없으면 reject합니다. 한 번에 하나의 로그인만 보관하며 10분 뒤 만료됩니다. `storage`, `navigate`, `random`, `now`를 주입할 수 있고 `prompt`는 지정했을 때만 공급자에 넘깁니다. `socialAuthorizeUrl()`로 인가 URL만 만들 수도 있습니다. 이때 `/client`가 내보내는 `socialNonce(verifier): Promise<string>`로 nonce를 계산해 넘깁니다. Worker도 본문의 verifier로 nonce를 다시 계산해 토큰과 비교합니다. 성공 콜백과 `createSocialSession` 입력에는 nonce가 없으며, Worker 요청 본문에 `nonce` 키를 보내면 값과 무관하게 400 `bad-request`입니다.

`readSocialCallback()`은 콜백이면 저장값을 먼저 지운 뒤 pending 형식 → redirect 경로 → state → 만료 → error/code 순으로 검사합니다. 현재 URL과 저장된 `redirectUri`의 origin·pathname이 다르면 `redirect-mismatch`이고 쿼리 차이는 무시합니다. 저장된 redirectUri를 URL로 파싱할 수 없으면 null입니다. 성공·실패 모두 한 번만 읽을 수 있습니다. 시작한 로그인이 없거나 콜백 URL이 아니면 null입니다. 앱 전환 후 다른 브라우저로 돌아오면 저장값이 없어 다시 로그인을 시작해야 합니다. `stripSocialCallback()`은 `code`, `state`, `error`, `error_description`만 지운 URL을 돌려줍니다. **콜백을 읽은 즉시 주소를 지우세요.** 콜백 페이지에는 `Referrer-Policy: no-referrer` 헤더 또는 `<meta name="referrer" content="no-referrer">`를 둡니다.

`allowSessionOnly`의 기본값은 false입니다. true이고 기본 `auth: 'session'` 요청에 ID 토큰이 없으면 세션 헤더만 붙입니다. 세션도 없으면 `missing-token`입니다. 토큰이 있으면 기존처럼 토큰과 세션을 함께 보냅니다. `createSocialSession()`은 자격 증명 없이 보내며 코드 교환 실패를 재시도하지 않습니다.

### 개발자 콘솔과 키 설정

카카오는 [카카오 디벨로퍼스](https://developers.kakao.com)의 내 애플리케이션에서 설정합니다.

1. 앱을 만들고 카카오 로그인 사용 설정과 OpenID Connect를 켭니다.
2. `[앱] > [플랫폼 키] > [REST API 키]`에 Redirect URI를 등록합니다. 예: `https://서비스도메인/auth/callback`, 개발용 `http://localhost:포트/auth/callback`. 인가 요청 값과 정확히 같아야 합니다.
3. REST API 키와 클라이언트 시크릿을 확인합니다. 시크릿이 켜져 있으면 Worker에 반드시 넣습니다. 이메일 동의는 필요하지 않으므로 비즈 앱으로 전환하지 않아도 됩니다.

네이버는 [네이버 개발자센터](https://developers.naver.com/apps)에서 설정합니다.

1. 애플리케이션을 등록하고 사용 API로 네이버 로그인, 서비스 환경으로 PC 웹·모바일 웹을 고릅니다. 서비스 URL과 Callback URL을 등록합니다.
2. 이 패키지는 OIDC `/oauth2/*` 경로를 씁니다. 별도 OIDC 스위치가 필요한지는 실제 앱에서 확인해야 합니다.
3. '개발 중'에는 멤버관리에 로그인할 아이디를 관리자·테스터로 등록합니다. 모든 아이디에 열려면 사전 검수가 필요합니다.
4. Client ID와 Client Secret을 확인합니다.

| 값                       | Worker secret 예시    | 앱 빌드 변수                 | 취급      |
| ------------------------ | --------------------- | ---------------------------- | --------- |
| 카카오 REST API 키       | `KAKAO_CLIENT_ID`     | `VITE_KAKAO_LOGIN_CLIENT_ID` | 공개 값   |
| 카카오 클라이언트 시크릿 | `KAKAO_CLIENT_SECRET` | 넣지 않음                    | 비밀      |
| 네이버 Client ID         | `NAVER_CLIENT_ID`     | `VITE_NAVER_LOGIN_CLIENT_ID` | 공개 값   |
| 네이버 Client Secret     | `NAVER_CLIENT_SECRET` | 넣지 않음                    | 비밀      |
| 허용 계정 목록           | `ALLOWED_ACCOUNTS`    | 넣지 않음                    | 비밀 취급 |

Worker 바인딩 이름은 예시이며 서비스가 정합니다. 공개 clientId만 앱 빌드에 넣습니다. 처음에는 허용 목록을 비워 둔 채 본인 계정으로 로그인을 시도하세요. 403 `not-allowed` 응답의 `account`(클라이언트의 `result.account`)를 확인해 `ALLOWED_ACCOUNTS`에 등록한 뒤 다시 로그인합니다. ID는 이메일이 아니고 앱별 `sub`이므로 대소문자를 그대로 복사합니다.

### 보안과 실제 앱 확인

- 요청 빈도 제한은 서비스가 Cloudflare Rate Limiting 등으로 적용합니다. 이 패키지는 본문 검사를 외부 호출보다 먼저 수행하지만 호출 횟수를 제한하지는 않습니다.
- 소셜 세션 원문은 자격 증명입니다. D1에는 SHA-256 해시만 저장하며 기기의 저장소·CSP·XSS 방어는 서비스가 관리합니다. 철회와 30일 슬라이딩 만료는 Google 세션과 같습니다.
- 같은 Firebase 프로젝트에서 커스텀 토큰 uid를 `kakao:`·`naver:`로 시작하게 만들면 소셜 계정의 `firebase_sub`와 충돌할 수 있으므로 이 접두어를 예약하세요.
- 실제 앱에서 카카오 PKCE 강제 여부, 네이버 POST form 토큰 요청과 OIDC 설정, iOS 홈 화면 PWA·인앱 브라우저의 복귀·저장소 연속성을 확인해야 합니다. 패키지 시험은 외부 서비스 없이 실행합니다.
- 공급자로는 최상위 이동하므로 `/vite`의 CSP 목록은 바꿀 필요가 없습니다. PWA 콜백 경로는 앱의 index.html을 받도록 설정하세요.

## Vite

```ts
import { firebaseAuthHelper, firebaseCsp } from '@sch0718/firebase-session/vite';

export default defineConfig({ plugins: [svelte(), firebaseCsp(), firebaseAuthHelper()] });
```

- `firebaseAuthHelper()`: `VITE_FIREBASE_AUTH_DOMAIN`이 앱 도메인이면 빌드 때 `https://<프로젝트>.firebaseapp.com/__/auth/*`를 받아 `dist/__/auth/`에 넣습니다. 서드파티 저장소를 막는 브라우저(iOS Safari, 홈 화면 PWA)에서도 로그인이 되게 하는 Firebase 권장 방법입니다.
- `firebaseCsp()`: index.html의 meta CSP에 `script-src https://apis.google.com`과 `frame-src https://<authDomain>`을 더합니다. `frame-src`가 이미 있으면 그 목록에 더하고, 없으면 `default-src 'self';` 뒤에 넣습니다. CSP에 `default-src 'self';`와 `script-src 'self'`가 있어야 합니다.
- `vite`는 peer 의존으로 선언하지 않습니다. `/vite` 선언 파일이 `vite`의 `Plugin` 타입만 쓰므로, 이 진입점을 쓰는 앱에 설치된 vite를 그대로 씁니다. peer로 두면 pnpm이 Worker만 쓰는 workspace 패키지에도 루트의 vite를 연결해 `pnpm licenses list --prod`에 vite·esbuild·rollup이 끌려 들어옵니다.
- PWA를 쓰면 `AUTH_GLOB_IGNORES`, `AUTH_NAVIGATE_DENYLIST`를 workbox 설정에 넣습니다.

라이선스: [PolyForm Noncommercial 1.0.0](./LICENSE)

## 개발·시험

개발 서버와 시험에서는 아래 두 진입점을 씁니다. 기존 `/worker`·`/client`·`/vite`는 이 코드를 불러오지 않습니다. 시험 도우미는 크기 한도 대상에 넣지 않습니다. 서명에는 기존 의존성인 jose와 Web Crypto, D1에는 Node 내장 SQLite를 쓰므로 의존성을 더하지 않습니다.

| 진입점                                 | 실행 환경                          | 내보내는 것                                                                                                                       |
| -------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `@sch0718/firebase-session/testing`    | Worker(workerd)·Node·개발 브라우저 | `createFakeSocial`, `fakeAuthorizeUrl`, `isLocalRequest`, `FAKE_CLIENT_IDS`, `FAKE_CLIENT_SECRET`, `createTestTokens`와 관련 타입 |
| `@sch0718/firebase-session/testing/d1` | Node 22.16 이상                    | `createTestD1`, `TestD1`, `TestD1Options`                                                                                         |

### 가짜 소셜 공급자

`createFakeSocial({ basePath, now?, defaultSub?, approveResponse? })`는 `keys`·`fetch`·`handle`·`approve`를 돌려줍니다. `defaultSub`는 기본 `dev-user`, `approveResponse`는 기본 `redirect`(302)입니다. `refresh`로 주면 콜백 주소를 담은 200 HTML meta refresh를 돌려줘 `route.fulfill`처럼 302를 따라가지 않는 환경에서도 쓸 수 있습니다. `now`는 밀리초 시계이며 기본은 `Date.now`입니다.

가짜 화면은 `${basePath}/authorize`와 `${basePath}/approve`의 GET 요청입니다. `handle(req, redirectUris)`는 localhost·127.0.0.1·[::1] 요청만 받고 다른 호스트나 경로는 null을 돌려줍니다. 허용 콜백은 `redirectUris`와 정확히 같아야 합니다. 화면에서 계정 ID와 정상·취소·공급자 오류·코드 거절·공급자 장애 중 하나를 고릅니다. 화면 없이 시험할 때는 같은 검사를 하는 `approve(query, redirectUris)`로 콜백 주소를 얻습니다. 잘못된 질의는 null입니다. `fetch`는 카카오·네이버 토큰 주소만 처리하고 다른 주소는 던집니다.

**`handle`의 로컬 검사는 화면만 지킵니다. 가짜 `keys`·`fetch`·client ID를 `createSessionAuth`에 연결하는 조건은 서비스가 정하고, `isLocalRequest(req)`만으로 끝내지 마세요.** `isLocalRequest`는 요청 주소의 호스트 이름만 보므로 service binding처럼 Worker 안에서 `http://localhost/...`로 부르는 요청도 참이 됩니다. 개발 전용 env 플래그(예: 랜드마크 `SYNC_DEV_FAKE_SOCIAL=1`)나 허용 origin이 모두 로컬인지(repass `isLocalDev`)를 함께 확인합니다. 개발 전용 Worker 진입점(예: `dev.ts`)에서 다음처럼 연결합니다. 아래 `env.DEV_FAKE_SOCIAL`·`sessionOptions`는 서비스가 정하는 개발 플래그와 기존 인증 옵션입니다. 운영 진입점에는 시험 도우미를 import하지 않습니다.

```ts
import { createSessionAuth, handleSessionRoute } from '@sch0718/firebase-session/worker';
import {
  createFakeSocial,
  FAKE_CLIENT_IDS,
  FAKE_CLIENT_SECRET,
  isLocalRequest,
} from '@sch0718/firebase-session/testing';

// dev.ts: 개발 서버만 쓰는 진입점. 조건에 맞지 않으면 가짜를 연결하지 않는다.
if (env.DEV_FAKE_SOCIAL === '1' && isLocalRequest(req)) {
  const fake = createFakeSocial({ basePath: '/dev/fake-social' });
  const redirectUris = ['http://localhost:5173/auth/callback'];
  const screen = await fake.handle(req, redirectUris);
  if (screen) return screen;
  const sessions = createSessionAuth({
    ...sessionOptions,
    social: {
      allowedAccounts: 'kakao:dev-user,naver:dev-user',
      kakao: { clientId: FAKE_CLIENT_IDS.kakao, clientSecret: FAKE_CLIENT_SECRET, redirectUris },
      naver: { clientId: FAKE_CLIENT_IDS.naver, clientSecret: FAKE_CLIENT_SECRET, redirectUris },
      keys: fake.keys,
      fetch: fake.fetch,
    },
  });
  const res = await handleSessionRoute(req, sessions);
  if (res) return res;
}
return new Response('Not Found', { status: 404 });
```

client ID는 `dev-fake-kakao`·`dev-fake-naver`, 시크릿은 `dev-fake-secret` 고정 시험값입니다. 실제 키를 넣지 않습니다. 계정 ID에 `dev-`가 없으면 approve에서 붙이고 토큰 교환 때 다시 확인합니다. 실제 계정만 있는 허용 목록은 추가 방어선이지만, 서비스가 빈 목록을 모두 허용하도록 구현한 경우에는 이 방어선이 없습니다. 로컬 연결 조건을 항상 유지해야 합니다.

브라우저에서는 **`import.meta.env.DEV` 안의 동적 import**로만 씁니다. `/testing`은 공급자 설정을 통해 jose도 불러오므로 운영 브라우저 코드에서 정적 import하지 않습니다. `fakeAuthorizeUrl(realUrl, fakeBase)`는 실제 공급자의 origin과 경로가 정확히 맞아야 하며, 질의를 보존하고 `provider`를 더합니다. `fakeBase`는 절대 URL(예: `http://localhost:8787/dev/fake-social`)이어야 하고 끝의 슬래시는 무시합니다.

```ts
import { beginSocialSignIn } from '@sch0718/firebase-session/client';

let clientId = socialConfig.kakao.clientId;
let navigate = (url: string) => location.assign(url);
if (import.meta.env.DEV) {
  const { fakeAuthorizeUrl, FAKE_CLIENT_IDS } = await import('@sch0718/firebase-session/testing');
  clientId = FAKE_CLIENT_IDS.kakao;
  navigate = (url) => location.assign(fakeAuthorizeUrl(url, apiUrl + '/dev/fake-social'));
}
await beginSocialSignIn('kakao', {
  clientId,
  redirectUri: `${location.origin}/auth/callback`,
  navigate,
});
```

코드는 `fake.<base64url(JSON)>` 형식으로 상태를 담아 요청마다 가짜 공급자를 새로 만들어도 교환할 수 있습니다. 한 번 사용 제한은 두지 않습니다. 5분 만료, PKCE S256, client ID·시크릿·콜백을 검사합니다. 결과 `bad-code`는 토큰 주소의 400 `invalid_grant`를 거쳐 Worker의 401 `invalid-code`, `down`은 503 `provider-unavailable`로 이어집니다.

### 시험용 ID 토큰

`createTestTokens({ projectId, now? })`는 매번 새 RS256 키 쌍을 만들고 `{ keys, certs, token }`을 돌려줍니다. `certs`는 kid `k1`만 받습니다. 기본 토큰은 Firebase 형식이며 sub `uid-me`, 이메일 `me@example.test`, 검증된 이메일, 현재 `auth_time`·`iat`, 1시간 뒤 `exp`를 넣습니다. 호출마다 클레임을 덮어쓸 수 있고 `undefined`인 클레임은 뺍니다. `token`의 두 번째 인자는 `{ now?, kid?, key?, alg? }`로 검증 실패를 시험할 때도 씁니다.

```ts
import { createTestTokens } from '@sch0718/firebase-session/testing';

const tokens = await createTestTokens({ projectId: 'service-test', now: () => 1_800_000_000_000 });
const idToken = await tokens.token({ email: 'a@example.test' });
// 카카오·네이버 토큰은 iss·aud·nonce 등 필요한 클레임을 덮어쓴다.
const withoutEmail = await tokens.token({ email: undefined });
```

### 시험용 D1

`/testing/d1`은 **Node 22.16 이상**과 소비자 쪽 `@types/node`가 필요합니다. workerd·브라우저에서는 불러오지 않습니다. 선언 파일의 보존된 node 참조로 Node 타입을 불러오므로 `compilerOptions.types`에 node를 추가할 필요는 없습니다.

```ts
import { createTestD1 } from '@sch0718/firebase-session/testing/d1';

const db = createTestD1({
  migrations: new URL('../migrations/', import.meta.url),
  through: '0001_users_sessions.sql',
});
try {
  db.interleave = true; // first·all·run 전에 매크로태스크로 양보
  db.failNextBatchAt(1); // 다음 batch의 두 번째 문장에서 한 번 실패
  // db를 createSessionAuth나 서비스 DB 계층에 전달
} finally {
  db.close();
}
```

`migrations`는 폴더 경로나 file: URL이고 `.sql`을 파일 이름순으로 적용합니다. `through`는 해당 파일 이름까지 포함하며, `migrations`를 생략하면 빈 DB입니다. `raw`로 Node의 `DatabaseSync`에 직접 접근할 수 있습니다. 외래 키 검사를 켜고 batch는 한 트랜잭션으로 실행하며 실패하면 모두 롤백합니다. 다른 DB의 문장은 거절합니다. `null`·문자열·숫자·`Uint8Array`·`ArrayBuffer`만 바인딩하고 `undefined`·boolean 등은 TypeError입니다(실제 D1은 boolean을 1/0으로 넣지만, 기존 사본처럼 막아 실수를 드러냅니다). `?1` 번호 매개변수는 SQLite에 그대로 넘깁니다. 결과는 열거 가능한 `{ results, success, meta: { changes } }`이고 각 행은 평범한 객체입니다. `INSERT … RETURNING`도 변경 수를 셉니다.

### 서비스 이행 안내

서비스 코드는 별도 작업으로 바꿉니다. 마이그레이션 SQL 복사는 기존 안내대로 유지합니다.

| 서비스   | 지울 파일·도우미                                                                        | 바꿀 것                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| repass   | `worker/src/devFakeSocial.ts`, `app/src/lib/sync/devFakeSocial.ts`, `worker/test/d1.ts` | `dev.ts`에서 `createFakeSocial({ basePath: '/dev/fake-social' })`와 `handle(req, socialRedirectUris(env))`. 앱은 `fakeAuthorizeUrl(url, apiUrl + '/dev/fake-social')`. 시험은 `/testing/d1`·`createTestTokens`로 전환하고 기본 이메일은 클레임으로 덮어씁니다. `isLocalDev`(허용 origin이 모두 로컬인지)는 지우지 말고 `dev.ts`의 연결 조건으로 유지합니다. 기존 `createTestD1({ through })`는 마이그레이션을 늘 적용했으므로 `migrations` 폴더를 함께 넘깁니다.                                       |
| 랜드마크 | `src/server/library-sync/dev-fake-social.ts`, `tests/helpers/sqlite-d1.ts`              | `createFakeSocial({ basePath: '/api/sync/dev/fake-social', defaultSub: 'dev-me', approveResponse: 'refresh' })`. `login.ts`의 정적 `fakeAuthorizeUrl`을 개발 분기 동적 import로 바꿉니다. D1 전체를 `{ results }`와 비교하던 시험(`meet-db.test.ts` 등)은 `.results`를 비교합니다. 기존 도우미와 달리 외래 키 검사를 켜므로 FK를 어기던 시험은 고쳐야 합니다. `fakeAuthorizeUrl`의 둘째 인자는 origin이 아니라 가짜 화면의 절대 URL입니다. 가짜 연결 조건인 `devFakeEnabled`의 로컬 검사를 유지합니다. |
| 가즈아   | `src/lib/sync/socialDev.ts`, `sync-worker/test/d1.ts`                                   | `devSocialEntry.ts`에서 `createFakeSocial({ basePath: '/__dev/social' })`, 경로는 `/__dev/social/authorize?provider=`로 바꿉니다. 개발 env의 client ID·시크릿은 `dev-fake-*`로 맞춥니다. **`sync-worker/test/fakeSocial.ts`는 남깁니다.** 코드 1회 사용·동시 교환·`calls`·키 장애·`no-id-token`은 서비스 시험만 쓰는 상태 있는 대역입니다.                                                                                                                                                             |
| synctx   | `deploy/pages/test/helpers.ts`의 `fakeGoogle`                                           | `createTestTokens({ projectId: 'synctx-test' })`로 바꿉니다. workerd에서는 `/testing`만 쓰고 `/testing/d1`은 불러오지 않습니다.                                                                                                                                                                                                                                                                                                                                                                        |
