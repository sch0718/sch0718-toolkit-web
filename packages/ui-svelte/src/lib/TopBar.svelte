<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    sticky = false,
    label,
  }: {
    /** 바 안의 내용(뒤로·제목·단추 등). 가로로 놓이고 간격은 --sp-2다 */
    children: Snippet;
    /** 스크롤해도 위에 붙어 있게 한다 */
    sticky?: boolean;
    /** header의 접근성 이름 */
    label?: string;
  } = $props();
</script>

<!-- 상단 바의 틀: 높이 --bar-h, 노치·둥근 모서리 안전 영역, 면·아래 선. 내용 배치는 서비스가 한다. -->
<header class="top-bar" class:sticky aria-label={label}>
  {@render children()}
</header>

<style>
  .top-bar {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-height: calc(var(--bar-h) + env(safe-area-inset-top, 0px));
    padding: env(safe-area-inset-top, 0px) calc(var(--gutter) + env(safe-area-inset-right, 0px)) 0
      calc(var(--gutter) + env(safe-area-inset-left, 0px));
    background: var(--surface);
    color: var(--t1);
    border-bottom: 1px solid var(--line);
  }
  .sticky {
    position: sticky;
    top: 0;
    z-index: var(--nav-z, 20);
  }
</style>
