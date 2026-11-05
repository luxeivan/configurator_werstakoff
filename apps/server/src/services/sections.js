import { eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { db } from '../db/client.js';
import { products, sections } from '../db/schema.js';
import { httpError } from '../utils/httpError.js';
import { uniqueSlug } from '../utils/slugify.js';

function serializeSection(row, productCount = 0, children = []) {
  return {
    id: row.id,
    publicId: row.publicId,
    parentId: row.parentId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sort: Number(row.sort),
    isActive: Boolean(row.isActive),
    productCount,
    children,
  };
}

export async function listSections() {
  const rows = await db.select().from(sections).orderBy(sections.sort, sections.name);
  const counts = await db
    .select({ sectionId: products.sectionId, count: sql`count(*)`.mapWith(Number) })
    .from(products)
    .where(eq(products.isActive, 1))
    .groupBy(products.sectionId);
  const countMap = new Map(counts.map((item) => [item.sectionId, item.count]));

  const map = new Map(rows.map((row) => [row.id, serializeSection(row, countMap.get(row.id) || 0)]));
  const roots = [];
  for (const row of rows) {
    const node = map.get(row.id);
    if (row.parentId && map.has(row.parentId)) {
      map.get(row.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function listSectionsFlat() {
  const rows = await db.select().from(sections).orderBy(sections.sort, sections.name);
  return rows.map((row) => serializeSection(row));
}

export async function getSectionById(id) {
  const rows = await db.select().from(sections).where(eq(sections.id, Number(id))).limit(1);
  return rows[0] || null;
}

async function slugExists(slug, excludeId = null) {
  const rows = await db.select({ id: sections.id }).from(sections).where(eq(sections.slug, slug));
  return rows.some((row) => row.id !== excludeId);
}

async function validateParent(parentId, currentId = null) {
  if (parentId === null || parentId === undefined) return null;
  const parent = await getSectionById(parentId);
  if (!parent) throw httpError(400, 'PARENT_NOT_FOUND', 'Родительский раздел не найден');
  if (currentId && Number(parentId) === Number(currentId)) {
    throw httpError(400, 'SECTION_CYCLE', 'Раздел не может быть родителем самого себя');
  }
  if (currentId) {
    const all = await db.select({ id: sections.id, parentId: sections.parentId }).from(sections);
    let cursor = parent;
    const seen = new Set();
    while (cursor) {
      if (seen.has(cursor.id)) break;
      seen.add(cursor.id);
      if (cursor.id === Number(currentId)) {
        throw httpError(400, 'SECTION_CYCLE', 'Нельзя переместить раздел в его потомка');
      }
      cursor = cursor.parentId ? all.find((item) => item.id === cursor.parentId) : null;
    }
  }
  return Number(parentId);
}

export async function createSection(input) {
  const parentId = await validateParent(input.parentId);
  const slug = await uniqueSlug(input.name, (candidate) => slugExists(candidate));
  const [result] = await db.insert(sections).values({
    publicId: ulid(),
    parentId,
    name: input.name,
    slug,
    description: input.description || '',
    sort: input.sort ?? 0,
    isActive: input.isActive === false ? 0 : 1,
  });
  return getSectionById(result.insertId);
}

export async function updateSection(id, input) {
  const existing = await getSectionById(id);
  if (!existing) throw httpError(404, 'SECTION_NOT_FOUND', 'Раздел не найден');

  const values = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.description !== undefined) values.description = input.description;
  if (input.sort !== undefined) values.sort = input.sort;
  if (input.isActive !== undefined) values.isActive = input.isActive ? 1 : 0;
  if (input.parentId !== undefined) values.parentId = await validateParent(input.parentId, id);
  if (input.slug && input.slug !== existing.slug) {
    values.slug = await uniqueSlug(input.slug, (candidate) => slugExists(candidate, Number(id)));
  }

  await db.update(sections).set(values).where(eq(sections.id, Number(id)));
  return getSectionById(id);
}

export async function deleteSection(id) {
  const existing = await getSectionById(id);
  if (!existing) throw httpError(404, 'SECTION_NOT_FOUND', 'Раздел не найден');

  const childRows = await db.select({ id: sections.id }).from(sections).where(eq(sections.parentId, Number(id)));
  if (childRows.length) throw httpError(409, 'SECTION_HAS_CHILDREN', 'Сначала удалите или переместите дочерние разделы');

  const productRows = await db.select({ id: products.id }).from(products).where(eq(products.sectionId, Number(id)));
  if (productRows.length) throw httpError(409, 'SECTION_HAS_PRODUCTS', 'В разделе есть товары');

  await db.delete(sections).where(eq(sections.id, Number(id)));
  return { ok: true };
}

export async function getDescendantIds(sectionId) {
  const all = await db.select({ id: sections.id, parentId: sections.parentId }).from(sections);
  const result = new Set([Number(sectionId)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of all) {
      if (row.parentId && result.has(row.parentId) && !result.has(row.id)) {
        result.add(row.id);
        changed = true;
      }
    }
  }
  return [...result];
}
