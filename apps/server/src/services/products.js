import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  like,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { ulid } from 'ulid';
import { db } from '../db/client.js';
import {
  files,
  productImages,
  productOptionValues,
  productOptions,
  productPropertyValues,
  products,
  properties,
  propertyParams,
  sections,
} from '../db/schema.js';
import { httpError } from '../utils/httpError.js';
import { uniqueSlug } from '../utils/slugify.js';
import { filePublicUrl } from './files.js';
import { getDescendantIds, getSectionById } from './sections.js';
import { getPropertyById } from './properties.js';

function number(value) {
  return value === null || value === undefined ? null : Number(value);
}

function serializeSummary(row, images = []) {
  const main = images.find((image) => image.isMain) || images[0] || null;
  return {
    id: row.id,
    publicId: row.publicId,
    sectionId: row.sectionId,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    priceKopecks: Number(row.priceKopecks),
    currency: row.currency,
    unit: row.unit,
    widthCm: number(row.widthCm),
    depthCm: number(row.depthCm),
    heightCm: number(row.heightCm),
    weightKg: number(row.weightKg),
    shortDescription: row.shortDescription,
    isActive: Boolean(row.isActive),
    imageUrl: main?.url || null,
    images: images.map((image) => ({ id: image.id, fileId: image.fileId, url: image.url, isMain: image.isMain, sort: image.sort })),
  };
}

function serializeModel(row, file = null, optimizedFile = null) {
  if (!row.modelFileId) return null;
  return {
    fileId: row.modelFileId,
    url: file ? filePublicUrl(file) : null,
    format: row.modelFormat,
    bboxMm: row.modelBboxMm,
    triangles: row.modelTriangles ? Number(row.modelTriangles) : null,
    transform: row.modelTransform,
    optimizeStatus: row.optimizeStatus || 'idle',
    optimizeError: row.optimizeError || null,
    optimizeTargetTriangles: row.optimizeTargetTriangles ? Number(row.optimizeTargetTriangles) : null,
    optimizeSourceTriangles: row.optimizeSourceTriangles ? Number(row.optimizeSourceTriangles) : null,
    optimizeResultTriangles: row.optimizeResultTriangles ? Number(row.optimizeResultTriangles) : null,
    optimized: optimizedFile
      ? {
        fileId: row.modelOptimizedFileId,
        url: filePublicUrl(optimizedFile),
        sizeBytes: optimizedFile.sizeBytes,
        triangles: row.optimizeResultTriangles ? Number(row.optimizeResultTriangles) : null,
      }
      : null,
  };
}

export async function loadImagesByProductIds(ids) {
  if (!ids.length) return new Map();
  const rows = await db
    .select({
      id: productImages.id,
      productId: productImages.productId,
      fileId: files.id,
      path: files.path,
      isPublic: files.isPublic,
      isMain: productImages.isMain,
      sort: productImages.sort,
      alt: productImages.alt,
    })
    .from(productImages)
    .innerJoin(files, eq(productImages.fileId, files.id))
    .where(inArray(productImages.productId, ids))
    .orderBy(productImages.sort, productImages.id);

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.productId)) map.set(row.productId, []);
    map.get(row.productId).push({
      id: row.id,
      fileId: row.fileId,
      url: filePublicUrl(row),
      isMain: Boolean(row.isMain),
      sort: Number(row.sort),
      alt: row.alt,
    });
  }
  return map;
}

export async function listProducts(filters = {}) {
  const includeInactive = Boolean(filters.includeInactive);
  const conditions = [];
  if (!includeInactive) {
    conditions.push(eq(products.isActive, 1));
    const activeSections = await db
      .select({ id: sections.id })
      .from(sections)
      .where(eq(sections.isActive, 1));
    if (!activeSections.length) {
      return { items: [], total: 0, page: 1, limit: 0 };
    }
    conditions.push(inArray(products.sectionId, activeSections.map((row) => row.id)));
  }

  if (filters.sectionId) {
    const ids = await getDescendantIds(filters.sectionId);
    conditions.push(inArray(products.sectionId, ids));
  }
  if (filters.q) {
    const q = `%${String(filters.q).trim()}%`;
    conditions.push(or(like(products.name, q), like(products.sku, q)));
  }
  if (filters.minPrice !== undefined) conditions.push(gte(products.priceKopecks, Number(filters.minPrice)));
  if (filters.maxPrice !== undefined) conditions.push(lte(products.priceKopecks, Number(filters.maxPrice)));
  if (filters.maxWidth !== undefined) conditions.push(lte(products.widthCm, String(filters.maxWidth)));
  if (filters.maxDepth !== undefined) conditions.push(lte(products.depthCm, String(filters.maxDepth)));
  if (filters.maxHeight !== undefined) conditions.push(lte(products.heightCm, String(filters.maxHeight)));

  const where = conditions.length ? and(...conditions) : undefined;
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 50));
  const offset = (page - 1) * limit;

  const order = {
    price_asc: [asc(products.priceKopecks), asc(products.id)],
    price_desc: [desc(products.priceKopecks), asc(products.id)],
    name: [asc(products.name)],
    new: [desc(products.createdAt), desc(products.id)],
  }[filters.sort] || [asc(products.sort), asc(products.id)];

  const rows = await db.select().from(products).where(where).orderBy(...order).limit(limit).offset(offset);
  const countRows = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(products).where(where);
  const images = await loadImagesByProductIds(rows.map((row) => row.id));

  return {
    items: rows.map((row) => serializeSummary(row, images.get(row.id) || [])),
    total: countRows[0]?.count || 0,
    page,
    limit,
  };
}

