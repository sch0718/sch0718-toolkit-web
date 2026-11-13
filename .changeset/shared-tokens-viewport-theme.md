---
'@sch0718/ui-svelte': minor
---

repass·selah가 같은 값으로 따로 두던 토큰과 장치를 공용으로 옮겼습니다.

- 토큰: `--line-strong`, `--ok-soft`·`--warn-soft`·`--err-soft`(세 블록), `--sp-1..8`·`--sp-10`·`--sp-12`, `--bar-h`, `--focus-ring`. 전역 `:focus-visible`은 `outline: var(--focus-ring)`을 씁니다(기본값이 이전과 같은 `2px solid var(--accent)`라 겉모습은 그대로입니다).
- `createViewport(breakpoints)`·`viewportKind`·`prefersReducedMotion`: 폭 구간 반응형 상태. 구간 값은 서비스가 줍니다.
- `readThemeChoice`·`saveThemeChoice`·`THEME_OPTIONS`·`isThemeChoice`와 `ThemePicker` 컴포넌트.
- 둥글기 토큰 `--r-control`(12px, 입력칸·아이콘 단추).
- `Icon` 컴포넌트와 `IconNode` 타입: Lucide 모양 데이터(`lucide` 패키지)를 그대로 받아 장식용 선 아이콘으로 그립니다.
- 셸 부품 `TopBar`(상단 바 틀, 안전 영역), `NavItem`(탭·레일·사이드바 메뉴 항목, 현재 항목을 색과 막대로 표시), `BottomNav`(폰 하단 탭)와 `NavLink` 타입. 쌓임 순서는 `--nav-z`(기본 20)로 바꿉니다.
