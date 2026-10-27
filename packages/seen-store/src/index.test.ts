import { describe, expect, it, vi } from 'vitest';
import { createSeenStore } from './index.js';

const KEY = 'test:seen:v1';
const IDS = ['library', 'map', 'share'] as const;
type Id = (typeof IDS)[number];

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const create = (storage: () => Storage) => createSeenStore<Id>({ key: KEY, ids: IDS, storage });

describe('createSeenStore', () => {
  it('기록을 읽고 식별자를 중복 없이 저장하며 초기화한다', () => {
    const storage = memoryStorage();
    storage.setItem(KEY, '["library"]');
    const store = create(() => storage);
    expect([...store.read()]).toEqual(['library']);
    store.mark('map');
    store.mark('map');
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual(['library', 'map']);
    store.reset();
    expect(storage.getItem(KEY)).toBeNull();
    expect(store.read().size).toBe(0);
  });

  it.each(['broken', '{}', '[1]', '["unknown"]', 'null'])('손상된 값 %s를 무시한다', (value) => {
    const storage = memoryStorage();
    storage.setItem(KEY, value);
    expect(create(() => storage).read().size).toBe(0);
  });

  it('모르는 식별자만 빼고 아는 기록은 남긴다', () => {
    const storage = memoryStorage();
    storage.setItem(KEY, '["library","future",3]');
    expect([...create(() => storage).read()]).toEqual(['library']);
  });

  it('Object.prototype의 이름은 식별자로 받지 않는다', () => {
    const storage = memoryStorage();
    storage.setItem(KEY, '["toString","constructor","map"]');
    expect([...create(() => storage).read()]).toEqual(['map']);
  });

  it('깨진 값이 있어도 새 기록은 저장소에 남는다', () => {
    const storage = memoryStorage();
    storage.setItem(KEY, 'broken');
    create(() => storage).mark('map');
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual(['map']);
    expect([...create(() => storage).read()]).toEqual(['map']);
  });

  it('저장소 접근 실패 시 페이지 메모리에 기록한다', () => {
    const store = create(() => {
      throw new Error('차단');
    });
    expect(store.read().size).toBe(0);
    store.mark('library');
    expect(store.read().has('library')).toBe(true);
    store.reset();
    expect(store.read().size).toBe(0);
  });

  it('쓰기 실패 시 읽었던 값과 새 기록을 모두 기억한다', () => {
    const storage = memoryStorage();
    storage.setItem(KEY, '["map"]');
    const store = create(() => storage);
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('용량');
    });
    store.mark('library');
    expect([...store.read()]).toEqual(['map', 'library']);
    vi.spyOn(storage, 'removeItem').mockImplementation(() => {
      throw new Error('차단');
    });
    store.reset();
    expect(store.read().size).toBe(0);
  });

  it('storage를 주지 않으면 window가 없는 환경에서도 메모리로 동작한다', () => {
    const store = createSeenStore<Id>({ key: KEY, ids: IDS });
    expect(store.read().size).toBe(0);
    store.mark('share');
    expect([...store.read()]).toEqual(['share']);
  });
});
