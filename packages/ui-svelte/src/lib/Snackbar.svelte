<script lang="ts">
  let {
    message,
    actionLabel,
    onaction,
    onhold,
    onrelease,
  }: {
    message: string;
    actionLabel?: string;
    onaction?: () => void;
    /** 포커스가 스낵바 안으로 들어왔을 때(타이머 멈춤) */
    onhold?: () => void;
    /** 포커스가 스낵바 밖으로 나갔을 때(타이머 다시 흐름) */
    onrelease?: () => void;
  } = $props();

  let focused = false;
  $effect(() => () => {
    if (focused) onrelease?.();
  });

  function onfocusin() {
    focused = true;
    onhold?.();
  }

  function onfocusout(e: FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (!next || !(e.currentTarget as HTMLElement).contains(next)) {
      focused = false;
      onrelease?.();
    }
  }
</script>

<!-- 시트 안에서는 본문 뒤에 놓여 기본 Tab 순환에 함께 들어간다. -->
<div class="snack" {onfocusin} {onfocusout}>
  <span>{message}</span>
  {#if actionLabel}
    <button type="button" data-snackbar-action onclick={() => onaction?.()}>{actionLabel}</button>
  {/if}
</div>

<style>
  .snack {
    pointer-events: auto;
    background: var(--t1);
    color: var(--bg);
    border-radius: 14px;
    padding: 6px 6px 6px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    box-shadow: var(--shadow);
    /* 가용 너비가 280px보다 좁으면 min-width가 max-width를 이기지 않도록 같이 줄인다. */
    min-width: min(280px, calc(100vw - 32px - var(--snack-left, 0px) - var(--snack-right, 0px)));
    max-width: calc(100vw - 32px - var(--snack-left, 0px) - var(--snack-right, 0px));
    animation: snack-in var(--dur-base) var(--ease);
  }
  span {
    flex: 1;
  }
  button {
    color: var(--snack-action);
    font-weight: 800;
    padding: 8px 12px;
    min-height: 44px;
    min-width: 44px;
    border-radius: 10px;
  }
  @keyframes snack-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .snack {
      animation-name: snack-fade;
    }
    @keyframes snack-fade {
      from {
        opacity: 0;
      }
    }
  }
</style>
