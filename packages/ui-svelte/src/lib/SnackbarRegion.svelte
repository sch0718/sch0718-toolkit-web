<script lang="ts">
  import Snackbar from './Snackbar.svelte';
  import {
    claimSnackbar,
    currentSnackbar,
    holdSnackbar,
    releaseSnackbar,
    runSnackbarAction,
    snackbarClaimedElsewhere,
  } from './snackbarStore.svelte.js';

  let { hidden = false }: { hidden?: boolean } = $props();
  // 숨김(aria-hidden, 시트 배경의 inert)이 풀린 그 순간 내용을 넣으면 화면 읽기 프로그램에는 「내용을 가진 채 새로
  // 나타난 영역」으로 보여 읽히지 않는다(시트를 닫으며 알림을 띄우는 흐름). 한 프레임 뒤에 넣는다.
  let shown = $state(!hidden);
  $effect(() => {
    if (hidden) {
      shown = false;
      return;
    }
    if (shown) return;
    const frame = requestAnimationFrame(() => (shown = true));
    return () => cancelAnimationFrame(frame);
  });
  const item = $derived(shown ? currentSnackbar() : null);
  // 같은 알림을 다시 그리면(숨겼다 드러냄, 다른 영역) 새 소유자로 본다. derived라 표시 중에는 판정이 바뀌지 않는다.
  const owner = $derived(item ? {} : null);
  const announced = $derived(item && owner ? !snackbarClaimedElsewhere(item.id, owner) : false);
  // 한 프레임 이상 라이브 영역에 머문 뒤에야 「알렸다」고 기록한다. 그 전에 사라지면(시트를 닫으며 알림을 띄움)
  // 다음 영역이 라이브 영역에 넣어 알린다.
  $effect(() => {
    if (!item || !owner || !announced) return;
    const id = item.id;
    const frame = requestAnimationFrame(() => claimSnackbar(id, owner));
    return () => cancelAnimationFrame(frame);
  });
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

<!-- 라이브 영역은 비어 있어도 남긴다. 다른 영역에서 이미 알린 같은 알림은 라이브 영역 밖(둘째 .host)에 그린다.
     숨긴 동안(시트가 열려 맨 위 시트가 대신 그림)은 aria-hidden이라 상태 영역이 둘로 보이지 않는다. -->
<div class="host" role="status" aria-live="polite" aria-hidden={hidden ? 'true' : undefined}>
  {#if announced}{@render content()}{/if}
</div>
<div class="host">{#if !announced}{@render content()}{/if}</div>

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
