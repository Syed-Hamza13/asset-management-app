// Small helpers shared by the services that hand-write SQL.

// Builds the "?,?,?" list for an `IN (...)` clause. The values themselves still
// go through the driver as bound parameters, so this never interpolates data.
export function inPlaceholders(values) {
  return values.map(() => '?').join(',');
}

// mysql2 returns a JSON column as a string on some drivers/versions and as an
// already-parsed value on others. Callers keep handling NULL themselves.
export function parseJsonObject(raw) {
  if (typeof raw === 'string') return JSON.parse(raw);
  return raw;
}
