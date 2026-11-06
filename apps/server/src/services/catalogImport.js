import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { products, productImages } from '../db/schema.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { parseCsv } from '../utils/csv.js';
import { productCreateSchema, productUpdateSchema } from '../validation/catalog.js';
import { listSectionsFlat, createSection } from './sections.js';
import {
  createProduct,
  updateProduct,
  setProductModel,
  addProductImage,
  setProductProperties,
  deleteProductImage,
} from './products.js';
import { listProperties, addParam } from './properties.js';
import { storeFileFromPath, storeUploadedFile } from './files.js';
import { optimizeProductModel } from './modelOptimizer.js';

const importsById = new Map();
const MAX_IMPORT_ROWS = 5000;
const FIELD_ALIASES = {
  sku: 'sku',
  артикул: 'sku',
  article: 'sku',
  section: 'section',
  раздел: 'section',
  category: 'section',
  name: 'name',
  название: 'name',
  наименование: 'name',
  title: 'name',
  price: 'price',
  цена: 'price',
  price_kopecks: 'priceKopecks',
  pricekopecks: 'priceKopecks',
  pricecents: 'priceKopecks',
  width_cm: 'widthCm',
  widthcm: 'widthCm',
  ширина: 'widthCm',
  depth_cm: 'depthCm',
  depthcm: 'depthCm',
  глубина: 'depthCm',
  height_cm: 'heightCm',
  heightcm: 'heightCm',
  высота: 'heightCm',
  unit: 'unit',
  единица: 'unit',
  weight_kg: 'weightKg',
  weightkg: 'weightKg',
  вес: 'weightKg',
  short_description: 'shortDescription',
  shortdescription: 'shortDescription',
  description: 'description',
  описание: 'description',
  is_active: 'isActive',
  isactive: 'isActive',
  active: 'isActive',
  model: 'model',
  модель: 'model',
  model_file: 'model',
  modelfile: 'model',
  images: 'images',
  изображения: 'images',
  photos: 'images',
  фото: 'images',
};
function normalizeLabel(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(key) {
  return String(key || '').toLowerCase().replace(/ё/g, 'е').trim();
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const lower = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'да', 'вкл', 'on', 'активный'].includes(lower)) return true;
  if (['0', 'false', 'no', 'нет', 'выкл', 'off'].includes(lower)) return false;
  return fallback;
}

async function readZipEntries(zipPath) {
  // Возвращает Map: относительный путь -> локальный файл в importDir
  const importDir = path.join(env.uploadDir, 'tmp', `import-${ulid()}`);
  await fs.mkdir(importDir, { recursive: true });
  const paths = new Map();
  await new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipfile) => {
      if (error) return reject(error);
      zipfile.on('error', reject);
      zipfile.on('close', resolve);
      zipfile.on('entry', (entry) => {
        const rawName = entry.fileName.replace(/\\/g, '/');
        const parts = rawName.split('/').filter((part) => part !== '' && part !== '.');
        if (parts.length === 0 || parts.some((part) => part === '..' || part.includes('\0'))) {
          zipfile.readEntry();
          return;
        }
        if (entry.fileName.endsWith('/')) {
          zipfile.readEntry();
          return;
        }
        const relative = parts.join(path.sep);
        const target = path.join(importDir, relative);
        if (!target.startsWith(importDir + path.sep)) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (openError, stream) => {
          if (openError) return reject(openError);
          fs.mkdir(path.dirname(target), { recursive: true })
            .then(() => pipeline(stream, createWriteStream(target)))
            .then(() => {
              paths.set(rawName, target);
              zipfile.readEntry();
            })
            .catch(reject);
        });
      });
      zipfile.readEntry();
    });
  });
  return { importDir, paths };
}

function findManifest(rows, manifestPath) {
  if (manifestPath) {
    const candidate = manifestPath.replace(/\\/g, '/').replace(/^\.?\//, '');
    if (rows.has(candidate)) return candidate;
  }
  for (const name of ['manifest.csv', 'manifest.json', 'export.json']) {
    if (rows.has(name)) return name;
  }
  return null;
}

function unsafeJoin(base, relative) {
  const safe = String(relative).replace(/\\/g, '/').replace(/^\.?\//, '');
  if (safe.includes('..') || safe.startsWith('/')) return null;
  const target = path.join(base, safe);
  return target.startsWith(base + path.sep) ? target : null;
}

function normalizeRow(raw) {
  const out = { props: {} };
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null || value === '') continue;
    const trimmed = key.trim();
    if (trimmed.startsWith('property.')) {
      out.props[trimmed.slice('property.'.length)] = String(value);
      continue;
    }
    const lowercase = norm(trimmed);
    const alias = FIELD_ALIASES[lowercase] || FIELD_ALIASES[trimmed.replace(/_/g, '')];
    if (alias) {
      out[alias] = value;
    } else {
      out.props[lowercase] = String(value);
    }
  }
  return out;
}

