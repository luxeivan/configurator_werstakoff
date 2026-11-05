export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function normalizeName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е');
}
