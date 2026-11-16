// 서비스 워커가 새 버전으로 바뀌면(controllerchange) 알아챈다.
// 접속 직후이고 사용자가 아직 아무것도 누르지 않았으면 바로 새로고침하고, 그 뒤면 서비스에 안내를 맡긴다.
// skipWaiting·clientsClaim을 켠 서비스 워커(@sch0718/vite-app createPwaOptions 기본값)를 전제로 한다.

export type AppUpdateServiceWorker = Pick<
  ServiceWorkerContainer,
  'controller' | 'addEventListener' | 'removeEventListener' | 'getRegistration'
>;
export type AppUpdateDocument = Pick<
  Document,
  'visibilityState' | 'addEventListener' | 'removeEventListener'
>;

export interface WatchAppUpdateOptions {
  /**
   * 자동 새로고침하지 않을 때 부른다. 「새 버전이 있어요 [새로고침]」 같은 안내를 띄우고, 누르면 `reload`를 부른다.
   * 새 버전마다 한 번 부른다.
   */
  onUpdate: (reload: () => void) => void;
  /** 접속 뒤 이 시간(ms) 안에 새 버전을 알았고 아직 누른 것이 없으면 바로 새로고침한다. 0이면 늘 안내만 한다. 기본 5000 */
  autoReloadMs?: number;
  /** 화면이 다시 보일 때, 마지막 확인에서 이 시간(ms)이 지났으면 새 버전을 확인한다. 기본 30분 */
  checkIntervalMs?: number;
  /** 기본값은 `navigator.serviceWorker`. 없으면 아무것도 하지 않는다. */
  serviceWorker?: AppUpdateServiceWorker;
  /** 기본값은 `document` */
  document?: AppUpdateDocument;
  /** 기본값은 `Date.now` */
  now?: () => number;
  /** 기본값은 `location.reload()` */
  reload?: () => void;
}

const INTERACTIONS = ['pointerdown', 'keydown'] as const;

/** 지켜보기를 멈추는 함수를 돌려준다. */
export function watchAppUpdate(o: WatchAppUpdateOptions): () => void {
  const sw =
    o.serviceWorker ?? (typeof navigator === 'undefined' ? undefined : navigator.serviceWorker);
  if (!sw) return () => {};
  const doc = o.document ?? document;
  const now = o.now ?? Date.now;
  const reload = o.reload ?? (() => location.reload());
  const autoReloadMs = o.autoReloadMs ?? 5000;
  const checkIntervalMs = o.checkIntervalMs ?? 30 * 60_000;

  const startedAt = now();
  let lastCheck = startedAt;
  let interacted = false;
  let disposed = false;
  // 처음 설치(clientsClaim)로 제어가 생긴 것은 새 버전이 아니다. 이미 제어받던 화면만 새 버전으로 본다.
  let controlled = !!sw.controller;
  // 첫 접속의 강력 새로고침(Shift+Reload)은 controller가 없어도 등록이 활성이다. 그때도 이미 설치된 것으로 본다.
  const initialCheck = controlled
    ? null
    : (async () => {
        try {
          controlled = !!(await sw.getRegistration())?.active;
        } catch {
          // 등록 확인에 실패하면 첫 설치로 본다.
        }
      })();

  const apply = (nextControlled: boolean) => {
    if (disposed) return;
    const wasControlled = controlled;
    controlled = nextControlled;
    if (!wasControlled) return;
    if (!interacted && now() - startedAt <= autoReloadMs) reload();
    else o.onUpdate(reload);
  };
  const changed = () => {
    if (disposed) return;
    // 확인 중에 온 이벤트도 당시 제어 상태와 발생 순서대로 판정한다.
    const nextControlled = !!sw.controller;
    if (initialCheck) void initialCheck.then(() => apply(nextControlled));
    else apply(nextControlled);
  };
  const visible = async () => {
    try {
      if (disposed || doc.visibilityState !== 'visible') return;
      const at = now();
      if (at - lastCheck < checkIntervalMs) return;
      lastCheck = at;
      const registration = await sw.getRegistration();
      if (!disposed) await registration?.update();
    } catch {
      // 오프라인 등 확인 실패는 다음에 화면이 보일 때 다시 시도한다.
    }
  };
  const onVisible = () => void visible();
  const touched = () => {
    interacted = true;
    for (const t of INTERACTIONS) doc.removeEventListener(t, touched, true);
  };

  sw.addEventListener('controllerchange', changed);
  doc.addEventListener('visibilitychange', onVisible);
  for (const t of INTERACTIONS) doc.addEventListener(t, touched, true);
  return () => {
    disposed = true;
    sw.removeEventListener('controllerchange', changed);
    doc.removeEventListener('visibilitychange', onVisible);
    for (const t of INTERACTIONS) doc.removeEventListener(t, touched, true);
  };
}
