type Entry = { root: HTMLElement; applied: HTMLElement[]; observers: MutationObserver[] };

let stack = $state.raw<Entry[]>([]);
let overflow = '';

function restore(entry: Entry): void {
  for (const observer of entry.observers) observer.disconnect();
  for (const el of entry.applied) el.inert = false;
  entry.observers = [];
  entry.applied = [];
}

function apply(entry: Entry): void {
  function disable(el: Element): void {
    // 시트 root의 inert는 각 Sheet가 closing·covered로 관리한다.
    if (!(el instanceof HTMLElement) || el.hasAttribute('data-sheet-root') || el.inert) return;
    el.inert = true;
    entry.applied.push(el);
  }
  for (
    let path = entry.root;
    path !== document.body && path.parentElement;
    path = path.parentElement
  ) {
    const parent = path.parentElement;
    const branch = path;
    for (const sibling of parent.children) {
      if (sibling !== branch) disable(sibling);
    }
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && node !== branch) disable(node);
        }
      }
    });
    observer.observe(parent, { childList: true });
    entry.observers.push(observer);
  }
}

export function pushSheet(root: HTMLElement): Entry {
  const top = stack.at(-1);
  if (top) restore(top);
  else {
    overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  const entry: Entry = { root, applied: [], observers: [] };
  stack = [...stack, entry];
  apply(entry);
  return entry;
}

export function popSheet(entry: Entry): void {
  const index = stack.indexOf(entry);
  if (index === -1) return;
  const top = isTopSheet(entry);
  if (top) restore(entry);
  stack = stack.filter((item) => item !== entry);
  if (top && stack.length) apply(stack.at(-1)!);
  if (!stack.length) document.body.style.overflow = overflow;
}

export function isTopSheet(entry: Entry | undefined): boolean {
  return entry !== undefined && stack.at(-1) === entry;
}

export function sheetOpen(): boolean {
  return stack.length > 0;
}

export function sheetCovered(entry: Entry | undefined): boolean {
  const top = stack.at(-1);
  return (
    !!entry && !!top && stack.includes(entry) && top !== entry && !entry.root.contains(top.root)
  );
}

export function sheetDepth(entry: Entry | undefined): number {
  return entry ? Math.max(0, stack.indexOf(entry)) : 0;
}