export function getCatalogImportStatus(id) {
  const entry = importsById.get(String(id));
  if (!entry) return null;
  return {
    id: entry.id,
    status: entry.status,
    stage: entry.stage,
    progress: entry.progress,
    total: entry.total,
    done: entry.done,
    created: entry.created,
    updated: entry.updated,
    optimized: entry.optimized,
    queued: entry.queued,
    errors: entry.errors.slice(0, 200),
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
  };
}

export function startCatalogImport({ zipPath, manifestPath = null, createParams = false, actorUserId = null }) {
  const id = ulid();
  const entry = {
    id,
    task: null,
    zipPath,
    manifestPath,
    createParams,
    actorUserId,
    status: 'running',
    stage: 'extracting',
    progress: 0,
    total: 0,
    done: 0,
    created: 0,
    updated: 0,
    optimized: 0,
    errors: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  importsById.set(id, entry);

  const task = (async () => {
    let importDir = null;
    try {
      entry.stage = 'extracting';
      const extracted = await readZipEntries(zipPath);
      importDir = extracted.importDir;
      const entries = extracted.paths;

      entry.stage = 'parsing';
      const manifestName = findManifest(entries, manifestPath);
      if (!manifestName) {
        throw new Error('В архиве не найден манифест (manifest.csv/.json или export.json). Проверьте формат архива.');
      }
      const rawText = await fs.readFile(entries.get(manifestName), 'utf8');
      const rows = parseManifest(manifestName, rawText);
      if (!rows.length) throw new Error('Манифест пуст — нечего импортировать');
      if (rows.length > MAX_IMPORT_ROWS) {
        throw new Error(`В манифесте ${rows.length} строк, максимум ${MAX_IMPORT_ROWS}`);
      }

      // загружаем справочники один раз
      const propertyList = await listProperties();
      const propertyByCode = new Map();
      const propertyByName = new Map();
      for (const property of propertyList) {
        propertyByCode.set(norm(property.code || ''), property);
        propertyByName.set(normalizeLabel(property.name || ''), property);
      }
      const sectionsFlat = await listSectionsFlat();
      const sectionCache = new Map(sectionsFlat.map((item) => [item.id, item]));

      entry.total = rows.length;
      entry.stage = 'creating';

      for (let index = 0; index < rows.length; index += 1) {
        try {
          await processRow(
            rows[index],
            {
              entries,
              importDir,
              propertyByCode,
              propertyByName,
              sectionCache,
              createParams,
              actorUserId,
            },
            entry,
          );
        } catch (error) {
          const label = rows[index].sku || rows[index].name || `строка ${index + 1}`;
          entry.errors.push({ row: label, error: String(error.message || error).slice(0, 300) });
        }
        entry.done += 1;
        entry.progress = Math.round((entry.done / entry.total) * 100);
      }

      if (entry.queued > 0) {
        entry.stage = 'optimizing';
        entry.total = entry.queued;
        entry.done = 0;
        entry.progress = 0;
        for (const productId of entry.toOptimize || []) {
          try {
            await optimizeProductModel(productId, {}, actorUserId);
            entry.optimized += 1;
          } catch (error) {
            entry.errors.push({ row: `модель #${productId}`, error: String(error.message || error).slice(0, 300) });
          }
          entry.done += 1;
          entry.progress = Math.round((entry.done / entry.total) * 100);
        }
      }

      entry.status = 'done';
      entry.stage = 'done';
      entry.progress = 100;
    } catch (error) {
      entry.status = 'failed';
      entry.stage = 'failed';
      entry.errors.push({ row: 'архив', error: String(error.message || error).slice(0, 500) });
      logger.error({ err: error, importId: id }, 'Импорт каталога завершился ошибкой');
    } finally {
      entry.finishedAt = new Date().toISOString();
      if (importDir) await fs.rm(importDir, { recursive: true, force: true }).catch(() => {});
      await fs.unlink(zipPath).catch(() => {});
      if (entry.status === 'done') {
        logger.info(
          { importId: id, created: entry.created, updated: entry.updated, optimized: entry.optimized, errors: entry.errors.length },
          'Импорт каталога завершён',
        );
      }
    }
  })();
  entry.task = task;
  return id;
}

function parseManifest(name, text) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv')) return parseCsv(text);
  const payload = JSON.parse(text);
  const list = Array.isArray(payload) ? payload : payload.products || payload.items || payload.rows;
  if (!Array.isArray(list)) throw new Error('JSON-манифест должен быть массивом объектов или содержать ключ products');
  return list;
}

