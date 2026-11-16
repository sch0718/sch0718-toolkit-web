import { describe, expect, it, vi } from 'vitest';
import { watchVersion, type WatchVersionOptions } from './version.js';

function setup(o: { served?: unknown[]; canAutoReload?: () => boolean; fail?: boolean } = {}) {
  let t = 1000;
  const served = [...(o.served ?? [{ version: 'b' }])];
  const fetch = vi.fn(async (url: URL, init: RequestInit) => {
    void url;
    void init;
    if (o.fail) throw new Error('offline');
    return { json: async () => served.shift() ?? served.at(-1) };
  });
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
    baseURI: 'https://app.test/sub/index.html',
  });
  const reload = vi.fn();
  const onUpdate = vi.fn();
  const stop = watchVersion({
    current: 'a',
    onUpdate,
    reload,
    now: () => t,
    fetch,
    document: doc as unknown as NonNullable<WatchVersionOptions['document']>,
    ...(o.canAutoReload ? { canAutoReload: o.canAutoReload } : {}),
  });
  const settle = () => vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  const visible = async () => {
    doc.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r));
  };
  return {
    fetch,
    doc,
    reload,
    onUpdate,
    stop,
    settle,
    visible,
    advance: (ms: number) => (t += ms),
  };
}

describe('watchVersion', () => {
  it('시작할 때 문서 base 기준 version.json을 캐시 없이 받는다', async () => {
    const s = setup({ served: [{ version: 'a' }] });
    await s.settle();
    const [url, init] = s.fetch.mock.calls[0]!;
    expect(String(url)).toBe('https://app.test/sub/version.json');
    expect(init).toEqual({ cache: 'no-store' });
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.onUpdate).not.toHaveBeenCalled();
  });

  it('접속 직후 다른 id면 바로 새로고침한다', async () => {
    const s = setup();
    await vi.waitFor(() => expect(s.reload).toHaveBeenCalledOnce());
  });

  it('canAutoReload가 false면 안내만 한다', async () => {
    const s = setup({ canAutoReload: () => false });
    await vi.waitFor(() => expect(s.onUpdate).toHaveBeenCalledOnce());
    expect(s.reload).not.toHaveBeenCalled();
  });

  it('화면이 다시 보이면 간격이 지났을 때만 다시 확인하고, 쓰는 중이면 안내만 한다', async () => {
    const s = setup({ served: [{ version: 'a' }, { version: 'b' }] });
    await s.settle();
    s.doc.dispatchEvent(new Event('pointerdown'));
    await s.visible();
    expect(s.fetch).toHaveBeenCalledTimes(1);
    s.advance(30 * 60_000);
    await s.visible();
    await vi.waitFor(() => expect(s.onUpdate).toHaveBeenCalledOnce());
    expect(s.reload).not.toHaveBeenCalled();
    s.advance(30 * 60_000);
    await s.visible();
    expect(s.fetch).toHaveBeenCalledTimes(3);
    expect(s.onUpdate).toHaveBeenCalledOnce();
  });

  it('오류나 형식이 다른 응답은 조용히 넘긴다', async () => {
    const failing = setup({ fail: true });
    await failing.settle();
    const odd = setup({ served: [{ v: 'x' }] });
    await odd.settle();
    await new Promise((r) => setTimeout(r));
    for (const s of [failing, odd]) {
      expect(s.reload).not.toHaveBeenCalled();
      expect(s.onUpdate).not.toHaveBeenCalled();
    }
  });

  it('멈춘 뒤에는 알리지 않는다', async () => {
    const s = setup();
    s.stop();
    await s.settle();
    await new Promise((r) => setTimeout(r));
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.onUpdate).not.toHaveBeenCalled();
  });
});
