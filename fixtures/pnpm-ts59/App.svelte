<script lang="ts">
  import '@sch0718/ui-svelte/tokens.css';
  import { Banner, Sheet, SnackbarHost, Toggle } from '@sch0718/ui-svelte';

  let open = $state(true);
  let on = $state(false);
</script>

<Banner message="안내" tone="warn" />
<Toggle checked={on} label="알림" onchange={(v) => (on = v)} />
<Sheet {open} title="시트" onclose={() => (open = false)} closeLabel="Close">
  <p>본문</p>
</Sheet>
<SnackbarHost />
