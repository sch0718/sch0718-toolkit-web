<script lang="ts">
  import Snackbar from './Snackbar.svelte';
  import { currentSnackbar, holdSnackbar, releaseSnackbar, runSnackbarAction } from './snackbarStore.svelte.js';

  const item = $derived(currentSnackbar());
</script>

<!-- 라이브 영역은 항상 존재해야 내용이 바뀔 때 스크린리더가 읽는다. -->
<div class="host" role="status" aria-live="polite">
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
