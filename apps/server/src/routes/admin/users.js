import { Router } from 'express';
import { httpError } from '../../utils/httpError.js';
import { parseBody } from '../../utils/validate.js';
import { createUserSchema, updateUserSchema } from '../../validation/auth.js';
import {
  createUser,
  findUserById,
  listUsers,
  toPublicUser,
  updateUser,
} from '../../services/users.js';
import { writeAudit } from '../../services/audit.js';

export const adminUsersRouter = Router();

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(400, 'INVALID_ID', 'Некорректный идентификатор');
  }
  return id;
}

adminUsersRouter.get('/', async (_req, res) => {
  res.json({ data: await listUsers() });
});

adminUsersRouter.post('/', async (req, res) => {
  const body = parseBody(createUserSchema, req.body);
  const user = await createUser(body);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'user.create',
    entityType: 'user',
    entityId: user.publicId,
    meta: { role: user.role },
    req,
  });
  res.status(201).json({ data: toPublicUser(user) });
});

adminUsersRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const body = parseBody(updateUserSchema, req.body);
  const existing = await findUserById(id);
  if (!existing) throw httpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');

  if (id === req.session.userId) {
    if (body.isActive === false) {
      throw httpError(400, 'CANNOT_DISABLE_SELF', 'Нельзя заблокировать самого себя');
    }
    if (body.role && body.role !== 'admin') {
      throw httpError(400, 'CANNOT_DEMOTE_SELF', 'Нельзя снять с себя роль администратора');
    }
  }

  const user = await updateUser(id, body);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'user.update',
    entityType: 'user',
    entityId: user.publicId,
    meta: { fields: Object.keys(body) },
    req,
  });
  res.json({ data: toPublicUser(user) });
});

adminUsersRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === req.session.userId) {
    throw httpError(400, 'CANNOT_DISABLE_SELF', 'Нельзя заблокировать самого себя');
  }
  const existing = await findUserById(id);
  if (!existing) throw httpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');

  const user = await updateUser(id, { isActive: false });
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'user.disable',
    entityType: 'user',
    entityId: user.publicId,
    req,
  });
  res.json({ data: toPublicUser(user) });
});
