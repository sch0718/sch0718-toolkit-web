// 서비스 워커가 없는 서비스용. 배포 루트의 version.json({"version":"<id>"})을 받아 이 화면의 id와 다르면 새 버전으로 본다.
// 시작할 때 한 번, 그리고 화면이 다시 보일 때 마지막 확인에서 checkIntervalMs가 지났으면 확인한다.

import { createUpdateGate, type AppUpdateDocument, type UpdateGateOptions } from './gate.js';

export interface WatchVersionOptions extends UpdateGateOptions {
  /** 이 화면을 만든 빌드의 id(보통 배포 커밋 SHA). `@sch0718/vite-app`의 `appVersion()`이 `import.meta.env.APP_VERSION`으로 준다. */
  current: string;
  /** 문서 base 기준 주소. 기본 `'/version.json'`(출처 루트). 하위 경로에 배포하면 `${import.meta.env.BASE_URL}version.json`을 준다 */
  url?: string;
  /** 화면이 다시 보일 때, 마지막 확인에서 이 시간(ms)이 지났으면 다시 확인한다. 기본 30분 */
  checkIntervalMs?: number;
  /** 기본값은 전역 `fetch` */
  fetch?: (url: URL, init: RequestInit) => Promise<Pick<Response, 'json'>>;
  /** 기본값은 `document` */
  document?: AppUpdateDocument & Pick<Document, 'baseURI'>;
  /** 자동 새로고침한 id를 적어 두는 곳. 기본값은 `sessionStorage` */
  storage?: () => Pick<Storage, 'getItem' | 'setItem'>;
}

const RELOADED_KEY = 'app-update:reloaded-for';

/** 지켜보기를 멈추는 함수를 돌려준다. */
export function watchVersion(o: WatchVersionOptions): () => void {
  if (!o.document && typeof document === 'undefined') return () => {};
  const doc = o.document ?? document;
  const get = o.fetch ?? ((url, init) => fetch(url, init));
  const gate = createUpdateGate(o, doc);
  const checkIntervalMs = o.checkIntervalMs ?? 30 * 60_000;
  let lastCheck = 0;
  let seen = o.current;
  let disposed = false;

  const check = async () => {
    lastCheck = gate.now();
    let v: unknown;
    try {
      // 기본은 출처 루트다. 문서 주소 기준이면 SPA 깊은 경로(/places/1)에서 /places/version.json을 찾는다.
      const res = await get(new URL(o.url ?? '/version.json', doc.baseURI), { cache: 'no-store' });
      v = ((await res.json()) as { version?: unknown } | null)?.version;
    } catch {
      return; // 오프라인·형식이 다른 응답은 다음 확인 때 다시 본다
    }
    // 같은 새 id는 한 번만 알린다.
    if (disposed || typeof v !== 'string' || v === o.current || v === seen) return;
    seen = v;
    // 같은 새 id로는 한 번만 자동 새로고침한다. HTML이 캐시에서 옛것으로 오면 끝없이 되풀이되기 때문이다.
    let again = true;
    try {
      const store = (o.storage ?? (() => sessionStorage))();
      again = store.getItem(RELOADED_KEY) === v;
      store.setItem(RELOADED_KEY, v);
    } catch {
      // 저장소가 막히면 자동 새로고침하지 않고 안내만 한다.
    }
    gate.fire(!again);
  };
  const onVisible = () => {
    if (!disposed && doc.visibilityState === 'visible' && gate.now() - lastCheck >= checkIntervalMs)
      void check();
  };

  doc.addEventListener('visibilitychange', onVisible);
  void check();
  return () => {
    disposed = true;
    gate.stop();
    doc.removeEventListener('visibilitychange', onVisible);
  };
}
