// 시험용 RSA 키와 Firebase 모양 ID 토큰을 만든다.
import { generateKeyPair, SignJWT } from 'jose';
import type { CertSource } from '../worker/certs.js';

export interface TestTokensOptions {
  projectId: string;
  now?: () => number;
}

export interface TestTokens {
  keys: { publicKey: CryptoKey; privateKey: CryptoKey };
  certs: CertSource;
  token(
    claims?: Record<string, unknown>,
    o?: { now?: number; kid?: string; key?: CryptoKey; alg?: string },
  ): Promise<string>;
}

export async function createTestTokens(o: TestTokensOptions): Promise<TestTokens> {
  const keys = await generateKeyPair('RS256', { extractable: true });
  return {
    keys,
    certs: { key: async (kid) => (kid === 'k1' ? keys.publicKey : null) },
    async token(claims = {}, options = {}) {
      const sec = Math.floor((options.now ?? (o.now ?? Date.now)()) / 1000);
      const body: Record<string, unknown> = {
        iss: `https://securetoken.google.com/${o.projectId}`,
        aud: o.projectId,
        sub: 'uid-me',
        auth_time: sec,
        iat: sec,
        exp: sec + 3600,
        email: 'me@example.test',
        email_verified: true,
        ...claims,
      };
      for (const [k, v] of Object.entries(body)) if (v === undefined) delete body[k];
      return new SignJWT(body)
        .setProtectedHeader({ alg: options.alg ?? 'RS256', kid: options.kid ?? 'k1', typ: 'JWT' })
        .sign(options.key ?? keys.privateKey);
    },
  };
}
