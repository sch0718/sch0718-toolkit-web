# firebase-session: 소셜 로그인 표시 이름·이메일 (설계·계획)

## 왜

selah 관리자 화면에 카카오·네이버 사용자가 `kakao:5185537198` 같은 계정 키로만 보인다. 표시용 이름·이메일을 보여 주려면 패키지가 공급자 값을 꺼내 `createSocial` 결과와 세션 인증 뒤 `ctx.user`에 실어야 한다. 지금은 이름을 버리고, 이메일(`unverifiedEmail`)도 `createSocial` 응답에만 있고 세션에 남지 않는다. 이미 있는 장치로는 안 된다: 세션 행에 identity만 있어 `authenticate`가 이름을 알 길이 없다.

전제: selah 관리자 소수, Cloudflare 무료. 다른 소비자(repass, gazua)는 코드·DB를 바꾸지 않아도 이전과 똑같이 동작해야 한다(하위 호환, minor).

## 공급자 확인 (2026-11-14)

- **카카오**: discovery `claims_supported`에 `nickname`, `picture`, `email`. 개발자 문서 「OpenID Connect ID 토큰」: 세 값은 「동의항목 설정 및 사용자 동의 필요」. → ID 토큰의 `nickname`·`email`을 쓴다. 추가 호출 없음.
- **네이버**: discovery `claims_supported`는 `iss, sub, aud, exp, iat, jti, azp, nonce`뿐이다. 이름·이메일은 ID 토큰에 없다. `userinfo_endpoint`는 `https://openapi.naver.com/v1/nid/me`(기존 회원 프로필 API, `Authorization: Bearer <access_token>`, 응답 `{ resultcode: '00', message, response: { id, nickname, name, email, … } }`, 필드는 개발자센터 「제공 정보」 선택과 사용자 동의에 따름). → 토큰 교환 응답의 `access_token`으로 한 번 부른다. 실패해도 로그인은 성공한다.

## 설계

### 1. 값 꺼내기 (`worker/social.ts`)

- `verifySocialIdToken` 결과에 `name?`를 더한다. 두 공급자 모두 ID 토큰의 `nickname`(문자열)을 읽는다. 이메일은 지금처럼 `email` → `unverifiedEmail`.
- 네이버이고 `name` 또는 `unverifiedEmail`이 비었고 토큰 응답에 문자열 `access_token`이 있으면, 허용 판정을 통과한 **뒤** `GET /v1/nid/me`를 한 번 부른다(`o.fetch`, 제한 3초). `resultcode === '00'`이고 `response`가 객체일 때만 빈 필드를 `response.nickname ?? response.name`, `response.email`로 채운다. 네트워크 오류·비 2xx·JSON 오류·형식 오류는 모두 무시한다(로그·오류에 토큰을 담지 않는다).
- 정리 규칙(한 함수씩):
  - 이름: 문자열만. C0·DEL·C1 제어 문자와 양방향 제어 문자(U+202A–202E, U+2066–2069)를 지우고 앞뒤 공백을 자른 뒤 코드 포인트 64개까지. 비면 필드를 넣지 않는다.
  - 이메일: 문자열만. 앞뒤 공백을 자르고 소문자화. 254자 이하이고 공백·제어 문자가 없고 `@`가 정확히 하나일 때만 넣는다.
- 두 값은 **검증되지 않은 표시용**이다. 계정 식별·허용 판정(`isAllowed`, 허용 목록)에 쓰지 않고 넘기지도 않는다.
- `exchangeSocial`의 `user`: `{ sub: 'kakao:<sub>', email: '', provider, name?, unverifiedEmail? }`.

### 2. 세션에 남기기 (`worker/session.ts`, 선택 옵션)

- 새 마이그레이션 `migrations/firebase-session-0003_social_profile.sql`:
  ```sql
  ALTER TABLE sessions ADD COLUMN display_name TEXT;
  ALTER TABLE sessions ADD COLUMN unverified_email TEXT;
  ```
- `package.json` `exports`에 0003 경로를 더하고, `check:package`의 `--exclude-entrypoints`에도 더한다(0001·0002와 같게).
- 새 옵션 `SessionAuthOptions.socialProfile?: boolean`(기본 꺼짐). 꺼져 있으면 **모든** SQL이 지금과 글자 하나 다르지 않다 → 0003이 없는 DB도 그대로 동작한다.
- 켜면:
  - `createSocial`의 sessions INSERT에 `display_name`, `unverified_email`(없으면 NULL)을 더한다.
  - 세션 전용 `authenticate`의 SELECT(소셜·googleSessionOnly가 함께 쓴다)에 `s.display_name`, `s.unverified_email`을 더한다. 그래서 옵션을 켜면 Google 세션 전용 인증도 0003이 필요하다. 값은 **소셜 세션일 때만** 있으면 `user.name`, `user.unverifiedEmail`로 싣는다. Google 사용자 객체·허용 판정은 바뀌지 않는다. 토큰 경로 SELECT는 그대로다.
  - 열이 없으면 `identity`와 같은 방식으로 `@sch0718/firebase-session: socialProfile 옵션을 쓰려면 migrations/firebase-session-0003_social_profile.sql을 적용해야 합니다` 오류를 던진다(기존 `socialQuery`를 열 이름·문구를 받게 넓힌다).
