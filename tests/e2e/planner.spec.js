import { expect, test } from '@playwright/test';

async function ensureRoom(page) {
  await page.goto('/');
  if (await page.getByText('Параметры комнаты').count()) {
    await page.getByRole('button', { name: 'Применить' }).click();
  }
  await expect(page.locator('.plan-svg')).toBeVisible();
}

async function openCatalogSection(page, name) {
  await page.locator('.catalog-tree-row', { hasText: name }).first().locator('.tree-name').click();
  await expect(page.locator('.catalog-popover')).toBeVisible();
}

async function closeCatalogPopover(page) {
  await page.getByRole('button', { name: 'Закрыть список товаров' }).click();
  await expect(page.locator('.catalog-popover')).toHaveCount(0);
}

async function addFirstProduct(page) {
  await openCatalogSection(page, 'Верстаки');
  await expect(page.locator('.catalog-popover .catalog-card').first()).toBeVisible();
  await page.locator('.catalog-popover .catalog-card .button').first().click();
  await expect(page.locator('.plan-item')).toHaveCount(1);
  await closeCatalogPopover(page);
}

test('планировщик: комната, каталог и 2D-план', async ({ page }) => {
  await ensureRoom(page);
  await addFirstProduct(page);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByText('Конфликтов нет')).toBeVisible();
  await expect(page.locator('.scene-gizmo-tools')).toBeVisible();
  await page.getByRole('button', { name: 'Вращение' }).click();
  await expect(page.locator('.scene-gizmo-tools button.active')).toContainText('Вращение');
  await page.getByRole('button', { name: 'Перемещение' }).click();

  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(pageOverflow).toBeLessThanOrEqual(2);

  const svg = page.locator('.plan-svg');
  const before = await svg.getAttribute('viewBox');
  await page.locator('.plan-tools').getByRole('button', { name: '+', exact: true }).click();
  await expect(svg).not.toHaveAttribute('viewBox', before);

  await page.getByRole('button', { name: 'Оформить', exact: false }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'Проверьте заказ' })).toBeVisible();
});

test('каталог: иерархия, всплывающий список и закрытие кликом снаружи', async ({ page }) => {
  await ensureRoom(page);
  await expect(page.locator('.catalog-tree-row')).toHaveCount(35);
  await expect(page.locator('.catalog-popover')).toHaveCount(0);
  await expect(page.locator('.catalog-panel .catalog-card')).toHaveCount(0);

  await openCatalogSection(page, 'Верстаки');
  await expect(page.locator('.catalog-popover .catalog-card')).toHaveCount(28);
  await page.locator('.hero h1').click();
  await expect(page.locator('.catalog-popover')).toHaveCount(0);

  await openCatalogSection(page, 'Grand');
  await expect(page.locator('.catalog-popover .catalog-card')).toHaveCount(6);
  await closeCatalogPopover(page);

  await openCatalogSection(page, 'Mechanic');
  await expect(page.locator('.catalog-popover .catalog-card')).toHaveCount(4);
  await page
    .locator('.catalog-tree-row', { hasText: 'Mechanic' })
    .first()
    .locator('.tree-name')
    .click();
  await expect(page.locator('.catalog-popover')).toHaveCount(0);
});

test('десктоп: каталог и итог инспектора помещаются в экран и прокручиваются', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await ensureRoom(page);
  await expect(page.locator('.catalog-tree-row')).toHaveCount(35);

  const catalog = await page.locator('.catalog-panel').boundingBox();
  const tree = await page.locator('.catalog-tree').boundingBox();
  const inspector = await page.locator('.inspector').boundingBox();
  const footer = await page.locator('.inspector-footer').boundingBox();
  expect(catalog.y + catalog.height).toBeLessThanOrEqual(768);
  expect(tree.y + tree.height).toBeLessThanOrEqual(catalog.y + catalog.height);
  expect(inspector.y + inspector.height).toBeLessThanOrEqual(768);
  expect(footer.y + footer.height).toBeLessThanOrEqual(inspector.y + inspector.height);

  const treeScroll = await page.locator('.catalog-tree').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return { scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
  });
  expect(treeScroll.scrollHeight).toBeGreaterThan(treeScroll.clientHeight);
  expect(treeScroll.scrollTop).toBeGreaterThan(0);
});

