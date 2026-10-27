// 시험용 토큰: 지어낸 RSA 키로 Firebase 모양 ID 토큰을 만든다.
import { generateKeyPair, SignJWT } from 'jose';
import type { CertSource } from '../src/worker/certs.js';

export const PROJECT = 'toolkit-test';
export const ME = 'me@example.test';
export const OTHER = 'other@example.test';
export const T0 = Date.UTC(2026, 9, 25, 3, 0, 0);

export const keys = await generateKeyPair('RS256', { extractable: true });
export const otherKeys = await generateKeyPair('RS256', { extractable: true });
export const certs: CertSource = { key: async (kid) => (kid === 'k1' ? keys.publicKey : null) };

export async function token(
  now: number,
  claims: Record<string, unknown> = {},
  o: { kid?: string; key?: CryptoKey; alg?: string } = {},
): Promise<string> {
  const sec = Math.floor(now / 1000);
  const body: Record<string, unknown> = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'uid-me',
    auth_time: sec,
    iat: sec,
    exp: sec + 3600,
    email: ME,
    email_verified: true,
    ...claims,
  };
  for (const [k, v] of Object.entries(body)) if (v === undefined) delete body[k];
  return new SignJWT(body)
    .setProtectedHeader({ alg: o.alg ?? 'RS256', kid: o.kid ?? 'k1', typ: 'JWT' })
    .sign(o.key ?? keys.privateKey);
}
