import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let transporter;

function getTransporter() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });
  }
  return transporter;
}

export async function sendOrderSubmittedEmail(order) {
  const mailer = getTransporter();
  if (!mailer) {
    logger.info({ order: order.number }, 'SMTP не настроен — письмо о заказе пропущено');
    return { skipped: true };
  }
  const to = env.smtp.to || env.smtp.user;
  if (!to) {
    logger.info({ order: order.number }, 'MAIL_TO не задан — письмо о заказе пропущено');
    return { skipped: true };
  }
  const lines = order.items
    .map((item) => `• ${item.snapshot.name} × ${item.quantity} — ${(item.totalKopecks / 100).toFixed(2)} ₽`)
    .join('\n');
  await mailer.sendMail({
    from: env.smtp.from,
    to,
    subject: `Новый заказ ${order.number}`,
    text: [
      `Новый заказ ${order.number}`,
      `Клиент: ${order.customer.name}, ${order.customer.phone}, ${order.customer.email}`,
      order.customer.comment ? `Комментарий: ${order.customer.comment}` : '',
      '',
      lines,
      '',
      `Итого: ${(order.totalKopecks / 100).toFixed(2)} ₽`,
    ].filter(Boolean).join('\n'),
  });
  logger.info({ order: order.number, to }, 'Письмо о заказе отправлено');
  return { sent: true };
}
