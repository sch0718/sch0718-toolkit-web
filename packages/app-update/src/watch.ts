// 서비스 워커가 새 버전으로 바뀌면(controllerchange) 알아챈다.
// 접속 직후이고 사용자가 아직 아무것도 누르지 않았으면 바로 새로고침하고, 그 뒤면 서비스에 안내를 맡긴다.
// skipWaiting·clientsClaim을 켠 서비스 워커(@sch0718/vite-app createPwaOptions 기본값)를 전제로 한다.

import { createUpdateGate, type AppUpdateDocument, type UpdateGateOptions } from './gate.js';

export type AppUpdateServiceWorker = Pick<
  ServiceWorkerContainer,
  'controller' | 'addEventListener' | 'removeEventListener' | 'getRegistration'
>;

export interface WatchAppUpdateOptions extends UpdateGateOptions {
  /** 화면이 다시 보일 때, 마지막 확인에서 이 시간(ms)이 지났으면 새 버전을 확인한다. 기본 30분 */
  checkIntervalMs?: number;
  /** 기본값은 `navigator.serviceWorker`. 없으면 아무것도 하지 않는다. */
  serviceWorker?: AppUpdateServiceWorker;
  /** 기본값은 `document` */
  document?: AppUpdateDocument;
}

/** 지켜보기를 멈추는 함수를 돌려준다. */
export function watchAppUpdate(o: WatchAppUpdateOptions): () => void {
  const sw =
    o.serviceWorker ?? (typeof navigator === 'undefined' ? undefined : navigator.serviceWorker);
  if (!sw) return () => {};
  const doc = o.document ?? document;
  const gate = createUpdateGate(o, doc);
  const now = gate.now;
  const checkIntervalMs = o.checkIntervalMs ?? 30 * 60_000;

  let lastCheck = now();
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
    if (wasControlled) gate.fire();
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

  sw.addEventListener('controllerchange', changed);
  doc.addEventListener('visibilitychange', onVisible);
  return () => {
    disposed = true;
    gate.stop();
    sw.removeEventListener('controllerchange', changed);
    doc.removeEventListener('visibilitychange', onVisible);
  };
}
