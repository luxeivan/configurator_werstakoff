const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split('')
    .map((char) => (TRANSLIT[char] !== undefined ? TRANSLIT[char] : char))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'item';
}

export async function uniqueSlug(base, exists) {
  const root = slugify(base);
  let candidate = root;
  let index = 1;
  // exists(candidate) -> boolean; защищает от гонок на уровне уникального индекса БД.
  while (await exists(candidate)) {
    index += 1;
    candidate = `${root}-${index}`;
    if (index > 1000) throw new Error('Не удалось подобрать уникальный slug');
  }
  return candidate;
}
