import { eq, inArray, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { db } from '../db/client.js';
import {
  productOptionValues,
  productOptions,
  productPropertyValues,
  properties,
  propertyParams,
} from '../db/schema.js';
import { httpError } from '../utils/httpError.js';
import { normalizeName } from '../utils/normalize.js';
import { slugify } from '../utils/slugify.js';

const DUPLICATE = 'ER_DUP_ENTRY';

function serializeParam(row) {
  return {
    id: row.id,
    publicId: row.publicId,
    propertyId: row.propertyId,
    code: row.code,
    label: row.label,
    hex: row.hex,
    ral: row.ral,
    sort: Number(row.sort),
    isActive: Boolean(row.isActive),
    defaultPriceDeltaKopecks: Number(row.defaultPriceDeltaKopecks || 0),
  };
}

export function serializeProperty(row, params = [], usageCount = 0) {
  return {
    id: row.id,
    publicId: row.publicId,
    code: row.code,
    name: row.name,
    type: row.type,
    unit: row.unit,
    isMultiple: Boolean(row.isMultiple),
    isRequiredDefault: Boolean(row.isRequiredDefault),
    isFilterable: Boolean(row.isFilterable),
    showInCard: Boolean(row.showInCard),
    showInPdf: Boolean(row.showInPdf),
    hint: row.hint,
    sort: Number(row.sort),
    isActive: Boolean(row.isActive),
    usageCount: Number(usageCount || 0),
    params: params.map(serializeParam),
  };
}

async function loadParamsByPropertyIds(ids) {
  if (!ids.length) return new Map();
  const rows = await db
    .select()
    .from(propertyParams)
    .where(inArray(propertyParams.propertyId, ids))
    .orderBy(propertyParams.sort, propertyParams.label);
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.propertyId)) map.set(row.propertyId, []);
    map.get(row.propertyId).push(row);
  }
  return map;
}

async function loadUsageCounts() {
  const values = await db
    .select({ propertyId: productPropertyValues.propertyId, count: sql`count(*)`.mapWith(Number) })
    .from(productPropertyValues)
    .groupBy(productPropertyValues.propertyId);
  const options = await db
    .select({ propertyId: productOptions.propertyId, count: sql`count(*)`.mapWith(Number) })
    .from(productOptions)
    .groupBy(productOptions.propertyId);
  const map = new Map();
  for (const item of [...values, ...options]) {
    map.set(item.propertyId, (map.get(item.propertyId) || 0) + item.count);
  }
  return map;
}

export async function listProperties({ filterableOnly = false } = {}) {
  const rows = filterableOnly
    ? await db
        .select()
        .from(properties)
        .where(sql`${properties.isActive} = 1 AND ${properties.isFilterable} = 1`)
        .orderBy(properties.sort, properties.name)
    : await db.select().from(properties).orderBy(properties.sort, properties.name);
  const params = await loadParamsByPropertyIds(rows.map((row) => row.id));
  const usage = await loadUsageCounts();
  return rows.map((row) => serializeProperty(row, params.get(row.id) || [], usage.get(row.id)));
}

export async function getPropertyById(id) {
  const rows = await db.select().from(properties).where(eq(properties.id, Number(id))).limit(1);
  if (!rows[0]) return null;
  const params = await db
    .select()
    .from(propertyParams)
    .where(eq(propertyParams.propertyId, Number(id)))
    .orderBy(propertyParams.sort, propertyParams.label);
  return serializeProperty(rows[0], params);
}

function rootError(error) {
  let current = error;
  while (current && !current.sqlMessage && current.cause) current = current.cause;
  return current;
}