- 값은 세션을 만들 때 고정된다. 공급자에서 이름을 바꾸면 다음 로그인 세션부터 반영된다(드문 경우라 따로 갱신하지 않는다). 배포 전에 만든 세션은 값이 NULL이라 다시 로그인해야 보인다. 값이 없으면 서비스는 계정 키를 그대로 보여 준다(일괄 보충 장치는 만들지 않는다).
- 적용 순서: 0003 적용 → 옵션 켜기. 문제가 생기면 옵션만 끈다(열은 둬도 된다). 옵션은 저장·세션 복원만 정한다. 네이버 userinfo 호출과 `createSocial` 응답의 `name`은 옵션과 무관하다.
- `VerifiedUser`에 `name?: string; unverifiedEmail?: string`(둘 다 표시용 주석)를 더한다. 선택 필드라 기존 소비자 타입은 깨지지 않는다.

### 3. 클라이언트 (`client/api.ts`, `client/social.ts`)

- `createSocialSession` 응답 `user`에 `name?: string`을 더한다(런타임 변화 없음). `SessionAuth.createSocial` 반환 타입도 같다.
- **카카오 추가 동의.** 카카오는 동의 화면을 앱과 처음 연결할 때만 띄운다. 이미 로그인한 사용자가 새로 켠 「닉네임」·「이메일」에 동의하려면 인가 요청에 `scope`를 실어야 하고, OIDC면 `openid`를 꼭 포함해야 한다(카카오 REST API 문서 「추가 항목 동의 받기」). 지금 `socialAuthorizeUrl`·`beginSocialSignIn`에는 이 입력이 없어 selah의 기존 관리자는 이름을 받을 길이 없다. → `prompt`처럼 그대로 넘기는 선택 입력 `scope?: string`을 더한다. 주면 그 값을 `scope`로 쓰고(네이버 기본 `openid`도 대신한다), 없으면 지금과 같다. 예: 카카오 `scope: 'openid,profile_nickname,account_email'`. 이미 동의한 항목이면 동의 화면 없이 지나간다.

### 4. 문서

- `README.md` 「카카오·네이버 로그인」: 적용 순서·되돌리기, 기존 세션은 재로그인해야 값이 생김, 카카오 기존 사용자는 `scope`로 추가 동의, 이름·이메일 출처(카카오 ID 토큰, 네이버 userinfo), 콘솔에서 켤 동의 항목(카카오 「닉네임」·「카카오계정(이메일)」, 네이버 「별명」 또는 「회원이름」·「이메일 주소」), 표시용이며 권한 판단에 쓰지 말 것, `socialProfile` 옵션과 0003 마이그레이션, 지금의 「DB에 저장하거나 VerifiedUser에 더하지 않습니다」 문장 고치기. CSP를 쓰는 서비스는 Worker 쪽이라 무관함.
- `pnpm changeset`: `@sch0718/firebase-session` minor.

범위 밖: Google 로그인, 가짜 소셜 공급자(`testing/fake-social`)의 userinfo 흉내, 프로필 사진, 다른 공급자.

## 계획

| 순서 | 파일                                                  | 할 일                                                                                  |
| ---- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1    | `src/worker/social.ts`                                | `cleanDisplayName`·`cleanEmail`, ID 토큰 `nickname`, 네이버 userinfo 보충, `user` 형태 |
| 2    | `src/worker/verify.ts`                                | `VerifiedUser`에 선택 필드                                                             |
| 3    | `migrations/firebase-session-0003_social_profile.sql` | 열 두 개                                                                               |
| 4    | `src/worker/session.ts`                               | `socialProfile` 옵션, INSERT·SELECT 분기, 열 없음 오류, 반환 타입                      |
| 5    | `src/client/api.ts`, `src/client/social.ts`           | 응답 타입, `scope` 선택 입력                                                           |
| 5b   | `package.json`                                        | 0003 export, `check:package` 제외 목록                                                 |
| 6    | 시험                                                  | 아래                                                                                   |
| 7    | `README.md`, `.changeset/*.md`                        | 문서·변경 기록                                                                         |

### 시험 (같은 동작을 두 층에서 겹치지 않는다)

- `src/worker/social.test.ts` (값 꺼내기):
  - 카카오 토큰에 `nickname`·`email` → `user.name`·`unverifiedEmail`. 제어·양방향 문자 제거, 64자 자르기, 공백뿐인 이름은 필드 없음. 이메일 무효 사례(공백 포함, `@` 둘, 255자) → 필드 없음.
  - 이름 없는 토큰 → `name` 필드 없음(기존 테스트 기대값 유지).
  - 네이버 + `access_token` → userinfo를 Bearer로 한 번 부르고 빈 필드를 채움. userinfo 요청에 `signal`이 있고, userinfo가 던짐·500·잘못된 JSON·`resultcode` 오류일 때도 로그인 성공, 필드 없음. `access_token`이 없으면 부르지 않음. 허용되지 않은 계정이면 부르지 않음.
- `src/worker/social-session.test.ts` (세션 저장):
  - `socialProfile: true` → 로그인 뒤 `authenticate().user`에 `name`·`unverifiedEmail`.
  - 0002까지만 적용한 DB + 옵션 꺼짐 → 지금처럼 로그인·인증 성공. 옵션 켬 → 안내 오류.
- `src/client/social.test.ts`: `scope`를 주면 인가 URL에 그대로, 안 주면 지금과 같음(기존 기대값).

### 검증

저장소 루트에서 `pnpm run verify`, 빌드 뒤 `pnpm compat`. diff를 직접 읽어 꺼진 옵션의 SQL이 그대로인지 확인한다.
