// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme } from '../src/lib/theme.js';

const root = document.documentElement;

afterEach(() => {
  root.removeAttribute('data-theme');
});

describe('applyTheme', () => {
  it('sets data-theme for light and dark', () => {
    applyTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
  });
  it('removes data-theme for system', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});
