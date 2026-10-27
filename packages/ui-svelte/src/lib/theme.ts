export type ThemeChoice = 'system' | 'light' | 'dark';

/** `system`이면 data-theme을 지워 prefers-color-scheme을 따른다. */
export function applyTheme(t: ThemeChoice): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}
