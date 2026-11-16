import { tick } from 'svelte';

export type SnackbarAction = {
  label: string;
  run: () => void;
  /** 동작 뒤 포커스할 요소(예: 되돌린 행). 버튼이 사라져 포커스가 body로 빠지지 않게 렌더 뒤에 찾는다. */
  focus?: () => HTMLElement | null | undefined;
};
export type SnackbarItem = { id: number; message: string; action?: SnackbarAction };

let current = $state<SnackbarItem | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
// 현재 스낵바만 기록해 지난 id가 쌓이지 않게 한다.
let claimed: { id: number; owner: object } | undefined;

// 포커스가 스낵바 안에 있는 동안 타이머를 멈춘다. 멈출 때 남은 시간을 재 두고, 놓으면 그 남은 시간만큼 다시 흐른다.
let deadline = 0;
let remaining = 0;
let held = false;
// holdSnackbarWhileFocused가 지켜보는 요소의 리스너를 떼는 함수
let unwatch: (() => void) | undefined;

function stopWatching(): void {
  unwatch?.();
  unwatch = undefined;
}

let hosts = $state(0);

/** SnackbarHost가 붙어 있는 동안 센다. 호스트가 없는 앱(스낵바를 쓰지 않음)은 시트 안에도 알림 영역을 두지 않는다. */
export function registerSnackbarHost(): () => void {
  hosts++;
  return () => {
    hosts--;
  };
}

export function snackbarHostMounted(): boolean {
  return hosts > 0;
}

/** 영역이 이 알림을 한 프레임 이상 라이브 영역에 보였다고 기록한다(그 영역이 알렸다고 본다). */
export function claimSnackbar(id: number, owner: object): void {
  if (claimed?.id !== id) claimed = { id, owner };
}

/** 다른 영역이 이미 알린 알림이면 true. 같은 알림을 영역을 옮겨 그릴 때 다시 읽히지 않게 한다. */
export function snackbarClaimedElsewhere(id: number, owner: object): boolean {
  return claimed?.id === id && claimed.owner !== owner;
}

/** 렌더링용 현재 스낵바(없으면 null). */
export function currentSnackbar(): SnackbarItem | null {
  return current;
}

export function dismissSnackbar(): void {
  stopWatching();
  clearTimeout(timer);
  timer = undefined;
  held = false;
  current = null;
}

function arm(id: number, ms: number): void {
  deadline = Date.now() + ms;
  timer = setTimeout(() => {
    if (current?.id === id) dismissSnackbar();
  }, ms);
}

/** 새 스낵바는 이전 것을 대체하고 타이머도 새로 시작한다(멈춤도 풀린다). */
export function showSnackbar(message: string, action?: SnackbarAction, ms = 5000): void {
  stopWatching();
  clearTimeout(timer);
  held = false;
  const id = ++seq;
  current = { id, message, action };
  arm(id, ms);
}

/** 포커스가 스낵바로 들어오면 부른다: 타이머를 멈추고 남은 시간을 기억한다. */
export function holdSnackbar(): void {
  if (!current || held) return;
  held = true;
  clearTimeout(timer);
  timer = undefined;
  remaining = Math.max(0, deadline - Date.now());
}

/** 포커스가 스낵바를 떠나면 부른다: 처음부터가 아니라 남은 시간부터 다시 흐른다(사용자 지정 길이도 그대로). */
export function releaseSnackbar(): void {
  if (!current || !held) return;
  held = false;
  arm(current.id, remaining);
}

/**
 * 지운 뒤 포커스를 옮긴 요소(다음 행 등)에 포커스가 머무는 동안 멈춘다. 그 요소를 떠나거나 문서에서 빠지면 남은 시간부터 다시 흐른다.
 * 스낵바 버튼으로 옮기면 스낵바 자신의 멈춤이 이어받는다. 포커스가 그 요소에 없으면 아무것도 하지 않는다.
 */
export function holdSnackbarWhileFocused(el: HTMLElement): void {
  if (!current || document.activeElement !== el) return;
  stopWatching();
  holdSnackbar();
  const release = () => {
    stopWatching();
    releaseSnackbar();
  };
  // 포커스된 요소가 문서에서 빠지면 focusout이 오지 않을 수 있다.
  const observer = new MutationObserver(() => {
    if (!el.isConnected) release();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // 다시 정렬하느라 요소가 옮겨지면 브라우저가 포커스를 잠깐 버렸다가(focusout) 같은 렌더 안에서 되돌려 받는다.
  // 포커스가 다른 요소로 갔으면 바로 놓고(스낵바 버튼이면 그쪽 멈춤이 이어받는다), 어디에도 없으면 한 틱 뒤에도 그대로인지 본다.
  const onfocusout = (e: FocusEvent) => {
    if (e.relatedTarget) return release();
    void Promise.resolve().then(() => {
      if (unwatch === stop && document.activeElement !== el) release();
    });
  };
  const stop = () => {
    observer.disconnect();
    el.removeEventListener('focusout', onfocusout);
  };
  el.addEventListener('focusout', onfocusout);
  unwatch = stop;
}

/** 버튼 동작: 먼저 닫고 실행한다(동작이 새 스낵바를 띄워도 지워지지 않게). */
export function runSnackbarAction(): void {
  const action = current?.action;
  dismissSnackbar();
  action?.run();
  const focus = action?.focus;
  if (focus) {
    void tick().then(() => {
      const el = focus();
      if (el?.isConnected) el.focus();
    });
  }
}
