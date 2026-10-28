// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  kakaoLinkFits,
  kakaoReady,
  preloadKakao,
  sendKakao,
  shareOrCopy,
  KAKAO_SDK_URL,
  KAKAO_SDK_INTEGRITY,
} from './index.js';

const config = { appKey: 'e2e-kakao-key' };
function fakeSdk({ shareAfterInit = true } = {}) {
  let initialized = false;
  const sdk: {
    init: ReturnType<typeof vi.fn>;
    isInitialized(): boolean;
    Share?: { sendDefault: ReturnType<typeof vi.fn> };
  } = {
    init: vi.fn(() => {
      initialized = true;
      if (shareAfterInit) sdk.Share = { sendDefault: vi.fn() };
    }),
    isInitialized: () => initialized,
  };
  return sdk;
}
function inject(sdk = fakeSdk()) {
  Object.assign(window, { Kakao: sdk });
  return sdk;
}
beforeEach(() => {
  document.querySelectorAll('script').forEach((s) => s.remove());
});
afterEach(() => {
  Reflect.deleteProperty(window, 'Kakao');
  vi.unstubAllGlobals();
});

describe('카카오톡 공용 모듈', () => {
  it('로드 직후 Share가 없어도 초기화한 뒤 준비와 전송에 성공한다', async () => {
    const ready = preloadKakao(config);
    const sdk = inject();
    expect(sdk.Share).toBeUndefined();
    expect(kakaoReady()).toBe(false);
    document.scripts[0]!.dispatchEvent(new Event('load'));
    await ready;
    expect(sdk.init).toHaveBeenCalledExactlyOnceWith(config.appKey);
    expect(kakaoReady()).toBe(true);
    expect(sendKakao({ title: '장소', url: 'https://app.test' }, config)).toBe(true);
    expect(sdk.Share!.sendDefault).toHaveBeenCalledTimes(1);
  });
  it('초기화 뒤에도 Share가 없으면 공유를 쓸 수 없다고 알린다', async () => {
    const failed = expect(preloadKakao(config)).rejects.toThrow('카카오톡 공유를 쓸 수 없어요');
    const sdk = inject(fakeSdk({ shareAfterInit: false }));
    document.scripts[0]!.dispatchEvent(new Event('load'));
    await failed;
    expect(sdk.init).toHaveBeenCalledExactlyOnceWith(config.appKey);
    expect(kakaoReady()).toBe(false);
    expect(sendKakao({ title: '장소', url: 'https://app.test' }, config)).toBe(false);
  });
  it.each([undefined, '함수가 아님'])(
    'init 함수가 없으면 SDK가 없다고 알린다: %s',
    async (init) => {
      const failed = expect(preloadKakao(config)).rejects.toThrow('카카오톡 SDK가 없어요');
      Object.assign(window, {
        Kakao: { init, isInitialized: () => false, Share: { sendDefault: vi.fn() } },
      });
      document.scripts[0]!.dispatchEvent(new Event('load'));
      await failed;
    },
  );
  it('동시에 불러도 스크립트를 한 번 넣고 한 번 초기화한다', async () => {
    const first = preloadKakao(config);
    const second = preloadKakao(config);
    await vi.waitFor(() => expect(document.scripts).toHaveLength(1));
    const script = document.scripts[0]!;
    expect(script.src).toBe(KAKAO_SDK_URL);
    expect(script.integrity).toBe(KAKAO_SDK_INTEGRITY);
    expect(script.crossOrigin).toBe('anonymous');
    expect(script.async).toBe(true);
    const sdk = inject();
    script.dispatchEvent(new Event('load'));
    await Promise.all([first, second]);
    expect(sdk.init).toHaveBeenCalledExactlyOnceWith(config.appKey);
    expect(kakaoReady()).toBe(true);
  });
  it('실패한 스크립트를 버리고 같은 주소로 다시 시도한다', async () => {
    const options = { ...config, sdkUrl: 'https://sdk.test/retry.js' };
    const failed = expect(preloadKakao(options)).rejects.toThrow();
    await vi.waitFor(() => expect(document.scripts).toHaveLength(1));
    document.scripts[0]!.dispatchEvent(new Event('error'));
    await failed;
    const retry = preloadKakao(options);
    await vi.waitFor(() => expect(document.scripts).toHaveLength(1));
    inject();
    document.scripts[0]!.dispatchEvent(new Event('load'));
    await retry;
    expect(kakaoReady()).toBe(true);
  });
  it('같은 주소의 기존 태그를 기다리며 중복하지 않는다', async () => {
    const script = document.createElement('script');
    script.src = 'https://sdk.test/existing.js';
    document.head.append(script);
    const ready = preloadKakao({ ...config, sdkUrl: script.src });
    await Promise.resolve();
    expect(document.scripts).toHaveLength(1);
    inject();
    script.dispatchEvent(new Event('load'));
    await ready;
  });
  it('주입된 SDK를 쓰고 이미 초기화됐으면 다시 init하지 않는다', async () => {
    const sdk = inject();
    await preloadKakao(config);
    await preloadKakao(config);
    expect(document.scripts).toHaveLength(0);
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });
  it('브라우저 밖과 빈 키는 실패하고 준비되지 않은 전송은 false다', async () => {
    expect(sendKakao({ title: '장소', url: 'https://app.test' }, config)).toBe(false);
    await expect(preloadKakao({ appKey: '' })).rejects.toThrow();
    vi.stubGlobal('document', undefined);
    await expect(preloadKakao(config)).rejects.toThrow();
  });
  it('링크 한도 경계와 키를 동기로 검사한다', () => {
    expect(kakaoLinkFits('a'.repeat(400), config)).toBe(true);
    expect(kakaoLinkFits('a'.repeat(401), config)).toBe(false);
    expect(kakaoLinkFits('a', { appKey: ' ' })).toBe(false);
  });
  it('설정한 링크 한도는 기본값보다 크거나 작아도 그 경계를 따른다', () => {
    for (const maxLinkLength of [100, 500]) {
      const options = { ...config, maxLinkLength };
      expect(kakaoLinkFits('a'.repeat(maxLinkLength), options)).toBe(true);
      expect(kakaoLinkFits('a'.repeat(maxLinkLength + 1), options)).toBe(false);
    }
  });
  it('feed의 링크 두 개·이미지·단추를 동기로 보내고 SDK 예외를 잡는다', async () => {
    const sdk = inject();
    await preloadKakao(config);
    const card = {
      title: '나의 장소',
      description: '장소 1곳 · 랜드마크',
      imageUrl: 'https://app.test/icon-512.png',
      imageWidth: 512,
      imageHeight: 512,
      url: 'https://app.test/view#d=abc',
      buttonTitle: '지도에서 보기',
    };
    expect(sendKakao(card, config)).toBe(true);
    expect(sdk.Share!.sendDefault).toHaveBeenCalledWith({
      objectType: 'feed',
      content: {
        title: card.title,
        description: card.description,
        imageUrl: card.imageUrl,
        imageWidth: 512,
        imageHeight: 512,
        link: { webUrl: card.url, mobileWebUrl: card.url },
      },
      buttonTitle: '지도에서 보기',
    });
    expect(sendKakao({ ...card, url: 'a'.repeat(401) }, config)).toBe(false);
    expect(sdk.Share!.sendDefault).toHaveBeenCalledTimes(1);
    sdk.Share!.sendDefault.mockImplementation(() => {
      throw new Error('카카오 오류');
    });
    expect(sendKakao(card, config)).toBe(false);
  });
});

