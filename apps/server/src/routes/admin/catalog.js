import path from 'node:path';
import { Router } from 'express';
import { httpError } from '../../utils/httpError.js';
import { parseBody } from '../../utils/validate.js';
import {
  productCreateSchema,
  productOptionsSchema,
  productPropertiesSchema,
  optimizeModelSchema,
  productUpdateSchema,
  sectionCreateSchema,
  sectionUpdateSchema,
} from '../../validation/catalog.js';
import {
  createSection,
  deleteSection,
  listSections,
  listSectionsFlat,
  updateSection,
} from '../../services/sections.js';
import {
  addProductImage,
  createProduct,
  deleteProduct,
  deleteProductImage,
  getProductById,
  listProducts,
  setProductModel,
  setProductOptions,
  setProductProperties,
  updateProduct,
} from '../../services/products.js';
import { storeUploadedFile } from '../../services/files.js';
import { getOptimizeProgress, optimizeProductModel, rollbackOptimizedModel } from '../../services/modelOptimizer.js';
import { writeAudit } from '../../services/audit.js';
import { imageUpload, modelUpload } from '../../middleware/upload.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export const adminCatalogRouter = Router();

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'INVALID_ID', 'Некорректный идентификатор');
  return id;
}

function parseJson(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw httpError(400, 'INVALID_JSON', 'Некорректный JSON в поле');
  }
}

adminCatalogRouter.get('/sections', async (_req, res) => {
  res.json({ data: await listSections() });
});

adminCatalogRouter.get('/sections/flat', async (_req, res) => {
  res.json({ data: await listSectionsFlat() });
});

adminCatalogRouter.post('/sections', async (req, res) => {
  const input = parseBody(sectionCreateSchema, req.body);
  const section = await createSection(input);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'section.create',
    entityType: 'section',
    entityId: section.publicId,
    meta: { name: section.name },
    req,
  });
  res.status(201).json({ data: section });
});

adminCatalogRouter.patch('/sections/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const input = parseBody(sectionUpdateSchema, req.body);
  const section = await updateSection(id, input);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'section.update',
    entityType: 'section',
    entityId: section.publicId,
    meta: { fields: Object.keys(input) },
    req,
  });
  res.json({ data: section });
});

adminCatalogRouter.delete('/sections/:id', async (req, res) => {
  const id = parseId(req.params.id);
  await deleteSection(id);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'section.delete',
    entityType: 'section',
    entityId: String(id),
    req,
  });
  res.json({ data: { ok: true } });
});

adminCatalogRouter.get('/products', async (req, res) => {
  const result = await listProducts({
    includeInactive: true,
    sectionId: req.query.sectionId,
    q: req.query.q,
    sort: req.query.sort,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.json({
    data: result.items,
    meta: { total: result.total, page: result.page, limit: result.limit },
  });
});

adminCatalogRouter.get('/products/:id', async (req, res) => {
  const product = await getProductById(parseId(req.params.id), { includeInactive: true });
  if (!product) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  res.json({ data: product });
});

adminCatalogRouter.post('/products', async (req, res) => {
  const input = parseBody(productCreateSchema, req.body);
  const product = await createProduct(input);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'product.create',
    entityType: 'product',
    entityId: product.publicId,
    meta: { name: product.name, sku: product.sku },
    req,
  });
  res.status(201).json({ data: product });
});

adminCatalogRouter.patch('/products/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const input = parseBody(productUpdateSchema, req.body);
  const product = await updateProduct(id, input);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'product.update',
    entityType: 'product',
    entityId: product.publicId,
    meta: { fields: Object.keys(input) },
    req,
  });
  res.json({ data: product });
});

adminCatalogRouter.delete('/products/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const product = await getProductById(id, { includeInactive: true });
  if (!product) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  await deleteProduct(id);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'product.delete',
    entityType: 'product',
    entityId: product.publicId,
    req,
  });
  res.json({ data: { ok: true } });
});

adminCatalogRouter.put('/products/:id/properties', async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(productPropertiesSchema, req.body);
  const product = await setProductProperties(id, body.values);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'product.properties',
    entityType: 'product',
    entityId: product.publicId,
    meta: { count: body.values.length },
    req,
  });
  res.json({ data: product });
});

adminCatalogRouter.put('/products/:id/options', async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(productOptionsSchema, req.body);
  const product = await setProductOptions(id, body.options);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'product.options',
    entityType: 'product',
    entityId: product.publicId,
    meta: { count: body.options.length },
    req,
  });
  res.json({ data: product });
});

