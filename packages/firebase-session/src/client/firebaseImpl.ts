// Firebase 웹 SDK 호출부. auth.ts가 동적 import해서 별도 청크가 된다.
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import type { FirebaseConfig } from './config.js';
import type { AuthUser, SignInResult } from './auth.js';

/**
 * 소비 앱이 다른 Firebase 프로젝트로 앱을 이미 만들었을 때 따로 만드는 앱 이름.
 * 설정마다 이름이 달라야 셋째 설정부터 app/duplicate-app으로 실패하지 않는다.
 */
const appName = (cfg: FirebaseConfig) => `@sch0718/firebase-session:${cfg.projectId}:${cfg.apiKey}`;

// projectId + apiKey마다 Auth 하나. 다른 설정에 앞서 만든 Auth를 돌려주지 않는다.
const instances = new Map<string, Auth>();

function appFor(cfg: FirebaseConfig): FirebaseApp {
  const apps = getApps();
  const same = apps.find(
    (a) => a.options.projectId === cfg.projectId && a.options.apiKey === cfg.apiKey,
  );
  if (same) return same;
  // 앱이 없으면 기본 앱([DEFAULT])을 만든다. Auth 저장 키에 앱 이름이 들어가므로
  // 이미 기본 앱으로 로그인한 사용자가 로그아웃되지 않게 이름을 바꾸지 않는다.
  if (apps.length === 0) return initializeApp(cfg);
  return initializeApp(cfg, appName(cfg));
}

export function getAuthFor(cfg: FirebaseConfig): Auth {
  const key = JSON.stringify([cfg.projectId, cfg.apiKey]);
  const cached = instances.get(key);
  if (cached) return cached;
  const app = appFor(cfg);
  let auth: Auth;
  try {
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch (e) {
    // 소비 앱이 이 앱에 getAuth/initializeAuth를 이미 불렀다. 그 Auth(소비 앱의 저장 방식·resolver)를 쓴다.
    if ((e as { code?: unknown } | null)?.code !== 'auth/already-initialized') throw e;
    auth = getAuth(app);
  }
  instances.set(key, auth);
  return auth;
}

const toUser = (u: User): AuthUser => ({ uid: u.uid, email: u.email });

function provider() {
  const p = new GoogleAuthProvider();
  // 여러 Google 계정이 있으면 고르게 한다(허용 목록 밖 계정으로 조용히 들어가지 않게)
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
}

export async function ready(auth: Auth): Promise<AuthUser | null> {
  await auth.authStateReady();
  return auth.currentUser ? toUser(auth.currentUser) : null;
}

export async function signIn(auth: Auth): Promise<SignInResult | 'redirect' | null> {
  try {
    const cred = await signInWithPopup(auth, provider());
    return { user: toUser(cred.user), idToken: await cred.user.getIdToken() };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, provider());
      return 'redirect';
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request')
      return null;
    throw e;
  }
}

export async function redirectResult(auth: Auth): Promise<SignInResult | null> {
  const cred = await getRedirectResult(auth);
  return cred ? { user: toUser(cred.user), idToken: await cred.user.getIdToken() } : null;
}

export async function signOut(auth: Auth): Promise<void> {
  await fbSignOut(auth);
}

export async function idToken(auth: Auth, force = false): Promise<string | null> {
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken(force) : null;
}
