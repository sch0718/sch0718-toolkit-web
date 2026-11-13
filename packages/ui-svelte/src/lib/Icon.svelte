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

  const escape = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  // <svelte:element> 대신 문자열로 그린다. 동적 요소 런타임이 빠져 첫 JS가 gzip 약 1.8 kB 작다(selah 측정).
  // 태그 이름은 영문자·숫자·하이픈만 받는다. 속성 값은 따옴표·꺾쇠를 이스케이프한다.
  const body = $derived(
    icon
      .filter(([tag]) => /^[a-z][a-z0-9-]*$/i.test(tag))
      .map(([tag, attrs]) => {
        const list = Object.entries(attrs)
          .filter(([name, v]) => v !== undefined && /^[a-z][a-z0-9-]*$/i.test(name))
          .map(([name, v]) => ` ${name}="${escape(String(v))}"`)
          .join('');
        return `<${tag}${list}/>`;
      })
      .join(''),
  );
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
  {@html body}
</svg>

<style>
  .icon {
    flex: none;
    display: block;
  }
</style>
