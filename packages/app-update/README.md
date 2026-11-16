# @sch0718/app-update

배포 뒤 새 버전을 알아채고, 사용자에게 최근 바뀐 점을 한 번 보여 주는 도구입니다. 프레임워크와 무관하고 런타임 의존성이 없습니다.

## 새 버전 알아채기

서비스 워커가 새 버전으로 바뀌면(`controllerchange`) 알려 줍니다. `@sch0718/vite-app`의 `createPwaOptions` 기본값(`skipWaiting`·`clientsClaim`)을 쓰는 PWA를 전제로 합니다.

```ts
import { watchAppUpdate } from '@sch0718/app-update';
import { showSnackbar } from '@sch0718/ui-svelte';

if (import.meta.env.PROD) {
  watchAppUpdate({
    onUpdate: (reload) =>
      showSnackbar('새 버전이 있어요', { label: '새로고침', run: reload }, 10 * 60_000),
  });
}
```

- **접속 직후면 자동으로 새로고침합니다.** 배포 뒤 첫 접속에는 미리 담아 둔 옛 화면이 먼저 뜨고 새 버전은 뒤에서 설치됩니다. 접속 뒤 `autoReloadMs`(기본 5초) 안에 새 버전이 화면을 맡았고 아직 누르거나 입력한 것(`pointerdown`·`keydown`)이 없으면 바로 새로고침합니다.
- **쓰는 중이면 안내만 합니다.** 그 밖에는 `onUpdate(reload)`를 부릅니다. 입력 중인 내용이 날아가지 않게 새로고침은 사용자가 고릅니다. `autoReloadMs: 0`이면 늘 안내만 합니다(게임처럼 접속 직후에도 바로 진행되는 화면).
- **처음 설치는 새 버전이 아닙니다.** 처음 방문해 서비스 워커가 화면을 맡은 것(`clientsClaim`)은 알리지 않습니다.
- **오래 열어 둔 화면도 확인합니다.** 화면이 다시 보일 때(`visibilitychange`) 마지막 확인에서 `checkIntervalMs`(기본 30분)가 지났으면 `registration.update()`로 새 버전을 확인합니다.
- 서비스 워커가 없는 환경에서는 아무것도 하지 않습니다. 개발 서버에서는 부르지 않습니다.

직접 만든 이유: `vite-plugin-pwa`(별 4.3k, 2026-11-16 확인)의 `autoUpdate`+`virtual:pwa-register`는 새 버전이 오면 쓰는 중에도 바로 새로고침합니다. `prompt` 방식은 탭이 모두 닫힐 때까지 새 버전이 대기해서, 오래 켜 두는 PWA는 계속 옛 버전에 머뭅니다. 이 둘 사이(접속 직후만 자동, 그 뒤는 안내)를 고르려고 브라우저 API로 50줄 남짓을 직접 씁니다.

**자동 새로고침하면 안 되는 순간**이 있으면 `canAutoReload`로 그 순간에 묻습니다. false면 접속 직후라도 안내만 합니다.

```ts
watchAppUpdate({ onUpdate, canAutoReload: () => !battle.active && !player.playing });
```

## 서비스 워커가 없는 서비스 (`watchVersion`)

빌드 때 배포 루트에 `version.json`(`{"version":"<id>"}`)을 두고, 화면은 자기 id를 압니다. Vite 서비스는 `@sch0718/vite-app/app-version`의 `appVersion()`이 둘 다 해 줍니다.

```ts
import { watchVersion } from '@sch0718/app-update';

if (import.meta.env.PROD) {
  watchVersion({
    current: import.meta.env.APP_VERSION,
    onUpdate: (reload) =>
      toast('새 버전이 있어요', { action: { label: '새로고침', onClick: reload } }),
  });
}
```

- 시작할 때 한 번, 화면이 다시 보일 때 마지막 확인에서 `checkIntervalMs`(기본 30분)가 지났으면 `version.json`을 캐시 없이(`cache: 'no-store'`) 받습니다. 주소는 문서 base 기준이고 `url`로 바꿀 수 있습니다.
- id가 다르면 새 버전입니다. 자동 새로고침·안내 규칙(`autoReloadMs`, 조작 감지, `canAutoReload`)은 `watchAppUpdate`와 같습니다. 같은 새 id는 한 번만 알립니다.
- 네트워크 오류나 형식이 다른 응답은 조용히 넘기고 다음 확인 때 다시 봅니다.
- 빌드 도구가 없는 서비스도 같은 규약(`version.json`, 불투명 id 비교)을 따르면 됩니다.

## 최근 바뀐 점

서비스가 사용자용 릴리스 내용을 새것부터 적어 둡니다(버전마다 1~3줄). 개발자용 GitHub Release 본문과 따로 둡니다.

```ts
// src/lib/release-notes.ts
import type { ReleaseNote } from '@sch0718/app-update';

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  { version: 'v1.2.0', date: '2026-11-20', items: ['오답 노트에서 해설을 바로 펼쳐요.'] },
];
```

업데이트 뒤 첫 실행에서 한 번 알리려면 `takeUnseenReleases`에 `@sch0718/seen-store`를 넘깁니다. 안 본 릴리스를 새것부터 돌려주고 본 것으로 기록합니다. 기록이 하나도 없으면(처음 쓰는 사람) 빈 목록을 돌려줍니다.

```ts
import { takeUnseenReleases } from '@sch0718/app-update';
import { createSeenStore } from '@sch0718/seen-store';

const seen = createSeenStore({
  key: 'myapp:release-seen:v1',
  ids: RELEASE_NOTES.map((n) => n.version),
});
const [latest] = takeUnseenReleases(RELEASE_NOTES, seen);
if (latest) showSnackbar(`${latest.version}로 업데이트했어요`, { label: '바뀐 점', run: openHelp });
```

도움말에서는 `@sch0718/ui-svelte`의 `ReleaseNotes`로 최근 몇 개를 보여 줄 수 있습니다.

라이선스: [PolyForm Noncommercial 1.0.0](./LICENSE)
