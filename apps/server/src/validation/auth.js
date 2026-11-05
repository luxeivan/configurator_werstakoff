import { z } from 'zod';

const email = z.string().trim().max(255).email('Некорректный e-mail');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Введите пароль').max(128),
});

export const createUserSchema = z.object({
  email,
  password: z.string().min(8, 'Пароль должен быть не короче 8 символов').max(128),
  name: z.string().trim().max(255).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
  role: z.enum(['admin', 'manager', 'customer']).optional().default('manager'),
});

export const updateUserSchema = z
  .object({
    password: z.string().min(8, 'Пароль должен быть не короче 8 символов').max(128).optional(),
    name: z.string().trim().max(255).optional(),
    phone: z.string().trim().max(32).optional(),
    role: z.enum(['admin', 'manager', 'customer']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Нет данных для изменения',
  });
