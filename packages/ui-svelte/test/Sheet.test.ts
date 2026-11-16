// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, flushSync, tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Sheet from '../src/lib/Sheet.svelte';
import SheetStackFixture from './SheetStackFixture.svelte';
import SheetSegmentedFixture from './SheetSegmentedFixture.svelte';
import SnackbarHost from '../src/lib/SnackbarHost.svelte';
import { dismissSnackbar, showSnackbar } from '../src/lib/snackbarStore.svelte.js';

afterEach(() => dismissSnackbar());

const body = createRawSnippet(() => ({
  render: () => `<div><button id="first">첫째</button><button id="second">둘째</button></div>`,
}));

/** 닫힘 애니메이션이 도는 브라우저처럼 보이게 한다. jsdom에는 getAnimations가 없어 시트가 바로 내려간다. */
function withAnimations(): () => void {
  const proto = HTMLElement.prototype as { getAnimations?: () => unknown[] };
  const original = proto.getAnimations;
  proto.getAnimations = () => [{}];
  return () => {
    if (original) proto.getAnimations = original;
    else delete proto.getAnimations;
  };
}

function setup(props: Record<string, unknown> = {}) {
  const onclose = vi.fn();
  const view = render(Sheet, { open: true, title: '지표 선택', onclose, children: body, ...props });
  return { onclose, ...view };
}

