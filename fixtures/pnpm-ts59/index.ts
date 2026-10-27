// 공용 패키지를 소비하는 앱처럼 import해 타입 검사만 한다. 패키지를 추가하면 여기에도 추가한다.
import { createSeenStore, type SeenStore } from '@sch0718/seen-store';

const IDS = ['library', 'map'] as const;
const store: SeenStore<(typeof IDS)[number]> = createSeenStore({ key: 'compat:v1', ids: IDS });
store.mark('map');
// @ts-expect-error 목록에 없는 식별자는 타입 오류여야 한다
store.mark('unknown');
export const seen: boolean = store.read().has('library');

import {
  KAKAO_LINK_MAX,
  kakaoLinkFits,
  kakaoReady,
  preloadKakao,
  sendKakao,
  shareOrCopy,
  type KakaoCard,
  type KakaoShareConfig,
} from '@sch0718/kakao-share';

const kakao: KakaoShareConfig = { appKey: 'compat-key', maxLinkLength: KAKAO_LINK_MAX };
const card: KakaoCard = { title: '제목', url: 'https://app.test/s/abc', buttonTitle: '보기' };
// @ts-expect-error 카드에는 url이 꼭 있어야 한다
const noUrl: KakaoCard = { title: '제목' };
export const kakaoChecks: [boolean, boolean, boolean, unknown] = [
  kakaoLinkFits(card.url, kakao),
  kakaoReady(),
  sendKakao(card, kakao),
  noUrl,
];
export const kakaoLoad: Promise<void> = preloadKakao(kakao);
export const shared: Promise<'shared' | 'copied' | 'cancelled' | 'failed'> = shareOrCopy(
  card.url,
  card.title,
  { copy: async () => undefined },
);
