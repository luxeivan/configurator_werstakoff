import { z } from 'zod';

const placement = z.object({
  x: z.coerce.number(),
  z: z.coerce.number(),
  rotationDeg: z.coerce.number().default(0),
  elevationCm: z.coerce.number().min(0).default(0),
});

const option = z.object({
  propertyId: z.coerce.number().int().positive(),
  paramId: z.coerce.number().int().positive(),
});

export const orderItemSchema = z.object({
  productId: z.string().trim().min(1).max(26),
  placement,
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  options: z.array(option).max(30).default([]),
});

export const roomSchema = z.object({
  shape: z.enum(['rect', 'l']).default('rect'),
  widthCm: z.coerce.number().min(50).max(5000),
  depthCm: z.coerce.number().min(50).max(5000),
  legWidthCm: z.coerce.number().min(1).max(4999).optional(),
  legDepthCm: z.coerce.number().min(1).max(4999).optional(),
  ceilingHeightCm: z.coerce.number().min(150).max(1000).default(270),
  polygon: z.array(z.tuple([z.coerce.number(), z.coerce.number()])).optional(),
});

export const contactsSchema = z.object({
  name: z.string().trim().min(2).max(255),
  phone: z.string().trim().min(5).max(32),
  email: z.string().trim().email().max(255),
  company: z.string().trim().max(255).optional().default(''),
  inn: z.string().trim().max(32).optional().default(''),
  comment: z.string().trim().max(5000).optional().default(''),
  consent: z.boolean(),
});

export const createOrderSchema = z.object({
  room: roomSchema,
  items: z.array(orderItemSchema).min(1).max(100),
  contacts: contactsSchema.partial({ name: true, phone: true, email: true, consent: true }).optional(),
  vatMode: z.enum(['none', 'included', 'added']).optional(),
  vatRate: z.coerce.number().min(0).max(100).optional(),
});

export const createOrderDraftSchema = createOrderSchema.partial({
  items: true,
  contacts: true,
});

export const submitOrderSchema = z.object({
  contacts: contactsSchema,
  version: z.coerce.number().int().positive().optional(),
});

export const orderStatusSchema = z.object({
  status: z.enum(['draft', 'saved', 'submitted', 'in_progress', 'done', 'cancelled']),
  comment: z.string().trim().max(2000).optional().default(''),
  version: z.coerce.number().int().positive().optional(),
});
