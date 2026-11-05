import fs from 'node:fs';
import path from 'node:path';
import { db, pool } from './client.js';
import { settings } from './schema.js';
import { DEFAULT_SETTINGS } from '../services/settingsDefaults.js';
import { createUser, findUserByEmail } from '../services/users.js';
import {
  addParam,
  createProperty,
  listProperties,
} from '../services/properties.js';
import { createSection, listSectionsFlat } from '../services/sections.js';
import {
  createProduct,
  listProducts,
  setProductModel,
  setProductOptions,
  setProductProperties,
} from '../services/products.js';
import { ensureUploadDirs, storeFileFromPath } from '../services/files.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

async function seedSettings() {
  const now = new Date();
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db
      .insert(settings)
      .values({ key, value, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { value } });
  }
  logger.info('Базовые настройки записаны');
}

async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || '';
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminEmail || !adminPassword) {
    logger.info('ADMIN_EMAIL/ADMIN_PASSWORD не заданы — администратор не создан');
    return;
  }
  const existing = await findUserByEmail(adminEmail);
  if (existing) {
    logger.info({ email: adminEmail }, 'Администратор уже существует, пароль не изменён');
    return;
  }
  await createUser({ email: adminEmail, password: adminPassword, name: 'Администратор', role: 'admin' });
  logger.info({ email: adminEmail }, 'Администратор создан');
}

async function seedColorProperty() {
  const existing = (await listProperties()).find((property) => property.name === 'Цвет');
  const property =
    existing ||
    (await createProperty({
      name: 'Цвет',
      type: 'color',
      isFilterable: true,
      showInCard: true,
      showInPdf: true,
      hint: 'Порошковая окраска по каталогу RAL',
    }));

  const params = [
    { label: 'RAL 7016', hex: '#383E42', ral: 'RAL 7016' },
    { label: 'RAL 9003', hex: '#F4F4F4', ral: 'RAL 9003' },
    { label: 'RAL 7035', hex: '#D7D7D7', ral: 'RAL 7035' },
  ];

  const fresh = (await listProperties()).find((item) => item.id === property.id);
  for (const param of params) {
    if (!fresh.params.some((item) => item.label === param.label)) {
      await addParam(property.id, param);
    }
  }

  return (await listProperties()).find((item) => item.id === property.id);
}

async function seedSampleProduct(colorProperty) {
  const existing = await listProducts({ includeInactive: true, q: 'Тележка PRF-E', limit: 10 });
  if (existing.items.some((item) => item.name === 'Тележка PRF-E')) {
    logger.info('Тестовый товар уже существует');
    return;
  }

  let section = (await listSectionsFlat()).find((item) => item.slug === 'telegki');
  if (!section) {
    section = await createSection({
      name: 'Тележки',
      description: 'Сервировочные и платформенные тележки',
    });
  }

  const product = await createProduct({
    sectionId: section.id,
    name: 'Тележка PRF-E',
    sku: 'PRF-E',
    priceKopecks: 4_590_000,
    widthCm: 50.4,
    depthCm: 85.8,
    heightCm: 85.5,
    weightKg: 18,
    shortDescription: 'Трёхуровневая тележка для ресторана и склада',
    description:
      'Металлическая тележка PRF-E с полками и колёсами. Подходит для сервировки, перевозки посуды и товаров.',
  });

  const modelPath = path.join(env.rootDir, 'models', 'Тележка PRF-E.stl');
  if (fs.existsSync(modelPath)) {
    await ensureUploadDirs();
    const file = await storeFileFromPath({
      sourcePath: modelPath,
      originalName: 'Тележка PRF-E.stl',
      kind: 'model',
      isPublic: true,
      subdir: `models/${product.id}`,
      extension: 'stl',
    });
    await setProductModel(product.id, file, {
      format: 'stl',
      bboxMm: [503.7, 858.5, 855.1],
      triangles: 176672,
      transform: { fitMode: 'uniform', rotationDeg: [0, 0, 0], scale: [1, 1, 1], offsetCm: [0, 0, 0] },
    });
    logger.info({ product: product.name }, '3D-модель тестового товара загружена');
  }

  const colorParam = colorProperty?.params?.find((param) => param.ral === 'RAL 7016');
  if (colorParam) {
    await setProductProperties(product.id, [{ propertyId: colorProperty.id, paramId: colorParam.id }]);
    await setProductOptions(product.id, [
      {
        propertyId: colorProperty.id,
        isRequired: true,
        isMultiple: false,
        values: colorProperty.params
          .filter((param) => param.isActive)
          .map((param) => ({ paramId: param.id, priceDeltaKopecks: 0, isDefault: param.id === colorParam.id })),
      },
    ]);
  }

  logger.info({ product: product.name }, 'Тестовый товар создан');
}

try {
  await seedSettings();
  await seedAdmin();
  const colorProperty = await seedColorProperty();
  await seedSampleProduct(colorProperty);
} catch (error) {
  logger.error({ err: error }, 'Ошибка seed');
  process.exitCode = 1;
} finally {
  await pool.end();
}