test('инспектор: список объектов, аккордеон и закреплённый итог', async ({ page }) => {
  await ensureRoom(page);
  await openCatalogSection(page, 'Верстаки');
  await page.locator('.catalog-popover .catalog-card .button').first().click();
  await page.locator('.catalog-popover .catalog-card .button').first().click();
  await expect(page.locator('.plan-item')).toHaveCount(2);
  await closeCatalogPopover(page);

  await expect(page.locator('.inspector-item')).toHaveCount(2);
  await expect(page.locator('.inspector-item-body')).toHaveCount(1);
  await expect(page.locator('.inspector-footer')).toContainText('Итого');

  await page.locator('.inspector-item-head').first().click();
  await expect(page.locator('.inspector-item-body')).toHaveCount(1);
  await expect(page.locator('.inspector-item').first()).toHaveClass(/expanded/);

  await page.locator('.inspector-item-head').first().click();
  await expect(page.locator('.inspector-item-body')).toHaveCount(0);

  const inspector = await page.locator('.inspector').boundingBox();
  const footerBefore = await page.locator('.inspector-footer').boundingBox();
  await page.locator('.inspector-body').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const footerAfter = await page.locator('.inspector-footer').boundingBox();
  expect(footerBefore.y).toBeCloseTo(footerAfter.y, 0);
  expect(footerAfter.y + footerAfter.height).toBeLessThanOrEqual(
    inspector.y + inspector.height + 1,
  );
});

test('перетаскивание не допускает пересечения предметов', async ({ page }) => {
  await ensureRoom(page);
  await openCatalogSection(page, 'Верстаки');
  await page.locator('.catalog-popover .catalog-card .button').first().click();
  await page.locator('.catalog-popover .catalog-card .button').first().click();
  await expect(page.locator('.plan-item')).toHaveCount(2);
  await closeCatalogPopover(page);

  const first = await page.locator('.plan-item').nth(0).boundingBox();
  const second = await page.locator('.plan-item').nth(1).boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 20 });
  await page.mouse.up();

  await expect(page.getByText('Конфликтов нет')).toBeVisible();
});

test('клик по пустому месту в 3D снимает выделение', async ({ page }) => {
  await ensureRoom(page);
  await openCatalogSection(page, 'Верстаки');
  await page.locator('.catalog-popover .catalog-card .button').first().click();
  await expect(page.locator('.plan-item')).toHaveCount(1);
  await closeCatalogPopover(page);
  await expect(page.locator('.scene3d canvas')).toBeVisible();
  await page.locator('.scene3d canvas').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.inspector-item-body')).toHaveCount(0);
  await expect(page.locator('.inspector-item.selected')).toHaveCount(0);
});

