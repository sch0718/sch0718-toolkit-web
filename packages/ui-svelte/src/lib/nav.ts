import type { IconNode } from './icon.js';

/** 메뉴 항목 하나. 접근성 이름은 `label`이고, 탭·레일처럼 좁은 자리에는 `short`(없으면 `label`)를 보여 준다. */
export interface NavLink {
  href: string;
  label: string;
  short?: string;
  icon: IconNode;
  current?: boolean;
}
