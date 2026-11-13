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
