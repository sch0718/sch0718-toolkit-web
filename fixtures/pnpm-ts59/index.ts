// 공용 패키지를 소비하는 앱처럼 import해 타입 검사만 한다. 패키지를 추가하면 여기에도 추가한다.
import { createSeenStore, type SeenStore } from '@sch0718/seen-store';

const IDS = ['library', 'map'] as const;
const store: SeenStore<(typeof IDS)[number]> = createSeenStore({ key: 'compat:v1', ids: IDS });
store.mark('map');
// @ts-expect-error 목록에 없는 식별자는 타입 오류여야 한다
store.mark('unknown');
export const seen: boolean = store.read().has('library');

import {
  firebaseAuth,
  readSyncConfig,
  createSessionClient,
  type BaseFail,
} from '@sch0718/firebase-session/client';
import { firebaseAuthHelper, firebaseCsp } from '@sch0718/firebase-session/vite';
import {
  createSessionAuth,
  googleCerts,
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
