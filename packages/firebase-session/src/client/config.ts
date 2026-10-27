// 빌드 때 넣는 동기화 설정(VITE_*). 하나라도 비면 null(동기화를 끈다). 값은 저장소에 커밋하지 않는다.
// Firebase 웹 설정값은 비밀이 아니지만(앱 번들에 들어간다) 계정마다 달라 저장소에 두지 않는다.

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export interface SyncConfig {
  /** Worker 주소. https만(개발 서버에서는 http://localhost도). */
  apiUrl: string;
  firebase: FirebaseConfig;
}

type Env = Record<string, string | boolean | undefined>;

const DOMAIN_RE = /^[a-z0-9.-]+$/;

/** Vite 앱에서는 readSyncConfig(import.meta.env)로 부른다. */
export function readSyncConfig(env: Env): SyncConfig | null {
  const s = (k: string) => {
    const v = env[k];
    return typeof v === 'string' ? v.trim() : '';
  };
  const apiUrl = s('VITE_SYNC_API_URL').replace(/\/+$/, '');
  const firebase = {
    apiKey: s('VITE_FIREBASE_API_KEY'),
    authDomain: s('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: s('VITE_FIREBASE_PROJECT_ID'),
    appId: s('VITE_FIREBASE_APP_ID'),
  };
  if (!apiUrl || Object.values(firebase).some((v) => !v)) return null;
  if (!DOMAIN_RE.test(firebase.authDomain)) return null;
  let u: URL;
  try {
    u = new URL(apiUrl);
  } catch {
    return null;
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(env['DEV'] === true && u.protocol === 'http:' && local))
    return null;
  return { apiUrl, firebase };
}
