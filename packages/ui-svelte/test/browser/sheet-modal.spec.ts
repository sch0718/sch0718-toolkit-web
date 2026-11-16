import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '시트 A 열기', exact: true }).click();
});

test('Chromium 접근성 트리는 맨 위 시트와 스낵바만 담고 닫으면 배경을 되돌린다', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'CDP 접근성 트리는 Chromium에서 확인한다.');
  const session = await page.context().newCDPSession(page);
  async function names() {
    const { nodes } = await session.send('Accessibility.getFullAXTree');
    return nodes
      .filter((node) => !node.ignored)
      .map((node) => node.name?.value as string | undefined);
  }
  const a = page.getByRole('dialog', { name: '시트 A', exact: true });
  await a.getByRole('button', { name: '삭제', exact: true }).click();
  await expect.poll(names).toContain('되돌리기');
  expect(await names()).not.toContain('배경 단추');
  // 시트 밖 호스트는 비어 있어 알림이 한 번만 있다.
  const { nodes } = await session.send('Accessibility.getFullAXTree');
  const undoButtons = nodes.filter(
    (node) => !node.ignored && node.role?.value === 'button' && node.name?.value === '되돌리기',
  );
  expect(undoButtons).toHaveLength(1);
  // 데스크톱 폭에서 .sheet에는 transform이 있지만 스낵바는 호스트와 같은 뷰포트 기준 자리에 그린다.
  const snack = page.locator('.snack');
  await expect(snack).toHaveCount(1);
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => {
      const box = (await snack.boundingBox())!;
      return [Math.round(box.y + box.height), Math.round(box.x + box.width / 2)];
    })
    .toEqual([viewport.height - 32, viewport.width / 2]);

  await a.getByRole('button', { name: '배경 추가', exact: true }).click();
  await expect(page.getByText('새 배경', { exact: true })).toHaveJSProperty('inert', true);
  expect(await names()).not.toContain('새 배경');

  await a.getByRole('button', { name: '시트 B 열기', exact: true }).click();
  const b = page.getByRole('dialog', { name: '시트 B', exact: true });
  await expect.poll(names).toContain('B 입력');
  expect(await names()).not.toContain('A 입력');
  await b.getByRole('button', { name: '닫기', exact: true }).click();
  await expect.poll(names).toContain('A 입력');
  await expect(a.getByRole('button', { name: '시트 B 열기', exact: true })).toBeFocused();

  await a.getByRole('button', { name: '닫기', exact: true }).click();
  await expect.poll(names).toContain('배경 단추');
  await expect(page.getByRole('button', { name: '시트 A 열기', exact: true })).toBeFocused();
  await session.detach();
});

test('WebKit Tab 순환은 되돌리기를 포함해 시트 안에 머물고 배경 클릭은 막힌다', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'webkit', 'WebKit의 실제 키보드 이동과 inert를 확인한다.');
  const dialog = page.getByRole('dialog', { name: '시트 A', exact: true });
  await dialog.getByRole('button', { name: '삭제', exact: true }).click();
  const undo = dialog.getByRole('button', { name: '되돌리기', exact: true });
  await undo.focus();
  // Safari 기본 설정의 Tab은 입력란만 돈다. 모든 컨트롤을 도는 Option+Tab으로 확인한다.
  await page.keyboard.press('Alt+Tab');
  await expect(dialog.getByRole('button', { name: '닫기', exact: true })).toBeFocused();
  await page.keyboard.press('Alt+Shift+Tab');
  await expect(undo).toBeFocused();
  for (const key of ['Alt+Tab', 'Alt+Shift+Tab']) {
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press(key);
      await expect
        .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
        .toBe(true);
    }
  }
  // 실제 좌표 클릭은 inert 배경에 이벤트를 보내지 않는다.
  const background = page.getByText('배경 단추', { exact: true });
  await expect(background).toHaveJSProperty('inert', true);
  const box = await background.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByText('배경 클릭: 0', { exact: true })).toHaveText('배경 클릭: 0');
});
