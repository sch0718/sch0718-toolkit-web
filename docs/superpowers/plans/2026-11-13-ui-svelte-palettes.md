# ui-svelte 색 팔레트 10종 — 설계와 구현 계획

작은 작업이라 설계와 계획을 이 문서 하나로 쓴다.

## 전제와 목표

- 전제: 운영자 1명, 개인·소수용 Svelte 앱 세 개(repass, selah, gazua), 무료 운영. 세 앱은 `@sch0718/ui-svelte` 0.2.0의 `tokens.css`와 모드 API(`applyTheme` 등)를 쓰고, 각 앱 CSS에서 `--accent` 계열만 덮어써 고유 색을 낸다.
- 목표: 색 팔레트를 이 패키지 한 곳에 모아 세 앱이 공유한다. 기존 6종(공용 기본, repass, selah, landmark 셋)에 새 4종을 더해 10종.
- 이미 있는 것으로 안 되는 이유: 지금은 앱마다 accent만 따로 덮어써서, 같은 색 묶음을 다른 앱에서 고르거나 사용자가 바꿀 방법이 없다.
- 범위 밖: 각 앱·landmark 수정, React 패키지, 발행.

## 설계

### 모드와 팔레트는 따로 고른다

- 모드(라이트·다크·시스템)는 지금처럼 `data-theme`. 팔레트는 새 속성 `<html data-palette="<id>">`.
- `data-palette`가 없거나 `violet`이면 `tokens.css`의 지금 기본값 그대로다. 0.2.0을 쓰는 앱의 화면은 바뀌지 않는다(하위 호환). `violet`은 따로 CSS 블록을 두지 않는다.
- 팔레트 CSS는 `tokens.css` 안, 기본 세 블록 뒤에 「팔레트」 절로 둔다. 별도 파일로 나누면 앱이 import를 잊었을 때 `applyPalette`가 조용히 아무 일도 안 하므로 한 파일로 둔다. 새 export는 없다.
- 팔레트 하나는 세 블록이다. 기본 세 블록과 같은 구조이고 다크 두 블록의 값은 같다.

```css
:root[data-palette='blue'] { /* 라이트 */ }
@media (prefers-color-scheme: dark) {
  :root[data-palette='blue']:not([data-theme='light']) { /* 다크 자동 */ }
}
:root[data-palette='blue'][data-theme='dark'] { /* 다크 지정 */ }
```

- 우선순위(명시도): 팔레트 라이트 (0,2,0), 팔레트 다크 (0,3,0). 기본 다크 블록 (0,2,0)보다 뒤에 있고 다크는 명시도가 더 높아 모드별로 맞게 이긴다. 팔레트 라이트와 다크는 같은 토큰 묶음을 정의한다(시험이 지킨다).
- 앱 CSS의 accent 덮어쓰기(`:root` (0,1,0), 다크 (0,2,0))와의 관계: `data-palette`가 `violet`이 아니면 팔레트가 명시도로 이긴다. `violet`(블록 없음)일 때만 앱 덮어쓰기가 보인다. 그래서 2단계에서 각 앱은 accent 덮어쓰기를 걷어내고 기본 팔레트를 지정한다(마이그레이션 절).
- `@sch0718/token-check`의 `readTokenBlocks`는 `:root[data-palette=…]`를 읽지 않으므로(정규식이 `:root {`, `:root:not(`, `:root[data-theme=` 바로 뒤만 본다) 기존 `tokens.test.ts`와 앱 쪽 토큰 시험은 그대로 동작한다.

### 팔레트가 바꾸는 토큰

범용 토큰만 바꾼다: `--bg --surface --surface2 --line --line-strong --t1 --t2 --t3 --accent --accent-soft --on-accent --snack-action`. 상태색(`--ok/--warn/--err`와 `-soft`), `--scrim`, `--shadow`, `--seg-card-*`는 모든 팔레트에서 기본값으로 충분해 바꾸지 않는다(시험이 상태색 대비도 함께 확인한다). 앱 전용 토큰(`--up/--down`, `--s1~--s10` 등)은 건드리지 않는다.

- 강조만 바꾸는 팔레트(blue, teal, forest, rose, plum, mono): `--accent --accent-soft --on-accent --snack-action` 네 개. 면·글자는 기본 중립 회색.
- 면까지 바꾸는 팔레트(pastel, paper, night): 위 12개.
- `--focus-ring`은 `var(--accent)`를 따라가므로 따로 두지 않는다.

### 팔레트 10종

