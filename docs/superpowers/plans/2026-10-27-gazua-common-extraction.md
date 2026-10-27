# 가즈아 공통 코드 추출 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가즈아의 인증·세션·빌드 설정·UI·라이선스 고지 코드를 `sch0718-toolkit-web`의 패키지 4개로 옮기고, 가즈아가 그 패키지를 쓰게 바꾼다.

**Architecture:** toolkit에 `@sch0718/firebase-session`(`/worker`·`/client`·`/vite`), `@sch0718/vite-app`, `@sch0718/ui-svelte`, `@sch0718/license-notices`를 만든다. 장치는 패키지에, 값(허용 이메일·출처·세션 헤더 이름·매니페스트)은 서비스에 둔다. 가즈아는 개발 중에는 `pnpm pack` tarball로 확인하고, 발행 뒤 정확한 버전으로 바꾼다.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9(`@tsconfig/strictest`), Vitest 5, jose 6, Firebase JS SDK 12, Vite 6~8, vite-plugin-pwa 2, Svelte 5, `@sveltejs/package` 2, Changesets, publint, attw, size-limit.

설계: [`docs/superpowers/specs/2026-10-27-gazua-common-extraction-design.md`](../specs/2026-10-27-gazua-common-extraction-design.md)

## Global Constraints

- 작업 위치
  - toolkit: worktree `/Users/shinchoonho/01.workspace/01.repositories/.worktrees/sch0718-toolkit-web-extract`, 브랜치 `feat/extract-gazua-common`(origin/main에서 땀). 아래에서 `$TK`라고 쓴다.
  - 가즈아: worktree `/Users/shinchoonho/01.workspace/10.repository/.worktrees/gazua-toolkit`, 브랜치 `chore/use-toolkit-packages`(Task 8에서 origin/main에서 땀). 아래에서 `$GZ`라고 쓴다. 가즈아 원본 `/Users/shinchoonho/01.workspace/10.repository/gazua`(아래 `$GZ_ORIG`)는 읽기만 한다.
  - 메인 체크아웃의 브랜치는 바꾸지 않는다. `git stash`도 쓰지 않는다.
- repass 저장소는 건드리지 않는다.
- push, PR 병합, 발행(Version Packages 병합)은 사용자 확인 뒤에만 한다(Task 15·16).
- 사용자에게 보이는 문서·커밋 메시지·주석은 한국어로 쓴다. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`을 붙인다.
- 패키지 규칙: ESM만, `"type": "module"`, `"license": "PolyForm-Noncommercial-1.0.0"`, `"author": "신춘호 (https://github.com/sch0718)"`, `publishConfig.registry: https://npm.pkg.github.com`, 새 패키지 `version`은 `0.0.0`(changeset minor로 0.1.0이 된다).
- 선언 파일은 TypeScript 5.9.3으로 만든다. `@sveltejs/package`는 3.x가 TypeScript 6을 요구하므로 **2.5.8**을 쓴다.
- 상대 import는 `.js` 확장자를 붙인다(`module: NodeNext`). Svelte 패키지 안의 `.svelte.ts` 모듈은 `.svelte.js`로 부른다.
- 동작은 바꾸지 않는다. 바뀌어도 되는 것: Vite 플러그인 이름(`gazua-*` → `sch0718-*`), 고지 파일 첫 줄(`가즈아가 쓰는` → `가즈아에서 쓰는`), 고지 파일에 `@sch0718/*` 항목이 더해지는 것.
- 가즈아의 세션 헤더 이름 `X-Gazua-Session`은 유지한다.
- toolkit에서 끝내기 전 검사: `pnpm run verify`, `pnpm compat`. `pnpm ci`는 쓰지 않는다.
- 가즈아에서 끝내기 전 검사: `pnpm check`, `pnpm check:e2e`, `pnpm test`, `pnpm test:scripts`, `UNIVERSE_REUSE=true pnpm build`, `pnpm --filter sync-worker check`, `pnpm --filter sync-worker test`, `UNIVERSE_REUSE=true pnpm e2e`.
- 가즈아에서 `package.json`, `pnpm-lock.yaml`, `sync-worker/package.json`의 `file:` tarball 설치는 Task 16 전까지 커밋하지 않는다. 각 커밋에서 이 세 파일을 빼고 `git add`한다.

---

## Phase A: toolkit 패키지

### Task 1: `@sch0718/license-notices`

**Files:**

- Create: `$TK/packages/license-notices/package.json`
- Create: `$TK/packages/license-notices/tsconfig.build.json`
- Create: `$TK/packages/license-notices/src/index.ts`
- Create: `$TK/packages/license-notices/src/index.test.ts`
- Create: `$TK/packages/license-notices/README.md`

**Interfaces:**

- Produces: `writeNotices(opts: WriteNoticesOptions): { count: number }`, `flatten`, `render(pkgs, RenderOptions)`, `noticeHead(appName, licenseUrl, appLicense?)`, `readTexts(dir)`, `NOTICE_FILE`, 타입 `Pkg`, `NoticeText`, `LicensesJson`, `RenderOptions`, `WriteNoticesOptions`. Task 13에서 가즈아가 `writeNotices`를 쓴다.

- [ ] **Step 1: 의존성 설치와 기준선 확인**

```bash
cd $TK
pnpm install
pnpm run verify
```

Expected: 통과(seen-store만 있는 상태).

- [ ] **Step 2: 패키지 뼈대를 만든다**

`packages/license-notices/package.json`:

```json
{
  "name": "@sch0718/license-notices",
  "version": "0.0.0",
  "description": "앱이 쓰는 오픈소스 패키지의 라이선스 전문을 모아 하나의 고지 파일로 만든다(pnpm licenses list 기반).",
  "license": "PolyForm-Noncommercial-1.0.0",
  "author": "신춘호 (https://github.com/sch0718)",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/sch0718/sch0718-toolkit-web.git",
    "directory": "packages/license-notices"
  },
  "type": "module",
  "sideEffects": false,
  "engines": {
    "node": ">=22"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "LICENSE"],
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json && cp ../../LICENSE LICENSE",
    "check:package": "publint --strict && attw --pack . --profile esm-only"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

`packages/license-notices/tsconfig.build.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": false,
    "sourceMap": false,
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: 실패하는 시험을 쓴다**

`packages/license-notices/src/index.test.ts`(가즈아 `tests/build-notices.test.mjs`의 함수 시험을 옮기고, 머리말·`readTexts` 시험을 더한다):

```ts
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
```

- [ ] **Step 4: 시험이 실패하는지 본다**

Run: `pnpm vitest run packages/license-notices`
Expected: FAIL, `./index.js`를 찾지 못한다.

- [ ] **Step 5: 구현한다**

`packages/license-notices/src/index.ts`(가즈아 `scripts/build-notices.mjs`의 동작 그대로, 앱별 값만 인자로 바꿈):

```ts
// 앱이 쓰는 운영 의존성의 라이선스 전문을 모아 하나의 텍스트 파일로 만든다.
// 번들러가 라이선스 주석을 지우므로, MIT·BSD·Apache의 고지 의무를 이 파일로 지킨다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface Pkg {
  name: string;
  version: string;
  license: string;
  author?: string | undefined;
  path: string;
}

export interface NoticeText {
  file: string;
  text: string;
}

/** `pnpm licenses list --json`의 결과 모양(라이선스 → 패키지 목록). */
export type LicensesJson = Record<
  string,
  { name: string; versions: string[]; paths: string[]; author?: string }[]
>;

export const NOTICE_FILE = /^(licen[cs]e|copying|notice)([-._].*)?$/i; // LICENSE, LICENSE.md, LICENSE-MIT.txt 등

const byNameVersion = (a: Pkg, b: Pkg) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : 1;

/** pnpm licenses list --json 결과를 패키지 버전마다 한 줄로 편다. keep이 있으면 그 이름만 남긴다. */
export function flatten(
  byLicense: LicensesJson,
  keep: (name: string) => boolean = () => true,
): Pkg[] {
  const out: Pkg[] = [];
  for (const [license, pkgs] of Object.entries(byLicense)) {
    for (const p of pkgs.filter((q) => keep(q.name))) {
      p.versions.forEach((version, i) =>
        out.push({ name: p.name, version, license, author: p.author, path: p.paths[i] ?? '' }),
      );
    }
  }
  return out.sort(byNameVersion);
}

export function noticeHead(
  appName: string,
  licenseUrl: string,
  appLicense = 'PolyForm Noncommercial 1.0.0',
): string {
  return [
    `${appName}에서 쓰는 오픈소스 소프트웨어`,
    '',
    `${appName} 자체는 ${appLicense}을 따릅니다: ${licenseUrl}`,
    '아래는 앱에 포함되거나 함께 쓰이는 패키지와 그 라이선스 전문입니다.',
  ].join('\n');
}

export interface RenderOptions {
  head: string;
  /** 패키지 폴더 → 라이선스·NOTICE 파일 본문 */
  readTexts: (dir: string) => NoticeText[];
  /** 패키지 이름 → upstream 원문 파일 이름. 없으면 null */
  upstream: (name: string) => string | null;
  /** upstream 파일 이름 → 본문. 없으면 null */
  readUpstream: (file: string) => string | null;
  /** 고지에 적을 upstream 폴더 이름(예: 'scripts/licenses') */
  upstreamLabel: string;
}

/**
 * 패키지마다 라이선스·NOTICE 파일 본문을 붙여 하나의 텍스트로 만든다.
 * 패키지에 파일이 없으면 upstream 원문을 쓰고, 그것도 없으면 멈춘다(고지가 빠진 채 배포하지 않는다).
 */
export function render(pkgs: Pkg[], o: RenderOptions): string {
  const missing: string[] = [];
  // upstream 파일 → 처음 실은 패키지(같은 원문은 한 번만 싣는다. @firebase/* 수십 개가 한 파일을 쓴다)
  const shown = new Map<string, string>();
  const blocks = pkgs.map((p) => {
    let texts = o.readTexts(p.path);
    if (!texts.length) {
      const file = o.upstream(p.name);
      const text = file ? o.readUpstream(file) : null;
      const label = `upstream LICENSE (${o.upstreamLabel}/${file ?? ''})`;
      if (!file || !text) missing.push(`${p.name}@${p.version}`);
      else if (shown.has(file)) {
        texts = [{ file: label, text: `(위 ${shown.get(file) ?? ''}에 실은 원문과 같아요)` }];
      } else {
        shown.set(file, `${p.name} ${p.version}`);
        texts = [{ file: label, text }];
      }
    }
    const body = texts.map((t) => `--- ${t.file} ---\n${t.text.trim()}`).join('\n\n');
    return `${'='.repeat(72)}\n${p.name} ${p.version} (${p.license})\n${'='.repeat(72)}\n${body}`;
  });
  if (missing.length) {
    throw new Error(
      `라이선스 원문을 찾지 못한 패키지: ${missing.join(', ')}. upstream LICENSE를 ${o.upstreamLabel}/에 두고 upstream 매핑에 등록하세요`,
    );
  }
  return `${o.head}\n\n${blocks.join('\n\n')}\n`;
}

/** 패키지 루트에서, 없으면 dist/에서 라이선스·NOTICE 파일을 찾는다(pretendard는 dist/LICENSE.txt에 둔다). */
export function readTexts(dir: string): NoticeText[] {
  for (const d of [dir, join(dir, 'dist')]) {
    try {
      const found = readdirSync(d)
        .filter((f) => NOTICE_FILE.test(f))
        .sort()
        .map((file) => ({ file, text: readFileSync(join(d, file), 'utf8') }));
      if (found.length) return found;
    } catch {
      // 폴더가 없으면 다음 후보
    }
  }
  return [];
}

function pnpmLicenses(cwd: string, args: string[]): LicensesJson {
  // pnpm 스크립트로 돌면 npm_execpath가 pnpm의 JS 진입점이라 node로 바로 띄운다(Windows의 .cmd 심은 execFileSync로 못 띄운다).
  const execPath = process.env['npm_execpath'] ?? '';
  const viaNode = /\.c?js$/.test(execPath);
  const cmd = viaNode ? process.execPath : 'pnpm';
  const pre = viaNode ? [execPath] : [];
  const out = execFileSync(cmd, [...pre, 'licenses', 'list', ...args, '--json'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 << 20,
    shell: !viaNode && process.platform === 'win32',
  });
  return JSON.parse(out) as LicensesJson;
}

export interface WriteNoticesOptions {
  /** 만들 파일(예: public/licenses.txt) */
  out: string;
  /** pnpm licenses list를 실행할 폴더. 기본 process.cwd() */
  cwd?: string;
  appName: string;
  licenseUrl: string;
  appLicense?: string;
  /** 배포본에 라이선스 파일이 없는 패키지의 원문을 둔 폴더 */
  upstreamDir: string;
  /** 고지에 적을 upstreamDir 이름. 기본 'scripts/licenses' */
  upstreamLabel?: string;
  upstream: (name: string) => string | null;
  /** devDependencies지만 런타임 코드가 번들에 들어가는 패키지 */
  bundledDev: (name: string) => boolean;
}

export function writeNotices(o: WriteNoticesOptions): { count: number } {
  const cwd = o.cwd ?? process.cwd();
  const prod = flatten(pnpmLicenses(cwd, ['--prod']));
  const seen = new Set(prod.map((p) => `${p.name}@${p.version}`));
  const extra = flatten(pnpmLicenses(cwd, []), o.bundledDev).filter(
    (p) => !seen.has(`${p.name}@${p.version}`),
  );
  const pkgs = [...prod, ...extra].sort(byNameVersion);
  const text = render(pkgs, {
    head: noticeHead(o.appName, o.licenseUrl, o.appLicense),
    readTexts,
    upstream: o.upstream,
    readUpstream: (file) => {
      try {
        return readFileSync(join(o.upstreamDir, file), 'utf8');
      } catch {
        return null;
      }
    },
    upstreamLabel: o.upstreamLabel ?? 'scripts/licenses',
  });
  mkdirSync(dirname(o.out), { recursive: true });
  const tmp = `${o.out}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, o.out);
  return { count: pkgs.length };
}
```

- [ ] **Step 6: 시험이 통과하는지 본다**

Run: `pnpm vitest run packages/license-notices`
Expected: PASS(10개).

- [ ] **Step 7: README를 쓴다**

`packages/license-notices/README.md`:

````markdown
# @sch0718/license-notices

앱이 쓰는 운영 의존성(과 번들에 들어가는 devDependencies)의 라이선스 전문을 모아 하나의 고지 파일로 만듭니다. 번들러가 라이선스 주석을 지우므로 MIT·BSD·Apache의 고지 의무를 이 파일로 지킵니다. `pnpm licenses list`를 쓰므로 pnpm 프로젝트에서만 동작합니다.

```js
// scripts/build-notices.mjs
import { fileURLToPath } from 'node:url';
import { writeNotices } from '@sch0718/license-notices';

const { count } = writeNotices({
  out: fileURLToPath(new URL('../public/licenses.txt', import.meta.url)),
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  appName: '가즈아',
  licenseUrl: 'https://github.com/sch0718/gazua/blob/main/LICENSE',
  upstreamDir: fileURLToPath(new URL('./licenses/', import.meta.url)),
  upstream: (name) =>
    name === 'firebase' || name.startsWith('@firebase/') ? 'firebase.txt' : null,
  bundledDev: (name) => name === 'svelte' || /^workbox-(?!build$)/.test(name),
});
console.log(`licenses.txt: 패키지 ${count}개`);
```

- 패키지 폴더(없으면 `dist/`)의 `LICENSE*`, `COPYING*`, `NOTICE*` 파일을 싣습니다.
- 배포본에 라이선스 파일이 없는 패키지는 `upstreamDir`에 둔 원문을 싣습니다. 같은 원문은 한 번만 싣습니다. 원문을 찾지 못하면 멈춥니다.
- 임시 파일에 쓴 뒤 이름을 바꿉니다.

라이선스: [PolyForm Noncommercial 1.0.0](./LICENSE)
````

- [ ] **Step 8: 형식·타입·빌드·패키지 검사**

```bash
pnpm prettier --write packages/license-notices
pnpm lint && pnpm typecheck
pnpm --filter @sch0718/license-notices build
pnpm --filter @sch0718/license-notices check:package
```

Expected: 모두 통과. attw 표에 `node16 (from ESM)`과 `bundler`가 🟢.

- [ ] **Step 9: 커밋**

```bash
git add packages/license-notices
git commit -m "feat(license-notices): 라이선스 고지 생성기를 가즈아에서 옮김

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`packages/*/LICENSE`, `dist/`, `.packs/`는 이미 `.gitignore`에 있다. `git status`에 보이지 않아야 한다.

---

### Task 2: `@sch0718/firebase-session/worker`

**Files:**

- Create: `$TK/packages/firebase-session/package.json`
- Create: `$TK/packages/firebase-session/tsconfig.build.json`
- Create: `$TK/packages/firebase-session/migrations/0001_users_sessions.sql`
- Create: `$TK/packages/firebase-session/src/worker/{d1.ts,http.ts,cors.ts,certs.ts,verify.ts,session.ts,index.ts}`
- Create: `$TK/packages/firebase-session/src/worker/{http,cors,verify,session}.test.ts`
- Create: `$TK/packages/firebase-session/test/{d1.ts,tokens.ts}`
- Modify: `$TK/tsconfig.json`(시험 도우미 폴더 포함)
- Modify: `$TK/package.json`(devDependencies)

**Interfaces:**

- Produces(`@sch0718/firebase-session/worker`):
  - `googleCerts(fetchImpl?, now?, url?): CertSource`, `CertSource { key(kid): Promise<CryptoKey | null> }`, `CertsUnavailableError`, `GOOGLE_CERTS_URL`
  - `verifyIdToken(token, { projectId, certs, now, allowedEmails: Set<string> }): Promise<VerifiedUser>`, `VerifiedUser { sub; email; authTime }`, `AuthError(code: 'missing-token'|'invalid-token'|'not-allowed')`, `bearer(req)`, `parseAllowList(raw)`, `CLOCK_SKEW_SEC`
  - `createSessionAuth(SessionAuthOptions): SessionAuth` — `verifiedUser(req)`, `create(req, body)`, `authenticate(req): Promise<AuthContext>`, `list(ctx): Promise<DeviceSessionRow[]>`, `revoke(ctx, { id } | 'current' | 'others'): Promise<number>`
  - `purgeSessions(db, now, limit = 500): Promise<number>`, `publicSessionId(hash)`, `cleanLabel(v, fallback)`, 상수 `SESSION_TTL`, `TOUCH_INTERVAL`, `REAUTH_WINDOW`, `LABEL_MAX`, `KEEP_AFTER_END`, `SESSION_PATHS`, 타입 `AuthContext { userId; sessionHash; user }`, `DeviceSessionRow`
  - `matchOrigin(req, raw)`, `allowedOrigins(raw)`, `corsHeaders(origin)`, `preflight(origin, { methods, headers })`
  - `HttpError(status, code, extra?)`, `json(status, body, headers?)`, `errorBody(code, extra?)`, `readJson(req, max?)`, `MAX_BODY_BYTES`, `sha256Hex`, `base64url`, `isCapability`
  - 타입 `D1Database`, `D1PreparedStatement`, `D1Result`, `D1Meta`
- Task 10에서 가즈아 sync-worker가 이 이름들을 쓴다.

- [ ] **Step 1: 의존성을 더한다**

```bash
cd $TK
pnpm add -D -w jose@6.2.13 firebase@12.19.0 vite@8.3.5
```

`jose`는 패키지의 `dependencies`에도 들어간다(아래 package.json). 루트 devDependency는 시험·타입 검사용이다.

- [ ] **Step 2: 패키지 뼈대**

`packages/firebase-session/package.json`:

```json
{
  "name": "@sch0718/firebase-session",
  "version": "0.0.0",
  "description": "Firebase Google 로그인 + 이메일 허용 목록 + D1 기기 세션. Worker 검증, 브라우저 클라이언트, Vite 빌드 도우미.",
  "license": "PolyForm-Noncommercial-1.0.0",
  "author": "신춘호 (https://github.com/sch0718)",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/sch0718/sch0718-toolkit-web.git",
    "directory": "packages/firebase-session"
  },
  "type": "module",
  "sideEffects": false,
  "exports": {
    "./worker": {
      "types": "./dist/worker/index.d.ts",
      "default": "./dist/worker/index.js"
    },
    "./migrations/0001_users_sessions.sql": "./migrations/0001_users_sessions.sql",
    "./package.json": "./package.json"
  },
  "files": ["dist", "migrations", "LICENSE"],
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json && cp ../../LICENSE LICENSE",
    "check:package": "publint --strict && attw --pack . --profile esm-only"
  },
  "dependencies": {
    "jose": "^6.2.13"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

`./client`, `./vite` 진입점과 peer 의존은 Task 3·4에서 더한다.

`packages/firebase-session/tsconfig.build.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": false,
    "sourceMap": false,
    "types": []
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

루트 `tsconfig.json`의 `include`를 바꾼다:

```json
  "include": ["packages/*/src", "packages/*/test", "vitest.config.ts", "eslint.config.mjs", "scripts"]
```

- [ ] **Step 3: 마이그레이션 SQL**

`packages/firebase-session/migrations/0001_users_sessions.sql`(가즈아 `sync-worker/migrations/0001_init.sql`의 users·sessions 부분과 같다):

```sql
-- @sch0718/firebase-session의 사용자·기기 세션 테이블. 서비스의 migrations/에 복사해 적용한다.
-- 시각은 모두 서버 epoch ms다.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  firebase_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- 세션 원문은 기기에만 있다. 여기에는 SHA-256 hex만 둔다.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id);
```

확인: `diff <(sed -n '/CREATE TABLE users/,/CREATE INDEX sessions_user/p' $GZ_ORIG/sync-worker/migrations/0001_init.sql) <(sed -n '/CREATE TABLE users/,/CREATE INDEX sessions_user/p' packages/firebase-session/migrations/0001_users_sessions.sql)` → 출력 없음.

- [ ] **Step 4: 시험 도우미**

`packages/firebase-session/test/d1.ts`: `$GZ_ORIG/sync-worker/test/d1.ts`를 그대로 복사한 뒤 두 줄을 바꾼다.

```ts
import type { D1Database, D1PreparedStatement, D1Result } from '../src/worker/d1.js';
```

```ts
const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');
```

(두 번째 줄은 원본과 같은 문장이지만 이제 패키지의 `migrations/`를 가리킨다. 그대로 둔다.)

`packages/firebase-session/test/tokens.ts`:

```ts
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
```

- [ ] **Step 5: 실패하는 시험을 쓴다**

`packages/firebase-session/src/worker/verify.test.ts`: `$GZ_ORIG/sync-worker/src/auth/verify.test.ts`를 복사하고 다음을 바꾼다.

- import를 다음으로 바꾼다.

```ts
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importPKCS8, SignJWT, UnsecuredJWT } from 'jose';
import { certs, ME, otherKeys, PROJECT, T0, token } from '../../test/tokens.js';
import { googleCerts, CertsUnavailableError } from './certs.js';
import { verifyIdToken, AuthError, parseAllowList } from './verify.js';

const h = {
  token: (claims?: Record<string, unknown>, o?: Parameters<typeof token>[2]) =>
    token(T0, claims, o),
};
```

- `const h = harness();`와 `const certs = h.deps.certs;` 두 줄을 지운다. 나머지 본문은 그대로 둔다(`h.token(...)`은 위 `h`가 받는다).
- `mkdtempSync(join(tmpdir(), 'gazua-cert-'))` → `'toolkit-cert-'`.
- `pnpm typecheck`에서 `noUncheckedIndexedAccess`·`exactOptionalPropertyTypes` 오류가 나면 `?.`나 `!`로만 고친다. 시험의 기대값은 바꾸지 않는다.

`packages/firebase-session/src/worker/http.test.ts`:

```ts
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
```

`packages/firebase-session/src/worker/cors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { allowedOrigins, corsHeaders, matchOrigin, preflight } from './cors.js';

const req = (origin: string | null) =>
  new Request('https://api.example.test/x', origin === null ? {} : { headers: { Origin: origin } });
const LIST = 'https://app.example.test, https://second.example.test';

describe('CORS', () => {
  it('목록을 콤마로 나누고 공백을 지운다', () => {
    expect(allowedOrigins(` ${LIST} ,`)).toEqual([
      'https://app.example.test',
      'https://second.example.test',
    ]);
  });
  it.each([
    ['https://app.example.test', 'https://app.example.test'],
    ['https://second.example.test', 'https://second.example.test'],
    ['https://app.example.test.evil.test', null],
    ['http://app.example.test', null],
    ['null', null],
    [null, null],
  ])('%s → %s', (origin, expected) => {
    expect(matchOrigin(req(origin), LIST)).toBe(expected);
  });
  it('preflight는 주어진 메서드·헤더만 허용하고 캐시하지 않는다', () => {
    const r = preflight('https://app.example.test', {
      methods: 'GET, POST',
      headers: 'Authorization, X-S',
    });
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.test');
    expect(r.headers.get('Vary')).toBe('Origin');
    expect(r.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST');
    expect(r.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, X-S');
    expect(r.headers.get('Access-Control-Max-Age')).toBe('600');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
  it('corsHeaders', () => {
    expect(corsHeaders('https://a.test')).toEqual({
      'Access-Control-Allow-Origin': 'https://a.test',
      Vary: 'Origin',
    });
  });
});
```

`packages/firebase-session/src/worker/session.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createTestD1 } from '../../test/d1.js';
import { certs, ME, OTHER, PROJECT, T0, token } from '../../test/tokens.js';
import { HttpError } from './http.js';
import {
  createSessionAuth,
  KEEP_AFTER_END,
  purgeSessions,
  REAUTH_WINDOW,
  SESSION_TTL,
  TOUCH_INTERVAL,
} from './session.js';

const HEADER = 'X-Test-Session';
const DAY = 24 * 60 * 60 * 1000;

function setup(o: { allowed?: string | undefined; defaultLabel?: string } = {}) {
  const db = createTestD1();
  const clock = { now: T0 };
  let n = 0;
  const auth = createSessionAuth({
    db,
    projectId: PROJECT,
    allowedEmails: 'allowed' in o ? o.allowed : `${ME},${OTHER.toUpperCase()}`,
    certs,
    sessionHeader: HEADER,
    ...(o.defaultLabel !== undefined && { defaultLabel: o.defaultLabel }),
    now: () => clock.now,
    random: (len) => crypto.getRandomValues(new Uint8Array(len)),
    uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  });
  const req = (headers: Record<string, string> = {}) =>
    new Request('https://api.example.test/v1/x', { headers });
  const bearer = async (claims: Record<string, unknown> = {}) => ({
    Authorization: `Bearer ${await token(clock.now, claims)}`,
  });
  async function login(claims: Record<string, unknown> = {}, label: unknown = '노트북') {
    const { sessionId } = await auth.create(req(await bearer(claims)), { label });
    const as = async () => req({ ...(await bearer(claims)), [HEADER]: sessionId });
    return { sessionId, as };
  }
  return { db, clock, auth, req, bearer, login };
}

const fails = async (p: Promise<unknown>, status: number, code: string) => {
  const e = await p.catch((x: unknown) => x);
  expect(e).toBeInstanceOf(HttpError);
  expect(e).toMatchObject({ status, code });
};

describe('create', () => {
  it('사용자와 세션을 만들고, 세션 원문은 DB에 없다', async () => {
    const s = setup();
    const { sessionId } = await s.login();
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(s.db.raw.prepare('SELECT * FROM sessions').all())).not.toContain(
      sessionId,
    );
    expect(s.db.raw.prepare('SELECT firebase_sub, email FROM users').all()).toEqual([
      { firebase_sub: 'uid-me', email: ME },
    ]);
  });

  it('토큰이 없거나 틀리거나 허용 밖이면 만들지 않는다', async () => {
    const s = setup();
    await fails(s.auth.create(s.req(), {}), 401, 'missing-token');
    await fails(
      s.auth.create(s.req({ Authorization: 'Bearer abc.def.ghi' }), {}),
      401,
      'invalid-token',
    );
    await fails(
      s.auth.create(s.req(await s.bearer({ email: 'stranger@example.test' })), {}),
      403,
      'not-allowed',
    );
    expect(s.db.raw.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 0 });
  });

  it('허용 목록이 비어 있으면 아무도 못 들어온다', async () => {
    const s = setup({ allowed: undefined });
    await fails(s.auth.create(s.req(await s.bearer()), {}), 403, 'not-allowed');
  });

  it('auth_time이 5분보다 오래됐으면 다시 로그인해야 한다', async () => {
    const s = setup();
    const old = Math.floor((s.clock.now - REAUTH_WINDOW - 1000) / 1000);
    await fails(
      s.auth.create(s.req(await s.bearer({ auth_time: old })), {}),
      401,
      'reauth-required',
    );
  });

  it('기기 이름은 40자, 제어 문자를 지우고, 비면 기본 이름', async () => {
    const s = setup();
    await s.login({}, `노트북\u0000${'가'.repeat(60)}`);
    await s.login({}, '   ');
    const labels = s.db.raw.prepare('SELECT label FROM sessions ORDER BY rowid').all() as {
      label: string;
    }[];
    expect([...(labels[0]?.label ?? '')]).toHaveLength(40);
    expect(labels[0]?.label.startsWith('노트북가')).toBe(true);
    expect(labels[1]?.label).toBe('이름 없는 기기');
  });

  it('기본 이름은 서비스가 바꿀 수 있다', async () => {
    const s = setup({ defaultLabel: 'Unnamed device' });
    await s.login({}, undefined);
    expect(s.db.raw.prepare('SELECT label FROM sessions').get()).toEqual({
      label: 'Unnamed device',
    });
  });
});

describe('authenticate', () => {
  it('서비스가 정한 헤더에서 세션을 읽는다', async () => {
    const s = setup();
    const { sessionId } = await s.login();
    const ctx = await s.auth.authenticate(await (await s.login()).as());
    expect(ctx.user.email).toBe(ME);
    await fails(s.auth.authenticate(s.req(await s.bearer())), 401, 'no-session');
    await fails(
      s.auth.authenticate(s.req({ ...(await s.bearer()), 'X-Gazua-Session': sessionId })),
      401,
      'no-session',
    );
  });

  it('형식이 틀리거나 다른 사용자의 세션이면 no-session', async () => {
    const s = setup();
    const other = await s.login({ email: OTHER, sub: 'uid-other' });
    await fails(
      s.auth.authenticate(s.req({ ...(await s.bearer()), [HEADER]: 'x'.repeat(43) })),
      401,
      'no-session',
    );
    await fails(
      s.auth.authenticate(s.req({ ...(await s.bearer()), [HEADER]: 'short' })),
      401,
      'no-session',
    );
    await fails(
      s.auth.authenticate(s.req({ ...(await s.bearer()), [HEADER]: other.sessionId })),
      401,
      'no-session',
    );
  });

  it('마지막 사용 후 30일이 지나면 만료되고, 쓰면 연장된다', async () => {
    const s = setup();
    const me = await s.login();
    s.clock.now += 20 * DAY;
    await s.auth.authenticate(await me.as());
    s.clock.now += 20 * DAY;
    await s.auth.authenticate(await me.as());
    s.clock.now += SESSION_TTL;
    await fails(s.auth.authenticate(await me.as()), 401, 'session-expired');
  });

  it('last_used_at은 갱신 간격마다 한 번만 쓴다', async () => {
    const s = setup();
    const me = await s.login();
    const used = () =>
      (s.db.raw.prepare('SELECT last_used_at AS t FROM sessions').get() as { t: number }).t;
    const t0 = used();
    s.clock.now += TOUCH_INTERVAL / 2;
    await s.auth.authenticate(await me.as());
    expect(used()).toBe(t0);
    s.clock.now += TOUCH_INTERVAL / 2 + 60_000;
    await s.auth.authenticate(await me.as());
    expect(used()).toBe(s.clock.now);
  });
});

describe('list·revoke', () => {
  it('기기 목록, 하나 철회, 이 기기 철회, 다른 기기 모두 철회', async () => {
    const s = setup();
    const a = await s.login({}, '노트북');
    const b = await s.login({}, '휴대폰');
    const c = await s.login({}, '태블릿');
    const ctx = await s.auth.authenticate(await a.as());
    const list = await s.auth.list(ctx);
    expect(list.map((d) => [d.label, d.current]).sort()).toEqual([
      ['노트북', true],
      ['태블릿', false],
      ['휴대폰', false],
    ]);
    expect(list[0]?.expiresAt).toBe(T0 + SESSION_TTL);
    const phone = list.find((d) => d.label === '휴대폰');
    expect(await s.auth.revoke(ctx, { id: phone?.id ?? '' })).toBe(1);
    await fails(s.auth.authenticate(await b.as()), 401, 'session-revoked');
    expect(await s.auth.revoke(ctx, 'others')).toBe(1);
    await fails(s.auth.authenticate(await c.as()), 401, 'session-revoked');
    expect(await s.auth.revoke(ctx, 'current')).toBe(1);
    await fails(s.auth.authenticate(await a.as()), 401, 'session-revoked');
  });

  it('다른 사용자의 기기나 틀린 형식의 ID는 404', async () => {
    const s = setup();
    const a = await s.login();
    const o = await s.login({ email: OTHER, sub: 'uid-other' });
    const octx = await s.auth.authenticate(await o.as());
    const id = (await s.auth.list(octx))[0]?.id ?? '';
    const actx = await s.auth.authenticate(await a.as());
    await fails(s.auth.revoke(actx, { id }), 404, 'not-found');
    await fails(s.auth.revoke(actx, { id: 'ZZZ' }), 404, 'not-found');
  });
});

describe('purgeSessions', () => {
  it('철회 후 보관 기간이 지난 것, 만료 후 보관 기간이 지난 것만 지운다', async () => {
    const s = setup();
    const a = await s.login({}, 'a');
    await s.login({}, 'b');
    await s.login({}, 'c');
    const ctx = await s.auth.authenticate(await a.as());
    await s.auth.revoke(ctx, 'current');
    expect(await purgeSessions(s.db, T0 + KEEP_AFTER_END - 1)).toBe(0);
    expect(await purgeSessions(s.db, T0 + KEEP_AFTER_END)).toBe(1);
    expect(await purgeSessions(s.db, T0 + KEEP_AFTER_END + SESSION_TTL)).toBe(2);
  });

  it('한 번에 limit개까지만 지운다', async () => {
    const s = setup();
    for (const l of ['a', 'b', 'c']) await s.login({}, l);
    expect(await purgeSessions(s.db, T0 + KEEP_AFTER_END + SESSION_TTL, 2)).toBe(2);
  });
});

describe('마이그레이션', () => {
  it('패키지가 users·sessions 스키마를 배포한다', () => {
    const sql = readFileSync(
      new URL('../../migrations/0001_users_sessions.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE users');
    expect(sql).toContain('CREATE TABLE sessions');
  });
});
```

- [ ] **Step 6: 시험이 실패하는지 본다**

Run: `pnpm vitest run packages/firebase-session`
Expected: FAIL, `./http.js` 등을 찾지 못한다.

- [ ] **Step 7: 그대로 옮기는 파일**

각 파일을 복사하고 아래만 바꾼다. 주석은 그대로 둔다.

| 만들 파일              | 원본                                      | 바꿀 것                                                                                                       |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/worker/d1.ts`     | `$GZ_ORIG/sync-worker/src/db.ts`          | 첫 줄 주석을 `// Worker가 쓰는 D1 기능만 적은 타입. @cloudflare/workers-types 전역 없이도 쓸 수 있게 한다.`로 |
| `src/worker/http.ts`   | `$GZ_ORIG/sync-worker/src/http.ts`        | 없음                                                                                                          |
| `src/worker/certs.ts`  | `$GZ_ORIG/sync-worker/src/auth/certs.ts`  | 없음                                                                                                          |
| `src/worker/verify.ts` | `$GZ_ORIG/sync-worker/src/auth/verify.ts` | `from './certs'` → `from './certs.js'`. 아래 strictest 수정                                                   |

`src/worker/verify.ts`의 strictest 수정(`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`):

```ts
export function bearer(req: Request): string | null {
  const h = req.headers.get('Authorization');
  const m = h ? /^Bearer ([A-Za-z0-9_.-]+)$/.exec(h) : null;
  return m?.[1] ?? null;
}
```

```ts
const nowSec = opts.now / 1000;
const iat = payload['iat'];
const authTime = payload['auth_time'];
const sub = payload['sub'];
```

```ts
const email = typeof payload['email'] === 'string' ? payload['email'].toLowerCase() : '';
if (payload['email_verified'] !== true || !email || !opts.allowedEmails.has(email))
  throw new AuthError('not-allowed');
```

`src/worker/cors.ts`(가즈아 `cors.ts`에서 가즈아 전용 상수를 빼고 인자로):

```ts
// 정확한 앱 출처만 허용한다. CORS는 브라우저 보호일 뿐 인증을 대신하지 않는다(개인 API는 토큰·세션을 따로 검사).

export function allowedOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 요청 출처가 목록과 정확히 같으면 그 출처, 아니면 null. */
export function matchOrigin(req: Request, raw: string): string | null {
  const origin = req.headers.get('Origin');
  return origin !== null && allowedOrigins(raw).includes(origin) ? origin : null;
}

export function corsHeaders(origin: string): Record<string, string> {
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

/** methods·headers는 서비스가 정한다(예: 'GET, POST', 'Authorization, Content-Type, X-Session'). */
export function preflight(origin: string, allow: { methods: string; headers: string }): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      'Access-Control-Allow-Methods': allow.methods,
      'Access-Control-Allow-Headers': allow.headers,
      'Access-Control-Max-Age': '600',
      'Cache-Control': 'no-store',
    },
  });
}
```

- [ ] **Step 8: 세션 모듈**

`src/worker/session.ts`(가즈아 `session.ts`와 `purge.ts`의 세션 부분. SQL·상수는 그대로):