adminCatalogRouter.post(
  '/products/:id/images',
  imageUpload.single('file'),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!req.file) throw httpError(400, 'FILE_REQUIRED', 'Выберите изображение');

    const product = await getProductById(id, { includeInactive: true });
    if (!product) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');

    const file = await storeUploadedFile({
      tempPath: req.file.path,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      kind: 'product_image',
      isPublic: true,
      createdBy: req.session.userId,
      subdir: `products/${id}`,
    });
    await addProductImage(id, file, { alt: product.name, isMain: product.images.length === 0 });
    await writeAudit({
      actorUserId: req.session.userId,
      action: 'product.image.upload',
      entityType: 'product',
      entityId: product.publicId,
      meta: { fileId: file.publicId },
      req,
    });
    res.status(201).json({ data: { fileId: file.id, url: `/media/public/${file.path.replace(/^public\//, '')}` } });
  },
);

adminCatalogRouter.delete('/products/:id/images/:imageId', async (req, res) => {
  const id = parseId(req.params.id);
  const imageId = parseId(req.params.imageId);
  await deleteProductImage(id, imageId);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'product.image.delete',
    entityType: 'product',
    entityId: String(id),
    meta: { imageId },
    req,
  });
  res.json({ data: { ok: true } });
});

adminCatalogRouter.post(
  '/products/:id/model',
  modelUpload.single('file'),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (!req.file) throw httpError(400, 'FILE_REQUIRED', 'Выберите 3D-модель');
    const product = await getProductById(id, { includeInactive: true });
    if (!product) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');

    const extension = path.extname(req.file.originalname).slice(1).toLowerCase();
    const file = await storeUploadedFile({
      tempPath: req.file.path,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      kind: 'model',
      isPublic: true,
      createdBy: req.session.userId,
      subdir: `models/${id}`,
    });
    const bboxMm = parseJson(req.body.bboxMm, null);
    const triangles = req.body.triangles ? Number(req.body.triangles) : null;
    const transform = parseJson(req.body.transform, { fitMode: 'uniform' });
    await setProductModel(id, file, { format: extension, bboxMm, triangles, transform });
    await writeAudit({
      actorUserId: req.session.userId,
      action: 'product.model.upload',
      entityType: 'product',
      entityId: product.publicId,
      meta: { fileId: file.publicId, format: extension, sizeBytes: file.sizeBytes },
      req,
    });
    // Автооптимизация: крупные файлы сразу приводим к лёгкой GLB-модели (в фоне),
    // планировщик автоматически переключится на оптимизированную версию.
    if (file.sizeBytes >= env.modelAutoOptimizeMb * 1024 * 1024 && (extension === 'glb' || extension === 'stl')) {
      optimizeProductModel(id, {}, req.session.userId).catch((error) => {
        logger.warn({ err: error, productId: id }, 'Автоматическая оптимизация модели не удалась');
      });
    }
    res.status(201).json({
      data: {
        fileId: file.id,
        url: `/media/public/${file.path.replace(/^public\//, '')}`,
        format: extension,
      },
    });
  },
);

adminCatalogRouter.get('/products/:id/optimize', async (req, res) => {
  const id = parseId(req.params.id);
  const product = await getProductById(id, { includeInactive: true });
  if (!product) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  res.json({
    data: {
      status: product.model?.optimizeStatus || 'idle',
      error: product.model?.optimizeError || null,
      progress: getOptimizeProgress(id),
      sourceTriangles: product.model?.optimizeSourceTriangles || product.model?.triangles || null,
      resultTriangles: product.model?.optimizeResultTriangles || null,
      targetTriangles: product.model?.optimizeTargetTriangles || null,
      optimized: product.model?.optimized || null,
    },
  });
});

adminCatalogRouter.post('/products/:id/optimize', async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(optimizeModelSchema, req.body || {});
  const result = await optimizeProductModel(id, body, req.session.userId);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'product.model.optimize',
    entityType: 'product',
    entityId: String(id),
    meta: result,
    req,
  });
  res.json({ data: result });
});

adminCatalogRouter.post('/products/:id/optimize/rollback', async (req, res) => {
  const id = parseId(req.params.id);
  await rollbackOptimizedModel(id);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'product.model.rollback',
    entityType: 'product',
    entityId: String(id),
    req,
  });
  res.json({ data: await getProductById(id, { includeInactive: true }) });
});