hue는 라이트 accent 기준. violet과 night는 둘 다 보라지만 기존 테마를 모으는 것이라 그대로 둔다(night는 남색 면이 정체성). 새 4종은 기존과 hue가 겹치지 않게 골랐다. 주황·코럴은 paper(벽돌)와, 노랑·호박은 `--warn`과 겹쳐 뺐다. mono는 hue가 없는 흑백이고, pastel(라이트 검정)과는 다크(라임 대 흰색)와 강조 글자색(라임)이 다르다.

| id | 이름 | 출처 | hue | 라이트 accent | 다크 accent |
|---|---|---|---|---|---|
| violet | 보라 | 기존: 공용 기본 | 247 | #5b47e0 | #a093ff |
| blue | 파랑 | 기존: repass | 223 | #2f5bd3 | #8fb0ff |
| teal | 청록 | 기존: selah | 197 | #1d5a73 | #7cc4dc |
| pastel | 파스텔 | 기존: landmark pastel | 무채/라임 | #18181b | #d9f99d |
| paper | 종이 | 기존: landmark paper | 12 | #a8391b | #f0896c |
| night | 밤 | 기존: landmark night | 251 | #5e3fe6 | #b3a3ff |
| forest | 숲 | 신규 | 149 | #1b7346 | #5fcf94 |
| rose | 장미 | 신규 | 339 | #b01e50 | #ff8ab0 |
| plum | 자두 | 신규 | 285 | #8c3aa6 | #d79cf0 |
| mono | 모노 | 신규 | 무채 | #2b2f36 | #e4e6ea |

`PALETTES` 순서는 위 표 순서.

landmark 값은 landmark의 `text`/`main` 값을 옮기되 이 패키지 기준(AA)에 맞추려고 일부를 조정했다: paper accent #b4401f→#a8391b(라이트), #e8795b→#f0896c(다크), night accent #6a4bf0→#5e3fe6, #a693ff→#b3a3ff, landmark에 없는 `--surface2`는 새로 정하고(라이트는 bg 근처, 다크는 surface보다 약간 밝게), `--t3`·`--line-strong`도 대비를 맞추려고 조정했다. 값은 아래가 정답이다.

### 값 (구현은 이 값을 그대로 쓴다)

accent-soft 알파는 라이트 0.1, 다크 0.14(pastel 라이트만 0.08).

```
blue    light: --accent #2f5bd3; --on-accent #ffffff; --accent-soft rgba(47, 91, 211, 0.1);  --snack-action #8fb0ff
        dark:  --accent #8fb0ff; --on-accent #0e0f11; --accent-soft rgba(143, 176, 255, 0.14); --snack-action #2f5bd3
teal    light: --accent #1d5a73; --on-accent #ffffff; --accent-soft rgba(29, 90, 115, 0.1);  --snack-action #8fd0e8
        dark:  --accent #7cc4dc; --on-accent #0e0f11; --accent-soft rgba(124, 196, 220, 0.14); --snack-action #1d5a73
forest  light: --accent #1b7346; --on-accent #ffffff; --accent-soft rgba(27, 115, 70, 0.1);  --snack-action #5fcf94
        dark:  --accent #5fcf94; --on-accent #0e0f11; --accent-soft rgba(95, 207, 148, 0.14); --snack-action #1b7346
rose    light: --accent #b01e50; --on-accent #ffffff; --accent-soft rgba(176, 30, 80, 0.1);  --snack-action #ff8ab0
        dark:  --accent #ff8ab0; --on-accent #0e0f11; --accent-soft rgba(255, 138, 176, 0.14); --snack-action #b01e50
plum    light: --accent #8c3aa6; --on-accent #ffffff; --accent-soft rgba(140, 58, 166, 0.1); --snack-action #d79cf0
        dark:  --accent #d79cf0; --on-accent #0e0f11; --accent-soft rgba(215, 156, 240, 0.14); --snack-action #8c3aa6
mono    light: --accent #2b2f36; --on-accent #ffffff; --accent-soft rgba(43, 47, 54, 0.1);   --snack-action #e4e6ea
        dark:  --accent #e4e6ea; --on-accent #0e0f11; --accent-soft rgba(228, 230, 234, 0.14); --snack-action #2b2f36
pastel  light: --bg #fafaf7; --surface #ffffff; --surface2 #f2f2ee; --line #e4e4e7; --line-strong #85858f;
               --t1 #18181b; --t2 #52525b; --t3 #696971; --accent #18181b; --on-accent #d9f99d;
               --accent-soft rgba(24, 24, 27, 0.08); --snack-action #d9f99d
        dark:  --bg #111113; --surface #1b1b1f; --surface2 #26262b; --line #34343a; --line-strong #71717d;
               --t1 #f4f4f5; --t2 #b4b4bc; --t3 #8e8e98; --accent #d9f99d; --on-accent #18181b;
               --accent-soft rgba(217, 249, 157, 0.14); --snack-action #3f6212
paper   light: --bg #f6f1e7; --surface #fffdf8; --surface2 #f3eee3; --line #e8dfcf; --line-strong #8c7a5a;
               --t1 #2b2620; --t2 #5e5446; --t3 #6b6155; --accent #a8391b; --on-accent #ffffff;
               --accent-soft rgba(168, 57, 27, 0.1); --snack-action #f0896c
        dark:  --bg #1b1713; --surface #252019; --surface2 #2a241d; --line #3a3329; --line-strong #82735c;
               --t1 #efe6d6; --t2 #c2b6a2; --t3 #988c78; --accent #f0896c; --on-accent #1b1713;
               --accent-soft rgba(240, 137, 108, 0.14); --snack-action #a8391b
night   light: --bg #f2f4fb; --surface #ffffff; --surface2 #edf0f9; --line #dde2f0; --line-strong #76829f;
               --t1 #151b33; --t2 #4a5373; --t3 #5c6889; --accent #5e3fe6; --on-accent #ffffff;
               --accent-soft rgba(94, 63, 230, 0.1); --snack-action #b3a3ff
        dark:  --bg #0e1324; --surface #171e38; --surface2 #1d2544; --line #2b3558; --line-strong #6a76a0;
               --t1 #e8ecf8; --t2 #aab3d0; --t3 #8a94b6; --accent #b3a3ff; --on-accent #0e1324;
               --accent-soft rgba(179, 163, 255, 0.14); --snack-action #5e3fe6
```

