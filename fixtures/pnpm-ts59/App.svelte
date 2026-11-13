<script lang="ts">
  import '@sch0718/ui-svelte/tokens.css';
  import {
    Banner,
    BottomNav,
    Icon,
    NavItem,
    PalettePicker,
    Sheet,
    SnackbarHost,
    ThemePicker,
    Toggle,
    TopBar,
    type IconNode,
    type NavLink,
    type PaletteId,
    type ThemeChoice,
  } from '@sch0718/ui-svelte';
  const house: IconNode = [['path', { d: 'M3 10l9-7 9 7' }]];
  const items: NavLink[] = [{ href: '#/', label: '홈', short: '홈', icon: house, current: true }];

  let open = $state(true);
  let on = $state(false);
  let theme = $state<ThemeChoice>('system');
  let palette = $state<PaletteId>('violet');
</script>

<Banner message="안내" tone="warn" />
<Toggle checked={on} label="알림" onchange={(v) => (on = v)} />
<Sheet {open} title="시트" onclose={() => (open = false)} closeLabel="Close">
  <p>본문</p>
</Sheet>
<ThemePicker value={theme} onchange={(t) => (theme = t)} label="화면 테마" onSurface />
<Icon icon={house} size={20} />
<TopBar sticky label="상단 바"><p>제목</p></TopBar>
<NavItem href="#/" label="홈" icon={house} shape="rail" />
<BottomNav {items} />
<SnackbarHost />

<PalettePicker value={palette} onchange={(id) => (palette = id)} />
