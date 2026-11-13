<script lang="ts">
  import { PALETTES, type PaletteId } from './theme.js';

  let {
    value,
    onchange,
    label = '색 테마',
  }: {
    value: PaletteId;
    onchange: (id: PaletteId) => void;
    /** 라디오 묶음의 접근 가능한 이름 */
    label?: string;
  } = $props();

  let buttons = $state<HTMLButtonElement[]>([]);

  function select(id: PaletteId) {
    if (id !== value) onchange(id);
  }

  function onkeydown(event: KeyboardEvent, index: number) {
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!direction) return;
    event.preventDefault();
    const next = (index + direction + PALETTES.length) % PALETTES.length;
    select(PALETTES[next].id);
    buttons[next]?.focus();
  }
</script>

<div class="palettes" role="radiogroup" aria-label={label}>
  {#each PALETTES as palette, index (palette.id)}
    <button
      type="button"
      role="radio"
      class:selected={palette.id === value}
      aria-checked={palette.id === value}
      tabindex={palette.id === value ? 0 : -1}
      bind:this={buttons[index]}
      onclick={() => select(palette.id)}
      onkeydown={(event) => onkeydown(event, index)}
    >
      <span
        class="swatch"
        aria-hidden="true"
        style:background="linear-gradient(to right, {palette.swatch.light} 50%, {palette.swatch.dark} 50%)"
      ></span>
      {palette.label}
    </button>
  {/each}
</div>

<style>
  .palettes {
    display: grid;
    /* 뷰포트가 아니라 놓인 자리의 폭에 맞춘다(시트 안 440px이면 3열) */
    grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
    gap: 8px;
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--touch);
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    color: var(--t1);
    font-size: 14px;
    font-weight: 700;
    text-align: left;
    word-break: keep-all;
  }
  button.selected {
    padding: 7px 11px;
    border: 2px solid var(--accent);
    background: var(--accent-soft);
  }
  .swatch {
    flex: none;
    width: 20px;
    height: 20px;
    border: 1px solid var(--line);
    border-radius: 50%;
  }
</style>
