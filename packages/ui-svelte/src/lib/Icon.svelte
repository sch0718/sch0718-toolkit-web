<script lang="ts">
  import type { IconNode } from './icon.js';

  let {
    icon,
    size = 24,
    strokeWidth = 2,
    filled = false,
  }: {
    /** 모양 데이터. 예: `import { House } from 'lucide'` */
    icon: IconNode;
    /** px. 목록·단추 안 20, 탭·레일 24 */
    size?: number;
    strokeWidth?: number;
    /** 면을 글자색으로 채운다(깃발 표시 등) */
    filled?: boolean;
  } = $props();
</script>

<!-- 장식용이다. 접근성 이름은 아이콘을 감싼 링크·단추가 맡는다. -->
<svg
  class="icon"
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#each icon as [tag, attrs], i (i)}
    <svelte:element this={tag} {...attrs} />
  {/each}
</svg>

<style>
  .icon {
    flex: none;
    display: block;
  }
</style>
