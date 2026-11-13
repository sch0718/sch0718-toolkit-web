<script lang="ts">
  import '@sch0718/ui-svelte/tokens.css';
  import { Banner, Sheet, SnackbarHost, ThemePicker, Toggle, type ThemeChoice } from '@sch0718/ui-svelte';

  let open = $state(true);
  let on = $state(false);
  let theme = $state<ThemeChoice>('system');
</script>

<Banner message="안내" tone="warn" />
<Toggle checked={on} label="알림" onchange={(v) => (on = v)} />
<Sheet {open} title="시트" onclose={() => (open = false)} closeLabel="Close">
  <p>본문</p>
</Sheet>
<ThemePicker value={theme} onchange={(t) => (theme = t)} label="화면 테마" onSurface />
<SnackbarHost />
