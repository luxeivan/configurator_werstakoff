import { AUTH_SESSION_MAX_AGE_MS } from '../session/options.js';
import { httpError } from '../utils/httpError.js';
import { findUserById } from '../services/users.js';

export function isAuthFresh(session) {
  if (!session?.authAt) return false;
  const issuedAt = new Date(session.authAt).getTime();
  return Number.isFinite(issuedAt) && Date.now() - issuedAt <= AUTH_SESSION_MAX_AGE_MS;
}


export async function loadAuthUser(req, _res, next) {
  if (!req.session?.userId) return next();

  if (!isAuthFresh(req.session)) {
    delete req.session.userId;
    delete req.session.role;
    delete req.session.authAt;
    await req.session.save();
    return next();
  }

  const user = await findUserById(req.session.userId);
  if (!user || !user.isActive) {
    delete req.session.userId;
    delete req.session.role;
    delete req.session.authAt;
    await req.session.save();
    return next();
  }

  req.authUser = user;
  if (req.session.role !== user.role) {
    req.session.role = user.role;
    await req.session.save();
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.session?.userId) {
    return next(httpError(401, 'AUTH_REQUIRED', 'Требуется вход'));
  }
  if (!isAuthFresh(req.session)) {
    return next(httpError(401, 'SESSION_EXPIRED', 'Сессия истекла, войдите снова'));
  }
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.session?.userId) {
      return next(httpError(401, 'AUTH_REQUIRED', 'Требуется вход'));
    }
    if (!isAuthFresh(req.session)) {
      return next(httpError(401, 'SESSION_EXPIRED', 'Сессия истекла, войдите снова'));
    }
    if (!roles.includes(req.session.role)) {
      return next(httpError(403, 'FORBIDDEN', 'Недостаточно прав'));
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');
