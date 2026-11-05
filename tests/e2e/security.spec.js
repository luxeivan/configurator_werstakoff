import { expect, test } from '@playwright/test';

async function login(page, email, password, expectedUrl) {
  await page.goto('/login');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(expectedUrl);
}

test('менеджер видит заказы, но не каталог и настройки', async ({ page }) => {
  const email = `manager-${Date.now()}@example.com`;
  const password = 'manager-test-password';
  await login(page, process.env.ADMIN_EMAIL || 'admin@example.com', process.env.ADMIN_PASSWORD || 'admin-dev-password', /\/admin\/catalog$/);

  const created = await page.evaluate(async ({ email, password }) => {
    const me = await fetch('/api/auth/me').then((response) => response.json());
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.data.csrfToken },
      body: JSON.stringify({ email, password, name: 'E2E Менеджер', role: 'manager' }),
    });
    return { status: response.status, body: await response.json() };
  }, { email, password });
  expect(created.status).toBe(201);

  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Войти' })).toBeVisible({ timeout: 30_000 });
  await login(page, email, password, /\/admin\/orders$/);

  const orders = await page.request.get('/api/admin/orders');
  expect(orders.status()).toBe(200);
  const products = await page.request.get('/api/admin/products');
  expect(products.status()).toBe(403);
  const settings = await page.request.get('/api/admin/settings');
  expect(settings.status()).toBe(403);
  await page.goto('/admin/catalog');
  await expect(page.getByText('Недостаточно прав')).toBeVisible();
});
