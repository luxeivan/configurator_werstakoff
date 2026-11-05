import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('мобильный планировщик не создаёт горизонтальный скролл', async ({ page }) => {
  await page.goto('/');
  if (await page.getByText('Параметры комнаты').count()) {
    await page.getByRole('button', { name: 'Применить' }).click();
  }
  await expect(page.locator('.plan-svg')).toBeVisible();
  await page
    .locator('.catalog-tree-row', { hasText: 'Верстаки' })
    .first()
    .locator('.tree-name')
    .click();
  await expect(page.locator('.catalog-popover')).toBeVisible();
  await page.locator('.catalog-popover .catalog-card .button').first().click();
  await expect(page.locator('.plan-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Закрыть список товаров' }).click();
  await expect(page.locator('.catalog-popover')).toHaveCount(0);
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(2);
  expect(overflow.y).toBeLessThanOrEqual(2);
  await expect(page.getByRole('button', { name: 'Оформить', exact: false })).toBeVisible();
});
