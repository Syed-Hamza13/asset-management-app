import { AppError } from '../utils/errors.js';

export function notFound(req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
}

export function errorHandler(err, req, res, _next) {
  const status = err instanceof AppError ? err.status : 500;
  const payload = {
    success: false,
    error: {
      code: err instanceof AppError ? err.code : 'INTERNAL_ERROR',
      message: err instanceof AppError ? err.message : 'Something went wrong.'
    }
  };
  if (err instanceof AppError && err.fields) payload.error.fields = err.fields;
  if (process.env.NODE_ENV !== 'production') payload.error.debug = err?.message;
  if (status >= 500) console.error(err);
  res.status(status).json(payload);
}