```ts
// D1 자체 세션: 기기별, 마지막 사용 후 30일 슬라이딩 만료, 기기별·전체 철회.
// 세션 원문은 기기에만 있고 D1에는 SHA-256 hex만 둔다. 매 요청에서 ID 토큰과 세션을 둘 다 검사한다.
// 테이블: migrations/0001_users_sessions.sql
import type { CertSource } from './certs.js';
import type { D1Database, D1Result } from './d1.js';
import { base64url, HttpError, sha256Hex } from './http.js';
import { AuthError, bearer, parseAllowList, verifyIdToken, type VerifiedUser } from './verify.js';

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL = 30 * DAY;
/** last_used_at 갱신 간격. D1 쓰기를 아낀다. */
export const TOUCH_INTERVAL = 60 * 60 * 1000;
/** 새 세션은 방금 Google 로그인을 거친 토큰으로만 만든다(철회된 기기가 갱신 토큰만으로 돌아오지 못하게). */
export const REAUTH_WINDOW = 5 * 60 * 1000;
export const LABEL_MAX = 40;
/** 만료·철회된 세션도 이 기간 뒤에 지운다(그동안은 목록에서 상태를 볼 수 있다). */
export const KEEP_AFTER_END = 30 * DAY;
/** 세션 엔드포인트. 라우팅은 서비스가 한다. */
export const SESSION_PATHS = {
  /** POST: 만들기, DELETE: 이 기기 철회 */
  session: '/v1/session',
  /** GET: 목록, DELETE ?others=1: 다른 기기 모두 철회, DELETE /:id: 하나 철회 */
  sessions: '/v1/sessions',
} as const;

export interface AuthContext {
  userId: string;
  sessionHash: string;
  user: VerifiedUser;
}

export interface DeviceSessionRow {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  current: boolean;
}

export interface SessionAuthOptions {
  db: D1Database;
  /** Firebase 프로젝트 ID. 토큰의 aud·iss를 이것으로 검사한다. */
  projectId: string;
  /** 콤마로 구분한 허용 이메일(secret). 비어 있으면 아무도 들어오지 못한다. */
  allowedEmails: string | undefined;
  certs: CertSource;
  /** 기기 세션을 실어 오는 요청 헤더 이름(예: 'X-Gazua-Session'). */
  sessionHeader: string;
  /** 기기 이름이 비었을 때. 기본 '이름 없는 기기' */
  defaultLabel?: string;
  now: () => number;
  /** n바이트 무작위 값 */
  random: (n: number) => Uint8Array;
  uuid: () => string;
}

export interface SessionAuth {
  /** 토큰 검증 + 허용 목록. 실패는 HttpError(401·403)로 바꾼다. */
  verifiedUser(req: Request): Promise<VerifiedUser>;
  /** POST /v1/session. 사용자를 만들거나 갱신하고 새 세션을 돌려준다. */
  create(req: Request, body: unknown): Promise<{ sessionId: string; expiresAt: number }>;
  /** 개인 API 공통 검사: 토큰·허용 목록·세션(같은 사용자, 철회·만료 아님). */
  authenticate(req: Request): Promise<AuthContext>;
  list(ctx: AuthContext): Promise<DeviceSessionRow[]>;
  /** 기기 하나(공개 ID), 이 기기(current), 또는 이 기기를 뺀 전부(others)를 철회한다. */
  revoke(ctx: AuthContext, target: { id: string } | 'current' | 'others'): Promise<number>;
}

export const publicSessionId = (hash: string) => hash.slice(0, 12);

export function cleanLabel(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  return [...s].slice(0, LABEL_MAX).join('') || fallback;
}

export function createSessionAuth(o: SessionAuthOptions): SessionAuth {
  const defaultLabel = o.defaultLabel ?? '이름 없는 기기';

  async function verifiedUser(req: Request): Promise<VerifiedUser> {
    const token = bearer(req);
    if (!token) throw new HttpError(401, 'missing-token');
    try {
      return await verifyIdToken(token, {
        projectId: o.projectId,
        certs: o.certs,
        now: o.now(),
        allowedEmails: parseAllowList(o.allowedEmails),
      });
    } catch (e) {
      if (e instanceof AuthError) throw new HttpError(e.code === 'not-allowed' ? 403 : 401, e.code);
      throw e;
    }
  }

  return {
    verifiedUser,

    async create(req, body) {
      const user = await verifiedUser(req);
      const now = o.now();
      if (now - user.authTime > REAUTH_WINDOW) throw new HttpError(401, 'reauth-required');
      const raw =
        typeof body === 'object' && body !== null ? (body as { label?: unknown }).label : undefined;
      const label = cleanLabel(raw, defaultLabel);
      const row = await o.db
        .prepare(
          `INSERT INTO users (id, firebase_sub, email, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (firebase_sub) DO UPDATE SET email = excluded.email, last_seen_at = excluded.last_seen_at
     RETURNING id`,
        )
        .bind(o.uuid(), user.sub, user.email, now, now)
        .first<{ id: string }>();
      if (!row) throw new Error('users upsert returned no row');
      const sessionId = base64url(o.random(32));
      await o.db
        .prepare(
          'INSERT INTO sessions (id_hash, user_id, label, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(await sha256Hex(sessionId), row.id, label, now, now)
        .run();
      return { sessionId, expiresAt: now + SESSION_TTL };
    },

    async authenticate(req) {
      const user = await verifiedUser(req);
      const raw = req.headers.get(o.sessionHeader);
      if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new HttpError(401, 'no-session');
      const hash = await sha256Hex(raw);
      const row = await o.db
        .prepare(
          `SELECT s.user_id AS userId, s.last_used_at AS lastUsedAt, s.revoked_at AS revokedAt
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = ? AND u.firebase_sub = ?`,
        )
        .bind(hash, user.sub)
        .first<{ userId: string; lastUsedAt: number; revokedAt: number | null }>();
      if (!row) throw new HttpError(401, 'no-session');
      if (row.revokedAt !== null) throw new HttpError(401, 'session-revoked');
      const now = o.now();
      if (row.lastUsedAt + SESSION_TTL <= now) throw new HttpError(401, 'session-expired');
      if (now - row.lastUsedAt >= TOUCH_INTERVAL) {
        await o.db
          .prepare('UPDATE sessions SET last_used_at = ? WHERE id_hash = ?')
          .bind(now, hash)
          .run();
      }
      return { userId: row.userId, sessionHash: hash, user };
    },

    async list(ctx) {
      const now = o.now();
      const { results } = await o.db
        .prepare(
          `SELECT id_hash AS hash, label, created_at AS createdAt, last_used_at AS lastUsedAt
     FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND last_used_at > ? ORDER BY last_used_at DESC`,
        )
        .bind(ctx.userId, now - SESSION_TTL)
        .all<{ hash: string; label: string; createdAt: number; lastUsedAt: number }>();
      return results.map((r) => ({
        id: publicSessionId(r.hash),
        label: r.label,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
        expiresAt: r.lastUsedAt + SESSION_TTL,
        current: r.hash === ctx.sessionHash,
      }));
    },

    async revoke(ctx, target) {
      const now = o.now();
      const db = o.db;
      let r: D1Result;
      if (target === 'current') {
        r = await db
          .prepare('UPDATE sessions SET revoked_at = ? WHERE id_hash = ? AND revoked_at IS NULL')
          .bind(now, ctx.sessionHash)
          .run();
      } else if (target === 'others') {
        r = await db
          .prepare(
            'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id_hash <> ? AND revoked_at IS NULL',
          )
          .bind(now, ctx.userId, ctx.sessionHash)
          .run();
      } else {
        if (!/^[0-9a-f]{12}$/.test(target.id)) throw new HttpError(404, 'not-found');
        r = await db
          .prepare(
            'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND substr(id_hash, 1, 12) = ? AND revoked_at IS NULL',
          )
          .bind(now, ctx.userId, target.id)
          .run();
        if (r.meta.changes === 0) throw new HttpError(404, 'not-found');
      }
      return r.meta.changes;
    },
  };
}

/** 만료·철회 후 KEEP_AFTER_END가 지난 세션을 한 번에 limit개까지 지운다(무료 쓰기 한도를 아낀다). */
export async function purgeSessions(db: D1Database, now: number, limit = 500): Promise<number> {
  const old = now - KEEP_AFTER_END;
  const r = await db
    .prepare(
      `DELETE FROM sessions WHERE id_hash IN (SELECT id_hash FROM sessions WHERE last_used_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?) LIMIT ?)`,
    )
    .bind(old - SESSION_TTL, old, limit)
    .run();
  return r.meta.changes;
}
```

`src/worker/index.ts`:

```ts
export { CertsUnavailableError, GOOGLE_CERTS_URL, googleCerts, type CertSource } from './certs.js';
export { allowedOrigins, corsHeaders, matchOrigin, preflight } from './cors.js';
export type { D1Database, D1Meta, D1PreparedStatement, D1Result } from './d1.js';
export {
  base64url,
  errorBody,
  HttpError,
  isCapability,
  json,
  MAX_BODY_BYTES,
  readJson,
  sha256Hex,
} from './http.js';
export {
  cleanLabel,
  createSessionAuth,
  KEEP_AFTER_END,
  LABEL_MAX,
  publicSessionId,
  purgeSessions,
  REAUTH_WINDOW,
  SESSION_PATHS,
  SESSION_TTL,
  TOUCH_INTERVAL,
  type AuthContext,
  type DeviceSessionRow,
  type SessionAuth,
  type SessionAuthOptions,
} from './session.js';
export {
  AuthError,
  bearer,
  CLOCK_SKEW_SEC,
  parseAllowList,
  verifyIdToken,
  type VerifiedUser,
} from './verify.js';
```

- [ ] **Step 9: 시험이 통과하는지 본다**

Run: `pnpm vitest run packages/firebase-session`
Expected: PASS. `verifyIdToken` 시간 측정 로그가 한 줄 나온다.

- [ ] **Step 10: 형식·타입·빌드·패키지 검사**

```bash
pnpm prettier --write packages/firebase-session
pnpm lint && pnpm typecheck
pnpm --filter @sch0718/firebase-session build
pnpm --filter @sch0718/firebase-session check:package
```

Expected: 통과. attw가 `./migrations/0001_users_sessions.sql`을 진입점으로 보고 오류를 내면 `check:package`를 `publint --strict && attw --pack . --profile esm-only --exclude-entrypoints ./migrations/0001_users_sessions.sql`로 바꾸고 다시 돌린다.

- [ ] **Step 11: 커밋**

```bash
git add package.json pnpm-lock.yaml tsconfig.json packages/firebase-session
git commit -m "feat(firebase-session): Worker 쪽 ID 토큰 검증·기기 세션·CORS·HTTP 도우미를 가즈아에서 옮김

세션 헤더 이름·허용 출처·허용 이메일은 서비스가 넘긴다. users·sessions 마이그레이션 SQL을 함께 배포한다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `@sch0718/firebase-session/client`

**Files:**

- Create: `$TK/packages/firebase-session/src/client/{config.ts,auth.ts,firebaseImpl.ts,api.ts,index.ts}`
- Create: `$TK/packages/firebase-session/src/client/{config,auth,api}.test.ts`
- Modify: `$TK/packages/firebase-session/package.json`

**Interfaces:**

- Consumes: 없음(`./worker`와 서로 import하지 않는다).
- Produces(`@sch0718/firebase-session/client`):
  - `readSyncConfig(env: Record<string, string | boolean | undefined>): SyncConfig | null`, `SyncConfig { apiUrl; firebase: FirebaseConfig }`, `FirebaseConfig { apiKey; authDomain; projectId; appId }`
  - `firebaseAuth(cfg: FirebaseConfig, load?): AuthClient`, `AuthClient`, `AuthUser { uid; email }`, `SignInResult { user; idToken }`, `FirebaseImplModule`
  - `createSessionClient<X extends Fail = never>(opts): SessionClient<X>`, `SessionClient<X>.send<T>(method, path, SendOptions?)`, `.createSession`, `.endSession`, `.listSessions`, `.revokeSession`
  - 타입 `BaseFail`, `Fail { ok: false; kind: string }`, `ApiResult<T, F = BaseFail>`, `Credentials`, `DeviceSession`, `SendOptions`, 상수 `AUTH_CODES`
- Task 11에서 가즈아 `src/lib/sync/{config,auth,api}.ts`가 쓴다.

- [ ] **Step 1: 진입점과 peer 의존을 더한다**

`packages/firebase-session/package.json`의 `exports`에 `./client`를 더하고(`./worker` 다음), `peerDependencies`를 더한다.

```json
    "./client": {
      "types": "./dist/client/index.d.ts",
      "default": "./dist/client/index.js"
    },
```

```json
  "peerDependencies": {
    "firebase": "^12.0.0 || ^13.0.0"
  },
  "peerDependenciesMeta": {
    "firebase": {
      "optional": true
    }
  },
```

- [ ] **Step 2: 실패하는 시험을 쓴다**

`src/client/config.test.ts`: `$GZ_ORIG/src/lib/sync/config.test.ts`를 복사하고 import만 `import { readSyncConfig } from './config.js';`로 바꾼다.

`src/client/auth.test.ts`: `$GZ_ORIG/src/lib/sync/auth.test.ts`를 복사하고 import를 `import { firebaseAuth } from './auth.js';`로 바꾼다. 본문의 `impl` 객체는 그대로 두되 `getAuthFor: () => ({})`가 타입에 맞지 않으면 `firebaseAuth(CFG, load as never)`로 넘긴다.

`src/client/api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createSessionClient, type Credentials } from './api.js';

const BASE = 'https://sync.example.test/';
const creds = (o: Partial<Credentials> = {}): Credentials => ({
  idToken: async (force) => (force ? 'fresh' : 'tok'),
  sessionId: async () => 's1',
  ...o,
});
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

function client(fetchImpl: typeof fetch, c = creds()) {
  return createSessionClient({
    baseUrl: BASE,
    credentials: c,
    sessionHeader: 'X-Test-Session',
    fetch: fetchImpl,
  });
}

describe('createSessionClient', () => {
  it('토큰과 서비스가 정한 세션 헤더를 붙이고, 쿠키·리퍼러·캐시 없이 보낸다', async () => {
    const f = vi.fn(async () => reply(200, { sessions: [] }));
    expect(await client(f).listSessions()).toEqual({ ok: true, data: { sessions: [] } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sync.example.test/v1/sessions');
    expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'X-Test-Session': 's1' });
    expect(init).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  });

  it('createSession은 넘겨받은 토큰만 쓰고 세션 헤더를 붙이지 않는다', async () => {
    const f = vi.fn(async () => reply(200, { sessionId: 'x', expiresAt: 1 }));
    await client(f).createSession('login-token', '노트북');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sync.example.test/v1/session');
    expect(init.headers).toEqual({
      Authorization: 'Bearer login-token',
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe(JSON.stringify({ label: '노트북' }));
  });

  it('revokeSession: others와 ID', async () => {
    const f = vi.fn(async () => reply(200, { revoked: 1 }));
    await client(f).revokeSession('others');
    await client(f).revokeSession('a/b');
    expect(f.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      'https://sync.example.test/v1/sessions?others=1',
      'https://sync.example.test/v1/sessions/a%2Fb',
    ]);
  });

  // 가즈아 Codex 리뷰(PR #39) 3: 오프라인에서 토큰 갱신이 실패해도 예외로 새지 않는다.
  it('ID 토큰을 받다 실패하면 offline', async () => {
    const f = vi.fn();
    const c = client(
      f,
      creds({ idToken: async () => Promise.reject(new Error('auth/network-request-failed')) }),
    );
    expect(await c.listSessions()).toEqual({ ok: false, kind: 'offline' });
    expect(f).not.toHaveBeenCalled();
  });

  it('fetch가 실패하면 offline', async () => {
    const c = client(vi.fn(async () => Promise.reject(new TypeError('network'))));
    expect(await c.endSession()).toEqual({ ok: false, kind: 'offline' });
  });

  it('로그인돼 있지 않거나 세션이 없으면 보내지 않는다', async () => {
    const f = vi.fn();
    expect(await client(f, creds({ idToken: async () => null })).listSessions()).toEqual({
      ok: false,
      kind: 'auth',
      code: 'missing-token',
    });
    expect(await client(f, creds({ sessionId: async () => null })).listSessions()).toEqual({
      ok: false,
      kind: 'auth',
      code: 'no-session',
    });
    expect(f).not.toHaveBeenCalled();
  });

  it('invalid-token이면 토큰을 한 번 새로 받아 다시 보낸다', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply(401, { error: 'invalid-token' }))
      .mockResolvedValueOnce(reply(200, {}));
    expect((await client(f).listSessions()).ok).toBe(true);
    expect((f.mock.calls[1] as unknown as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer fresh',
    });
  });

  it('인증 실패에는 그 요청이 쓴 세션을 실어 준다', async () => {
    const f = vi.fn(async () => reply(401, { error: 'session-revoked' }));
    expect(await client(f).listSessions()).toEqual({
      ok: false,
      kind: 'auth',
      code: 'session-revoked',
      session: 's1',
    });
  });

  it.each([
    [401, { error: 'weird' }, { ok: false, kind: 'auth', code: 'invalid-token' }],
    [403, { error: 'not-allowed' }, { ok: false, kind: 'not-allowed' }],
    [403, { error: 'origin' }, { ok: false, kind: 'server', status: 403 }],
    [404, undefined, { ok: false, kind: 'not-found' }],
    [413, undefined, { ok: false, kind: 'invalid', code: 'too-large' }],
    [422, { error: 'bad', path: 'a.b' }, { ok: false, kind: 'invalid', code: 'bad', path: 'a.b' }],
    [429, undefined, { ok: false, kind: 'limit', code: '429' }],
    [503, { error: 'certs-unavailable' }, { ok: false, kind: 'limit', code: 'certs-unavailable' }],
    [500, undefined, { ok: false, kind: 'server', status: 500 }],
  ])('%i %j → %j', async (status, body, expected) => {
    const r = await client(vi.fn(async () => reply(status, body))).send('GET', '/x', {
      auth: 'none',
    });
    expect(r).toEqual(expected);
  });

  it('mapStatus가 돌려준 서비스 고유 실패가 공통 매핑보다 먼저다', async () => {
    const c = createSessionClient<{ ok: false; kind: 'conflict'; revision: number }>({
      baseUrl: BASE,
      credentials: creds(),
      sessionHeader: 'X-Test-Session',
      fetch: vi.fn(async () => reply(409, { revision: 7 })),
      mapStatus: (status, body) =>
        status === 409
          ? { ok: false, kind: 'conflict', revision: Number(body['revision']) }
          : undefined,
    });
    expect(await c.send('PUT', '/p')).toEqual({ ok: false, kind: 'conflict', revision: 7 });
  });

  it("auth 'none'은 토큰 없이 보낸다", async () => {
    const f = vi.fn(async () => reply(200, {}));
    await client(f, creds({ idToken: async () => null })).send('GET', '/public', {
      auth: 'none',
      headers: { 'X-Share-Token': 'c' },
    });
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({
      'X-Share-Token': 'c',
    });
  });
});
```

- [ ] **Step 3: 시험이 실패하는지 본다**

Run: `pnpm vitest run packages/firebase-session/src/client`
Expected: FAIL, 모듈을 찾지 못한다.

- [ ] **Step 4: 설정과 인증 클라이언트**

`src/client/config.ts`(가즈아 `config.ts`. `import.meta.env` 기본값만 뺐다):

```ts
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
```

`src/client/auth.ts`:

```ts
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
```

`src/client/firebaseImpl.ts`: `$GZ_ORIG/src/lib/sync/firebaseImpl.ts`를 복사하고 다음만 바꾼다.

```ts
import type { FirebaseConfig } from './config.js';
import type { AuthUser, SignInResult } from './auth.js';
```

- `getAuthFor(cfg: SyncConfig['firebase'])` → `getAuthFor(cfg: FirebaseConfig)`
- `Promise<{ user: AuthUser; idToken: string } | 'redirect' | null>` → `Promise<SignInResult | 'redirect' | null>`
- `Promise<{ user: AuthUser; idToken: string } | null>` → `Promise<SignInResult | null>`
- 첫 줄 주석: `// Firebase 웹 SDK 호출부. auth.ts가 동적 import해서 별도 청크가 된다.`(그대로)

- [ ] **Step 5: API 클라이언트**

`src/client/api.ts`(가즈아 `api.ts`의 `toResult`·`send`와 세션 메서드):

```ts
// 토큰·기기 세션을 붙여 Worker를 부르는 HTTP 클라이언트. 응답을 몇 가지 결과로 나눈다.
// ID 토큰은 매 요청 Authorization: Bearer로, 기기 세션은 서비스가 정한 헤더로 보낸다. 토큰·세션은 로그에 남기지 않는다.

export type BaseFail =
  /** 다시 로그인해야 한다. code: missing-token·invalid-token·no-session·session-revoked·session-expired·reauth-required */
  /** session: 실패한 요청이 쓴 기기 세션(그 사이 새로 로그인했으면 이 실패는 무시해야 한다). */
  | { ok: false; kind: 'auth'; code: string; session?: string }
  | { ok: false; kind: 'not-allowed' }
  | { ok: false; kind: 'offline' }
  /** 서비스 한도·무료 한도 초과(429·503) */
  | { ok: false; kind: 'limit'; code: string }
  | { ok: false; kind: 'invalid'; code: string; path?: string }
  | { ok: false; kind: 'not-found' }
  | { ok: false; kind: 'server'; status: number };

/** 서비스 고유 실패(mapStatus가 만든다)의 최소 모양 */
export interface Fail {
  ok: false;
  kind: string;
}

export type ApiResult<T, F = BaseFail> = { ok: true; data: T } | F;

export interface Credentials {
  /** forceRefresh면 SDK에서 새 ID 토큰을 받는다. 로그인돼 있지 않으면 null. */
  idToken(forceRefresh?: boolean): Promise<string | null>;
  sessionId(): Promise<string | null>;
}

export interface DeviceSession {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  current: boolean;
}

export interface SendOptions {
  body?: unknown;
  /** session: 토큰+세션(기본), token: 토큰만, none: 둘 다 없이 */
  auth?: 'session' | 'token' | 'none';
  headers?: Record<string, string>;
  /** 이 토큰을 그대로 쓴다(새로 받지 않는다). 세션 만들기에 쓴다. */
  token?: string;
}

export interface SessionClientOptions<X extends Fail> {
  baseUrl: string;
  credentials: Credentials;
  sessionHeader: string;
  fetch?: typeof fetch;
  /** 공통 매핑 전에 불린다. 서비스 고유 상태(예: 409 conflict)를 바꾼다. undefined면 공통 매핑. */
  mapStatus?: (status: number, body: Record<string, unknown>) => X | undefined;
}

export interface SessionClient<X extends Fail = never> {
  send<T>(method: string, path: string, opts?: SendOptions): Promise<ApiResult<T, BaseFail | X>>;
  createSession(
    idToken: string,
    label: string,
  ): Promise<ApiResult<{ sessionId: string; expiresAt: number }, BaseFail | X>>;
  endSession(): Promise<ApiResult<unknown, BaseFail | X>>;
  listSessions(): Promise<ApiResult<{ sessions: DeviceSession[] }, BaseFail | X>>;
  revokeSession(id: string | 'others'): Promise<ApiResult<{ revoked: number }, BaseFail | X>>;
}

export const AUTH_CODES = new Set([
  'missing-token',
  'invalid-token',
  'no-session',
  'session-revoked',
  'session-expired',
  'reauth-required',
]);

type AuthFail = Extract<BaseFail, { kind: 'auth' }>;
const isAuthFail = (r: { ok: boolean; kind?: string }): r is AuthFail => !r.ok && r.kind === 'auth';

async function toResult<T, X extends Fail>(
  res: Response,
  mapStatus: SessionClientOptions<X>['mapStatus'],
): Promise<ApiResult<T, BaseFail | X>> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // 본문이 없거나 JSON이 아니다
  }
  if (res.ok) return { ok: true, data: body as T };
  const mapped = mapStatus?.(res.status, body);
  if (mapped) return mapped;
  const code = typeof body['error'] === 'string' ? body['error'] : '';
  switch (res.status) {
    case 401:
      return { ok: false, kind: 'auth', code: AUTH_CODES.has(code) ? code : 'invalid-token' };
    case 403:
      return code === 'not-allowed'
        ? { ok: false, kind: 'not-allowed' }
        : { ok: false, kind: 'server', status: 403 };
    case 404:
      return { ok: false, kind: 'not-found' };
    case 413:
      return { ok: false, kind: 'invalid', code: 'too-large' };
    case 422: {
      const path = body['path'];
      return {
        ok: false,
        kind: 'invalid',
        code: code || 'invalid',
        ...(typeof path === 'string' && { path }),
      };
    }
    case 429:
    case 503:
      return { ok: false, kind: 'limit', code: code || String(res.status) };
    default:
      return { ok: false, kind: 'server', status: res.status };
  }
}

export function createSessionClient<X extends Fail = never>(
  o: SessionClientOptions<X>,
): SessionClient<X> {
  const base = o.baseUrl.replace(/\/+$/, '');
  const fetchImpl = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function send<T>(
    method: string,
    path: string,
    opts: SendOptions = {},
  ): Promise<ApiResult<T, BaseFail | X>> {
    const auth = opts.auth ?? 'session';
    const attempt = async (force: boolean): Promise<ApiResult<T, BaseFail | X>> => {
      const headers: Record<string, string> = { ...opts.headers };
      let used: string | null = null; // 이 요청이 쓴 기기 세션
      if (auth !== 'none') {
        // 토큰 갱신은 네트워크를 쓴다(오프라인이면 예외). 예외로 새지 않게 offline 실패로 바꿔 부르는 쪽의 재시도에 맡긴다.
        let token: string | null;
        let s: string | null = null;
        try {
          token = opts.token ?? (await o.credentials.idToken(force));
          if (token && auth === 'session') s = await o.credentials.sessionId();
        } catch {
          return { ok: false, kind: 'offline' };
        }
        if (!token) return { ok: false, kind: 'auth', code: 'missing-token' };
        headers['Authorization'] = `Bearer ${token}`;
        if (auth === 'session') {
          if (!s) return { ok: false, kind: 'auth', code: 'no-session' };
          headers[o.sessionHeader] = s;
          used = s;
        }
      }
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      let res: Response;
      try {
        res = await fetchImpl(base + path, {
          method,
          headers,
          ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
      } catch {
        return { ok: false, kind: 'offline' };
      }
      const r = await toResult<T, X>(res, o.mapStatus);
      if (isAuthFail(r) && used) return { ...r, session: used };
      return r;
    };
    const first = await attempt(false);
    // 만료 직전에 받은 ID 토큰이면 한 번만 새로 받아 다시 보낸다
    if (isAuthFail(first) && first.code === 'invalid-token' && auth !== 'none' && !opts.token)
      return attempt(true);
    return first;
  }

  const enc = encodeURIComponent;
  return {
    send,
    createSession: (idToken, label) =>
      send('POST', '/v1/session', { auth: 'token', token: idToken, body: { label } }),
    endSession: () => send('DELETE', '/v1/session'),
    listSessions: () => send('GET', '/v1/sessions'),
    revokeSession: (id) =>
      id === 'others'
        ? send('DELETE', '/v1/sessions?others=1')
        : send('DELETE', `/v1/sessions/${enc(id)}`),
  };
}
```

