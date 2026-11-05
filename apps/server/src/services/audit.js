import { db } from '../db/client.js';
import { auditLog } from '../db/schema.js';
import { logger } from '../utils/logger.js';

export async function writeAudit({
  actorUserId = null,
  action,
  entityType = '',
  entityId = '',
  meta = null,
  req = null,
}) {
  try {
    await db.insert(auditLog).values({
      actorUserId,
      action,
      entityType,
      entityId: String(entityId || ''),
      meta,
      ip: req?.ip || '',
      userAgent: String(req?.get?.('user-agent') || '').slice(0, 500),
    });
  } catch (error) {
    logger.warn({ err: error, action }, 'Не удалось записать аудит');
  }
}