async function loadPropertyValues(productId) {
  const rows = await db
    .select({
      id: productPropertyValues.id,
      propertyId: productPropertyValues.propertyId,
      paramId: productPropertyValues.paramId,
      valueText: productPropertyValues.valueText,
      valueNumber: productPropertyValues.valueNumber,
      valueBool: productPropertyValues.valueBool,
      propertyName: properties.name,
      propertyCode: properties.code,
      propertyType: properties.type,
      paramLabel: propertyParams.label,
      paramHex: propertyParams.hex,
      paramRal: propertyParams.ral,
    })
    .from(productPropertyValues)
    .innerJoin(properties, eq(productPropertyValues.propertyId, properties.id))
    .leftJoin(propertyParams, eq(productPropertyValues.paramId, propertyParams.id))
    .where(eq(productPropertyValues.productId, Number(productId)))
    .orderBy(productPropertyValues.sort, productPropertyValues.id);
  return rows.map((row) => ({
    id: row.id,
    propertyId: row.propertyId,
    paramId: row.paramId,
    propertyName: row.propertyName,
    propertyCode: row.propertyCode,
    propertyType: row.propertyType,
    paramLabel: row.paramLabel,
    paramHex: row.paramHex,
    paramRal: row.paramRal,
    valueText: row.valueText,
    valueNumber: number(row.valueNumber),
    valueBool: row.valueBool === null ? null : Boolean(row.valueBool),
  }));
}

async function loadOptions(productId) {
  const optionRows = await db
    .select({
      id: productOptions.id,
      propertyId: productOptions.propertyId,
      propertyName: properties.name,
      propertyType: properties.type,
      isRequired: productOptions.isRequired,
      isMultiple: productOptions.isMultiple,
      sort: productOptions.sort,
    })
    .from(productOptions)
    .innerJoin(properties, eq(productOptions.propertyId, properties.id))
    .where(eq(productOptions.productId, Number(productId)))
    .orderBy(productOptions.sort, productOptions.id);

  if (!optionRows.length) return [];
  const valueRows = await db
    .select({
      optionId: productOptionValues.optionId,
      paramId: productOptionValues.paramId,
      label: propertyParams.label,
      hex: propertyParams.hex,
      ral: propertyParams.ral,
      priceDeltaKopecks: productOptionValues.priceDeltaKopecks,
      isDefault: productOptionValues.isDefault,
      sort: productOptionValues.sort,
    })
    .from(productOptionValues)
    .innerJoin(propertyParams, eq(productOptionValues.paramId, propertyParams.id))
    .where(inArray(productOptionValues.optionId, optionRows.map((row) => row.id)))
    .orderBy(productOptionValues.sort, productOptionValues.id);

  return optionRows.map((option) => ({
    propertyId: option.propertyId,
    propertyName: option.propertyName,
    propertyType: option.propertyType,
    isRequired: Boolean(option.isRequired),
    isMultiple: Boolean(option.isMultiple),
    values: valueRows
      .filter((value) => value.optionId === option.id)
      .map((value) => ({
        paramId: value.paramId,
        label: value.label,
        hex: value.hex,
        ral: value.ral,
        priceDeltaKopecks: Number(value.priceDeltaKopecks || 0),
        isDefault: Boolean(value.isDefault),
      })),
  }));
}

