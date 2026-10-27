// 발행 직후, 레지스트리에서 그 버전을 설치해 import되는지 확인한다(릴리스 워크플로에서 실행).
// PUBLISHED: changesets/action의 published-packages 출력. 예: [{"name":"@sch0718/seen-store","version":"0.1.0"}]
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 내보내기 항목에서 실제로 불러올 파일 경로를 고른다. svelte 조건이 있으면 그 경로를 쓴다.
function pickTarget(entry) {
  if (typeof entry === 'string') return { target: entry, svelte: false };
  if (entry && typeof entry === 'object') {
    if (typeof entry.svelte === 'string') return { target: entry.svelte, svelte: true };
    const target = entry.import ?? entry.default;
    if (typeof target === 'string') return { target, svelte: false };
  }
  return { target: undefined, svelte: false };
}

// dir/node_modules에 설치된 패키지 하나를 exports의 하위 경로마다 확인한다.
// "." 내보내기가 없는 패키지(firebase-session)와 .svelte 파일을 내보내는 패키지(ui-svelte)도 다룬다.
export function checkInstalled(dir, name) {
  const pkg = JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'), 'utf8'));
  const raw = pkg.exports ?? {};
  // "exports": "./x.js"나 조건만 있는 객체는 "."의 줄임 표기다.
  const exportsField =
    typeof raw === 'string' || !Object.keys(raw).some((key) => key.startsWith('.'))
      ? { '.': raw }
      : raw;
  const checked = [];
  for (const [subpath, entry] of Object.entries(exportsField)) {
    if (subpath === './package.json') continue;
    const { target, svelte } = pickTarget(entry);
    // CSS·SQL처럼 .js가 아닌 파일은 import 대상이 아니다.
    if (!target?.endsWith('.js')) continue;
    const specifier = subpath === '.' ? name : `${name}/${subpath.slice(2)}`;
    if (svelte) {
      // .svelte 파일은 Node가 import하지 못한다. 파일이 있는지만 본다.
      if (!existsSync(join(dir, 'node_modules', name, target))) {
        throw new Error(`${name}@${pkg.version}: ${specifier}의 ${target}이(가) 없습니다`);
      }
      checked.push(`${subpath}: svelte 파일 있음`);
      continue;
    }
    const exported = execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `console.log(Object.keys(await import(${JSON.stringify(specifier)})).join(','))`,
      ],
      { cwd: dir, encoding: 'utf8' },
    ).trim();
    if (!exported) throw new Error(`${specifier}@${pkg.version}: 내보낸 이름이 없습니다`);
    checked.push(`${subpath}: ${exported}`);
  }
  if (checked.length === 0) throw new Error(`${name}@${pkg.version}: 확인할 내보내기가 없습니다`);
  for (const line of checked) console.log(`설치 확인: ${name}@${pkg.version} (${line})`);
}

// 스크립트로 직접 실행될 때만 레지스트리에서 설치해 확인한다. 시험에서는 checkInstalled만 불러 쓴다.
// 경로에 심볼릭 링크가 있어도 직접 실행을 알아보도록 실제 경로로 비교한다(아니면 아무것도 검사하지 않고 통과한다).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const published = JSON.parse(process.env.PUBLISHED ?? '[]');
  const dir = mkdtempSync(join(tmpdir(), 'toolkit-smoke-'));
  // 저장소 밖 빈 폴더라 setup-node가 만든 사용자 .npmrc(@sch0718 → GitHub Packages)만 적용된다.
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  for (const { name, version } of published) {
    execFileSync('npm', ['install', '--no-save', `${name}@${version}`], {
      cwd: dir,
      stdio: 'inherit',
    });
    checkInstalled(dir, name);
  }
  rmSync(dir, { recursive: true, force: true });
}
