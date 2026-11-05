import { Router } from 'express';
import { parseBody } from '../../utils/validate.js';
import { settingsPatchSchema } from '../../validation/settings.js';
import { getAllSettings, updateSettings } from '../../services/settings.js';
import { writeAudit } from '../../services/audit.js';

export const adminSettingsRouter = Router();

adminSettingsRouter.get('/', async (_req, res) => {
  res.json({ data: await getAllSettings() });
});

adminSettingsRouter.put('/', async (req, res) => {
  const patch = parseBody(settingsPatchSchema, req.body);
  const result = await updateSettings(patch, req.session.userId);
  await writeAudit({
    actorUserId: req.session.userId,
    action: 'settings.update',
    entityType: 'settings',
    meta: { keys: Object.keys(patch) },
    req,
  });
  res.json({ data: result });
});
