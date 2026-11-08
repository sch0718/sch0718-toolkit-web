// 시험용 토큰: 지어낸 RSA 키로 Firebase 모양 ID 토큰을 만든다.
import { generateKeyPair } from 'jose';
import { createTestTokens } from '../src/testing/tokens.js';

export const PROJECT = 'toolkit-test';
export const ME = 'me@example.test';
export const OTHER = 'other@example.test';
export const T0 = Date.UTC(2026, 9, 25, 3, 0, 0);

const t = await createTestTokens({ projectId: PROJECT });
export const { keys, certs } = t;
export const otherKeys = await generateKeyPair('RS256', { extractable: true });

export async function token(
  now: number,
  claims: Record<string, unknown> = {},
  o: { kid?: string; key?: CryptoKey; alg?: string } = {},
): Promise<string> {
  return t.token(claims, { ...o, now });
}
