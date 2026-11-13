/**
 * 아이콘 모양 데이터: 24×24 SVG 안에 그릴 요소 목록(`[태그, 속성]`). Lucide의 `IconNode`(`lucide` 패키지)와 같은 모양이라
 * `import { House } from 'lucide'`를 그대로 넘길 수 있다.
 */
export type IconNode = readonly (readonly [
  tag: string,
  attrs: Readonly<Record<string, string | number | undefined>>,
])[];