면을 바꾸는 팔레트는 `color-scheme`을 따로 두지 않는다(기본 블록이 모드별로 이미 정한다).

### 대비 기준 (모든 팔레트 × 라이트·다크, 기본 블록 위에 팔레트 블록을 겹친 값으로)

지금 `tokens.test.ts`의 기준에 두 줄을 더한다.

1. `--t1 --t2 --t3 --ok --warn --err --accent`가 `--bg --surface --surface2` 위 4.5:1 이상
2. `--on-accent`가 `--accent` 위 4.5:1 이상(기존 기본 시험은 3:1, 팔레트는 버튼 글자 기준으로 4.5:1)
3. `--accent`가 `--accent-soft`를 각 면에 얹은 색 위 4.5:1 이상
4. `--t3`·`--line-strong`이 각 면 위 3:1 이상, 흰색(토글 손잡이)이 `--t3` 위 3:1 이상
5. `--ok --warn --err`가 `--surface` 위 자기 `-soft` 위 4.5:1 이상
6. `--snack-action`이 스낵바 배경 `--t1` 위 4.5:1 이상

위 값은 이 문서를 쓰며 chroma-js로 미리 돌려 모두 통과함을 확인했다.

### API (`theme.ts`)

기존 `ThemeChoice`·`applyTheme`·`readThemeChoice`·`saveThemeChoice`·`THEME_OPTIONS`·`isThemeChoice`는 그대로 둔다. 더하는 것:

```ts
export type PaletteId = 'violet' | 'blue' | 'teal' | 'pastel' | 'paper' | 'night' | 'forest' | 'rose' | 'plum' | 'mono';
export const DEFAULT_PALETTE: PaletteId = 'violet';
export interface PaletteOption {
  id: PaletteId;
  label: string; // 한국어 이름
  /** 고르기 견본에 쓰는 라이트·다크 accent. tokens.css 값과 같아야 한다(시험이 지킨다). */
  swatch: { light: string; dark: string };
}
export const PALETTES: readonly PaletteOption[];
export function isPaletteId(value: string): value is PaletteId;
/** <html data-palette>를 정한다. violet도 속성을 둔다(대응 블록이 없어 기본값이 보인다). */
export function applyPalette(id: PaletteId): void;
/** 저장값을 읽는다. 없거나 깨졌거나 저장소가 막히면 fallback(기본 DEFAULT_PALETTE). */
export function readPaletteChoice(key: string, fallback?: PaletteId, storage?: () => Pick<Storage, 'getItem'>): PaletteId;
/** 저장한다. 저장소가 막히면 false. */
export function savePaletteChoice(key: string, id: PaletteId, storage?: () => Pick<Storage, 'setItem'>): boolean;
```

`index.ts`에서 모두 내보낸다.

### 컴포넌트 `PalettePicker.svelte`

