import { parseArgs } from 'node:util';
import { pool } from './client.js';
import { createUser, findUserByEmail, updateUser } from '../services/users.js';
import { parseBody } from '../utils/validate.js';
import { createUserSchema } from '../validation/auth.js';
import { logger } from '../utils/logger.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string' },
    force: { type: 'boolean', default: false },
  },
});

const email = values.email || process.env.ADMIN_EMAIL;
const password = values.password || process.env.ADMIN_PASSWORD;
const name = values.name || 'Администратор';

if (!email || !password) {
  logger.error(
    'Укажите --email и --password или задайте ADMIN_EMAIL/ADMIN_PASSWORD. Пример: npm run create-admin -- --email admin@example.com --password "strong-password"',
  );
  process.exitCode = 1;
} else {
  try {
    const body = parseBody(createUserSchema, { email, password, name, role: 'admin' });
    const existing = await findUserByEmail(body.email);
    if (existing) {
      if (!values.force) {
        logger.error({ email: body.email }, 'Пользователь уже существует. Используйте --force для сброса пароля');
        process.exitCode = 1;
      } else {
        await updateUser(existing.id, {
          password: body.password,
          name: body.name,
          role: 'admin',
          isActive: true,
        });
        logger.info({ email: body.email }, 'Пароль администратора обновлён');
      }
    } else {
      const user = await createUser({ ...body, role: 'admin' });
      logger.info({ email: user.email, publicId: user.publicId }, 'Администратор создан');
    }
  } catch (error) {
    logger.error({ err: error }, 'Не удалось создать администратора');
    process.exitCode = 1;
  }
}

await pool.end();
