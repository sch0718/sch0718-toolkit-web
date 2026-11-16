// 새 버전을 알았을 때 바로 새로고침할지, 서비스에 안내를 맡길지 정한다. watchAppUpdate·watchVersion이 함께 쓴다.

export type AppUpdateDocument = Pick<
  Document,
  'visibilityState' | 'addEventListener' | 'removeEventListener'
>;

export interface UpdateGateOptions {
  /**
   * 자동 새로고침하지 않을 때 부른다. 「새 버전이 있어요 [새로고침]」 같은 안내를 띄우고, 누르면 `reload`를 부른다.
   * 새 버전마다 한 번 부른다.
   */
  onUpdate: (reload: () => void) => void;
  /** 접속 뒤 이 시간(ms) 안에 새 버전을 알았고 아직 누른 것이 없으면 바로 새로고침한다. 0이면 늘 안내만 한다. 기본 5000 */
  autoReloadMs?: number;
  /**
   * 자동 새로고침해도 되는지 그 순간에 묻는다. false면 안내만 한다(전투 중, 재생 중, 편집 중 등). 기본은 늘 true
   */
  canAutoReload?: () => boolean;
  /** 기본값은 `Date.now` */
  now?: () => number;
  /** 기본값은 `location.reload()` */
  reload?: () => void;
}

const INTERACTIONS = ['pointerdown', 'keydown'] as const;

export function createUpdateGate(o: UpdateGateOptions, doc: AppUpdateDocument) {
  const now = o.now ?? Date.now;
  const reload = o.reload ?? (() => location.reload());
  const startedAt = now();
  let interacted = false;
  const touched = () => {
    interacted = true;
    stop();
  };
  const stop = () => {
    for (const t of INTERACTIONS) doc.removeEventListener(t, touched, true);
  };
  for (const t of INTERACTIONS) doc.addEventListener(t, touched, true);
  return {
    now,
    /** 새 버전을 알았을 때 부른다. `auto`가 false면 자동 새로고침하지 않는다. */
    fire(auto = true) {
      if (
        auto &&
        !interacted &&
        now() - startedAt <= (o.autoReloadMs ?? 5000) &&
        (o.canAutoReload?.() ?? true)
      )
        reload();
      else o.onUpdate(reload);
    },
    stop,
  };
}
