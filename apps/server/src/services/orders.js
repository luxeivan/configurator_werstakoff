import { createHmac } from 'node:crypto';
import { ulid } from 'ulid';
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { buildRoomPolygon, calculateTotals } from '@planner/shared';
import { db } from '../db/client.js';
import {
  files,
  orderCounters,
  orderImages,
  orderItems,
  orders,
  orderStatusHistory,
} from '../db/schema.js';
import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';
import { getProductByPublicId } from './products.js';
import { getAllSettings } from './settings.js';
import { generateOrderPdf } from './pdf.js';
import { sendOrderSubmittedEmail } from './email.js';

export const ORDER_STATUSES = ['draft', 'saved', 'submitted', 'in_progress', 'done', 'cancelled'];
export const ORDER_IMAGE_KINDS = ['plan2d', 'view3d_user', 'view3d_fit', 'front', 'profile', 'thumb'];

export function hashGuestSession(guestId) {
  return createHmac('sha256', env.sessionSecret).update(String(guestId || '')).digest('hex');
}

function normalizeContacts(contacts = {}) {
  return {
    name: String(contacts.name || '').trim(),
    phone: String(contacts.phone || '').trim(),
    email: String(contacts.email || '').trim().toLowerCase(),
    company: String(contacts.company || '').trim(),
    inn: String(contacts.inn || '').trim(),
    comment: String(contacts.comment || '').trim(),
    consent: Boolean(contacts.consent),
  };
}

function decodeJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function imageUrl(orderPublicId, kind) {
  return `/api/orders/${orderPublicId}/images/${kind}`;
}

function pdfUrl(orderPublicId) {
  return `/api/orders/${orderPublicId}/pdf`;
}

function serializeHistory(row) {
  return {
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    comment: row.comment,
    actorUserId: row.actorUserId,
    createdAt: row.createdAt,
  };
}

function serializeItem(row) {
  return {
    id: row.id,
    productId: row.productId,
    snapshot: decodeJson(row.productSnapshot, {}),
    placement: decodeJson(row.placement, {}),
    quantity: Number(row.quantity),
    unitPriceKopecks: Number(row.unitPriceKopecks),
    totalKopecks: Number(row.totalKopecks),
    sort: Number(row.sort),
  };
}

async function loadOrderRow(publicId, { includeDeleted = false } = {}) {
  const conditions = [eq(orders.publicId, String(publicId))];
  if (!includeDeleted) conditions.push(isNull(orders.deletedAt));
  const rows = await db.select().from(orders).where(and(...conditions)).limit(1);
  return rows[0] || null;
}

export async function getOrderRowByPublicId(publicId, options = {}) {
  return loadOrderRow(publicId, options);
}

export async function serializeOrder(row, { history = true } = {}) {
  const [itemRows, imageRows, historyRows] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, row.id)).orderBy(orderItems.sort, orderItems.id),
    db.select().from(orderImages).where(eq(orderImages.orderId, row.id)).orderBy(orderImages.sort, orderImages.id),
    history
      ? db
          .select()
          .from(orderStatusHistory)
          .where(eq(orderStatusHistory.orderId, row.id))
          .orderBy(orderStatusHistory.createdAt, orderStatusHistory.id)
      : Promise.resolve([]),
  ]);

  return {
    id: row.id,
    publicId: row.publicId,
    number: row.number,
    status: row.status,
    customer: {
      name: row.customerName,
      phone: row.customerPhone,
      email: row.customerEmail,
      company: row.company,
      inn: row.inn,
      comment: row.comment,
    },
    consentAt: row.consentAt,
    room: decodeJson(row.roomJson, {}),
    totals: decodeJson(row.totalsJson, {}),
    currency: row.currency,
    vatMode: row.vatMode,
    vatRate: Number(row.vatRate),
    subtotalKopecks: Number(row.subtotalKopecks),
    vatKopecks: Number(row.vatKopecks),
    totalKopecks: Number(row.totalKopecks),
    items: itemRows.map(serializeItem),
    images: imageRows.map((image) => ({
      kind: image.kind,
      url: imageUrl(row.publicId, image.kind),
      width: image.width,
      height: image.height,
      camera: decodeJson(image.cameraJson, null),
    })),
    pdfReady: Boolean(row.pdfFileId),
    pdfUrl: row.pdfFileId ? pdfUrl(row.publicId) : null,
    version: Number(row.version),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
    history: historyRows.map(serializeHistory),
  };
}

