/** 사용자에게 보여 줄 릴리스 내용. 서비스가 새것부터 차례로 적는다. */
export interface ReleaseNote {
  /** 예: 'v1.2.0' */
  version: string;
  /** 예: '2026-11-16' */
  date: string;
  /** 사용자용 1~3줄 */
  items: readonly string[];
}

/** `@sch0718/seen-store`의 `createSeenStore({ key, ids: notes.map((n) => n.version) })`가 그대로 맞는다. */
export interface ReleaseSeenStore {
  read(): ReadonlySet<string>;
  mark(id: string): void;
}

/**
 * 아직 안 본 릴리스를 새것부터 돌려주고, 모두 본 것으로 기록한다.
 * 기록이 하나도 없으면 처음 쓰는 사람으로 보고 빈 목록을 돌려준다(처음부터 「바뀐 점」을 보여 주지 않는다).
 */
export function takeUnseenReleases(
  notes: readonly ReleaseNote[],
  store: ReleaseSeenStore,
): ReleaseNote[] {
  const seen = store.read();
  const unseen = notes.filter((n) => !seen.has(n.version));
  for (const n of unseen) store.mark(n.version);
  return seen.size === 0 ? [] : unseen;
}
