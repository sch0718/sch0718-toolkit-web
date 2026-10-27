// 실제 SDK 대신 firebase/app·firebase/auth를 가짜로 바꿔 앱 고르기만 본다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirebaseConfig } from './config.js';

const sdk = vi.hoisted(() => ({
  getApps: vi.fn(),
  initializeApp: vi.fn(),
  initializeAuth: vi.fn(),
  getAuth: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  getApps: sdk.getApps,
  initializeApp: sdk.initializeApp,
}));

vi.mock('firebase/auth', () => ({
  initializeAuth: sdk.initializeAuth,
  getAuth: sdk.getAuth,
  indexedDBLocalPersistence: { name: 'indexedDB' },
  browserLocalPersistence: { name: 'local' },
  browserPopupRedirectResolver: { name: 'resolver' },
  getRedirectResult: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}));

const cfg: FirebaseConfig = {
  apiKey: 'key-a',
  authDomain: 'a.firebaseapp.com',
  projectId: 'project-a',
  appId: 'app-a',
};
const app = (name: string, options: Partial<FirebaseConfig>) => ({ name, options });
const AUTH_OPTIONS = {
  persistence: [{ name: 'indexedDB' }, { name: 'local' }],
  popupRedirectResolver: { name: 'resolver' },
};

// 모듈 안의 Auth 캐시를 시험마다 비운다
async function load() {
  vi.resetModules();
  return import('./firebaseImpl.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.getApps.mockReturnValue([]);
  sdk.initializeApp.mockImplementation((options: FirebaseConfig, name = '[DEFAULT]') =>
    app(name, options),
  );
  sdk.initializeAuth.mockImplementation((a: unknown) => ({ app: a }));
  sdk.getAuth.mockImplementation((a: unknown) => ({ app: a, existing: true }));
});

