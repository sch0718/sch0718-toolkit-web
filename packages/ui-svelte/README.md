# @sch0718/ui-svelte

Svelte 5 서비스가 함께 쓰는 디자인 토큰 CSS와 컴포넌트입니다. 라이트·다크 테마를 지원합니다. `svelte`(5.57 이상)는 peer 의존성이라 서비스가 직접 설치합니다.

## 불러오는 순서

글꼴 → `@sch0718/ui-svelte/tokens.css` → 서비스 토큰 순서로 불러옵니다. 토큰 CSS는 `--font`에 글꼴 이름만 두고 글꼴 파일은 불러오지 않습니다. 글꼴 로딩은 서비스가 합니다.

`tokens.css`에는 토큰만이 아니라 전역 기본 스타일도 들어 있습니다. 리셋, 버튼·입력 요소 리셋, `:focus-visible` 외곽선, `.num`, `.sr-only`, 움직임 줄이기(`prefers-reduced-motion`)입니다.

```ts
// main.ts
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@sch0718/ui-svelte/tokens.css';
import './app.css'; // 서비스 토큰
```

## 테마

라이트는 `:root`, 다크는 시스템 설정(`prefers-color-scheme: dark`)을 따르거나 `<html data-theme="dark">`로 지정합니다. `applyTheme`으로 바꿉니다.

```ts
import { applyTheme, type ThemeChoice } from '@sch0718/ui-svelte';

applyTheme('dark'); // data-theme="dark"
applyTheme('light'); // data-theme="light"
applyTheme('system'); // data-theme을 지워 시스템 설정을 따른다
```

고른 테마는 `readThemeChoice`·`saveThemeChoice`로 `localStorage`에 둡니다. 키는 서비스가 정합니다. 저장소가 막히면 읽기는 `'system'`, 쓰기는 `false`를 돌려주므로 화면에 적용할지, 알릴지는 서비스가 정합니다. 깜빡임을 막으려면 마운트 전에 읽어 적용합니다.

```ts
// main.ts
import { applyTheme, readThemeChoice } from '@sch0718/ui-svelte';
applyTheme(readThemeChoice('myapp:theme'));
```

```svelte
<script lang="ts">
  import { applyTheme, saveThemeChoice, showSnackbar, ThemePicker, type ThemeChoice } from '@sch0718/ui-svelte';
  let { theme = $bindable<ThemeChoice>() } = $props();
  function change(choice: ThemeChoice) {
    if (!saveThemeChoice('myapp:theme', choice)) showSnackbar('테마를 저장하지 못했어요');
    theme = choice;
    applyTheme(choice);
  }
</script>

<ThemePicker value={theme} onchange={change} onSurface />
```

`ThemePicker`는 `Segmented`에 라이트 · 다크 · 시스템(`THEME_OPTIONS`)을 넣은 것입니다.

## 색 팔레트

라이트·다크·시스템 모드는 `data-theme`, 색 팔레트는 `<html data-palette="blue">`로 따로 고릅니다. 팔레트 CSS는 `tokens.css`에 포함되어 추가 import가 필요 없습니다. 속성이 없거나 `violet`이면 기존 기본값을 그대로 씁니다.

| id       | 이름   | 라이트 accent | 다크 accent |
| -------- | ------ | ------------- | ----------- |
| `violet` | 보라   | `#5b47e0`     | `#a093ff`   |
| `blue`   | 파랑   | `#2f5bd3`     | `#8fb0ff`   |
| `teal`   | 청록   | `#1d5a73`     | `#7cc4dc`   |
| `pastel` | 파스텔 | `#18181b`     | `#d9f99d`   |
| `paper`  | 종이   | `#a8391b`     | `#f0896c`   |
| `night`  | 밤     | `#5e3fe6`     | `#b3a3ff`   |
| `forest` | 숲     | `#1b7346`     | `#5fcf94`   |
| `rose`   | 장미   | `#b01e50`     | `#ff8ab0`   |
| `plum`   | 자두   | `#8c3aa6`     | `#d79cf0`   |
| `mono`   | 모노   | `#2b2f36`     | `#e4e6ea`   |

`pastel`·`paper`·`night`는 면·글자·경계까지 바꾸고, 나머지는 강조색 계열만 바꿉니다. 상태색과 앱 전용 토큰은 유지합니다. `--focus-ring`은 강조색을 따라갑니다.