export async function getProductByPublicId(publicId, { includeInactive = false } = {}) {
  const rows = await db.select().from(products).where(eq(products.publicId, String(publicId))).limit(1);
  const row = rows[0];
  if (!row || (!includeInactive && !row.isActive)) return null;
  const images = await loadImagesByProductIds([row.id]);
  const propertyValues = await loadPropertyValues(row.id);
  const options = await loadOptions(row.id);
  const section = await getSectionById(row.sectionId);
  const modelRows = row.modelFileId
    ? await db.select().from(files).where(eq(files.id, row.modelFileId)).limit(1)
    : [];
  const optimizedRows = row.modelOptimizedFileId
    ? await db.select().from(files).where(eq(files.id, row.modelOptimizedFileId)).limit(1)
    : [];
  return {
    ...serializeSummary(row, images.get(row.id) || []),
    description: row.description || '',
    section: section ? { id: section.id, name: section.name, slug: section.slug } : null,
    propertyValues,
    options,
    model: serializeModel(row, modelRows[0] || null, optimizedRows[0] || null),
  };
}

export async function getProductById(id, options = {}) {
  const rows = await db.select().from(products).where(eq(products.id, Number(id))).limit(1);
  if (!rows[0]) return null;
  return getProductByPublicId(rows[0].publicId, options);
}

function rootError(error) {
  let current = error;
  while (current && !current.sqlMessage && current.cause) current = current.cause;
  return current;
}

function duplicateProductError(error) {
  const cause = rootError(error);
  if (cause?.code !== 'ER_DUP_ENTRY') return null;
  const text = String(cause.sqlMessage || cause.message || '');
  if (text.includes('products_sku_uq')) {
    return httpError(409, 'PRODUCT_SKU_EXISTS', 'Товар с таким SKU уже существует');
  }
  if (text.includes('products_slug_uq')) {
    return httpError(409, 'PRODUCT_SLUG_EXISTS', 'Товар с таким адресом уже существует');
  }
  return null;
}

async function slugExists(slug, excludeId = null) {
  const rows = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  return rows.some((row) => row.id !== excludeId);
}

export async function createProduct(input) {
  const section = await getSectionById(input.sectionId);
  if (!section) throw httpError(400, 'SECTION_NOT_FOUND', 'Раздел не найден');
  const slug = await uniqueSlug(input.name, (candidate) => slugExists(candidate));
  try {
    const [result] = await db.insert(products).values({
      publicId: ulid(),
      sectionId: input.sectionId,
      name: input.name,
      slug,
      sku: input.sku || null,
      priceKopecks: input.priceKopecks,
      currency: 'RUB',
      unit: input.unit || 'шт',
      widthCm: input.widthCm,
      depthCm: input.depthCm,
      heightCm: input.heightCm,
      weightKg: input.weightKg ?? null,
      shortDescription: input.shortDescription || '',
      description: input.description || null,
      sort: input.sort ?? 0,
      isActive: input.isActive === false ? 0 : 1,
      updatedAt: new Date(),
    });
    return getProductById(result.insertId, { includeInactive: true });
  } catch (error) {
    throw duplicateProductError(error) || error;
  }
}

export async function updateProduct(id, input) {
  const existing = await getProductById(id, { includeInactive: true });
  if (!existing) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  const values = { updatedAt: new Date() };
  for (const field of [
    'name', 'sku', 'unit', 'shortDescription', 'description', 'sort',
    'widthCm', 'depthCm', 'heightCm', 'weightKg', 'priceKopecks', 'sectionId',
  ]) {
    if (input[field] !== undefined) values[field] = input[field];
  }
  if (input.isActive !== undefined) values.isActive = input.isActive ? 1 : 0;
  if (input.sku !== undefined) values.sku = input.sku || null;
  if (input.name && input.name !== existing.name) {
    values.slug = await uniqueSlug(input.name, (candidate) => slugExists(candidate, Number(id)));
  }
  if (values.sectionId) {
    const section = await getSectionById(values.sectionId);
    if (!section) throw httpError(400, 'SECTION_NOT_FOUND', 'Раздел не найден');
  }
  try {
    await db.update(products).set(values).where(eq(products.id, Number(id)));
  } catch (error) {
    throw duplicateProductError(error) || error;
  }
  return getProductById(id, { includeInactive: true });
}

export async function deleteProduct(id) {
  const existing = await getProductById(id, { includeInactive: true });
  if (!existing) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  await db.update(products).set({ isActive: 0, updatedAt: new Date() }).where(eq(products.id, Number(id)));
  return { ok: true };
}

