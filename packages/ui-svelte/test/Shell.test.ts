// @vitest-environment jsdom
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import BottomNav from '../src/lib/BottomNav.svelte';
import NavItem from '../src/lib/NavItem.svelte';
import navItemSource from '../src/lib/NavItem.svelte?raw';
import TopBar from '../src/lib/TopBar.svelte';
import topBarSource from '../src/lib/TopBar.svelte?raw';
import type { IconNode } from '../src/lib/icon.js';

const icon: IconNode = [['path', { d: 'M3 10l9-7 9 7' }]];
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('NavItem', () => {
  it('탭·레일은 짧은 글자를 보이고 접근성 이름은 전체 label이다', () => {
    render(NavItem, {
      href: '#/mock',
      label: '모의고사 보기',
      short: '모의고사',
      icon,
      shape: 'tab',
    });
    const link = screen.getByRole('link', { name: '모의고사 보기' });
    expect(link.textContent?.trim()).toBe('모의고사');
    expect(link.querySelector('svg')?.getAttribute('width')).toBe('22');
  });

  it('보이는 글자와 이름이 같으면 aria-label을 두지 않는다', () => {
    render(NavItem, { href: '#/', label: '홈', short: '짧게', icon });
    const link = screen.getByRole('link', { name: '홈' });
    expect(link.hasAttribute('aria-label')).toBe(false);
    expect(link.querySelector('svg')?.getAttribute('width')).toBe('20');
  });

  it('현재 항목은 aria-current=page이고 색 외에 막대로도 표시한다', () => {
    render(NavItem, { href: '#/', label: '홈', icon, current: true, shape: 'rail' });
    expect(screen.getByRole('link', { name: '홈' }).getAttribute('aria-current')).toBe('page');
    const css = flat(navItemSource);
    expect(css).toContain(
      ".rail[aria-current='page'], .row[aria-current='page'] { box-shadow: inset 3px 0 0 var(--accent);",
    );
    expect(css).toContain(".tab[aria-current='page']::before {");
    expect(css).toMatch(/@media \(forced-colors: active\)/);
  });
});

describe('BottomNav', () => {
  it('목록으로 탭을 그리고 현재 탭을 알린다', () => {
    render(BottomNav, {
      label: '하단 메뉴',
      items: [
        { href: '#/', label: '홈', icon, current: true },
        { href: '#/bible', label: '성경', icon },
      ],
    });
    const nav = screen.getByRole('navigation', { name: '하단 메뉴' });
    expect(nav.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByRole('link', { name: '홈' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: '성경' }).hasAttribute('aria-current')).toBe(false);
  });
});

describe('TopBar', () => {
  it('내용을 그리고 접근성 이름과 sticky를 준다', () => {
    const children = createRawSnippet(() => ({ render: () => '<p>제목</p>' }));
    render(TopBar, { children, label: '상단 바', sticky: true });
    const bar = screen.getByRole('banner', { name: '상단 바' });
    expect(bar.textContent).toContain('제목');
    expect(bar.classList.contains('sticky')).toBe(true);
  });

  it('높이는 --bar-h에 위쪽 안전 영역을 더하고, 쌓임 순서는 --nav-z로 바꿀 수 있다', () => {
    const css = flat(topBarSource);
    expect(css).toContain('min-height: calc(var(--bar-h) + env(safe-area-inset-top, 0px));');
    expect(css).toContain('z-index: var(--nav-z, 20);');
  });
});
