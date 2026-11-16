// 빌드마다 앱 버전 id를 정해 앱 코드(import.meta.env.APP_VERSION)와 배포 루트의 version.json에 같이 넣는다.
// 서비스 워커가 없는 서비스가 @sch0718/app-update의 watchVersion으로 새 배포를 알아채는 데 쓴다.
import { execFileSync } from 'node:child_process';
import type { Plugin } from 'vite';

const COMMIT_ENV = ['CF_PAGES_COMMIT_SHA', 'WORKERS_CI_COMMIT_SHA', 'GITHUB_SHA'] as const;

/** 옵션 → 빌드 환경의 커밋 SHA → `git rev-parse HEAD` → 빌드 시각 순서로 정한다. */
export function resolveAppVersion(
  version?: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  git: () => string = () =>
    execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
): string {
  if (version) return version;
  for (const k of COMMIT_ENV) if (env[k]) return env[k];
  try {
    const sha = git().trim();
    if (sha) return sha;
  } catch {
    // git이 없는 빌드 환경
  }
  return String(Date.now());
}

export function appVersion(o: { version?: string } = {}): Plugin {
  // 한 빌드 안에서 config가 여러 번 불려도 define과 version.json의 id가 같도록 처음 한 번만 정한다.
  let id: string | undefined;
  return {
    name: 'sch0718-app-version',
    config(_, { command }) {
      id ??= command === 'build' ? resolveAppVersion(o.version) : 'dev';
      return { define: { 'import.meta.env.APP_VERSION': JSON.stringify(id) } };
    },
    generateBundle() {
      // SSR·Worker 출력에는 내지 않는다(브라우저가 받는 출력에만).
      if (!id || id === 'dev' || this.environment.config.consumer !== 'client') return;
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ version: id })}\n`,
      });
    },
  };
}
