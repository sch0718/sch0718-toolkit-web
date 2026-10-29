# 소셜 로그인 구현 계획

목표: 승인된 설계 4~10장을 구현하고 11장의 서비스 설정 절차를 문서화한다.
구조: Worker의 JWKS·코드 교환·ID 토큰 검증은 새 파일에 두고 기존 세션 처리에 연결한다. 브라우저 도우미는 Web Crypto와 저장소만 쓴다.
기술: TypeScript 5.9, jose, Vitest, 시험용 SQLite D1.
제약: 의존성 추가·실제 외부 호출·커밋·푸시 없음. 기존 시험과 Google 결과 객체·0001 SQL 호환 유지. 진입점 사이 import 없음.

## 1. JWKS (`src/worker/jwks.ts`, `jwks.test.ts`)

- [x] RSA 시험 키의 exportJWK로 캐시, TTL 상한, 동시 요청, 모르는 kid 재조회 간격, 장애·키 필터 시험을 쓴다.
- [x] `pnpm exec vitest run packages/firebase-session/src/worker/jwks.test.ts` 실패 확인.
- [x] `jwksKeys(url, fetchImpl?, now?)`를 구현하고 같은 시험 통과 확인.

## 2. 소셜 Worker (`social.ts`, `social.test.ts`, `session.ts`, `verify.ts`)

- [x] 가짜 토큰 엔드포인트와 서명 토큰으로 설계 9장의 성공·실패 시험을 쓴다.
- [x] 시험 실패 확인 후 코드 교환·검증·허용 목록과 createSocial을 구현한다.
- [x] 세션 전용 인증 시험을 먼저 쓰고 실패 확인 후 authenticate에 연결한다.
- [x] 0002 마이그레이션을 추가하고 시험 D1의 선택적 마이그레이션으로 0001만의 Google 경로를 검증한다.
- [x] 기존 Worker 시험을 포함해 통과 확인.

## 3. 브라우저 (`src/client/social.ts`, `social.test.ts`, `api.ts`, `api-social.test.ts`)

- [x] URL·pending·콜백·RFC 7636 벡터·설정 시험을 쓰고 실패 확인.
- [x] 도우미 구현 후 시험 통과 확인.
- [x] 세션 전용 요청·재시도 금지·403 account·invalid-code·createSocialSession 시험을 쓰고 실패 확인.
- [x] 기존 클라이언트 결과를 유지하며 구현하고 전체 클라이언트 시험 확인.

## 4. 배포와 검증

- [x] 진입점 export, SQL export/attw 제외, compat fixture, 한국어 changeset·README를 갱신한다.
- [x] lint, format:check, typecheck, check:svelte, test, build, check:package, size를 실행한다.
- [x] social 크기는 실측 후 약 15% 여유로 정한다. 기존 한도 초과는 보고한다.
- [x] compat 스크립트를 확인하고 네트워크가 필요하면 생략 사유를 기록한다.

## 검증 결과

- 신규 시험 129개, 전체 27개 파일의 384개 시험 통과. 기존 시험 파일은 수정하지 않음.
- lint, format:check, typecheck, check:svelte, build, check:package 통과.
- check:package는 기본 npm 캐시 권한 문제를 피하도록 worktree의 `.compat/npm-cache`를 사용.
- 설치된 TypeScript 5.9와 빌드 선언 파일로 pnpm-ts59 fixture 검사 통과. 전체 compat는 새 의존성 설치가 필요해 네트워크 없이 실행하지 않음.
- 소셜 클라이언트 884 B, 새 한도 1.02 kB. 기존 클라이언트 2.18 kB로 2.2 kB 한도 통과.
- [x] Worker 크기: 3.59 kB로 기존 3 kB 한도를 넘어 3.8 kB로 올림(조정자 판단). `createSessionAuth`가 소셜 코드를 참조해 소셜을 쓰지 않는 서비스 번들에도 들어간다. Worker 번들이라 브라우저 첫 로딩 예산과 무관하다.
- RFC 7636 Appendix B 벡터(verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`)로 S256을 시험. 처음 지시에 적힌 verifier는 잘못 옮긴 값이었다.
- 별도 읽기 전용 코드 검토에서 중요한 결함이나 Google 경로 회귀를 찾지 못함.
- 커밋·푸시·실제 공급자 호출·실제 키 생성 없음. 설계 문서는 Prettier 형식만 정리.
