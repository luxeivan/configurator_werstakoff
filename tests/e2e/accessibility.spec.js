import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('доступность: планировщик и checkout без критичных ошибок', async ({ page }) => {
  await page.goto('/');
  if (await page.getByText('Параметры комнаты').count()) {
    await page.getByRole('button', { name: 'Применить' }).click();
  }
  await expect(page.locator('.plan-svg')).toBeVisible();
  const planner = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = planner.violations.filter((item) => ['serious', 'critical'].includes(item.impact));
  expect(serious, serious.map((item) => `${item.id}: ${item.help}`).join('\n')).toEqual([]);

  await page.goto('/checkout');
  const checkout = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const checkoutSerious = checkout.violations.filter((item) => ['serious', 'critical'].includes(item.impact));
  expect(checkoutSerious, checkoutSerious.map((item) => `${item.id}: ${item.help}`).join('\n')).toEqual([]);
});
