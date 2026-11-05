import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, getPublicSettings, mergeSettings } from './settingsDefaults.js';

describe('settings defaults', () => {
  it('merges stored rows over defaults', () => {
    const merged = mergeSettings([
      { key: 'pdf', value: { vatRate: 10 } },
      { key: 'planner', value: { gridStepCm: 1 } },
    ]);
    expect(merged.pdf.vatRate).toBe(10);
    expect(merged.pdf.title).toBe(DEFAULT_SETTINGS.pdf.title);
    expect(merged.planner.gridStepCm).toBe(1);
  });

  it('does not expose bank/legal fields publicly', () => {
    const publicSettings = getPublicSettings({
      ...DEFAULT_SETTINGS,
      company: { ...DEFAULT_SETTINGS.company, name: 'ООО Тест', bank: 'secret' },
    });
    expect(publicSettings.company.name).toBe('ООО Тест');
    expect(publicSettings.company).not.toHaveProperty('bank');
    expect(publicSettings.company).not.toHaveProperty('inn');
  });
});