export async function getOrderByPublicId(publicId) {
  const row = await loadOrderRow(publicId);
  return row ? serializeOrder(row) : null;
}

export async function getOrderInternal(publicId) {
  return loadOrderRow(publicId);
}

export async function getOrderSummary(row) {
  const detail = await serializeOrder(row, { history: false });
  return {
    publicId: detail.publicId,
    number: detail.number,
    status: detail.status,
    customer: detail.customer,
    room: detail.room,
    totals: detail.totals,
    totalKopecks: detail.totalKopecks,
    itemsCount: detail.items.reduce((sum, item) => sum + item.quantity, 0),
    positions: detail.items.length,
    imagesCount: detail.images.length,
    pdfReady: detail.pdfReady,
    createdAt: detail.createdAt,
    submittedAt: detail.submittedAt,
  };
}

export function canAccessOrder(row, req) {
  if (!row) return false;
  const role = req.session?.role;
  if (role === 'admin' || role === 'manager') return true;
  if (req.session?.userId && Number(row.userId) === Number(req.session.userId)) return true;
  if (row.customerSessionHash && req.session?.guestId) {
    return row.customerSessionHash === hashGuestSession(req.session.guestId);
  }
  return false;
}

export async function getOrderForRequest(publicId, req) {
  const row = await loadOrderRow(publicId);
  if (!row) throw httpError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
  if (!canAccessOrder(row, req)) throw httpError(403, 'ORDER_FORBIDDEN', 'Нет доступа к заказу');
  return row;
}

async function buildOrderItems(inputItems) {
  const result = [];
  for (const [index, input] of inputItems.entries()) {
    const product = await getProductByPublicId(input.productId);
    if (!product) throw httpError(400, 'PRODUCT_NOT_FOUND', `Товар ${input.productId} не найден`);

    const selected = [];
    for (const option of product.options || []) {
      const picked = (input.options || []).find(
        (item) => Number(item.propertyId) === Number(option.propertyId),
      );
      let value = picked
        ? (option.values || []).find((item) => Number(item.paramId) === Number(picked.paramId))
        : null;
      if (picked && !value) {
        throw httpError(400, 'OPTION_INVALID', `Недопустимый параметр опции «${option.propertyName}»`);
      }
      if (!value && option.isRequired) {
        value = (option.values || []).find((item) => item.isDefault) || (option.values || [])[0];
      }
      if (!value && option.isRequired) {
        throw httpError(400, 'OPTION_REQUIRED', `Выберите значение опции «${option.propertyName}»`);
      }
      if (value) {
        selected.push({
          propertyId: option.propertyId,
          propertyName: option.propertyName,
          paramId: value.paramId,
          label: value.label,
          hex: value.hex,
          ral: value.ral,
          priceDeltaKopecks: Number(value.priceDeltaKopecks || 0),
        });
      }
    }

    const unitPriceKopecks =
      Number(product.priceKopecks) +
      selected.reduce((sum, item) => sum + Number(item.priceDeltaKopecks || 0), 0);
    const quantity = Math.max(1, Math.min(99, Number(input.quantity) || 1));
    const snapshot = {
      publicId: product.publicId,
      name: product.name,
      sku: product.sku,
      slug: product.slug,
      sectionName: product.section?.name || '',
      priceKopecks: Number(product.priceKopecks),
      currency: product.currency,
      unit: product.unit,
      widthCm: Number(product.widthCm),
      depthCm: Number(product.depthCm),
      heightCm: Number(product.heightCm),
      weightKg: product.weightKg,
      imageUrl: product.imageUrl,
      options: selected,
      propertyValues: (product.propertyValues || []).map((value) => ({
        name: value.propertyName,
        type: value.propertyType,
        label: value.paramLabel,
        value:
          value.paramLabel ??
          value.valueText ??
          value.valueNumber ??
          (value.valueBool === null ? null : value.valueBool),
      })),
      model: product.model,
    };

    result.push({
      productId: product.id,
      productSnapshot: snapshot,
      placement: {
        x: Number(input.placement?.x) || 0,
        z: Number(input.placement?.z) || 0,
        rotationDeg: Number(input.placement?.rotationDeg) || 0,
        elevationCm: Number(input.placement?.elevationCm) || 0,
      },
      quantity,
      unitPriceKopecks,
      totalKopecks: unitPriceKopecks * quantity,
      sort: index,
    });
  }
  return result;
}

