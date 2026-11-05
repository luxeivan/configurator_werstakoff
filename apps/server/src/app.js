import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { healthRouter } from './routes/health.js';
import { configRouter } from './routes/config.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { ordersRouter } from './routes/orders.js';
import { adminRouter } from './routes/admin/index.js';
import { sessionMiddleware } from './middleware/session.js';
import { loadAuthUser } from './middleware/auth.js';
import { csrfProtection } from './middleware/csrf.js';
import { notFound, errorHandler } from './middleware/errors.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy ? 1 : false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          workerSrc: ["'self'", 'blob:'],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ requestId: req.id }),
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(sessionMiddleware);
  app.use('/api', csrfProtection);

  app.use('/api/health', healthRouter);
  app.use('/api/config', configRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/orders', loadAuthUser, ordersRouter);
  app.use('/api/admin', adminRouter);

  app.use(
    '/media/public',
    express.static(path.join(env.uploadDir, 'public'), {
      maxAge: '1y',
      immutable: true,
      fallthrough: false,
    }),
  );

  const indexFile = path.join(env.webDist, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(express.static(env.webDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(indexFile);
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
