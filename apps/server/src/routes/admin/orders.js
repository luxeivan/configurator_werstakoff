import { Router } from 'express';
import { httpError } from '../../utils/httpError.js';
import { parseBody } from '../../utils/validate.js';
import { orderStatusSchema } from '../../validation/orders.js';
import {
  exportOrdersCsv,
  getAdminStats,
  getOrderByPublicId,
  listOrdersAdmin,
  updateOrderStatus,
} from '../../services/orders.js';
import { generateOrderPdf } from '../../services/pdf.js';
import { writeAudit } from '../../services/audit.js';
import { requireRole } from '../../middleware/auth.js';

export const adminOrdersRouter = Router();

adminOrdersRouter.use(requireRole('admin', 'manager'));

adminOrdersRouter.get('/', async (req, res) => {
  const result = await listOrdersAdmin({
    status: req.query.status,
    q: req.query.q,
    from: req.query.from,
    to: req.query.to,
    page: req.query.page,
    limit: req.query.limit,
    includeDeleted: req.query.includeDeleted === 'true',
  });
  res.json({
    data: result.items,
    meta: { total: result.total, page: result.page, limit: result.limit },
  });
});

adminOrdersRouter.get('/stats', async (_req, res) => {
  res.json({ data: await getAdminStats() });
});

adminOrdersRouter.get('/export.csv', requireRole('admin'), async (req, res) => {
  const csv = await exportOrdersCsv({
    status: req.query.status,
    q: req.query.q,
    from: req.query.from,
    to: req.query.to,
  });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(`\uFEFF${csv}`);
});

adminOrdersRouter.get('/:id', async (req, res) => {
  const order = await getOrderByPublicId(req.params.id);
  if (!order) throw httpError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
  res.json({ data: order });
});

adminOrdersRouter.patch('/:id', async (req, res) => {
  const body = parseBody(orderStatusSchema, req.body);
  const order = await updateOrderStatus(req.params.id, body, req);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'order.status',
    entityType: 'order',
    entityId: order.publicId,
    meta: { status: body.status, comment: body.comment },
    req,
  });
  res.json({ data: order });
});

adminOrdersRouter.post('/:id/pdf/regenerate', async (req, res) => {
  await generateOrderPdf(req.params.id);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'order.pdf.regenerate',
    entityType: 'order',
    entityId: req.params.id,
    req,
  });
  res.json({ data: { pdfUrl: `/api/orders/${req.params.id}/pdf` } });
});

adminOrdersRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  const { deleteOrder } = await import('../../services/orders.js');
  const result = await deleteOrder(req.params.id, req, { purge: true });
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'order.purge',
    entityType: 'order',
    entityId: req.params.id,
    req,
  });
  res.json({ data: result });
});