function orderVatSettings(settings) {
  return {
    vatMode: settings.pdf?.vatMode || 'included',
    vatRate: Number(settings.pdf?.vatRate ?? 20),
  };
}

async function insertOrderRows(tx, { inputItems, room, contacts, req, status, settings, vat }) {
  const year = String(new Date().getFullYear());
  await tx.execute(
    sql`INSERT INTO order_counters (year, last_number, updated_at) VALUES (${year}, 1, CURRENT_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE last_number = last_number + 1, updated_at = CURRENT_TIMESTAMP(3)`,
  );
  const [counter] = await tx
    .select()
    .from(orderCounters)
    .where(eq(orderCounters.year, year))
    .limit(1);
  const prefix = settings.pdf?.prefix || 'СЧ';
  const number = `${prefix}-${year}-${String(counter.lastNumber).padStart(4, '0')}`;
  const totals = calculateTotals(inputItems, vat);
  const contact = normalizeContacts(contacts);
  const statusValue = status || (contact.name && contact.phone && contact.email ? 'saved' : 'draft');

  const [result] = await tx.insert(orders).values({
    publicId: ulid(),
    number,
    userId: req.session?.userId || null,
    customerSessionHash: req.session?.userId ? null : hashGuestSession(req.session?.guestId),
    status: statusValue,
    customerName: contact.name,
    customerPhone: contact.phone,
    customerEmail: contact.email,
    company: contact.company,
    inn: contact.inn,
    comment: contact.comment,
    consentAt: contact.consent ? new Date() : null,
    roomJson: room,
    totalsJson: totals,
    currency: 'RUB',
    vatMode: totals.vatMode,
    vatRate: String(totals.vatRate),
    subtotalKopecks: totals.subtotalKopecks,
    vatKopecks: totals.vatKopecks,
    totalKopecks: totals.totalKopecks,
    version: 1,
    updatedAt: new Date(),
  });

  await tx.insert(orderItems).values(
    inputItems.map((item) => ({
      orderId: result.insertId,
      productId: item.productId,
      productSnapshot: item.productSnapshot,
      placement: item.placement,
      quantity: item.quantity,
      unitPriceKopecks: item.unitPriceKopecks,
      totalKopecks: item.totalKopecks,
      sort: item.sort,
    })),
  );
  await tx.insert(orderStatusHistory).values({
    orderId: result.insertId,
    fromStatus: null,
    toStatus: statusValue,
    actorUserId: req.session?.userId || null,
  });
  return { orderId: result.insertId, number, status: statusValue };
}

export async function createOrder(input, req) {
  const settings = await getAllSettings();
  const room = {
    ...input.room,
    polygon: buildRoomPolygon(input.room),
  };
  const productItems = await buildOrderItems(input.items);
  const vat = orderVatSettings(settings);
  let created;
  await db.transaction(async (tx) => {
    created = await insertOrderRows(tx, {
      inputItems: productItems,
      room,
      contacts: input.contacts,
      req,
      status: input.contacts ? undefined : 'draft',
      settings,
      vat,
    });
  });
  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.id, created.orderId))
    .limit(1);
  return serializeOrder(order[0]);
}

