// 실제 서비스 없이 공급자 토큰과 JWKS를 만든다.
import { createHash } from 'node:crypto';
import { exportJWK } from 'jose';
import { keys, T0, token } from './tokens.js';

export const CLIENT_ID = 'test-client';
export const socialBody = {
  provider: 'kakao' as const,
  code: 'code-ABC123xyz',
  codeVerifier: 'v'.repeat(43),
  redirectUri: 'https://app.example.test/auth/callback',
};
export const NONCE = createHash('sha256')
  .update('nonce:' + socialBody.codeVerifier)
  .digest('base64url');
export const publicJwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: 'k1',
  use: 'sig',
  alg: 'RS256',
};
export const socialToken = (
  claims: Record<string, unknown> = {},
  o: Parameters<typeof token>[2] = {},
) =>
  token(
    T0,
    {
      iss: 'https://kauth.kakao.com',
      aud: CLIENT_ID,
      sub: 'AbC',
      auth_time: undefined,
      nonce: NONCE,
      ...claims,
    },
    o,
  );
