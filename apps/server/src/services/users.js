import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { normalizeEmail } from '../utils/normalize.js';
import { httpError } from '../utils/httpError.js';
import { hashPassword } from './password.js';

export function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    publicId: user.publicId,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    isActive: Boolean(user.isActive),
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export async function findUserByEmail(email) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return rows[0] || null;
}

export async function findUserById(id) {
  const rows = await db.select().from(users).where(eq(users.id, Number(id))).limit(1);
  return rows[0] || null;
}

export async function listUsers() {
  const rows = await db.select().from(users).orderBy(users.id);
  return rows.map(toPublicUser);
}

export async function createUser({ email, password, name = '', phone = '', role = 'manager' }) {
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await hashPassword(password);

  try {
    await db.insert(users).values({
      publicId: ulid(),
      email: normalizedEmail,
      passwordHash,
      name,
      phone,
      role,
      isActive: 1,
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw httpError(409, 'EMAIL_EXISTS', 'Пользователь с таким e-mail уже существует');
    }
    throw error;
  }

  return findUserByEmail(normalizedEmail);
}

export async function updateUser(id, patch = {}) {
  const values = { updatedAt: new Date() };

  if (patch.email !== undefined) values.email = normalizeEmail(patch.email);
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.phone !== undefined) values.phone = patch.phone;
  if (patch.role !== undefined) values.role = patch.role;
  if (patch.isActive !== undefined) values.isActive = patch.isActive ? 1 : 0;
  if (patch.password) values.passwordHash = await hashPassword(patch.password);

  try {
    await db.update(users).set(values).where(eq(users.id, Number(id)));
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw httpError(409, 'EMAIL_EXISTS', 'Пользователь с таким e-mail уже существует');
    }
    throw error;
  }

  return findUserById(id);
}

export async function touchLastLogin(id) {
  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, Number(id)));
}