깜빡임을 막으려면 마운트 전에 저장값을 읽어 적용합니다. 저장 키와 기본 팔레트는 앱이 정합니다.

```ts
// main.ts: 앱을 마운트하기 전에 적용한다.
import { applyPalette, readPaletteChoice } from '@sch0718/ui-svelte';
applyPalette(readPaletteChoice('myapp:palette', 'blue'));
```

```svelte
<script lang="ts">
  import { applyPalette, PalettePicker, readPaletteChoice, savePaletteChoice, showSnackbar, type PaletteId } from '@sch0718/ui-svelte';
  let palette = $state<PaletteId>(readPaletteChoice('myapp:palette', 'blue'));
  function changePalette(id: PaletteId) {
    if (!savePaletteChoice('myapp:palette', id)) showSnackbar('색 테마를 저장하지 못했어요');
    palette = id;
    applyPalette(id);
  }
</script>

<PalettePicker value={palette} onchange={changePalette} label="색 테마" />
```

`PalettePicker`는 라디오 10개를 그립니다. 선택 항목만 Tab으로 방문하고, 네 방향 화살표로 이동하면 바로 선택하며 양 끝에서 순환합니다. 같은 항목을 다시 누르면 `onchange`를 부르지 않습니다. 칸은 최소 112px로, 놓인 자리의 폭에 맞춰 열 수가 정해집니다.

- `PaletteId`, `PaletteOption`: 팔레트 id와 한국어 이름·라이트/다크 강조색 견본의 타입입니다.
- `PALETTES`: 위 표 순서의 목록입니다. `DEFAULT_PALETTE`는 `'violet'`입니다.
- `isPaletteId(value)`: 문자열이 팔레트 id인지 검사합니다.
- `applyPalette(id)`: `violet`을 포함해 `<html data-palette>`를 정합니다.
- `readPaletteChoice(key, fallback?, storage?)`: 저장값이 없거나 깨졌거나 저장소 접근이 막히면 `fallback`(기본 `'violet'`)을 돌려줍니다.
- `savePaletteChoice(key, id, storage?)`: 저장 성공 여부를 돌려줍니다. 저장소가 막히면 `false`입니다.

`storage`는 시험 등에서 저장소를 주입할 때 쓰는 함수이며 생략하면 `localStorage`를 씁니다.

우선순위: `violet` 외 팔레트는 선택자의 명시도로 앱의 기존 `:root`·다크 블록 강조색 덮어쓰기보다 우선하며, `violet`에는 별도 CSS 블록이 없어 앱의 덮어쓰기가 그대로 보입니다.

### 앱 마이그레이션

앱 수정은 이 패키지를 새 minor 버전으로 올린 뒤 별도로 진행합니다. 1단계(덮어쓰기 제거)는 `PalettePicker`를 붙이기 전에 합니다. 덮어쓰기가 남아 있으면 「보라」를 골랐을 때 앱 고유색이 보입니다.

1. 앱 CSS의 라이트·다크 자동·다크 지정 세 블록에서 `--accent`, `--accent-soft`, `--on-accent`, `--snack-action` 덮어쓰기를 지웁니다. 앱 전용 토큰은 남깁니다.
2. `index.html`의 `<html>`에 기본값을 둡니다. repass는 `data-palette="blue"`, selah는 `data-palette="teal"`, gazua는 `data-palette="violet"`(생략 가능)입니다.
3. 마운트 전에 `applyPalette(readPaletteChoice('<앱>:palette', '<기본 id>'))`를 부릅니다.
4. 설정 화면에 `PalettePicker`를 두고 선택값을 저장·적용합니다.

전체 라이트·다크 견본은 저장소의 [`examples/palettes.html`](./examples/palettes.html)을 파일로 바로 열면 볼 수 있습니다. 각 칸은 별도 iframe에서 면·글자·버튼·배지·상태색·스낵바를 보여 줍니다. 견본은 발행 파일에 포함되지 않습니다.

## 공용 토큰

