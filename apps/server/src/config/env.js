import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../../..');

// В Docker переменные приходят из env_file. Локально поддерживаем .env в корне и в apps/server.
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, 'apps/server/.env'), override: false });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Не задана переменная окружения ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3500),
  appUrl: process.env.APP_URL || 'http://localhost:3500',
  timezone: process.env.TZ || 'Europe/Moscow',
  trustProxy: process.env.TRUST_PROXY === 'true',
  databaseUrl: required(
    'DATABASE_URL',
    'mysql://planner:planner@127.0.0.1:3306/planner',
  ),
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-session-secret-change-me-32-bytes',
  uploadDir: process.env.UPLOAD_DIR || path.join(rootDir, 'uploads'),
  maxModelMb: Number(process.env.MAX_MODEL_MB || 500),
  maxImageMb: Number(process.env.MAX_IMAGE_MB || 8),
  // Файлы крупнее этого лимита автоматически оптимизируются сразу после загрузки.
  modelAutoOptimizeMb: Number(process.env.MODEL_AUTO_OPTIMIZE_MB || 15),
  maxOrderItems: Number(process.env.MAX_ORDER_ITEMS || 100),
  webDist: process.env.WEB_DIST || path.join(rootDir, 'apps/web/dist'),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.MAIL_FROM || 'no-reply@localhost',
    to: process.env.MAIL_TO || '',
  },
  rootDir,
};

if (env.isProduction && (env.sessionSecret.length < 32 || env.sessionSecret.includes('change-me') || env.sessionSecret.includes('dev-only'))) {
  throw new Error('В production задайте случайный SESSION_SECRET длиной не менее 32 байт');
}
