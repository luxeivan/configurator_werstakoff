import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { eq } from 'drizzle-orm';
import pdfmake from 'pdfmake';
import { db } from '../db/client.js';
import { files, orderImages, orderItems, orders } from '../db/schema.js';
import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';
import { getAllSettings } from './settings.js';
import { storeUploadedFile } from './files.js';

const require = createRequire(import.meta.url);
const pdfmakeRoot = path.dirname(require.resolve('pdfmake/package.json'));
const fontDir = path.join(pdfmakeRoot, 'fonts', 'Roboto');

pdfmake.addFonts({
  Roboto: {
    normal: path.join(fontDir, 'Roboto-Regular.ttf'),
    bold: path.join(fontDir, 'Roboto-Medium.ttf'),
    italics: path.join(fontDir, 'Roboto-Italic.ttf'),
    bolditalics: path.join(fontDir, 'Roboto-MediumItalic.ttf'),
  },
});
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(
  (filePath) => String(filePath).startsWith(env.uploadDir) || String(filePath).startsWith(fontDir),
);

const KIND_LABELS = {
  plan2d: 'План помещения',
  view3d_user: 'Вид 3D (камера пользователя)',
  view3d_fit: 'Общий вид',
  front: 'Фронт',
  profile: 'Профиль',
};

function money(kopecks) {
  return `${(Number(kopecks || 0) / 100).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`;
}

