// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/lib/tokens.css', import.meta.url), 'utf8');

const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('tokens.css', () => {
  const light = block(':root');
  const darkAuto = block(":root:not([data-theme='light'])");
  const darkSet = block(":root[data-theme='dark']");

  it('라이트와 두 다크 블록의 토큰 이름이 같다', () => {
    const names = (b: string) => [...b.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]);
    const themed = names(light).filter(
      (n) => !/^--(font|fs-|r-|gutter|touch|ease|dur-)/.test(n ?? ''),
    );
    expect(names(darkAuto).sort()).toEqual(themed.sort());
    expect(names(darkSet).sort()).toEqual(themed.sort());
  });

  it('시스템 다크와 data-theme=dark의 값이 같다', () => {
    const values = (b: string) =>
      Object.fromEntries(
        [...b.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [
          m[1],
          m[2]?.trim(),
        ]),
      );
    expect(values(darkAuto)).toEqual(values(darkSet));
  });

  it('글꼴 파일을 불러오지 않는다(서비스 몫)', () => {
    expect(css).not.toContain('@import');
  });

  describe('대비(WCAG AA)', () => {
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const lum = (hex: string) => {
      const [r = 0, g = 0, b = 0] = rgb(hex)
        .map((v) => v / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi = 0, lo = 0] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const token = (b: string, name: string) => {
      const m = b.match(new RegExp(`--${name}: (#[0-9a-f]{6})`));
      if (!m?.[1]) throw new Error(`no --${name}`);
      return m[1];
    };
    const over = (color: string, alpha: number, under: string) =>
      '#' +
      rgb(color)
        .map((c, i) =>
          Math.round(c * alpha + (rgb(under)[i] ?? 0) * (1 - alpha))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    const SURFACES = ['bg', 'surface', 'surface2'];
    const THEMES: [string, string][] = [
      ['light', light],
      ['dark (system)', darkAuto],
      ['dark (data-theme)', darkSet],
    ];

    it.each(THEMES)('%s: 글자 토큰은 모든 면 위 4.5:1 이상', (_, b) => {
      for (const bg of SURFACES) {
        for (const fg of ['t2', 't3', 'ok', 'warn', 'err', 'accent']) {
          expect(ratio(token(b, fg), token(b, bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it('카드 안 세그먼트: 라이트는 트랙 --surface2·선택 --surface, 다크는 트랙 --bg·선택 --surface2', () => {
      const v = (b: string, name: string) =>
        b.match(new RegExp(`--${name}: ([^;]+);`))?.[1]?.trim();
      expect([v(light, 'seg-card-track'), v(light, 'seg-card-on')]).toEqual([
        'var(--surface2)',
        'var(--surface)',
      ]);
      for (const d of [darkAuto, darkSet]) {
        expect([v(d, 'seg-card-track'), v(d, 'seg-card-on')]).toEqual([
          'var(--bg)',
          'var(--surface2)',
        ]);
      }
      expect(ratio(token(light, 'surface'), token(light, 'surface2'))).toBeGreaterThan(1.1);
      expect(ratio(token(darkSet, 'surface2'), token(darkSet, 'bg'))).toBeGreaterThan(1.15);
    });

    it.each(THEMES)('%s: 토글(비텍스트 3:1)', (_, b) => {
      expect(ratio(token(b, 'on-accent'), token(b, 'accent'))).toBeGreaterThanOrEqual(3);
      expect(ratio('#ffffff', token(b, 't3'))).toBeGreaterThanOrEqual(3);
      for (const bg of SURFACES)
        expect(ratio(token(b, 't3'), token(b, bg)), bg).toBeGreaterThanOrEqual(3);
    });

    it.each([
      ['light', light, 0.1],
      ['dark', darkSet, 0.14],
    ] as const)('%s: 강조색 글자는 자기 옅은 배경(accent-soft) 위 4.5:1 이상', (_, b, alpha) => {
      for (const bg of SURFACES) {
        expect(
          ratio(token(b, 'accent'), over(token(b, 'accent'), alpha, token(b, bg))),
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});