test('checkout: заказ, снимки и PDF', async ({ page }) => {
  await ensureRoom(page);
  await addFirstProduct(page);
  await page.getByRole('button', { name: 'Оформить', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Проверьте заказ' })).toBeVisible();

  await page.locator('label:has-text("Имя") input').fill('E2E Клиент');
  await page.locator('label:has-text("Телефон") input').fill('+7 900 111-22-33');
  await page.locator('input[type=email]').fill(`e2e-${Date.now()}@example.com`);
  await page.locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Отправить заказ' }).click();

  await expect(page.getByRole('heading', { name: /Заказ СЧ-/ })).toBeVisible({ timeout: 120_000 });
  const pdfLink = page.getByRole('link', { name: 'Скачать PDF' });
  const href = await pdfLink.getAttribute('href');
  expect(href).toMatch(/\/api\/orders\/.+\/pdf/);
  const response = await page.request.get(href);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  expect((await response.body()).subarray(0, 4).toString()).toBe('%PDF');

  await page.locator('.actions').getByRole('link', { name: 'Мои заказы' }).click();
  await expect(page.getByRole('heading', { name: 'Мои заказы' })).toBeVisible();
  await expect(page.locator('.order-card').first()).toBeVisible();
});

test('рендер 3D: быстрый рендер в окне и использование в PDF', async ({ page }) => {
  await ensureRoom(page);
  await addFirstProduct(page);

  const renderBtn = page.getByRole('button', { name: 'Рендер 3D' });
  await expect(renderBtn).toBeVisible();
  await renderBtn.click();
  await expect(page.locator('.render-overlay')).toBeVisible({ timeout: 15_000 });
  const src = await page.locator('.render-overlay img').getAttribute('src');
  expect(src).toMatch(/^data:image\/jpeg/);
  const stored = await page.evaluate(() => sessionStorage.getItem('planner-render'));
  expect(JSON.parse(stored || 'null')?.dataUrl).toMatch(/^data:image\/jpeg/);
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.locator('.render-overlay')).toHaveCount(0);

  await page.getByRole('button', { name: 'Оформить', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Проверьте заказ' })).toBeVisible();
  await page.locator('label:has-text("Имя") input').fill('E2E Рендер');
  await page.locator('label:has-text("Телефон") input').fill('+7 900 222-33-44');
  await page.locator('input[type=email]').fill(`render-${Date.now()}@example.com`);
  await page.locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Отправить заказ' }).click();
  await expect(page.getByRole('heading', { name: /Заказ СЧ-/ })).toBeVisible({ timeout: 120_000 });

  // Снимок view3d_user у заказа — это сохранённый рендер из окна 3D.
  const href = await page.getByRole('link', { name: 'Скачать PDF' }).getAttribute('href');
  const orderId = href.match(/\/api\/orders\/(.+)\/pdf/)?.[1];
  expect(orderId).toBeTruthy();
  const image = await page.request.get(`/api/orders/${orderId}/images/view3d_user`);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image');
});

test('настройки рендера: шестерёнка, пресеты, слайдеры, сброс', async ({ page }) => {
  await ensureRoom(page);

  const gear = page.getByRole('button', { name: 'Настройки рендера' });
  await expect(gear).toBeVisible();
  await gear.click({ force: true });
  const overlay = page.locator('.render-settings-overlay');
  const modal = page.locator('.render-settings-modal');
  await expect(overlay).toBeVisible();
  await expect(modal).toBeVisible();

  // пресеты быстро применяют проходы и буфер
  await modal.locator('.preset-chip', { hasText: 'Максимум' }).click();
  await expect(modal.locator('.render-settings-row input').first()).toHaveValue('16');

  // слайдеры сохраняются в localStorage как личные настройки
  await modal.locator('.render-settings-row input').nth(1).fill('60');
  const stored = await page.evaluate(() => localStorage.getItem('planner-render-settings'));
  const parsed = JSON.parse(stored || 'null');
  expect(parsed?.passes).toBe(16);
  expect(parsed?.bufferScale).toBeCloseTo(0.6, 1);
  await expect(modal.locator('.badge')).toBeVisible();

  // Escape закрывает
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);

  // сброс возвращает к админским настройкам
  await gear.click({ force: true });
  await expect(overlay).toBeVisible();
  await modal.locator('.render-settings-foot .button', { hasText: 'Сбросить' }).click();
  const afterReset = await page.evaluate(() => localStorage.getItem('planner-render-settings'));
  expect(afterReset).toBeNull();
  await expect(modal.locator('.badge')).toHaveCount(0);

  // клик по затемнению закрывает модалку
  await overlay.click({ position: { x: 12, y: 12 } });
  await expect(overlay).toHaveCount(0);
});

test('админка: заказы и запрет анонимного API', async ({ page }) => {
  const anonymous = await page.request.get('/api/admin/orders');
  expect([401, 403]).toContain(anonymous.status());

  await page.goto('/login');
  await page.locator('input[type=email]').fill(process.env.ADMIN_EMAIL || 'admin@example.com');
  await page
    .locator('input[type=password]')
    .fill(process.env.ADMIN_PASSWORD || 'admin-dev-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/admin\/catalog$/);
  await expect(page.getByRole('heading', { name: 'Каталог и 3D-модели' })).toBeVisible();
  await expect(page.locator('.admin-tab')).toHaveCount(4);
  await expect(page.locator('.admin-tab.active')).toHaveText('Каталог');
  await expect(page.locator('.product-row')).toHaveCount(289);

  await page.locator('.admin-tab', { hasText: 'Свойства товаров' }).click();
  await expect(page).toHaveURL(/\/admin\/properties$/);
  await expect(page.getByRole('heading', { name: 'Свойства товаров' })).toBeVisible();
  await expect(page.locator('.admin-tab.active')).toHaveText('Свойства товаров');

  await page.locator('.admin-tab', { hasText: 'Настройки' }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
  await expect(page.getByRole('heading', { name: 'Настройки планировщика' })).toBeVisible();
  await expect(page.locator('.admin-tab.active')).toHaveText('Настройки');

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/catalog$/);
  await page.goto('/admin/orders');
  await expect(page.getByRole('heading', { name: 'Заказы', exact: true })).toBeVisible();
  await expect(page.locator('.admin-tab.active')).toHaveText('Заказы');
  await expect(page.locator('.data-table tbody tr').first()).toBeVisible();
});
