// 발행 직후, 레지스트리에서 그 버전을 설치해 import되는지 확인한다(릴리스 워크플로에서 실행).
// PUBLISHED: changesets/action의 published-packages 출력. 예: [{"name":"@sch0718/seen-store","version":"0.1.0"}]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const published = JSON.parse(process.env.PUBLISHED ?? '[]');
const dir = mkdtempSync(join(tmpdir(), 'toolkit-smoke-'));
// 저장소 밖 빈 폴더라 setup-node가 만든 사용자 .npmrc(@sch0718 → GitHub Packages)만 적용된다.
writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
for (const { name, version } of published) {
  execFileSync('npm', ['install', '--no-save', `${name}@${version}`], {
    cwd: dir,
    stdio: 'inherit',
  });
  const exported = execFileSync(
    'node',
    [
      '--input-type=module',
      '-e',
      `console.log(Object.keys(await import(${JSON.stringify(name)})).join(','))`,
    ],
    { cwd: dir, encoding: 'utf8' },
  ).trim();
  if (!exported) throw new Error(`${name}@${version}: 내보낸 이름이 없습니다`);
  console.log(`설치 확인: ${name}@${version} (${exported})`);
}
rmSync(dir, { recursive: true, force: true });