function duplicateError(error) {
  const cause = rootError(error);
  if (cause?.code !== DUPLICATE) return null;
  const text = String(cause.sqlMessage || cause.message || '');
  if (text.includes('properties_name_normalized_uq')) {
    return httpError(409, 'PROPERTY_NAME_EXISTS', 'Свойство с таким наименованием уже существует');
  }
  if (text.includes('properties_code_uq')) {
    return httpError(409, 'PROPERTY_CODE_EXISTS', 'Свойство с таким кодом уже существует');
  }
  if (text.includes('property_params_label_uq')) {
    return httpError(409, 'PARAM_LABEL_EXISTS', 'Параметр с таким названием уже существует');
  }
  if (text.includes('property_params_code_uq')) {
    return httpError(409, 'PARAM_CODE_EXISTS', 'Параметр с таким кодом уже существует');
  }
  return null;
}

async function uniquePropertyCode(base) {
  const root = slugify(base).replace(/-/g, '_') || 'property';
  let candidate = root;
  let index = 1;
  while (true) {
    const rows = await db.select({ id: properties.id }).from(properties).where(eq(properties.code, candidate));
    if (!rows.length) return candidate;
    index += 1;
    candidate = `${root}_${index}`;
  }
}

export async function createProperty(input) {
  const nameNormalized = normalizeName(input.name);
  const code = input.code || (await uniquePropertyCode(input.name));
  try {
    const [result] = await db.insert(properties).values({
      publicId: ulid(),
      code,
      name: input.name,
      nameNormalized,
      type: input.type,
      unit: input.unit || null,
      isMultiple: input.isMultiple ? 1 : 0,
      isRequiredDefault: input.isRequiredDefault ? 1 : 0,
      isFilterable: input.isFilterable ? 1 : 0,
      showInCard: input.showInCard === false ? 0 : 1,
      showInPdf: input.showInPdf === false ? 0 : 1,
      hint: input.hint || '',
      sort: input.sort ?? 0,
      isActive: input.isActive === false ? 0 : 1,
    });
    return getPropertyById(result.insertId);
  } catch (error) {
    throw duplicateError(error) || error;
  }
}

export async function updateProperty(id, input) {
  const existing = await getPropertyById(id);
  if (!existing) throw httpError(404, 'PROPERTY_NOT_FOUND', 'Свойство не найдено');

  const values = { updatedAt: new Date() };
  if (input.name !== undefined) {
    values.name = input.name;
    values.nameNormalized = normalizeName(input.name);
  }
  if (input.code !== undefined) values.code = input.code;
  if (input.type !== undefined) values.type = input.type;
  if (input.unit !== undefined) values.unit = input.unit || null;
  if (input.isMultiple !== undefined) values.isMultiple = input.isMultiple ? 1 : 0;
  if (input.isRequiredDefault !== undefined) values.isRequiredDefault = input.isRequiredDefault ? 1 : 0;
  if (input.isFilterable !== undefined) values.isFilterable = input.isFilterable ? 1 : 0;
  if (input.showInCard !== undefined) values.showInCard = input.showInCard ? 1 : 0;
  if (input.showInPdf !== undefined) values.showInPdf = input.showInPdf ? 1 : 0;
  if (input.hint !== undefined) values.hint = input.hint;
  if (input.sort !== undefined) values.sort = input.sort;
  if (input.isActive !== undefined) values.isActive = input.isActive ? 1 : 0;

  try {
    await db.update(properties).set(values).where(eq(properties.id, Number(id)));
  } catch (error) {
    throw duplicateError(error) || error;
  }
  return getPropertyById(id);
}

export async function deleteProperty(id) {
  const existing = await getPropertyById(id);
  if (!existing) throw httpError(404, 'PROPERTY_NOT_FOUND', 'Свойство не найдено');
  const usage = await loadUsageCounts();
  if ((usage.get(Number(id)) || 0) > 0) {
    throw httpError(409, 'PROPERTY_IN_USE', 'Свойство используется в товарах. Сначала отвяжите его.');
  }
  await db.delete(properties).where(eq(properties.id, Number(id)));
  return { ok: true };
}

