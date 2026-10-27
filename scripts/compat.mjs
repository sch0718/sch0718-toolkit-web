// 발행할 tarball을 소비자 조건(fixtures/*)에 실제로 설치해 타입 검사한다.
// 사용: pnpm build && pnpm compat [fixture 이름...]
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packsDir = join(root, '.packs');
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: corepackEnv });
const corepackEnv = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };

rmSync(packsDir, { recursive: true, force: true });
mkdirSync(packsDir);
const tarballs = {};
for (const dir of readdirSync(join(root, 'packages'))) {
  const pkgDir = join(root, 'packages', dir);
  const { name } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const out = execFileSync('pnpm', ['pack', '--pack-destination', packsDir], {
    cwd: pkgDir,
    encoding: 'utf8',
  });
  const file = out.trim().split('\n').at(-1);
  tarballs[name] = resolve(pkgDir, file);
}

// 저장소 안에서 설치하면 상위 pnpm-workspace.yaml을 따라가므로 저장소 밖 임시 폴더에서 한다.
const base = mkdtempSync(join(process.env.COMPAT_DIR ?? tmpdir(), 'toolkit-compat-'));
const wanted = process.argv.slice(2);
const fixtures = readdirSync(join(root, 'fixtures')).filter(
  (f) => !wanted.length || wanted.includes(f),
);
for (const fixture of fixtures) {
  console.log(`\n== ${fixture}`);
  const dir = join(base, fixture);
  cpSync(join(root, 'fixtures', fixture), dir, { recursive: true });
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = Object.fromEntries(Object.entries(tarballs).map(([n, f]) => [n, `file:${f}`]));
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  const manager = pkg.packageManager.split('@')[0];
  run(
    'corepack',
    manager === 'yarn' ? ['yarn', 'install', '--no-lockfile'] : [manager, 'install'],
    dir,
  );
  // fixture에 check 스크립트가 있으면(예: tsc + svelte-check) 그것을, 없으면 tsc만 돌린다.
  if (pkg.scripts?.check) run('corepack', [manager, 'run', 'check'], dir);
  else run('corepack', [manager, manager === 'yarn' ? 'run' : 'exec', 'tsc', '-p', '.'], dir);
}
rmSync(base, { recursive: true, force: true });
console.log(`\n호환 시험 통과: ${fixtures.join(', ')}`);
