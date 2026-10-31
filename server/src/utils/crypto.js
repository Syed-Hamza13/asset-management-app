import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function key() {
  if (!env.SMTP_ENCRYPTION_KEY || env.SMTP_ENCRYPTION_KEY.length < 32) {
    throw new AppError(
      500,
      'SMTP_KEY_MISSING',
      'SMTP_ENCRYPTION_KEY must be set to at least 32 characters before storing an SMTP password.',
    );
  }
  return crypto.createHash('sha256').update(env.SMTP_ENCRYPTION_KEY).digest();
}

export function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(stored) {
  if (!stored) return '';
  const parts = String(stored).split(':');
  if (parts.length !== 3) throw new AppError(500, 'SMTP_KEY_INVALID', 'Stored SMTP password is malformed.');
  try {
    const [iv, tag, data] = parts.map((p) => Buffer.from(p, 'base64'));
    const decipher = crypto.createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new AppError(500, 'SMTP_KEY_INVALID', 'Unable to decrypt the stored SMTP password; SMTP_ENCRYPTION_KEY may have changed.');
  }
}
