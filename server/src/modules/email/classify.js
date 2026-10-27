// Pure helpers for classifying and sanitizing delivery errors. Kept free of
// DB/transport imports so they can be unit-tested in isolation.

export function sanitize(message) {
  return String(message || 'Unknown error').replace(/pass(word)?=[^\s&]+/gi, 'pass=***').slice(0, 500);
}

export function isPermanent(err) {
  const code = String(err?.code || '').toUpperCase();
  if (['EAUTH', 'EENVELOPE', 'EINVALID', 'EMESSAGE', 'ENOAUTH'].includes(code)) return true;
  const rc = Number(err?.responseCode);
  if (rc >= 500) return true;
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('invalid recipient') || msg.includes('relay') || msg.includes('authentication')) return true;
  return false;
}
