/** 이미 본 항목(처음 안내 등)의 식별자를 이 브라우저에 기록한다. */
export interface SeenStore<Id extends string> {
  /** 기록된 식별자. 모르는 식별자와 깨진 값은 빠진다. */
  read(): ReadonlySet<Id>;
  mark(id: Id): void;
  reset(): void;
}

export interface SeenStoreOptions<Id extends string> {
  /** 저장소 키. 앱마다 다르게 둔다. 예: `tripmap:help-seen:v1` */
  key: string;
  /** 유효한 식별자 목록. 다른 버전이 남긴 모르는 식별자는 읽을 때 뺀다. */
  ids: readonly Id[];
  /** 기본값은 `window.localStorage`. 호출할 때마다 꺼내므로 접근 실패도 잡는다. */
  storage?: () => Storage;
}

/** 저장소가 막히면 이번 페이지 로드 동안 메모리만 쓴다. */
export function createSeenStore<Id extends string>({
  key,
  ids,
  storage = () => window.localStorage,
}: SeenStoreOptions<Id>): SeenStore<Id> {
  const known: ReadonlySet<string> = new Set(ids);
  let memory = new Set<Id>();
  let memoryOnly = false;

  function read(): ReadonlySet<Id> {
    if (memoryOnly) return memory;
    let raw: string | null;
    try {
      raw = storage().getItem(key);
    } catch {
      memoryOnly = true;
      return memory;
    }
    // 깨진 값은 빈 기록으로 본다. 다음 기록이 덮어쓰도록 저장소는 계속 쓴다.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw ?? '[]');
    } catch {
      parsed = [];
    }
    memory = new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is Id => typeof id === 'string' && known.has(id))
        : [],
    );
    return memory;
  }

  function mark(id: Id) {
    memory = new Set([...read(), id]);
    if (memoryOnly) return;
    try {
      storage().setItem(key, JSON.stringify([...memory]));
    } catch {
      memoryOnly = true;
    }
  }

  function reset() {
    memory = new Set();
    try {
      storage().removeItem(key);
    } catch {
      memoryOnly = true;
    }
  }

  return { read, mark, reset };
}