| 종류          | 토큰                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 면·글자·경계  | `--bg`, `--surface`, `--surface2`, `--t1..3`, `--line`, `--line-strong`(누를 수 있는 테두리, 모든 면 위 3:1)              |
| 강조·상태     | `--accent`, `--accent-soft`, `--on-accent`, `--snack-action`, `--ok`·`--warn`·`--err`와 각 `-soft`, `--scrim`, `--shadow` |
| 글자 크기     | `--fs-headline`(28), `--fs-title`(17), `--fs-body`(15), `--fs-sub`(13), `--fs-label`(11), 글꼴 `--font`                   |
| 간격·크기     | `--sp-1..8`(4px 단위), `--sp-10`(40), `--sp-12`(48), `--gutter`(16, 600px 이상 24), `--touch`(44), `--bar-h`(56)          |
| 둥글기        | `--r-chip`(999), `--r-control`(12, 입력칸·아이콘 단추), `--r-card`(16), `--r-sheet`(24)                                   |
| 포커스·움직임 | `--focus-ring`(기본 `2px solid var(--accent)`, 전역 `:focus-visible`이 씀), `--ease`, `--dur-fast/base/slow`              |

대비는 시험(`test/tokens.test.ts`)이 지킵니다. 글자 토큰은 모든 면 위 4.5:1, `--accent`는 `--accent-soft`를 어느 면에 얹어도 4.5:1입니다. 상태 옅은 배경(`--ok-soft` 등)은 카드(`--surface`) 위에 두는 것을 전제로 4.5:1을 맞췄습니다. 라이트 `--bg` 위에 바로 두면 `--ok`가 4.32:1이라 AA에 모자랍니다.

포커스 링을 굵게 하려면 서비스 토큰에 `--focus-ring: 3px solid var(--accent);` 한 줄만 둡니다(테마와 무관하므로 라이트 블록에만).

## 서비스 토큰

서비스 전용 토큰은 토큰 CSS와 같은 세 블록(라이트 / 다크 자동 / 다크 지정)에 함께 넣어야 합니다. 한 블록이라도 빠지면 그 테마에서 값이 없거나 라이트 값이 남습니다. 같은 방법으로 `--accent`를 덮어써 서비스 색을 바꿉니다. 강조색을 바꾸면 `--accent-soft`, `--on-accent`, `--snack-action`도 함께 맞추고 대비(글자 4.5:1)를 확인합니다. 색 팔레트(`data-palette`, `violet` 제외)를 쓰면 이 덮어쓰기보다 팔레트가 우선합니다.

```css
/* app.css: tokens.css 다음에 불러온다 */
:root {
  --accent: #0a7d6b;
  --accent-soft: rgba(10, 125, 107, 0.1);
  --brand-up: #d92d2d;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --accent: #4fd1b8;
    --accent-soft: rgba(79, 209, 184, 0.14);
    --brand-up: #ff6b6b;
  }
}

:root[data-theme='dark'] {
  --accent: #4fd1b8;
  --accent-soft: rgba(79, 209, 184, 0.14);
  --brand-up: #ff6b6b;
}
```

## 컴포넌트

```svelte
<script lang="ts">
  import { Sheet, Segmented, Toggle } from '@sch0718/ui-svelte';
</script>
```

| 컴포넌트        | 주요 props                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Badge`         | `tone?: 'neutral' \| 'nxt' \| 'warn'`, `children`                                                                                                |
| `Banner`        | `message`, `actionLabel?`, `onaction?`, `tone?: 'info' \| 'warn' \| 'error'`, `id?`, `live?`(기본 `true`)                                        |
| `BottomNav`     | `items: NavLink[]`, `label?`(기본 `'주 메뉴'`). 셸 절                                                                                            |
| `Chip`          | `selected?`, `tone?: 'default' \| 'metric'`, `disabled?`, `onclick?`, `children`                                                                 |
| `Icon`          | `icon: IconNode`, `size?`(24), `strokeWidth?`(2), `filled?`. 아이콘 절                                                                           |
| `NavItem`       | `href`, `label`, `short?`, `icon: IconNode`, `current?`, `shape?: 'tab' \| 'rail' \| 'row'`(기본 `row`). 셸 절                                   |
| `Segmented`     | `options: { value, label, sub?, disabled?, reason? }[]`, `value`, `onchange(value)`, `label?`, `wide?`, `wrap?`, `onSurface?`(카드 안에 놓을 때) |
| `Sheet`         | `open`, `title`, `onclose()`, `children`, `returnFocus?()`, `headerEnd?`, `closeLabel?`(닫기 단추의 접근성 이름, 기본 `'닫기'`)                  |
| `Snackbar`      | `message`, `actionLabel?`, `onaction?`, `onhold?`, `onrelease?`. 보통은 직접 쓰지 않고 `SnackbarHost`가 그린다                                   |
| `SnackbarHost`  | 없음. 앱 루트에 한 번 둔다. 위치는 CSS 변수로 정한다(스낵바 절)                                                                                  |
| `PalettePicker` | `value: PaletteId`, `onchange(id)`, `label?`(기본 `'색 테마'`). 색 팔레트 절                                                                     |
| `ThemePicker`   | `value: ThemeChoice`, `onchange(choice)`, `label?`(기본 `'테마'`), `wide?`, `onSurface?`                                                         |
| `Toggle`        | `checked`, `label`, `onchange(checked)`, `disabled?`, `id?`, `describedby?`, `softDisabled?`                                                     |
| `TopBar`        | `children`, `sticky?`, `label?`. 셸 절                                                                                                           |

## 스낵바

`SnackbarHost`를 앱 루트에 한 번 두고, 어디서든 `showSnackbar(message, action?, ms?)`로 띄웁니다. 새 스낵바는 이전 것을 대체하고, `ms`(기본 5000) 뒤에 사라집니다. 포커스가 스낵바 안에 있는 동안은 타이머가 멈춥니다.

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { SnackbarHost } from '@sch0718/ui-svelte';
</script>

<main>...</main>
<SnackbarHost />
```

