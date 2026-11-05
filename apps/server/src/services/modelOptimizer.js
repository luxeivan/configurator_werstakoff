import { Worker } from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { files, products } from '../db/schema.js';
import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';
import { storeFileFromPath } from './files.js';
import { ulid } from 'ulid';
import { logger } from '../utils/logger.js';

const progressByProduct = new Map();
const workerUrl = new URL('../workers/modelOptimizer.js', import.meta.url);

function absolutePath(relative) {
  return path.join(env.uploadDir, relative);
}

export function getOptimizeProgress(productId) {
  return progressByProduct.get(Number(productId)) || null;
}

function updateProgress(productId, progress, stage) {
  progressByProduct.set(Number(productId), { progress, stage, at: new Date().toISOString() });
}

export async function optimizeProductModel(productId, { targetTriangles = 50000 } = {}, actorUserId = null) {
  const rows = await db.select().from(products).where(eq(products.id, Number(productId))).limit(1);
  const product = rows[0];
  if (!product) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  if (!product.modelFileId) throw httpError(400, 'MODEL_REQUIRED', 'У товара нет 3D-модели');
  if (product.optimizeStatus === 'running') {
    throw httpError(409, 'OPTIMIZE_IN_PROGRESS', 'Оптимизация уже выполняется');
  }
  const source = await db.select().from(files).where(eq(files.id, product.modelFileId)).limit(1);
  if (!source[0]) throw httpError(404, 'MODEL_FILE_NOT_FOUND', 'Файл модели не найден');
  if (!['glb', 'stl'].includes(String(product.modelFormat || '').toLowerCase())) {
    throw httpError(400, 'OPTIMIZE_FORMAT_UNSUPPORTED', 'Оптимизация поддерживает GLB и STL');
  }

  const target = Math.min(500000, Math.max(500, Number(targetTriangles) || 50000));
  await db.update(products).set({
    optimizeStatus: 'running',
    optimizeError: null,
    optimizeTargetTriangles: target,
    optimizeSourceTriangles: product.modelTriangles || null,
    updatedAt: new Date(),
  }).where(eq(products.id, product.id));
  updateProgress(product.id, 0, 'В очереди');

  const outputPath = path.join(env.uploadDir, 'tmp', `${ulid()}.glb`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  try {
    const result = await new Promise((resolve, reject) => {
      const worker = new Worker(fileURLToPath(workerUrl), {
        workerData: {
          inputPath: absolutePath(source[0].path),
          outputPath,
          targetTriangles: target,
        },
      });
      let settled = false;
      worker.on('message', (message) => {
        if (message.type === 'progress') {
          updateProgress(product.id, message.progress, message.stage);
          return;
        }
        if (settled) return;
        settled = true;
        if (message.type === 'done') resolve(message);
        else reject(new Error(message.message || 'Ошибка оптимизации'));
      });
      worker.on('error', (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
      worker.on('exit', (code) => {
        if (settled || code === 0) return;
        settled = true;
        reject(new Error(`Воркер оптимизации завершился с кодом ${code}`));
      });
    });

    const stored = await storeFileFromPath({
      sourcePath: outputPath,
      originalName: `${product.slug || 'model'}-optimized.glb`,
      kind: 'model',
      subdir: 'models',
      createdBy: actorUserId,
    });
    await db.update(products).set({
      modelOptimizedFileId: stored.id,
      optimizeStatus: 'done',
      optimizeError: null,
      optimizeSourceTriangles: result.sourceTriangles,
      optimizeResultTriangles: result.resultTriangles,
      optimizeTargetTriangles: target,
      updatedAt: new Date(),
    }).where(eq(products.id, product.id));
    updateProgress(product.id, 100, 'Готово');
    logger.info({
      productId: product.id,
      sourceTriangles: result.sourceTriangles,
      resultTriangles: result.resultTriangles,
      sizeBytes: result.sizeBytes,
    }, '3D-модель оптимизирована');
    return { ok: true, ...result, targetTriangles: target, fileId: stored.publicId };
  } catch (error) {
    await db.update(products).set({
      optimizeStatus: 'failed',
      optimizeError: String(error.message || 'Ошибка оптимизации').slice(0, 1000),
      updatedAt: new Date(),
    }).where(eq(products.id, product.id));
    updateProgress(product.id, 0, 'Ошибка');
    logger.error({ err: error, productId: product.id }, 'Не удалось оптимизировать 3D-модель');
    throw error;
  } finally {
    await fs.unlink(outputPath).catch(() => {});
  }
}

export async function rollbackOptimizedModel(productId) {
  const rows = await db.select().from(products).where(eq(products.id, Number(productId))).limit(1);
  if (!rows[0]) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  await db.update(products).set({
    modelOptimizedFileId: null,
    optimizeStatus: 'idle',
    optimizeError: null,
    optimizeResultTriangles: null,
    updatedAt: new Date(),
  }).where(eq(products.id, Number(productId)));
  progressByProduct.delete(Number(productId));
  return { ok: true };
}

export async function recoverInterruptedOptimizations() {
  const result = await db.update(products).set({
    optimizeStatus: 'failed',
    optimizeError: 'Оптимизация прервана перезапуском. Запустите повторно.',
    updatedAt: new Date(),
  }).where(eq(products.optimizeStatus, 'running'));
  if (result[0]?.affectedRows) {
    logger.warn({ count: result[0].affectedRows }, 'Восстановлены прерванные оптимизации моделей');
  }
  return result[0]?.affectedRows || 0;
}
