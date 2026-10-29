export {
  AUTH_CODES,
  createSessionClient,
  type ApiResult,
  type BaseFail,
  type Credentials,
  type DeviceSession,
  type Fail,
  type SendOptions,
  type SessionClient,
  type SessionClientOptions,
} from './api.js';
export {
  firebaseAuth,
  type AuthClient,
  type AuthUser,
  type FirebaseImplModule,
  type SignInResult,
} from './auth.js';
export { readSyncConfig, type FirebaseConfig, type SyncConfig } from './config.js';
export {
  beginSocialSignIn,
  readSocialCallback,
  readSocialConfig,
  socialAuthorizeUrl,
  socialNonce,
  SOCIAL_AUTHORIZE_URLS,
  stripSocialCallback,
  type SocialProvider,
  type SocialSignInOptions,
  type SocialCallback,
} from './social.js';
