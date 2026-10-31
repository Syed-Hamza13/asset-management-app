// Dependency-free IP allowlist matcher.
//
// Accepted entry formats (one per line, or comma/semicolon separated):
//   exact        192.168.1.23          2001:db8::1
//   CIDR         192.168.1.0/24        2001:db8::/48
//   range        192.168.1.20-192.168.1.60
//   wildcard     192.168.1.*           10.20.*
//
// Every valid entry is normalised to {family, start, end} so matching is a
// single BigInt range test.

export const MAX_ENTRIES = 200;

const V4_BITS = 32n;
const V6_BITS = 128n;
const V4_MAX = (1n << V4_BITS) - 1n;
const V6_MAX = (1n << V6_BITS) - 1n;

function normalize(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.trim();
  if (text.startsWith('[') && text.includes(']')) text = text.slice(1, text.indexOf(']'));
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  return text.trim();
}

function parseIpv4(text) {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return { family: 4, value };
}

// ::ffff:192.0.2.1 and ::192.0.2.1 are IPv4 addresses carried in IPv6 form.
function unwrapMapped(text) {
  const lower = text.toLowerCase();
  const head = '::ffff:';
  const plain = '::';
  const prefix = lower.startsWith(head) ? head : lower.startsWith(plain) ? plain : null;
  if (!prefix) return null;
  const tail = text.slice(prefix.length);
  if (!tail.includes('.')) return null;
  const v4 = parseIpv4(tail);
  if (!v4) return null;
  if (prefix === plain) return v4;
  const value = (0xffffn << V4_BITS) | v4.value;
  return { family: 6, value, mappedFrom: v4.value };
}

function parseIpv6(text) {
  if (!text.includes(':')) return null;
  let body = text;

  // Expand a trailing embedded IPv4 into two hextets.
  const lastColon = body.lastIndexOf(':');
  const tail = body.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    const hi = (v4.value >> 16n) & 0xffffn;
    const lo = v4.value & 0xffffn;
    body = `${body.slice(0, lastColon + 1)}${hi.toString(16)}:${lo.toString(16)}`;
  }

  const double = body.indexOf('::');
  if (double !== -1 && body.indexOf('::', double + 1) !== -1) return null;

  const hextet = /^[\da-f]{1,4}$/i;
  let headParts;
  let tailParts;
  if (double === -1) {
    headParts = body.split(':');
    tailParts = [];
    if (headParts.length !== 8) return null;
  } else {
    headParts = body.slice(0, double).split(':').filter((p) => p !== '');
    tailParts = body.slice(double + 2).split(':').filter((p) => p !== '');
    if (headParts.length + tailParts.length > 8) return null;
  }
  for (const part of [...headParts, ...tailParts]) {
    if (!hextet.test(part)) return null;
  }

  let value = 0n;
  for (const part of headParts) value = (value << 16n) | BigInt(parseInt(part, 16));
  if (double !== -1) {
    const gap = 8 - (headParts.length + tailParts.length);
    for (let i = 0; i < gap; i += 1) value <<= 16n;
  }
  for (const part of tailParts) value = (value << 16n) | BigInt(parseInt(part, 16));
  return { family: 6, value };
}

export function parseIp(raw) {
  const text = normalize(raw);
  if (!text) return null;
  return parseIpv4(text) ?? unwrapMapped(text) ?? parseIpv6(text);
}

function masked(raw, message) {
  return { raw, valid: false, error: message };
}

function fromCidr(raw, text) {
  const slash = text.lastIndexOf('/');
  const ipText = text.slice(0, slash);
  const bitsText = text.slice(slash + 1);
  const ip = parseIp(ipText);
  if (!ip) return masked(raw, 'Not a valid IP address.');
  if (!/^\d{1,3}$/.test(bitsText)) return masked(raw, 'Prefix length must be a number.');
  const max = ip.family === 4 ? 32 : 128;
  const bits = Number(bitsText);
  if (bits > max) return masked(raw, `Prefix length must be between 0 and ${max}.`);
  const width = BigInt(ip.family === 4 ? 32 : 128);
  const maskBits = width - BigInt(bits);
  const mask = maskBits === 0n ? 0n : ~((1n << maskBits) - 1n) & (ip.family === 4 ? V4_MAX : V6_MAX);
  const start = ip.value & mask;
  const end = start | (~mask & (ip.family === 4 ? V4_MAX : V6_MAX));
  return { raw, valid: true, kind: 'cidr', family: ip.family, start, end, bits };
}