`src/client/index.ts`:

```ts
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
```

- [ ] **Step 6: 시험이 통과하는지 본다**

Run: `pnpm vitest run packages/firebase-session`
Expected: PASS(worker·client 모두).

- [ ] **Step 7: 공개 타입에 firebase가 없는지 확인한다**

```bash
pnpm --filter @sch0718/firebase-session build
grep -l "firebase/" packages/firebase-session/dist/client/*.d.ts
```

Expected: `firebaseImpl.d.ts`만 나온다. `index.d.ts`, `auth.d.ts`, `api.d.ts`, `config.d.ts`에는 없어야 한다.

- [ ] **Step 8: 형식·타입·패키지 검사**

```bash
pnpm prettier --write packages/firebase-session
pnpm lint && pnpm typecheck
pnpm --filter @sch0718/firebase-session check:package
```

Expected: 통과.

- [ ] **Step 9: 커밋**

```bash
git add packages/firebase-session
git commit -m "feat(firebase-session): 브라우저 쪽 설정·Firebase 로그인·세션 API 클라이언트를 가즈아에서 옮김

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `@sch0718/firebase-session/vite`

**Files:**

- Create: `$TK/packages/firebase-session/src/vite/{authHelper.ts,csp.ts,index.ts}`
- Create: `$TK/packages/firebase-session/src/vite/{authHelper,csp}.test.ts`
- Modify: `$TK/packages/firebase-session/package.json`

**Interfaces:**

- Produces(`@sch0718/firebase-session/vite`): `firebaseAuthHelper(opts?: { fetch?: FetchFn }): Plugin`(name `sch0718-firebase-auth-helper`, apply `build`), `firebaseCsp(): Plugin`(name `sch0718-firebase-csp`), `fetchAuthHelper(projectId, fetchFn?)`, `selfHostsAuthHelper(authDomain)`, `applyFirebaseCsp(html, authDomain)`, `AUTH_HELPER_FILES`, `FIREBASE_SCRIPT_SOURCES`, `AUTH_GLOB_IGNORES: string[]`(`['assets/firebaseImpl-*.js', '__/**']`), `AUTH_NAVIGATE_DENYLIST: RegExp[]`(`[/^\/__\//]`)
- Task 9에서 가즈아 `vite.config.ts`·`pwa.config.ts`가 쓴다.

- [ ] **Step 1: 진입점과 peer 의존**

`exports`에 `./vite`를 더하고, `peerDependencies`·`peerDependenciesMeta`에 vite를 더한다.

```json
    "./vite": {
      "types": "./dist/vite/index.d.ts",
      "default": "./dist/vite/index.js"
    },
```

```json
  "peerDependencies": {
    "firebase": "^12.0.0 || ^13.0.0",
    "vite": "^6.0.0 || ^7.0.0 || ^8.0.0"
  },
  "peerDependenciesMeta": {
    "firebase": { "optional": true },
    "vite": { "optional": true }
  },
```

- [ ] **Step 2: 실패하는 시험을 쓴다**

`src/vite/authHelper.test.ts`: `$GZ_ORIG/auth-helper.config.test.ts`를 복사하고 다음을 바꾼다.

- import: `import { AUTH_HELPER_FILES, fetchAuthHelper, firebaseAuthHelper, selfHostsAuthHelper } from './authHelper.js';`
- `describe('authHelperPlugin', ...)` 블록을 아래로 바꾼다.
- `files[0].source` → `files[0]?.source`, `url.split('/').pop()!`은 그대로.

```ts
describe('firebaseAuthHelper', () => {
  const run = async (env: Record<string, string>) => {
    const { fn } = fakeFetch();
    const p = firebaseAuthHelper({ fetch: fn });
    const emitted: { fileName: string }[] = [];
    (p.configResolved as unknown as (c: unknown) => void)({ env });
    await (p.generateBundle as unknown as (this: unknown) => Promise<void>).call({
      emitFile: (f: { fileName: string }) => emitted.push(f),
    });
    return emitted.map((f) => f.fileName);
  };

  it('빌드에서만 돈다', () => {
    const p = firebaseAuthHelper();
    expect(p.apply).toBe('build');
    expect(p.name).toBe('sch0718-firebase-auth-helper');
  });

  it('앱 도메인이 authDomain이면 도우미 다섯 파일을 내보낸다', async () => {
    expect(
      await run({
        VITE_FIREBASE_AUTH_DOMAIN: 'app.example.test',
        VITE_FIREBASE_PROJECT_ID: 'toolkit-test',
      }),
    ).toHaveLength(5);
  });

  it('Firebase 호스팅 authDomain이거나 프로젝트 ID가 없으면 내보내지 않는다', async () => {
    expect(
      await run({
        VITE_FIREBASE_AUTH_DOMAIN: 'toolkit-test.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'toolkit-test',
      }),
    ).toEqual([]);
    expect(await run({ VITE_FIREBASE_AUTH_DOMAIN: 'app.example.test' })).toEqual([]);
  });
});
```

`src/vite/csp.test.ts`(가즈아 `csp.config.test.ts`의 Firebase 부분과 PWA 상수):

```ts
import { describe, expect, it } from 'vitest';
import { applyFirebaseCsp, firebaseCsp } from './csp.js';
import { AUTH_GLOB_IGNORES, AUTH_NAVIGATE_DENYLIST } from './index.js';

// 가즈아 index.html의 CSP와 같은 모양
const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src 'self' https:; img-src 'self' data:; style-src 'self' 'unsafe-inline'" />`;
const directive = (doc: string, name: string) =>
  new RegExp(`${name} ([^;"]*)`).exec(doc)?.[1]?.trim().split(/\s+/) ?? null;

describe('Firebase Auth CSP', () => {
  it('설정이 없으면 CSP를 그대로 둔다', () => {
    expect(applyFirebaseCsp(html, undefined)).toBe(html);
    expect(applyFirebaseCsp(html, '')).toBe(html);
  });

  it('인증 도메인이 있으면 gapi 스크립트와 그 인증 프레임만 더한다', () => {
    const out = applyFirebaseCsp(html, 'toolkit-test.firebaseapp.com');
    expect(directive(out, 'script-src')).toEqual(["'self'", 'https://apis.google.com']);
    expect(directive(out, 'frame-src')).toEqual(['https://toolkit-test.firebaseapp.com']);
    expect(directive(out, 'connect-src')).toEqual(["'self'", 'https:']);
    expect(directive(out, 'default-src')).toEqual(["'self'"]);
  });

  it('CSP 토큰을 끼워 넣을 수 있는 도메인은 거절한다', () => {
    expect(() => applyFirebaseCsp(html, 'x.com; script-src *')).toThrow();
    expect(() => applyFirebaseCsp(html, 'https://x.firebaseapp.com')).toThrow();
  });

  it('index.html에 기준 문구가 없으면 멈춘다', () => {
    expect(() => applyFirebaseCsp('<meta content="default-src \'self\';">', 'a.test')).toThrow();
  });

  it('빌드와 개발 서버 모두에 적용한다', () => {
    const p = firebaseCsp();
    expect(p.apply).toBeUndefined();
    expect(p.name).toBe('sch0718-firebase-csp');
  });
});

describe('PWA용 상수', () => {
  it('Firebase 청크와 로그인 도우미는 미리 담지 않는다', () => {
    expect(AUTH_GLOB_IGNORES).toEqual(['assets/firebaseImpl-*.js', '__/**']);
  });
  it('로그인 도우미 주소는 앱 셸로 대신 답하지 않는다', () => {
    const denied = (p: string) => AUTH_NAVIGATE_DENYLIST.some((re) => re.test(p));
    expect(denied('/__/auth/handler')).toBe(true);
    expect(denied('/__/auth/iframe')).toBe(true);
    expect(denied('/')).toBe(false);
  });
});
```

- [ ] **Step 3: 시험이 실패하는지 본다**

Run: `pnpm vitest run packages/firebase-session/src/vite`
Expected: FAIL.

- [ ] **Step 4: 구현한다**

`src/vite/authHelper.ts`: `$GZ_ORIG/auth-helper.config.ts`를 복사하고 다음을 바꾼다.

- `export function authHelperPlugin(fetchFn?: FetchFn): Plugin {` → `export function firebaseAuthHelper(opts: { fetch?: FetchFn } = {}): Plugin {`, 본문 첫 줄에 `const fetchFn = opts.fetch;`
- `name: 'gazua-firebase-auth-helper'` → `name: 'sch0718-firebase-auth-helper'`
- `c.env.VITE_FIREBASE_AUTH_DOMAIN` → `c.env['VITE_FIREBASE_AUTH_DOMAIN']`, `c.env.VITE_FIREBASE_PROJECT_ID` → `c.env['VITE_FIREBASE_PROJECT_ID']`
- `type FetchFn`를 `export type FetchFn`로

`src/vite/csp.ts`:

```ts
// Firebase Auth 팝업에 필요한 CSP 출처를 index.html의 meta CSP에 더한다.
// 동기화 설정(VITE_FIREBASE_AUTH_DOMAIN)이 없으면 CSP를 그대로 둔다. connect-src(https:)는 이미 Firebase API를 허용한다고 본다.
import type { Plugin } from 'vite';

/** Google 로그인 팝업이 쓰는 gapi 스크립트. */
export const FIREBASE_SCRIPT_SOURCES = ['https://apis.google.com'];

const DOMAIN_RE = /^[a-z0-9.-]+$/;

/** script-src에 gapi, frame-src에 인증 도메인을 더한다. 기준 문구가 없으면 던진다. */
export function applyFirebaseCsp(html: string, authDomain: string | undefined): string {
  if (!authDomain) return html;
  if (!DOMAIN_RE.test(authDomain))
    throw new Error(`invalid VITE_FIREBASE_AUTH_DOMAIN: ${authDomain}`);
  const script = "script-src 'self'";
  if (!html.includes(script)) throw new Error(`index.html CSP has no "${script}"`);
  const base = "default-src 'self';";
  if (!html.includes(base)) throw new Error(`index.html CSP has no "${base}"`);
  return html
    .replace(script, `${script} ${FIREBASE_SCRIPT_SOURCES.join(' ')}`)
    .replace(base, `${base} frame-src https://${authDomain};`);
}

export function firebaseCsp(): Plugin {
  let authDomain: string | undefined;
  return {
    name: 'sch0718-firebase-csp',
    configResolved(c) {
      const v: unknown = c.env['VITE_FIREBASE_AUTH_DOMAIN'];
      authDomain = typeof v === 'string' && v.trim() ? v.trim() : undefined;
    },
    transformIndexHtml: (html) => applyFirebaseCsp(html, authDomain),
  };
}
```

`src/vite/index.ts`:

```ts
export {
  AUTH_HELPER_FILES,
  fetchAuthHelper,
  firebaseAuthHelper,
  selfHostsAuthHelper,
  type FetchFn,
} from './authHelper.js';
export { applyFirebaseCsp, FIREBASE_SCRIPT_SOURCES, firebaseCsp } from './csp.js';

/** PWA 설정용: 로그인할 때만 받는 파일. 서비스 워커가 미리 담지 않는다(Firebase Auth 청크, 같은 도메인의 로그인 도우미). */
export const AUTH_GLOB_IGNORES: string[] = ['assets/firebaseImpl-*.js', '__/**'];
/** PWA 설정용: 로그인 도우미(/__/auth/handler 등)는 앱 셸로 대신 답하지 않는다. 대신 답하면 로그인이 돌아오지 못한다. */
export const AUTH_NAVIGATE_DENYLIST: RegExp[] = [/^\/__\//];
```

- [ ] **Step 5: 시험·형식·타입·빌드·패키지 검사**

```bash
pnpm vitest run packages/firebase-session
pnpm prettier --write packages/firebase-session
pnpm lint && pnpm typecheck
pnpm --filter @sch0718/firebase-session build
pnpm --filter @sch0718/firebase-session check:package
```

Expected: 모두 통과.

- [ ] **Step 6: README**

`packages/firebase-session/README.md`:

````markdown
# @sch0718/firebase-session

Firebase Google 로그인 + 이메일 허용 목록 + D1 기기 세션입니다. 가즈아에서 옮겼습니다. 진입점이 서로를 import하지 않으므로 Worker만 쓰는 곳에는 firebase·vite가 필요 없습니다.

| 진입점                             | 실행 환경          | 내용                                                                                     |
| ---------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `@sch0718/firebase-session/worker` | Cloudflare Workers | ID 토큰 검증(jose), Google 공개 인증서 캐시, 허용 목록, D1 기기 세션, CORS, HTTP 도우미  |
| `@sch0718/firebase-session/client` | 브라우저           | 동기화 설정 읽기, Firebase 로그인(SDK 지연 로드), 토큰·세션 헤더를 붙이는 API 클라이언트 |
| `@sch0718/firebase-session/vite`   | Vite 빌드          | 로그인 도우미를 앱 도메인에서 서빙하는 플러그인, Firebase CSP 플러그인, PWA용 상수       |

## 서비스가 정하는 값

- 세션 헤더 이름(`sessionHeader`). 클라이언트와 Worker에 같은 값을 넘깁니다. CORS 허용 헤더에도 넣습니다.
- 허용 이메일(Worker secret, 콤마 구분. 비면 아무도 못 들어옴), 허용 출처, Firebase 프로젝트 ID
- 기기 이름 기본값(`defaultLabel`, 기본 '이름 없는 기기')

## Worker

```ts
import {
  createSessionAuth,
  googleCerts,
  matchOrigin,
  preflight,
  purgeSessions,
} from '@sch0718/firebase-session/worker';

const certs = googleCerts(); // isolate마다 하나
const sessions = createSessionAuth({
  db: env.DB,
  projectId: env.FIREBASE_PROJECT_ID,
  allowedEmails: env.ALLOWED_EMAILS,
  certs,
  sessionHeader: 'X-Repass-Session',
  now: Date.now,
  random: (n) => crypto.getRandomValues(new Uint8Array(n)),
  uuid: () => crypto.randomUUID(),
});
```

엔드포인트(`SESSION_PATHS`)는 서비스 라우터가 연결합니다: `POST /v1/session`(create), `DELETE /v1/session`(revoke current), `GET /v1/sessions`(list), `DELETE /v1/sessions?others=1`, `DELETE /v1/sessions/:id`. 실패는 `HttpError`(401·403·404)로, 인증서를 받지 못하면 `CertsUnavailableError`로 던집니다(503으로 바꾸세요).

**스키마.** `migrations/0001_users_sessions.sql`을 서비스의 `migrations/`에 복사해 적용합니다. 패키지가 스키마를 바꾸면 새 번호의 파일을 더하고 변경 기록에 적습니다. 오래된 세션은 Cron에서 `purgeSessions(db, now)`로 지웁니다.

## 브라우저

```ts
import {
  createSessionClient,
  firebaseAuth,
  readSyncConfig,
} from '@sch0718/firebase-session/client';

const config = readSyncConfig(import.meta.env); // 하나라도 비면 null
const auth = firebaseAuth(config.firebase);
const api = createSessionClient({
  baseUrl: config.apiUrl,
  credentials: { idToken: (f) => auth.idToken(f), sessionId: async () => stored },
  sessionHeader: 'X-Repass-Session',
});
```

`api.send()` 위에 서비스 API를 만듭니다. 서비스 고유 상태(예: 409)는 `mapStatus`로 바꿉니다. Firebase SDK는 로그인할 때만 받는 별도 청크(`firebaseImpl-*.js`)가 됩니다.

## Vite

```ts
import { firebaseAuthHelper, firebaseCsp } from '@sch0718/firebase-session/vite';

export default defineConfig({ plugins: [svelte(), firebaseCsp(), firebaseAuthHelper()] });
```

- `firebaseAuthHelper()`: `VITE_FIREBASE_AUTH_DOMAIN`이 앱 도메인이면 빌드 때 `https://<프로젝트>.firebaseapp.com/__/auth/*`를 받아 `dist/__/auth/`에 넣습니다. 서드파티 저장소를 막는 브라우저(iOS Safari, 홈 화면 PWA)에서도 로그인이 되게 하는 Firebase 권장 방법입니다.
- `firebaseCsp()`: index.html의 meta CSP에 `script-src https://apis.google.com`과 `frame-src https://<authDomain>`을 더합니다. CSP에 `default-src 'self';`와 `script-src 'self'`가 있어야 합니다.
- PWA를 쓰면 `AUTH_GLOB_IGNORES`, `AUTH_NAVIGATE_DENYLIST`를 workbox 설정에 넣습니다.

라이선스: [PolyForm Noncommercial 1.0.0](./LICENSE)
````

- [ ] **Step 7: 커밋**

```bash
git add packages/firebase-session
git commit -m "feat(firebase-session): Vite 로그인 도우미·Firebase CSP 플러그인을 가즈아에서 옮김

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `@sch0718/vite-app`

**Files:**

- Create: `$TK/packages/vite-app/{package.json,tsconfig.build.json,README.md}`
- Create: `$TK/packages/vite-app/src/{index.ts,pwa.ts,devCsp.ts,pwa.test.ts,devCsp.test.ts}`
- Modify: `$TK/package.json`(devDependencies)

**Interfaces:**

- Produces(`@sch0718/vite-app`): `createPwaOptions(o: PwaAppOptions): Partial<VitePWAOptions>`, `PwaAppOptions { manifest; cachePrefix; runtimeCaching?; globIgnores?; navigateFallbackDenylist? }`, `PWA_GLOB_PATTERNS`, `devCsp(opts?: { connectSources?: string[] }): Plugin`(name `sch0718-dev-csp`, apply `serve`), `applyDevCsp(html, sources?)`, `DEV_LOCAL_PROXY_SOURCES`
- Task 9에서 가즈아가 쓴다.

- [ ] **Step 1: 의존성**

```bash
pnpm add -D -w vite-plugin-pwa@2.0.0 workbox-build@7.4.1 workbox-window@7.4.1
```

- [ ] **Step 2: 뼈대**

`packages/vite-app/package.json`은 license-notices의 것을 본뜨되 다음이 다르다.

```json
{
  "name": "@sch0718/vite-app",
  "version": "0.0.0",
  "description": "서비스 공통 Vite 설정: PWA 옵션 팩토리, 개발 서버 CSP 완화.",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/sch0718/sch0718-toolkit-web.git",
    "directory": "packages/vite-app"
  },
  "peerDependencies": {
    "vite": "^6.0.0 || ^7.0.0 || ^8.0.0",
    "vite-plugin-pwa": "^2.0.0"
  }
}
```

(`engines`는 넣지 않는다. 나머지 필드 — license, author, type, sideEffects, exports, files, scripts, publishConfig — 는 license-notices와 같다.)

`tsconfig.build.json`은 license-notices와 같되 `"types": []`.

- [ ] **Step 3: 실패하는 시험을 쓴다**

`src/pwa.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createPwaOptions, PWA_GLOB_PATTERNS } from './pwa.js';

type Rule = { urlPattern: unknown; handler: unknown; options?: { cacheName?: string } };
const match = (r: Rule, url: string, sameOrigin: boolean) =>
  (r.urlPattern as (c: { url: URL; sameOrigin: boolean }) => boolean)({
    url: new URL(url),
    sameOrigin,
  });

const extraRule = {
  urlPattern: ({ url }: { url: URL }) => url.pathname.endsWith('/data.json'),
  handler: 'StaleWhileRevalidate' as const,
  options: { cacheName: 'app-data' },
};

describe('createPwaOptions', () => {
  const o = createPwaOptions({
    manifest: { name: '시험앱', short_name: '시험', theme_color: '#000000', start_url: '/home' },
    cachePrefix: 'app',
    globIgnores: ['help/**'],
    navigateFallbackDenylist: [/^\/__\//],
    runtimeCaching: [extraRule],
  });
  const wb = o.workbox ?? {};

  it('같은 출처 registerSW.js로 등록하고 자동 갱신한다(CSP script-src self)', () => {
    expect(o.registerType).toBe('autoUpdate');
    expect(o.injectRegister).toBe('script');
  });

  it('새 서비스 워커를 바로 활성화한다', () => {
    expect(wb.skipWaiting).toBe(true);
    expect(wb.clientsClaim).toBe(true);
  });

  it('매니페스트 공통값 위에 서비스 값을 얹는다', () => {
    expect(o.manifest).toMatchObject({
      name: '시험앱',
      short_name: '시험',
      lang: 'ko',
      scope: './',
      display: 'standalone',
      start_url: '/home',
    });
  });

  it('앱 셸만 미리 담고, 서비스가 뺄 것을 뺀다', () => {
    expect(wb.globPatterns).toEqual(PWA_GLOB_PATTERNS);
    expect(wb.globIgnores).toEqual(['help/**']);
  });

  it('확장자 있는 주소와 서비스가 정한 주소는 앱 셸로 답하지 않는다', () => {
    const denied = (p: string) => (wb.navigateFallbackDenylist ?? []).some((re) => re.test(p));
    expect(denied('/data.json')).toBe(true);
    expect(denied('/assets/index-abc.js')).toBe(true);
    expect(denied('/__/auth/handler')).toBe(true);
    expect(denied('/')).toBe(false);
    expect(denied('/compare/g1')).toBe(false);
  });

  it('같은 출처 글꼴은 <prefix>-fonts에 CacheFirst로 담고, 서비스 규칙은 뒤에 붙는다', () => {
    const rules = (wb.runtimeCaching ?? []) as Rule[];
    expect(rules.map((r) => r.options?.cacheName)).toEqual(['app-fonts', 'app-data']);
    const font = rules[0] as Rule;
    expect(font.handler).toBe('CacheFirst');
    expect(match(font, 'https://app.test/assets/a.woff2', true)).toBe(true);
    expect(match(font, 'https://cdn.test/a.woff2', false)).toBe(false);
  });

  it('옵션을 주지 않아도 동작한다', () => {
    const d = createPwaOptions({ manifest: { name: 'x' }, cachePrefix: 'x' });
    expect(d.workbox?.globIgnores).toEqual([]);
    expect(d.workbox?.runtimeCaching).toHaveLength(1);
  });
});
```

`src/devCsp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyDevCsp, DEV_LOCAL_PROXY_SOURCES, devCsp } from './devCsp.js';

const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src 'self' https:; img-src 'self' data:" />`;
const connectSrc = (doc: string) =>
  /connect-src ([^;"]*)/.exec(doc)?.[1]?.trim().split(/\s+/) ?? [];

describe('개발 서버 CSP', () => {
  it('빌드 CSP는 self와 https만', () => {
    expect(connectSrc(html)).toEqual(["'self'", 'https:']);
  });
  it('개발 서버에서는 localhost·127.0.0.1·[::1] http를 더한다', () => {
    expect(connectSrc(applyDevCsp(html))).toEqual(["'self'", 'https:', ...DEV_LOCAL_PROXY_SOURCES]);
  });
  it('출처를 바꿔 줄 수 있다', () => {
    expect(connectSrc(applyDevCsp(html, ['http://localhost:8788']))).toEqual([
      "'self'",
      'https:',
      'http://localhost:8788',
    ]);
  });
  it('개발 서버에만 적용한다', () => {
    const p = devCsp();
    expect(p.apply).toBe('serve');
    expect(p.name).toBe('sch0718-dev-csp');
  });
  it('기준 connect-src가 없으면 멈춘다', () => {
    expect(() => applyDevCsp('<meta content="default-src \'self\'">')).toThrow();
  });
});
```

- [ ] **Step 4: 시험이 실패하는지 본다**

Run: `pnpm vitest run packages/vite-app`
Expected: FAIL.

- [ ] **Step 5: 구현한다**

`src/pwa.ts`(가즈아 `pwa.config.ts`의 공통 부분):

```ts
// 서비스 공통 PWA 설정. 매니페스트·캐시 이름·서비스 고유 캐시 규칙은 인자로 받는다.
import type { ManifestOptions, VitePWAOptions } from 'vite-plugin-pwa';

type Workbox = NonNullable<VitePWAOptions['workbox']>;
type RuntimeCaching = NonNullable<Workbox['runtimeCaching']>[number];

/** 앱 셸만 미리 담는다. 글꼴 조각·데이터 파일은 담지 않는다. */
export const PWA_GLOB_PATTERNS = ['**/*.{html,js,css,svg,png,webmanifest}'];

const MANIFEST_DEFAULTS: Partial<ManifestOptions> = {
  lang: 'ko',
  start_url: './',
  scope: './',
  display: 'standalone',
};

export interface PwaAppOptions {
  /** 이름·설명·색·아이콘 등 앱별 값. lang·start_url·scope·display 기본값을 덮어쓸 수 있다. */
  manifest: Partial<ManifestOptions>;
  /** 런타임 캐시 이름 앞부분(예: 'gazua' → 'gazua-fonts') */
  cachePrefix: string;
  /** 공통 규칙(글꼴) 뒤에 붙는 서비스 규칙 */
  runtimeCaching?: readonly RuntimeCaching[];
  /** 미리 담지 않을 파일 */
  globIgnores?: readonly string[];
  /** 앱 셸로 대신 답하지 않을 주소(확장자 있는 주소는 이미 뺀다) */
  navigateFallbackDenylist?: readonly RegExp[];
}

export function createPwaOptions(o: PwaAppOptions): Partial<VitePWAOptions> {
  return {
    registerType: 'autoUpdate',
    // CSP가 script-src 'self'이므로 인라인 등록 스크립트 대신 같은 출처의 registerSW.js를 쓴다.
    injectRegister: 'script',
    manifest: { ...MANIFEST_DEFAULTS, ...o.manifest },
    workbox: {
      // injectRegister 'script'에서는 플러그인이 autoUpdate의 skipWaiting/clientsClaim 기본값을 넣지 않는다.
      // 직접 켜야 새 버전이 바로 활성화돼 설치된 사용자가 옛 앱 셸에 머무르지 않는다.
      skipWaiting: true,
      clientsClaim: true,
      globPatterns: [...PWA_GLOB_PATTERNS],
      globIgnores: [...(o.globIgnores ?? [])],
      // 확장자가 있는 주소(데이터 파일·assets 등)는 앱 셸 index.html로 대신 답하지 않는다.
      navigateFallbackDenylist: [/\.\w+$/, ...(o.navigateFallbackDenylist ?? [])],
      runtimeCaching: [
        {
          // 글꼴 조각은 쓰는 것만 처음 받을 때 담는다.
          urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('.woff2'),
          handler: 'CacheFirst',
          options: {
            cacheName: `${o.cachePrefix}-fonts`,
            expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [200] },
          },
        },
        ...(o.runtimeCaching ?? []),
        // 외부 API 요청은 캐시하지 않는다(런타임 규칙 없음 = 네트워크 그대로).
      ],
    },
  };
}
```

`src/devCsp.ts`(가즈아 `csp.config.ts`의 개발 서버 부분):

```ts
// 개발 서버에서만 로컬 http 출처(Node 프록시·wrangler dev)를 connect-src에 더한다. 빌드 CSP는 그대로다.
import type { Plugin } from 'vite';

export const DEV_LOCAL_PROXY_SOURCES = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  'http://[::1]:*',
];

const BUILD_CONNECT_SRC = "connect-src 'self' https:";

export function applyDevCsp(
  html: string,
  sources: readonly string[] = DEV_LOCAL_PROXY_SOURCES,
): string {
  if (!html.includes(BUILD_CONNECT_SRC))
    throw new Error(`index.html CSP has no "${BUILD_CONNECT_SRC}"`);
  return html.replace(BUILD_CONNECT_SRC, `${BUILD_CONNECT_SRC} ${sources.join(' ')}`);
}

export function devCsp(opts: { connectSources?: readonly string[] } = {}): Plugin {
  return {
    name: 'sch0718-dev-csp',
    apply: 'serve',
    transformIndexHtml: (html) => applyDevCsp(html, opts.connectSources),
  };
}
```

`src/index.ts`:

```ts
export { applyDevCsp, DEV_LOCAL_PROXY_SOURCES, devCsp } from './devCsp.js';
export { createPwaOptions, PWA_GLOB_PATTERNS, type PwaAppOptions } from './pwa.js';
```

`README.md`: seen-store README 형식으로, `createPwaOptions` 예(가즈아 값)와 `devCsp()` 설명, "index.html CSP에 `connect-src 'self' https:`가 있어야 한다"를 적는다.

- [ ] **Step 6: 시험·형식·타입·빌드·패키지 검사**

```bash
pnpm vitest run packages/vite-app
pnpm prettier --write packages/vite-app
pnpm lint && pnpm typecheck
pnpm --filter @sch0718/vite-app build
pnpm --filter @sch0718/vite-app check:package
```

Expected: 통과.

- [ ] **Step 7: 커밋**

```bash
git add package.json pnpm-lock.yaml packages/vite-app
git commit -m "feat(vite-app): PWA 옵션 팩토리와 개발 서버 CSP 완화를 가즈아에서 옮김

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `@sch0718/ui-svelte`

**Files:**

- Create: `$TK/packages/ui-svelte/{package.json,svelte.config.js,tsconfig.json,README.md}`
- Create: `$TK/packages/ui-svelte/src/lib/{Badge,Banner,Chip,Segmented,Sheet,Snackbar,SnackbarHost,Toggle}.svelte`
- Create: `$TK/packages/ui-svelte/src/lib/{snackbarStore.svelte.ts,theme.ts,tokens.css,index.ts}`
- Create: `$TK/packages/ui-svelte/test/{Components,Segmented,Sheet,Snackbar,theme,tokens}.test.ts`, `test/SheetSegmentedFixture.svelte`, `test/env.d.ts`
- Modify: `$TK/vitest.config.ts`, `$TK/tsconfig.json`, `$TK/package.json`

**Interfaces:**

- Produces(`@sch0718/ui-svelte`): 컴포넌트 `Badge`, `Banner`, `Chip`, `Segmented`, `Sheet`(새 prop `closeLabel?: string`, 기본 '닫기'), `Snackbar`, `SnackbarHost`, `Toggle`; 함수 `showSnackbar`, `dismissSnackbar`, `holdSnackbar`, `holdSnackbarWhileFocused`, `releaseSnackbar`, `currentSnackbar`, `runSnackbarAction`; 타입 `SnackbarAction`, `SnackbarItem`; `applyTheme(t: ThemeChoice)`, `ThemeChoice`. CSS `@sch0718/ui-svelte/tokens.css`.
- Task 12에서 가즈아가 쓴다.

- [ ] **Step 1: 의존성**

```bash
pnpm add -D -w svelte@5.57.3 @sveltejs/package@2.5.8 @sveltejs/vite-plugin-svelte@7.3.1 svelte-check@4.7.7 @testing-library/svelte@5.4.2 jsdom@30.1.3
```

- [ ] **Step 2: 뼈대**

`packages/ui-svelte/package.json`:

```json
{
  "name": "@sch0718/ui-svelte",
  "version": "0.0.0",
  "description": "Svelte 5 공용 디자인 토큰과 컴포넌트(시트, 스낵바, 세그먼트, 토글 등). 라이트·다크 테마.",
  "license": "PolyForm-Noncommercial-1.0.0",
  "author": "신춘호 (https://github.com/sch0718)",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/sch0718/sch0718-toolkit-web.git",
    "directory": "packages/ui-svelte"
  },
  "type": "module",
  "sideEffects": ["**/*.css"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "svelte": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./tokens.css": "./dist/tokens.css",
    "./package.json": "./package.json"
  },
  "files": ["dist", "LICENSE"],
  "scripts": {
    "build": "rm -rf dist && svelte-package -i src/lib -o dist && cp ../../LICENSE LICENSE",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "check:package": "publint --strict"
  },
  "peerDependencies": {
    "svelte": "^5.57.0"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

`packages/ui-svelte/svelte.config.js`:

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
};
```

`packages/ui-svelte/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": [],
    "noEmit": true,
    // 가즈아에서 옮긴 컴포넌트의 props 타입은 이 두 옵션을 전제하지 않는다. 고치면 컴포넌트 API가 바뀐다.
    "exactOptionalPropertyTypes": false,
    "noPropertyAccessFromIndexSignature": false
  },
  "include": ["src", "test"]
}
```

루트 `tsconfig.json`에 `"exclude": ["packages/ui-svelte"]`를 더한다(`.svelte` import는 svelte-check가 검사한다).

루트 `package.json` scripts:

```json
    "check:svelte": "pnpm --filter @sch0718/ui-svelte check",
    "verify": "pnpm lint && pnpm format:check && pnpm typecheck && pnpm check:svelte && pnpm test && pnpm build && pnpm check:package && pnpm size",
```

루트 `vitest.config.ts`:

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'node', include: ['packages/*/src/**/*.test.ts'], environment: 'node' },
      },
      {
        plugins: [svelte({ configFile: 'packages/ui-svelte/svelte.config.js' }), svelteTesting()],
        // Svelte 5 컴포넌트 시험은 SSR이 아닌 클라이언트 빌드를 불러야 한다.
        resolve: { conditions: ['browser'] },
        test: {
          name: 'svelte',
          include: ['packages/ui-svelte/test/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
    ],
  },
});
```

`pnpm vitest run`이 지금까지의 node 시험을 그대로 통과하는지 확인한다.

- [ ] **Step 3: 컴포넌트와 시험을 옮긴다**

```bash
SRC=$GZ_ORIG/src/lib/ui
mkdir -p packages/ui-svelte/src/lib packages/ui-svelte/test
cp $SRC/components/{Badge,Banner,Chip,Segmented,Sheet,Snackbar,SnackbarHost,Toggle}.svelte packages/ui-svelte/src/lib/
cp $SRC/components/snackbarStore.svelte.ts packages/ui-svelte/src/lib/
cp $SRC/components/{Components,Segmented,Sheet,Snackbar}.test.ts $SRC/components/SheetSegmentedFixture.svelte packages/ui-svelte/test/
cp $SRC/theme.test.ts packages/ui-svelte/test/
```

import 경로를 고친다.

```bash
cd packages/ui-svelte
perl -pi -e "s#from './snackbarStore.svelte'#from './snackbarStore.svelte.js'#" src/lib/*.svelte
perl -pi -e "s#from '\./(\w+)\.svelte(\?raw)?'#from '../src/lib/\$1.svelte\$2'#; s#from '\.\./src/lib/SheetSegmentedFixture\.svelte'#from './SheetSegmentedFixture.svelte'#; s#from '\./snackbarStore\.svelte'#from '../src/lib/snackbarStore.svelte.js'#" test/*.test.ts test/SheetSegmentedFixture.svelte
cd ../..
```

`test/SheetSegmentedFixture.svelte`의 import가 `../src/lib/Segmented.svelte`, `../src/lib/Sheet.svelte`인지 눈으로 확인한다(원본은 `./Segmented.svelte`).

`test/env.d.ts`(`?raw` import 타입):

```ts
/// <reference types="vite/client" />
```

`test/theme.test.ts`에서 `applyColorConvention` import와 그 describe 블록, `root.classList.remove('global-colors');` 줄을 지우고 import를 `import { applyTheme } from '../src/lib/theme.js';`로 바꾼다.

- [ ] **Step 4: Sheet에 `closeLabel` 시험을 더한다**

`test/Sheet.test.ts` 끝의 `describe` 안에 더한다(파일의 기존 render 도우미를 따라 쓴다. 아래는 도우미가 없을 때의 완전한 형태):

```ts
it('닫기 단추 이름은 closeLabel로 바꿀 수 있다(기본 닫기)', () => {
  const children = createRawSnippet(() => ({ render: () => '<p>본문</p>' }));
  const { unmount } = render(Sheet, {
    props: { open: true, title: '제목', onclose: () => {}, children },
  });
  expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();
  unmount();
  render(Sheet, {
    props: { open: true, title: '제목', onclose: () => {}, children, closeLabel: 'Close' },
  });
  expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
});
```

Run: `pnpm vitest run --project svelte`
Expected: FAIL — `theme.js`, `closeLabel` 시험 실패(나머지는 통과할 수도 있다).

- [ ] **Step 5: `closeLabel`, theme, index**

`src/lib/Sheet.svelte`의 props에 더한다.

```svelte
  let {
    open,
    title,
    onclose,
    children,
    returnFocus,
    headerEnd,
    closeLabel = '닫기',
  }: {
    open: boolean;
    title: string;
    onclose: () => void;
    children: Snippet;
    /** 닫을 때 열기 전 요소가 문서에서 사라졌으면(예: 지운 행) 대신 포커스할 요소. */
    returnFocus?: () => HTMLElement | null | undefined;
    /** 제목 줄의 닫기 단추 앞에 둘 것(도움말 단추 등). */
    headerEnd?: Snippet;
    /** 닫기 단추의 접근성 이름. 기본 '닫기' */
    closeLabel?: string;
  } = $props();
