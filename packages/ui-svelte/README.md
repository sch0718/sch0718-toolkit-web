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

## 서비스 토큰

서비스 전용 토큰은 토큰 CSS와 같은 세 블록(라이트 / 다크 자동 / 다크 지정)에 함께 넣어야 합니다. 한 블록이라도 빠지면 그 테마에서 값이 없거나 라이트 값이 남습니다. 같은 방법으로 `--accent`를 덮어써 서비스 색을 바꿉니다. 강조색을 바꾸면 `--accent-soft`, `--on-accent`, `--snack-action`도 함께 맞추고 대비(글자 4.5:1)를 확인합니다.

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

| 컴포넌트       | 주요 props                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Badge`        | `tone?: 'neutral' \| 'nxt' \| 'warn'`, `children`                                                                                                |
| `Banner`       | `message`, `actionLabel?`, `onaction?`, `tone?: 'info' \| 'warn' \| 'error'`, `id?`, `live?`(기본 `true`)                                        |
| `Chip`         | `selected?`, `tone?: 'default' \| 'metric'`, `disabled?`, `onclick?`, `children`                                                                 |
| `Segmented`    | `options: { value, label, sub?, disabled?, reason? }[]`, `value`, `onchange(value)`, `label?`, `wide?`, `wrap?`, `onSurface?`(카드 안에 놓을 때) |
| `Sheet`        | `open`, `title`, `onclose()`, `children`, `returnFocus?()`, `headerEnd?`, `closeLabel?`(닫기 단추의 접근성 이름, 기본 `'닫기'`)                  |
| `Snackbar`     | `message`, `actionLabel?`, `onaction?`, `onhold?`, `onrelease?`. 보통은 직접 쓰지 않고 `SnackbarHost`가 그린다                                   |
| `SnackbarHost` | 없음. 앱 루트에 한 번 둔다. 위치는 CSS 변수로 정한다(스낵바 절)                                                                                  |
| `Toggle`       | `checked`, `label`, `onchange(checked)`, `disabled?`, `id?`, `describedby?`, `softDisabled?`                                                     |

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

라이선스: [PolyForm Noncommercial 1.0.0](./LICENSE)
