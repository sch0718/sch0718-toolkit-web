# firebase-session 카카오·네이버 로그인 설계

- 날짜: 2026-10-29
- 대상: `@sch0718/firebase-session`(이 저장소). 가즈아 적용은 이 문서 범위 밖이며 별도 작업으로 한다.
- 요청: "지금은 구글 로그인만 되는데 네이버, 카카오 간편 로그인 기능을 넣고 싶어. 가능한지 검토 후 이것도 (공통 기능으로) 구현해줘."
- 상태: **추천안으로 진행, 사용자 확인 필요**(12장 결정 항목).

## 1. 목표와 범위

- 패키지를 쓰는 서비스가 Google 로그인과 함께 카카오·네이버 로그인을 켤 수 있게 한다. 로그인 뒤에는 지금과 같은 D1 기기 세션(30일 슬라이딩, 기기별·전체 철회, 목록)을 쓴다.
- 허용 목록 모델은 유지한다. 카카오·네이버 사용자는 공급자 사용자 ID(`kakao:<sub>`, `naver:<sub>`)로 허용한다.
- **하위 호환.** 지금 쓰는 서비스는 코드 수정 없이 그대로 동작해야 한다. 새 옵션을 넘기지 않으면 Worker·클라이언트 동작이 바이트 단위로 같다. 새 마이그레이션을 적용하지 않아도 Google 경로는 동작한다.
- 범위 밖: 가즈아 적용(UI 버튼, 라우터 연결, secret 등록), 같은 사람의 Google·카카오·네이버 계정 연결(12장 D3), 공급자 프로필(이름·사진) 저장, 공급자 연결 해제(unlink) API 호출.

## 2. 가능성 검토 (공식 문서, 확인 2026-10-29)

### 2.1 카카오 로그인

