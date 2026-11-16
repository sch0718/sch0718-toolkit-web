// 서비스 워커가 없는 서비스용. 배포 루트의 version.json({"version":"<id>"})을 받아 이 화면의 id와 다르면 새 버전으로 본다.
// 시작할 때 한 번, 그리고 화면이 다시 보일 때 마지막 확인에서 checkIntervalMs가 지났으면 확인한다.

import { createUpdateGate, type AppUpdateDocument, type UpdateGateOptions } from './gate.js';

export interface WatchVersionOptions extends UpdateGateOptions {
  /** 이 화면을 만든 빌드의 id(보통 배포 커밋 SHA). `@sch0718/vite-app`의 `appVersion()`이 `import.meta.env.APP_VERSION`으로 준다. */
  current: string;
  /** 문서 base 기준 주소. 기본 `'version.json'` */
  url?: string;
  /** 화면이 다시 보일 때, 마지막 확인에서 이 시간(ms)이 지났으면 다시 확인한다. 기본 30분 */
  checkIntervalMs?: number;
  /** 기본값은 전역 `fetch` */
  fetch?: (url: URL, init: RequestInit) => Promise<Pick<Response, 'json'>>;
  /** 기본값은 `document` */
  document?: AppUpdateDocument & Pick<Document, 'baseURI'>;
}

/** 지켜보기를 멈추는 함수를 돌려준다. */
export function watchVersion(o: WatchVersionOptions): () => void {
  const doc = o.document ?? document;
  const get = o.fetch ?? ((url, init) => fetch(url, init));
  const gate = createUpdateGate(o, doc);
  const checkIntervalMs = o.checkIntervalMs ?? 30 * 60_000;
  let lastCheck = 0;
  let seen = o.current;
  let disposed = false;

  const check = async () => {
    lastCheck = gate.now();
    try {
      const res = await get(new URL(o.url ?? 'version.json', doc.baseURI), { cache: 'no-store' });
      const v: unknown = ((await res.json()) as { version?: unknown } | null)?.version;
      // 오류·형식이 다른 응답은 넘기고 다음 확인 때 다시 본다. 같은 새 id는 한 번만 알린다.
      if (disposed || typeof v !== 'string' || v === o.current || v === seen) return;
      seen = v;
      gate.fire();
    } catch {
      // 오프라인 등
    }
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
