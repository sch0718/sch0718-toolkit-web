# @sch0718/firebase-session

Firebase Google 로그인 + 이메일 허용 목록 + D1 기기 세션입니다. 가즈아에서 옮겼습니다. 진입점이 서로를 import하지 않으므로 Worker만 쓰는 곳에는 firebase·vite가 필요 없습니다.

| 진입점                             | 실행 환경          | 내용                                                                                     |
| ---------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `@sch0718/firebase-session/worker` | Cloudflare Workers | ID 토큰 검증(jose), Google 공개 인증서 캐시, 허용 목록, D1 기기 세션, CORS, HTTP 도우미  |
| `@sch0718/firebase-session/client` | 브라우저           | 동기화 설정 읽기, Firebase 로그인(SDK 지연 로드), 토큰·세션 헤더를 붙이는 API 클라이언트 |
| `@sch0718/firebase-session/vite`   | Vite 빌드          | 로그인 도우미를 앱 도메인에서 서빙하는 플러그인, Firebase CSP 플러그인, PWA용 상수       |

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

## Vite

```ts
import { firebaseAuthHelper, firebaseCsp } from '@sch0718/firebase-session/vite';

export default defineConfig({ plugins: [svelte(), firebaseCsp(), firebaseAuthHelper()] });
```

- `firebaseAuthHelper()`: `VITE_FIREBASE_AUTH_DOMAIN`이 앱 도메인이면 빌드 때 `https://<프로젝트>.firebaseapp.com/__/auth/*`를 받아 `dist/__/auth/`에 넣습니다. 서드파티 저장소를 막는 브라우저(iOS Safari, 홈 화면 PWA)에서도 로그인이 되게 하는 Firebase 권장 방법입니다.
- `firebaseCsp()`: index.html의 meta CSP에 `script-src https://apis.google.com`과 `frame-src https://<authDomain>`을 더합니다. CSP에 `default-src 'self';`와 `script-src 'self'`가 있어야 합니다.
- `vite`는 peer 의존으로 선언하지 않습니다. `/vite` 선언 파일이 `vite`의 `Plugin` 타입만 쓰므로, 이 진입점을 쓰는 앱에 설치된 vite를 그대로 씁니다. peer로 두면 pnpm이 Worker만 쓰는 workspace 패키지에도 루트의 vite를 연결해 `pnpm licenses list --prod`에 vite·esbuild·rollup이 끌려 들어옵니다.
- PWA를 쓰면 `AUTH_GLOB_IGNORES`, `AUTH_NAVIGATE_DENYLIST`를 workbox 설정에 넣습니다.

라이선스: [PolyForm Noncommercial 1.0.0](./LICENSE)
