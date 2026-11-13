<script lang="ts">
  import Icon from './Icon.svelte';
  import type { NavLink } from './nav.js';

  let {
    href,
    label,
    short,
    icon,
    current = false,
    shape = 'row',
  }: NavLink & {
    /** tab: 하단 탭(아이콘 위·글자 아래, 위쪽 막대) / rail: 좁은 왼쪽 레일(왼쪽 막대) / row: 사이드바 한 줄(왼쪽 막대) */
    shape?: 'tab' | 'rail' | 'row';
  } = $props();

  const text = $derived(shape === 'row' ? label : (short ?? label));
</script>

<!-- 현재 항목은 색만이 아니라 막대 모양으로도 알린다(WCAG 1.4.1). 고대비 모드는 바깥선으로 알린다. -->
<a
  class="nav-item {shape}"
  {href}
  aria-label={text === label ? undefined : label}
  aria-current={current ? 'page' : undefined}
>
  <Icon {icon} size={shape === 'row' ? 20 : 22} />
  <span class="text">{text}</span>
</a>

<style>
  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: var(--touch);
    min-height: var(--touch);
    padding: 0 var(--sp-3);
    border-radius: var(--r-control);
    color: var(--t2);
    text-decoration: none;
    font-weight: 600;
  }
  .tab,
  .rail {
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: var(--sp-1);
    font-size: var(--fs-label);
  }
  .tab {
    flex: 1;
    position: relative;
    min-height: var(--bar-h);
  }
  .rail {
    width: 100%;
    min-height: var(--bar-h);
  }
  .text {
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: center;
  }
  .row .text {
    text-align: start;
  }
  .nav-item:hover {
    color: var(--t1);
  }
  .nav-item[aria-current='page'],
  .nav-item[aria-current='page']:hover {
    color: var(--accent);
    background: var(--accent-soft);
  }
  .rail[aria-current='page'],
  .row[aria-current='page'] {
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .tab[aria-current='page']::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: var(--sp-8);
    height: 3px;
    border-radius: 2px;
    background: var(--accent);
  }
  @media (forced-colors: active) {
    .nav-item[aria-current='page']:not(:focus-visible) {
      outline: 3px solid Highlight;
      outline-offset: -3px;
    }
  }
</style>
