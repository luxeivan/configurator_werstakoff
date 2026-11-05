import path from 'node:path';
import { Router } from 'express';
import { httpError } from '../utils/httpError.js';
import { parseBody } from '../utils/validate.js';
import { createOrderSchema, submitOrderSchema } from '../validation/orders.js';
import {
  addOrderImage,
  cloneOrder,
  createOrder,
  deleteOrder,
  getOrderByPublicId,
  getOrderForRequest,
  getOrderImage,
  getOrderPdf,
  listOrdersForRequest,
  submitOrder,
  updateDraftOrder,
} from '../services/orders.js';
import { generateOrderPdf } from '../services/pdf.js';
import { writeAudit } from '../services/audit.js';
import { orderImageUpload } from '../middleware/upload.js';

export const ordersRouter = Router();

function parseJson(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw httpError(400, 'INVALID_JSON', 'Некорректный JSON');
  }
}

ordersRouter.get('/', async (req, res) => {
  const result = await listOrdersForRequest(req, {
    page: req.query.page,
    limit: req.query.limit,
  });
  res.json({
    data: result.items,
    meta: { total: result.total, page: result.page, limit: result.limit },
  });
});

ordersRouter.post('/', async (req, res) => {
  const input = parseBody(createOrderSchema, req.body);
  const order = await createOrder(input, req);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'order.create',
    entityType: 'order',
    entityId: order.publicId,
    meta: { number: order.number },
    req,
  });
  res.status(201).json({ data: order });
});

ordersRouter.get('/:id/images/:kind', async (req, res) => {
  const file = await getOrderImage(req.params.id, req.params.kind, req);
  res.set('Cache-Control', 'private, no-store');
  res.type(file.mime);
  res.sendFile(path.resolve(file.absolutePath));
});

ordersRouter.get('/:id/pdf', async (req, res) => {
  const file = await getOrderPdf(req.params.id, req);
  res.set('Cache-Control', 'private, no-store');
  res.type('application/pdf');
  res.download(path.resolve(file.absolutePath), `order-${file.number}.pdf`);
});

ordersRouter.post('/:id/images', orderImageUpload.single('file'), async (req, res) => {
  if (!req.file) throw httpError(400, 'FILE_REQUIRED', 'Выберите изображение');
  const kind = String(req.body?.kind || '');
  const camera = parseJson(req.body?.camera, null);
  const width = req.body?.width ? Number(req.body.width) : null;
  const height = req.body?.height ? Number(req.body.height) : null;
  const image = await addOrderImage(req.params.id, req, req.file, { kind, camera, width, height });
  res.status(201).json({ data: image });
});

ordersRouter.post('/:id/pdf', async (req, res) => {
  await getOrderForRequest(req.params.id, req);
  const file = await generateOrderPdf(req.params.id);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'order.pdf.generate',
    entityType: 'order',
    entityId: req.params.id,
    meta: { fileId: file.publicId },
    req,
  });
  res.json({
    data: {
      pdfUrl: `/api/orders/${req.params.id}/pdf`,
      fileId: file.publicId,
      sizeBytes: Number(file.sizeBytes),
    },
  });
});

ordersRouter.post('/:id/submit', async (req, res) => {
  const body = parseBody(submitOrderSchema, req.body);
  const order = await submitOrder(req.params.id, body, req);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'order.submit',
    entityType: 'order',
    entityId: order.publicId,
    meta: { number: order.number },
    req,
  });
  res.json({ data: order });
});

ordersRouter.post('/:id/clone', async (req, res) => {
  const order = await cloneOrder(req.params.id, req);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'order.clone',
    entityType: 'order',
    entityId: order.publicId,
    meta: { source: req.params.id },
    req,
  });
  res.status(201).json({ data: order });
});

ordersRouter.patch('/:id', async (req, res) => {
  const body = parseBody(createOrderSchema.partial({ room: true, items: true }), req.body);
  const order = await updateDraftOrder(req.params.id, body, req);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'order.update',
    entityType: 'order',
    entityId: order.publicId,
    req,
  });
  res.json({ data: order });
});

ordersRouter.delete('/:id', async (req, res) => {
  const result = await deleteOrder(req.params.id, req);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'order.delete',
    entityType: 'order',
    entityId: req.params.id,
    req,
  });
  res.json({ data: result });
});

ordersRouter.get('/:id', async (req, res) => {
  const row = await getOrderForRequest(req.params.id, req);
  const order = await getOrderByPublicId(row.publicId);
  res.json({ data: order });
});
