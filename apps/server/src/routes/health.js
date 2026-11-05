import { Router } from 'express';
import { pingDatabase } from '../db/client.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const started = Date.now();
  try {
    await pingDatabase();
    res.json({
      data: {
        status: 'ok',
        db: 'ok',
        uptimeSec: Math.round(process.uptime()),
        latencyMs: Date.now() - started,
      },
    });
  } catch (error) {
    res.status(503).json({
      error: {
        code: 'DB_UNAVAILABLE',
        message: 'База данных недоступна',
        details: error.message,
      },
    });
  }
});