async function uniqueParamCode(propertyId, base) {
  const root = slugify(base).replace(/-/g, '_') || 'param';
  let candidate = root;
  let index = 1;
  while (true) {
    const rows = await db
      .select({ id: propertyParams.id })
      .from(propertyParams)
      .where(sql`${propertyParams.propertyId} = ${propertyId} AND ${propertyParams.code} = ${candidate}`);
    if (!rows.length) return candidate;
    index += 1;
    candidate = `${root}_${index}`;
  }
}

export async function addParam(propertyId, input) {
  const property = await getPropertyById(propertyId);
  if (!property) throw httpError(404, 'PROPERTY_NOT_FOUND', 'Свойство не найдено');
  if (!['enum', 'color'].includes(property.type)) {
    throw httpError(400, 'PARAM_NOT_ALLOWED', 'Параметры допустимы только для типов enum и color');
  }
  const code = input.code || (await uniqueParamCode(Number(propertyId), input.label));
  try {
    const [result] = await db.insert(propertyParams).values({
      publicId: ulid(),
      propertyId: Number(propertyId),
      code,
      label: input.label,
      labelNormalized: normalizeName(input.label),
      hex: input.hex || null,
      ral: input.ral || null,
      sort: input.sort ?? 0,
      isActive: input.isActive === false ? 0 : 1,
      defaultPriceDeltaKopecks: input.defaultPriceDeltaKopecks ?? 0,
    });
    const rows = await db.select().from(propertyParams).where(eq(propertyParams.id, result.insertId));
    return serializeParam(rows[0]);
  } catch (error) {
    throw duplicateError(error) || error;
  }
}

export async function updateParam(propertyId, paramId, input) {
  const rows = await db
    .select()
    .from(propertyParams)
    .where(sql`${propertyParams.id} = ${Number(paramId)} AND ${propertyParams.propertyId} = ${Number(propertyId)}`)
    .limit(1);
  if (!rows[0]) throw httpError(404, 'PARAM_NOT_FOUND', 'Параметр не найден');

  const values = {};
  if (input.label !== undefined) {
    values.label = input.label;
    values.labelNormalized = normalizeName(input.label);
  }
  if (input.code !== undefined) values.code = input.code;
  if (input.hex !== undefined) values.hex = input.hex || null;
  if (input.ral !== undefined) values.ral = input.ral || null;
  if (input.sort !== undefined) values.sort = input.sort;
  if (input.isActive !== undefined) values.isActive = input.isActive ? 1 : 0;
  if (input.defaultPriceDeltaKopecks !== undefined) {
    values.defaultPriceDeltaKopecks = input.defaultPriceDeltaKopecks;
  }

  try {
    await db.update(propertyParams).set(values).where(eq(propertyParams.id, Number(paramId)));
  } catch (error) {
    throw duplicateError(error) || error;
  }
  const updated = await db.select().from(propertyParams).where(eq(propertyParams.id, Number(paramId)));
  return serializeParam(updated[0]);
}

export async function deleteParam(propertyId, paramId) {
  const usedValues = await db
    .select({ id: productPropertyValues.id })
    .from(productPropertyValues)
    .where(eq(productPropertyValues.paramId, Number(paramId)))
    .limit(1);
  const usedOptions = await db
    .select({ id: productOptionValues.id })
    .from(productOptionValues)
    .where(eq(productOptionValues.paramId, Number(paramId)))
    .limit(1);
  if (usedValues.length || usedOptions.length) {
    throw httpError(409, 'PARAM_IN_USE', 'Параметр используется в товарах');
  }
  const rows = await db
    .select({ id: propertyParams.id })
    .from(propertyParams)
    .where(sql`${propertyParams.id} = ${Number(paramId)} AND ${propertyParams.propertyId} = ${Number(propertyId)}`)
    .limit(1);
  if (!rows.length) throw httpError(404, 'PARAM_NOT_FOUND', 'Параметр не найден');
  await db.delete(propertyParams).where(eq(propertyParams.id, Number(paramId)));
  return { ok: true };
}
