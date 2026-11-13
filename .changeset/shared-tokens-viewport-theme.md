---
'@sch0718/ui-svelte': minor
---

repass·selah가 같은 값으로 따로 두던 토큰과 장치를 공용으로 옮겼습니다.

- 토큰: `--line-strong`, `--ok-soft`·`--warn-soft`·`--err-soft`(세 블록), `--sp-1..8`·`--sp-10`·`--sp-12`, `--bar-h`, `--focus-ring`. 전역 `:focus-visible`은 `outline: var(--focus-ring)`을 씁니다(기본값이 이전과 같은 `2px solid var(--accent)`라 겉모습은 그대로입니다).
- `createViewport(breakpoints)`·`viewportKind`·`prefersReducedMotion`: 폭 구간 반응형 상태. 구간 값은 서비스가 줍니다.
- `readThemeChoice`·`saveThemeChoice`·`THEME_OPTIONS`·`isThemeChoice`와 `ThemePicker` 컴포넌트.
