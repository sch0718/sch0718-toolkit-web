// @vitest-environment node
import { describe, expect, it } from 'vitest';
import snackSource from '../src/lib/Snackbar.svelte?raw';
import sheetSource from '../src/lib/Sheet.svelte?raw';
import hostSource from '../src/lib/SnackbarHost.svelte?raw';
import tokensCss from '../src/lib/tokens.css?raw';

function style(source: string): string {
  const css = /<style>([\s\S]*?)<\/style>/.exec(source)?.[1];
  if (css === undefined) throw new Error('<style> 블록이 없습니다.');
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// jsdom은 var()를 풀지 않으므로 소스 CSS에서 괄호 짝을 세어 중첩 fallback까지 읽습니다.
function resolve(css: string, vars: Record<string, string>): string {
  let result = '';
  let cursor = 0;
  let start = css.indexOf('var(', cursor);
  while (start !== -1) {
    let end = start + 4;
    let depth = 1;
    let comma = -1;
    for (; end < css.length && depth > 0; end++) {
      const char = css[end];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 1 && comma === -1) comma = end;
    }
    if (depth !== 0) throw new Error('var()의 닫는 괄호가 없습니다.');
    const name = css.slice(start + 4, comma === -1 ? end - 1 : comma).trim();
    const fallback =
      comma === -1 ? css.slice(start, end) : resolve(css.slice(comma + 1, end - 1).trim(), vars);
    result += css.slice(cursor, start) + (vars[name] ?? fallback);
    cursor = end;
    start = css.indexOf('var(', cursor);
  }
  return result + css.slice(cursor);
}

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

const hostCss = style(hostSource);
const snackCss = style(snackSource);

describe('Snackbar 위치', () => {
  it('변수가 없으면 기존 위치와 최대 너비를 유지한다', () => {
    const host = resolve(hostCss, {});
    const base = block(host, '.host');
    // 기존 left: 0, right: 0과 0px는 같은 길이입니다.
    expect(base).toContain('left: 0px;');
    expect(base).toContain('right: 0px;');
    expect(base).toContain('bottom: calc(96px + env(safe-area-inset-bottom, 0px));');
    expect(block(host, '@media (min-width: 1024px)')).toMatch(/\.host\s*\{\s*bottom: 32px;/);
    expect(block(resolve(snackCss, {}), '.snack')).toContain(
      'max-width: calc(100vw - 32px - 0px - 0px);',
    );
  });

  it('지정한 위치를 두 화면 구간과 최대 너비에 반영한다', () => {
    const vars = { '--snack-left': '240px', '--snack-bottom': '24px' };
    const host = resolve(hostCss, vars);
    const base = block(host, '.host');
    expect(base).toContain('left: 240px;');
    expect(base).toContain('right: 0px;');
    expect(base).toContain('bottom: 24px;');
    expect(block(host, '@media (min-width: 1024px)')).toMatch(/\.host\s*\{\s*bottom: 24px;/);
    expect(block(resolve(snackCss, vars), '.snack')).toContain(
      'max-width: calc(100vw - 32px - 240px - 0px);',
    );
  });

  it('오른쪽 여백도 위치와 최대 너비에 반영한다', () => {
    const vars = { '--snack-right': '16px' };
    expect(block(resolve(hostCss, vars), '.host')).toContain('right: 16px;');
    expect(block(resolve(snackCss, vars), '.snack')).toContain(
      'max-width: calc(100vw - 32px - 0px - 16px);',
    );
  });

  it('위치 기본값은 컴포넌트에만 두고 Sheet 위의 z-index를 유지한다', () => {
    expect(hostCss).toContain('left: var(--snack-left, 0px);');
    expect(hostCss).toContain('right: var(--snack-right, 0px);');
    expect(hostCss).toContain(
      'bottom: var(--snack-bottom, calc(96px + env(safe-area-inset-bottom, 0px)));',
    );
    expect(block(hostCss, '@media (min-width: 1024px)')).toContain(
      'bottom: var(--snack-bottom, 32px);',
    );
    expect(block(snackCss, '.snack')).toContain(
      'max-width: calc(100vw - 32px - var(--snack-left, 0px) - var(--snack-right, 0px));',
    );
    expect(tokensCss).not.toMatch(/--snack-(?:left|right|bottom)\s*:/);
    const z = (css: string, selector: string) =>
      Number(/z-index:\s*(\d+);/.exec(block(css, selector))?.[1]);
    expect(z(hostCss, '.host')).toBe(85);
    expect(z(hostCss, '.host')).toBeGreaterThan(z(style(sheetSource), '.root'));
  });
});