describe('getAuthFor', () => {
  // 가즈아처럼 앱이 없으면 기본 앱([DEFAULT])을 만든다. Auth 저장 키에 앱 이름이 들어가므로 바뀌면 로그아웃된다.
  it('앱이 없으면 cfg만으로 기본 앱을 만든다', async () => {
    const { getAuthFor } = await load();
    const auth = getAuthFor(cfg) as unknown as { app: { name: string } };
    expect(sdk.initializeApp).toHaveBeenCalledTimes(1);
    expect(sdk.initializeApp.mock.calls[0]).toEqual([cfg]);
    expect(auth.app.name).toBe('[DEFAULT]');
    expect(sdk.initializeAuth).toHaveBeenCalledWith(auth.app, AUTH_OPTIONS);
  });

  it('projectId와 apiKey가 같은 앱이 있으면 그 앱을 쓴다', async () => {
    const other = app('[DEFAULT]', { projectId: 'project-b', apiKey: 'key-b' });
    const same = app('mine', { projectId: 'project-a', apiKey: 'key-a' });
    sdk.getApps.mockReturnValue([other, same]);
    const { getAuthFor } = await load();
    getAuthFor(cfg);
    expect(sdk.initializeApp).not.toHaveBeenCalled();
    expect(sdk.initializeAuth).toHaveBeenCalledWith(same, AUTH_OPTIONS);
  });

  it('다른 프로젝트의 앱만 있으면 이름 붙인 앱을 따로 만든다', async () => {
    const other = app('[DEFAULT]', { projectId: 'project-b', apiKey: 'key-b' });
    sdk.getApps.mockReturnValue([other]);
    const { getAuthFor } = await load();
    getAuthFor(cfg);
    expect(sdk.initializeApp).toHaveBeenCalledWith(
      cfg,
      '@sch0718/firebase-session:project-a:key-a',
    );
    expect(sdk.initializeAuth).not.toHaveBeenCalledWith(other, expect.anything());
  });

  it('같은 프로젝트의 apiKey가 다르면 같은 앱으로 보지 않는다', async () => {
    sdk.getApps.mockReturnValue([app('[DEFAULT]', { projectId: 'project-a', apiKey: 'key-x' })]);
    const { getAuthFor } = await load();
    getAuthFor(cfg);
    expect(sdk.initializeApp).toHaveBeenCalledWith(
      cfg,
      '@sch0718/firebase-session:project-a:key-a',
    );
  });

  // 실제 SDK처럼, 이미 있는 이름을 다른 설정으로 만들면 app/duplicate-app으로 던지는 가짜 목록
  it('서로 다른 설정 셋을 차례로 쓰면 기본 앱, 이름 붙인 앱 둘이 되고 실패하지 않는다', async () => {
    const registry = new Map<string, { name: string; options: FirebaseConfig }>();
    sdk.getApps.mockImplementation(() => [...registry.values()]);
    sdk.initializeApp.mockImplementation((options: FirebaseConfig, name = '[DEFAULT]') => {
      const found = registry.get(name);
      if (found && JSON.stringify(found.options) !== JSON.stringify(options))
        throw Object.assign(new Error('duplicate'), { code: 'app/duplicate-app' });
      const created = found ?? app(name, options);
      registry.set(name, created as { name: string; options: FirebaseConfig });
      return created;
    });
    const cfgB = { ...cfg, projectId: 'project-b', apiKey: 'key-b' };
    const cfgC = { ...cfg, projectId: 'project-c', apiKey: 'key-c' };
    const { getAuthFor } = await load();
    const names = [cfg, cfgB, cfgC].map(
      (c) => (getAuthFor(c) as unknown as { app: { name: string } }).app.name,
    );
    expect(names).toEqual([
      '[DEFAULT]',
      '@sch0718/firebase-session:project-b:key-b',
      '@sch0718/firebase-session:project-c:key-c',
    ]);
  });

  it('같은 cfg로 두 번 부르면 Auth를 한 번만 만든다', async () => {
    const { getAuthFor } = await load();
    const first = getAuthFor(cfg);
    sdk.getApps.mockReturnValue([app('[DEFAULT]', cfg)]);
    expect(getAuthFor({ ...cfg })).toBe(first);
    expect(sdk.initializeAuth).toHaveBeenCalledTimes(1);
  });

  // 소비 앱이 그 앱에 getAuth/initializeAuth를 이미 불렀으면 initializeAuth가 던진다. 그 Auth를 쓴다.
  it('이미 Auth가 초기화된 앱이면 getAuth(app)으로 그 Auth를 쓰고 캐시한다', async () => {
    const same = app('[DEFAULT]', cfg);
    sdk.getApps.mockReturnValue([same]);
    sdk.initializeAuth.mockImplementation(() => {
      throw Object.assign(new Error('already'), { code: 'auth/already-initialized' });
    });
    const { getAuthFor } = await load();
    const auth = getAuthFor(cfg);
    expect(sdk.getAuth).toHaveBeenCalledWith(same);
    expect(auth).toBe(sdk.getAuth.mock.results[0]?.value);
    expect(getAuthFor(cfg)).toBe(auth);
    expect(sdk.initializeAuth).toHaveBeenCalledTimes(1);
    expect(sdk.getAuth).toHaveBeenCalledTimes(1);
  });

  it('initializeAuth의 다른 오류는 그대로 던진다', async () => {
    const boom = Object.assign(new Error('boom'), { code: 'auth/invalid-api-key' });
    sdk.initializeAuth.mockImplementation(() => {
      throw boom;
    });
    const { getAuthFor } = await load();
    expect(() => getAuthFor(cfg)).toThrow(boom);
    expect(sdk.getAuth).not.toHaveBeenCalled();
  });

  it('다른 cfg에는 앞서 만든 Auth를 돌려주지 않는다', async () => {
    const { getAuthFor } = await load();
    const first = getAuthFor(cfg);
    sdk.getApps.mockReturnValue([app('[DEFAULT]', cfg)]);
    const second = getAuthFor({ ...cfg, projectId: 'project-b', apiKey: 'key-b' });
    expect(second).not.toBe(first);
    expect(sdk.initializeAuth).toHaveBeenCalledTimes(2);
  });
});
