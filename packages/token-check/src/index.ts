import chroma from 'chroma-js';

/** 한 블록의 토큰. 이름은 `--`를 뺀 것(`surface`, `sp-1`)이고 값은 앞뒤 공백을 지운 원문이다. */
export type TokenBlock = Readonly<Record<string, string>>;

/** tokens.css의 세 블록. 라이트 = 맨 위 `:root`, 다크 자동 = `prefers-color-scheme: dark` 안의 `:root:not([data-theme='light'])`, 다크 지정 = `:root[data-theme='dark']`. */
export interface TokenBlocks {
  readonly light: TokenBlock;
  readonly darkAuto: TokenBlock;
  readonly darkFixed: TokenBlock;
}

const COMMENT = /\/\*[\s\S]*?\*\//g;
const QUOTE = `['"]`;
// 맨 위 :root만 라이트다. @media 안의 :root(예: 600px 이상 --gutter)는 바로 앞 글자가 '{'라 잡히지 않는다.
const LIGHT = /(?:^|\})\s*:root\s*\{([^}]*)\}/g;
const DARK_AUTO = new RegExp(
  String.raw`@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{\s*:root:not\(\[data-theme=${QUOTE}light${QUOTE}\]\)\s*\{([^}]*)\}`,
  'g',
);
const DARK_FIXED = new RegExp(
  String.raw`(?:^|\})\s*:root\[data-theme=${QUOTE}dark${QUOTE}\]\s*\{([^}]*)\}`,
  'g',
);

function declarations(bodies: Iterable<RegExpMatchArray>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const body of bodies) {
    for (const m of (body[1] ?? '').matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      const [, name, value] = m;
      if (name !== undefined && value !== undefined) out[name] = value.trim().replace(/\s+/g, ' ');
    }
  }
  return out;
}

/**
 * tokens.css 원문에서 세 블록을 읽는다. 주석은 지운다. 같은 종류의 블록이 여럿이면 뒤의 값이 이긴다.
 * 세 블록 중 하나라도 없으면 오류를 던진다(한 블록을 빠뜨리면 그 테마에서 값이 없거나 라이트 값이 남기 때문).
 */
export function readTokenBlocks(css: string): TokenBlocks {
  const text = css.replace(COMMENT, '');
  const light = [...text.matchAll(LIGHT)];
  const darkAuto = [...text.matchAll(DARK_AUTO)];
  const darkFixed = [...text.matchAll(DARK_FIXED)];
  const found: [string, RegExpMatchArray[]][] = [
    ['라이트 :root', light],
    ["다크 자동 :root:not([data-theme='light'])", darkAuto],
    ["다크 지정 :root[data-theme='dark']", darkFixed],
  ];
  const missing = found.filter(([, list]) => list.length === 0).map(([name]) => name);
  if (missing.length) throw new Error(`토큰 블록을 찾지 못했어요: ${missing.join(', ')}`);
  return {
    light: declarations(light),
    darkAuto: declarations(darkAuto),
    darkFixed: declarations(darkFixed),
  };
}

/** 여러 파일의 블록을 불러오는 순서대로 합친다(공용 → 서비스). 뒤의 값이 이긴다. */
export function mergeTokenBlocks(...sets: TokenBlocks[]): TokenBlocks {
  return {
    light: Object.assign({}, ...sets.map((s) => s.light)),
    darkAuto: Object.assign({}, ...sets.map((s) => s.darkAuto)),
    darkFixed: Object.assign({}, ...sets.map((s) => s.darkFixed)),
  };
}

/**
 * 블록 구성 검사. 문제를 문장 목록으로 돌려준다(없으면 빈 배열).
 * - 테마 토큰(이름이 `independent`에 맞지 않는 것)은 세 블록에 모두 있어야 한다.
 * - 테마 무관 토큰은 라이트 블록에만 있어야 한다.
 * - 다크 자동과 다크 지정의 값이 같아야 한다.
 */
export function blockProblems(blocks: TokenBlocks, independent: RegExp): string[] {
  const problems: string[] = [];
  const isIndependent = (name: string) => independent.test(name);
  const themed = Object.keys(blocks.light).filter((n) => !isIndependent(n));
  for (const [label, block] of [
    ['다크 자동', blocks.darkAuto],
    ['다크 지정', blocks.darkFixed],
  ] as const) {
    for (const name of themed)
      if (!(name in block)) problems.push(`--${name}: ${label} 블록에 없어요`);
    for (const name of Object.keys(block)) {
      if (isIndependent(name))
        problems.push(`--${name}: 테마 무관 토큰인데 ${label} 블록에 있어요`);
      else if (!(name in blocks.light)) problems.push(`--${name}: 라이트 블록에 없어요`);
    }
  }
  for (const name of new Set([...Object.keys(blocks.darkAuto), ...Object.keys(blocks.darkFixed)])) {
    if (blocks.darkAuto[name] !== blocks.darkFixed[name])
      problems.push(
        `--${name}: 다크 자동(${blocks.darkAuto[name]})과 다크 지정(${blocks.darkFixed[name]}) 값이 달라요`,
      );
  }
  return problems;
}

/** 토큰 값을 읽는다. `var(--이름)`은 같은 블록에서 따라간다. 없으면 오류를 던진다. */
export function tokenValue(block: TokenBlock, name: string): string {
  const seen = new Set<string>();
  let current = name;
  for (;;) {
    if (seen.has(current)) throw new Error(`--${name}: var() 순환 참조예요`);
    seen.add(current);
    const value = block[current];
    if (value === undefined) throw new Error(`--${current} 토큰이 없어요`);
    const ref = /^var\(\s*--([\w-]+)\s*\)$/.exec(value)?.[1];
    if (ref === undefined) return value;
    current = ref;
  }
}

/** 반투명 색이면 `under`(기본 흰색) 위에 얹은 불투명 색. */
function opaque(color: string, under: chroma.Color = chroma('#ffffff')): chroma.Color {
  const c = chroma(color);
  const alpha = c.alpha();
  return alpha >= 1 ? c : chroma.mix(under, c.alpha(1), alpha, 'rgb');
}

/** 반투명 `fg`를 `bg` 위에 얹은 불투명 색(`#rrggbb`). 옅은 배경 토큰(`--accent-soft` 등)을 면 위에 놓을 때 쓴다. */
export function composite(fg: string, bg: string): string {
  return opaque(fg, opaque(bg)).hex('rgb');
}

/**
 * WCAG 2.x 대비(1~21). 반투명 `fg`는 `bg` 위에 합성해서 계산하고, 반투명 `bg`는 흰색 위에 있다고 본다.
 * 색은 CSS 색 문자열(`#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, 색 이름)이다.
 */
export function contrast(fg: string, bg: string): number {
  const back = opaque(bg);
  return chroma.contrast(opaque(fg, back), back);
}