async function resolveSection(sectionPath, sectionCache) {
  const parts = String(sectionPath || 'Каталог')
    .split(/[/>]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) parts.push('Каталог');
  let parentId = null;
  for (const part of parts) {
    let node = [...sectionCache.values()].find(
      (item) => item.name === part && (parentId === null ? item.parentId == null : Number(item.parentId) === parentId),
    );
    if (!node) {
      const created = await createSection({ name: part, parentId });
      node = { id: created.id, parentId: created.parentId ?? null, name: part };
      sectionCache.set(created.id, node);
    }
    parentId = Number(node.id);
  }
  return parentId;
}

async function findBySku(sku) {
  const rows = await db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).limit(1);
  return rows[0]?.id ?? null;
}

function buildProductInput(row) {
  const price = row.price !== undefined && row.price !== '' ? Math.round(Number(row.price) * 100) : 0;
  const priceKopecks = row.priceKopecks !== undefined && row.priceKopecks !== '' ? Math.round(Number(row.priceKopecks)) : price;
  return {
    name: row.name,
    sku: row.sku || undefined,
    priceKopecks: Number.isFinite(priceKopecks) ? priceKopecks : 0,
    widthCm: row.widthCm,
    depthCm: row.depthCm,
    heightCm: row.heightCm,
    unit: row.unit || undefined,
    weightKg: row.weightKg !== undefined && row.weightKg !== '' ? row.weightKg : undefined,
    shortDescription: row.shortDescription || '',
    description: row.description || undefined,
    isActive: parseBool(row.isActive, true),
  };
}

function findParam(property, token) {
  const tokenNorm = normalizeLabel(token);
  for (const param of property.params || []) {
    if (normalizeLabel(param.label) === tokenNorm) return param;
  }
  const codeNorm = norm(token);
  for (const param of property.params || []) {
    if (norm(param.code) === codeNorm) return param;
  }
  if (property.type === 'color') {
    const hex = String(token).trim().toUpperCase();
    for (const param of property.params || []) {
      if (String(param.hex || '').toUpperCase() === hex) return param;
    }
  }
  return null;
}

async function resolvePropertyValue(propKey, value, propertyByCode, propertyByName, createParams) {
  const property =
    propertyByCode.get(norm(propKey)) || propertyByName.get(normalizeLabel(propKey));
  if (!property) return { warning: `Свойство «${propKey}» не найдено в справочнике` };
  const tokens = String(value)
    .split(/[;|]/)
    .map((token) => token.trim())
    .filter(Boolean);
  const values = [];
  if (property.type === 'enum' || property.type === 'color') {
    for (const token of tokens) {
      let param = findParam(property, token);
      if (!param && createParams) {
        try {
          const created = await addParam(property.id, {
            label: token,
            hex: /^#[0-9a-f]{6}$/i.test(token) ? token : undefined,
            ral: /^RAL\s*\d+/i.test(token) ? token.toUpperCase() : undefined,
          });
          param = created;
        } catch {
          /* параметр не создался — пропустим значение */
        }
      }
      if (!param) {
        return { warning: `Параметр «${token}» для свойства «${property.name}» не найден` };
      }
      values.push({ propertyId: property.id, paramId: Number(param.id) });
    }
    if (!values.length) return { values };
  } else if (property.type === 'number') {
    const number = Number(tokens[0]);
    if (!Number.isFinite(number)) return { warning: `Значение «${value}» не похоже на число` };
    values.push({ propertyId: property.id, valueNumber: number });
  } else if (property.type === 'boolean') {
    values.push({ propertyId: property.id, valueBool: parseBool(tokens[0], false) });
  } else {
    values.push({ propertyId: property.id, valueText: tokens.join(', ') });
  }
  return { values };
}

