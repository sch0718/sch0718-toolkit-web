<script lang="ts">
  import NavItem from './NavItem.svelte';
  import type { NavLink } from './nav.js';

  let { items, label = '주 메뉴' }: { items: NavLink[]; label?: string } = $props();
</script>

<!-- 폰의 하단 탭. 화면 아래에 붙고 기기 안전 영역만큼 띄운다. 본문은 아래 여백(--bar-h + 안전 영역)을 서비스가 둔다. -->
<nav class="bottom-nav" aria-label={label}>
  <ul>
    {#each items as item (item.href)}
      <li><NavItem shape="tab" {...item} /></li>
    {/each}
  </ul>
</nav>

<style>
  .bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: var(--nav-z, 20);
    padding: 0 env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px)
      env(safe-area-inset-left, 0px);
    background: var(--surface);
    border-top: 1px solid var(--line);
  }
  ul {
    display: flex;
    min-height: var(--bar-h);
    margin: 0;
    padding: 0 var(--gutter);
    list-style: none;
  }
  li {
    flex: 1;
    display: flex;
    min-width: 0;
  }
</style>
