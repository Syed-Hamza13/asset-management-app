import { AppError } from './errors.js';

export const FIELD_TYPES = new Set(['text', 'multiline', 'number', 'boolean', 'date', 'auto_date', 'dropdown', 'quantity', 'mobile']);

// Shared by the user-directory and email-recipient validators; each caller keeps
// its own error code and message.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function assertIntegerId(value, name = 'id') {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new AppError(400, 'INVALID_ID', `Invalid ${name}.`);
  return n;
}

export function validateFieldValue(field, value, optionsById = new Set()) {
  if (field.type === 'text') {
    if (typeof value !== 'string' || value.length > 5000) throw new AppError(400, 'INVALID_FIELD_VALUE', `${field.name} must be text.`);
  } else if (field.type === 'mobile') {
    if (typeof value !== 'string' || !/^\+?[0-9\s-]{7,20}$/.test(value) || (value.replace(/\D/g, '').length < 10 || value.replace(/\D/g, '').length > 15))
      throw new AppError(400, 'INVALID_FIELD_VALUE', `${field.name} must be a valid mobile number.`);
  } else if (field.type === 'multiline') {
    if (typeof value !== 'string' || value.length > 20000) throw new AppError(400, 'INVALID_FIELD_VALUE', `${field.name} must be text.`);
  } else if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new AppError(400, 'INVALID_FIELD_VALUE', `${field.name} must be a number.`);
  } else if (field.type === 'quantity') {
    if (!Number.isInteger(value) || value < 1 || value > 15) throw new AppError(400, 'INVALID_QUANTITY', `${field.name} must be a whole number between 1 and 15.`);
  } else if (field.type === 'date' || field.type === 'auto_date') {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(400, 'INVALID_FIELD_VALUE', `${field.name} must be a valid date.`);
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new AppError(400, 'INVALID_FIELD_VALUE', `${field.name} must be a valid date.`);
  } else if (field.type === 'boolean') {
    if (typeof value !== 'boolean') throw new AppError(400, 'INVALID_FIELD_VALUE', `${field.name} must be Yes or No.`);
  } else if (field.type === 'dropdown') {
    if (typeof value !== 'string' || !optionsById.has(value)) throw new AppError(400, 'INVALID_DROPDOWN_OPTION', `${field.name} has an invalid option.`);
  }
}