describe('공유와 복사 대체', () => {
  it('공유 성공 뒤에는 복사하지 않는다', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const copy = vi.fn();
    expect(await shareOrCopy('주소', '제목', { share, copy })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ url: '주소', title: '제목' });
    expect(copy).not.toHaveBeenCalled();
  });
  it('공유 실패 다음 복사하고 둘 다 없거나 실패하면 failed다', async () => {
    const order: string[] = [];
    const share = async () => {
      order.push('공유');
      throw new Error();
    };
    const copy = async () => {
      order.push('복사');
    };
    expect(await shareOrCopy('주소', '제목', { share, copy })).toBe('copied');
    expect(order).toEqual(['공유', '복사']);
    expect(await shareOrCopy('주소', '제목', {})).toBe('failed');
    expect(
      await shareOrCopy('주소', '제목', {
        copy: async () => {
          throw new Error();
        },
      }),
    ).toBe('failed');
  });
  it('AbortError는 취소로 끝내고 복사하지 않는다', async () => {
    const copy = vi.fn();
    expect(
      await shareOrCopy('주소', '제목', {
        share: async () => {
          throw { name: 'AbortError' };
        },
        copy,
      }),
    ).toBe('cancelled');
    expect(copy).not.toHaveBeenCalled();
  });
});
