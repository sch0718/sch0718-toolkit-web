// @vitest-environment node
import { readFileSync } from 'node:fs';
import {
  composite,
  contrast,
  readTokenBlocks,
  tokenValue,
  type TokenBlock,
} from '@sch0718/token-check';
import { describe, expect, it } from 'vitest';
import { PALETTES } from '../src/lib/theme.js';

const css = readFileSync(new URL('../src/lib/tokens.css', import.meta.url), 'utf8');
const base = readTokenBlocks(css);
type Mode = 'light' | 'darkAuto' | 'darkFixed';

/** 팔레트 선택자만 읽고, 자동 다크는 미디어 쿼리 안에 있는지도 확인한다. */
function readPalettes(text: string) {
  const blocks: { id: string; mode: Mode; tokens: TokenBlock }[] = [];
  const pattern =
    /(?:(@media\s*\(prefers-color-scheme:\s*dark\))\s*\{\s*)?:root\[data-palette='([^']+)'\]([^{}]*)\{([^}]*)\}/g;
  for (const match of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(pattern)) {
    const [, media, id, suffix, body] = match;
    if (id === undefined || body === undefined) throw new Error('팔레트 블록이 비었어요');
    let mode: Mode;
    if (media && suffix?.trim() === ":not([data-theme='light'])") mode = 'darkAuto';
    else if (!media && suffix?.trim() === "[data-theme='dark']") mode = 'darkFixed';
    else if (!media && suffix?.trim() === '') mode = 'light';
    else throw new Error(`팔레트 선택자가 잘못됐어요: ${id}${suffix}`);
    const tokens: Record<string, string> = {};
    for (const declaration of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      const [, name, value] = declaration;
      if (name !== undefined && value !== undefined) tokens[name] = value.trim();
    }
    blocks.push({ id, mode, tokens });
  }
  return blocks;
}

const blocks = readPalettes(css);
const accentTokens = ['accent', 'accent-soft', 'on-accent', 'snack-action'];
const surfaceTokens = ['bg', 'surface', 'surface2', 'line', 'line-strong', 't1', 't2', 't3'];
const surfaces = ['bg', 'surface', 'surface2'];
const ids = [
  'violet',
  'blue',
  'teal',
  'pastel',
  'paper',
  'night',
  'forest',
  'rose',
  'plum',
  'mono',
];

describe('색 팔레트', () => {
  it('10종의 순서·견본과 9종의 세 블록·토큰 집합·다크 값이 맞다', () => {
    expect(PALETTES?.map((palette) => palette.id)).toEqual(ids);
    expect(new Set(PALETTES.map((palette) => palette.id)).size).toBe(10);
    expect(blocks).toHaveLength(27);
    expect(blocks.some((block) => block.id === 'violet')).toBe(false);
    for (const palette of PALETTES) {
      if (palette.id === 'violet') {
        expect(palette.swatch).toEqual({
          light: base.light['accent'],
          dark: base.darkFixed['accent'],
        });
        continue;
      }
      const own = blocks.filter((block) => block.id === palette.id);
      expect(own.map((block) => block.mode).sort(), palette.id).toEqual([
        'darkAuto',
        'darkFixed',
        'light',
      ]);
      const required = ['pastel', 'paper', 'night'].includes(palette.id)
        ? [...accentTokens, ...surfaceTokens]
        : accentTokens;
      for (const block of own)
        expect(Object.keys(block.tokens).sort(), `${palette.id} ${block.mode}`).toEqual(
          [...required].sort(),
        );
      const light = own.find((block) => block.mode === 'light')?.tokens;
      const dark = own.find((block) => block.mode === 'darkFixed')?.tokens;
      expect(own.find((block) => block.mode === 'darkAuto')?.tokens).toEqual(dark);
      expect(palette.swatch).toEqual({ light: light?.['accent'], dark: dark?.['accent'] });
    }
  });

  it.each(ids.flatMap((id) => ['light', 'darkFixed'].map((mode) => [id, mode] as const)))(
    '%s %s: 글자·강조·테두리·상태·스낵바 대비를 지킨다',
    (id, mode) => {
      const tokens: TokenBlock = {
        ...(mode === 'light' ? base.light : base.darkFixed),
        ...blocks.find((block) => block.id === id && block.mode === mode)?.tokens,
      };
      const c = (name: string) => tokenValue(tokens, name);
      for (const surface of surfaces) {
        for (const text of ['t1', 't2', 't3', 'ok', 'warn', 'err', 'accent'])
          expect(contrast(c(text), c(surface)), `${text} on ${surface}`).toBeGreaterThanOrEqual(
            4.5,
          );
        expect(
          contrast(c('accent'), composite(c('accent-soft'), c(surface))),
          `accent-soft over ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
        for (const control of ['t3', 'line-strong'])
          expect(
            contrast(c(control), c(surface)),
            `${control} on ${surface}`,
          ).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(c('on-accent'), c('accent')), '강조 버튼 글자').toBeGreaterThanOrEqual(4.5);
      expect(contrast('#ffffff', c('t3')), '토글 손잡이').toBeGreaterThanOrEqual(3);
      for (const tone of ['ok', 'warn', 'err'])
        expect(
          contrast(c(tone), composite(c(`${tone}-soft`), c('surface'))),
          `${tone} on ${tone}-soft`,
        ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c('snack-action'), c('t1')), '스낵바 동작').toBeGreaterThanOrEqual(4.5);
    },
  );
});