function fromRange(raw, text) {
  const dash = text.indexOf('-');
  const from = parseIp(text.slice(0, dash));
  const to = parseIp(text.slice(dash + 1));
  if (!from) return masked(raw, 'Not a valid IP address.');
  if (!to) return masked(raw, 'Not a valid IP address.');
  if (from.family !== to.family) return masked(raw, 'Range start and end must both be IPv4 or both be IPv6.');
  if (from.value > to.value) return masked(raw, 'Range start must be lower than range end.');
  return { raw, valid: true, kind: 'range', family: from.family, start: from.value, end: to.value };
}

// 192.168.1.* -> 192.168.1.0/24. Wildcards must be whole trailing octets.
function fromWildcard(raw, text) {
  const parts = text.split('.');
  if (parts.length > 4) return masked(raw, 'Not a valid IPv4 wildcard.');
  let starsFrom = parts.length;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i] === '*') starsFrom = i;
    else break;
  }
  if (starsFrom >= parts.length) return masked(raw, 'Not a valid IPv4 wildcard.');
  for (let i = starsFrom; i < parts.length; i += 1) {
    if (parts[i] !== '*') return masked(raw, 'A wildcard must replace whole trailing octets, e.g. 192.168.1.*');
  }
  const octets = parts.slice(0, starsFrom);
  if (octets.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return masked(raw, 'Not a valid IPv4 wildcard.');
  if (octets.length === 0) return { raw, valid: true, kind: 'wildcard', family: 4, start: 0n, end: V4_MAX };
  let value = 0n;
  for (const p of octets) value = (value << 8n) | BigInt(Number(p));
  const hostBits = BigInt(4 - octets.length) * 8n;
  const size = 1n << hostBits;
  const start = value << hostBits;
  return { raw, valid: true, kind: 'wildcard', family: 4, start, end: start + size - 1n };
}

function fromExact(raw, text) {
  const ip = parseIp(text);
  if (!ip) return masked(raw, 'Not a valid IP address, CIDR block, range or wildcard.');
  // Treat an IPv4-mapped IPv6 write-up as an IPv4 entry so it can match the
  // socket address Node reports for IPv4 connections.
  const value = ip.mappedFrom ?? ip.value;
  const family = ip.mappedFrom ? 4 : ip.family;
  const max = family === 4 ? V4_MAX : V6_MAX;
  return { raw, valid: true, kind: 'ip', family, start: value, end: value & max };
}

export function parseEntry(rawInput) {
  const raw = String(rawInput ?? '').trim();
  if (!raw) return null;
  if (raw.includes('/')) return fromCidr(raw, raw);
  if (raw.includes('-')) return fromRange(raw, raw);
  if (raw.includes('*')) return fromWildcard(raw, raw.replace(/\s+/g, ''));
  return fromExact(raw, raw);
}

export function parseIpList(text) {
  const rawTokens = String(text ?? '')
    .split(/[\n,;]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const entries = [];
  const invalid = [];
  for (const token of rawTokens) {
    if (entries.length + invalid.length >= MAX_ENTRIES) {
      invalid.push({ raw: token, error: `Too many entries (limit ${MAX_ENTRIES}).` });
      continue;
    }
    const parsed = parseEntry(token);
    if (!parsed) continue;
    if (parsed.valid) entries.push(parsed);
    else invalid.push({ raw: parsed.raw, error: parsed.error });
  }
  return { entries, invalid, total: rawTokens.length };
}

export function ipMatchesEntry(ip, entry) {
  if (ip == null || entry == null || !entry.valid) return false;
  if (ip.family !== entry.family) return false;
  return ip.value >= entry.start && ip.value <= entry.end;
}

export function isIpInList(rawIp, entries) {
  const ip = typeof rawIp === 'object' && rawIp !== null ? rawIp : parseIp(rawIp);
  if (!ip) return false;
  const value = ip.mappedFrom ? { family: 4, value: ip.mappedFrom } : ip;
  return (entries ?? []).some((entry) => ipMatchesEntry(value, entry));
}

export function describeEntry(entry) {
  return `${entry.raw} (${entry.kind === 'ip' ? 'single address' : entry.kind}, IPv${entry.family})`;
}