export async function setProductProperties(productId, values) {
  const product = await getProductById(productId, { includeInactive: true });
  if (!product) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');

  await db.transaction(async (tx) => {
    await tx.delete(productPropertyValues).where(eq(productPropertyValues.productId, Number(productId)));
    let sort = 0;
    for (const value of values) {
      const property = await getPropertyById(value.propertyId);
      if (!property) throw httpError(400, 'PROPERTY_NOT_FOUND', 'Свойство не найдено');
      const param = value.paramId ? property.params.find((item) => item.id === Number(value.paramId)) : null;
      if (value.paramId && !param) {
        throw httpError(400, 'PARAM_NOT_FOUND', 'Параметр не принадлежит свойству');
      }
      if (['enum', 'color'].includes(property.type) && !param) {
        throw httpError(400, 'PARAM_REQUIRED', `Выберите параметр для свойства «${property.name}»`);
      }
      await tx.insert(productPropertyValues).values({
        productId: Number(productId),
        propertyId: property.id,
        paramId: param ? param.id : null,
        valueKey: param ? String(param.id) : '',
        valueText: param ? param.label : value.valueText ?? null,
        valueNumber: value.valueNumber ?? null,
        valueBool:
          value.valueBool === undefined || value.valueBool === null ? null : value.valueBool ? 1 : 0,
        sort: (sort += 1),
      });
    }
  });

  return getProductById(productId, { includeInactive: true });
}

export async function setProductOptions(productId, options) {
  const product = await getProductById(productId, { includeInactive: true });
  if (!product) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');

  await db.transaction(async (tx) => {
    await tx.delete(productOptions).where(eq(productOptions.productId, Number(productId)));
    let sort = 0;
    for (const option of options) {
      const property = await getPropertyById(option.propertyId);
      if (!property) throw httpError(400, 'PROPERTY_NOT_FOUND', 'Свойство не найдено');
      if (!['enum', 'color'].includes(property.type)) {
        throw httpError(400, 'OPTION_NOT_ALLOWED', 'Опции допустимы только для enum/color');
      }
      const [optionResult] = await tx.insert(productOptions).values({
        productId: Number(productId),
        propertyId: property.id,
        isRequired: option.isRequired ? 1 : 0,
        isMultiple: option.isMultiple ? 1 : 0,
        sort: (sort += 1),
      });
      let valueSort = 0;
      for (const value of option.values || []) {
        const param = property.params.find((item) => item.id === Number(value.paramId));
        if (!param) throw httpError(400, 'PARAM_NOT_FOUND', 'Параметр не принадлежит свойству');
        await tx.insert(productOptionValues).values({
          optionId: optionResult.insertId,
          paramId: param.id,
          priceDeltaKopecks: Number(value.priceDeltaKopecks || 0),
          isDefault: value.isDefault ? 1 : 0,
          sort: (valueSort += 1),
        });
      }
    }
  });

  return getProductById(productId, { includeInactive: true });
}

export async function setProductModel(productId, file, meta = {}) {
  const product = await getProductById(productId, { includeInactive: true });
  if (!product) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  await db
    .update(products)
    .set({
      modelFileId: file.id,
      modelOriginalFileId: file.id,
      modelFormat: meta.format || null,
      modelBboxMm: meta.bboxMm || null,
      modelTriangles: meta.triangles || null,
      modelTransform: meta.transform || { fitMode: 'uniform' },
      modelOptimizedFileId: null,
      optimizeStatus: 'idle',
      optimizeError: null,
      optimizeTargetTriangles: null,
      optimizeSourceTriangles: null,
      optimizeResultTriangles: null,
      updatedAt: new Date(),
    })
    .where(eq(products.id, Number(productId)));
  return getProductById(productId, { includeInactive: true });
}

export async function addProductImage(productId, file, meta = {}) {
  const product = await getProductById(productId, { includeInactive: true });
  if (!product) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  const [result] = await db.insert(productImages).values({
    productId: Number(productId),
    fileId: file.id,
    sort: meta.sort ?? 0,
    alt: meta.alt || product.name,
    isMain: meta.isMain || !product.images?.length ? 1 : 0,
  });
  if (!product.images?.length) {
    await db
      .update(products)
      .set({ previewFileId: file.id, updatedAt: new Date() })
      .where(eq(products.id, Number(productId)));
  }
  return result.insertId;
}

export async function deleteProductImage(productId, imageId) {
  const rows = await db
    .select()
    .from(productImages)
    .where(and(eq(productImages.id, Number(imageId)), eq(productImages.productId, Number(productId))))
    .limit(1);
  if (!rows[0]) throw httpError(404, 'IMAGE_NOT_FOUND', 'Изображение не найдено');
  await db.delete(productImages).where(eq(productImages.id, Number(imageId)));
  return { ok: true };
}
