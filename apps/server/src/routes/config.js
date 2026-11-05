import { Router } from 'express';
import { APP_NAME, CURRENCY, LOCALE, ORDER_STATUSES, ROOM_DEFAULTS } from '@planner/shared';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { getPublicConfig } from '../services/settings.js';
import { DEFAULT_SETTINGS, getPublicSettings } from '../services/settingsDefaults.js';

export const configRouter = Router();

configRouter.get('/', async (_req, res) => {
  let settings = getPublicSettings(DEFAULT_SETTINGS);
  try {
    settings = await getPublicConfig();
  } catch (error) {
    logger.warn({ err: error }, 'Не удалось прочитать настройки, отданы значения по умолчанию');
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    data: {
      appName: APP_NAME,
      currency: CURRENCY,
      locale: LOCALE,
      timezone: env.timezone,
      orderStatuses: ORDER_STATUSES,
      roomDefaults: ROOM_DEFAULTS,
      settings,
      limits: {
        maxModelMb: env.maxModelMb,
        maxImageMb: env.maxImageMb,
        maxOrderItems: env.maxOrderItems,
      },
    },
  });
});
