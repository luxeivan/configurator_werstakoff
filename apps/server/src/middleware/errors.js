import { logger } from '../utils/logger.js';

export function notFound(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Маршрут не найден: ${req.method} ${req.originalUrl}` },
  });
}

export function errorHandler(error, req, res, _next) {
  let status = error.status || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message;
  if (error?.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    code = 'FILE_TOO_LARGE';
    message = 'Файл превышает допустимый размер';
  } else if (typeof error?.code === 'string' && error.code.startsWith('LIMIT_')) {
    status = 400;
    code = 'UPLOAD_ERROR';
    message = 'Ошибка загрузки файла';
  }
  if (status >= 500) {
    logger.error({ err: error, requestId: req.id }, 'Необработанная ошибка');
  }
  res.status(status).json({
    error: {
      code,
      message: status >= 500 ? 'Внутренняя ошибка сервера' : message,
      ...(error.fields ? { fields: error.fields } : {}),
    },
  });
}
