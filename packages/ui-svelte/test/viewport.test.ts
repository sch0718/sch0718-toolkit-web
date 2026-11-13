// @vitest-environment jsdom
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import {
  createViewport,
  prefersReducedMotion,
  viewportKind,
  type MediaWindow,
} from '../src/lib/viewport.svelte.js';

const BP = { tablet: 768, desktop: 1024 } as const;

/** 폭을 바꿀 수 있는 가짜 matchMedia. `(min-width: Npx)`와 움직임 줄이기만 이해한다. */
function fakeWindow(width: number, reduced = false) {
  const lists: { min: number; matches: boolean; listeners: Set<() => void> }[] = [];
  const win = {
    matchMedia(query: string) {
      if (query.includes('prefers-reduced-motion')) return { matches: reduced } as MediaQueryList;
      const min = Number(/min-width: (\d+)px/.exec(query)?.[1]);
      const list = { min, matches: width >= min, listeners: new Set<() => void>() };
      lists.push(list);
      return {
        get matches() {
          return list.matches;
        },
        addEventListener: (_: string, fn: () => void) => list.listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => list.listeners.delete(fn),
      } as unknown as MediaQueryList;
    },
  };
  const resize = (next: number) => {
    for (const l of lists) {
      const was = l.matches;
      l.matches = next >= l.min;
      if (was !== l.matches) for (const fn of l.listeners) fn();
    }
  };
  const listenerCount = () => lists.reduce((n, l) => n + l.listeners.size, 0);
  return { win: win as MediaWindow, resize, listenerCount };
}

describe('viewportKind', () => {
  it('폭이 넘는 가장 큰 구간, 없으면 phone', () => {
    expect(viewportKind(375, BP)).toBe('phone');
    expect(viewportKind(768, BP)).toBe('tablet');
    expect(viewportKind(1023, BP)).toBe('tablet');
    expect(viewportKind(1440, BP)).toBe('desktop');
    expect(viewportKind(900, { tablet: 768 })).toBe('tablet');
  });
});

describe('createViewport', () => {
  it('폭이 바뀌면 따라가고, destroy하면 구독을 푼다', () => {
    const { win, resize, listenerCount } = fakeWindow(375);
    const viewport = createViewport(BP, win);
    expect(viewport.current).toBe('phone');
    resize(800);
    flushSync();
    expect(viewport.current).toBe('tablet');
    resize(1200);
    flushSync();
    expect(viewport.current).toBe('desktop');
    expect(listenerCount()).toBe(2);
    viewport.destroy();
    expect(listenerCount()).toBe(0);
  });

  it('matchMedia가 없으면 phone으로 고정', () => {
    expect(createViewport(BP, undefined).current).toBe('phone');
    expect(createViewport(BP, {}).current).toBe('phone');
  });
});

describe('prefersReducedMotion', () => {
  it('설정을 읽고, matchMedia가 없으면 false', () => {
    expect(prefersReducedMotion(fakeWindow(375, true).win)).toBe(true);
    expect(prefersReducedMotion(fakeWindow(375, false).win)).toBe(false);
    expect(prefersReducedMotion(undefined)).toBe(false);
  });
});
