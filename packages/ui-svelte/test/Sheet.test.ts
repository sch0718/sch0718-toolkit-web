// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Sheet from '../src/lib/Sheet.svelte';
import SheetSegmentedFixture from './SheetSegmentedFixture.svelte';
import SnackbarHost from '../src/lib/SnackbarHost.svelte';
import { dismissSnackbar, showSnackbar } from '../src/lib/snackbarStore.svelte.js';

afterEach(() => dismissSnackbar());

const body = createRawSnippet(() => ({
  render: () => `<div><button id="first">첫째</button><button id="second">둘째</button></div>`,
}));

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

  it('closes on a downward drag of more than 80px on the grab handle', async () => {
    const { onclose, container } = setup();
    const grab = container.ownerDocument.querySelector('.grab')!;
    await fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
    await fireEvent.pointerMove(grab, { pointerId: 1, clientY: 150 });
    await fireEvent.pointerUp(grab, { pointerId: 1, clientY: 150 });
    expect(onclose).not.toHaveBeenCalled();
    await fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
    await fireEvent.pointerMove(grab, { pointerId: 1, clientY: 200 });
    await fireEvent.pointerUp(grab, { pointerId: 1, clientY: 200 });
    expect(onclose).toHaveBeenCalledTimes(1);
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

    inside.at(-1)!.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(undo);
    await fireEvent.keyDown(undo, { key: 'Tab' });
    expect(document.activeElement).toBe(inside[0]);

    // 거꾸로: 첫 컨트롤 → 되돌리기 → 시트의 마지막 컨트롤
    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(undo);
    await fireEvent.keyDown(undo, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(inside.at(-1));
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
});
