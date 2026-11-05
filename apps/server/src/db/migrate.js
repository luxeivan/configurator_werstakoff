import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { db, pool } from './client.js';
import { logger } from '../utils/logger.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

try {
  await migrate(db, { migrationsFolder });
  logger.info('Миграции применены');
} catch (error) {
  logger.error({ err: error }, 'Ошибка миграций');
  process.exitCode = 1;
} finally {
  await pool.end();
}
