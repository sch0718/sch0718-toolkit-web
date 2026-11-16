<script lang="ts">
  import Sheet from '../src/lib/Sheet.svelte';

  let {
    aOpen = true,
    bOpen = false,
    title = '시트 A',
    nested = false,
    oncloseA = () => {},
    oncloseB = () => {},
  }: {
    aOpen?: boolean;
    bOpen?: boolean;
    title?: string;
    nested?: boolean;
    oncloseA?: () => void;
    oncloseB?: () => void;
  } = $props();
</script>

{#snippet bSheet()}
  <Sheet open={bOpen} title="시트 B" onclose={oncloseB}>
    <input aria-label="B 입력" />
  </Sheet>
{/snippet}

<button data-background>배경</button>
<Sheet open={aOpen} {title} onclose={oncloseA}>
  <input aria-label="A 입력" />
  {#if nested}{@render bSheet()}{/if}
</Sheet>
{#if !nested}{@render bSheet()}{/if}
