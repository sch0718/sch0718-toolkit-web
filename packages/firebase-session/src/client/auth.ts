// Firebase Auth(Google 로그인)를 감싼 인증 클라이언트. Firestore는 쓰지 않는다.
// SDK는 로그인 버튼을 누르거나 저장된 세션이 있을 때만 동적 import한다(로그인하지 않은 사용자의 첫 화면 번들은 그대로).
// 소비 앱의 번들러가 firebaseImpl을 별도 청크(firebaseImpl-*.js)로 나눈다. 파일 이름을 바꾸면 PWA globIgnores도 바꾼다.
import type { FirebaseConfig } from './config.js';

export interface AuthUser {
  uid: string;
  email: string | null;
}

export interface SignInResult {
  user: AuthUser;
  idToken: string;
}

export interface AuthClient {
  /** SDK가 저장된 로그인 상태를 다 읽을 때까지 기다린 뒤의 사용자. */
  ready(): Promise<AuthUser | null>;
  /**
   * Google 로그인. 방금 로그인한 ID 토큰(auth_time이 지금)을 돌려준다.
   * 팝업이 막혀 리다이렉트로 넘어가면 'redirect'(페이지가 떠난다). 사용자가 닫으면 null.
   */
  signIn(): Promise<SignInResult | 'redirect' | null>;
  /** 리다이렉트 로그인에서 돌아왔으면 그 결과. */
  redirectResult(): Promise<SignInResult | null>;
  signOut(): Promise<void>;
  idToken(forceRefresh?: boolean): Promise<string | null>;
}

/** firebaseImpl 모듈 모양. 공개 타입에 firebase 타입이 드러나지 않게 Auth 객체는 unknown으로 둔다. */
export interface FirebaseImplModule {
  getAuthFor(cfg: FirebaseConfig): unknown;
  ready(auth: unknown): Promise<AuthUser | null>;
  signIn(auth: unknown): Promise<SignInResult | 'redirect' | null>;
  redirectResult(auth: unknown): Promise<SignInResult | null>;
  signOut(auth: unknown): Promise<void>;
  idToken(auth: unknown, force?: boolean): Promise<string | null>;
}

export function firebaseAuth(
  cfg: FirebaseConfig,
  load: () => Promise<FirebaseImplModule> = () => import('./firebaseImpl.js'),
): AuthClient {
  let loaded: Promise<FirebaseImplModule> | null = null;
  // 조각을 못 불러오면(오프라인) 실패한 약속을 버려 다음 호출에서 다시 불러온다.
  const impl = () =>
    (loaded ??= load().catch((e: unknown) => {
      loaded = null;
      throw e;
    }));
  const auth = async () => (await impl()).getAuthFor(cfg);
  return {
    ready: async () => (await impl()).ready(await auth()),
    signIn: async () => (await impl()).signIn(await auth()),
    redirectResult: async () => (await impl()).redirectResult(await auth()),
    signOut: async () => (await impl()).signOut(await auth()),
    idToken: async (force) => (await impl()).idToken(await auth(), force),
  };
}
