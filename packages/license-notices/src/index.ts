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
