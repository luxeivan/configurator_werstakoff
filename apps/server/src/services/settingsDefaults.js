export const DEFAULT_SETTINGS = Object.freeze({
  company: {
    name: '',
    legalName: '',
    inn: '',
    kpp: '',
    ogrn: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    bank: '',
  },
  pdf: {
    title: 'Счёт-заказ',
    prefix: 'СЧ',
    vatMode: 'included',
    vatRate: 20,
    note: 'Не является платёжным документом.',
    allowPdfWithoutImages: false,
  },
  planner: {
    ceilingHeightCm: 270,
    wallThicknessCm: 10,
    gridStepCm: 5,
    rotationStepDeg: 15,
    maxOrderItems: 100,
  },
  render: {
    passes: 6,
    bufferScale: 0.65,
    lightSoftness: 1,
    postIntensity: 1,
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function mergeSettings(rows = []) {
  const result = clone(DEFAULT_SETTINGS);
  for (const row of rows) {
    if (!row?.key || !row.value || typeof row.value !== 'object') continue;
    if (!result[row.key]) continue;
    result[row.key] = { ...result[row.key], ...row.value };
  }
  return result;
}

export function getPublicSettings(settings = DEFAULT_SETTINGS) {
  return {
    company: {
      name: settings.company?.name || '',
      phone: settings.company?.phone || '',
      email: settings.company?.email || '',
      website: settings.company?.website || '',
      address: settings.company?.address || '',
    },
    pdf: {
      title: settings.pdf?.title || '',
      vatMode: settings.pdf?.vatMode || 'included',
      vatRate: Number(settings.pdf?.vatRate ?? 20),
    },
    planner: { ...settings.planner },
    render: {
      passes: Math.min(16, Math.max(2, Number(settings.render?.passes) || 6)),
      bufferScale: Math.min(1, Math.max(0.4, Number(settings.render?.bufferScale) || 0.65)),
      lightSoftness: Math.min(2, Math.max(0.5, Number(settings.render?.lightSoftness) || 1)),
      postIntensity: Math.min(2, Math.max(0, Number(settings.render?.postIntensity) || 1)),
    },
  };
}
