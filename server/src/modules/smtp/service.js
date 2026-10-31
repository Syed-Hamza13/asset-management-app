import nodemailer from 'nodemailer';
import { pool } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { EMAIL_RE } from '../../utils/validation.js';
import { encryptSecret, decryptSecret } from '../../utils/crypto.js';

const ROW = 'SELECT * FROM smtp_settings WHERE id = 1';

function toPublic(row) {
  return {
    host: row.host || '',
    port: Number(row.port) || 587,
    secure: Boolean(row.secure),
    username: row.username || '',
    fromEmail: row.from_email || '',
    fromName: row.from_name || '',
    replyTo: row.reply_to || '',
    enabled: Boolean(row.enabled),
    passwordConfigured: Boolean(row.password_encrypted),
    configured: Boolean(row.host && row.from_email),
  };
}

export async function getSmtpConfig() {
  const [[row]] = await pool.query(ROW);
  if (!row) throw new AppError(500, 'SMTP_UNINITIALIZED', 'SMTP settings row is missing.');
  return toPublic(row);
}

export async function updateSmtpConfig(input) {
  const [[row]] = await pool.query(ROW);
  if (!row) throw new AppError(500, 'SMTP_UNINITIALIZED', 'SMTP settings row is missing.');
  const port = input.port === undefined ? Number(row.port) : Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AppError(400, 'INVALID_PORT', 'Port must be between 1 and 65535.');

  let passwordEncrypted = row.password_encrypted;
  if (input.password !== undefined) {
    if (input.password === null || input.password === '') passwordEncrypted = null;
    else passwordEncrypted = encryptSecret(input.password);
  }

  await pool.execute(
    `UPDATE smtp_settings SET host=?, port=?, secure=?, username=?, password_encrypted=?, from_email=?, from_name=?, reply_to=?, enabled=? WHERE id=1`,
    [
      input.host ?? row.host ?? '',
      port,
      input.secure === undefined ? Boolean(row.secure) : Boolean(input.secure),
      input.username ?? row.username ?? '',
      passwordEncrypted,
      input.fromEmail ?? row.from_email ?? '',
      input.fromName ?? row.from_name ?? '',
      input.replyTo ?? row.reply_to ?? '',
      input.enabled === undefined ? Boolean(row.enabled) : Boolean(input.enabled),
    ],
  );
  return getSmtpConfig();
}

// Internal: full config including the decrypted password. Never returned to clients.
async function loadTransportConfig() {
  const [[row]] = await pool.query(ROW);
  if (!row) throw new AppError(500, 'SMTP_UNINITIALIZED', 'SMTP settings row is missing.');
  if (!row.host || !row.from_email) throw new AppError(400, 'SMTP_NOT_CONFIGURED', 'SMTP is not configured yet.');
  return {
    host: row.host,
    port: Number(row.port) || 587,
    secure: Boolean(row.secure),
    auth: row.username ? { user: row.username, pass: decryptSecret(row.password_encrypted) } : undefined,
    fromEmail: row.from_email,
    fromName: row.from_name || '',
    replyTo: row.reply_to || '',
  };
}

export function buildTransport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
  });
}

export async function getSendTransport() {
  const cfg = await loadTransportConfig();
  return { transport: buildTransport(cfg), cfg };
}

function fromHeader(cfg) {
  return cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail}>` : cfg.fromEmail;
}

export async function testConnection() {
  const { transport } = await getSendTransport();
  try {
    await transport.verify();
    return { ok: true };
  } catch (e) {
    throw new AppError(400, 'SMTP_TEST_FAILED', `Connection failed: ${e.message}`);
  }
}

export async function sendTestEmail(to) {
  if (!EMAIL_RE.test(String(to || ''))) throw new AppError(400, 'INVALID_RECIPIENT', 'A valid recipient email is required.');
  const { transport, cfg } = await getSendTransport();
  const message = {
    from: fromHeader(cfg),
    to,
    replyTo: cfg.replyTo || undefined,
    subject: 'Test email from Asset Manager',
    text: 'This is a test email confirming your SMTP settings are working.',
  };
  try {
    const info = await transport.sendMail(message);
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    throw new AppError(400, 'SMTP_TEST_FAILED', `Send failed: ${e.message}`);
  }
}

export { fromHeader, loadTransportConfig };
