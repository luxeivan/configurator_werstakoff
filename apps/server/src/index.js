import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { createApp } from './app.js';
import { pool } from './db/client.js';
import { recoverInterruptedOptimizations } from './services/modelOptimizer.js';

await recoverInterruptedOptimizations().catch((error) =>
  logger.warn({ err: error }, 'Не удалось проверить прерванные оптимизации'),
);
const app = createApp();
const server = app.listen(env.port, () => {
  logger.info({ port: env.port, env: env.nodeEnv }, 'Планировщик запущен');
});

async function shutdown(signal) {
  logger.info({ signal }, 'Остановка сервера');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
