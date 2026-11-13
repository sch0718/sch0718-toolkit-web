import { describe, expect, it } from 'vitest';
import {
  blockProblems,
  composite,
  contrast,
  mergeTokenBlocks,
  readTokenBlocks,
  tokenValue,
} from './index.js';

const CSS = `
/* 주석 :root { --ghost: red; } */
:root {
  --bg: #f6f7f9;
  --surface: #ffffff;
  --track: var(--surface);
  --font:
    'Pretendard', sans-serif;
  --sp-1: 4px;
}
@media (min-width: 600px) {
  :root { --gutter: 24px; }
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #0e0f11;
    --surface: #17181b;
    --track: var(--bg);
  }
}
:root[data-theme="dark"] {
  --bg: #0e0f11;
  --surface: #17181b;
  --track: var(--bg);
}
:root.other { --bg: #000000; }
`;

describe('readTokenBlocks', () => {
  const blocks = readTokenBlocks(CSS);

  it('맨 위 :root만 라이트로 읽고, 주석과 다른 @media·클래스 블록은 뺀다', () => {
    expect(blocks.light).toEqual({
      bg: '#f6f7f9',
      surface: '#ffffff',
      track: 'var(--surface)',
      font: "'Pretendard', sans-serif",
      'sp-1': '4px',
    });
  });

  it('다크 두 블록을 읽는다(작은따옴표·큰따옴표 모두)', () => {
    expect(blocks.darkAuto).toEqual({ bg: '#0e0f11', surface: '#17181b', track: 'var(--bg)' });
    expect(blocks.darkFixed).toEqual(blocks.darkAuto);
  });

  it('블록이 빠지면 무엇이 없는지 알려 준다', () => {
    expect(() => readTokenBlocks(':root { --bg: #fff; }')).toThrow(/다크 자동.*다크 지정/);
  });
});

describe('mergeTokenBlocks', () => {
  it('뒤의 값이 이긴다', () => {
    const app = readTokenBlocks(`
      :root { --surface: #fafafa; --accent: #2f5bd3; }
      @media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { --accent: #8fb0ff; } }
      :root[data-theme='dark'] { --accent: #8fb0ff; }`);
    const merged = mergeTokenBlocks(readTokenBlocks(CSS), app);
    expect(merged.light['surface']).toBe('#fafafa');
    expect(merged.light['bg']).toBe('#f6f7f9');
    expect(merged.darkFixed['accent']).toBe('#8fb0ff');
  });
});

describe('blockProblems', () => {
  it('구성이 맞으면 빈 배열', () => {
    expect(blockProblems(readTokenBlocks(CSS), /^(font|sp-\d+)$/)).toEqual([]);
  });

  it('빠진 테마 토큰, 다크에 있는 테마 무관 토큰, 다른 다크 값을 찾는다', () => {
    const problems = blockProblems(
      readTokenBlocks(`
        :root { --bg: #fff; --line: #ddd; --sp-1: 4px; }
        @media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { --bg: #000; --sp-1: 4px; } }
        :root[data-theme='dark'] { --bg: #111; --line: #333; }`),
      /^sp-\d+$/,
    );
    expect(problems).toEqual([
      '--line: 다크 자동 블록에 없어요',
      '--sp-1: 테마 무관 토큰인데 다크 자동 블록에 있어요',
      '--bg: 다크 자동(#000)과 다크 지정(#111) 값이 달라요',
      '--sp-1: 다크 자동(4px)과 다크 지정(undefined) 값이 달라요',
      '--line: 다크 자동(undefined)과 다크 지정(#333) 값이 달라요',
    ]);
  });
});

describe('tokenValue', () => {
  const { light, darkAuto } = readTokenBlocks(CSS);
  it('var()를 따라간다', () => {
    expect(tokenValue(light, 'track')).toBe('#ffffff');
    expect(tokenValue(darkAuto, 'track')).toBe('#0e0f11');
  });
  it('없거나 순환이면 오류', () => {
    expect(() => tokenValue(light, 'nope')).toThrow('--nope 토큰이 없어요');
    expect(() => tokenValue({ a: 'var(--b)', b: 'var(--a)' }, 'a')).toThrow(/순환/);
  });
});

/** WCAG 2.x 정의대로 직접 계산한 값(대조용). */
function reference(fg: [number, number, number], bg: [number, number, number]): number {
  const lum = (rgb: [number, number, number]) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('contrast', () => {
  it('검정·흰색은 21:1, 같은 색은 1:1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrast('#fff', 'white')).toBeCloseTo(1, 6);
  });

  it('WCAG 정의로 직접 계산한 값과 같다', () => {
    const pairs: [string, [number, number, number], string, [number, number, number]][] = [
      ['#676d77', [0x67, 0x6d, 0x77], '#f0f1f4', [0xf0, 0xf1, 0xf4]],
      ['#5b47e0', [0x5b, 0x47, 0xe0], '#ffffff', [255, 255, 255]],
      ['#a093ff', [0xa0, 0x93, 0xff], '#17181b', [0x17, 0x18, 0x1b]],
      ['rgb(212, 32, 47)', [212, 32, 47], '#f0f1f4', [0xf0, 0xf1, 0xf4]],
    ];
    for (const [fg, fgRgb, bg, bgRgb] of pairs)
      expect(contrast(fg, bg), `${fg}/${bg}`).toBeCloseTo(reference(fgRgb, bgRgb), 6);
  });

  it('반투명 글자는 배경 위에 합성하고, 반투명 배경은 흰색 위에 있다고 본다', () => {
    // rgba(0,0,0,0.5)를 흰색 위에 얹으면 127.5
    expect(contrast('rgba(0, 0, 0, 0.5)', '#ffffff')).toBeCloseTo(
      reference([127.5, 127.5, 127.5], [255, 255, 255]),
      6,
    );
    expect(contrast('#000000', 'rgba(0, 0, 0, 0.5)')).toBeCloseTo(
      reference([0, 0, 0], [127.5, 127.5, 127.5]),
      6,
    );
  });
});

describe('composite', () => {
  it('옅은 배경을 면 위에 얹은 불투명 색', () => {
    expect(composite('rgba(47, 91, 211, 0.1)', '#ffffff')).toBe('#eaeffb');
    expect(composite('#123456', '#ffffff')).toBe('#123456');
  });
});