```ts
import { showSnackbar } from '@sch0718/ui-svelte';

showSnackbar('지웠어요', { label: '되돌리기', run: () => restore(row) });
```

위치는 CSS 변수로 정합니다. 스낵바는 화면 왼쪽·오른쪽에서 `--snack-left`·`--snack-right`만큼 뺀 영역의 가운데에 뜨고, 최대 너비도 그만큼 줄어듭니다. 변수를 주지 않으면 아래 기본값대로 뜹니다.

| 변수             | 기본값                                                                   |
| ---------------- | ------------------------------------------------------------------------ |
| `--snack-left`   | `0px`                                                                    |
| `--snack-right`  | `0px`                                                                    |
| `--snack-bottom` | 1024px 미만 `calc(96px + env(safe-area-inset-bottom, 0px))`, 이상 `32px` |

값은 `px`·`rem`·`vw`로 지정합니다. `%`와 `em`은 위치와 최대 너비의 기준이 달라 어긋납니다. `--snack-bottom`을 주면 두 화면 구간 모두 그 값을 쓰므로, 구간마다 다르게 하려면 서비스의 미디어 쿼리에서 따로 지정합니다. 기본값의 safe-area도 함께 사라지니 필요하면 직접 더합니다(예: `calc(72px + env(safe-area-inset-bottom, 0px))`).

```css
/* app.css: 768~1023px는 72px 레일, 1024px 이상은 240px 사이드바 */
@media (min-width: 768px) {
  :root {
    --snack-left: 72px;
  }
}
@media (min-width: 1024px) {
  :root {
    --snack-left: 240px;
  }
}
```

그 밖의 함수와 타입:

- `dismissSnackbar()`: 지금 스낵바를 닫습니다.
- `holdSnackbar()`, `releaseSnackbar()`: 타이머를 멈추고 남은 시간부터 다시 흐르게 합니다.
- `holdSnackbarWhileFocused(el)`: 포커스가 `el`에 머무는 동안 타이머를 멈춥니다.
- `currentSnackbar()`, `runSnackbarAction()`: 직접 호스트를 그릴 때 씁니다.
- 타입 `SnackbarAction`(`label`, `run`, `focus?`), `SnackbarItem`.

## 아이콘

