import { httpError } from './httpError.js';

export function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const fields = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  throw httpError(400, 'VALIDATION_ERROR', 'Проверьте заполнение полей', fields);
}