```

닫기 단추:

```svelte
        <button type="button" class="close" aria-label={closeLabel} data-sheet-close onclick={onclose}>✕</button>
```

`src/lib/theme.ts`:

```ts
export type ThemeChoice = 'system' | 'light' | 'dark';

/** `system`이면 data-theme을 지워 prefers-color-scheme을 따른다. */
export function applyTheme(t: ThemeChoice): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}
```

`src/lib/index.ts`:

```ts
export { default as Badge } from './Badge.svelte';
export { default as Banner } from './Banner.svelte';
export { default as Chip } from './Chip.svelte';
export { default as Segmented } from './Segmented.svelte';
export { default as Sheet } from './Sheet.svelte';
export { default as Snackbar } from './Snackbar.svelte';
export { default as SnackbarHost } from './SnackbarHost.svelte';
export { default as Toggle } from './Toggle.svelte';
export {
  currentSnackbar,
  dismissSnackbar,
  holdSnackbar,
  holdSnackbarWhileFocused,
  releaseSnackbar,
  runSnackbarAction,
  showSnackbar,
  type SnackbarAction,
  type SnackbarItem,
} from './snackbarStore.svelte.js';
export { applyTheme, type ThemeChoice } from './theme.js';
```

- [ ] **Step 6: 범용 토큰 CSS**

`src/lib/tokens.css`(가즈아 `tokens.css`에서 주식 색·`global-colors`·`.up`/`.down`·당겨서 새로고침·Pretendard import를 뺀 것. 값은 그대로):

```css
/* ===== 범용 토큰 =====
   라이트 = :root, 다크 = 시스템 설정(자동) 또는 data-theme="dark" 지정.
   값을 바꿀 때는 세 곳(라이트 / 다크 자동 / 다크 지정)을 함께 고친다.
   서비스 전용 토큰은 서비스 CSS에서 같은 세 블록 구조로 더하고, 이 파일 다음에 불러온다.
   글꼴(--font)은 이름만 둔다. 글꼴 파일 로딩은 서비스가 한다. */
