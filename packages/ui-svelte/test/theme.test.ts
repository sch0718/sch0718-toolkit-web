// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyTheme,
  isThemeChoice,
  readThemeChoice,
  saveThemeChoice,
  THEME_OPTIONS,
} from '../src/lib/theme.js';

const root = document.documentElement;

afterEach(() => {
  root.removeAttribute('data-theme');
  localStorage.clear();
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

describe('readThemeChoice / saveThemeChoice', () => {
  const blocked = () => {
    throw new Error('SecurityError');
  };

  it('저장한 값을 다시 읽는다', () => {
    expect(saveThemeChoice('app:theme', 'dark')).toBe(true);
    expect(localStorage.getItem('app:theme')).toBe('dark');
    expect(readThemeChoice('app:theme')).toBe('dark');
  });

  it('값이 없거나 깨졌으면 system', () => {
    expect(readThemeChoice('app:theme')).toBe('system');
    localStorage.setItem('app:theme', 'sepia');
    expect(readThemeChoice('app:theme')).toBe('system');
  });

  it('저장소가 막히면 읽기는 system, 쓰기는 false', () => {
    expect(readThemeChoice('app:theme', blocked)).toBe('system');
    expect(saveThemeChoice('app:theme', 'light', blocked)).toBe(false);
    const full = () => ({
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(saveThemeChoice('app:theme', 'light', full)).toBe(false);
  });
});

describe('THEME_OPTIONS', () => {
  it('라이트 · 다크 · 시스템 순서이고 모두 ThemeChoice다', () => {
    expect(THEME_OPTIONS.map((o) => o.label)).toEqual(['라이트', '다크', '시스템']);
    expect(THEME_OPTIONS.every((o) => isThemeChoice(o.value))).toBe(true);
    expect(isThemeChoice('sepia')).toBe(false);
  });
});