describe('Sheet', () => {
  it('renders nothing while closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a labelled modal dialog', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelId = dialog.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelId)?.textContent).toBe('지표 선택');
  });

  it('closes once on Escape', async () => {
    const { onclose } = setup();
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('한글 조합 중 Esc(isComposing 또는 keyCode 229)로는 닫지 않는다', async () => {
    const { onclose } = setup();
    const dialog = screen.getByRole('dialog');
    await fireEvent.keyDown(dialog, { key: 'Escape', isComposing: true });
    await fireEvent.keyDown(dialog, { key: 'Escape', keyCode: 229 });
    expect(onclose).not.toHaveBeenCalled();
  });

  it('closes on scrim click but not on dialog click', async () => {
    const { onclose, container } = setup();
    await fireEvent.click(screen.getByRole('dialog'));
    expect(onclose).not.toHaveBeenCalled();
    await fireEvent.click(container.ownerDocument.querySelector('.scrim')!);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('focuses the first focusable element on open', async () => {
    setup();
    await tick();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('닫기');
  });

  it('prefers a [data-autofocus] element over the first focusable', async () => {
    const withInput = createRawSnippet(() => ({
      render: () => `<div><input data-autofocus aria-label="검색" /></div>`,
    }));
    setup({ children: withInput });
    await tick();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('검색');
  });

  it('restores focus to the previously focused element on close', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { rerender } = setup();
    await tick();
    expect(document.activeElement).not.toBe(opener);
    await rerender({ open: false });
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('traps Tab inside the dialog', async () => {
    setup();
    await tick();
    const dialog = screen.getByRole('dialog');
    const focusables = dialog.querySelectorAll<HTMLElement>('button');
    const last = focusables[focusables.length - 1];
    last.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);
    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  /** 손잡이를 [clientY, ms] 순서로 끈다. 첫 점에서 누르고 마지막 점에서 뗀다. */
  async function drag(grab: Element, points: [number, number][]) {
    const now = vi.spyOn(performance, 'now');
    const [[y0, t0], ...rest] = points;
    now.mockReturnValue(t0);
    await fireEvent.pointerDown(grab, { pointerId: 1, clientY: y0 });
    for (const [i, [y, t]] of rest.entries()) {
      now.mockReturnValue(t);
      const last = i === rest.length - 1;
      await fireEvent.pointerMove(grab, { pointerId: 1, clientY: y });
      if (last) await fireEvent.pointerUp(grab, { pointerId: 1, clientY: y });
    }
    now.mockRestore();
  }

  it('closes on a slow downward drag only past 80px on the grab handle', async () => {
    const { onclose, container } = setup();
    const grab = container.ownerDocument.querySelector('.grab')!;
    await drag(grab, [
      [100, 0],
      [125, 500],
      [150, 1000],
    ]);
    expect(onclose).not.toHaveBeenCalled();
    await drag(grab, [
      [100, 0],
      [150, 500],
      [200, 1000],
    ]);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('빠르게 튕겨 내리면 80px에 못 미쳐도 닫는다(20px 미만은 무시)', async () => {
    const { onclose, container } = setup();
    const grab = container.ownerDocument.querySelector('.grab')!;
    await drag(grab, [
      [100, 0],
      [110, 10],
    ]);
    expect(onclose).not.toHaveBeenCalled();
    await drag(grab, [
      [100, 1000],
      [120, 1020],
      [140, 1040],
    ]);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('놓았을 때 닫지 않으면 끌던 자리에서 제자리로 돌아간다', async () => {
    const { container } = setup();
    const grab = container.ownerDocument.querySelector('.grab')!;
    const dialog = screen.getByRole('dialog');
    await fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
    await fireEvent.pointerMove(grab, { pointerId: 1, clientY: 105 });
    expect(dialog.querySelector<HTMLElement>('.sheet')!.style.transform).toBe('translateY(5px)');
    await fireEvent.pointerUp(grab, { pointerId: 1, clientY: 105 });
    expect(dialog.querySelector<HTMLElement>('.sheet')!.style.transform).toBe('');
  });

  it('닫으면 닫힘 애니메이션이 끝날 때까지 남되 누를 수 없고 접근성 트리에서 빠진다', async () => {
    const restore = withAnimations();
    try {
      const { rerender, container } = setup();
      const sheet = container.ownerDocument.querySelector<HTMLElement>('.sheet')!;
      await rerender({ open: false });
      const root = container.ownerDocument.querySelector<HTMLElement>('.root')!;
      expect(root.classList.contains('closing')).toBe(true);
      expect(root.inert).toBe(true);
      expect(screen.queryByRole('dialog')).toBeNull();
      // 앱이 [role=dialog][aria-modal]로 「모달이 열려 있음」을 판단하므로 닫는 동안에는 역할을 뗀다.
      expect(root.hasAttribute('role')).toBe(false);
      expect(root.hasAttribute('aria-modal')).toBe(false);
      await fireEvent.animationEnd(sheet);
      expect(container.ownerDocument.querySelector('.root')).toBeNull();
    } finally {
      restore();
    }
  });

  it('닫힘 애니메이션이 돌지 않으면 기다리지 않고 바로 내린다', async () => {
    const { rerender, container } = setup();
    await rerender({ open: false });
    expect(container.ownerDocument.querySelector('.root')).toBeNull();
  });

  it('animationend가 오지 않아도 시한이 지나면 내린다', async () => {
    vi.useFakeTimers();
    const restore = withAnimations();
    try {
      const { rerender, container } = setup();
      await rerender({ open: false });
      expect(container.ownerDocument.querySelector('.root')).not.toBeNull();
      await vi.advanceTimersByTimeAsync(400);
      expect(container.ownerDocument.querySelector('.root')).toBeNull();
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it('닫히는 도중 다시 열면 그대로 열린 상태로 돌아온다', async () => {
    const restore = withAnimations();
    try {
      const { rerender, container } = setup();
      await rerender({ open: false });
      const root = container.ownerDocument.querySelector<HTMLElement>('.root')!;
      expect(root.classList.contains('closing')).toBe(true);
      await rerender({ open: true });
      expect(container.ownerDocument.querySelector('.root')).toBe(root);
      expect(root.classList.contains('closing')).toBe(false);
      expect(root.inert).toBe(false);
      await fireEvent.animationEnd(container.ownerDocument.querySelector('.sheet')!);
      expect(screen.getByRole('dialog')).toBeTruthy();
    } finally {
      restore();
    }
  });

  it('skips tabindex=-1 elements when wrapping Tab (Segmented as last control)', async () => {
    render(SheetSegmentedFixture);
    await tick();
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: '닫기' });
    const selected = screen.getByRole('radio', { name: '나' });
    expect(selected.getAttribute('tabindex')).toBe('0');

    selected.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    close.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(selected);
  });

  it('ignores hidden elements when wrapping Tab', async () => {
    const withHidden = createRawSnippet(() => ({
      render: () =>
        `<div><button id="vis">보임</button><button id="h1" hidden>숨김</button><div style="display: none"><button id="h2">숨김2</button></div></div>`,
    }));
    setup({ children: withHidden });
    await tick();
    const dialog = screen.getByRole('dialog');
    const vis = dialog.querySelector<HTMLElement>('#vis')!;
    vis.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '닫기' }));
  });

  // <fieldset disabled> 안의 컨트롤은 자기 disabled 속성이 없어도 :disabled라 포커스할 수 없다.
  it('skips controls inside <fieldset disabled> when wrapping Tab', async () => {
    const withDisabledFieldset = createRawSnippet(() => ({
      render: () =>
        `<div><button id="enabled">켜짐</button><fieldset disabled><button id="off">x</button></fieldset></div>`,
    }));
    setup({ children: withDisabledFieldset });
    await tick();
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: '닫기' });
    const enabled = dialog.querySelector<HTMLElement>('#enabled')!;

    close.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(enabled);

    await fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });

  it('keeps controls in the first <legend> of a disabled fieldset (HTML :disabled rule)', async () => {
    const withLegend = createRawSnippet(() => ({
      render: () =>
        `<div><fieldset disabled><legend><button id="legend">범례</button></legend><button id="off">x</button></fieldset></div>`,
    }));
    setup({ children: withLegend });
    await tick();
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: '닫기' });

    close.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(dialog.querySelector('#legend'));
  });

  // 브라우저 Tab은 같은 name의 라디오 묶음에서 체크된 것(없으면 첫 것) 하나에만 선다.
  it('treats a native radio group as one Tab stop (the checked radio) when wrapping', async () => {
    const withRadios = createRawSnippet(() => ({
      render: () =>
        `<div><button id="first">첫째</button><input type="radio" name="g" value="a" aria-label="가" checked /><input type="radio" name="g" value="b" aria-label="나" /></div>`,
    }));
    setup({ children: withRadios });
    await tick();
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: '닫기' });
    const checked = screen.getByRole('radio', { name: '가' });

    checked.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(checked);
  });

  it('uses the first radio of a group with nothing checked', async () => {
    const withRadios = createRawSnippet(() => ({
      render: () =>
        `<div><input type="radio" name="g" aria-label="가" /><input type="radio" name="g" aria-label="나" /></div>`,
    }));
    setup({ children: withRadios });
    await tick();
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: '닫기' });

    close.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '가' }));
  });

  it('keeps radios without a name as separate Tab stops', async () => {
    const withRadios = createRawSnippet(() => ({
      render: () =>
        `<div><input type="radio" aria-label="이름 없음 1" /><input type="radio" aria-label="이름 없음 2" /></div>`,
    }));
    setup({ children: withRadios });
    await tick();
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: '닫기' });

    close.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '이름 없음 2' }));
  });

  // <details>의 첫 <summary>는 브라우저 Tab이 서는 컨트롤이다.
  it('includes the first <summary> of a <details> as a Tab stop', async () => {
    const withDetails = createRawSnippet(() => ({
      render: () => `<details><summary>더 보기</summary><p>내용</p></details>`,
    }));
    setup({ children: withDetails });
    await tick();
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: '닫기' });
    const summary = dialog.querySelector<HTMLElement>('summary')!;

    // 닫기 다음이 summary이므로 Tab을 막지 않는다(jsdom은 기본 이동을 하지 않아 막혔는지만 본다)
    close.focus();
    expect(await fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(close);

    summary.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(summary);
  });

  it('locks body scroll while open and restores it on close and on unmount', async () => {
    document.body.style.overflow = 'auto';
    const { rerender, unmount } = setup();
    await tick();
    expect(document.body.style.overflow).toBe('hidden');
    await rerender({ open: false });
    expect(document.body.style.overflow).toBe('auto');
    await rerender({ open: true });
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  it('with a snackbar action shown, Tab from the last control reaches it and the next Tab wraps to the first', async () => {
    render(SnackbarHost);
    setup();
    showSnackbar('삭제했어요', { label: '되돌리기', run: () => {} });
    await tick();
    const dialog = screen.getByRole('dialog');
    const inside = [...dialog.querySelectorAll<HTMLElement>('button')];
    const undo = screen.getByRole('button', { name: '되돌리기' });
    expect(undo.hasAttribute('data-snackbar-action')).toBe(true);

    expect(dialog.contains(undo)).toBe(true);
    expect(inside.at(-1)).toBe(undo);
    const lastControl = inside.at(-2)!;
    lastControl.focus();
    // jsdom은 기본 Tab 이동을 하지 않으므로 중간 이동을 막지 않는지 본다.
    expect(await fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(true);
    undo.focus();
    await fireEvent.keyDown(undo, { key: 'Tab' });
    expect(document.activeElement).toBe(inside[0]);

    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(undo);
    expect(await fireEvent.keyDown(undo, { key: 'Tab', shiftKey: true })).toBe(true);
  });

  it('without a snackbar action the loop stays inside the sheet', async () => {
    render(SnackbarHost);
    setup();
    showSnackbar('저장했어요');
    await tick();
    const dialog = screen.getByRole('dialog');
    const inside = [...dialog.querySelectorAll<HTMLElement>('button')];
    inside.at(-1)!.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(inside[0]);
  });

  it('when the previously focused element is gone, closing focuses returnFocus()', async () => {
    const opener = document.createElement('button');
    const fallback = document.createElement('button');
    document.body.append(opener, fallback);
    opener.focus();
    const returnFocus = vi.fn(() => fallback);
    const { rerender } = setup({ returnFocus });
    await tick();
    opener.remove();
    await rerender({ open: false });
    expect(document.activeElement).toBe(fallback);
    fallback.remove();
  });

  it('prefers the previous element over returnFocus while it is still in the document', async () => {
    const opener = document.createElement('button');
    const fallback = document.createElement('button');
    document.body.append(opener, fallback);
    opener.focus();
    const returnFocus = vi.fn(() => fallback);
    const { rerender } = setup({ returnFocus });
    await tick();
    await rerender({ open: false });
    expect(document.activeElement).toBe(opener);
    expect(returnFocus).not.toHaveBeenCalled();
    opener.remove();
    fallback.remove();
  });

  it('닫기 단추 이름은 closeLabel로 바꿀 수 있다(기본 닫기)', () => {
    const { unmount } = setup();
    expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();
    unmount();
    setup({ closeLabel: 'Close' });
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('배경의 inert를 포커스 복원 전에 풀고 앱이 건 inert는 보존한다', async () => {
    const opener = document.createElement('button');
    const disabled = document.createElement('aside');
    disabled.inert = true;
    document.body.append(opener, disabled);
    opener.focus();
    const restored: boolean[] = [];
    opener.addEventListener('focus', () => restored.push(opener.inert));
    const { rerender } = setup();
    await tick();
    expect(opener.inert).toBe(true);
    await rerender({ open: false });
    expect(opener.inert).toBe(false);
    expect(disabled.inert).toBe(true);
    expect(restored).toEqual([false]);
    expect(document.activeElement).toBe(opener);
    opener.remove();
    disabled.remove();
  });

  it('각 조상에 새로 붙은 배경 형제도 inert로 만들고 닫으면 되돌린다', async () => {
    const { container, rerender } = render(SheetStackFixture);
    const inner = document.createElement('button');
    const outer = document.createElement('button');
    container.append(inner);
    document.body.append(outer);
    await tick();
    expect(inner.inert).toBe(true);
    expect(outer.inert).toBe(true);
    await rerender({ aOpen: false });
    expect(inner.inert).toBe(false);
    expect(outer.inert).toBe(false);
    outer.remove();
  });

  it('맨 위 시트만 키를 처리하고 닫으면 아래 시트가 다시 배경을 막는다', async () => {
    const oncloseA = vi.fn();
    const oncloseB = vi.fn();
    const { container, rerender } = render(SheetStackFixture, { oncloseA, oncloseB });
    const a = screen.getByRole('dialog');
    await rerender({ bOpen: true });
    const b = screen.getByRole('dialog', { name: '시트 B' });
    expect(a.inert).toBe(true);
    expect(b.inert).toBe(false);
    expect(Number(b.style.zIndex)).toBeGreaterThan(Number(a.style.zIndex));
    await fireEvent.keyDown(b, { key: 'Escape' });
    expect(oncloseB).toHaveBeenCalledTimes(1);
    expect(oncloseA).not.toHaveBeenCalled();
    await rerender({ bOpen: false });
    expect(a.inert).toBe(false);
    expect(container.querySelector<HTMLElement>('[data-background]')!.inert).toBe(true);
  });

  it('DOM 앞쪽 시트를 나중에 열어도 시각적으로 맨 위에 쌓인다', async () => {
    const { rerender } = render(SheetStackFixture, { aOpen: false, bOpen: true });
    const b = screen.getByRole('dialog', { name: '시트 B' });
    await rerender({ aOpen: true, bOpen: true });
    const a = screen.getByRole('dialog', { name: '시트 A' });
    expect(Number(a.style.zIndex)).toBeGreaterThan(Number(b.style.zIndex));
    expect(a.inert).toBe(false);
    expect(b.inert).toBe(true);
  });

  it('위 시트를 닫으면 아래 root의 inert가 갱신된 뒤 이전 포커스를 복원한다', async () => {
    const { rerender } = render(SheetStackFixture);
    const a = screen.getByRole('dialog');
    const input = screen.getByRole('textbox', { name: 'A 입력' });
    input.focus();
    const focus = input.focus.bind(input);
    // jsdom에 없는 inert의 focus 차단을 이 요소에서만 재현한다.
    const restore = vi.spyOn(input, 'focus').mockImplementation(() => {
      if (!a.inert) focus();
    });
    try {
      await rerender({ bOpen: true });
      expect(document.activeElement).not.toBe(input);
      await rerender({ bOpen: false });
      expect(document.activeElement).toBe(input);
    } finally {
      restore.mockRestore();
    }
  });

  it('안에 중첩한 시트는 조상 root를 inert로 만들지 않고 닫힌 자손은 Tab에서 뺀다', async () => {
    const { rerender } = render(SheetStackFixture, { nested: true });
    const a = screen.getByRole('dialog');
    const input = screen.getByRole('textbox', { name: 'A 입력' });
    await rerender({ bOpen: true });
    const b = screen.getByRole('dialog', { name: '시트 B' });
    expect(a.contains(b)).toBe(true);
    expect(a.inert).toBe(false);
    expect(input.inert).toBe(true);
    await rerender({ bOpen: false });
    expect(input.inert).toBe(false);
    input.focus();
    await fireEvent.keyDown(input, { key: 'Tab' });
    expect(document.activeElement).toBe(a.querySelector('[data-sheet-close]'));
  });

  it('덮인 시트의 제목을 바꿔도 root가 inert로 남는다', async () => {
    const { rerender } = render(SheetStackFixture);
    const a = screen.getByRole('dialog');
    await rerender({ bOpen: true });
    await rerender({ bOpen: true, title: '바뀐 A' });
    expect(a.textContent).toContain('바뀐 A');
    expect(a.inert).toBe(true);
  });

  it('아래 시트부터 닫아도 스크롤 잠금을 유지하고 닫히는 root의 inert를 풀지 않는다', async () => {
    document.body.style.overflow = 'scroll';
    const { rerender } = render(SheetStackFixture);
    const a = screen.getByRole('dialog');
    await rerender({ bOpen: true });
    await rerender({ aOpen: false, bOpen: true });
    expect(document.body.style.overflow).toBe('hidden');
    await rerender({ aOpen: false, bOpen: false });
    expect(a.classList.contains('closing')).toBe(true);
    expect(a.inert).toBe(true);
    expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = '';
  });

  it('시트 안 스낵바를 호스트로 돌려도 같은 알림을 라이브 영역에 다시 넣지 않는다', async () => {
    const host = render(SnackbarHost);
    showSnackbar('이전 알림');
    await tick();
    expect(host.container.querySelector('[role="status"]')!.textContent).toContain('이전 알림');
    const { rerender } = setup();
    await tick();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('이전 알림');
    expect(dialog.querySelector('[aria-live="polite"]')!.textContent).toBe('');
    // 시트가 열린 동안 호스트의 상태 영역은 숨어, getByRole('status')는 시트 안 영역 하나만 찾는다.
    expect(host.container.querySelector('[role="status"]')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(screen.getByRole('status').closest('[role="dialog"]')).toBe(dialog);
    await rerender({ open: false });
    expect(host.container.textContent).toContain('이전 알림');
    expect(host.container.querySelector('[role="status"]')!.textContent).toBe('');
    await rerender({ open: true });
    showSnackbar('삭제했어요', { label: '되돌리기', run: () => {} });
    await tick();
    const live = screen.getByRole('status');
    expect(screen.getByRole('dialog').contains(live)).toBe(true);
    expect(live.textContent).toContain('삭제했어요');
    expect(host.container.textContent?.trim()).toBe('');
    await rerender({ open: false });
    expect(host.container.textContent).toContain('삭제했어요');
    expect(host.container.querySelector('[role="status"]')!.textContent).toBe('');
    showSnackbar('새 알림');
    await tick();
    expect(host.container.querySelector('[role="status"]')!.textContent).toContain('새 알림');
  });

  it('SnackbarHost가 없으면 시트 안에도 알림 영역을 두지 않는다', () => {
    setup();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('dialog').querySelector('[aria-live]')).toBeNull();
  });

  it('스낵바 포커스를 가진 시트를 닫으면 남은 시간부터 다시 흐른다', async () => {
    vi.useFakeTimers();
    try {
      render(SnackbarHost);
      const { rerender } = setup();
      showSnackbar('삭제했어요', { label: '되돌리기', run: () => {} }, 8000);
      await tick();
      vi.advanceTimersByTime(3000);
      screen.getByRole('button', { name: '되돌리기' }).focus();
      vi.advanceTimersByTime(60_000);
      await rerender({ open: false });
      vi.advanceTimersByTime(4999);
      flushSync();
      expect(screen.getByRole('button', { name: '되돌리기' })).toBeTruthy();
      vi.advanceTimersByTime(1);
      flushSync();
      expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