:root {
  color-scheme: light;
  --bg: #f6f7f9;
  --surface: #ffffff;
  --surface2: #f0f1f4;
  --line: #e3e5e9;
  --t1: #111317;
  --t2: #5b6069;
  --t3: #676d77; /* WCAG AA(4.5:1) 이상: 흰 표면·표면 2·배경 모두 */
  --accent: #5b47e0;
  --accent-soft: rgba(91, 71, 224, 0.1);
  --on-accent: #ffffff;
  --snack-action: #b9acff; /* 반전 배경(스낵바) 위의 강조색 */
  --ok: #0a7d0a;
  --warn: #855600;
  --err: #b82a2a;
  --scrim: rgba(17, 19, 23, 0.38);
  --shadow: 0 10px 40px rgba(17, 19, 23, 0.18);
  /* 카드(--surface) 안 세그먼트: 라이트는 기본 모양(트랙 --surface2, 선택 --surface; 선택·트랙 1.13:1) */
  --seg-card-track: var(--surface2);
  --seg-card-on: var(--surface);

  /* 테마와 무관한 토큰 */
  --font:
    'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo',
    'Noto Sans KR', sans-serif;
  --fs-headline: 28px;
  --fs-title: 17px;
  --fs-body: 15px;
  --fs-sub: 13px;
  --fs-label: 11px;
  --r-chip: 999px;
  --r-card: 16px;
  --r-sheet: 24px;
  --gutter: 16px;
  --touch: 44px;
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-fast: 150ms;
  --dur-base: 200ms;
  --dur-slow: 250ms;
}
@media (min-width: 600px) {
  :root {
    --gutter: 24px;
  }
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
    --bg: #0e0f11;
    --surface: #17181b;
    --surface2: #1f2125;
    --line: #2a2d33;
    --t1: #f2f3f5;
    --t2: #a4a8b0;
    --t3: #868b94;
    --accent: #a093ff; /* #8b7bff는 accent-soft 위 배지에서 4.01:1 → AA를 맞추려고 밝힘 */
    --accent-soft: rgba(160, 147, 255, 0.14);
    --on-accent: #0e0f11;
    --snack-action: #5b47e0;
    --ok: #3ccf5a;
    --warn: #fab219;
    --err: #ff6b6b;
    --scrim: rgba(0, 0, 0, 0.55);
    --shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    /* 다크는 기본 모양이면 선택(--surface)이 트랙보다 어두워 꺼져 보인다: 트랙 --bg, 선택 --surface2(1.19:1) */
    --seg-card-track: var(--bg);
    --seg-card-on: var(--surface2);
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
  --bg: #0e0f11;
  --surface: #17181b;
  --surface2: #1f2125;
  --line: #2a2d33;
  --t1: #f2f3f5;
  --t2: #a4a8b0;
  --t3: #868b94;
  --accent: #a093ff; /* #8b7bff는 accent-soft 위 배지에서 4.01:1 → AA를 맞추려고 밝힘 */
  --accent-soft: rgba(160, 147, 255, 0.14);
  --on-accent: #0e0f11;
  --snack-action: #5b47e0;
  --ok: #3ccf5a;
  --warn: #fab219;
  --err: #ff6b6b;
  --scrim: rgba(0, 0, 0, 0.55);
  --shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  /* 다크는 기본 모양이면 선택(--surface)이 트랙보다 어두워 꺼져 보인다: 트랙 --bg, 선택 --surface2(1.19:1) */
  --seg-card-track: var(--bg);
  --seg-card-on: var(--surface2);
}

/* ===== 기본 스타일 ===== */
*,
*::before,
*::after {
  box-sizing: border-box;
}
* {
  margin: 0;
  padding: 0;
}
html,
body {
  background: var(--bg);
  color: var(--t1);
}
body {
  font-family: var(--font);
  font-size: var(--fs-body);
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
button,
input,
select,
textarea {
  font: inherit;
  color: inherit;
}
button {
  background: none;
  border: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
a:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 8px;
}

.num {
  font-variant-numeric: tabular-nums;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
  /* 이동·크기 전환은 끈다. 페이드(opacity)는 각 컴포넌트가 따로 남긴다. */
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
  }
}
```

확인: 가즈아 원본의 범용 토큰 값과 같은지 본다.

```bash
for t in bg surface surface2 line t1 t2 t3 accent accent-soft on-accent snack-action ok warn err scrim shadow; do
  diff <(grep -E "^\s+--$t:" $GZ_ORIG/src/lib/ui/tokens.css | sed 's#/\*.*##;s/ *$//') <(grep -E "^\s+--$t:" packages/ui-svelte/src/lib/tokens.css | sed 's#/\*.*##;s/ *$//') >/dev/null || echo "다름: --$t"
done
```

Expected: 출력 없음.

`test/tokens.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/lib/tokens.css', import.meta.url), 'utf8');

