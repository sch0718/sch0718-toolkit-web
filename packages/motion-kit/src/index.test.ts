import { describe, expect, it } from 'vitest';
import { at, effects, esc, motionCss, svgDocument, text, textWidth, type Effect } from './index.js';

describe('esc', () => {
  it('&·<·>를 바꾸고 값을 문자열로 만든다', () => {
    expect(esc('a & <b>')).toBe('a &amp; &lt;b&gt;');
    expect(esc(3)).toBe('3');
  });
});

describe('at', () => {
  it('장면 시작 + offset을 소수 둘째 자리 지연으로 만든다', () => {
    expect(at(4.5)(2, 0.7)).toBe('animation-delay:9.70s');
    expect(at(3)(0)).toBe('animation-delay:0.00s');
  });
});

describe('text', () => {
  it('기본값과 이스케이프', () => {
    expect(text(1, 2, 'A&B', { fill: '#000' })).toBe(
      '<text x="1" y="2" font-size="14" font-weight="400" fill="#000" text-anchor="start">A&amp;B</text>',
    );
  });

  it('속성값의 따옴표·&·<를 바꿔 SVG가 깨지지 않게 한다', () => {
    expect(text(0, 0, 'x', { fill: 'a&b', style: 'font-family:"Noto Sans"<' })).toBe(
      '<text x="0" y="0" font-size="14" font-weight="400" fill="a&amp;b" text-anchor="start" style="font-family:&quot;Noto Sans&quot;&lt;">x</text>',
    );
  });

  it('class·style이 있을 때만 붙는다', () => {
    expect(
      text(0, 0, 'x', {
        fill: 'red',
        size: 12,
        weight: 800,
        anchor: 'middle',
        cls: 'rise',
        style: 'a:b',
      }),
    ).toBe(
      '<text x="0" y="0" font-size="12" font-weight="800" fill="red" text-anchor="middle" class="rise" style="a:b">x</text>',
    );
  });
});

describe('textWidth', () => {
  it('한글 1em, 이모지 1.2em, 그 밖 0.6em, 표시 선택자 0', () => {
    expect(textWidth('가나', 10)).toBe(20);
    expect(textWidth('ab', 10)).toBe(12);
    expect(textWidth('📍', 10)).toBe(12);
    expect(textWidth('❤️', 10)).toBe(12);
  });

  it('숫자도 글자로 잰다', () => {
    expect(textWidth(12, 10)).toBe(12);
  });
});

// 이전에 서비스마다 따로 있던 motionCss와 바이트까지 같은지 본다.
const LANDMARK_BEFORE = (sceneLength: number, scenes: number, font: string) => {
  const cycle = sceneLength * scenes;
  const p = (s: number) => `${((s / cycle) * 100).toFixed(3)}%`;
  return `
text{font-family:${font}}
.sc{opacity:0;animation:scene ${cycle}s linear infinite backwards}
.rise{transform-box:fill-box;animation:rise ${cycle}s cubic-bezier(.2,.8,.2,1) infinite backwards}
.pop{transform-box:fill-box;transform-origin:center;animation:pop ${cycle}s ease-out infinite backwards}
.draw{stroke-dasharray:1;stroke-dashoffset:1;animation:draw ${cycle}s ease-out infinite backwards}
.slide{transform-box:fill-box;animation:slide ${cycle}s cubic-bezier(.2,.8,.2,1) infinite backwards}
.pulse{transform-box:fill-box;transform-origin:center;opacity:0;animation:pulse ${cycle}s ease-out infinite backwards}
.tap{transform-box:fill-box;transform-origin:center;opacity:0;animation:tap ${cycle}s ease-out infinite backwards}
@keyframes scene{0%{opacity:0}${p(0.35)}{opacity:1}${p(sceneLength - 0.35)}{opacity:1}${p(sceneLength)}{opacity:0}100%{opacity:0}}
@keyframes rise{0%{opacity:0;transform:translateY(14px)}${p(0.45)}{opacity:1;transform:none}100%{opacity:1;transform:none}}
@keyframes pop{0%{transform:scale(0)}${p(0.3)}{transform:scale(1.15)}${p(0.45)}{transform:scale(1)}100%{transform:scale(1)}}
@keyframes draw{0%{stroke-dashoffset:1}${p(0.9)}{stroke-dashoffset:0}100%{stroke-dashoffset:0}}
@keyframes slide{0%{opacity:0;transform:translateX(-120px)}${p(0.6)}{opacity:1;transform:none}100%{opacity:1;transform:none}}
@keyframes pulse{0%{opacity:.7;transform:scale(1)}${p(0.9)}{opacity:0;transform:scale(2.4)}100%{opacity:0;transform:scale(2.4)}}
@keyframes tap{0%{opacity:0;transform:scale(.4)}${p(0.12)}{opacity:1;transform:scale(1)}${p(0.7)}{opacity:0;transform:scale(1.9)}100%{opacity:0;transform:scale(1.9)}}
@media (prefers-reduced-motion:reduce){
*{animation:none!important}
.s0{opacity:1}
.rise,.slide{opacity:1;transform:none}
.pop{transform:none}
.draw{stroke-dashoffset:0}
}`;
};

