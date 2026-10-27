import { describe, expect, it } from 'vitest';
import {
  base64url,
  errorBody,
  HttpError,
  isCapability,
  json,
  readJson,
  sha256Hex,
} from './http.js';

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request('https://api.example.test/x', { method: 'POST', body, headers });

const fails = async (p: Promise<unknown>, status: number, code: string) => {
  const e = await p.catch((x: unknown) => x);
  expect(e).toBeInstanceOf(HttpError);
  expect(e).toMatchObject({ status, code });
};

describe('readJson', () => {
  it('JSON 본문을 읽는다', async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 });
  });
  it('선언한 길이가 상한을 넘으면 413', async () => {
    await fails(readJson(post('{}', { 'Content-Length': '11' }), 10), 413, 'too-large');
  });
  it('실제로 읽은 크기가 상한을 넘으면 413', async () => {
    await fails(readJson(post(JSON.stringify({ x: 'y'.repeat(50) })), 20), 413, 'too-large');
  });
  it('JSON이 아니거나 본문이 없으면 400', async () => {
    await fails(readJson(post('nope')), 400, 'bad-json');
    await fails(readJson(new Request('https://api.example.test/x')), 400, 'bad-json');
  });
});

describe('json', () => {
  it('no-store와 JSON 형식을 붙인다', async () => {
    const r = json(200, { ok: true }, { 'X-A': '1' });
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(r.headers.get('X-A')).toBe('1');
    expect(await r.json()).toEqual({ ok: true });
    expect(await json(204, null).text()).toBe('');
  });
  it('errorBody는 error 필드에 코드를 담는다', () => {
    expect(errorBody('origin', { path: 'a' })).toEqual({ error: 'origin', path: 'a' });
  });
});

describe('부호화', () => {
  it('sha256Hex', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('base64url은 +/= 없이', () => {
    expect(base64url(new Uint8Array([251, 255, 191]))).toBe('-_-_');
    expect(base64url(new Uint8Array([1]))).toBe('AQ');
  });
  it('isCapability는 43자 base64url만', () => {
    expect(isCapability('A'.repeat(43))).toBe(true);
    expect(isCapability('A'.repeat(42))).toBe(false);
    expect(isCapability(`${'A'.repeat(42)}+`)).toBe(false);
    expect(isCapability(null)).toBe(false);
  });
});