export async function updateDraftOrder(publicId, input, req) {
  const row = await getOrderForRequest(publicId, req);
  if (!['draft', 'saved'].includes(row.status)) {
    throw httpError(409, 'ORDER_NOT_EDITABLE', 'Изменять можно только черновик или сохранённый заказ');
  }
  if (input.version && Number(input.version) !== Number(row.version)) {
    throw httpError(409, 'ORDER_VERSION_CONFLICT', 'Заказ уже изменён. Обновите страницу.');
  }

  const items = input.items ? await buildOrderItems(input.items) : null;
  const settings = await getAllSettings();
  const vat = orderVatSettings(settings);
  const room = input.room
    ? { ...input.room, polygon: buildRoomPolygon(input.room) }
    : decodeJson(row.roomJson, {});
  const contacts = input.contacts
    ? { ...normalizeContacts({
        name: row.customerName,
        phone: row.customerPhone,
        email: row.customerEmail,
        company: row.company,
        inn: row.inn,
        comment: row.comment,
        consent: Boolean(row.consentAt),
      }), ...input.contacts }
    : null;

  await db.transaction(async (tx) => {
    const totals = items
      ? calculateTotals(items, vat)
      : decodeJson(row.totalsJson, {});
    const values = {
      roomJson: room,
      totalsJson: totals,
      vatMode: totals.vatMode || row.vatMode,
      vatRate: String(totals.vatRate ?? row.vatRate),
      subtotalKopecks: totals.subtotalKopecks ?? row.subtotalKopecks,
      vatKopecks: totals.vatKopecks ?? row.vatKopecks,
      totalKopecks: totals.totalKopecks ?? row.totalKopecks,
      version: Number(row.version) + 1,
      updatedAt: new Date(),
    };
    if (contacts) {
      Object.assign(values, {
        customerName: contacts.name,
        customerPhone: contacts.phone,
        customerEmail: contacts.email,
        company: contacts.company,
        inn: contacts.inn,
        comment: contacts.comment,
        consentAt: contacts.consent ? row.consentAt || new Date() : null,
      });
    }
    await tx.update(orders).set(values).where(eq(orders.id, row.id));
    if (items) {
      await tx.delete(orderItems).where(eq(orderItems.orderId, row.id));
      await tx.insert(orderItems).values(
        items.map((item) => ({
          orderId: row.id,
          productId: item.productId,
          productSnapshot: item.productSnapshot,
          placement: item.placement,
          quantity: item.quantity,
          unitPriceKopecks: item.unitPriceKopecks,
          totalKopecks: item.totalKopecks,
          sort: item.sort,
        })),
      );
    }
  });
  return getOrderByPublicId(publicId);
}

export async function addOrderImage(publicId, req, file, { kind, camera = null, width = null, height = null }) {
  if (!ORDER_IMAGE_KINDS.includes(kind)) {
    throw httpError(400, 'IMAGE_KIND_INVALID', 'Недопустимый тип изображения заказа');
  }
  const row = await getOrderForRequest(publicId, req);
  if (!['draft', 'saved', 'submitted', 'in_progress'].includes(row.status)) {
    throw httpError(409, 'ORDER_NOT_EDITABLE', 'Заказ нельзя изменять');
  }
  const stored = await storeOrderImage(row.id, file);
  await db.delete(orderImages).where(and(eq(orderImages.orderId, row.id), eq(orderImages.kind, kind)));
  await db.insert(orderImages).values({
    orderId: row.id,
    kind,
    fileId: stored.id,
    width,
    height,
    cameraJson: camera,
    sort: ORDER_IMAGE_KINDS.indexOf(kind),
  });
  return {
    kind,
    url: imageUrl(row.publicId, kind),
    width,
    height,
    camera,
  };
}

async function storeOrderImage(orderId, file) {
  const { storeUploadedFile } = await import('./files.js');
  return storeUploadedFile({
    tempPath: file.path,
    originalName: file.originalname,
    mimetype: file.mimetype,
    kind: 'order_image',
    isPublic: false,
    subdir: `orders/${orderId}`,
  });
}

export async function getOrderImage(publicId, kind, req) {
  const row = await getOrderForRequest(publicId, req);
  const rows = await db
    .select({
      path: files.path,
      mime: files.mime,
    })
    .from(orderImages)
    .innerJoin(files, eq(orderImages.fileId, files.id))
    .where(and(eq(orderImages.orderId, row.id), eq(orderImages.kind, kind)))
    .limit(1);
  if (!rows[0]) throw httpError(404, 'ORDER_IMAGE_NOT_FOUND', 'Изображение не найдено');
  return { ...rows[0], absolutePath: `${env.uploadDir}/${rows[0].path}` };
}

