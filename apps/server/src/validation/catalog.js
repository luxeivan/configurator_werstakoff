import { z } from 'zod';

const name = z.string().trim().min(1, 'Введите наименование').max(255);
const positiveNumber = z.coerce.number().positive('Значение должно быть больше нуля');
const optionalText = z.string().trim().max(2000).optional();

export const sectionCreateSchema = z.object({
  name,
  parentId: z.coerce.number().int().positive().nullable().optional(),
  description: optionalText,
  sort: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const sectionUpdateSchema = z
  .object({
    name: name.optional(),
    slug: z.string().trim().max(255).optional(),
    parentId: z.coerce.number().int().positive().nullable().optional(),
    description: optionalText,
    sort: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Нет данных для изменения' });

export const productCreateSchema = z.object({
  sectionId: z.coerce.number().int().positive(),
  name,
  sku: z.string().trim().max(64).optional().nullable(),
  priceKopecks: z.coerce.number().int().min(0),
  unit: z.string().trim().max(16).optional(),
  widthCm: positiveNumber,
  depthCm: positiveNumber,
  heightCm: positiveNumber,
  weightKg: z.coerce.number().min(0).nullable().optional(),
  shortDescription: z.string().trim().max(500).optional(),
  description: z.string().max(20000).optional(),
  sort: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const productUpdateSchema = productCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Нет данных для изменения' });

export const propertyCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]+$/, 'Код: латиница, цифры и подчёркивание')
    .max(64)
    .optional(),
  type: z.enum(['string', 'text', 'number', 'boolean', 'enum', 'color']),
  unit: z.string().trim().max(16).optional().nullable(),
  isMultiple: z.boolean().optional(),
  isRequiredDefault: z.boolean().optional(),
  isFilterable: z.boolean().optional(),
  showInCard: z.boolean().optional(),
  showInPdf: z.boolean().optional(),
  hint: z.string().trim().max(500).optional(),
  sort: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const propertyUpdateSchema = propertyCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Нет данных для изменения' });

export const paramCreateSchema = z.object({
  label: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]+$/, 'Код: латиница, цифры и подчёркивание')
    .max(64)
    .optional(),
  hex: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'HEX-цвет в формате #RRGGBB')
    .optional()
    .nullable(),
  ral: z.string().trim().max(16).optional().nullable(),
  sort: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
  defaultPriceDeltaKopecks: z.coerce.number().int().optional(),
});

export const paramUpdateSchema = paramCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Нет данных для изменения' });

export const productPropertiesSchema = z.object({
  values: z
    .array(
      z.object({
        propertyId: z.coerce.number().int().positive(),
        paramId: z.coerce.number().int().positive().nullable().optional(),
        valueText: z.string().max(5000).nullable().optional(),
        valueNumber: z.coerce.number().nullable().optional(),
        valueBool: z.boolean().nullable().optional(),
      }),
    )
    .max(100),
});

export const productOptionsSchema = z.object({
  options: z
    .array(
      z.object({
        propertyId: z.coerce.number().int().positive(),
        isRequired: z.boolean().optional(),
        isMultiple: z.boolean().optional(),
        values: z
          .array(
            z.object({
              paramId: z.coerce.number().int().positive(),
              priceDeltaKopecks: z.coerce.number().int().optional(),
              isDefault: z.boolean().optional(),
            }),
          )
          .max(100),
      }),
    )
    .max(30),
});

export const optimizeModelSchema = z.object({
  targetTriangles: z.coerce.number().int().min(500).max(500000).optional(),
});
