// 공용 패키지를 소비하는 앱처럼 import해 타입 검사만 한다. 패키지를 추가하면 여기에도 추가한다.
import { createSeenStore, type SeenStore } from '@sch0718/seen-store';

const IDS = ['library', 'map'] as const;
const store: SeenStore<(typeof IDS)[number]> = createSeenStore({ key: 'compat:v1', ids: IDS });
store.mark('map');
// @ts-expect-error 목록에 없는 식별자는 타입 오류여야 한다
store.mark('unknown');
export const seen: boolean = store.read().has('library');

import { effects, motionCss, svgDocument, textWidth, type Effect } from '@sch0718/motion-kit';

const custom: Effect = { name: 'spin', rule: () => '', keyframes: () => '' };
const css: string = motionCss({
  sceneLength: 3,
  scenes: 2,
  font: 'sans-serif',
  effects: [effects.rise, effects.draw({ seconds: 1 }), custom],
});
// @ts-expect-error 글꼴은 서비스가 꼭 준다
motionCss({ sceneLength: 3, scenes: 2, effects: [] });
export const svg: string = svgDocument({ w: 10, h: 10, title: 't', desc: 'd', css, body: '' });
export const width: number = textWidth('가나', 12);
