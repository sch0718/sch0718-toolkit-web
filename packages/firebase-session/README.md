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
```

엔드포인트(`SESSION_PATHS`)는 서비스 라우터가 연결합니다: `POST /v1/session`(create), `DELETE /v1/session`(revoke current), `GET /v1/sessions`(list), `DELETE /v1/sessions?others=1`, `DELETE /v1/sessions/:id`. 실패는 `HttpError`(401·403·404)로, 인증서를 받지 못하면 `CertsUnavailableError`로 던집니다(503으로 바꾸세요).

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
  SESSION_PATHS,
  HttpError,
  CertsUnavailableError,
  errorBody,
  json,
  readJson,
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
  social: {
    allowedAccounts: env.ALLOWED_ACCOUNTS, // 비면 아무도 로그인하지 못함
    kakao: {
      clientId: env.KAKAO_CLIENT_ID,
      clientSecret: env.KAKAO_CLIENT_SECRET,
      redirectUris: ['https://app.example.test/auth/callback'],
    },
    naver: {
      clientId: env.NAVER_CLIENT_ID,
      clientSecret: env.NAVER_CLIENT_SECRET,
      redirectUris: ['https://app.example.test/auth/callback'],
    },
    keys,
  },
});

try {
  if (req.method === 'POST' && new URL(req.url).pathname === SESSION_PATHS.social) {
    return json(200, await sessions.createSocial(req, await readJson(req)));
  }
  const ctx = await sessions.authenticate(req); // 소셜 세션은 Authorization 없이
  // ctx로 서비스 API, sessions.list(ctx), sessions.revoke(ctx, ...) 호출
} catch (e) {
  if (e instanceof HttpError) return json(e.status, errorBody(e.code, e.extra));
  if (e instanceof CertsUnavailableError) return json(503, errorBody('certs-unavailable'));
  throw e;
}
```

쓰는 공급자만 `social.kakao`·`social.naver`에 넣습니다. `social`이 없으면 `createSocial`은 404 `not-found`입니다. 토큰 엔드포인트의 거절(429 제외)은 401 `invalid-code`, ID 토큰 검증 실패는 401 `invalid-token`, 토큰 엔드포인트 429, 공급자·JWKS 장애나 코드 교환 시간 초과(10초)는 503 `provider-unavailable`입니다. 200 응답에 `id_token`이 없으면 OIDC 활성화 여부를 확인하세요. 클라이언트는 503을 `{ kind: 'limit', code: 'provider-unavailable' }`로 돌려줍니다.

`redirectUris`를 주면 본문 `redirectUri`가 목록의 문자열 중 하나와 정확히 같아야 합니다(쿼리·끝 슬래시·대소문자 포함). 빈 배열이면 모두 거절하고, 생략하면 기존 URL 형식만 검사합니다. 운영 앱에는 localhost 콜백을 함께 등록하지 말고 개발용 공급자 앱(별도 Client ID)을 따로 쓰는 것을 권장합니다.

JWKS는 기본 1시간 캐시하고, 양수 `max-age`는 10분~24시간으로 제한합니다. `no-store`·`no-cache` 지시자는 무시하고 기본 1시간을 적용하며 `max-age=0`도 같습니다. 재조회 장애 때는 만료 시각부터 최대 6시간 동안 이전 키를 쓰고, 실패를 포함한 마지막 조회 뒤 5분이 지나야 다시 조회합니다. 캐시가 없거나 6시간 stale 한도를 넘긴 뒤 조회가 실패하면 30초 동안 다시 조회하지 않고 바로 `CertsUnavailableError`를 던집니다(negative cache). 30초가 지나면 재시도하며, 성공한 뒤에는 다음 실패까지 negative cache의 영향이 없습니다. 토큰 교환·소셜 JWKS·Google 인증서 요청에는 모두 10초 제한을 둡니다.

허용 목록은 `kakao:<sub>,naver:<sub>` 형식입니다. `parseAccountList()`는 접두어만 소문자로 바꾸고 ID의 대소문자는 유지합니다. 소셜 사용자 객체의 `sub`는 이 계정 값, `provider`는 `kakao` 또는 `naver`, `email`은 항상 빈 문자열입니다. 소셜 사용자의 이메일은 식별·인가에 쓰지 않습니다. 공급자 토큰에 문자열 이메일이 있으면 `createSocial`/`createSocialSession` 결과의 `user.unverifiedEmail`로만 소문자화해 줍니다(검증되지 않은 값, 표시용). 없으면 필드 자체를 넣지 않습니다. DB에 저장하거나 `VerifiedUser`에 더하지 않습니다. 세션 인증의 `authTime`은 세션을 만든 시각입니다. Google 사용자 객체에는 `provider`를 더하지 않습니다.

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
