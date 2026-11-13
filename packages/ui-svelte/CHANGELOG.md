# @sch0718/ui-svelte

## 0.3.0

### Minor Changes

- [#36](https://github.com/sch0718/sch0718-toolkit-web/pull/36) [`d1d7c6d`](https://github.com/sch0718/sch0718-toolkit-web/commit/d1d7c6d314412b1415e4c13cc59a7495c6029098) Thanks [@sch0718](https://github.com/sch0718)! - 라이트·다크 모드와 따로 고르는 색 팔레트 10종과 저장·적용 API, 키보드로 고를 수 있는 PalettePicker를 더했습니다.
  팔레트별 대비 시험과 파일로 여는 견본 페이지, 앱 마이그레이션 안내를 추가했습니다.

## 0.2.0

### Minor Changes

- [#34](https://github.com/sch0718/sch0718-toolkit-web/pull/34) [`4cb04ef`](https://github.com/sch0718/sch0718-toolkit-web/commit/4cb04ef66a22ef47ffa0a99d52f7193fe321599b) Thanks [@sch0718](https://github.com/sch0718)! - repass·selah가 같은 값으로 따로 두던 토큰과 장치를 공용으로 옮겼습니다.
  
  - 토큰: `--line-strong`, `--ok-soft`·`--warn-soft`·`--err-soft`(세 블록), `--sp-1..8`·`--sp-10`·`--sp-12`, `--bar-h`, `--focus-ring`. 전역 `:focus-visible`은 `outline: var(--focus-ring)`을 씁니다(기본값이 이전과 같은 `2px solid var(--accent)`라 겉모습은 그대로입니다).
  - `createViewport(breakpoints)`·`viewportKind`·`prefersReducedMotion`: 폭 구간 반응형 상태. 구간 값은 서비스가 줍니다.
  - `readThemeChoice`·`saveThemeChoice`·`THEME_OPTIONS`·`isThemeChoice`와 `ThemePicker` 컴포넌트.
  - 둥글기 토큰 `--r-control`(12px, 입력칸·아이콘 단추).
  - `Icon` 컴포넌트와 `IconNode` 타입: Lucide 모양 데이터(`lucide` 패키지)를 그대로 받아 장식용 선 아이콘으로 그립니다.
  - 셸 부품 `TopBar`(상단 바 틀, 안전 영역), `NavItem`(탭·레일·사이드바 메뉴 항목, 현재 항목을 색과 막대로 표시), `BottomNav`(폰 하단 탭)와 `NavLink` 타입. 쌓임 순서는 `--nav-z`(기본 20)로 바꿉니다.

## 0.1.1

### Patch Changes

- [#21](https://github.com/sch0718/sch0718-toolkit-web/pull/21) [`10d09ac`](https://github.com/sch0718/sch0718-toolkit-web/commit/10d09ac2a6b78b076865e60d1e3172226fabac8d) Thanks [@sch0718](https://github.com/sch0718)! - 스낵바 위치를 `--snack-left`·`--snack-right`·`--snack-bottom` CSS 변수로 정할 수 있습니다(주지 않으면 지금과 같은 위치).

## 0.1.0

### Minor Changes

- [#12](https://github.com/sch0718/sch0718-toolkit-web/pull/12) [`2c44f23`](https://github.com/sch0718/sch0718-toolkit-web/commit/2c44f23707358a7d1e819bb9ac8027163066d73c) Thanks [@sch0718](https://github.com/sch0718)! - 첫 버전. 가즈아의 범용 디자인 토큰(`tokens.css`)과 Svelte 5 컴포넌트(Badge, Banner, Chip, Segmented, Sheet, Snackbar, SnackbarHost, Toggle), `applyTheme`을 옮겼다. Sheet에 `closeLabel` prop을 더했다.
