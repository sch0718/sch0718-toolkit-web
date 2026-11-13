// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Badge from '../src/lib/Badge.svelte';
import Banner from '../src/lib/Banner.svelte';
import Chip from '../src/lib/Chip.svelte';
import Icon from '../src/lib/Icon.svelte';
import ThemePicker from '../src/lib/ThemePicker.svelte';
import Toggle from '../src/lib/Toggle.svelte';
import toggleSource from '../src/lib/Toggle.svelte?raw';

const text = (t: string) => createRawSnippet(() => ({ render: () => `<span>${t}</span>` }));

describe('Chip', () => {
  it('toggles aria-pressed and calls onclick', async () => {
    const onclick = vi.fn();
    render(Chip, { selected: true, onclick, children: text('1주') });
    const chip = screen.getByRole('button', { name: '1주' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(chip);
    expect(onclick).toHaveBeenCalledTimes(1);
  });
});

describe('Badge', () => {
  it('renders its text', () => {
    render(Badge, { tone: 'nxt', children: text('NXT') });
    expect(screen.getByText('NXT')).toBeTruthy();
  });
});

describe('Banner', () => {
  it('renders a message and an optional action', async () => {
    const onaction = vi.fn();
    render(Banner, { message: '데모 데이터를 보고 있어요', actionLabel: '연결하기', onaction });
    expect(screen.getByText('데모 데이터를 보고 있어요')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: '연결하기' }));
    expect(onaction).toHaveBeenCalledTimes(1);
  });
});

