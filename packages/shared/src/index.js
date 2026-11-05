export * from './geometry.js';
export * from './labels.js';
export * from './pricing.js';
export * from './signature.js';
export const APP_NAME = 'Планировщик металлической мебели';
export const CURRENCY = 'RUB';
export const LOCALE = 'ru-RU';
export const CM = 'см';

export const ROOM_DEFAULTS = Object.freeze({
  ceilingHeightCm: 270,
  wallThicknessCm: 10,
  gridStepCm: 5,
  rotationStepDeg: 15,
});

export const ORDER_STATUSES = Object.freeze([
  'draft',
  'saved',
  'submitted',
  'in_progress',
  'done',
  'cancelled',
]);

export const ORDER_STATUS_LABELS = Object.freeze({
  draft: 'Черновик',
  saved: 'Сохранён',
  submitted: 'Отправлен',
  in_progress: 'В работе',
  done: 'Выполнен',
  cancelled: 'Отменён',
});

export function formatMoney(kopecks, currency = CURRENCY) {
  const value = Number(kopecks || 0) / 100;
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCm(value) {
  const n = Number(value || 0);
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(n)} ${CM}`;
}