function decode(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function readImage(relativePath, images, key) {
  if (!relativePath) return null;
  try {
    const absolute = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(env.uploadDir, relativePath);
    const buffer = await fs.readFile(absolute);
    const extension = path.extname(absolute).toLowerCase();
    const mime = extension === '.png' ? 'image/png' : 'image/jpeg';
    images[key] = `data:${mime};base64,${buffer.toString('base64')}`;
    return key;
  } catch {
    return null;
  }
}

function imagePathFromSnapshot(snapshot) {
  const url = snapshot?.imageUrl;
  if (!url || !url.startsWith('/media/public/')) return null;
  return path.join('public', url.slice('/media/public/'.length));
}

export async function generateOrderPdf(publicId) {
  const orderRows = await db.select().from(orders).where(eq(orders.publicId, String(publicId))).limit(1);
  const order = orderRows[0];
  if (!order) throw httpError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');

  const [items, imageRows, settings] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(orderItems.sort, orderItems.id),
    db
      .select({
        kind: orderImages.kind,
        path: files.path,
        width: orderImages.width,
        height: orderImages.height,
      })
      .from(orderImages)
      .innerJoin(files, eq(orderImages.fileId, files.id))
      .where(eq(orderImages.orderId, order.id)),
    getAllSettings(),
  ]);

  const images = {};
  const itemRows = [];
  for (const [index, item] of items.entries()) {
    const snapshot = decode(item.productSnapshot, {});
    const imageKey = await readImage(imagePathFromSnapshot(snapshot), images, `item-${index}`);
    const options = (snapshot.options || []).map((option) => `${option.propertyName}: ${option.label}`).join('; ');
    itemRows.push([
      imageKey
        ? { image: imageKey, width: 40, alignment: 'center' }
        : { text: '—', alignment: 'center', color: '#94a3b8' },
      {
        stack: [
          { text: snapshot.name || 'Товар', bold: true },
          { text: [snapshot.sku ? `SKU ${snapshot.sku}` : '', options].filter(Boolean).join(' · '), fontSize: 7, color: '#64748b' },
          {
            text: `${Number(snapshot.widthCm || 0)} × ${Number(snapshot.depthCm || 0)} × ${Number(snapshot.heightCm || 0)} см`,
            fontSize: 7,
            color: '#64748b',
          },
        ],
      },
      { text: String(item.quantity), alignment: 'center' },
      { text: money(item.unitPriceKopecks), alignment: 'right' },
      { text: money(item.totalKopecks), alignment: 'right' },
    ]);
  }

  const imageBlocks = [];
  for (const [index, image] of imageRows.entries()) {
    const key = await readImage(image.path, images, `order-${index}`);
    if (!key) continue;
    imageBlocks.push({
      stack: [
        { text: KIND_LABELS[image.kind] || image.kind, bold: true, margin: [0, 10, 0, 4] },
        { image: key, fit: [515, 360], alignment: 'center' },
      ],
      pageBreak: index === 0 ? 'before' : undefined,
    });
  }

  const company = settings.company || {};
  const pdfSettings = settings.pdf || {};
  const customer = {
    name: order.customerName,
    phone: order.customerPhone,
    email: order.customerEmail,
    company: order.company,
    inn: order.inn,
  };

  const definition = {
    images,
    pageSize: 'A4',
    pageMargins: [40, 55, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#0f172a' },
    styles: {
      h1: { fontSize: 20, bold: true, margin: [0, 0, 0, 3] },
      muted: { color: '#64748b', fontSize: 8 },
      section: { fontSize: 11, bold: true, margin: [0, 12, 0, 6] },
      total: { fontSize: 11, bold: true },
    },
    header: () => ({
      margin: [40, 20, 40, 0],
      columns: [
        {
          stack: [
            { text: company.name || 'Верстакофф', bold: true, fontSize: 11 },
            { text: [company.phone, company.email, company.website].filter(Boolean).join(' · '), style: 'muted' },
          ],
        },
        { text: pdfSettings.title || 'Счёт-заказ', alignment: 'right', style: 'muted' },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      margin: [40, 10, 40, 0],
      columns: [
        { text: `${order.number} · ${formatDate(order.createdAt)}`, style: 'muted' },
        { text: `Стр. ${currentPage} из ${pageCount}`, alignment: 'right', style: 'muted' },
      ],
    }),
    content: [
      { text: pdfSettings.title || 'Счёт-заказ', style: 'h1' },
      { text: `№ ${order.number} от ${formatDate(order.createdAt)}`, style: 'muted' },
      { text: `Статус: ${order.status}`, style: 'muted', margin: [0, 2, 0, 10] },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Покупатель', style: 'section', margin: [0, 0, 0, 3] },
              { text: customer.name || '—', bold: true },
              { text: customer.phone || '' },
              { text: customer.email || '' },
              ...(customer.company ? [{ text: `Компания: ${customer.company}` }] : []),
              ...(customer.inn ? [{ text: `ИНН: ${customer.inn}` }] : []),
            ],
          },
          {
            width: 190,
            stack: [
              { text: 'Итого', style: 'section', margin: [0, 0, 0, 3] },
              {
                table: {
                  widths: ['*', 'auto'],
                  body: [
                    ['Подытог', money(order.subtotalKopecks)],
                    [`НДС (${Number(order.vatRate)}%)`, money(order.vatKopecks)],
                    [{ text: 'Всего', bold: true }, { text: money(order.totalKopecks), bold: true }],
                  ],
                },
                layout: 'lightHorizontalLines',
              },
            ],
          },
        ],
      },
      { text: 'Состав заказа', style: 'section' },
      {
        table: {
          headerRows: 1,
          widths: [42, '*', 32, 70, 75],
          body: [
            [
              { text: 'Фото', bold: true, fontSize: 8 },
              { text: 'Позиция', bold: true, fontSize: 8 },
              { text: 'Кол-во', bold: true, fontSize: 8, alignment: 'center' },
              { text: 'Цена', bold: true, fontSize: 8, alignment: 'right' },
              { text: 'Сумма', bold: true, fontSize: 8, alignment: 'right' },
            ],
            ...itemRows,
          ],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => '#e2e8f0',
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
      },
      {
        margin: [0, 12, 0, 0],
        columns: [
          { width: '*', text: order.comment ? `Комментарий: ${order.comment}` : '', style: 'muted' },
          {
            width: 220,
            table: {
              widths: ['*', 'auto'],
              body: [
                ['Подытог', money(order.subtotalKopecks)],
                [`НДС (${Number(order.vatRate)}%)`, money(order.vatKopecks)],
                [{ text: 'Всего', bold: true, fontSize: 11 }, { text: money(order.totalKopecks), bold: true, fontSize: 11 }],
              ],
            },
            layout: 'lightHorizontalLines',
          },
        ],
      },
      { text: pdfSettings.note || 'Не является платёжным документом.', style: 'muted', margin: [0, 18, 0, 0] },
      ...imageBlocks,
    ],
  };

  const buffer = await pdfmake.createPdf(definition).getBuffer();
  await fs.mkdir(path.join(env.uploadDir, 'tmp'), { recursive: true });
  const tempPath = path.join(env.uploadDir, 'tmp', `order-${order.id}-${Date.now()}.pdf`);
  await fs.writeFile(tempPath, buffer);
  try {
    const stored = await storeUploadedFile({
      tempPath,
      originalName: `order-${order.number}.pdf`,
      kind: 'pdf',
      isPublic: false,
      subdir: 'orders',
    });
    await db.update(orders).set({ pdfFileId: stored.id, updatedAt: new Date() }).where(eq(orders.id, order.id));
    return stored;
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}
