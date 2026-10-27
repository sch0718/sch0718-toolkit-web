# sch0718-toolkit-web

여러 웹 서비스(랜드마크, 가즈아, 앞으로 만들 서비스)가 함께 쓰는 TypeScript 패키지 모음입니다. 패키지마다 **GitHub Packages**(npm 레지스트리)에 따로 발행하고, 각 서비스는 토큰으로 정확한 버전을 골라 설치합니다.

같은 이름 규칙의 다른 저장소:

- `sch0718-toolkit-web` — 브라우저·Node용 TypeScript (이 저장소)
- [`sch0718-toolkit-python`](https://github.com/sch0718/sch0718-toolkit-python) — 백엔드 Python
- 다른 언어가 생기면 `sch0718-toolkit-<언어>`로 추가합니다.

## 패키지

| 패키지                                                   | 설명                                                                                                                                                                                  | 상태         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| [`@sch0718/seen-store`](packages/seen-store)             | 이미 본 항목(처음 안내 등)의 기록. 저장소가 막히면 메모리로 동작                                                                                                                      | 첫 발행 준비 |
| [`@sch0718/firebase-session`](packages/firebase-session) | Firebase ID 토큰 검증·이메일 허용 목록·D1 기기 세션(`/worker`), 로그인·세션 API 클라이언트(`/client`), 로그인 도우미·CSP Vite 플러그인(`/vite`). users·sessions 마이그레이션 SQL 포함 | 첫 발행 준비 |
| [`@sch0718/vite-app`](packages/vite-app)                 | PWA 설정 팩토리 `createPwaOptions()`, 개발 서버 CSP 완화 플러그인 `devCsp()`                                                                                                          | 첫 발행 준비 |
| [`@sch0718/ui-svelte`](packages/ui-svelte)               | 범용 디자인 토큰(`tokens.css`)과 Svelte 5 컴포넌트(Badge, Banner, Chip, Segmented, Sheet, Snackbar, SnackbarHost, Toggle), `applyTheme`                                               | 첫 발행 준비 |
| [`@sch0718/license-notices`](packages/license-notices)   | 라이선스 고지 파일 생성 `writeNotices()`                                                                                                                                              | 첫 발행 준비 |

예정: `kakao-share`(카카오톡 공유. 랜드마크에서 먼저 만든 뒤 옮김), `motion-kit`(움직이는 그림 생성기의 공통 함수).

## 넣는 기준

1. **프레임워크 무관.** React·Svelte·Effect·Vite·MUI를 import하지 않습니다. 프레임워크 어댑터가 꼭 필요하면 `<이름>-react`처럼 별도 패키지로 두고, 그 프레임워크를 쓰는 서비스가 두 곳 생길 때 만듭니다. Svelte·Vite는 가즈아·repass 두 서비스가 써서 어댑터 패키지(`ui-svelte`, `vite-app`, `firebase-session/vite`)를 둡니다. 프레임워크를 import하는 코드는 패키지 이름이나 서브경로에 그 이름이 드러나게 합니다.
2. **쓰는 곳이 두 곳 이상**이거나, 새 서비스에서 곧 쓸 것이 분명합니다.
3. **도구는 넣고 값은 서비스에 둡니다.** 예: 크기 검사기는 넣고 예산 수치는 서비스에. 카카오 JS 키·도메인은 서비스가 주입합니다.
4. **장치는 넣고 값은 서비스에 둡니다.** 토큰 검증, 세션 처리, CSP 변환 같은 장치는 넣고, 허용 이메일·허용 출처·세션 헤더 이름·DB 바인딩·매니페스트 같은 값은 서비스가 주입합니다. 패키지가 SQL을 실행하는 테이블은 패키지가 스키마를 소유하고 마이그레이션 SQL을 함께 배포합니다. 서비스 고유의 데이터 형식(백업 형식, 공유 링크 형식, 서비스 문서 스키마)은 넣지 않습니다.
5. **브라우저 패키지 규칙:** ESM만, 런타임 의존성 0 지향, `sideEffects: false`, `exports`로 진입점 명시. 서비스의 첫 로딩 예산을 지키기 위해서입니다. 크기 한도는 [`.size-limit.json`](.size-limit.json)에 둡니다. Worker 전용 진입점(`firebase-session/worker`)은 브라우저 번들에 들어가지 않으므로 jose 의존을 둡니다.
6. **비밀값 금지.** 공개 저장소·공개 패키지입니다.
7. **이미 잘 만든 것이 있으면 가져다 씁니다.** 별이 많고 업계에서 널리 쓰는 라이브러리가 같은 일을 하면 직접 만들지 않습니다. 직접 만드는 것은 그런 것이 없거나, 서비스 사이의 작은 규약(저장 형식 등)을 맞추는 코드입니다.

## 쓰는 도구

직접 만들지 않고 널리 쓰는 도구를 골랐습니다. 별 수는 2026-10-27 GitHub 기준입니다.

| 용도                    | 도구                                                                                                                                  |            별 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------: |
| 패키지 매니저·workspace | [pnpm](https://github.com/pnpm/pnpm) 11                                                                                               |         36.9k |
| 버전·변경 기록·발행     | [Changesets](https://github.com/changesets/changesets)                                                                                |         12.5k |
| 빌드(JS + `.d.ts`)      | [TypeScript](https://github.com/microsoft/TypeScript) `tsc` 5.9                                                                       |        111.6k |
| 빌드(Svelte 패키지)     | [`@sveltejs/package`](https://github.com/sveltejs/kit/tree/main/packages/package) 2.5.8 (별: sveltejs/kit)                            |         20.9k |
| Worker 토큰 검증        | [jose](https://github.com/panva/jose)                                                                                                 |          7.8k |
| 시험                    | [Vitest](https://github.com/vitest-dev/vitest)                                                                                        |         17.3k |
| Svelte 컴포넌트 시험    | [Testing Library Svelte](https://github.com/testing-library/svelte-testing-library)                                                   |           665 |
| 시험용 DOM              | [jsdom](https://github.com/jsdom/jsdom) 29 (30은 쓰지 않음, 아래)                                                                     |         21.7k |
| 린트                    | [ESLint](https://github.com/eslint/eslint) + [typescript-eslint](https://github.com/typescript-eslint/typescript-eslint)              | 27.6k / 16.5k |
| 포맷                    | [Prettier](https://github.com/prettier/prettier)                                                                                      |         52.4k |
| tsconfig 기본값         | [tsconfig/bases](https://github.com/tsconfig/bases) `@tsconfig/strictest`                                                             |          7.9k |
| 패키지 형식 검사        | [publint](https://github.com/publint/publint), [Are the types wrong?](https://github.com/arethetypeswrong/arethetypeswrong.github.io) |   1.3k / 1.6k |
| 번들 크기 한도          | [Size Limit](https://github.com/ai/size-limit)                                                                                        |          7.0k |

- 선언 파일은 TypeScript 5.9로 만듭니다. 쓰는 서비스 중 가장 낮은 버전(가즈아 5.9)에 맞춘 것이고, TS 6(랜드마크)에서도 호환 시험으로 확인합니다. Dependabot은 TypeScript 메이저 버전을 올리지 않습니다(`.github/dependabot.yml`).
- `@sveltejs/package` 3은 TypeScript 6을 요구해 2.5를 씁니다.
- jsdom은 29.1.1에 고정합니다. 30은 계산된 `background`를 펼치면서 `var()`를 버려 가즈아에서 옮긴 Toggle 시험 둘이 깨집니다. Dependabot도 jsdom 메이저 버전을 올리지 않습니다.
- 패키지 형식 검사에서 `ui-svelte`는 publint만 씁니다. Are the types wrong?이 `.svelte` 파일을 이해하지 못하기 때문입니다. `firebase-session`은 마이그레이션 SQL 진입점(`./migrations/0001_users_sessions.sql`)을 Are the types wrong? 검사에서 뺍니다.
- 번들러(tsup·tsdown 등)는 쓰지 않습니다. 순수 TS 패키지는 `tsc` 출력으로 충분하고, Svelte 패키지(`ui-svelte`)만 `@sveltejs/package`로 빌드합니다. 필요해지면 그때 고릅니다.

## 개발

Node 24(`.nvmrc`)와 corepack을 씁니다.

```bash
corepack enable
pnpm install
pnpm run verify   # 린트·포맷·타입·시험·빌드·패키지 형식·크기
pnpm compat       # 발행할 tarball을 소비자 조건에 설치해 타입 검사(빌드 후)
```

`pnpm ci`는 pnpm 11의 내장 명령(깨끗하게 다시 설치)이라서, 검사 스크립트 이름은 `verify`입니다.

**호환 시험(`fixtures/`).** `scripts/compat.mjs`가 패키지를 `pnpm pack`으로 묶습니다. 그다음 저장소 밖 임시 폴더에 아래 소비자 조건을 만들어 설치하고 `tsc`로 검사합니다. 패키지를 추가하면 그 패키지를 쓰는 서비스의 fixture에 import를 추가합니다. fixture에 `check` 스크립트가 있으면 `tsc` 대신 그것을 실행합니다(가즈아 fixture는 `svelte-check`도 돌립니다). 가즈아 fixture는 `vite-app` 사용 코드와 그것이 쓰는 `firebase-session/vite`의 PWA 상수만 `pwa.ts`로 떼어 `skipLibCheck: true`로 따로 검사합니다. vite-plugin-pwa·workbox의 선언 파일이 서드파티 쪽 이유로 검사를 통과하지 못하기 때문입니다(가즈아도 `skipLibCheck`를 켭니다). `firebase-session/vite`의 선언 파일을 포함한 나머지는 `index.ts`에서 선언 파일까지 검사합니다.

| fixture     | 조건                                      | 대표 서비스 |
| ----------- | ----------------------------------------- | ----------- |
| `yarn1-ts6` | Yarn 1.22, TypeScript 6                   | 랜드마크    |
| `pnpm-ts59` | pnpm 10, TypeScript 5.9, Svelte 5, Vite 6 | 가즈아      |

**서비스와 같이 고칠 때.** 이 저장소에서 시험으로 먼저 만든 뒤, `pnpm --filter <패키지> pack`으로 만든 `.tgz`를 서비스에 임시로 설치해 확인합니다. 이 설치는 커밋하지 않습니다. 서비스의 미리보기 배포에서 확인해야 하면 snapshot 버전을 씁니다(아래).

## 새 패키지 추가

1. `packages/<이름>/`에 `package.json`, `tsconfig.build.json`, `src/index.ts`, `src/index.test.ts`, `README.md`를 둡니다. [`packages/seen-store`](packages/seen-store)를 본뜹니다.
2. `.size-limit.json`에 크기 한도를, 그 패키지를 쓰는 서비스의 fixture(`fixtures/*/index.ts`)에 import를 추가합니다.
3. `pnpm changeset`으로 첫 버전(minor) 기록을 남깁니다.

## 서비스에서 설치하기

GitHub Packages의 npm 레지스트리는 **공개·비공개와 관계없이 설치에 토큰이 필요**하고, 지원하는 토큰은 personal access token (classic)뿐입니다. 출처: [Working with the npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)(2026-10-27 확인). 패키지는 비공개로 발행됩니다. 공개로 바꿀 수는 있지만 되돌릴 수 없어서 바꾸지 않았습니다.

**1. 서비스 저장소에 `.npmrc`를 둡니다.** 토큰 값은 넣지 않고 환경변수 이름만 적습니다.

```ini
@sch0718:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

Yarn 1과 pnpm 모두 `.npmrc`의 `${변수}`를 읽습니다. `@sch0718/*`만 GitHub Packages로 가고 나머지 의존성은 그대로 npmjs.com에서 받습니다.

**2. 토큰을 넣습니다.** 토큰은 `read:packages` 권한만 준 classic 토큰을 서비스 설치용으로 하나 만들어 씁니다.

| 설치하는 곳                   | 방법                                                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 내 컴퓨터                     | 셸 설정에 `export GITHUB_PACKAGES_TOKEN=<토큰>`. `.npmrc`의 변수가 비어 있으면 설치가 실패하므로 꼭 넣습니다                                                                                                                      |
| 서비스의 GitHub Actions       | 패키지 설정 → Manage Actions access → Add repository로 그 서비스 저장소에 Read 권한을 줍니다. 그러면 워크플로에서 `GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_TOKEN }}`으로 받을 수 있습니다. 패키지마다·서비스마다 한 번씩 합니다 |
| Cloudflare Pages·Workers 빌드 | 프로젝트 설정의 빌드 환경변수(비밀값)에 `GITHUB_PACKAGES_TOKEN`으로 classic 토큰을 넣습니다. Production·Preview 둘 다 넣습니다                                                                                                    |

- classic 토큰은 범위를 좁힐 수 없고 만료되면 모든 서비스의 설치가 한꺼번에 실패합니다. 만료일을 달력에 적어 두고, 바꿀 때 위 세 곳을 함께 갱신합니다.
- 토큰 값은 저장소·로그·`.npmrc`에 적지 않습니다.

서비스 워크플로에서 `permissions`를 지정했다면 설치하는 job에 `packages: read`를 꼭 넣습니다. 빠지면 접근 권한을 줬어도 토큰의 packages 권한이 없어 설치가 실패합니다.

```yaml
jobs:
  build:
    permissions:
      contents: read
      packages: read
    steps:
      # …
      - run: yarn install --frozen-lockfile
        env:
          GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**3. 설치합니다.** `yarn add @sch0718/<패키지>@<버전>` 또는 `pnpm add @sch0718/<패키지>@<버전>`. 정확한 버전으로 고정하고 lockfile을 커밋합니다.

## 릴리스

PR마다 `pnpm changeset`으로 변경 기록을 남깁니다. main에 병합되면 [릴리스 워크플로](.github/workflows/release.yml)가 "chore: Version Packages" PR을 엽니다. 그 PR을 병합하면 GitHub Packages에 발행하고 GitHub Release를 만듭니다. 발행 직후 그 버전을 레지스트리에서 실제로 설치해 import되는지 확인합니다(`scripts/smoke-installed.mjs`).

- 발행은 이 저장소 워크플로의 `GITHUB_TOKEN`(`packages: write`)으로 합니다. 따로 등록하는 비밀값이나 외부 계정은 없습니다.
- Version Packages PR은 워크플로 토큰으로 열려서 CI가 자동으로 돌지 않습니다(GitHub의 제한). 병합 전에 PR 화면에서 변경 기록과 버전만 확인합니다. 코드는 그 전 PR에서 이미 CI를 거쳤습니다.
- 이미 발행한 버전은 덮어쓰지 않습니다. 문제가 있으면 고친 버전을 새로 냅니다.
- **미리보기:** `GITHUB_TOKEN=$(gh auth token) pnpm changeset version --snapshot <이름>`, `pnpm build && pnpm check:package`, `pnpm changeset publish --tag <이름>` 순서로 실행합니다. 빌드를 빼면 이전 `dist`가 발행됩니다. `latest`가 아닌 태그로 발행되며 이 변경은 main에 커밋하지 않습니다. 로컬 발행에는 `write:packages` 권한이 있는 토큰이 `~/.npmrc`에 필요합니다.
- 각 서비스는 정확한 버전으로 고정하고, 갱신 PR이 서비스 CI(크기 검사 포함)를 통과하면 병합합니다.

**저장소 설정(한 번).** Settings → Actions → General → Workflow permissions에서 "Allow GitHub Actions to create and approve pull requests"가 켜져 있어야 Version Packages PR이 열립니다.

## 라이선스

[PolyForm Noncommercial 1.0.0](LICENSE). 랜드마크·가즈아와 같습니다. OSI가 인정하는 오픈소스 라이선스는 아닙니다.

- 개인 용도로 쓰고, 코드를 읽고 고쳐 보는 것은 자유롭게 할 수 있습니다. 상업적 이용은 별도로 문의해 주세요([GitHub 이슈](https://github.com/sch0718/sch0718-toolkit-web/issues)).
- 재배포할 때는 [LICENSE](LICENSE)의 `Required Notice:` 줄을 함께 전달해야 합니다. 발행 패키지에도 LICENSE가 들어갑니다.
- 이 저장소에 기여하면 그 기여를 같은 라이선스 조건으로 제공하는 데 동의한 것으로 봅니다.
