// @vitest-environment node
import { readFileSync } from 'node:fs';
import {
  blockProblems,
  composite,
  contrast,
  readTokenBlocks,
  tokenValue,
  type TokenBlock,
} from '@sch0718/token-check';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/lib/tokens.css', import.meta.url), 'utf8');
const blocks = readTokenBlocks(css);
const { light, darkAuto, darkFixed } = blocks;
const INDEPENDENT = /^(font|fs-|r-|gutter|touch|ease|dur-|sp-|bar-h|focus-ring)/;

describe('tokens.css', () => {
  it('테마 토큰은 세 블록에 모두 있고, 두 다크 블록의 값이 같다', () => {
    expect(blockProblems(blocks, INDEPENDENT)).toEqual([]);
  });

  it('글꼴 파일을 불러오지 않는다(서비스 몫)', () => {
    expect(css).not.toContain('@import');
  });

  it('간격은 4px 단위, 포커스 링은 --focus-ring 하나로 그린다', () => {
    expect(
      ['1', '2', '3', '4', '5', '6', '7', '8', '10', '12'].map((n) => light[`sp-${n}`]),
    ).toEqual(['4px', '8px', '12px', '16px', '20px', '24px', '28px', '32px', '40px', '48px']);
    expect(light['focus-ring']).toBe('2px solid var(--accent)');
    expect(css).toMatch(/\[tabindex\]:focus-visible \{\s*outline: var\(--focus-ring\);/);
  });

  describe('대비(WCAG AA)', () => {
    const SURFACES = ['bg', 'surface', 'surface2'];
    const THEMES: [string, TokenBlock][] = [
      ['light', light],
      ['dark (system)', darkAuto],
      ['dark (data-theme)', darkFixed],
    ];
    const c = (b: TokenBlock, name: string) => tokenValue(b, name);

    it.each(THEMES)('%s: 글자 토큰은 모든 면 위 4.5:1 이상', (_, b) => {
      for (const bg of SURFACES)
        for (const fg of ['t1', 't2', 't3', 'ok', 'warn', 'err', 'accent'])
          expect(contrast(c(b, fg), c(b, bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    });

    it('카드 안 세그먼트: 라이트는 트랙 --surface2·선택 --surface, 다크는 트랙 --bg·선택 --surface2', () => {
      expect([light['seg-card-track'], light['seg-card-on']]).toEqual([
        'var(--surface2)',
        'var(--surface)',
      ]);
      for (const d of [darkAuto, darkFixed])
        expect([d['seg-card-track'], d['seg-card-on']]).toEqual(['var(--bg)', 'var(--surface2)']);
      expect(contrast(c(light, 'seg-card-on'), c(light, 'seg-card-track'))).toBeGreaterThan(1.1);
      expect(contrast(c(darkFixed, 'seg-card-on'), c(darkFixed, 'seg-card-track'))).toBeGreaterThan(
        1.15,
      );
    });

    it.each(THEMES)('%s: 토글·누를 수 있는 테두리(비텍스트 3:1)', (_, b) => {
      expect(contrast(c(b, 'on-accent'), c(b, 'accent'))).toBeGreaterThanOrEqual(3);
      expect(contrast('#ffffff', c(b, 't3'))).toBeGreaterThanOrEqual(3);
      for (const bg of SURFACES) {
        expect(contrast(c(b, 't3'), c(b, bg)), `t3 on ${bg}`).toBeGreaterThanOrEqual(3);
        expect(
          contrast(c(b, 'line-strong'), c(b, bg)),
          `line-strong on ${bg}`,
        ).toBeGreaterThanOrEqual(3);
      }
    });

    it.each(THEMES)(
      '%s: 강조색 글자는 옅은 배경(accent-soft)을 어느 면에 얹어도 4.5:1 이상',
      (_, b) => {
        for (const bg of SURFACES) {
          const soft = composite(c(b, 'accent-soft'), c(b, bg));
          expect(contrast(c(b, 'accent'), soft), `accent-soft over ${bg}`).toBeGreaterThanOrEqual(
            4.5,
          );
        }
      },
    );

    // 상태 옅은 배경은 카드(--surface) 위에 두는 것을 전제로 맞췄다. 라이트 --bg 위의 --ok-soft는 4.32:1이라 AA에 모자란다(README).
    it.each(THEMES)('%s: 상태 글자는 --surface 위 자기 옅은 배경(-soft)에서 4.5:1 이상', (_, b) => {
      for (const tone of ['ok', 'warn', 'err']) {
        const soft = composite(c(b, `${tone}-soft`), c(b, 'surface'));
        expect(contrast(c(b, tone), soft), `${tone} on ${tone}-soft`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});
