# sch0718-toolkit-web

여러 웹 서비스(랜드마크, 가즈아, 앞으로 만들 서비스)가 함께 쓰는 TypeScript 패키지 모음입니다. 패키지마다 npm에 따로 발행하고, 각 서비스는 정확한 버전을 골라 설치합니다.

같은 이름 규칙의 다른 저장소:

- `sch0718-toolkit-web` — 브라우저·Node용 TypeScript (이 저장소)
- [`sch0718-toolkit-python`](https://github.com/sch0718/sch0718-toolkit-python) — 백엔드 Python
- 다른 언어가 생기면 `sch0718-toolkit-<언어>`로 추가합니다.

## 패키지

| 패키지                                       | 설명                                                             | 상태         |
| -------------------------------------------- | ---------------------------------------------------------------- | ------------ |
| [`@sch0718/seen-store`](packages/seen-store) | 이미 본 항목(처음 안내 등)의 기록. 저장소가 막히면 메모리로 동작 | 첫 발행 준비 |

예정: `kakao-share`(카카오톡 공유. 랜드마크에서 먼저 만든 뒤 옮김), `motion-kit`(움직이는 그림 생성기의 공통 함수).

## 넣는 기준

1. **프레임워크 무관.** React·Svelte·Effect·Vite·MUI를 import하지 않습니다. 프레임워크 어댑터가 꼭 필요하면 `<이름>-react`처럼 별도 패키지로 두고, 그 프레임워크를 쓰는 서비스가 두 곳 생길 때 만듭니다.
2. **쓰는 곳이 두 곳 이상**이거나, 새 서비스에서 곧 쓸 것이 분명합니다.
3. **도구는 넣고 값은 서비스에 둡니다.** 예: 크기 검사기는 넣고 예산 수치는 서비스에. 카카오 JS 키·도메인은 서비스가 주입합니다.
4. **서비스의 데이터 형식과 보안 정책은 넣지 않습니다.** 백업 형식, 공유 링크 형식, 저장소 스키마, 인증, Worker 출처·캐시 정책.
5. **브라우저 패키지 규칙:** ESM만, 런타임 의존성 0 지향, `sideEffects: false`, `exports`로 진입점 명시. 서비스의 첫 로딩 예산을 지키기 위해서입니다. 크기 한도는 [`.size-limit.json`](.size-limit.json)에 둡니다.
6. **비밀값 금지.** 공개 저장소·공개 패키지입니다.
7. **이미 잘 만든 것이 있으면 가져다 씁니다.** 별이 많고 업계에서 널리 쓰는 라이브러리가 같은 일을 하면 직접 만들지 않습니다. 직접 만드는 것은 그런 것이 없거나, 서비스 사이의 작은 규약(저장 형식 등)을 맞추는 코드입니다.

## 쓰는 도구

직접 만들지 않고 널리 쓰는 도구를 골랐습니다. 별 수는 2026-10-27 GitHub 기준입니다.

| 용도                    | 도구                                                                                                                                  |            별 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------: |
| 패키지 매니저·workspace | [pnpm](https://github.com/pnpm/pnpm) 11                                                                                               |         36.9k |
| 버전·변경 기록·발행     | [Changesets](https://github.com/changesets/changesets)                                                                                |         12.5k |
| 빌드(JS + `.d.ts`)      | [TypeScript](https://github.com/microsoft/TypeScript) `tsc` 5.9                                                                       |        111.6k |
| 시험                    | [Vitest](https://github.com/vitest-dev/vitest)                                                                                        |         17.3k |
| 린트                    | [ESLint](https://github.com/eslint/eslint) + [typescript-eslint](https://github.com/typescript-eslint/typescript-eslint)              | 27.6k / 16.5k |
| 포맷                    | [Prettier](https://github.com/prettier/prettier)                                                                                      |         52.4k |
| tsconfig 기본값         | [tsconfig/bases](https://github.com/tsconfig/bases) `@tsconfig/strictest`                                                             |          7.9k |
| 패키지 형식 검사        | [publint](https://github.com/publint/publint), [Are the types wrong?](https://github.com/arethetypeswrong/arethetypeswrong.github.io) |   1.3k / 1.6k |
| 번들 크기 한도          | [Size Limit](https://github.com/ai/size-limit)                                                                                        |          7.0k |

- 선언 파일은 TypeScript 5.9로 만듭니다. 쓰는 서비스 중 가장 낮은 버전(가즈아 5.9)에 맞춘 것이고, TS 6(랜드마크)에서도 호환 시험으로 확인합니다.
- 번들러(tsup·tsdown 등)는 쓰지 않습니다. 패키지가 작고 의존성이 없어서 `tsc` 출력으로 충분합니다. 필요해지면 그때 고릅니다.

## 개발

Node 24(`.nvmrc`)와 corepack을 씁니다.

```bash
corepack enable
pnpm install
pnpm run verify   # 린트·포맷·타입·시험·빌드·패키지 형식·크기
pnpm compat       # 발행할 tarball을 소비자 조건에 설치해 타입 검사(빌드 후)
```

`pnpm ci`는 pnpm 11의 내장 명령(깨끗하게 다시 설치)이라서, 검사 스크립트 이름은 `verify`입니다.

**호환 시험(`fixtures/`).** `scripts/compat.mjs`가 패키지를 `pnpm pack`으로 묶습니다. 그다음 저장소 밖 임시 폴더에 아래 소비자 조건을 만들어 설치하고 `tsc`로 검사합니다. 패키지를 추가하면 각 fixture의 `index.ts`에도 import를 추가합니다.

| fixture     | 조건                    | 대표 서비스 |
| ----------- | ----------------------- | ----------- |
| `yarn1-ts6` | Yarn 1.22, TypeScript 6 | 랜드마크    |
| `pnpm-ts59` | pnpm 10, TypeScript 5.9 | 가즈아      |

**서비스와 같이 고칠 때.** 이 저장소에서 시험으로 먼저 만든 뒤, `pnpm --filter <패키지> pack`으로 만든 `.tgz`를 서비스에 임시로 설치해 확인합니다. 이 설치는 커밋하지 않습니다. 서비스의 미리보기 배포에서 확인해야 하면 snapshot 버전을 씁니다(아래).

## 새 패키지 추가

1. `packages/<이름>/`에 `package.json`, `tsconfig.build.json`, `src/index.ts`, `src/index.test.ts`, `README.md`를 둡니다. [`packages/seen-store`](packages/seen-store)를 본뜹니다.
2. `.size-limit.json`에 크기 한도를, `fixtures/*/index.ts`에 import를 추가합니다.
3. `pnpm changeset`으로 첫 버전(minor) 기록을 남깁니다.

## 릴리스

PR마다 `pnpm changeset`으로 변경 기록을 남깁니다. main에 병합되면 [릴리스 워크플로](.github/workflows/release.yml)가 "chore: Version Packages" PR을 엽니다. 그 PR을 병합하면 npm에 발행하고 GitHub Release를 만듭니다.

- 발행은 npm **trusted publishing**(GitHub Actions OIDC)으로 합니다. npm 토큰을 저장소에 두지 않습니다. 공개 저장소에서 발행하면 provenance(출처 증명)가 붙습니다.
- 이미 발행한 버전은 덮어쓰지 않습니다. 문제가 있으면 고친 버전을 새로 내고 `npm deprecate`로 표시합니다.
- **미리보기:** `GITHUB_TOKEN=$(gh auth token) pnpm changeset version --snapshot <이름>`, `pnpm build && pnpm check:package`, `pnpm changeset publish --tag <이름>` 순서로 실행합니다. 빌드를 빼면 이전 `dist`가 발행됩니다. `latest`가 아닌 태그로 발행되며 이 변경은 main에 커밋하지 않습니다.
- 각 서비스는 정확한 버전으로 고정하고, Dependabot 갱신 PR이 서비스 CI(크기 검사 포함)를 통과하면 병합합니다.

### 첫 발행 (저장소 소유자가 직접)

릴리스 워크플로는 저장소 변수 `RELEASE_ENABLED`가 `true`일 때만 돕니다. 아래를 마친 뒤 켭니다.

1. npm 계정과 2FA를 준비합니다. 패키지 scope `@sch0718`은 npm 사용자 이름이 `sch0718`이어야 쓸 수 있습니다. 이름이 다르면 패키지 이름을 바꾸거나 npm 조직을 만듭니다.
2. main에서 브랜치를 만들어 `GITHUB_TOKEN=$(gh auth token) pnpm version-packages`로 버전을 올리고, 그 PR을 병합합니다. 변경 기록 생성기(`@changesets/changelog-github`)가 GitHub에서 PR·작성자 정보를 읽으므로 토큰이 필요합니다. CI에서는 워크플로 토큰이 자동으로 들어갑니다.
3. 로컬에서 `npm login` 후 `pnpm build && pnpm -r --filter "./packages/*" publish`로 첫 버전을 발행합니다.
4. npmjs.com의 각 패키지 설정에서 Trusted publisher를 추가합니다. 값은 GitHub Actions, 저장소 `sch0718/sch0718-toolkit-web`, 워크플로 `release.yml`입니다. **Allowed actions에서 `npm publish`도 허용합니다.** 2026-09-03 이후 만든 설정은 기본으로 `npm stage publish`만 허용해서, 이것을 켜지 않으면 Changesets가 부르는 `pnpm publish`가 거부됩니다. 새 설정은 2일 안에 첫 발행을 해야 합니다. 출처: [npm Trusted publishing](https://docs.npmjs.com/trusted-publishers)(2026-10-27 확인)
5. 저장소 Settings → Actions → General에서 "Allow GitHub Actions to create and approve pull requests"를 켭니다. Version Packages PR을 열기 위해서입니다.
6. `gh variable set RELEASE_ENABLED --body true --repo sch0718/sch0718-toolkit-web`

새 패키지를 추가할 때도 3~4를 합니다. trusted publisher는 패키지별 설정이고, 패키지가 npm에 있어야 설정할 수 있습니다. 새 패키지가 든 Version Packages PR을 병합하기 전에, 그 PR 브랜치에서 새 패키지만 로컬로 첫 발행하고 trusted publisher를 설정합니다. 그다음 PR을 병합하면 워크플로는 이미 발행된 버전을 건너뜁니다.

## 라이선스

[PolyForm Noncommercial 1.0.0](LICENSE). 랜드마크·가즈아와 같습니다. OSI가 인정하는 오픈소스 라이선스는 아닙니다.

- 개인 용도로 쓰고, 코드를 읽고 고쳐 보는 것은 자유롭게 할 수 있습니다. 상업적 이용은 별도로 문의해 주세요([GitHub 이슈](https://github.com/sch0718/sch0718-toolkit-web/issues)).
- 재배포할 때는 [LICENSE](LICENSE)의 `Required Notice:` 줄을 함께 전달해야 합니다. 발행 패키지에도 LICENSE가 들어갑니다.
- 이 저장소에 기여하면 그 기여를 같은 라이선스 조건으로 제공하는 데 동의한 것으로 봅니다.
