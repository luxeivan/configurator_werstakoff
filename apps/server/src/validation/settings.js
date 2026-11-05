import { z } from 'zod';

const companySchema = z.object({
  name: z.string().max(255).optional(),
  legalName: z.string().max(255).optional(),
  inn: z.string().max(32).optional(),
  kpp: z.string().max(32).optional(),
  ogrn: z.string().max(32).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(64).optional(),
  email: z.string().max(255).optional(),
  website: z.string().max(255).optional(),
  bank: z.string().max(1000).optional(),
});

const pdfSchema = z.object({
  title: z.string().max(120).optional(),
  prefix: z.string().max(16).optional(),
  vatMode: z.enum(['none', 'included', 'added']).optional(),
  vatRate: z.number().min(0).max(100).optional(),
  note: z.string().max(1000).optional(),
  allowPdfWithoutImages: z.boolean().optional(),
});

const plannerSchema = z.object({
  ceilingHeightCm: z.number().min(150).max(1500).optional(),
  wallThicknessCm: z.number().min(0).max(100).optional(),
  gridStepCm: z.number().min(1).max(50).optional(),
  rotationStepDeg: z.number().min(1).max(90).optional(),
  maxOrderItems: z.number().int().min(1).max(500).optional(),
});

const renderSchema = z.object({
  passes: z.number().int().min(2).max(16).optional(),
  bufferScale: z.number().min(0.4).max(1).optional(),
  lightSoftness: z.number().min(0.5).max(2).optional(),
  postIntensity: z.number().min(0).max(2).optional(),
});

export const settingsPatchSchema = z
  .object({
    company: companySchema.optional(),
    pdf: pdfSchema.optional(),
    planner: plannerSchema.optional(),
    render: renderSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Передайте хотя бы один раздел настроек',
  });
