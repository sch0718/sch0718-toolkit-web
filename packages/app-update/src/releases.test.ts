import { describe, expect, it } from 'vitest';
import { createSeenStore } from '../../seen-store/src/index.js';
import { takeUnseenReleases, type ReleaseNote } from './releases.js';

const NOTES: ReleaseNote[] = [
  { version: 'v1.2.0', date: '2026-11-20', items: ['새 기능'] },
  { version: 'v1.1.0', date: '2026-11-10', items: ['고친 점'] },
];

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

const store = (storage: Storage, notes: readonly ReleaseNote[]) =>
  createSeenStore({
    key: 'app:release-seen:v1',
    ids: notes.map((n) => n.version),
    storage: () => storage,
  });

describe('takeUnseenReleases', () => {
  it('처음 쓰는 사람에게는 보여 주지 않고 모두 본 것으로 기록한다', () => {
    const s = memoryStorage();
    expect(takeUnseenReleases(NOTES, store(s, NOTES))).toEqual([]);
    expect(takeUnseenReleases(NOTES, store(s, NOTES))).toEqual([]);
  });

  it('새 릴리스가 생기면 안 본 것만 새것부터 한 번 돌려준다', () => {
    const s = memoryStorage();
    const old = NOTES.slice(1);
    takeUnseenReleases(old, store(s, old));
    const next: ReleaseNote[] = [
      { version: 'v1.3.0', date: '2026-11-30', items: ['더'] },
      ...NOTES,
    ];
    expect(takeUnseenReleases(next, store(s, next)).map((n) => n.version)).toEqual([
      'v1.3.0',
      'v1.2.0',
    ]);
    expect(takeUnseenReleases(next, store(s, next))).toEqual([]);
  });
});
