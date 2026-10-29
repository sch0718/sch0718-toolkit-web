// 공용 패키지를 소비하는 앱처럼 import해 타입 검사만 한다. 패키지를 추가하면 여기에도 추가한다.
import { createSeenStore, type SeenStore } from '@sch0718/seen-store';

const IDS = ['library', 'map'] as const;
const store: SeenStore<(typeof IDS)[number]> = createSeenStore({ key: 'compat:v1', ids: IDS });
store.mark('map');
// @ts-expect-error 목록에 없는 식별자는 타입 오류여야 한다
store.mark('unknown');
export const seen: boolean = store.read().has('library');

import {
  beginSocialSignIn,
  readSocialCallback,
  stripSocialCallback,
  socialAuthorizeUrl,
  readSocialConfig,
  SOCIAL_AUTHORIZE_URLS,
  type SocialCallback,
  type SocialSignInOptions,
  firebaseAuth,
  readSyncConfig,
  createSessionClient,
  type BaseFail,
} from '@sch0718/firebase-session/client';
import { firebaseAuthHelper, firebaseCsp } from '@sch0718/firebase-session/vite';
import {
  createSessionAuth,
  googleCerts,
  jwksKeys,
  socialKeys,
  parseAccountList,
  SOCIAL_PROVIDERS,
  SESSION_PATHS,
  type SocialProvider,
  type SocialProviderConfig,
  type SocialLoginOptions,
  purgeSessions,
  type D1Database,
} from '@sch0718/firebase-session/worker';
import { writeNotices } from '@sch0718/license-notices';
import { applyTheme, showSnackbar, type ThemeChoice } from '@sch0718/ui-svelte';
import type { Plugin } from 'vite';

const cfg = readSyncConfig({ VITE_SYNC_API_URL: 'https://api.example.test' });
if (cfg) firebaseAuth(cfg.firebase);
const api = createSessionClient<{ ok: false; kind: 'conflict' }>({
  baseUrl: 'https://api.example.test',
  allowSessionOnly: true,
  credentials: { idToken: async () => null, sessionId: async () => null },
  sessionHeader: 'X-Compat-Session',
  mapStatus: (s) => (s === 409 ? { ok: false, kind: 'conflict' } : undefined),
});
export const listed: Promise<unknown> = api.listSessions();
export const fail: BaseFail = { ok: false, kind: 'offline' };

export const plugins: Plugin[] = [firebaseAuthHelper(), firebaseCsp()];

declare const db: D1Database;
export const sessions = createSessionAuth({
  db,
  projectId: 'p',
  allowedEmails: undefined,
  social: { allowedAccounts: 'kakao:123', kakao: { clientId: 'public-id' }, keys: socialKeys() },
  certs: googleCerts(),
  sessionHeader: 'X-Compat-Session',
  now: Date.now,
  random: (n) => new Uint8Array(n),
  uuid: () => 'u',
});
export const purged: Promise<number> = purgeSessions(db, Date.now());
export const notices: typeof writeNotices = writeNotices;

const theme: ThemeChoice = 'dark';
applyTheme(theme);
showSnackbar('저장했어요');

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

// 소셜 공개 API 선언을 소비자 TypeScript 5.9에서 검사한다(실행하지 않는다).
const socialProvider: SocialProvider = 'kakao';
const providerConfig: SocialProviderConfig = { clientId: 'public-id' };
export const socialOptions: SocialLoginOptions = {
  allowedAccounts: undefined,
  kakao: providerConfig,
  keys: socialKeys(),
};
export const jwks = jwksKeys(SOCIAL_PROVIDERS[socialProvider].jwksUrl);
export const accounts: Set<string> = parseAccountList('kakao:123,naver:AbC');
export const socialPath: string = SESSION_PATHS.social;
const signInOptions: SocialSignInOptions = {
  ...providerConfig,
  redirectUri: 'https://app.test/callback',
};
export const signingIn: Promise<void> = beginSocialSignIn(socialProvider, signInOptions);
export const callback: SocialCallback | null = readSocialCallback('https://app.test/callback');
export const cleanCallback: string = stripSocialCallback('https://app.test/callback');
export const socialConfig = readSocialConfig({ VITE_KAKAO_LOGIN_CLIENT_ID: 'public-id' });
export const authorizeUrl: string = socialAuthorizeUrl(socialProvider, {
  ...signInOptions,
  state: 's',
  nonce: 'n',
  codeChallenge: 'c',
});
export const kakaoAuthorize: string = SOCIAL_AUTHORIZE_URLS.kakao;
if (callback?.ok) {
  api.createSocialSession(callback, '노트북');
}
export const socialSession: Promise<unknown> = sessions.createSocial(
  new Request('https://api.test'),
  {},
);
export const deniedAccount: BaseFail = { ok: false, kind: 'not-allowed', account: 'kakao:123' };