export async function getOrderPdf(publicId, req) {
  const row = await getOrderForRequest(publicId, req);
  if (!row.pdfFileId) throw httpError(404, 'ORDER_PDF_NOT_FOUND', 'PDF ещё не сформирован');
  const rows = await db
    .select({ path: files.path, mime: files.mime })
    .from(files)
    .where(eq(files.id, row.pdfFileId))
    .limit(1);
  if (!rows[0]) throw httpError(404, 'ORDER_PDF_NOT_FOUND', 'PDF не найден');
  return { ...rows[0], absolutePath: `${env.uploadDir}/${rows[0].path}`, number: row.number };
}

export async function submitOrder(publicId, input, req) {
  const row = await getOrderForRequest(publicId, req);
  if (row.status === 'submitted') return serializeOrder(row);
  if (!['draft', 'saved', 'submitted'].includes(row.status)) {
    throw httpError(409, 'ORDER_NOT_SUBMITTABLE', 'Заказ нельзя отправить');
  }
  if (input.version && Number(input.version) !== Number(row.version)) {
    throw httpError(409, 'ORDER_VERSION_CONFLICT', 'Заказ уже изменён. Обновите страницу.');
  }
  const contacts = normalizeContacts(input.contacts);
  if (!contacts.name || !contacts.phone || !contacts.email) {
    throw httpError(400, 'CONTACTS_REQUIRED', 'Укажите имя, телефон и e-mail');
  }
  if (!contacts.consent) {
    throw httpError(400, 'CONSENT_REQUIRED', 'Нужно согласие на обработку данных');
  }
  const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, row.id));
  if (!itemRows.length) throw httpError(400, 'ORDER_EMPTY', 'В заказе нет позиций');

  await db.transaction(async (tx) => {
    await tx.update(orders).set({
      status: 'submitted',
      customerName: contacts.name,
      customerPhone: contacts.phone,
      customerEmail: contacts.email,
      company: contacts.company,
      inn: contacts.inn,
      comment: contacts.comment,
      consentAt: new Date(),
      submittedAt: new Date(),
      version: Number(row.version) + 1,
      updatedAt: new Date(),
    }).where(eq(orders.id, row.id));
    await tx.insert(orderStatusHistory).values({
      orderId: row.id,
      fromStatus: row.status,
      toStatus: 'submitted',
      actorUserId: req.session?.userId || null,
    });
  });

  try {
    await generateOrderPdf(publicId);
  } catch {
    // PDF can be regenerated from admin; submit must not fail because of a renderer issue.
  }
  const fresh = await loadOrderRow(publicId);
  const detail = await serializeOrder(fresh);
  try {
    await sendOrderSubmittedEmail(detail);
  } catch {
    // Email is best-effort; the order is already submitted.
  }
  return detail;
}

export async function deleteOrder(publicId, req, { purge = false } = {}) {
  const row = await getOrderForRequest(publicId, req);
  if (purge) {
    await db.delete(orders).where(eq(orders.id, row.id));
    return { ok: true, purged: true };
  }
  await db.update(orders).set({
    deletedAt: new Date(),
    status: row.status === 'submitted' ? 'cancelled' : row.status,
    updatedAt: new Date(),
  }).where(eq(orders.id, row.id));
  return { ok: true, purged: false };
}

export async function cloneOrder(publicId, req) {
  const row = await getOrderForRequest(publicId, req);
  const detail = await serializeOrder(row);
  const input = {
    room: detail.room,
    items: detail.items.map((item) => ({
      productId: item.snapshot.publicId,
      placement: item.placement,
      quantity: item.quantity,
      options: (item.snapshot.options || []).map((option) => ({
        propertyId: option.propertyId,
        paramId: option.paramId,
      })),
    })),
    contacts: detail.customer,
  };
  return createOrder(input, req);
}

export async function listOrdersForRequest(req, { page = 1, limit = 20 } = {}) {
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
  const conditions = [isNull(orders.deletedAt)];
  if (req.session?.userId) {
    conditions.push(eq(orders.userId, req.session.userId));
  } else {
    conditions.push(eq(orders.customerSessionHash, hashGuestSession(req.session?.guestId)));
  }
  const where = and(...conditions);
  const rows = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(pageSize)
    .offset((pageNumber - 1) * pageSize);
  const countRows = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(orders).where(where);
  return {
    items: await Promise.all(rows.map((row) => getOrderSummary(row))),
    total: countRows[0]?.count || 0,
    page: pageNumber,
    limit: pageSize,
  };
}