const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('tokens.css', () => {
  const light = block(':root');
  const darkAuto = block(":root:not([data-theme='light'])");
  const darkSet = block(":root[data-theme='dark']");

  it('라이트와 두 다크 블록의 토큰 이름이 같다', () => {
    const names = (b: string) => [...b.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]);
    const themed = names(light).filter(
      (n) => !/^--(font|fs-|r-|gutter|touch|ease|dur-)/.test(n ?? ''),
    );
    expect(names(darkAuto).sort()).toEqual(themed.sort());
    expect(names(darkSet).sort()).toEqual(themed.sort());
  });

  it('시스템 다크와 data-theme=dark의 값이 같다', () => {
    const values = (b: string) =>
      Object.fromEntries(
        [...b.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [
          m[1],
          m[2]?.trim(),
        ]),
      );
    expect(values(darkAuto)).toEqual(values(darkSet));
  });

  it('글꼴 파일을 불러오지 않는다(서비스 몫)', () => {
    expect(css).not.toContain('@import');
  });

  describe('대비(WCAG AA)', () => {
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const lum = (hex: string) => {
      const [r = 0, g = 0, b = 0] = rgb(hex)
        .map((v) => v / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi = 0, lo = 0] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const token = (b: string, name: string) => {
      const m = b.match(new RegExp(`--${name}: (#[0-9a-f]{6})`));
      if (!m?.[1]) throw new Error(`no --${name}`);
      return m[1];
    };
    const over = (color: string, alpha: number, under: string) =>
      '#' +
      rgb(color)
        .map((c, i) =>
          Math.round(c * alpha + (rgb(under)[i] ?? 0) * (1 - alpha))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    const SURFACES = ['bg', 'surface', 'surface2'];
    const THEMES: [string, string][] = [
      ['light', light],
      ['dark (system)', darkAuto],
      ['dark (data-theme)', darkSet],
    ];

    it.each(THEMES)('%s: 글자 토큰은 모든 면 위 4.5:1 이상', (_, b) => {
      for (const bg of SURFACES) {
        for (const fg of ['t2', 't3', 'ok', 'warn', 'err', 'accent']) {
          expect(ratio(token(b, fg), token(b, bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it('카드 안 세그먼트: 라이트는 트랙 --surface2·선택 --surface, 다크는 트랙 --bg·선택 --surface2', () => {
      const v = (b: string, name: string) =>
        b.match(new RegExp(`--${name}: ([^;]+);`))?.[1]?.trim();
      expect([v(light, 'seg-card-track'), v(light, 'seg-card-on')]).toEqual([
        'var(--surface2)',
        'var(--surface)',
      ]);
      for (const d of [darkAuto, darkSet]) {
        expect([v(d, 'seg-card-track'), v(d, 'seg-card-on')]).toEqual([
          'var(--bg)',
          'var(--surface2)',
        ]);
      }
      expect(ratio(token(light, 'surface'), token(light, 'surface2'))).toBeGreaterThan(1.1);
      expect(ratio(token(darkSet, 'surface2'), token(darkSet, 'bg'))).toBeGreaterThan(1.15);
    });

    it.each(THEMES)('%s: 토글(비텍스트 3:1)', (_, b) => {
      expect(ratio(token(b, 'on-accent'), token(b, 'accent'))).toBeGreaterThanOrEqual(3);
      expect(ratio('#ffffff', token(b, 't3'))).toBeGreaterThanOrEqual(3);
      for (const bg of SURFACES)
        expect(ratio(token(b, 't3'), token(b, bg)), bg).toBeGreaterThanOrEqual(3);
    });

    it.each([
      ['light', light, 0.1],
      ['dark', darkSet, 0.14],
    ] as const)('%s: 강조색 글자는 자기 옅은 배경(accent-soft) 위 4.5:1 이상', (_, b, alpha) => {
      for (const bg of SURFACES) {
        expect(
          ratio(token(b, 'accent'), over(token(b, 'accent'), alpha, token(b, bg))),
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});
```

- [ ] **Step 7: 시험·검사**

```bash
pnpm vitest run --project svelte
pnpm check:svelte
pnpm --filter @sch0718/ui-svelte build
ls packages/ui-svelte/dist
pnpm --filter @sch0718/ui-svelte check:package
pnpm prettier --write packages/ui-svelte
pnpm lint && pnpm typecheck
```

Expected:

- 시험 통과(가즈아에서 옮긴 시험 전부 + `closeLabel` + 토큰).
- `svelte-check` 오류 0. 경고가 있으면 가즈아 원본에서도 나는 경고인지 `cd $GZ_ORIG && pnpm exec svelte-check --tsconfig ./tsconfig.app.json`로 비교한다. 원본에도 있으면 그대로 둔다.
- `dist/`에 `index.js`, `index.d.ts`, `*.svelte`, `*.svelte.d.ts`, `snackbarStore.svelte.js`, `theme.js`, `tokens.css`가 있고, 시험 파일은 없다.
- publint 통과.

- [ ] **Step 8: README**

`packages/ui-svelte/README.md`에 다음을 적는다: 불러오는 순서(글꼴 → `@sch0718/ui-svelte/tokens.css` → 서비스 토큰), 컴포넌트 목록과 주요 props(위 Interfaces), `SnackbarHost`를 앱 루트에 한 번 두고 `showSnackbar(message, action?, ms?)`로 띄우는 것, 서비스 토큰은 라이트·다크 자동·다크 지정 세 블록에 같이 넣어야 한다는 것, `--accent`를 덮어써 서비스 색을 바꾸는 예, 라이선스.

- [ ] **Step 9: 커밋**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts packages/ui-svelte
git commit -m "feat(ui-svelte): 범용 디자인 토큰과 Svelte 5 컴포넌트를 가즈아에서 옮김

Sheet 닫기 단추 이름을 closeLabel로 바꿀 수 있게 했다. 주식 색 토큰과 Pretendard 로딩은 가즈아에 남는다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 호환 시험·크기 한도·변경 기록·문서

**Files:**

- Modify: `$TK/scripts/compat.mjs`
- Modify: `$TK/fixtures/pnpm-ts59/{package.json,index.ts}`
- Create: `$TK/fixtures/pnpm-ts59/{App.svelte,tsconfig.svelte.json}`
- Modify: `$TK/.size-limit.json`
- Create: `$TK/.changeset/{firebase-session,vite-app,ui-svelte,license-notices}-first.md`
- Modify: `$TK/README.md`, `$TK/CLAUDE.md`

- [ ] **Step 1: compat.mjs가 fixture의 check 스크립트를 쓰게 한다**

`scripts/compat.mjs`의 마지막 `run('corepack', [manager, manager === 'yarn' ? 'run' : 'exec', 'tsc', '-p', '.'], dir);`를 바꾼다.

```js
// fixture에 check 스크립트가 있으면(예: tsc + svelte-check) 그것을, 없으면 tsc만 돌린다.
if (pkg.scripts?.check) run('corepack', [manager, 'run', 'check'], dir);
else run('corepack', [manager, manager === 'yarn' ? 'run' : 'exec', 'tsc', '-p', '.'], dir);
```

- [ ] **Step 2: 가즈아 조건 fixture를 넓힌다**

`fixtures/pnpm-ts59/package.json`:

```json
{
  "name": "compat-pnpm-ts59",
  "private": true,
  "type": "module",
  "description": "가즈아 조건: pnpm 10, TypeScript 5.9, Svelte 5, Vite 6, Firebase 12",
  "packageManager": "pnpm@10.34.7",
  "scripts": {
    "check": "tsc -p . && svelte-check --tsconfig ./tsconfig.svelte.json"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "svelte": "5.57.2",
    "svelte-check": "4.7.6",
    "vite": "6.4.4",
    "vite-plugin-pwa": "2.0.0",
    "workbox-build": "7.4.1",
    "workbox-window": "7.4.1",
    "firebase": "12.19.0"
  }
}
```

`fixtures/pnpm-ts59/index.ts`에 더한다(기존 seen-store 부분은 그대로):

```ts
import {
  firebaseAuth,
  readSyncConfig,
  createSessionClient,
  type BaseFail,
} from '@sch0718/firebase-session/client';
import {
  AUTH_GLOB_IGNORES,
  AUTH_NAVIGATE_DENYLIST,
  firebaseAuthHelper,
  firebaseCsp,
} from '@sch0718/firebase-session/vite';
import {
  createSessionAuth,
  googleCerts,
  purgeSessions,
  type D1Database,
} from '@sch0718/firebase-session/worker';
import { writeNotices } from '@sch0718/license-notices';
import { applyTheme, showSnackbar, type ThemeChoice } from '@sch0718/ui-svelte';
import { createPwaOptions, devCsp } from '@sch0718/vite-app';
import type { Plugin } from 'vite';

const cfg = readSyncConfig({ VITE_SYNC_API_URL: 'https://api.example.test' });
if (cfg) firebaseAuth(cfg.firebase);
const api = createSessionClient<{ ok: false; kind: 'conflict' }>({
  baseUrl: 'https://api.example.test',
  credentials: { idToken: async () => null, sessionId: async () => null },
  sessionHeader: 'X-Compat-Session',
  mapStatus: (s) => (s === 409 ? { ok: false, kind: 'conflict' } : undefined),
});
export const listed: Promise<unknown> = api.listSessions();
export const fail: BaseFail = { ok: false, kind: 'offline' };

export const plugins: Plugin[] = [firebaseAuthHelper(), firebaseCsp(), devCsp()];
export const pwa = createPwaOptions({
  manifest: { name: '호환' },
  cachePrefix: 'compat',
  globIgnores: AUTH_GLOB_IGNORES,
  navigateFallbackDenylist: AUTH_NAVIGATE_DENYLIST,
});

declare const db: D1Database;
export const sessions = createSessionAuth({
  db,
  projectId: 'p',
  allowedEmails: undefined,
  certs: googleCerts(),
  sessionHeader: 'X-Compat-Session',
  now: Date.now,
  random: (n) => new Uint8Array(n),
  uuid: () => 'u',
});
export const purged: Promise<number> = purgeSessions(db, Date.now());
export const notices: typeof writeNotices = writeNotices;

const theme: ThemeChoice = 'dark';
applyTheme(theme);
showSnackbar('저장했어요');
```

`fixtures/pnpm-ts59/App.svelte`:

```svelte
<script lang="ts">
  import '@sch0718/ui-svelte/tokens.css';
  import { Banner, Sheet, SnackbarHost, Toggle } from '@sch0718/ui-svelte';

  let open = $state(true);
  let on = $state(false);
</script>

<Banner message="안내" tone="warn" />
<Toggle checked={on} label="알림" onchange={(v) => (on = v)} />
<Sheet {open} title="시트" onclose={() => (open = false)} closeLabel="Close">
  <p>본문</p>
</Sheet>
<SnackbarHost />
```

`fixtures/pnpm-ts59/tsconfig.svelte.json`:

```json
{
  "extends": "./tsconfig.json",
  "include": ["App.svelte"]
}
```

`App.svelte`의 CSS import가 svelte-check에서 오류면 `/// <reference types="vite/client" />`를 담은 `fixtures/pnpm-ts59/env.d.ts`를 만들고 `tsconfig.svelte.json`의 include에 더한다.

- [ ] **Step 3: 호환 시험**

```bash
pnpm build && pnpm compat
```

Expected: `호환 시험 통과: pnpm-ts59, yarn1-ts6`. yarn1-ts6에서 peer 의존 경고가 나는 것은 괜찮다(랜드마크는 새 패키지를 쓰지 않는다). pnpm-ts59는 `skipLibCheck: false`라 서드파티 선언 파일도 검사한다. 오류가 `@sch0718/*`가 아닌 패키지(vite, workbox 등)의 `.d.ts`에서만 나면, 그 버전이 가즈아 lockfile과 같은지 확인한다. 같은데도 나면 멈추고 사용자에게 알린다(fixture 설정을 바꿀지 결정이 필요하다).

- [ ] **Step 4: 크기 한도**

`.size-limit.json`에 더한다(한도는 다음 단계에서 정한다):

```json
  {
    "name": "@sch0718/firebase-session/client",
    "path": "packages/firebase-session/dist/client/index.js",
    "import": "{ createSessionClient, firebaseAuth, readSyncConfig }",
    "ignore": ["firebase"],
    "limit": "10 kB"
  },
  {
    "name": "@sch0718/firebase-session/worker",
    "path": "packages/firebase-session/dist/worker/index.js",
    "import": "{ createSessionAuth, googleCerts, matchOrigin, preflight, json, readJson }",
    "ignore": ["jose"],
    "limit": "10 kB"
  },
  {
    "name": "@sch0718/vite-app",
    "path": "packages/vite-app/dist/index.js",
    "import": "{ createPwaOptions, devCsp }",
    "limit": "10 kB"
  }
```

```bash
pnpm size
```

각 항목의 실제 크기를 읽고, `limit`을 실제 크기 × 1.2를 100 B 단위로 올린 값으로 바꾼다(예: 1.73 kB → `"2.1 kB"`). 다시 `pnpm size`가 통과하는지 본다.

- [ ] **Step 5: 변경 기록**

`.changeset/firebase-session-first.md`:

```markdown
---
'@sch0718/firebase-session': minor
---

첫 버전. 가즈아의 Firebase ID 토큰 검증·이메일 허용 목록·D1 기기 세션(`/worker`), 로그인·세션 API 클라이언트(`/client`), 로그인 도우미·CSP Vite 플러그인(`/vite`)을 옮겼다. users·sessions 마이그레이션 SQL을 함께 배포한다.
```

`.changeset/vite-app-first.md`:

```markdown
---
'@sch0718/vite-app': minor
---

첫 버전. 가즈아의 PWA 설정을 `createPwaOptions()` 팩토리로, 개발 서버 CSP 완화를 `devCsp()` 플러그인으로 옮겼다.
```

`.changeset/ui-svelte-first.md`:

```markdown
---
'@sch0718/ui-svelte': minor
---

첫 버전. 가즈아의 범용 디자인 토큰(`tokens.css`)과 Svelte 5 컴포넌트(Badge, Banner, Chip, Segmented, Sheet, Snackbar, SnackbarHost, Toggle), `applyTheme`을 옮겼다. Sheet에 `closeLabel` prop을 더했다.
```

`.changeset/license-notices-first.md`:

```markdown
---
'@sch0718/license-notices': minor
---

첫 버전. 가즈아의 라이선스 고지 생성 스크립트를 `writeNotices()`로 옮겼다.
```

- [ ] **Step 6: 별 수를 확인한다**

```bash
for r in panva/jose sveltejs/kit sveltejs/svelte testing-library/svelte-testing-library jsdom/jsdom vite-pwa/vite-plugin-pwa firebase/firebase-js-sdk; do
  printf "%s " $r; gh api repos/$r --jq .stargazers_count
done
```

- [ ] **Step 7: README·CLAUDE.md**

루트 `README.md`:

- 「패키지」 표에 네 줄을 더한다(설명은 각 changeset 첫 문장, 상태 "첫 발행 준비").
- 「넣는 기준」 1번 끝에 "Svelte·Vite는 가즈아·repass 두 서비스가 써서 어댑터 패키지(`ui-svelte`, `vite-app`, `firebase-session/vite`)를 둡니다. 프레임워크를 import하는 코드는 패키지 이름이나 서브경로에 그 이름이 드러나게 합니다."를 더한다.
- 「넣는 기준」 4번을 다음으로 바꾼다: "**장치는 넣고 값은 서비스에 둡니다.** 토큰 검증, 세션 처리, CSP 변환 같은 장치는 넣고, 허용 이메일·허용 출처·세션 헤더 이름·DB 바인딩·매니페스트 같은 값은 서비스가 주입합니다. 패키지가 SQL을 실행하는 테이블은 패키지가 스키마를 소유하고 마이그레이션 SQL을 함께 배포합니다. 서비스 고유의 데이터 형식(백업 형식, 공유 링크 형식, 서비스 문서 스키마)은 넣지 않습니다."
- 「넣는 기준」 5번 뒤에 "Worker 전용 진입점(`firebase-session/worker`)은 브라우저 번들에 들어가지 않으므로 jose 의존을 둡니다."를 더한다.
- 「쓰는 도구」 표에 `@sveltejs/package` 2.5.8(별: sveltejs/kit), jose(Worker 토큰 검증), Testing Library Svelte, jsdom을 Step 6의 별 수와 함께 더한다. 표 아래에 "`@sveltejs/package` 3은 TypeScript 6을 요구해 2.5를 씁니다."를 더한다.
- 「호환 시험」의 "패키지를 추가하면 각 fixture의 `index.ts`에도 import를 추가합니다"를 "패키지를 추가하면 그 패키지를 쓰는 서비스의 fixture에 import를 추가합니다. fixture에 `check` 스크립트가 있으면 `tsc` 대신 그것을 실행합니다(가즈아 fixture는 `svelte-check`도 돌립니다)."로 바꾼다. 표의 `pnpm-ts59` 조건을 "pnpm 10, TypeScript 5.9, Svelte 5, Vite 6"으로 바꾼다.
- 「서비스에서 설치하기」 3번 예를 일반화한다: "`pnpm add @sch0718/<패키지>@<버전>`".

`CLAUDE.md`의 "브라우저 패키지는 런타임 의존성 0을 지향합니다." 뒤에 "(Worker 전용 진입점은 예외: `firebase-session/worker`의 jose)"를 더한다.

- [ ] **Step 8: 전체 검사**

```bash
pnpm run verify
pnpm compat
```

Expected: 둘 다 통과.

- [ ] **Step 9: 커밋**

```bash
git add scripts/compat.mjs fixtures/pnpm-ts59 .size-limit.json .changeset README.md CLAUDE.md
git commit -m "chore: 새 패키지 넷의 호환 시험·크기 한도·변경 기록, 넣는 기준 개정

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase B: 가즈아 전환

### Task 8: 가즈아 작업 공간과 기준 산출물

**Files:** 없음(작업 공간 준비).

- [ ] **Step 1: worktree를 만든다**

```bash
cd $GZ_ORIG
git fetch origin
git status --short   # ?? .codex/ 만 있어야 한다. 다른 변경이 있으면 멈추고 사용자에게 묻는다
mkdir -p ../.worktrees
git worktree add ../.worktrees/gazua-toolkit -b chore/use-toolkit-packages origin/main
cd ../.worktrees/gazua-toolkit
pnpm install --frozen-lockfile
cp $GZ_ORIG/public/universe.json public/universe.json
```

- [ ] **Step 2: 바꾸기 전 검사가 통과하는지 확인한다**

```bash
pnpm check && pnpm check:e2e && pnpm test && pnpm test:scripts
pnpm --filter sync-worker check && pnpm --filter sync-worker test
UNIVERSE_REUSE=true pnpm build
```

Expected: 모두 통과. 실패하면 멈추고 사용자에게 알린다(이 작업과 무관한 기존 실패).

- [ ] **Step 3: 기준 산출물을 저장한다**

```bash
B=/private/tmp/gazua-baseline && mkdir -p $B
find dist -type f | sed -E 's/-[A-Za-z0-9_-]{8}\./-HASH./' | sort > $B/files.txt
cp dist/manifest.webmanifest $B/
grep -o 'url:"[^"]*"' dist/sw.js | sed -E 's/-[A-Za-z0-9_-]{8}\./-HASH./' | sort > $B/precache.txt
grep -E '^[^ ]+ [0-9][^ ]* \(' public/licenses.txt | sort > $B/licenses.txt
```

(sw.js 형식이 달라 `precache.txt`가 비면 `grep -o '"url":"[^"]*"'`로 다시 뽑는다.)

- [ ] **Step 4: tarball을 임시 설치한다(커밋하지 않음)**

```bash
P=/Users/shinchoonho/01.workspace/01.repositories/.worktrees/sch0718-toolkit-web-extract/.packs
ls $P   # Task 7의 pnpm compat이 만든 tgz 다섯 개
pnpm add "@sch0718/firebase-session@file:$P/sch0718-firebase-session-0.0.0.tgz" "@sch0718/ui-svelte@file:$P/sch0718-ui-svelte-0.0.0.tgz"
pnpm add -D "@sch0718/vite-app@file:$P/sch0718-vite-app-0.0.0.tgz" "@sch0718/license-notices@file:$P/sch0718-license-notices-0.0.0.tgz"
pnpm --filter sync-worker add "@sch0718/firebase-session@file:$P/sch0718-firebase-session-0.0.0.tgz"
```

toolkit을 고쳐 다시 묶었으면(`pnpm build && pnpm compat`) 위 `pnpm add` 세 줄을 다시 실행한다.

---

### Task 9: 빌드 설정 전환

**Files:**

- Modify: `$GZ/vite.config.ts`, `$GZ/pwa.config.ts`, `$GZ/vitest.config.ts`
- Delete: `$GZ/auth-helper.config.ts`, `$GZ/auth-helper.config.test.ts`, `$GZ/csp.config.ts`, `$GZ/csp.config.test.ts`
- Test: `$GZ/pwa.config.test.ts`(그대로 통과해야 한다)

- [ ] **Step 1: `pwa.config.ts`를 팩토리로 바꾼다**

```ts
import { AUTH_GLOB_IGNORES, AUTH_NAVIGATE_DENYLIST } from '@sch0718/firebase-session/vite';
import { createPwaOptions } from '@sch0718/vite-app';

// vite.config.ts에서 쓰는 PWA 설정. 테스트(pwa.config.test.ts)가 이 객체를 직접 확인한다.
// 공통값(autoUpdate, registerSW.js, skipWaiting, 앱 셸 globPatterns, 글꼴 캐시)은 @sch0718/vite-app이 정한다.
export const pwaOptions = createPwaOptions({
  manifest: {
    name: '가즈아',
    short_name: '가즈아',
    description: '관심종목을 한 차트에 나란히 놓고 비교해요',
    theme_color: '#5b47e0',
    background_color: '#f6f7f9',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  cachePrefix: 'gazua',
  // 도움말 그림(help/img, 약 400KB)은 도움말을 열 때 받아 담는다(아래 gazua-help).
  // Firebase Auth 청크와 같은 도메인의 로그인 도우미는 로그인할 때만 받는다(AUTH_GLOB_IGNORES).
  globIgnores: ['help/**', ...AUTH_GLOB_IGNORES],
  navigateFallbackDenylist: AUTH_NAVIGATE_DENYLIST,
  runtimeCaching: [
    {
      // 종목 유니버스는 배포 스케줄(평일 새벽)마다 바뀐다. 캐시를 먼저 보이고 뒤에서 새로 받는다.
      urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('/universe.json'),
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'gazua-universe' },
    },
    {
      // 도움말 그림은 배포마다 같은 이름으로 바뀔 수 있다. 담아 둔 것을 먼저 보이고 뒤에서 새로 받는다.
      urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/help/img/'),
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'gazua-help' },
    },
    // 시세·프록시 같은 외부 API 요청은 캐시하지 않는다(런타임 규칙 없음 = 네트워크 그대로).
  ],
});
```

- [ ] **Step 2: `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { firebaseAuthHelper, firebaseCsp } from '@sch0718/firebase-session/vite';
import { devCsp } from '@sch0718/vite-app';
import { pwaOptions } from './pwa.config';

export default defineConfig({
  // 커스텀 도메인(gazua.sch0718.dev)의 루트에서 서비스한다. GitHub Pages Settings › Custom domain과 함께 바꾼다.
  base: '/',
  // 개발 서버만 로컬 http 프록시(Node 컨테이너·wrangler dev)를 connect-src에 더한다. 연결 폼의 normalizeProxyUrl도 같은 규칙이다.
  plugins: [svelte(), VitePWA(pwaOptions), devCsp(), firebaseCsp(), firebaseAuthHelper()],
});
```

- [ ] **Step 3: 옮긴 파일을 지우고 vitest 설정을 고친다**

```bash
git rm auth-helper.config.ts auth-helper.config.test.ts csp.config.ts csp.config.test.ts
```

`vitest.config.ts`의 include에서 `'csp.config.test.ts', 'auth-helper.config.test.ts'`를 지운다.

```ts
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs', 'pwa.config.test.ts'],
```

`grep -rn "csp.config\|auth-helper.config\|DEV_LOCAL_PROXY_SOURCES" --include=*.ts --include=*.svelte --include=*.json --include=*.mjs . | grep -v node_modules`로 남은 참조를 찾는다. `src/`의 연결 폼(`normalizeProxyUrl`)이 `csp.config`를 import하고 있으면 `import { DEV_LOCAL_PROXY_SOURCES } from '@sch0718/vite-app'`로 바꾼다. `tsconfig.json`·`tsconfig.e2e.json`의 include에 지운 파일 이름이 있으면 지운다.

- [ ] **Step 4: 시험과 빌드**

```bash
pnpm vitest run pwa.config.test.ts
pnpm check
UNIVERSE_REUSE=true pnpm build
grep -o "connect-src[^;]*" dist/index.html
```

Expected: pwa 시험 통과(기존 시험 그대로). `pnpm check` 통과. 빌드 결과 CSP가 `connect-src 'self' https:`(로컬 http 없음).

- [ ] **Step 5: 커밋**

```bash
git add vite.config.ts pwa.config.ts vitest.config.ts tsconfig*.json src
git commit -m "chore: 로그인 도우미·CSP·PWA 설정을 @sch0718 패키지로 바꿈

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`package.json`, `pnpm-lock.yaml`, `sync-worker/package.json`은 add하지 않는다.)

---

### Task 10: sync-worker 전환

**Files:**

- Modify: `$GZ/sync-worker/src/{env.ts,session.ts,cors.ts,handler.ts,purge.ts,worker.ts,shares.ts,profiles.ts}`
- Modify: `$GZ/sync-worker/test/{d1.ts,harness.ts}`
- Modify: `$GZ/sync-worker/package.json`(jose를 devDependencies로. 커밋은 Task 16)
- Delete: `$GZ/sync-worker/src/auth/{certs.ts,verify.ts,verify.test.ts}`, `$GZ/sync-worker/src/{http.ts,db.ts}`
- Test: `$GZ/sync-worker/src/{session,profiles,shares,purge}.test.ts`, `test/d1.test.ts`(그대로 통과해야 한다)

- [ ] **Step 1: import를 패키지로 바꾼다**

```bash
cd $GZ/sync-worker
perl -pi -e "s#from '\./(http|db|auth/certs|auth/verify)'#from '\@sch0718/firebase-session/worker'#; s#from '\.\./src/(db|auth/certs)'#from '\@sch0718/firebase-session/worker'#" src/*.ts test/*.ts
git rm src/auth/certs.ts src/auth/verify.ts src/auth/verify.test.ts src/http.ts src/db.ts
```

`env.ts`는 두 줄이 같은 모듈을 가리키게 되므로 하나로 합친다.

```ts
import type { CertSource, D1Database } from '@sch0718/firebase-session/worker';
```

- [ ] **Step 2: `cors.ts`는 가즈아 값만 남긴다**

```ts
// 가즈아 sync-worker의 CORS 값. 출처 검사와 preflight 응답은 @sch0718/firebase-session/worker가 한다.
// CORS는 브라우저 보호일 뿐 인증을 대신하지 않는다(모든 개인 API는 토큰·세션을 따로 검사).

export const ALLOWED_METHODS = 'GET, POST, PUT, DELETE';
export const ALLOWED_HEADERS = 'Authorization, Content-Type, X-Gazua-Session, X-Share-Token';
```

- [ ] **Step 3: `session.ts`는 패키지를 감싼 얇은 파일로**

```ts
// 기기 세션은 @sch0718/firebase-session이 맡는다(D1 users·sessions, 30일 슬라이딩 만료, 기기별·전체 철회).
// 가즈아는 세션 헤더 이름과 환경값만 넘긴다. 헤더 이름은 설치된 PWA가 보내는 값이라 바꾸지 않는다.
import { createSessionAuth, type AuthContext } from '@sch0718/firebase-session/worker';
import type { SyncDeps, SyncEnv } from './env';

export {
  LABEL_MAX,
  REAUTH_WINDOW,
  SESSION_TTL,
  TOUCH_INTERVAL,
  type AuthContext,
} from '@sch0718/firebase-session/worker';

export const SESSION_HEADER = 'X-Gazua-Session';

// 요청마다 만든다. env(ALLOWED_EMAILS 등)를 그때그때 읽는다.
const sessions = (env: SyncEnv, deps: SyncDeps) =>
  createSessionAuth({
    db: env.DB,
    projectId: env.FIREBASE_PROJECT_ID,
    allowedEmails: env.ALLOWED_EMAILS,
    certs: deps.certs,
    sessionHeader: SESSION_HEADER,
    now: deps.now,
    random: deps.random,
    uuid: deps.uuid,
  });

export const createSession = (req: Request, env: SyncEnv, deps: SyncDeps, body: unknown) =>
  sessions(env, deps).create(req, body);
export const authenticate = (req: Request, env: SyncEnv, deps: SyncDeps): Promise<AuthContext> =>
  sessions(env, deps).authenticate(req);
export const listSessions = (env: SyncEnv, deps: SyncDeps, ctx: AuthContext) =>
  sessions(env, deps).list(ctx);
export const revokeSessions = (
  env: SyncEnv,
  deps: SyncDeps,
  ctx: AuthContext,
  target: { id: string } | 'current' | 'others',
) => sessions(env, deps).revoke(ctx, target);
```

- [ ] **Step 4: `handler.ts`**

import 부분:

```ts
import {
  CertsUnavailableError,
  corsHeaders,
  errorBody,
  HttpError,
  json,
  matchOrigin,
  preflight,
  readJson,
} from '@sch0718/firebase-session/worker';
import { ALLOWED_HEADERS, ALLOWED_METHODS } from './cors';
import type { SyncDeps, SyncEnv } from './env';
import {
  deleteProfile,
  getProfile,
  getRevision,
  listProfiles,
  listRevisions,
  putProfile,
  restoreProfile,
} from './profiles';
import {
  authenticate,
  createSession,
  listSessions,
  revokeSessions,
  type AuthContext,
} from './session';
import { createShare, listShares, readShare, revokeShare } from './shares';
```

세션 라우트 네 줄의 호출을 바꾼다.

```ts
  ['DELETE', /^\/v1\/session$/, '/v1/session', authed(async ({ env, deps, ctx }) => ok({ revoked: await revokeSessions(env, deps, ctx, 'current') }))],
  ['GET', /^\/v1\/sessions$/, '/v1/sessions', authed(async ({ env, deps, ctx }) => ok({ sessions: await listSessions(env, deps, ctx) }))],
```

```ts
return ok({ revoked: await revokeSessions(env, deps, ctx, 'others') });
```

```ts
  ['DELETE', /^\/v1\/sessions\/([^/]+)$/, '/v1/sessions/:id', authed(async ({ env, deps, ctx, params }) => ok({ revoked: await revokeSessions(env, deps, ctx, { id: params[0] }) }))],
```

preflight:

```ts
res = preflight(origin, { methods: ALLOWED_METHODS, headers: ALLOWED_HEADERS });
```

- [ ] **Step 5: `purge.ts`의 세션 정리**

import에 `import { purgeSessions } from '@sch0718/firebase-session/worker';`를 더하고, `const sessions = await db.prepare(...).bind(old - 30 * DAY, old, PURGE_ROWS_PER_RUN).run();` 문장을 다음으로 바꾼다.

```ts
// 세션은 패키지가 소유한 테이블이다. 같은 규칙(만료·철회 후 30일)으로 지운다.
const sessions = await purgeSessions(db, now, PURGE_ROWS_PER_RUN);
return { profiles: due.length, shares: shares.meta.changes, sessions };
```

- [ ] **Step 6: jose를 devDependencies로**

`sync-worker/src`에 jose import가 남았는지 본다: `grep -rn "from 'jose'" src` → 출력 없어야 한다. `sync-worker/package.json`에서 `"jose"`를 `dependencies`에서 `devDependencies`로 옮긴다(시험 하네스·smoke가 쓴다). `pnpm install`.

- [ ] **Step 7: 검사**

```bash
pnpm check
pnpm test
cd .. && pnpm --filter sync-worker check && pnpm --filter sync-worker test
```

Expected: sync-worker 시험 전부 통과(`session.test.ts`의 CORS·세션·라우터, profiles, shares, purge, d1). `verify.test.ts`는 패키지로 옮겨 여기서는 없다.

- [ ] **Step 8: wrangler 번들 확인**

```bash
cd sync-worker && pnpm exec wrangler deploy --dry-run --outdir /private/tmp/gazua-worker-dry && cd ..
```

Expected: 번들 성공, 오류 없음(배포하지 않는다).

- [ ] **Step 9: 커밋**

```bash
git add sync-worker/src sync-worker/test
git commit -m "chore(sync-worker): 토큰 검증·기기 세션·CORS·HTTP 도우미를 @sch0718/firebase-session/worker로 바꿈

세션 헤더는 X-Gazua-Session 그대로다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 클라이언트 sync 전환

**Files:**

- Modify: `$GZ/src/lib/sync/{config.ts,auth.ts,api.ts}`
- Delete: `$GZ/src/lib/sync/{firebaseImpl.ts,auth.test.ts,config.test.ts}`
- Test: `$GZ/src/lib/sync/{api.test.ts,controller.test.ts,roundtrip.test.ts}`(그대로 통과)

- [ ] **Step 1: `config.ts`, `auth.ts`를 다시 내보내는 파일로**

`src/lib/sync/config.ts`:

```ts
// 동기화 설정 읽기는 @sch0718/firebase-session/client가 한다. 가즈아는 Vite 환경값을 넘긴다.
import { readSyncConfig as read, type SyncConfig } from '@sch0718/firebase-session/client';

export type { SyncConfig };

export function readSyncConfig(
  env: Record<string, string | boolean | undefined> = import.meta.env,
): SyncConfig | null {
  return read(env);
}
```

`src/lib/sync/auth.ts`:

```ts
// Firebase 로그인 클라이언트는 @sch0718/firebase-session/client가 한다(SDK는 로그인할 때만 별도 청크로 받는다).
export { firebaseAuth, type AuthClient, type AuthUser } from '@sch0718/firebase-session/client';
```

```bash
git rm src/lib/sync/firebaseImpl.ts src/lib/sync/auth.test.ts src/lib/sync/config.test.ts
```

- [ ] **Step 2: `api.ts`를 `createSessionClient` 위로**

파일 머리(import부터 `export type ApiResult<T>`까지)를 다음으로 바꾼다. `IndexRow`, `ShareRow`, `SharedRead`, `SyncApi` 정의는 그대로 둔다. `DeviceSession`과 `Credentials` 인터페이스 정의는 지운다(패키지 것을 다시 내보낸다).

```ts
// sync-worker HTTP 클라이언트. 토큰·세션 헤더, 재시도, 공통 실패 매핑은 @sch0718/firebase-session/client가 한다.
// 여기서는 가즈아 고유 실패(409 conflict, 410 gone)와 profiles·shares 메서드를 더한다.
import {
  createSessionClient,
  type ApiResult as BaseResult,
  type BaseFail,
  type Credentials,
  type DeviceSession,
} from '@sch0718/firebase-session/client';
import type { ShareKind, ShareSnapshot } from '../share/snapshot';
import type { ProfileDocV1 } from './dto';

export type { Credentials, DeviceSession };

/** 설치된 PWA가 보내는 헤더라 바꾸지 않는다(sync-worker의 SESSION_HEADER와 같다). */
export const SESSION_HEADER = 'X-Gazua-Session';

type GazuaFail =
  | { ok: false; kind: 'conflict'; revision: number; doc: ProfileDocV1 | null }
  | {
      ok: false;
      kind: 'gone';
      deletedAt: number | null;
      purgeAt: number | null;
      revision?: number;
    };

/** 공통 실패(auth·not-allowed·offline·limit·invalid·not-found·server)와 가즈아 고유 실패(conflict·gone) */
export type ApiFail = BaseFail | GazuaFail;
export type ApiResult<T> = BaseResult<T, ApiFail>;

function mapStatus(status: number, body: Record<string, unknown>): GazuaFail | undefined {
  if (status === 409)
    return {
      ok: false,
      kind: 'conflict',
      revision: Number(body.revision ?? 0),
      doc: (body.doc as ProfileDocV1 | undefined) ?? null,
    };
  if (status === 410) {
    return {
      ok: false,
      kind: 'gone',
      deletedAt: typeof body.deletedAt === 'number' ? body.deletedAt : null,
      purgeAt: typeof body.purgeAt === 'number' ? body.purgeAt : null,
      ...(typeof body.revision === 'number' && { revision: body.revision }),
    };
  }
  return undefined;
}
```

`AUTH_CODES`, `toResult`, 그리고 `createSyncApi`의 본문을 지우고 다음으로 바꾼다.

```ts
export function createSyncApi(
  baseUrl: string,
  creds: Credentials,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): SyncApi {
  const c = createSessionClient<GazuaFail>({
    baseUrl,
    credentials: creds,
    sessionHeader: SESSION_HEADER,
    fetch: fetchImpl,
    mapStatus,
  });
  const send = c.send;
  const enc = encodeURIComponent;
  return {
    createSession: c.createSession,
    endSession: c.endSession,
    listSessions: c.listSessions,
    revokeSession: c.revokeSession,
    listProfiles: () => send('GET', '/v1/profiles'),
    getProfile: (id) => send('GET', `/v1/profiles/${enc(id)}`),
    putProfile: (id, body) => send('PUT', `/v1/profiles/${enc(id)}`, { body }),
    deleteProfile: (id, body) => send('DELETE', `/v1/profiles/${enc(id)}`, { body }),
    restoreProfile: (id, opId) =>
      send('POST', `/v1/profiles/${enc(id)}/restore`, { body: { opId } }),
    listRevisions: (id) => send('GET', `/v1/profiles/${enc(id)}/revisions`),
    getRevision: (id, rev) => send('GET', `/v1/profiles/${enc(id)}/revisions/${rev}`),
    createShare: (body) => send('POST', '/v1/shares', { body }),
    listShares: () => send('GET', '/v1/shares'),
    revokeShare: (id) => send('DELETE', `/v1/shares/${enc(id)}`),
    readShare: (capability) =>
      send('GET', '/v1/public/share', { auth: 'none', headers: { 'X-Share-Token': capability } }),
  };
}
```

- [ ] **Step 3: 검사**

```bash
pnpm check
pnpm vitest run src/lib/sync
pnpm --filter sync-worker test   # test/server.ts가 createSyncApi로 왕복 시험을 한다
```

Expected: 통과. `controller.test.ts`·`roundtrip.test.ts`는 바꾸지 않는다.

- [ ] **Step 4: Firebase 청크 이름 확인**

```bash
UNIVERSE_REUSE=true pnpm build
ls dist/assets | grep firebaseImpl
grep -c "firebaseImpl" dist/sw.js
```

Expected: `firebaseImpl-<hash>.js`가 하나 있다. `sw.js`의 precache 목록에는 없다(`grep -o 'url:"assets/firebaseImpl[^"]*"' dist/sw.js` 출력 없음).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/sync
git commit -m "chore(sync): 설정·로그인·세션 API 클라이언트를 @sch0718/firebase-session/client로 바꿈

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: UI 전환

**Files:**

- Modify: `$GZ/src/main.ts`, `$GZ/src/lib/ui/tokens.css`, `$GZ/src/lib/ui/tokens.test.ts`, `$GZ/src/lib/ui/theme.ts`
- Modify: 컴포넌트를 import하는 파일들(Task 이전 조사: `src/App.svelte`, `src/routes/*.svelte`, `src/sheets/*`, `src/lib/**/*.svelte`, `src/lib/ui/compare/loadIssue.ts`, `src/sheets/groupActions.ts`)
- Delete: `$GZ/src/lib/ui/components/`
- Test: `$GZ/src/lib/ui/{tokens,theme}.test.ts`, e2e

- [ ] **Step 1: import를 바꾼다**

```bash
cd $GZ
FILES=$(grep -rlE "components/[A-Za-z]+\.svelte'|components/snackbarStore\.svelte'" src --include=*.svelte --include=*.ts | grep -v "^src/lib/ui/components/")
perl -pi -e 's#import (\w+) from \x27(?:\.\.?/)+(?:lib/)?(?:ui/)?components/(\w+)\.svelte\x27;#"import { " . ($1 eq $2 ? $2 : "$2 as $1") . " } from \x27\@sch0718/ui-svelte\x27;"#e; s#from \x27(?:\.\.?/)+(?:lib/)?(?:ui/)?components/snackbarStore\.svelte\x27#from \x27\@sch0718/ui-svelte\x27#' $FILES
git rm -r src/lib/ui/components
grep -rn "components/" src --include=*.svelte --include=*.ts
```

Expected: 마지막 grep 출력 없음.

- [ ] **Step 2: 시트 닫기 단추 이름이 그대로인지 본다**

가즈아는 `closeLabel`을 넘기지 않는다(기본 '닫기'). e2e가 `aria-label="닫기"`나 `data-sheet-close`로 찾는 것은 그대로 동작한다.

- [ ] **Step 3: 토큰 CSS를 나눈다**

`src/main.ts`의 `import './lib/ui/tokens.css';` 앞 줄에 더한다.

```ts
import '@sch0718/ui-svelte/tokens.css';
```

`src/lib/ui/tokens.css`를 다음으로 바꾼다(가즈아 전용 토큰만. 값은 원본 그대로):

```css
@import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';

/* ===== 가즈아 전용 토큰 (스펙 8.2·8.3) =====
   범용 토큰(면·글자·강조·상태·크기·움직임)과 기본 스타일은 @sch0718/ui-svelte/tokens.css에 있다(main.ts에서 먼저 불러온다).
   라이트 = :root, 다크 = 시스템 설정(자동) 또는 data-theme="dark" 지정.
   값을 바꿀 때는 세 곳(라이트 / 다크 자동 / 다크 지정)을 함께 고친다. */
:root {
  --up: #d4202f; /* 스펙 8.2의 #e02e3c는 표면 2(hover 행)에서 4.02:1이라 AA 미달 → 4.59:1로 조정 */
  --down: #1d5fd6;
  --band: rgba(17, 19, 23, 0.045);
  --hatch: rgba(17, 19, 23, 0.24);
  --grid: rgba(17, 19, 23, 0.07);
  --s1: #eb6834;
  --s2: #1baf7a;
  --s3: #4a3aa7;
  --s4: #eda100;
  --s5: #e87ba4;
  --s6: #008300;
  --s7: #2a78d6;
  --s8: #e34948;
  /* 9·10번은 10종목 확장 때 더했다(2026-10-23). 기존 8색끼리의 가장 가까운 쌍보다 더 가까운 쌍을 만들지 않게 골랐다(색각 시뮬레이션·일반 시야 모두) */
  --s9: #9a4fb8;
  --s10: #c2185b;
  /* 자산 곡선의 비교 종목 선. --s1(#eb6834)은 --bg 위 2.99:1이라 3:1(그래픽)에 모자라 더 진하게: --bg 위 3.62:1 */
  --line-bench: #d95926;
  /* 선정 기준 결과의 ETF 선(curveStyles). 등락색으로 읽히지 않게 관례마다 고른다. 한국 관례(빨강▲·파랑▼)는 초록·황토,
     글로벌 관례(초록▲·빨강▼)는 아래 :root.global-colors에서 첫 선을 파랑으로 바꾼다. 둘 다 --bg 위 3:1 이상 */
  --etf-1: #008300;
  --etf-2: #9a6700;
}
```

그 뒤에 원본의 다크 두 블록에서 가즈아 전용 토큰(`--up`, `--down`, `--band`, `--hatch`, `--grid`, `--s1`~`--s10`, `--line-bench`, `--etf-1`, `--etf-2`)만 남긴 블록 두 개, 원본의 `:root.global-colors` 블록 세 개를 그대로, 그리고 다음을 둔다.

```css
html,
body {
  /* 브라우저 기본 당겨서 새로고침·튕김을 끄고 앱의 당겨서 새로고침(시세·당일 봉만 갱신)을 쓴다. */
  overscroll-behavior-y: contain;
}

.up {
  color: var(--up);
}
.down {
  color: var(--down);
}
```

확인: 원본과 패키지 CSS를 합친 토큰 값이 원본과 같다.

```bash
vals() { grep -hoE -- '--[a-z0-9-]+: [^;]+;' "$@" | sed 's#/\*.*##' | sort -u; }
diff <(vals $GZ_ORIG/src/lib/ui/tokens.css) <(vals node_modules/@sch0718/ui-svelte/dist/tokens.css src/lib/ui/tokens.css)
```

Expected: 출력 없음(같은 토큰·값의 집합).

- [ ] **Step 4: `tokens.test.ts`가 두 파일을 함께 읽게 한다**

파일 머리의 `css`와 `block` 정의를 바꾼다(나머지 시험은 그대로):

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { BENCH_STYLES, INDEX_STYLES } from './screen/curveStyles';

// 범용 토큰(@sch0718/ui-svelte) 다음에 가즈아 전용 토큰을 불러온다(main.ts와 같은 순서).
const require = createRequire(import.meta.url);
const css = [
  readFileSync(require.resolve('@sch0718/ui-svelte/tokens.css'), 'utf8'),
  readFileSync(new URL('./tokens.css', import.meta.url), 'utf8'),
].join('\n');

/** 같은 선택자 블록을 두 파일에서 모두 찾아 이어 붙인다. */
const block = (selector: string) => {
  const parts: string[] = [];
  for (let i = css.indexOf(`${selector} {`); i >= 0; i = css.indexOf(`${selector} {`, i + 1)) {
    parts.push(css.slice(i, css.indexOf('}', i)));
  }
  expect(parts.length, selector).toBeGreaterThan(0);
  return parts.join('\n');
};
```

- [ ] **Step 5: `theme.ts`**

```ts
// 테마 적용은 @sch0718/ui-svelte가 한다. 색 관례(등락색)는 가즈아 전용이다.
export { applyTheme, type ThemeChoice } from '@sch0718/ui-svelte';

export type ColorConvention = 'kr' | 'global';

/** 한국식(빨강▲/파랑▼) 또는 글로벌(초록▲/빨강▼). `--up/--down` 값만 바뀐다. */
export function applyColorConvention(c: ColorConvention): void {
  document.documentElement.classList.toggle('global-colors', c === 'global');
}
```

- [ ] **Step 6: 검사**

```bash
pnpm check
pnpm test
UNIVERSE_REUSE=true pnpm build
```

Expected: 통과. `pnpm test`의 tokens·theme·StatusChip 등 UI 시험 통과.

- [ ] **Step 7: 커밋**

```bash
git add src
git commit -m "chore(ui): 범용 토큰·테마·컴포넌트를 @sch0718/ui-svelte로 바꿈

주식 색 토큰, 색 관례, 당겨서 새로고침, Pretendard 로딩은 가즈아에 남긴다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 라이선스 고지 전환

**Files:**

- Modify: `$GZ/scripts/build-notices.mjs`, `$GZ/tests/build-notices.test.mjs`

- [ ] **Step 1: 시험을 가즈아 설정 시험만 남긴다**

`tests/build-notices.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BUNDLED_DEV, upstreamFile } from '../scripts/build-notices.mjs';

// 고지 생성(flatten·render·readTexts)은 @sch0718/license-notices의 시험이 확인한다. 여기서는 가즈아 설정만 본다.

test('the upstream copies exist for every mapped package', () => {
  for (const name of ['firebase', '@firebase/app', 'fancy-canvas']) {
    const text = readFileSync(
      new URL(`../scripts/licenses/${upstreamFile(name)}`, import.meta.url),
      'utf8',
    );
    assert.match(text, /Copyright/);
  }
  assert.equal(upstreamFile('svelte'), null);
});

test('bundled dev packages are kept, build-only ones are not', () => {
  for (const n of ['svelte', 'clsx', 'esm-env', 'workbox-precaching', 'workbox-window'])
    assert.equal(BUNDLED_DEV(n), true, n);
  for (const n of ['workbox-build', 'vite', 'typescript']) assert.equal(BUNDLED_DEV(n), false, n);
});
```

- [ ] **Step 2: 스크립트**

`scripts/build-notices.mjs`:

```js
// 앱이 쓰는 운영 의존성의 라이선스 전문을 모아 public/licenses.txt를 만든다(설정 → 정보 → 오픈소스와 데이터 출처).
// 생성은 @sch0718/license-notices가 한다. 여기서는 가즈아 값(번들되는 devDependencies, upstream 원문)만 정한다.
import { fileURLToPath } from 'node:url';
import { writeNotices } from '@sch0718/license-notices';

// devDependencies지만 런타임 코드가 번들에 들어가는 패키지(Svelte 런타임, PWA 서비스 워커의 Workbox).
export const BUNDLED_DEV = (name) =>
  ['svelte', 'clsx', 'esm-env'].includes(name) || /^workbox-(?!build$)/.test(name);

// 배포본에 라이선스 파일이 없는 패키지는 upstream 저장소의 원문을 scripts/licenses/에 두고 쓴다.
export function upstreamFile(name) {
  if (name === 'firebase' || name.startsWith('@firebase/')) return 'firebase.txt';
  if (name === 'fancy-canvas') return 'fancy-canvas.txt';
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { count } = writeNotices({
    out: fileURLToPath(new URL('../public/licenses.txt', import.meta.url)),
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    appName: '가즈아',
    licenseUrl: 'https://github.com/sch0718/gazua/blob/main/LICENSE',
    upstreamDir: fileURLToPath(new URL('./licenses/', import.meta.url)),
    upstream: upstreamFile,
    bundledDev: BUNDLED_DEV,
  });
  console.log(`licenses.txt: 패키지 ${count}개`);
}
```

- [ ] **Step 3: 검사와 비교**

```bash
pnpm test:scripts
pnpm notices
head -3 public/licenses.txt
diff <(grep -E '^[^ ]+ [0-9][^ ]* \(' public/licenses.txt | sort) /private/tmp/gazua-baseline/licenses.txt
```

Expected:

- 시험 통과.
- 첫 줄 `가즈아에서 쓰는 오픈소스 소프트웨어`.
- diff 결과: `@sch0718/firebase-session`, `@sch0718/ui-svelte`(prod)가 더해지는 줄만 있다(`<` 줄). 빠진 패키지(`>` 줄)는 없어야 한다. `jose`가 sync-worker의 prod에서 빠지는데 `@sch0718/firebase-session`의 의존으로 다시 들어오므로 그대로 있어야 한다.

- [ ] **Step 4: 커밋**

```bash
git add scripts/build-notices.mjs tests/build-notices.test.mjs
git commit -m "chore(notices): 라이선스 고지 생성을 @sch0718/license-notices로 바꿈

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 가즈아 전체 확인

**Files:** 없음(확인만).

- [ ] **Step 1: 모든 검사**

```bash
cd $GZ
pnpm check
pnpm check:e2e
pnpm test
pnpm test:scripts
UNIVERSE_REUSE=true pnpm build
pnpm --filter proxy test
pnpm --filter sync-worker check
pnpm --filter sync-worker test
UNIVERSE_REUSE=true pnpm e2e
```

Expected: 모두 통과. e2e(a11y 포함)가 실패하면 superpowers:systematic-debugging으로 원인을 찾는다. 원인이 패키지면 toolkit을 고치고 Task 8 Step 4로 다시 설치한다.

- [ ] **Step 2: 빌드 산출물을 기준과 비교한다**

```bash
B=/private/tmp/gazua-baseline
diff <(find dist -type f | sed -E 's/-[A-Za-z0-9_-]{8}\./-HASH./' | sort) $B/files.txt
diff <(python3 -m json.tool --sort-keys dist/manifest.webmanifest) <(python3 -m json.tool --sort-keys $B/manifest.webmanifest)
diff <(grep -o 'url:"[^"]*"' dist/sw.js | sed -E 's/-[A-Za-z0-9_-]{8}\./-HASH./' | sort) $B/precache.txt
grep -o "connect-src[^;]*" dist/index.html
```

Expected:

- 파일 목록: 같다. 청크가 나뉘는 방식이 바뀌어 `assets/` 아래 이름이 다른 줄이 있으면 적어 두고, `firebaseImpl-HASH.js`가 그대로 있는지 확인한다.
- 매니페스트: 같다(키 순서 무시).
- precache: 같다. `firebaseImpl`, `__/`, `help/`는 없어야 한다.
- CSP: `connect-src 'self' https:`.

- [ ] **Step 3: 개발 서버 CSP를 눈으로 확인한다**

```bash
pnpm dev --port 5199 &
sleep 3
curl -s http://localhost:5199/ | grep -o "connect-src[^;]*"
kill %1
```

Expected: `connect-src 'self' https: http://localhost:* http://127.0.0.1:* http://[::1]:*`.

- [ ] **Step 4: 결과를 메모로 남긴다**

비교 결과(같음/다름과 이유)를 `/Users/shinchoonho/Library/Application Support/Claude/side-session-notes/local_4df88641-7764-4b44-8af9-87aa0e7ae3ac/gazua-toolkit-verification.md`에 적는다.

---

## Phase C: 반영 (단계마다 사용자 확인)

### Task 15: toolkit PR과 발행

- [ ] **Step 1: 사용자에게 push·PR을 확인받는다**

보여 줄 것: `git log --oneline origin/main..HEAD`, Task 7 Step 8과 Task 14의 결과. 확인을 받으면:

```bash
cd $TK
git push -u origin feat/extract-gazua-common
gh pr create --repo sch0718/sch0718-toolkit-web --base main --title "feat: 가즈아 공통 코드를 패키지 넷으로 추출" --body "$(cat <<'EOF'
## 요약
- `@sch0718/firebase-session`(`/worker`·`/client`·`/vite`): Firebase ID 토큰 검증, 이메일 허용 목록, D1 기기 세션, 로그인·세션 API 클라이언트, 로그인 도우미·CSP Vite 플러그인
- `@sch0718/vite-app`: PWA 옵션 팩토리, 개발 서버 CSP 완화
- `@sch0718/ui-svelte`: 범용 디자인 토큰과 Svelte 5 컴포넌트
- `@sch0718/license-notices`: 라이선스 고지 생성
- 「넣는 기준」 4번을 '장치는 넣고 값은 서비스에'로 고침

설계: docs/superpowers/specs/2026-10-27-gazua-common-extraction-design.md
계획: docs/superpowers/plans/2026-10-27-gazua-common-extraction.md

## 확인
- `pnpm run verify`, `pnpm compat` 통과
- 가즈아에 tarball로 설치해 Vitest·Playwright·빌드 산출물 비교 통과

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

PR을 연 뒤 ccd_pr 도구로 상태를 연결한다(`get_status`, 필요하면 `bind_pr`).

- [ ] **Step 2: 병합은 사용자가 확인한 뒤**

CI 통과를 확인하고, 사용자가 병합을 승인하면 병합한다.

- [ ] **Step 3: Version Packages PR**

릴리스 워크플로가 연 "chore: Version Packages" PR에서 네 패키지가 0.1.0인지 확인하고, 사용자가 승인하면 병합한다. 발행 워크플로의 스모크 설치 결과를 확인한다.

- [ ] **Step 4: 사용자 몫을 안내한다**

- GitHub 패키지 설정에서 네 패키지마다 Manage Actions access → `sch0718/gazua`에 Read 권한
- 로컬 셸에 `GITHUB_PACKAGES_TOKEN`(classic, `read:packages`)
- Cloudflare 쪽에서 sync-worker를 빌드한다면 그 환경에도 토큰(가즈아가 wrangler를 로컬·Actions 중 어디서 돌리는지 `deploy.yml`과 sync-worker README로 확인해 알려 준다)

### Task 16: 가즈아에 발행 버전 반영

- [ ] **Step 1: tarball 설치를 발행 버전으로 바꾼다**

```bash
cd $GZ
cat > .npmrc <<'EOF'
@sch0718:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
EOF
pnpm add @sch0718/firebase-session@0.1.0 @sch0718/ui-svelte@0.1.0
pnpm add -D @sch0718/vite-app@0.1.0 @sch0718/license-notices@0.1.0
pnpm --filter sync-worker add @sch0718/firebase-session@0.1.0
grep -n "sch0718" package.json sync-worker/package.json   # file: 경로가 없어야 한다
```

가즈아 `.npmrc`가 이미 있으면 덮어쓰지 말고 두 줄만 더한다.

- [ ] **Step 2: 워크플로에 토큰을 넣는다**

`.github/workflows/ci.yml`의 두 job(`ci`, `e2e`)과 `deploy.yml`의 설치 job에:

```yaml
permissions:
  contents: read
  packages: read
```

를 두고(이미 `permissions`가 있으면 `packages: read`만 더한다), `pnpm install --frozen-lockfile` 단계에 다음을 붙인다.

```yaml
env:
  GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: Task 14 Step 1을 다시 돌린다**

Expected: 모두 통과.

- [ ] **Step 4: 사용자 확인 뒤 커밋·push·PR**

```bash
git add .npmrc package.json pnpm-lock.yaml sync-worker/package.json .github/workflows
git commit -m "chore: @sch0718 패키지 0.1.0을 GitHub Packages에서 설치

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin chore/use-toolkit-packages
gh pr create --repo sch0718/gazua --base main --title "chore: 공통 코드를 @sch0718 패키지로 바꿈" --body "$(cat <<'EOF'
## 요약
- 로그인 도우미·Firebase CSP 플러그인 → `@sch0718/firebase-session/vite`, PWA 설정·개발 서버 CSP → `@sch0718/vite-app`
- sync-worker 토큰 검증·기기 세션·CORS·HTTP 도우미 → `@sch0718/firebase-session/worker`(세션 헤더 `X-Gazua-Session` 유지, D1 스키마 변경 없음)
- 클라이언트 설정·Firebase 로그인·세션 API 핵심 → `@sch0718/firebase-session/client`(profiles·shares 메서드는 가즈아에 남음)
- 범용 토큰·테마·컴포넌트 → `@sch0718/ui-svelte`(주식 색 토큰·색 관례·Pretendard는 가즈아에 남음)
- 라이선스 고지 생성 → `@sch0718/license-notices`
- GitHub Packages 설치: `.npmrc`, 워크플로 `packages: read`

## 확인
- `pnpm check`, `check:e2e`, `test`, `test:scripts`, `build`, sync-worker `check`·`test`, Playwright e2e 통과
- 빌드 산출물(파일 목록, 매니페스트, precache 목록, CSP)을 바꾸기 전과 비교: Task 14 Step 2 결과를 여기에 한 줄씩 적는다

toolkit PR: Task 15 Step 1에서 연 PR 주소를 적는다

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

본문의 "확인" 두 줄은 실제 결과와 주소로 바꿔 넣고 보낸다. PR을 연 뒤 ccd_pr 도구로 상태를 연결하고 CI를 확인한다.
