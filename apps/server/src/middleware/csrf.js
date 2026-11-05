import { timingSafeEqual } from 'node:crypto';
import { httpError } from '../utils/httpError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const provided = req.get('x-csrf-token') || '';
  const expected = req.session?.csrfToken || '';

  if (!safeEqual(provided, expected)) {
    return next(httpError(403, 'CSRF_INVALID', 'Недействительный CSRF-токен. Обновите страницу.'));
  }

  next();
}