export async function listOrdersAdmin(filters = {}) {
  const conditions = [];
  if (filters.status) conditions.push(eq(orders.status, filters.status));
  if (filters.q) {
    const q = `%${String(filters.q).trim()}%`;
    conditions.push(sql`(${orders.number} LIKE ${q} OR ${orders.customerName} LIKE ${q} OR ${orders.customerPhone} LIKE ${q} OR ${orders.customerEmail} LIKE ${q})`);
  }
  if (filters.from) conditions.push(gte(orders.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(orders.createdAt, new Date(filters.to)));
  if (!filters.includeDeleted) conditions.push(isNull(orders.deletedAt));
  const where = conditions.length ? and(...conditions) : undefined;
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 30));
  const rows = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit)
    .offset((page - 1) * limit);
  const countRows = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(orders).where(where);
  return {
    items: await Promise.all(rows.map((row) => getOrderSummary(row))),
    total: countRows[0]?.count || 0,
    page,
    limit,
  };
}

export async function updateOrderStatus(publicId, { status, comment = '', version }, req) {
  const row = await loadOrderRow(publicId);
  if (!row) throw httpError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
  if (version && Number(version) !== Number(row.version)) {
    throw httpError(409, 'ORDER_VERSION_CONFLICT', 'Заказ уже изменён. Обновите страницу.');
  }
  await db.transaction(async (tx) => {
    await tx.update(orders).set({
      status,
      comment: comment || row.comment,
      version: Number(row.version) + 1,
      updatedAt: new Date(),
    }).where(eq(orders.id, row.id));
    await tx.insert(orderStatusHistory).values({
      orderId: row.id,
      fromStatus: row.status,
      toStatus: status,
      comment,
      actorUserId: req.session?.userId || null,
    });
  });
  return getOrderByPublicId(publicId);
}

export async function getAdminStats() {
  const statusRows = await db
    .select({ status: orders.status, count: sql`count(*)`.mapWith(Number) })
    .from(orders)
    .where(isNull(orders.deletedAt))
    .groupBy(orders.status);
  const totals = await db
    .select({
      count: sql`count(*)`.mapWith(Number),
      sum: sql`coalesce(sum(${orders.totalKopecks}), 0)`.mapWith(Number),
    })
    .from(orders)
    .where(isNull(orders.deletedAt));
  const recent = await db
    .select()
    .from(orders)
    .where(isNull(orders.deletedAt))
    .orderBy(desc(orders.createdAt))
    .limit(5);
  const productRows = await db
    .select({
      snapshot: orderItems.productSnapshot,
      quantity: orderItems.quantity,
      totalKopecks: orderItems.totalKopecks,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(isNull(orders.deletedAt));
  const topMap = new Map();
  for (const row of productRows) {
    const snapshot = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
    const key = snapshot?.publicId || snapshot?.name || 'unknown';
    const current = topMap.get(key) || { name: snapshot?.name || 'Товар', quantity: 0, totalKopecks: 0 };
    current.quantity += Number(row.quantity) || 0;
    current.totalKopecks += Number(row.totalKopecks) || 0;
    topMap.set(key, current);
  }
  return {
    byStatus: Object.fromEntries(statusRows.map((row) => [row.status, row.count])),
    total: totals[0]?.count || 0,
    totalKopecks: totals[0]?.sum || 0,
    recent: await Promise.all(recent.map((row) => getOrderSummary(row))),
    topProducts: [...topMap.values()]
      .sort((a, b) => b.quantity - a.quantity || b.totalKopecks - a.totalKopecks)
      .slice(0, 5),
  };
}

export async function exportOrdersCsv(filters = {}) {
  const result = await listOrdersAdmin({ ...filters, limit: 100, page: 1 });
  const rows = [['Номер', 'Дата', 'Статус', 'Клиент', 'Телефон', 'E-mail', 'Позиций', 'Сумма, ₽']];
  for (const order of result.items) {
    rows.push([
      order.number,
      new Date(order.createdAt).toISOString(),
      order.status,
      order.customer?.name || '',
      order.customer?.phone || '',
      order.customer?.email || '',
      order.itemsCount,
      (order.totalKopecks / 100).toFixed(2).replace('.', ','),
    ]);
  }
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';'))
    .join('\r\n');
}