const GAZUA_BEFORE = (sceneLength: number, scenes: number, font: string) => {
  const cycle = sceneLength * scenes;
  const p = (s: number) => `${((s / cycle) * 100).toFixed(3)}%`;
  return `
text{font-family:${font}}
.sc{opacity:0;animation:scene ${cycle}s linear infinite backwards}
.rise{transform-box:fill-box;animation:rise ${cycle}s cubic-bezier(.2,.8,.2,1) infinite backwards}
.pop{transform-box:fill-box;transform-origin:center;animation:pop ${cycle}s ease-out infinite backwards}
.draw{stroke-dasharray:1;stroke-dashoffset:1;animation:draw ${cycle}s ease-out infinite backwards}
.fade{opacity:0;animation:fade ${cycle}s linear infinite backwards}
.tap{transform-box:fill-box;transform-origin:center;opacity:0;animation:tap ${cycle}s ease-out infinite backwards}
@keyframes scene{0%{opacity:0}${p(0.35)}{opacity:1}${p(sceneLength - 0.35)}{opacity:1}${p(sceneLength)}{opacity:0}100%{opacity:0}}
@keyframes rise{0%{opacity:0;transform:translateY(14px)}${p(0.45)}{opacity:1;transform:none}100%{opacity:1;transform:none}}
@keyframes pop{0%{transform:scale(0)}${p(0.3)}{transform:scale(1.15)}${p(0.45)}{transform:scale(1)}100%{transform:scale(1)}}
@keyframes draw{0%{stroke-dashoffset:1}${p(1.2)}{stroke-dashoffset:0}100%{stroke-dashoffset:0}}
@keyframes fade{0%{opacity:0}${p(0.3)}{opacity:1}100%{opacity:1}}
@keyframes tap{0%{opacity:0;transform:scale(.4)}${p(0.12)}{opacity:1;transform:scale(1)}${p(0.7)}{opacity:0;transform:scale(1.9)}100%{opacity:0;transform:scale(1.9)}}
@media (prefers-reduced-motion:reduce){
*{animation:none!important}
.s0{opacity:1}
.rise,.fade{opacity:1;transform:none}
.pop{transform:none}
.draw{stroke-dasharray:none;stroke-dashoffset:0}
}`;
};

describe('motionCss', () => {
  const font = "'Pretendard', sans-serif";

  it('랜드마크 구성은 이전 출력과 같다', () => {
    const { rise, pop, draw, slide, pulse, tap } = effects;
    const css = motionCss({
      sceneLength: 4.5,
      scenes: 4,
      font,
      effects: [rise, pop, draw({ seconds: 0.9, keepDasharray: true }), slide, pulse, tap],
    });
    expect(css).toBe(LANDMARK_BEFORE(4.5, 4, font));
  });

  it('가즈아 구성은 이전 출력과 같다', () => {
    const { rise, pop, draw, fade, tap } = effects;
    const css = motionCss({
      sceneLength: 3.2,
      scenes: 5,
      font,
      effects: [rise, pop, draw({ seconds: 1.2 }), fade, tap],
    });
    expect(css).toBe(GAZUA_BEFORE(3.2, 5, font));
  });

  it('서비스가 만든 움직임을 넣을 수 있고, 끝 모습 선언이 같으면 한 규칙으로 묶는다', () => {
    const spin: Effect = {
      name: 'spin',
      rule: (cycle) => `.spin{animation:spin ${cycle}s linear infinite}`,
      keyframes: (p) => `@keyframes spin{0%{transform:none}${p(1)}{transform:rotate(1turn)}}`,
      reduced: 'transform:none',
    };
    const css = motionCss({ sceneLength: 2, scenes: 2, font, effects: [effects.pop, spin] });
    expect(css).toContain('.spin{animation:spin 4s linear infinite}');
    expect(css).toContain('@keyframes spin{0%{transform:none}25.000%{transform:rotate(1turn)}}');
    expect(css).toContain('.pop,.spin{transform:none}');
  });

  it('움직임이 없으면 장면 규칙만 남는다', () => {
    const css = motionCss({ sceneLength: 1, scenes: 1, font, effects: [] });
    expect(css.split('\n')).toEqual([
      '',
      `text{font-family:${font}}`,
      '.sc{opacity:0;animation:scene 1s linear infinite backwards}',
      '@keyframes scene{0%{opacity:0}35.000%{opacity:1}65.000%{opacity:1}100.000%{opacity:0}100%{opacity:0}}',
      '@media (prefers-reduced-motion:reduce){',
      '*{animation:none!important}',
      '.s0{opacity:1}',
      '}',
    ]);
  });
});

describe('svgDocument', () => {
  it('CSS의 &·<를 바꿔 XML이 깨지지 않게 한다', () => {
    const svg = svgDocument({
      w: 1,
      h: 1,
      title: '',
      desc: '',
      css: "@media (width < 400px){text{font-family:'A&B'}}",
      body: '',
    });
    expect(svg).toContain("<style>@media (width &lt; 400px){text{font-family:'A&amp;B'}}</style>");
  });

  it('제목·설명을 이스케이프하고 끝에 줄바꿈을 붙인다', () => {
    expect(svgDocument({ w: 10, h: 20, title: 'A&B', desc: '<d>', css: 'x{}', body: '<g/>' })).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20" viewBox="0 0 10 20" role="img" aria-labelledby="motion-title motion-desc">
<title id="motion-title">A&amp;B</title>
<desc id="motion-desc">&lt;d&gt;</desc>
<style>x{}</style>
<g/>
</svg>
`,
    );
  });
});