async function attachImages(productId, imageValue, entries, importDir, actorUserId) {
  const items = String(imageValue || '')
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
  for (const item of items) {
    try {
      let file = null;
      if (/^https?:\/\//i.test(item)) {
        const response = await fetch(item, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) {
          attachmentError(item, `HTTP ${response.status}`);
          continue;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = path.posix.extname(new URL(item).pathname) || '.jpg';
        const tempPath = path.join(env.uploadDir, 'tmp', `${ulid()}${ext}`);
        await fs.writeFile(tempPath, buffer);
        file = await storeUploadedFile({
          tempPath,
          originalName: path.posix.basename(new URL(item).pathname) || 'image.jpg',
          kind: 'product_image',
          isPublic: true,
          createdBy: actorUserId,
          subdir: `products/${productId}`,
        });
      } else {
        const source = unsafeJoin(importDir, item);
        if (!source) {
          attachmentError(item, 'Недопустимый путь в значении images');
          continue;
        }
        try {
          await fs.access(source);
        } catch {
          attachmentError(item, 'Файл не найден в архиве');
          continue;
        }
        file = await storeFileFromPath({
          sourcePath: source,
          originalName: path.basename(item),
          kind: 'product_image',
          isPublic: true,
          createdBy: actorUserId,
          subdir: `products/${productId}`,
        });
      }
      if (!file) continue;
      await addProductImage(productId, file, { alt: `Фото товара` });
    } catch (error) {
      attachmentError(item, String(error.message || error).slice(0, 200));
    }
  }
}

function attachmentError(item, message) {
  logger.warn({ item, message }, 'Не удалось прикрепить изображение при импорте');
}

async function processRow(rawRow, ctx, entry) {
  const row = normalizeRow(rawRow);
  if (!row.name) throw new Error('Пропущено наименование (name)');

  // Раздел
  const sectionId = await resolveSection(row.section, ctx.sectionCache);

  // Карточка товара
  const input = buildProductInput(row);
  input.sectionId = sectionId;
  const validated = productCreateSchema.parse(input);
  const fields = ['name', 'sku', 'priceKopecks', 'widthCm', 'depthCm', 'heightCm', 'unit', 'weightKg', 'shortDescription', 'description', 'isActive'];

  let productId;
  let isNew;
  const existingId = input.sku ? await findBySku(input.sku) : null;
  if (existingId) {
    const patch = {};
    for (const field of fields) if (validated[field] !== undefined) patch[field] = validated[field];
    patch.sectionId = sectionId;
    productUpdateSchema.parse(patch);
    await updateProduct(existingId, patch);
    productId = existingId;
    isNew = false;
  } else {
    const created = await createProduct(validated);
    productId = created.id;
    isNew = true;
  }
  if (isNew) entry.created += 1;
  else entry.updated += 1;

  // Свойства
  const propValues = [];
  const warnings = [];
  for (const [propKey, value] of Object.entries(row.props)) {
    const result = await resolvePropertyValue(propKey, value, ctx.propertyByCode, ctx.propertyByName, ctx.createParams);
    if (result.warning) warnings.push(result.warning);
    else if (result.values) propValues.push(...result.values);
  }
  if (propValues.length) await setProductProperties(productId, propValues);

  // Изображения: при обновлении товара существующие фото заменяются, если в строке есть images
  if (row.images) {
    if (!isNew) {
      const current = await db
        .select({ id: productImages.id })
        .from(productImages)
        .where(eq(productImages.productId, Number(productId)));
      for (const item of current) await deleteProductImage(productId, item.id);
    }
    await attachImages(productId, row.images, ctx.entries, ctx.importDir, ctx.actorUserId);
  }

  // Модель
  if (row.model) {
    const source = unsafeJoin(ctx.importDir, row.model);
    if (!source) throw new Error(`Недопустимый путь к модели: ${row.model}`);
    try {
      await fs.access(source);
    } catch {
      throw new Error(`Модель «${row.model}» не найдена в архиве`);
    }
    const extension = path.extname(source).slice(1).toLowerCase();
    if (!['glb', 'gltf', 'stl'].includes(extension)) {
      throw new Error(`Модель «${row.model}» имеет недопустимый формат .${extension}`);
    }
    const file = await storeFileFromPath({
      sourcePath: source,
      originalName: path.basename(row.model),
      kind: 'model',
      isPublic: true,
      createdBy: ctx.actorUserId,
      subdir: `models/${productId}`,
    });
    await setProductModel(productId, file, { format: extension, transform: { fitMode: 'uniform' } });
    if (file.sizeBytes >= env.modelAutoOptimizeMb * 1024 * 1024 && (extension === 'glb' || extension === 'stl')) {
      entry.toOptimize = entry.toOptimize || [];
      entry.toOptimize.push(productId);
      entry.queued = entry.queued || 0;
      entry.queued += 1;
    }
  }

  if (warnings.length) {
    logger.warn({ sku: row.sku, warnings }, 'Предупреждения импорта');
  }
}
