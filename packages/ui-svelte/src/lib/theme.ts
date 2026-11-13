export type ThemeChoice = 'system' | 'light' | 'dark';

/** `system`이면 data-theme을 지워 prefers-color-scheme을 따른다. */
export function applyTheme(t: ThemeChoice): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

/** `storage`를 주지 않으면 `localStorage`. 접근 자체가 막힌 환경(사생활 보호 모드 등)에서는 오류가 난다. */
const defaultStorage = (): Pick<Storage, 'getItem' | 'setItem'> => globalThis.localStorage;

/**
 * 저장해 둔 테마를 읽는다. 값이 없거나 깨졌거나 저장소가 막혔으면 `'system'`.
 * `'system'`은 저장하지 않아도 같은 결과라 `'light'`·`'dark'`만 읽는다.
 */
export function readThemeChoice(
  key: string,
  storage: () => Pick<Storage, 'getItem'> = defaultStorage,
): ThemeChoice {
  try {
    const value = storage().getItem(key);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** 테마를 저장한다. 저장소가 막혀 실패하면 `false`(화면에 적용할지, 알릴지는 서비스가 정한다). */
export function saveThemeChoice(
  key: string,
  choice: ThemeChoice,
  storage: () => Pick<Storage, 'setItem'> = defaultStorage,
): boolean {
  try {
    storage().setItem(key, choice);
    return true;
  } catch {
    return false;
  }
}

/** 테마 고르기의 선택지(라이트 · 다크 · 시스템). `ThemePicker`가 쓴다. */
export const THEME_OPTIONS: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
  { value: 'system', label: '시스템' },
];

export function isThemeChoice(value: string): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

export type PaletteId =
  'violet' | 'blue' | 'teal' | 'pastel' | 'paper' | 'night' | 'forest' | 'rose' | 'plum' | 'mono';

export const DEFAULT_PALETTE: PaletteId = 'violet';

export interface PaletteOption {
  id: PaletteId;
  label: string;
  /** 고르기 견본에 쓰는 라이트·다크 accent. tokens.css 값과 같아야 한다. */
  swatch: { light: string; dark: string };
}

/** 색 팔레트의 한국어 이름과 라이트·다크 견본. */
export const PALETTES: readonly PaletteOption[] = [
  { id: 'violet', label: '보라', swatch: { light: '#5b47e0', dark: '#a093ff' } },
  { id: 'blue', label: '파랑', swatch: { light: '#2f5bd3', dark: '#8fb0ff' } },
  { id: 'teal', label: '청록', swatch: { light: '#1d5a73', dark: '#7cc4dc' } },
  { id: 'pastel', label: '파스텔', swatch: { light: '#18181b', dark: '#d9f99d' } },
  { id: 'paper', label: '종이', swatch: { light: '#a8391b', dark: '#f0896c' } },
  { id: 'night', label: '밤', swatch: { light: '#5e3fe6', dark: '#b3a3ff' } },
  { id: 'forest', label: '숲', swatch: { light: '#1b7346', dark: '#5fcf94' } },
  { id: 'rose', label: '장미', swatch: { light: '#b01e50', dark: '#ff8ab0' } },
  { id: 'plum', label: '자두', swatch: { light: '#8c3aa6', dark: '#d79cf0' } },
  { id: 'mono', label: '모노', swatch: { light: '#2b2f36', dark: '#e4e6ea' } },
];

export function isPaletteId(value: string): value is PaletteId {
  return PALETTES.some((palette) => palette.id === value);
}

/** <html data-palette>를 정한다. violet도 속성을 두고 기본 토큰을 쓴다. */
export function applyPalette(id: PaletteId): void {
  document.documentElement.setAttribute('data-palette', id);
}

/** 저장값이 없거나 깨졌거나 저장소가 막히면 지정한 대체 팔레트를 돌려준다. */
export function readPaletteChoice(
  key: string,
  fallback: PaletteId = DEFAULT_PALETTE,
  storage: () => Pick<Storage, 'getItem'> = defaultStorage,
): PaletteId {
  try {
    const value = storage().getItem(key);
    return value !== null && isPaletteId(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** 팔레트를 저장한다. 저장소가 막혀 실패하면 false. */
export function savePaletteChoice(
  key: string,
  id: PaletteId,
  storage: () => Pick<Storage, 'setItem'> = defaultStorage,
): boolean {
  try {
    storage().setItem(key, id);
    return true;
  } catch {
    return false;
  }
}