출처: [카카오 로그인 REST API](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api), [카카오 로그인 이해하기·활용하기](https://developers.kakao.com/docs/latest/ko/kakaologin/utilize), [공통 가이드(이메일 주의 사항)](https://developers.kakao.com/docs/latest/ko/kakaologin/common), [OIDC 메타데이터](https://kauth.kakao.com/.well-known/openid-configuration). 모두 2026-10-29 확인.

- **OpenID Connect 지원.** 앱 설정에서 OIDC를 켜면 토큰 요청 응답에 `id_token`이 온다. 서명 RS256, 공개키는 `https://kauth.kakao.com/.well-known/jwks.json`. 문서의 검증 순서: `iss`=`https://kauth.kakao.com`, `aud`=앱 키(REST API 키), `exp`, `nonce`=요청 때 보낸 값, `kid`에 맞는 공개키로 서명 검증. 공개키는 "일정 기간 캐싱해 사용 권장", 지나치게 자주 조회하면 차단될 수 있다.
- **PKCE.** 메타데이터 `code_challenge_methods_supported: ["S256"]`. 다만 REST API 문서의 인가 요청 매개변수 표에는 `code_challenge`가 없다 → **실제 앱으로 확인 필요**(14장).
- **state·nonce.** 인가 요청에 `state`(CSRF 방지, 요청마다 고유), `nonce`(ID 토큰 재생 방지)를 넣을 수 있다.
- **흐름.** 인가 코드(`GET https://kauth.kakao.com/oauth/authorize`) → 서버가 `POST https://kauth.kakao.com/oauth/token`(`client_secret_post`). REST API 키는 클라이언트 시크릿이 기본으로 켜져 있어 토큰 요청에 넣어야 한다.
- **식별자.** `sub`는 회원번호이고 `subject_types_supported: ["pairwise"]`(앱마다 다른 값).
- **이메일.** `카카오계정(이메일)` 동의항목은 **비즈 앱(또는 테스트 앱)에서만** 설정할 수 있다. ID 토큰의 `email`은 "유효한 이메일 값이 있는 경우에만 제공"되고 인증 여부(`is_email_verified`)는 사용자 정보 API로만 온다. 카카오는 이메일을 "ID 또는 동일 사용자 여부 판단 기준으로 사용하는 것은 권장하지 않"는다고 적는다. → **허용 목록은 이메일이 아닌 `sub`로 한다.** 비즈 앱 전환이 필요 없다.
- **JavaScript SDK vs REST.** JS SDK v2의 `Kakao.Auth.authorize()`도 리다이렉트로 인가 코드를 받고 토큰 요청은 서버가 한다. REST 인가 요청도 카카오계정 세션이 없으면 "카카오계정 정보를 입력하거나, 카카오톡으로 로그인"하는 화면을 띄운다. → SDK 없이 REST 리다이렉트로 한다(런타임 의존성 0, CSP 변경 없음).
- **등록할 것.** 카카오 로그인 사용 설정, OIDC 활성화, `[앱] > [플랫폼 키] > [REST API 키]`에 리다이렉트 URI 등록(인가 요청의 `redirect_uri`와 정확히 일치해야 함), 클라이언트 시크릿.
- **카카오톡 인앱 브라우저.** 문서상 `prompt=login`만 "카카오톡 인앱 브라우저에서는 제공하지 않음". 이 설계는 `prompt`를 기본으로 보내지 않는다.

### 2.2 네이버 로그인

출처: [네이버 로그인 개발가이드](https://developers.naver.com/docs/login/devguide/devguide.md) 3.5절(OIDC), [회원 프로필 조회 API](https://developers.naver.com/docs/login/profile/profile.md), [사전 검수 가이드](https://developers.naver.com/docs/login/verify/verify.md), [OIDC 메타데이터](https://nid.naver.com/.well-known/openid-configuration). 모두 2026-10-29 확인.

- **OpenID Connect 지원(기존 OAuth 2.0 API와 별도 경로).** 인가 `https://nid.naver.com/oauth2/authorize`(`scope=openid` 필수, `state`, `code_challenge`+`S256`, `nonce`), 토큰 `POST https://nid.naver.com/oauth2/token`(`code_verifier`), 공개키 `https://nid.naver.com/oauth2/jwks`. `id_token`은 RS256 JWT이고 문서의 검증 항목은 서명, `iss`=`https://nid.naver.com`, `aud`=Client ID, `exp`, `nonce`.
- **ID 토큰 클레임:** `iss`, `sub`(애플리케이션마다 다른 사용자 식별 값), `aud`, `azp`, `exp`, `iat`, `jti`, `nonce`. `auth_time` 없음. "이름, 이메일 같은 회원 프로필 정보는 id_token에 담기지 않습니다."
- **이메일.** 프로필 API(`https://openapi.naver.com/v1/nid/me`)의 `email`은 "네이버ID@naver.com 값이나, 사용자가 다른 외부메일로 변경했을 경우는 변경된 이메일". 인증 여부 필드가 없다. → 허용 목록에 쓰지 않는다. 이 설계는 프로필 API를 부르지 않는다.
- **검수.** "사전 검수를 통과하지 않아도 테스터, 관리자로 등록된 아이디는 네이버 로그인 이용이 가능"하고 애플리케이션 등록자 아이디는 멤버 등록 없이도 '개발 중' 상태에서 로그인된다. 모든 아이디가 쓰려면 사전 검수를 통과해야 한다. 허용 목록이 작은 개인 서비스는 '개발 중' + 멤버 등록으로 시작할 수 있다(멤버 수 한도는 개발자센터에서 확인 필요).
- 네이버 문서의 토큰 요청 예시는 쿼리 문자열이지만 메타데이터의 `token_endpoint_auth_methods_supported`는 `client_secret_post`·`none`이다. 이 설계는 POST 본문(form)으로 보낸다 → **실제 앱으로 확인 필요**(14장).

### 2.3 Firebase와 잇는 방법 비교

출처: [Firebase OIDC 웹 로그인](https://firebase.google.com/docs/auth/web/openid-connect), [Identity Platform 가격](https://cloud.google.com/identity-platform/pricing), [Firebase 커스텀 토큰 만들기](https://firebase.google.com/docs/auth/admin/create-custom-tokens), [Google: 임베디드 웹뷰의 OAuth 차단](https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/). 2026-10-29 확인.

| 항목                   | (a) Firebase OIDC 제공자                                                                                                                                  | (b) Worker 검증 → Firebase 커스텀 토큰                                                                                                                    | **(c) Worker 검증 → D1 세션 직접(추천)**                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 카카오                 | 가능(OIDC)                                                                                                                                                | 가능                                                                                                                                                      | 가능                                                                                                                                       |
| 네이버                 | 가능(2.2의 OIDC). 다만 Firebase가 네이버 OIDC와 맞는지(예: `auth_time` 없음) 확인 필요                                                                    | 가능                                                                                                                                                      | 가능                                                                                                                                       |
| 필요 조건              | "OpenID Connect authentication is only available in upgraded projects" → Identity Platform 업그레이드. OIDC는 Tier 2: 월 50 MAU 무료, 넘으면 MAU당 $0.015 | 서비스 계정 개인키(RS256)를 Worker secret에 둔다. Identity Toolkit의 `signInWithCustomToken`                                                              | 공급자 Client ID·시크릿을 Worker secret에 둔다(세 안 공통)                                                                                 |
| 비밀값의 피해 범위     | 시크릿은 Firebase 콘솔에                                                                                                                                  | **서비스 계정 키가 새면 그 Firebase 프로젝트의 아무 uid로나 로그인 토큰을 만들 수 있다**(Google 사용자 포함). 키는 기본 만료가 없어 회전을 직접 해야 한다 | 공급자 시크릿이 새도 그것만으로는 로그인할 수 없다(사용자 인가 코드가 필요)                                                                |
| 패키지 변경            | 클라이언트에 OIDC 제공자 로그인 추가, Worker는 `firebase.sign_in_provider`별 허용 판단(이메일 없음 → 허용 목록 변경 필요)                                 | Worker에 코드 교환·커스텀 토큰 발급, 검증기는 이메일 없는 custom 사용자 허용                                                                              | Worker에 코드 교환·ID 토큰 검증·세션 전용 인증, 클라이언트에 리다이렉트 도우미·세션 전용 요청                                              |
| 매 요청 인증           | Firebase ID 토큰 + 세션(지금과 같음)                                                                                                                      | Firebase ID 토큰 + 세션(지금과 같음)                                                                                                                      | 기기 세션만(256비트 무작위, D1에는 해시). 허용 목록은 매 요청 다시 확인                                                                    |
| iOS Safari·홈 화면 PWA | Firebase 팝업/리다이렉트를 쓰므로 지금 Google과 같은 서드파티 저장소 문제가 있다(로그인 도우미로 완화)                                                    | 공급자 리다이렉트는 최상위 이동이라 영향 없음. `signInWithCustomToken`은 API 호출                                                                         | 최상위 이동과 같은 출처 저장소만 쓴다. 서드파티 저장소·iframe 없음                                                                         |
| 카카오톡 인앱 브라우저 | Firebase 팝업이 인앱 브라우저에서 막힐 수 있다                                                                                                            | 공급자 리다이렉트는 동작                                                                                                                                  | 공급자 리다이렉트는 동작. (참고: Google 로그인은 임베디드 웹뷰에서 `disallowed_useragent`로 막힌다. 카카오 로그인은 이 경우의 대안이 된다) |
| 로그인할 때 받는 JS    | Firebase SDK 청크                                                                                                                                         | Firebase SDK 청크                                                                                                                                         | 없음(Firebase를 불러오지 않음)                                                                                                             |

**결론: 가능하다. (c)를 추천한다.**

1. 비밀값 피해 범위가 가장 작다. (b)의 서비스 계정 키는 Google 사용자까지 위장할 수 있는 키라 Worker 하나에 두기에 너무 크다.
2. 과금·프로젝트 업그레이드가 없다((a)는 Identity Platform 업그레이드와 Tier 2 과금).
3. 서드파티 저장소·팝업을 쓰지 않아 iOS Safari·PWA·인앱 브라우저에서 가장 단순하다.
4. Google 경로를 건드리지 않는다. 새 옵션을 넘기지 않으면 지금과 같다.

대가: 카카오·네이버 세션은 Firebase ID 토큰 없이 기기 세션만으로 인증한다. 그래서 (1) 세션 전용 인증은 **카카오·네이버로 만든 세션에만** 허용하고(Google 세션은 여전히 토큰 필수), (2) 허용 목록을 매 요청 다시 확인하고, (3) 세션을 만들 때 PKCE·nonce·state로 인가 코드를 시작한 브라우저에 묶는다(7장).

## 3. 구조

```
브라우저(서비스 앱)                        공급자(카카오·네이버)               서비스 Worker
 beginSocialSignIn('kakao', …)
   verifier·state·nonce 생성, localStorage 저장
   ── 최상위 이동 ──────────────────────▶ /authorize (code_challenge=S256(verifier), state, nonce)
                                           사용자 로그인·동의
   ◀── redirect_uri?code&state ────────────
 readSocialCallback(location.href)
   저장값 꺼내 지움, state 비교, 10분 지났으면 실패
 api.createSocialSession({provider, code, codeVerifier, nonce, redirectUri}, label)
   ── POST /v1/session/social ───────────────────────────────────────────▶ createSocial
                                           ◀── POST /token (client_secret, code_verifier)
                                           ── id_token ──▶ JWKS로 서명·iss·aud·exp·iat·nonce 검증
                                                            kakao:<sub> 허용 목록 확인
                                                            users upsert, sessions(identity) 추가
   ◀── { sessionId, expiresAt, user } ───────────────────────────────────
 이후 요청: 세션 헤더만(allowSessionOnly) ─────────────────────────────▶ authenticate(세션 전용 경로)
```

## 4. 공개 API

### 4.1 `/worker`

```ts
export type SocialProvider = 'kakao' | 'naver';
export const SOCIAL_PROVIDERS: Record<
  SocialProvider,
  {
    issuer: string; // https://kauth.kakao.com | https://nid.naver.com
    authorizeUrl: string; // 클라이언트 상수와 같은 값(진입점끼리 import하지 않으므로 각자 둔다)
    tokenUrl: string; // https://kauth.kakao.com/oauth/token | https://nid.naver.com/oauth2/token
    jwksUrl: string; // https://kauth.kakao.com/.well-known/jwks.json | https://nid.naver.com/oauth2/jwks
  }
>;

/** 공급자 JWKS 캐시. googleCerts처럼 isolate마다 하나 만든다. */
export function jwksKeys(url: string, fetchImpl?: typeof fetch, now?: () => number): CertSource;
export function socialKeys(
  fetchImpl?: typeof fetch,
  now?: () => number,
): Record<SocialProvider, CertSource>;

/** 'kakao:123, naver:AbC' → Set. 공급자 접두어만 소문자로, ID는 대소문자를 그대로 둔다. */
export function parseAccountList(raw: string | undefined): Set<string>;

export interface SocialProviderConfig {
  clientId: string;
  clientSecret?: string;
}
export interface SocialLoginOptions {
  /** 콤마로 구분한 허용 계정(secret). 'kakao:<sub>', 'naver:<sub>'. 비면 아무도 못 들어온다. */
  allowedAccounts: string | undefined;
  kakao?: SocialProviderConfig;
  naver?: SocialProviderConfig;
  keys: Record<SocialProvider, CertSource>; // socialKeys()
  fetch?: typeof fetch; // 기본 전역 fetch. 시험에서 바꾼다
}

// 기존 타입에 더하는 것(모두 선택)
interface SessionAuthOptions {
  /* 기존 그대로 */ social?: SocialLoginOptions;
}
interface VerifiedUser {
  /* sub, email, authTime 그대로 */ provider?: SocialProvider;
} // Google 경로에서는 넣지 않는다
interface SessionAuth {
  /* 기존 그대로 */
  /** POST /v1/session/social. social 옵션이 없으면 404 not-found. */
  createSocial(
    req: Request,
    body: unknown,
  ): Promise<{
    sessionId: string;
    expiresAt: number;
    user: { sub: string; email: string; provider: SocialProvider };
  }>;
}
SESSION_PATHS.social = '/v1/session/social';
```

- `createSocial` 본문: `{ provider, code, codeVerifier, nonce, redirectUri, label? }`.
- `authenticate(req)`: `social` 옵션이 있고 `Authorization`이 없을 때만 세션 전용 경로를 탄다(5.2). 그 밖에는 지금과 같다.
- `VerifiedUser.sub`는 카카오·네이버 사용자면 `kakao:<sub>`/`naver:<sub>`, `email`은 카카오 ID 토큰에 이메일이 있으면 그 값(소문자), 없으면 `''`, `authTime`은 세션을 만든 시각이다.

### 4.2 `/client`

```ts
export type SocialProvider = 'kakao' | 'naver';
export const SOCIAL_AUTHORIZE_URLS: Record<SocialProvider, string>;

export interface SocialSignInOptions {
  clientId: string;        // 카카오 REST API 키 / 네이버 Client ID (공개 값)
  redirectUri: string;     // 공급자에 등록한 값과 정확히 같게
  prompt?: string;         // 공급자에 그대로 넘긴다(예: 카카오 'select_account'). 기본 없음
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; // 기본 localStorage
  navigate?: (url: string) => void;                                 // 기본 location.assign
  random?: (n: number) => Uint8Array;                               // 기본 crypto.getRandomValues
  now?: () => number;
}
/** verifier·state·nonce를 만들어 저장하고 공급자로 이동한다. 저장소를 못 쓰면 reject. */
export function beginSocialSignIn(provider: SocialProvider, o: SocialSignInOptions): Promise<void>;
/** 순수 함수. 인가 URL을 만든다. */
export function socialAuthorizeUrl(provider: SocialProvider, p: {
  clientId: string; redirectUri: string; state: string; nonce: string; codeChallenge: string; prompt?: string;
}): string;

export type SocialCallback =
  | { ok: true; provider: SocialProvider; code: string; codeVerifier: string; nonce: string; redirectUri: string }
  | { ok: false; reason: 'state-mismatch' | 'expired' | 'cancelled' | 'provider-error'; provider: SocialProvider; error?: string };
/** 콜백 URL이면 저장값을 꺼내(지우고) 검사한다. 콜백이 아니거나 시작한 로그인이 없으면 null. */
export function readSocialCallback(url: string | URL, o?: { storage?: …; now?: () => number }): SocialCallback | null;
/** code·state·error·error_description을 뺀 URL(history.replaceState용). */
export function stripSocialCallback(url: string | URL): string;
/** VITE_KAKAO_LOGIN_CLIENT_ID, VITE_NAVER_LOGIN_CLIENT_ID. 둘 다 비면 null. */
export function readSocialConfig(env): { kakao?: { clientId: string }; naver?: { clientId: string } } | null;

// 기존 타입에 더하는 것(모두 선택)
interface SessionClientOptions { /* 기존 그대로 */
  /** ID 토큰이 없을 때(카카오·네이버 로그인) 세션 헤더만 보낸다. 기본 false(지금처럼 missing-token). */
  allowSessionOnly?: boolean;
}
type BaseFail = … | { ok: false; kind: 'not-allowed'; account?: string } | …; // account는 Worker가 줄 때만
interface SessionClient { /* 기존 그대로 */
  createSocialSession(input: { provider; code; codeVerifier; nonce; redirectUri }, label: string):
    Promise<ApiResult<{ sessionId: string; expiresAt: number; user: { sub: string; email: string; provider: SocialProvider } }, BaseFail | X>>;
}
```

- `beginSocialSignIn`이 저장하는 값: `{ provider, state, nonce, verifier, redirectUri, createdAt }`, 키 `@sch0718/firebase-session:social-pending`. 한 번에 하나만 둔다(새로 시작하면 덮어쓴다). 유효 10분(`SOCIAL_PENDING_TTL`).
- 기본 저장소를 sessionStorage가 아닌 localStorage로 둔 이유: 모바일에서 카카오톡·네이버 앱으로 간편 로그인한 뒤 돌아올 때 새 탭으로 열릴 수 있다. 같은 브라우저면 localStorage는 남는다. 값은 한 번 쓰면 지우고 10분 뒤엔 쓰지 않는다.
- `/client`는 `/worker`를 import하지 않는다. 공급자 이름·인가 URL 상수는 클라이언트에 따로 둔다.
- `/vite`: 바꾸지 않는다. 공급자로 가는 것은 최상위 이동이라 CSP `connect-src`·`frame-src`·`script-src`에 더할 것이 없다.

## 5. 동작

### 5.1 `createSocial`

1. `social` 옵션이 없으면 404 `not-found`.
2. 본문 검사(실패 400 `bad-request`): `provider`는 설정된 공급자, `code` `/^[\x21-\x7e]{1,1024}$/`, `codeVerifier` `/^[A-Za-z0-9._~-]{43,128}$/`(RFC 7636), `nonce` `/^[A-Za-z0-9_-]{16,128}$/`, `redirectUri` 2048자 이하 URL, `https:` 또는 `http://localhost|127.0.0.1|[::1]`, 조각(#) 없음. 공급자에 요청하기 전에 검사해 쓸데없는 외부 호출을 막는다.
3. 토큰 요청: `POST tokenUrl`, `application/x-www-form-urlencoded`, `grant_type=authorization_code`, `client_id`, `client_secret`(있으면), `code`, `redirect_uri`, `code_verifier`. 10초 시간 제한(`AbortSignal.timeout`).
   - 네트워크 실패·시간 초과·5xx → 503 `provider-unavailable`.
   - 4xx(`invalid_grant` 등) → 401 `invalid-code`.
   - 200인데 JSON이 아니거나 `id_token`이 문자열이 아니면 401 `invalid-token`(공급자 앱에서 OIDC를 켜지 않았을 때. README에 적는다).
4. ID 토큰 검증(`verifySocialIdToken`): 헤더 `alg`=RS256·`kid` 문자열, `keys[provider].key(kid)`(못 받으면 503 `provider-unavailable`, 모르는 kid면 401 `invalid-token`), jose `jwtVerify`(`algorithms: ['RS256']`, `issuer`, `audience: clientId`, `clockTolerance: 60초`, `requiredClaims: ['exp','iat','sub']`). 추가로 `iat`이 미래(60초 넘게)거나 `REAUTH_WINDOW`(5분)보다 오래면 거절, `nonce`가 요청 본문의 값과 다르면 거절, `azp`가 있으면 clientId와 같아야 함, `sub`는 1~128자 문자열. 실패는 401 `invalid-token`.
5. `account = provider + ':' + sub`. `parseAccountList(allowedAccounts)`에 없으면 403 `not-allowed`, 본문에 `account`를 실어 보낸다(방금 그 계정으로 인증한 사람에게만 가는 값이고, 허용 목록에 넣을 값을 알려 준다).
6. `users` upsert(`firebase_sub = account`, `email = ID 토큰 email 소문자 또는 ''`), 세션 만들기(`sessions.identity = account`). 응답 `{ sessionId, expiresAt, user: { sub: account, email, provider } }`.

### 5.2 `authenticate` 세션 전용 경로

조건: `social` 옵션이 있고 `Authorization` 헤더가 없다(헤더가 있으면 지금 경로 그대로).

1. 세션 헤더가 없거나 형식이 틀리면 401 `missing-token`(지금과 같은 코드).
2. `SELECT … FROM sessions s JOIN users u … WHERE s.id_hash = ?`. 없으면 401 `no-session`. `identity`가 NULL(Google 세션)이면 401 `missing-token` — **Google 세션은 토큰 없이 쓸 수 없다.**
3. 철회 401 `session-revoked`, 만료 401 `session-expired`(지금과 같은 규칙).
4. `identity`가 지금 허용 목록에 없으면 403 `not-allowed`(허용 목록에서 빼면 다음 요청부터 막힌다. Google 경로와 같은 성질).
5. `TOUCH_INTERVAL` 규칙으로 `last_used_at` 갱신. `{ userId, sessionHash, user: { sub: identity, email: u.email, authTime: s.created_at, provider } }`.

Google 토큰을 가진 요청이 카카오 세션을 내밀면 지금 경로의 `u.firebase_sub = 토큰 sub` 조건에서 걸려 401 `no-session`이다.

### 5.3 클라이언트 `send`

`allowSessionOnly`가 true이고 `auth`가 `'session'`이며 `idToken()`이 null이면, 세션 ID를 읽어 세션 헤더만 붙여 보낸다(세션도 없으면 지금처럼 `missing-token`). 토큰이 있으면 지금과 같다. 재시도 규칙(401 `invalid-token`일 때 한 번)은 바꾸지 않는다. 세션 전용 요청에는 재시도가 일어나지 않는다.

`toResult`의 403 `not-allowed`는 본문 `account`가 `/^(kakao|naver):[\x21-\x7e]{1,128}$/`이면 결과에 `account`를 붙인다. 없으면 지금과 같은 `{ ok: false, kind: 'not-allowed' }`.

`AUTH_CODES`에 `invalid-code`를 더한다(401 `invalid-code` → `{ kind: 'auth', code: 'invalid-code' }`). 다른 401 코드 동작은 그대로.

## 6. 데이터

`migrations/firebase-session-0002_social_sessions.sql`:

```sql
-- 카카오·네이버 로그인 세션. identity는 그 세션을 만든 공급자 계정('kakao:<sub>' 등), Google 세션은 NULL.
-- NULL이 아닌 세션만 Firebase ID 토큰 없이(세션만으로) 인증할 수 있다.
ALTER TABLE sessions ADD COLUMN identity TEXT;
```

- 카카오·네이버 사용자도 `users` 행을 하나 가진다. `firebase_sub`에 `kakao:<sub>`처럼 접두어를 붙인 공급자 ID를 넣는다(열 이름은 그대로 둔다. Firebase가 만드는 uid에는 `:`가 없어 겹치지 않는다. 서비스가 같은 Firebase 프로젝트에서 커스텀 토큰으로 `kakao:`로 시작하는 uid를 만들면 겹칠 수 있다 → README에 적는다).
- Google 경로의 SQL은 `identity`를 쓰지 않는다. 그래서 0002를 적용하지 않은 서비스도 Google 로그인은 그대로 된다. `social` 옵션을 켜려면 0002가 필요하다.
- `package.json` `exports`에 `./migrations/firebase-session-0002_social_sessions.sql`을 더하고 attw 검사에서 뺀다.

## 7. 보안

| 위협                                                                         | 대책                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 로그인 CSRF(공격자 코드로 피해자를 로그인시킴)                               | `state`를 브라우저 저장소 값과 비교(클라이언트). 저장값은 한 번 쓰면 지운다                                                                                                                                             |
| 인가 코드 가로채기(URL·기록·Referer로 샌 code를 공격자가 우리 Worker에 제출) | PKCE: `code_verifier`는 시작한 브라우저 저장소에만 있다. Worker는 그것을 공급자에 넘기고, 공급자가 `code_challenge`와 맞춰 본다. 클라이언트는 콜백을 읽은 즉시 `stripSocialCallback`으로 URL을 지우도록 README에 적는다 |
| ID 토큰 재생                                                                 | `nonce`(시작한 브라우저 저장소에만 있음)를 Worker가 비교. `iat`이 5분보다 오래면 거절                                                                                                                                   |
| 서명 위조·alg 혼동                                                           | RS256만, `kid`의 공급자 JWKS 키, `iss`·`aud`·`azp` 검사                                                                                                                                                                 |
| 다른 앱의 토큰                                                               | `aud`=우리 Client ID                                                                                                                                                                                                    |
| Google 세션을 토큰 없이 사용                                                 | 세션 전용 인증은 `identity IS NOT NULL` 세션만                                                                                                                                                                          |
| 허용 목록에서 뺀 계정                                                        | 매 요청 다시 확인 → 403                                                                                                                                                                                                 |
| 공급자 시크릿 노출                                                           | Worker secret에만. 로그·응답에 넣지 않는다. 시크릿만으로는 로그인할 수 없다                                                                                                                                             |
| 열린 엔드포인트로 공급자 호출 남용                                           | 본문 형식을 먼저 검사. 요청 빈도 제한은 서비스(Cloudflare Rate Limiting 등) 몫으로 README에 적는다                                                                                                                      |
| JWKS 과다 조회(카카오 차단)                                                  | `Cache-Control: max-age`(없으면 1시간, 최대 24시간) 동안 메모리 캐시. 모르는 `kid`면 마지막 조회 뒤 5분이 지났을 때만 다시 받는다. 동시 요청은 한 번만 받는다                                                           |
| 세션 원문 노출                                                               | 지금과 같이 D1에는 SHA-256만. 세션 전용이라 세션 원문이 곧 자격 증명이다(쿠키 세션과 같은 수준). 기기에서 지우기·철회는 그대로                                                                                          |
| XSS로 저장소의 verifier 읽기                                                 | XSS면 세션도 읽힌다. 이 설계로 늘어나는 위험은 없다. 서비스의 CSP가 대책                                                                                                                                                |

PKCE·nonce·state 셋 다 쓰는 이유: 카카오는 PKCE가 메타데이터에만 있고(2.1) 실제로 검사하는지 확인이 필요하다. PKCE가 무시돼도 nonce가 코드 가로채기를 막는다(가로챈 code의 ID 토큰에는 피해자 브라우저의 nonce가 들어 있고, 공격자는 그 값을 모른다. 단 nonce는 인가 URL에 드러나므로 PKCE보다 약하다 → 14장에서 확인).

## 8. 실패 동작

| 상황                                                    | Worker                                                                                             | 클라이언트 결과                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 사용자가 공급자 화면에서 취소                           | —                                                                                                  | `readSocialCallback` → `{ ok: false, reason: 'cancelled' }` (`error=access_denied`) |
| 공급자가 다른 오류를 돌려줌                             | —                                                                                                  | `reason: 'provider-error'`, `error`에 공급자 코드(영숫자·`_`만, 64자까지)           |
| state 다름 / 10분 지남                                  | —                                                                                                  | `'state-mismatch'` / `'expired'`                                                    |
| 시작한 로그인이 없는데 code가 옴                        | —                                                                                                  | `null`(무시)                                                                        |
| 본문 형식 틀림                                          | 400 `bad-request`                                                                                  | `{ kind: 'server', status: 400 }`                                                   |
| social 옵션 없음                                        | 404 `not-found`                                                                                    | `{ kind: 'not-found' }`                                                             |
| 코드 교환 거절                                          | 401 `invalid-code`                                                                                 | `{ kind: 'auth', code: 'invalid-code' }`                                            |
| ID 토큰 검증 실패                                       | 401 `invalid-token`                                                                                | `{ kind: 'auth', code: 'invalid-token' }` (auth 'none'이라 재시도 없음)             |
| 허용 목록 밖                                            | 403 `not-allowed` + `account`                                                                      | `{ kind: 'not-allowed', account }`                                                  |
| 공급자·JWKS 장애                                        | 503 `provider-unavailable`                                                                         | `{ kind: 'limit', code: 'provider-unavailable' }`                                   |
| 세션 전용: 세션 없음/Google 세션/철회/만료/허용 목록 밖 | 401 `no-session`/401 `missing-token`/401 `session-revoked`/401 `session-expired`/403 `not-allowed` | `auth`/`auth`/`auth`/`auth`/`not-allowed`                                           |

## 9. 시험 계획

외부 서비스에 실제로 요청하지 않는다. 가짜 fetch와 시험용 RSA 키로 만든 JWKS·ID 토큰을 쓴다(`test/tokens.ts` 방식).

- `jwksKeys`: 정상 응답 캐시, max-age 반영·상한, 동시 요청 한 번, 모르는 kid 재조회 간격, 네트워크 실패·비 200 → `CertsUnavailableError`, RSA가 아닌 키·`use: 'enc'` 무시.
- `parseAccountList`: 공백·빈 항목, 접두어 소문자화, ID 대소문자 유지, 모르는 접두어 무시.
- `createSocial`(가짜 토큰 엔드포인트 + 가짜 키): 성공(카카오·네이버, 이메일 있음·없음), 토큰 요청 본문(form, code_verifier·client_secret·redirect_uri), 서명 위조·모르는 kid·alg none/HS256·iss·aud·azp 다름·exp 지남·iat 미래·iat 5분 초과·nonce 다름·nonce 없음·sub 없음/129자, 토큰 응답 4xx·5xx·네트워크 실패·JSON 아님·id_token 없음, 본문 형식 오류(각 필드), 설정 안 된 공급자, social 옵션 없음 → 404, 허용 목록 밖 → 403 + account, 허용 목록 비어 있음, 공급자 호출 전에 형식 검사(fetch 호출 0회).
- `authenticate` 세션 전용: 성공·touch, Google 세션을 토큰 없이 → missing-token, 세션 없음 → no-session, 철회·만료, 허용 목록에서 빠짐 → 403, social 옵션이 없으면 지금과 같이 missing-token이고 DB를 읽지 않음, 토큰과 카카오 세션을 섞으면 no-session, list·revoke가 카카오 세션에서도 동작.
- 하위 호환: 기존 시험 전부 그대로 통과. 0001만 적용한 DB에서 Google 경로 전체가 동작(0002 없이).
- 클라이언트: `socialAuthorizeUrl`(카카오·네이버 매개변수, 네이버 `scope=openid`, 인코딩), `beginSocialSignIn`(저장값, S256 challenge가 RFC 7636 예시 벡터와 일치, 이동 URL, 저장소 예외 → reject), `readSocialCallback`(성공·state 다름·만료·취소·공급자 오류·저장값 없음 → null·콜백 아님 → null·한 번 읽으면 지워짐), `stripSocialCallback`, `readSocialConfig`, `createSocialSession`(경로·본문·auth none), `allowSessionOnly`(토큰 없음 → 세션만, 옵션 끔 → missing-token, 세션도 없음 → missing-token, 토큰 있으면 지금과 같음), 403 `account` 매핑.
- `compat` fixture(`pnpm-ts59`)에 새 API import를 더해 선언 파일을 검사한다.

## 10. 크기

- `/client`의 기존 size-limit 항목(`createSessionClient, firebaseAuth, readSyncConfig`)은 새 함수를 import하지 않으므로 한도를 그대로 둔다. `allowSessionOnly`·`createSocialSession`으로 늘어나는 몇십 바이트가 한도 안인지 확인한다.
- 소셜 도우미 항목(`beginSocialSignIn, readSocialCallback, stripSocialCallback`)을 새로 더하고 한도는 빌드 결과 + 여유로 정한다.
- `/worker`는 브라우저 번들에 들어가지 않는다. 기존 항목 한도만 확인한다.

## 11. 사용자가 할 일 (키를 만들거나 등록하는 일은 사용자가 한다)

**카카오** — [카카오 디벨로퍼스](https://developers.kakao.com) 내 애플리케이션

1. 앱 만들기(또는 가즈아 카카오 공유에 쓰는 앱을 같이 쓸지 결정, 12장 D5).
2. 카카오 로그인 사용 설정 ON, OpenID Connect 활성화 ON.
3. `[앱] > [플랫폼 키] > [REST API 키]`에 리다이렉트 URI 등록. 예: `https://<서비스 도메인>/auth/callback`, 개발용 `http://localhost:<포트>/auth/callback`.
4. 클라이언트 시크릿 확인(켜져 있으면 Worker secret에 넣는다).
5. 동의항목: 필수 항목은 앱 설정에 따른다. 이메일은 받지 않아도 된다(비즈 앱 불필요).

**네이버** — [네이버 개발자센터](https://developers.naver.com/apps) 애플리케이션 등록

1. 사용 API: 네이버 로그인. 서비스 환경: PC 웹·모바일 웹, 서비스 URL, Callback URL(위와 같은 형식) 등록.
2. OIDC(`/oauth2/*`)를 쓰는 데 따로 켤 설정이 있는지 확인 필요(문서에 별도 스위치 언급 없음).
3. '개발 중' 상태로 쓸 경우 멤버관리에 로그인할 네이버 아이디를 관리자·테스터로 등록. 모두에게 열려면 사전 검수.
4. Client ID·Client Secret 확인.

**서비스(가즈아 등) 설정 위치**

| 값                            | 위치                                                                       | 비밀 여부                    |
| ----------------------------- | -------------------------------------------------------------------------- | ---------------------------- |
| 카카오 REST API 키(client_id) | Worker secret `KAKAO_CLIENT_ID`, 앱 빌드 변수 `VITE_KAKAO_LOGIN_CLIENT_ID` | 비밀 아님(인가 URL에 드러남) |
| 카카오 클라이언트 시크릿      | Worker secret `KAKAO_CLIENT_SECRET`                                        | **비밀**                     |
| 네이버 Client ID              | Worker secret `NAVER_CLIENT_ID`, 앱 빌드 변수 `VITE_NAVER_LOGIN_CLIENT_ID` | 비밀 아님                    |
| 네이버 Client Secret          | Worker secret `NAVER_CLIENT_SECRET`                                        | **비밀**                     |
| 허용 계정                     | Worker secret `ALLOWED_ACCOUNTS`(예: `kakao:1234567890,naver:AbCd…`)       | 비밀 취급                    |

허용 계정 값은 처음 로그인을 시도해 403 응답의 `account`로 확인한 뒤 넣는다(README에 절차).

Worker 이름은 서비스가 정한다(패키지는 값만 받는다). 위 이름은 README 예시다.

## 12. 결정 항목 (추천안으로 진행, 사용자 확인 필요)

| #   | 결정                                       | 선택지                                                                     | 추천                                                 | 이유                                                                                                                                                                                                             |
| --- | ------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Firebase와 잇는 방식                       | (a) Firebase OIDC / (b) 커스텀 토큰 / (c) Worker 검증 + D1 세션            | **(c)**                                              | 2.3: 비밀값 피해 범위, 과금 없음, iOS·인앱 동작, Google 경로 무변경                                                                                                                                              |
| D2  | 카카오·네이버 허용 기준                    | 공급자 ID / 이메일 / 둘 다                                                 | **공급자 ID(`kakao:<sub>`)**                         | 카카오 이메일은 비즈 앱 필요·인증 여부 별도, 네이버 이메일은 인증 보장 없음, 카카오가 이메일을 동일인 판단에 쓰지 말라고 함                                                                                      |
| D3  | 같은 사람의 Google·카카오·네이버 계정 연결 | 연결 안 함 / 검증된 이메일로 자동 연결 / 로그인한 상태에서 명시적으로 연결 | **이번엔 연결 안 함(공급자마다 별도 사용자·데이터)** | 자동 연결은 이메일 검증 차이로 계정 탈취 위험. 명시적 연결은 `user_identities` 테이블·연결 API가 필요해 다음 단계로 둔다. 지금 스키마(접두어 붙은 `firebase_sub`)는 나중에 연결 테이블을 더하는 데 막히지 않는다 |
| D4  | 허용 목록 비밀값                           | `ALLOWED_EMAILS`에 섞기 / 별도 `allowedAccounts`                           | **별도**                                             | 이메일 소문자화 규칙과 공급자 ID 대소문자 규칙이 달라 섞으면 실수하기 쉽다                                                                                                                                       |
| D5  | 카카오 앱                                  | 카카오 공유 앱과 같은 앱 / 로그인 전용 앱                                  | 사용자 결정(패키지와 무관)                           | 같은 앱이면 키 관리가 하나, 따로면 권한이 나뉜다                                                                                                                                                                 |
| D6  | 공급자 SDK                                 | JS SDK / REST 리다이렉트                                                   | **REST 리다이렉트**                                  | 런타임 의존성 0, CSP 변경 없음. 카카오 REST 인가도 카카오톡 로그인을 띄운다(2.1)                                                                                                                                 |
| D7  | 콜백 저장소                                | sessionStorage / localStorage                                              | **localStorage(주입 가능)**                          | 앱 전환 뒤 새 탭으로 돌아오는 경우 대비. 한 번 쓰고 지우며 10분 유효                                                                                                                                             |
| D8  | 공급자 장애 응답                           | 502 / 503                                                                  | **503 `provider-unavailable`**                       | 클라이언트가 `limit`(잠시 뒤 다시)로 보여 준다                                                                                                                                                                   |

## 13. 가즈아 적용(별도 작업에서 할 일, 참고)

- 라우터에 `POST /v1/session/social` 연결, `createSessionAuth({ …, social: { allowedAccounts: env.ALLOWED_ACCOUNTS, kakao, naver, keys } })`, `const social = socialKeys()`는 모듈 범위에.
- `D1`에 0002 마이그레이션 복사·적용.
- 클라이언트: 로그인 버튼 3개, 콜백 경로 처리(`readSocialCallback` → `createSocialSession` → 세션 저장 → `stripSocialCallback`), `createSessionClient({ …, allowSessionOnly: true })`, 카카오·네이버 계정일 때 `credentials.idToken`이 null을 돌려주도록(Firebase에 로그인하지 않음), 계정 표시(이메일이 없으면 '카카오 계정' 등).
- PWA: 콜백 경로가 navigateFallback으로 index.html을 받는지 확인.

## 14. 실제 앱으로 확인할 것 (키가 생긴 뒤)

1. 카카오 인가 요청이 `code_challenge`를 받아들이고 토큰 요청에서 `code_verifier`가 틀리면 거절하는지.
2. 네이버 토큰 요청을 POST form 본문으로 보내도 되는지, 클라이언트 시크릿과 PKCE를 함께 써도 되는지.
3. 네이버 `/oauth2/*` OIDC 경로가 앱 설정 변경 없이 동작하는지, `sub`가 프로필 API `id`와 같은지(같지 않아도 이 설계는 `sub`만 쓴다).
4. iOS 홈 화면 PWA에서 공급자 로그인 뒤 PWA로 돌아와 localStorage 값을 읽는지.
5. 카카오톡 인앱 브라우저에서 카카오·네이버 로그인이 끝까지 되는지. 인앱에서 시작해 외부 브라우저로 돌아오면 state가 없어 `null`/실패가 되는 것이 정상이다(다시 시도 안내).
6. JWKS 응답의 `Cache-Control`.

## 15. 구현 중 바뀐 결정 (2026-10-29)

- **카카오 인가 요청에 `scope`를 넣지 않는다.** 카카오 REST API 문서는 `scope`를 추가 동의 요청용으로 설명하고, OIDC를 켠 앱은 "별도의 파라미터 없이" ID 토큰을 준다. 네이버 OIDC만 `scope=openid`를 넣는다(필수).
- **콜백에 `code`가 비어 있으면** `readSocialCallback`이 `provider-error`를 돌려준다(Worker까지 보내지 않는다).
- **Worker 크기 한도를 3 kB → 3.8 kB로 올렸다.** `createSessionAuth`가 소셜 코드(`exchangeSocial`·`parseAccountList`)를 참조해 실측 3.59 kB가 됐다. Worker 번들이라 브라우저 첫 로딩 예산과 무관하다. 소셜을 쓰지 않는 서비스까지 이 코드를 싣는 것을 피하려면 소셜 처리를 별도 팩토리로 떼야 하는데, 공개 API가 하나 더 늘어 이번에는 하지 않았다.
- `/client` 기존 크기 항목은 2.18 kB / 2.2 kB로 여유가 20 B뿐이다. 다음 변경에서 한도를 다시 봐야 한다.
