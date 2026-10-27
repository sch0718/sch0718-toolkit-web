# @sch0718/motion-kit

README·도움말에 넣는 움직이는 그림(애니메이션 SVG)을 만드는 **빌드 스크립트용** 기반 함수입니다. GitHub는 SVG를 `<img>`로 보여 주므로 스크립트·웹 글꼴 없이 CSS 애니메이션만 씁니다. 런타임 의존성이 없습니다.

```js
import { at, effects, motionCss, svgDocument, text, textWidth } from '@sch0718/motion-kit';

const SCENE = 4.5;
const delay = at(SCENE); // delay(장면, 초) → 'animation-delay:…s'
const { rise, pop, draw, tap } = effects;

const label = '지도에 표시';
const svg = svgDocument({
  w: 400,
  h: 120,
  title: '지도 소개',
  desc: '장소를 고르면 지도에 표시됩니다.',
  css: motionCss({
    sceneLength: SCENE,
    scenes: 2,
    font: "Pretendard, 'Apple SD Gothic Neo', sans-serif",
    effects: [rise, pop, draw({ seconds: 1.2 }), tap],
  }),
  body: `<g class="sc s0">${text(20, 40, label, { fill: '#222', size: 16, cls: 'rise', style: delay(0, 0.2) })}</g>
<g class="sc s1" style="${delay(1)}"><rect x="20" y="60" width="${textWidth(label, 16) + 20}" height="30"/></g>`,
});
```

- **쓰는 곳:** 서비스의 Node 빌드 스크립트(예: `scripts/build-motion.mjs`). 브라우저 번들에 들어가지 않으므로 `.size-limit.json` 한도는 두지 않습니다.
- **장면:** 장면 그룹에 `class="sc s<번호>"`와 `style="${delay(번호)}"`를 줍니다. 한 바퀴(장면 길이 × 장면 수) 동안 자기 차례에만 보입니다. 움직임 줄이기 설정에서는 `.s0`만 끝 모습으로 보입니다.
- **움직임:** 요소에 `class="rise"`처럼 이름을 주고, 쓰는 움직임만 `effects`에 넣습니다. 넣은 순서대로 CSS에 적힙니다. `Effect` 형식으로 서비스가 직접 만든 움직임을 넣을 수도 있습니다.
- `draw`는 경로에 `pathLength="1"`을 줍니다. `keepDasharray: true`는 이전 출력과 바이트까지 맞춰야 할 때만 씁니다.
- `textWidth`는 글꼴을 읽지 않는 근사입니다(한글 1em, 이모지 1.2em, 그 밖 0.6em). [string-width](https://github.com/sindresorhus/string-width) 같은 터미널 칸 수 라이브러리는 비율이 달라(전각 2칸·반각 1칸) 쓰지 않았습니다.
- 색·글꼴·카드·단추·지도처럼 서비스마다 모양이 다른 것은 서비스에 둡니다.

라이선스: [PolyForm Noncommercial 1.0.0](./LICENSE)
