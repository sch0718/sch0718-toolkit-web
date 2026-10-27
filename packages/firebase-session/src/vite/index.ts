export {
  AUTH_HELPER_FILES,
  fetchAuthHelper,
  firebaseAuthHelper,
  selfHostsAuthHelper,
  type FetchFn,
} from './authHelper.js';
export { applyFirebaseCsp, FIREBASE_SCRIPT_SOURCES, firebaseCsp } from './csp.js';

/** PWA 설정용: 로그인할 때만 받는 파일. 서비스 워커가 미리 담지 않는다(Firebase Auth 청크, 같은 도메인의 로그인 도우미). */
export const AUTH_GLOB_IGNORES: readonly string[] = ['assets/firebaseImpl-*.js', '__/**'];
/** PWA 설정용: 로그인 도우미(/__/auth/handler 등)는 앱 셸로 대신 답하지 않는다. 대신 답하면 로그인이 돌아오지 못한다. */
export const AUTH_NAVIGATE_DENYLIST: readonly RegExp[] = [/^\/__\//];
