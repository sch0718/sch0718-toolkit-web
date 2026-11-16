import { describe, expect, it } from 'vitest';
import { appVersion, resolveAppVersion } from './appVersion.js';

describe('resolveAppVersion', () => {
  const noGit = () => {
    throw new Error('no git');
  };
  it('옵션 → 빌드 환경 커밋 → git → 빌드 시각 순서로 정한다', () => {
    expect(resolveAppVersion('v1', { GITHUB_SHA: 'g' }, noGit)).toBe('v1');
    expect(
      resolveAppVersion(undefined, { CF_PAGES_COMMIT_SHA: 'cf', GITHUB_SHA: 'g' }, noGit),
    ).toBe('cf');
    expect(resolveAppVersion(undefined, { WORKERS_CI_COMMIT_SHA: 'w' }, noGit)).toBe('w');
    expect(resolveAppVersion(undefined, {}, () => 'abc\n')).toBe('abc');
    expect(resolveAppVersion(undefined, {}, noGit)).toMatch(/^\d+$/);
  });
});

describe('appVersion', () => {
  type Hook = (this: {
    emitFile: (f: unknown) => void;
    environment: { config: { consumer: string } };
  }) => void;
  const run = (command: 'build' | 'serve', consumer = 'client') => {
    const p = appVersion({ version: 'abc' });
    const config = (p.config as (c: object, e: { command: string }) => { define: object })(
      {},
      { command },
    );
    const files: unknown[] = [];
    (p.generateBundle as unknown as Hook).call({
      emitFile: (f) => files.push(f),
      environment: { config: { consumer } },
    });
    return { config, files };
  };

  it('빌드에서는 id를 앱 코드에 넣고 version.json을 낸다', () => {
    const { config, files } = run('build');
    expect(config.define).toEqual({ 'import.meta.env.APP_VERSION': '"abc"' });
    expect(files).toEqual([
      { type: 'asset', fileName: 'version.json', source: '{"version":"abc"}\n' },
    ]);
  });

  it('SSR·Worker 출력에는 version.json을 내지 않는다', () => {
    expect(run('build', 'server').files).toEqual([]);
  });

  it('개발 서버에서는 dev로 두고 version.json을 내지 않는다', () => {
    const { config, files } = run('serve');
    expect(config.define).toEqual({ 'import.meta.env.APP_VERSION': '"dev"' });
    expect(files).toEqual([]);
  });
});
