# @sch0718/token-check

디자인 토큰 시험 도구입니다. 서비스와 `@sch0718/ui-svelte`의 `tokens.css`를 읽어 세 블록(라이트 / 다크 자동 / 다크 지정)의 구성을 검사하고, WCAG 2.x 대비를 계산합니다. 프레임워크와 무관하며 **Node 시험 전용**이라 `devDependencies`로 설치합니다.

색 계산은 직접 만들지 않고 [chroma.js](https://github.com/gka/chroma.js)(GitHub 별 10.6k, 2026-11-13 확인)를 씁니다. 이 패키지가 더하는 것은 서비스 사이의 작은 규약(세 블록 구조, 반투명 색 합성 규칙)입니다.

```ts
// test/tokens.test.ts (Vitest, node 환경)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  blockProblems,
  composite,
  contrast,
  mergeTokenBlocks,
  readTokenBlocks,
  tokenValue,
} from '@sch0718/token-check';

const require = createRequire(import.meta.url);
const shared = readTokenBlocks(
  readFileSync(require.resolve('@sch0718/ui-svelte/tokens.css'), 'utf8'),
);
const app = readTokenBlocks(readFileSync('src/styles/tokens.css', 'utf8'));
const { light, darkAuto } = mergeTokenBlocks(shared, app); // 불러오는 순서대로, 뒤가 이긴다

expect(blockProblems(app, /^(sp-\d+|rail-w|content-max)$/)).toEqual([]);
for (const t of [light, darkAuto]) {
  const c = (name: string) => tokenValue(t, name); // var(--이름)을 따라간다
  expect(contrast(c('accent'), c('surface'))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(c('ok'), composite(c('ok-soft'), c('surface')))).toBeGreaterThanOrEqual(4.5);
}
```

| 함수                                 | 하는 일                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readTokenBlocks(css)`               | 세 블록을 `{ light, darkAuto, darkFixed }`로 읽습니다. 주석은 지우고, 다른 `@media`·클래스 안의 `:root`는 뺍니다. 블록이 빠지면 오류를 던집니다             |
| `mergeTokenBlocks(...sets)`          | 공용 → 서비스 순서로 합칩니다. 뒤의 값이 이깁니다                                                                                                           |
| `blockProblems(blocks, independent)` | 테마 토큰이 세 블록에 다 있는지, 테마 무관 토큰(`independent`에 맞는 이름)이 라이트에만 있는지, 두 다크 블록 값이 같은지 검사해 문제 문장 목록을 돌려줍니다 |
| `tokenValue(block, name)`            | 토큰 값. `var(--이름)`을 같은 블록에서 따라갑니다. 없거나 순환이면 오류를 던집니다                                                                          |
| `contrast(fg, bg)`                   | WCAG 대비(1~21). 반투명 `fg`는 `bg` 위에 합성하고, 반투명 `bg`는 흰색 위에 있다고 봅니다                                                                    |
| `composite(fg, bg)`                  | 반투명 `fg`를 `bg` 위에 얹은 불투명 색(`#rrggbb`). 옅은 배경 토큰을 면 위에 놓을 때 씁니다                                                                  |

토큰 이름은 `--`를 뺀 것(`surface`, `sp-1`)입니다. 블록 선택자는 `@sch0718/ui-svelte`와 같습니다: 라이트 `:root`, 다크 자동 `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }`, 다크 지정 `:root[data-theme='dark']`.

라이선스: [PolyForm Noncommercial 1.0.0](./LICENSE)