`Icon`은 아이콘 모양 데이터(`IconNode`, `[태그, 속성]` 목록)를 24×24 선 아이콘으로 그립니다. 모양 데이터는 넣지 않고(런타임 의존성 0), 서비스가 [Lucide](https://github.com/lucide-icons/lucide)(GitHub 별 25.7k, 2026-11-13 확인)의 데이터 전용 패키지 `lucide`에서 가져와 넘깁니다. 랜드마크도 Lucide를 쓰므로 서비스 사이에 아이콘 모양이 맞습니다.

- `lucide`는 `sideEffects: false`라 쓰는 아이콘의 path 데이터만 번들에 들어갑니다. `@lucide/svelte`는 아이콘마다 컴포넌트 런타임이 붙어(아이콘 9개에 첫 JS gzip 약 4.5 kB, selah에서 측정) 쓰지 않습니다.
- 선 굵기는 Lucide 기본값 2, 크기는 20px(목록·단추 안) 또는 24px(탭·레일)입니다. 색은 `currentColor`로 글자색을 따릅니다.
- 장식용이라 `aria-hidden="true"`로 그립니다. 접근성 이름은 링크·단추가 맡습니다.

| props          | 설명                                             |
| -------------- | ------------------------------------------------ |
| `icon`         | `IconNode`. 예: `import { House } from 'lucide'` |
| `size?`        | px, 기본 24                                      |
| `strokeWidth?` | 기본 2                                           |
| `filled?`      | 면을 글자색으로 채움(깃발 표시 등)               |

```svelte
<script lang="ts">
  import { Settings } from 'lucide';
  import { Icon } from '@sch0718/ui-svelte';
</script>

<button type="button" aria-label="설정"><Icon icon={Settings} /></button>
```

## 셸

화면 틀의 공통 부품입니다. 레일·사이드바처럼 서비스마다 내용이 다른 틀은 서비스가 만들고 안의 항목만 `NavItem`을 씁니다.

- `TopBar`: 상단 바의 틀. 높이 `--bar-h`에 노치(위쪽 안전 영역)를 더하고 좌우 안전 영역과 `--gutter`만큼 띄웁니다. 뒤로·제목·단추 같은 내용은 `children`으로 넣습니다. `sticky`면 스크롤해도 위에 붙습니다.
- `NavItem`: 아이콘과 글자로 된 메뉴 항목. `tab`(하단 탭), `rail`(좁은 레일), `row`(사이드바 한 줄) 모양이 있습니다. 탭·레일에는 `short`를 보이고, 접근성 이름은 늘 `label`입니다. 현재 항목(`current`)은 `aria-current="page"`, 강조색·옅은 배경과 함께 막대(탭은 위, 레일·사이드바는 왼쪽)로 표시해 색만으로 구분하지 않습니다. 고대비 모드에서는 바깥선을 그립니다.
- `BottomNav`: 폰의 하단 탭(`NavItem` 탭 목록). 화면 아래에 붙고 아래쪽 안전 영역만큼 띄웁니다. 본문 아래 여백(`calc(var(--bar-h) + env(safe-area-inset-bottom, 0px))` 이상)은 서비스가 둡니다.
- 쌓임 순서: `TopBar`(sticky)와 `BottomNav`는 `z-index: var(--nav-z, 20)`입니다. 화면 전체 덮개를 더 낮은 값으로 쓰는 서비스는 `--nav-z`를 낮춥니다.

```svelte
<script lang="ts">
  import { ChevronLeft, House, Settings } from 'lucide';
  import { BottomNav, Icon, TopBar, type NavLink } from '@sch0718/ui-svelte';
  let { route }: { route: string } = $props();
  const items: NavLink[] = $derived([
    { href: '#/', label: '홈', icon: House, current: route === 'home' },
    { href: '#/settings', label: '설정', icon: Settings, current: route === 'settings' },
  ]);
</script>

<TopBar sticky>
  <a href="#/" aria-label="뒤로"><Icon icon={ChevronLeft} /></a>
  <p>제목</p>
</TopBar>
<BottomNav {items} />
```

## 폭 구간

`createViewport(breakpoints)`는 지금 폭 구간을 반응형 상태로 돌려줍니다. 구간 이름과 최소 폭은 서비스가 정하고, 어느 구간에도 들지 않으면 `'phone'`입니다. 컴포넌트 초기화 중에 부르고 해제할 때 `destroy()`를 부릅니다. `matchMedia`가 없으면(시험·서버 렌더) `'phone'`으로 고정됩니다.

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createViewport } from '@sch0718/ui-svelte';
  const viewport = createViewport({ tablet: 768, desktop: 1024 });
  onDestroy(() => viewport.destroy());
</script>

{#if viewport.current === 'phone'}<BottomTabs />{:else}<Rail />{/if}
```

- `viewportKind(width, breakpoints)`: 폭 하나를 구간 이름으로 바꿉니다(시험용).
- `prefersReducedMotion()`: 움직임 줄이기 설정을 읽습니다.

라이선스: [PolyForm Noncommercial 1.0.0](./LICENSE)
