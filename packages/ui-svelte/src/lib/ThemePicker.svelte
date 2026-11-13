<script lang="ts">
  import Segmented from './Segmented.svelte';
  import { isThemeChoice, THEME_OPTIONS, type ThemeChoice } from './theme.js';

  let {
    value,
    onchange,
    label = '테마',
    wide = false,
    onSurface = false,
  }: {
    value: ThemeChoice;
    onchange: (choice: ThemeChoice) => void;
    /** 라디오 묶음의 접근성 이름 */
    label?: string;
    wide?: boolean;
    onSurface?: boolean;
  } = $props();

  const options = THEME_OPTIONS.map((o) => ({ ...o }));
</script>

<Segmented
  {label}
  {options}
  {value}
  {wide}
  {onSurface}
  onchange={(v) => {
    if (isThemeChoice(v)) onchange(v);
  }}
/>
