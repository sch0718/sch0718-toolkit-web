/** 폭 구간 이름 → 최소 폭(px). 예: `{ tablet: 768, desktop: 1024 }`. 어느 구간에도 들지 않으면 `'phone'`. */
export type Breakpoints<K extends string> = Readonly<Record<K, number>>;
export type MediaWindow = { matchMedia?: (query: string) => MediaQueryList } | undefined;

const defaultWindow = (): MediaWindow => (typeof window === 'undefined' ? undefined : window);

/** 최소 폭이 큰 구간부터 본다. */
const ordered = <K extends string>(breakpoints: Breakpoints<K>) =>
  (Object.entries(breakpoints) as [K, number][]).sort((a, b) => b[1] - a[1]);

/** 폭이 속한 구간. 폭 `width` 이상인 최소 폭 중 가장 큰 구간, 없으면 `'phone'`. */
export function viewportKind<K extends string>(
  width: number,
  breakpoints: Breakpoints<K>,
): K | 'phone' {
  return ordered(breakpoints).find(([, min]) => width >= min)?.[0] ?? 'phone';
}

/**
 * 지금 폭 구간을 반응형 상태로 돌려준다. 컴포넌트 초기화 중에 부르고, 해제할 때 `destroy()`를 부른다.
 * `matchMedia`가 없으면(서버 렌더·시험) `'phone'`으로 고정된다.
 */
export function createViewport<K extends string>(
  breakpoints: Breakpoints<K>,
  win: MediaWindow = defaultWindow(),
): { readonly current: K | 'phone'; destroy(): void } {
  const queries = ordered(breakpoints).map(
    ([name, min]) => [name, win?.matchMedia?.(`(min-width: ${min}px)`)] as const,
  );
  const read = (): K | 'phone' => queries.find(([, q]) => q?.matches)?.[0] ?? 'phone';
  let current = $state<K | 'phone'>(read());
  const update = () => {
    current = read();
  };
  for (const [, q] of queries) q?.addEventListener?.('change', update);
  return {
    get current() {
      return current;
    },
    destroy() {
      for (const [, q] of queries) q?.removeEventListener?.('change', update);
    },
  };
}

/** 움직임 줄이기 설정. `matchMedia`가 없으면 `false`. */
export function prefersReducedMotion(win: MediaWindow = defaultWindow()): boolean {
  return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
