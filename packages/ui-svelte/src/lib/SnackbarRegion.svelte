<script lang="ts">
  import Snackbar from './Snackbar.svelte';
  import { claimSnackbar, currentSnackbar, holdSnackbar, releaseSnackbar, runSnackbarAction } from './snackbarStore.svelte.js';

  let { hidden = false, inSheet = false }: { hidden?: boolean; inSheet?: boolean } = $props();
  const item = $derived(hidden ? null : currentSnackbar());
  // 숨겼다 다시 그리면 같은 영역이라도 새 소유자로 본다. derived가 표시 중의 판정을 유지한다.
  const announced = $derived(item ? claimSnackbar(item.id, {}) : false);
</script>

{#snippet content()}
  {#if item}
    {#key item.id}
      <Snackbar
        message={item.message}
        actionLabel={item.action?.label}
        onaction={runSnackbarAction}
        onhold={holdSnackbar}
        onrelease={releaseSnackbar}
      />
    {/key}
  {/if}
{/snippet}

<div class="host">
  <!-- 라이브 영역은 비어 있어도 남기고, 영역을 옮긴 같은 알림은 바깥 형제에 그린다. -->
  <div role={inSheet ? undefined : 'status'} aria-live="polite" aria-atomic={inSheet ? 'true' : undefined}>
    {#if announced}{@render content()}{/if}
  </div>
  <div>{#if !announced}{@render content()}{/if}</div>
</div>

<style>
  /* 위치 변수의 기본값: --snack-left와 --snack-right는 0px입니다.
     --snack-bottom은 1024px 미만 calc(96px + env(safe-area-inset-bottom, 0px)), 이상 32px입니다. */
  .host {
    position: fixed;
    left: var(--snack-left, 0px);
    right: var(--snack-right, 0px);
    bottom: var(--snack-bottom, calc(96px + env(safe-area-inset-bottom, 0px)));
    display: flex;
    justify-content: center;
    z-index: 85;
    pointer-events: none;
  }
  @media (min-width: 1024px) {
    .host {
      bottom: var(--snack-bottom, 32px);
    }
  }
</style>
