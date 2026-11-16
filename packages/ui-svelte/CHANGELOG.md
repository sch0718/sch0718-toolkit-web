# @sch0718/ui-svelte

## 0.4.0

### Minor Changes

- [#42](https://github.com/sch0718/sch0718-toolkit-web/pull/42) [`f88bb89`](https://github.com/sch0718/sch0718-toolkit-web/commit/f88bb89ed61f0ed9267c3f5a6cd51847c0a86a6f) Thanks [@sch0718](https://github.com/sch0718)! - 새 패키지 `@sch0718/app-update`: 배포 뒤 새 버전을 알아채 접속 직후면 자동으로 새로고침하고 쓰는 중이면 안내만 하는 `watchAppUpdate`, 안 본 릴리스 내용을 고르는 `takeUnseenReleases`. `@sch0718/ui-svelte`에 도움말용 `ReleaseNotes` 컴포넌트를 더했습니다.

## 0.3.1

### Patch Changes

- [#40](https://github.com/sch0718/sch0718-toolkit-web/pull/40) [`94d03bb`](https://github.com/sch0718/sch0718-toolkit-web/commit/94d03bb3730487a7452b7385debd37d49b5bad5c) Thanks [@sch0718](https://github.com/sch0718)! - Sheet: 한글 등 IME 조합 중의 Esc(`isComposing`, keyCode 229)로는 시트를 닫지 않습니다. 닫을 때 내려가는(데스크톱은 작아지는) 애니메이션이 끝난 뒤 DOM에서 내리고, 그동안은 `inert`·`aria-hidden`이라 누를 수 없고 접근성 트리에서도 빠집니다. 끌다 놓으면 제자리로 미끄러져 돌아가고, 80px에 못 미쳐도 빠르게 튕겨 내리면(0.5px/ms 이상, 20px 이상) 닫습니다. 움직임 줄이기 설정에서는 페이드만 씁니다.

- [#40](https://github.com/sch0718/sch0718-toolkit-web/pull/40) [`94d03bb`](https://github.com/sch0718/sch0718-toolkit-web/commit/94d03bb3730487a7452b7385debd37d49b5bad5c) Thanks [@sch0718](https://github.com/sch0718)! - Sheet: 시트가 열린 동안 맨 위 시트 밖을 `inert`로 만들어, 배경의 클릭·포커스·화면 읽기를 막습니다(TalkBack·Chromium에서 시트 밖으로 빠지던 문제). 여러 시트를 겹쳐 열면 맨 위 시트만 모달이고 키(Esc·Tab)를 받으며, 아래 시트부터 닫아도 스크롤 잠금이 맞게 풀립니다.
  
  - `role="dialog"`·`aria-modal`이 `.sheet`에서 시트 전체를 덮는 `.root`로 옮겨졌습니다. 닫히는 동안에는 이 역할을 떼고 `inert`·`aria-hidden`만 둡니다. 닫힘 애니메이션이 돌지 않는 환경(jsdom 등)에서는 기다리지 않고 바로 내립니다.
  - 스낵바(되돌리기 포함)는 시트가 열린 동안 맨 위 시트 안에서 같은 자리에 그립니다. 그동안 바깥 `SnackbarHost`는 비우고 `aria-hidden`으로 둡니다. 「되돌리기」는 시트의 마지막 Tab 위치입니다. `SnackbarHost`가 없는 앱은 시트 안에도 알림 영역을 두지 않습니다.
  - 같은 알림을 시트와 호스트 사이로 옮겨 그려도 다시 읽지 않고, 시트를 닫으며 띄운 알림도 읽히도록 드러난 다음 프레임에 넣습니다. 포커스로 멈춘 스낵바 타이머는 스낵바가 사라지면 남은 시간부터 다시 흐릅니다.

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