- props: `value: PaletteId`, `onchange: (id: PaletteId) => void`, `label = '색 테마'`(라디오 묶음의 접근 가능한 이름).
- `role="radiogroup"` + 각 항목 `button role="radio" aria-checked`. 키보드는 `Segmented`와 같다(roving tabindex, 화살표 네 방향으로 이동하며 바로 고름, 선택 항목만 탭 정지점). 접근 가능한 이름은 한국어 이름(견본은 `aria-hidden`).
- 모양: 줄바꿈 되는 격자(좁은 화면 2열, 600px 이상 5열). 각 항목 높이 최소 `var(--touch)`(44px), 둥근 견본(지름 20px, 왼쪽 반 라이트 accent·오른쪽 반 다크 accent, `--line` 테두리) + 이름. 고른 항목은 `--accent` 2px 테두리와 `--accent-soft` 배경, 나머지는 `--line` 1px 테두리. 이미 고른 항목을 누르면 `onchange`를 부르지 않는다.
- 기존 `ThemePicker`는 그대로 둔다.

### 앱 마이그레이션(2단계, 이 PR에서는 문서만)

1. 패키지를 새 minor로 올린다.
2. 앱 CSS의 `--accent --accent-soft --on-accent --snack-action` 덮어쓰기 세 블록을 지운다(앱 전용 토큰은 남긴다).
3. `index.html`의 `<html>`에 기본 팔레트를 적는다: repass `data-palette="blue"`, selah `data-palette="teal"`, gazua는 `violet`(속성 없이도 같다).
4. 마운트 전에 `applyPalette(readPaletteChoice('<앱>:palette', '<기본 id>'))`. 설정 화면에 `PalettePicker`를 두고 고르면 `savePaletteChoice` + `applyPalette`.

## 구현 계획

파일과 순서:

1. `packages/ui-svelte/src/lib/tokens.css`: 기본 세 블록 뒤(전역 기본 스타일 앞)에 「팔레트」 절 주석과 9개 팔레트(violet 제외) 블록을 위 값 그대로 넣는다. 맨 위 주석에 팔레트 절 위치를 한 줄 더한다.
2. `packages/ui-svelte/src/lib/theme.ts`: 위 API.
3. `packages/ui-svelte/src/lib/PalettePicker.svelte`, `index.ts` 내보내기.
4. 시험:
   - `test/palettes.test.ts`(node 환경) 하나: tokens.css에서 팔레트 블록을 읽는 작은 파서(시험 파일 안 함수)로 ① 구조 검사 한 `it`: violet을 뺀 9개 모두 세 블록이 있고, 세 블록의 토큰 이름 집합이 팔레트 종류별 필수 집합과 정확히 같고(강조만 바꾸는 6종은 4개, pastel·paper·night는 12개), 다크 둘의 값이 같고, `PALETTES`의 `swatch`가 블록 accent와 같고, `PALETTES` id 10개가 겹치지 않는다. ② `it.each`로 10×2 표를 돌려 대비 기준 1~6(기본 블록 `readTokenBlocks`의 light/darkFixed 위에 팔레트 블록을 겹침). 대비 계산은 `@sch0718/token-check`의 `contrast`·`composite`·`tokenValue`를 쓴다.
   - `test/theme.test.ts`에 `applyPalette`·`readPaletteChoice`·`savePaletteChoice` 사례를 기존 테마 사례와 같은 모양으로 더한다(속성 설정, 저장 왕복, 깨진 값·없는 값 → fallback, 막힌 저장소 → fallback/false).
   - `test/Components.test.ts`에 `PalettePicker` 한 묶음: 라디오 10개와 이름, 선택 항목 `aria-checked`, 선택 항목만 `tabindex="0"`, 클릭과 화살표 키(→↓ 다음, ←↑ 이전, 양 끝 순환)로 `onchange`와 포커스 이동(`document.activeElement`), 이미 고른 항목 클릭은 무시.
5. `fixtures/pnpm-ts59`(`App.svelte`, `index.ts`): 새 API·컴포넌트 import와 한 줄 사용을 더한다(호환 시험이 타입을 본다).
6. 견본 페이지: `packages/ui-svelte/examples/palettes.html`(10×2 격자, 각 칸이 iframe) + `examples/palette-frame.html`(쿼리 `palette`·`theme`를 읽어 `<html>`에 속성을 두고 `../src/lib/tokens.css`를 불러 면·글자·강조 버튼·accent-soft 배지·상태색·스낵바 모양을 보여 준다). 저장소에서 파일로 바로 열린다. 발행 파일(`files: dist`)에는 들어가지 않는다.
7. `packages/ui-svelte/README.md`: 「테마」 절 뒤에 「색 팔레트」 절(목록 표, 사용법, 앱 마이그레이션, 우선순위 한 줄, 견본 페이지 경로).
8. `.changeset/*.md`: `@sch0718/ui-svelte` minor, 한국어 한두 줄.

검증:

- `pnpm run verify`(lint, format, typecheck, svelte-check, test, build, publint, size)
- `pnpm build && pnpm compat`
- 견본 페이지는 사람이 브라우저로 본다(이 세션은 브라우저 도구를 쓰지 않는다).
