import { db } from '../db/client.js';
import { settings } from '../db/schema.js';
import { DEFAULT_SETTINGS, getPublicSettings, mergeSettings } from './settingsDefaults.js';

export async function getAllSettings() {
  const rows = await db.select().from(settings);
  return mergeSettings(rows);
}

export async function getPublicConfig() {
  return getPublicSettings(await getAllSettings());
}

export async function updateSettings(patch, actorUserId = null) {
  const current = await getAllSettings();
  const result = { ...current };
  const now = new Date();

  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) continue;
    const merged = { ...current[key], ...value };
    result[key] = merged;
    await db
      .insert(settings)
      .values({ key, value: merged, updatedBy: actorUserId, updatedAt: now })
      .onDuplicateKeyUpdate({
        set: { value: merged, updatedBy: actorUserId, updatedAt: now },
      });
  }

  return result;
}