describe('Banner roles', () => {
  it('uses role=alert only for the error tone', () => {
    const { unmount } = render(Banner, { message: '연결에 실패했어요', tone: 'error' });
    expect(screen.getByRole('alert').textContent).toContain('연결에 실패했어요');
    unmount();
    render(Banner, { message: '안내', tone: 'warn' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('live={false}면 alert·status 없이 글만(포커스로 읽히는 경고용)', () => {
    render(Banner, { message: '고쳐 주세요', tone: 'error', live: false, id: 'b1' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.getElementById('b1')?.textContent).toContain('고쳐 주세요');
    expect(document.getElementById('b1')?.getAttribute('tabindex')).toBe('-1');
  });
});

describe('Toggle', () => {
  it('is a labelled switch', async () => {
    const onchange = vi.fn();
    render(Toggle, { checked: false, label: '암호로 잠그기', onchange });
    const sw = screen.getByRole('switch', { name: '암호로 잠그기' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await fireEvent.click(sw);
    expect(onchange).toHaveBeenCalledExactlyOnceWith(true);
  });

  // 컴포넌트의 <style>만 문서에 넣어 계산된 스타일로 확인한다(Svelte 스코프 클래스는 없다).
  // jsdom은 var()를 풀지 않으므로 토큰 이름이 그대로 나온다.
  const styles: HTMLStyleElement[] = [];
  afterEach(() => {
    for (const s of styles.splice(0)) s.remove();
  });
  function draw(checked: boolean) {
    const style = document.createElement('style');
    styles.push(style);
    style.textContent = /<style>([\s\S]*)<\/style>/.exec(toggleSource)![1];
    document.head.append(style);
    const { container } = render(Toggle, { checked, label: '토글', onchange: vi.fn() });
    const track = container.querySelector('.track')!;
    const thumb = container.querySelector('.thumb')!;
    return { track, thumb, bg: (el: Element) => getComputedStyle(el).background };
  }

  it('off: the track is --t3 and the thumb is white (non-text 3:1)', () => {
    const v = draw(false);
    expect(v.track.classList.contains('on')).toBe(false);
    expect(v.bg(v.track)).toBe('var(--t3)');
    expect(v.bg(v.thumb)).toBe('rgb(255, 255, 255)');
  });

  it('on: the track is --accent and the thumb is --on-accent', () => {
    const v = draw(true);
    expect(v.track.classList.contains('on')).toBe(true);
    expect(v.bg(v.track)).toBe('var(--accent)');
    expect(v.bg(v.thumb)).toBe('var(--on-accent)');
  });
});

describe('ThemePicker', () => {
  it('라이트·다크·시스템 중 하나를 고르고 ThemeChoice로 알린다', async () => {
    const onchange = vi.fn();
    render(ThemePicker, { value: 'system', onchange });
    const group = screen.getByRole('radiogroup', { name: '테마' });
    expect(group).toBeTruthy();
    expect(screen.getByRole('radio', { name: '시스템' }).getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(screen.getByRole('radio', { name: '다크' }));
    expect(onchange).toHaveBeenCalledWith('dark');
  });

  it('접근성 이름을 바꿀 수 있다', () => {
    render(ThemePicker, { value: 'light', onchange: vi.fn(), label: '화면 테마' });
    expect(screen.getByRole('radiogroup', { name: '화면 테마' })).toBeTruthy();
  });
});

describe('Icon', () => {
  // Lucide `House`와 같은 모양 데이터
  const house = [
    ['path', { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' }],
    ['circle', { cx: 12, cy: 12, r: 2 }],
  ] as const;

  it('모양 데이터를 SVG 요소로 그리고 장식용으로 숨긴다', () => {
    const { container } = render(Icon, { icon: house });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('fill')).toBe('none');
    const path = svg.querySelector('path')!;
    expect(path.getAttribute('d')).toBe(house[0][1].d);
    expect(path.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.querySelector('circle')?.getAttribute('r')).toBe('2');
  });

  it('속성 값을 이스케이프하고 이상한 태그·속성 이름은 버린다', () => {
    const { container } = render(Icon, {
      icon: [
        ['path', { d: 'M0 0"/><script>x</script>', 'on click': 'x' }],
        ['img src=x onerror=alert(1)', {}],
      ],
    });
    const svg = container.querySelector('svg')!;
    expect(svg.querySelectorAll('*').length).toBe(1);
    expect(svg.querySelector('path')?.getAttribute('d')).toBe('M0 0"/><script>x</script>');
    expect(svg.querySelector('script, img')).toBeNull();
  });

  it('크기·굵기·채움을 바꾼다', () => {
    const { container } = render(Icon, { icon: house, size: 20, strokeWidth: 1.5, filled: true });
    const svg = container.querySelector('svg')!;
    expect([
      svg.getAttribute('width'),
      svg.getAttribute('stroke-width'),
      svg.getAttribute('fill'),
    ]).toEqual(['20', '1.5', 'currentColor']);
  });
});

import PalettePicker from '../src/lib/PalettePicker.svelte';
import { PALETTES, type PaletteId } from '../src/lib/theme.js';

describe('PalettePicker', () => {
  it('한국어 이름의 라디오 열 개와 선택 상태·탭 정지점을 표시한다', () => {
    render(PalettePicker, { value: 'teal', onchange: vi.fn() });
    expect(screen.getByRole('radiogroup', { name: '색 테마' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(10);
    for (const { id, label } of PALETTES) {
      const radio = screen.getByRole('radio', { name: label });
      expect(radio.getAttribute('aria-checked')).toBe(String(id === 'teal'));
      expect(radio.getAttribute('tabindex')).toBe(id === 'teal' ? '0' : '-1');
      expect(radio.querySelector('[aria-hidden="true"]')).toBeTruthy();
    }
  });

  it('묶음의 접근 가능한 이름을 바꾼다', () => {
    render(PalettePicker, { value: 'violet', onchange: vi.fn(), label: '앱 색상' });
    expect(screen.getByRole('radiogroup', { name: '앱 색상' })).toBeTruthy();
  });

  it('다른 항목 클릭만 알리고 값이 바뀌면 탭 정지점을 옮긴다', async () => {
    const onchange = vi.fn();
    const { rerender } = render(PalettePicker, { value: 'violet', onchange });
    await fireEvent.click(screen.getByRole('radio', { name: '보라' }));
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('radio', { name: '파랑' }));
    expect(onchange).toHaveBeenCalledExactlyOnceWith('blue');
    await rerender({ value: 'blue' });
    expect(screen.getByRole('radio', { name: '파랑' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '파랑' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('radio', { name: '보라' }).getAttribute('tabindex')).toBe('-1');
    await fireEvent.click(screen.getByRole('radio', { name: '파랑' }));
    expect(onchange).toHaveBeenCalledTimes(1);
  });

  it.each<[PaletteId, string, PaletteId]>([
    ['blue', 'ArrowRight', 'teal'],
    ['blue', 'ArrowDown', 'teal'],
    ['blue', 'ArrowLeft', 'violet'],
    ['blue', 'ArrowUp', 'violet'],
    ['mono', 'ArrowRight', 'violet'],
    ['mono', 'ArrowDown', 'violet'],
    ['violet', 'ArrowLeft', 'mono'],
    ['violet', 'ArrowUp', 'mono'],
  ])('%s에서 %s로 %s를 고르고 포커스를 옮긴다', async (value, key, next) => {
    const onchange = vi.fn();
    const { rerender } = render(PalettePicker, { value, onchange });
    const current = screen.getByRole('radio', {
      name: PALETTES.find((p) => p.id === value)!.label,
    });
    const target = screen.getByRole('radio', { name: PALETTES.find((p) => p.id === next)!.label });
    current.focus();
    await fireEvent.keyDown(current, { key });
    expect(onchange).toHaveBeenCalledExactlyOnceWith(next);
    expect(document.activeElement).toBe(target);
    await rerender({ value: next });
    expect(target.getAttribute('aria-checked')).toBe('true');
    expect(target.getAttribute('tabindex')).toBe('0');
    expect(current.getAttribute('tabindex')).toBe('-1');
  });

  it('화살표가 아닌 키로 선택을 바꾸지 않는다', async () => {
    const onchange = vi.fn();
    render(PalettePicker, { value: 'violet', onchange });
    const current = screen.getByRole('radio', { name: '보라' });
    current.focus();
    await fireEvent.keyDown(current, { key: 'Tab' });
    expect(onchange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(current);
  });
});
