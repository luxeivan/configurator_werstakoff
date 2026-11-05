import { describe, expect, it } from 'vitest';
import { normalizeName } from './normalize.js';
import { slugify, uniqueSlug } from './slugify.js';
import { productCreateSchema, productUpdateSchema, propertyCreateSchema } from '../validation/catalog.js';

describe('catalog helpers', () => {
  it('нормализует название свойства без регистра, пробелов и ё', () => {
    expect(normalizeName('  ЦВЕТ   \u0451лки ')).toBe('цвет елки');
  });

  it('транслитерирует русское название в slug', () => {
    expect(slugify('Тележка PRF-E')).toBe('telezhka-prf-e');
    expect(slugify('  ***  ')).toBe('item');
  });

  it('подбирает уникальный slug', async () => {
    const taken = new Set(['telezhka', 'telezhka-2']);
    await expect(uniqueSlug('Тележка', async (slug) => taken.has(slug))).resolves.toBe('telezhka-3');
  });

  it('валидирует карточку товара', () => {
    const valid = productCreateSchema.safeParse({
      sectionId: 1,
      name: 'Тележка',
      priceKopecks: 100_000,
      widthCm: 50,
      depthCm: 80,
      heightCm: 90,
    });
    expect(valid.success).toBe(true);
    expect(productUpdateSchema.safeParse({ name: 'Новое имя' }).success).toBe(true);
    expect(productCreateSchema.safeParse({ name: 'Без раздела', priceKopecks: 1 }).success).toBe(false);
  });

  it('валидирует тип и код свойства', () => {
    expect(propertyCreateSchema.safeParse({ name: 'Цвет', type: 'color' }).success).toBe(true);
    expect(propertyCreateSchema.safeParse({ name: 'Цвет', type: 'unknown' }).success).toBe(false);
  });
});
