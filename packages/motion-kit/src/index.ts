// README·도움말의 움직이는 그림(애니메이션 SVG)을 만드는 빌드 스크립트용 기반 함수.
// GitHub는 SVG를 <img>로 보여 주므로 스크립트·웹 글꼴 없이 CSS 애니메이션만 쓴다.
// 색·글꼴·장면 모양은 서비스가 정한다. 여기에는 문자열을 만드는 도구만 둔다.

type Coord = number | string;

export const esc = (s: unknown): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 큰따옴표로 감싼 속성값용. `esc`에 더해 `"`도 바꾼다. */
const escAttr = (s: unknown): string => esc(s).replace(/"/g, '&quot;');

/** 장면 길이 `sceneLength`초를 받아, 장면 `scene`(0부터)이 시작하고 `offset`초 뒤에 움직이게 하는 style 값을 만든다. */
export const at =
  (sceneLength: number) =>
  (scene: number, offset = 0): string =>
    `animation-delay:${(scene * sceneLength + offset).toFixed(2)}s`;

export interface TextOptions {
  fill: string;
  size?: number;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
  cls?: string;
  style?: string;
}

/** `<text>` 한 줄. `value`와 속성값은 이스케이프한다. */
export function text(
  x: Coord,
  y: Coord,
  value: unknown,
  { size = 14, weight = 400, fill, anchor = 'start', cls = '', style = '' }: TextOptions,
): string {
  const extra = `${cls ? ` class="${escAttr(cls)}"` : ''}${style ? ` style="${escAttr(style)}"` : ''}`;
  return `<text x="${escAttr(x)}" y="${escAttr(y)}" font-size="${size}" font-weight="${weight}" fill="${escAttr(fill)}" text-anchor="${escAttr(anchor)}"${extra}>${esc(value)}</text>`;
}

/** 글자 폭 근사(한글 1em, 이모지 1.2em, 그 밖 0.6em, 이모지 표시 선택자 0). */
export function textWidth(label: unknown, size: number): number {
  let w = 0;
  for (const ch of String(label)) {
    if (/\p{Extended_Pictographic}/u.test(ch)) w += size * 1.2;
    else if (/[ㄱ-힝]/u.test(ch)) w += size;
    else if (ch !== '️') w += size * 0.6;
  }
  return Math.round(w);
}

/**
 * `motionCss`에 넣는 움직임 하나. 요소에 `class="<name>"`을 주면 그 장면 차례에 움직인다.
 * 서비스가 직접 만들어 넣어도 된다.
 */
export interface Effect {
  name: string;
  /** 클래스 규칙. `cycle`은 한 바퀴 길이(초). */
  rule(cycle: number): string;
  /** `@keyframes`. `p(초)`는 한 바퀴 중 그 시점의 백분율. */
  keyframes(p: (seconds: number) => string): string;
  /** 움직임 줄이기 설정에서 끝 모습으로 보여 줄 선언. 없으면 애니메이션만 멈춘다. 같은 선언끼리 한 규칙으로 묶는다. */
  reduced?: string;
}

const SETTLED = 'opacity:1;transform:none';

export interface DrawOptions {
  /** 선이 다 그려지기까지의 시간(초). */
  seconds: number;
  /**
   * 움직임 줄이기 설정에서 `stroke-dasharray`를 그대로 둔다. 기본값 `false`는 `none`으로 풀어서
   * `pathLength="1"`이 없는 선도 실선으로 보이게 한다. 이전 출력과 바이트까지 맞춰야 할 때만 켠다.
   */
  keepDasharray?: boolean;
}

/** 기본 움직임들. 넣은 순서대로 CSS에 적힌다. */
export const effects = {
  /** 아래에서 떠오르며 나타난다. */
  rise: {
    name: 'rise',
    rule: (cycle) =>
      `.rise{transform-box:fill-box;animation:rise ${cycle}s cubic-bezier(.2,.8,.2,1) infinite backwards}`,
    keyframes: (p) =>
      `@keyframes rise{0%{opacity:0;transform:translateY(14px)}${p(0.45)}{opacity:1;transform:none}100%{opacity:1;transform:none}}`,
    reduced: SETTLED,
  },
  /** 커졌다가 제 크기로 돌아온다. */
  pop: {
    name: 'pop',
    rule: (cycle) =>
      `.pop{transform-box:fill-box;transform-origin:center;animation:pop ${cycle}s ease-out infinite backwards}`,
    keyframes: (p) =>
      `@keyframes pop{0%{transform:scale(0)}${p(0.3)}{transform:scale(1.15)}${p(0.45)}{transform:scale(1)}100%{transform:scale(1)}}`,
    reduced: 'transform:none',
  },
  /** 선이 처음부터 끝까지 그려진다. 경로에 `pathLength="1"`을 준다. */
  draw: ({ seconds, keepDasharray = false }: DrawOptions): Effect => ({
    name: 'draw',
    rule: (cycle) =>
      `.draw{stroke-dasharray:1;stroke-dashoffset:1;animation:draw ${cycle}s ease-out infinite backwards}`,
    keyframes: (p) =>
      `@keyframes draw{0%{stroke-dashoffset:1}${p(seconds)}{stroke-dashoffset:0}100%{stroke-dashoffset:0}}`,
    reduced: keepDasharray ? 'stroke-dashoffset:0' : 'stroke-dasharray:none;stroke-dashoffset:0',
  }),
  /** 왼쪽에서 밀려 들어온다. */
  slide: {
    name: 'slide',
    rule: (cycle) =>
      `.slide{transform-box:fill-box;animation:slide ${cycle}s cubic-bezier(.2,.8,.2,1) infinite backwards}`,
    keyframes: (p) =>
      `@keyframes slide{0%{opacity:0;transform:translateX(-120px)}${p(0.6)}{opacity:1;transform:none}100%{opacity:1;transform:none}}`,
    reduced: SETTLED,
  },
  /** 퍼지며 사라지는 물결. 움직임 줄이기 설정에서는 보이지 않는다. */
  pulse: {
    name: 'pulse',
    rule: (cycle) =>
      `.pulse{transform-box:fill-box;transform-origin:center;opacity:0;animation:pulse ${cycle}s ease-out infinite backwards}`,
    keyframes: (p) =>
      `@keyframes pulse{0%{opacity:.7;transform:scale(1)}${p(0.9)}{opacity:0;transform:scale(2.4)}100%{opacity:0;transform:scale(2.4)}}`,
  },
  /** 제자리에서 나타난다. */
  fade: {
    name: 'fade',
    rule: (cycle) => `.fade{opacity:0;animation:fade ${cycle}s linear infinite backwards}`,
    keyframes: (p) => `@keyframes fade{0%{opacity:0}${p(0.3)}{opacity:1}100%{opacity:1}}`,
    reduced: SETTLED,
  },
  /** 누르는 곳을 알리는 동그라미. 움직임 줄이기 설정에서는 보이지 않는다. */
  tap: {
    name: 'tap',
    rule: (cycle) =>
      `.tap{transform-box:fill-box;transform-origin:center;opacity:0;animation:tap ${cycle}s ease-out infinite backwards}`,
    keyframes: (p) =>
      `@keyframes tap{0%{opacity:0;transform:scale(.4)}${p(0.12)}{opacity:1;transform:scale(1)}${p(0.7)}{opacity:0;transform:scale(1.9)}100%{opacity:0;transform:scale(1.9)}}`,
  },
} satisfies Record<string, Effect | ((options: DrawOptions) => Effect)>;

export interface MotionCssOptions {
  /** 장면 하나의 길이(초). */
  sceneLength: number;
  /** 장면 수. */
  scenes: number;
  /** `text`에 쓸 `font-family` 값. */
  font: string;
  /** 쓸 움직임. 예: `[effects.rise, effects.pop, effects.draw({ seconds: 0.9 })]` */
  effects: readonly Effect[];
}

/**
 * 애니메이션 CSS. 각 장면의 요소는 `at(sceneLength)(scene, offset)`으로 늦춘다.
 * 모든 움직임은 한 바퀴(`cycle`) 동안 한 번 일어나고, 장면 그룹(`.sc`)이 자기 차례에만 보인다.
 * 움직임 줄이기 설정에서는 첫 장면(`.s0`)만 끝 모습으로 보인다.
 */
export function motionCss({ sceneLength, scenes, font, effects: list }: MotionCssOptions): string {
  const cycle = sceneLength * scenes;
  const p = (s: number) => `${((s / cycle) * 100).toFixed(3)}%`;
  const reduced = new Map<string, string[]>();
  for (const e of list) {
    if (e.reduced) reduced.set(e.reduced, [...(reduced.get(e.reduced) ?? []), `.${e.name}`]);
  }
  const lines = [
    `text{font-family:${font}}`,
    `.sc{opacity:0;animation:scene ${cycle}s linear infinite backwards}`,
    ...list.map((e) => e.rule(cycle)),
    `@keyframes scene{0%{opacity:0}${p(0.35)}{opacity:1}${p(sceneLength - 0.35)}{opacity:1}${p(sceneLength)}{opacity:0}100%{opacity:0}}`,
    ...list.map((e) => e.keyframes(p)),
    '@media (prefers-reduced-motion:reduce){',
    '*{animation:none!important}',
    '.s0{opacity:1}',
    ...[...reduced].map(([decl, selectors]) => `${selectors.join(',')}{${decl}}`),
    '}',
  ];
  return `\n${lines.join('\n')}`;
}

export interface SvgDocumentOptions {
  w: Coord;
  h: Coord;
  /** 화면 읽기 도구가 읽는 제목. */
  title: string;
  /** 화면 읽기 도구가 읽는 설명. */
  desc: string;
  css: string;
  body: string;
}

/**
 * 크기·제목·설명·CSS·본문으로 SVG 문서 하나를 만든다. 끝에 줄바꿈이 붙는다.
 * CSS의 `&`·`<`는 XML이 깨지지 않게 바꾼다. `body`는 SVG 조각 그대로 넣는다.
 */
export function svgDocument({ w, h, title, desc, css, body }: SvgDocumentOptions): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="motion-title motion-desc">
<title id="motion-title">${esc(title)}</title>
<desc id="motion-desc">${esc(desc)}</desc>
<style>${css.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</style>
${body}
</svg>
`;
}
