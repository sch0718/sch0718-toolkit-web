import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  flatten,
  NOTICE_FILE,
  noticeHead,
  readTexts,
  render,
  type RenderOptions,
} from './index.js';

const opts = (o: Partial<RenderOptions> = {}): RenderOptions => ({
  head: noticeHead('시험앱', 'https://example.test/LICENSE'),
  readTexts: () => [],
  upstream: (name) =>
    name === 'firebase' || name.startsWith('@firebase/') ? 'firebase.txt' : null,
  readUpstream: () => null,
  upstreamLabel: 'scripts/licenses',
  ...o,
});

describe('flatten', () => {
  it('패키지의 버전마다 한 줄로 펴고 이름순으로 정렬한다', () => {
    const pkgs = flatten({
      MIT: [{ name: 'zed', versions: ['1.0.0'], paths: ['/z'] }],
      ISC: [{ name: 'abc', versions: ['2.0.0', '1.0.0'], paths: ['/a2', '/a1'] }],
    });
    expect(pkgs.map((p) => `${p.name}@${p.version}:${p.license}:${p.path}`)).toEqual([
      'abc@1.0.0:ISC:/a1',
      'abc@2.0.0:ISC:/a2',
      'zed@1.0.0:MIT:/z',
    ]);
  });

  it('keep이 있으면 그 이름만 남긴다', () => {
    const pkgs = flatten(
      {
        MIT: [
          { name: 'svelte', versions: ['5.0.0'], paths: ['/s'] },
          { name: 'vite', versions: ['6.0.0'], paths: ['/v'] },
        ],
      },
      (n) => n === 'svelte',
    );
    expect(pkgs.map((p) => p.name)).toEqual(['svelte']);
  });
});

describe('render', () => {
  it('머리말에 앱 이름과 라이선스 주소를 싣는다', () => {
    const out = render([], opts());
    expect(out).toMatch(/^시험앱에서 쓰는 오픈소스 소프트웨어\n/);
    expect(out).toContain(
      '시험앱 자체는 PolyForm Noncommercial 1.0.0을 따릅니다: https://example.test/LICENSE',
    );
  });

  it('라이선스와 NOTICE 본문을 싣는다', () => {
    const out = render(
      [{ name: 'a', version: '1.0.0', license: 'Apache-2.0', path: '/a' }],
      opts({
        readTexts: () => [
          { file: 'LICENSE', text: 'Apache text\n' },
          { file: 'NOTICE', text: 'Notice text' },
        ],
      }),
    );
    expect(out).toMatch(
      /a 1\.0\.0 \(Apache-2\.0\)\n=+\n--- LICENSE ---\nApache text\n\n--- NOTICE ---\nNotice text/,
    );
  });

  it('라이선스 파일이 없는 패키지는 upstream 원문을 싣는다', () => {
    const out = render(
      [{ name: '@firebase/auth', version: '1.0.0', license: 'Apache-2.0', path: '/f' }],
      opts({ readUpstream: (f) => (f === 'firebase.txt' ? 'Copyright Google LLC\nApache' : null) }),
    );
    expect(out).toMatch(
      /@firebase\/auth 1\.0\.0 \(Apache-2\.0\)\n=+\n--- upstream LICENSE \(scripts\/licenses\/firebase\.txt\) ---\nCopyright Google LLC/,
    );
  });

  it('같은 upstream 원문은 한 번만 싣고 다음부터는 가리킨다', () => {
    const pkgs = ['@firebase/app', '@firebase/auth'].map((name) => ({
      name,
      version: '1.0.0',
      license: 'Apache-2.0',
      path: '/f',
    }));
    const out = render(pkgs, opts({ readUpstream: () => 'Copyright Google LLC\nApache' }));
    expect(out.match(/Copyright Google LLC/g)).toHaveLength(1);
    expect(out).toContain('(위 @firebase/app 1.0.0에 실은 원문과 같아요)');
  });

  it('원문을 어디서도 찾지 못하면 멈춘다', () => {
    expect(() =>
      render([{ name: 'mystery', version: '1.0.0', license: 'MIT', path: '/m' }], opts()),
    ).toThrow(/mystery@1\.0\.0/);
  });
});

describe('readTexts', () => {
  it('패키지 루트, 없으면 dist/에서 라이선스 파일을 찾는다', () => {
    const root = mkdtempSync(join(tmpdir(), 'notices-'));
    const a = join(root, 'a');
    mkdirSync(a);
    writeFileSync(join(a, 'LICENSE'), 'A');
    writeFileSync(join(a, 'README.md'), 'no');
    const b = join(root, 'b');
    mkdirSync(join(b, 'dist'), { recursive: true });
    writeFileSync(join(b, 'dist', 'LICENSE.txt'), 'B');
    expect(readTexts(a)).toEqual([{ file: 'LICENSE', text: 'A' }]);
    expect(readTexts(b)).toEqual([{ file: 'LICENSE.txt', text: 'B' }]);
    expect(readTexts(join(root, 'none'))).toEqual([]);
  });
});

describe('NOTICE_FILE', () => {
  it('하이픈·확장자가 붙은 이름도 알아본다', () => {
    expect(NOTICE_FILE.test('LICENSE-MIT.txt')).toBe(true);
    expect(NOTICE_FILE.test('LICENSE.md')).toBe(true);
    expect(NOTICE_FILE.test('licenses.json')).toBe(false);
  });
});
