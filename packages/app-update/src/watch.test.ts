import { describe, expect, it, vi } from 'vitest';
import type { AppUpdateDocument } from './gate.js';
import { watchAppUpdate, type AppUpdateServiceWorker } from './watch.js';

function setup(
  o: {
    controlled?: boolean;
    active?: boolean;
    autoReloadMs?: number;
    canAutoReload?: () => boolean;
  } = {},
) {
  let t = 1000;
  const update = vi.fn(async () => {});
  const sw = Object.assign(new EventTarget(), {
    controller: (o.controlled ?? true) ? ({} as ServiceWorker) : null,
    getRegistration: vi.fn(async () => ({ active: o.active ? {} : null, update })),
  });
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  });
  const reload = vi.fn();
  const onUpdate = vi.fn();
  const stop = watchAppUpdate({
    onUpdate,
    reload,
    now: () => t,
    serviceWorker: sw as unknown as AppUpdateServiceWorker,
    document: doc as unknown as AppUpdateDocument,
    ...(o.autoReloadMs === undefined ? {} : { autoReloadMs: o.autoReloadMs }),
    ...(o.canAutoReload ? { canAutoReload: o.canAutoReload } : {}),
  });
  const swap = async () => {
    sw.controller = {} as ServiceWorker;
    sw.dispatchEvent(new Event('controllerchange'));
    await Promise.resolve();
    await Promise.resolve();
  };
  return {
    sw,
    doc,
    reload,
    onUpdate,
    update,
    stop,
    swap,
    advance: (ms: number) => (t += ms),
  };
}

describe('watchAppUpdate', () => {
  it('접속 직후이고 누른 것이 없으면 바로 새로고침한다', async () => {
    const s = setup();
    s.advance(2000);
    await s.swap();
    expect(s.reload).toHaveBeenCalledOnce();
    expect(s.onUpdate).not.toHaveBeenCalled();
  });

  it('이미 누른 뒤면 새로고침하지 않고 안내를 맡긴다', async () => {
    const s = setup();
    s.doc.dispatchEvent(new Event('pointerdown'));
    await s.swap();
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.onUpdate).toHaveBeenCalledOnce();
    s.onUpdate.mock.calls[0]?.[0]();
    expect(s.reload).toHaveBeenCalledOnce();
  });

  it('자동 새로고침 시간이 지나면 안내만 한다', async () => {
    const s = setup();
    s.advance(5001);
    await s.swap();
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.onUpdate).toHaveBeenCalledOnce();
  });

  it('autoReloadMs 0이면 늘 안내만 한다', async () => {
    const s = setup({ autoReloadMs: 0 });
    s.advance(1);
    await s.swap();
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.onUpdate).toHaveBeenCalledOnce();
  });

  it('canAutoReload가 false면 접속 직후라도 안내만 한다', async () => {
    const s = setup({ canAutoReload: () => false });
    await s.swap();
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.onUpdate).toHaveBeenCalledOnce();
  });

  it('처음 설치로 제어가 생긴 것은 새 버전이 아니다', async () => {
    const s = setup({ controlled: false });
    await s.swap();
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.onUpdate).not.toHaveBeenCalled();
  });

  it('강력 새로고침으로 controller가 없어도 등록이 활성이면 새 버전으로 본다', async () => {
    const s = setup({ controlled: false, active: true });
    await s.swap();
    expect(s.reload).toHaveBeenCalledOnce();
  });

  it('화면이 다시 보이면 확인 간격이 지났을 때만 새 버전을 확인한다', async () => {
    const s = setup();
    s.doc.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(s.update).not.toHaveBeenCalled();
    s.advance(30 * 60_000);
    s.doc.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(s.update).toHaveBeenCalledOnce());
  });

  it('멈춘 뒤에는 반응하지 않는다', async () => {
    const s = setup();
    s.stop();
    await s.swap();
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.onUpdate).not.toHaveBeenCalled();
  });

  it('서비스 워커가 없는 환경에서는 아무것도 하지 않는다', () => {
    expect(() => watchAppUpdate({ onUpdate: () => {} })()).not.toThrow();
  });
});
