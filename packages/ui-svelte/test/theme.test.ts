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

import {
  applyPalette,
  DEFAULT_PALETTE,
  isPaletteId,
  PALETTES,
  readPaletteChoice,
  savePaletteChoice,
} from '../src/lib/theme.js';

afterEach(() => {
  root.removeAttribute('data-palette');
});

describe('applyPalette', () => {
  it('보라를 포함한 모든 팔레트 속성을 설정하고 모드는 유지한다', () => {
    applyTheme('dark');
    for (const palette of PALETTES) {
      applyPalette(palette.id);
      expect(root.getAttribute('data-palette')).toBe(palette.id);
      expect(root.getAttribute('data-theme')).toBe('dark');
    }
  });
});

describe('PALETTES', () => {
  it('계획 순서의 식별자와 한국어 이름을 제공한다', () => {
    expect(DEFAULT_PALETTE).toBe('violet');
    expect(PALETTES.map(({ id, label }) => [id, label])).toEqual([
      ['violet', '보라'],
      ['blue', '파랑'],
      ['teal', '청록'],
      ['pastel', '파스텔'],
      ['paper', '종이'],
      ['night', '밤'],
      ['forest', '숲'],
      ['rose', '장미'],
      ['plum', '자두'],
      ['mono', '모노'],
    ]);
    expect(PALETTES.every(({ id }) => isPaletteId(id))).toBe(true);
    expect(isPaletteId('sepia')).toBe(false);
    expect(isPaletteId('')).toBe(false);
  });
});

describe('readPaletteChoice / savePaletteChoice', () => {
  const blocked = () => {
    throw new Error('SecurityError');
  };

  it('모든 팔레트 저장값을 다시 읽는다', () => {
    for (const { id } of PALETTES) {
      expect(savePaletteChoice('app:palette', id)).toBe(true);
      expect(localStorage.getItem('app:palette')).toBe(id);
      expect(readPaletteChoice('app:palette')).toBe(id);
    }
  });

  it('값이 없거나 깨졌으면 기본 팔레트나 지정한 대체값을 읽는다', () => {
    expect(readPaletteChoice('app:palette')).toBe('violet');
    expect(readPaletteChoice('app:palette', 'blue')).toBe('blue');
    localStorage.setItem('app:palette', 'sepia');
    expect(readPaletteChoice('app:palette')).toBe('violet');
    expect(readPaletteChoice('app:palette', 'teal')).toBe('teal');
  });

  it('저장소 접근이 막히면 대체값과 false를 반환한다', () => {
    expect(readPaletteChoice('app:palette', undefined, blocked)).toBe('violet');
    expect(readPaletteChoice('app:palette', 'blue', blocked)).toBe('blue');
    expect(savePaletteChoice('app:palette', 'blue', blocked)).toBe(false);
  });

  it('저장소 메서드가 실패하면 대체값과 false를 반환한다', () => {
    const unreadable = () => ({ getItem: blocked });
    const full = () => ({ setItem: blocked });
    expect(readPaletteChoice('app:palette', 'teal', unreadable)).toBe('teal');
    expect(savePaletteChoice('app:palette', 'teal', full)).toBe(false);
  });

  it('주입한 저장소로 읽고 쓴다', () => {
    const values = new Map<string, string>();
    const storage = () => ({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    expect(savePaletteChoice('custom:palette', 'forest', storage)).toBe(true);
    expect(readPaletteChoice('custom:palette', 'violet', storage)).toBe('forest');
  });
});
