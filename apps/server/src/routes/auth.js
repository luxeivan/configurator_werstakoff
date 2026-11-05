import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { httpError } from '../utils/httpError.js';
import { parseBody } from '../utils/validate.js';
import { loginSchema } from '../validation/auth.js';
import { findUserByEmail, findUserById, toPublicUser, touchLastLogin } from '../services/users.js';
import { verifyPassword } from '../services/password.js';
import { writeAudit } from '../services/audit.js';
import { isAuthFresh } from '../middleware/auth.js';
import {
  checkLoginRateLimit,
  clearLoginFailures,
  registerLoginFailure,
} from '../utils/loginRateLimit.js';
import { normalizeEmail } from '../utils/normalize.js';

export const authRouter = Router();

function publicSession(session) {
  return {
    csrfToken: session.csrfToken,
    guest: !session.userId,
  };
}

authRouter.get('/me', async (req, res) => {
  let user = null;
  let reason = null;

  if (req.session.userId) {
    const row = await findUserById(req.session.userId);
    if (!row || !row.isActive) {
      delete req.session.userId;
      delete req.session.role;
      delete req.session.authAt;
      await req.session.save();
      reason = 'AUTH_REVOKED';
    } else if (!isAuthFresh(req.session)) {
      delete req.session.userId;
      delete req.session.role;
      delete req.session.authAt;
      await req.session.save();
      reason = 'SESSION_EXPIRED';
    } else {
      user = toPublicUser(row);
      if (req.session.role !== row.role) {
        req.session.role = row.role;
        await req.session.save();
      }
    }
  }

  res.set('Cache-Control', 'no-store');
  res.json({ data: { user, ...publicSession(req.session), reason } });
});

authRouter.post('/login', async (req, res) => {
  const body = parseBody(loginSchema, req.body);
  const email = normalizeEmail(body.email);
  const ip = req.ip || 'unknown';

  const limit = checkLoginRateLimit(ip, email);
  if (!limit.allowed) {
    res.set('Retry-After', String(limit.retryAfterSec));
    throw httpError(429, 'TOO_MANY_ATTEMPTS', 'Слишком много попыток входа. Попробуйте позже.');
  }

  const user = await findUserByEmail(email);
  const passwordOk = user ? await verifyPassword(body.password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    registerLoginFailure(ip, email);
    await writeAudit({
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: user?.publicId || '',
      meta: { reason: 'invalid_credentials' },
      req,
    });
    throw httpError(401, 'INVALID_CREDENTIALS', 'Неверный e-mail или пароль');
  }

  if (!user.isActive) {
    await writeAudit({
      actorUserId: user.id,
      action: 'auth.login_blocked',
      entityType: 'user',
      entityId: user.publicId,
      meta: { reason: 'inactive' },
      req,
    });
    throw httpError(403, 'USER_INACTIVE', 'Пользователь заблокирован');
  }

  clearLoginFailures(ip, email);
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.authAt = new Date().toISOString();
  req.session.csrfToken = randomBytes(32).toString('hex');
  await req.session.save();
  await touchLastLogin(user.id);
  await writeAudit({
    actorUserId: user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.publicId,
    req,
  });

  res.json({ data: { user: toPublicUser(user), ...publicSession(req.session) } });
});

authRouter.post('/logout', async (req, res) => {
  const actorUserId = req.session.userId || null;
  await writeAudit({
    actorUserId,
    action: 'auth.logout',
    entityType: 'user',
    entityId: actorUserId ? String(actorUserId) : '',
    req,
  });
  await req.session.destroy();
  res.json({ data: { ok: true } });
});
