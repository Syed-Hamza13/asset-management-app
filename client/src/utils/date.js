// The client's only date module: everything that converts between an ISO
// (YYYY-MM-DD, what the API stores) and the Indian display format
// (DD/MM/YYYY, what a user types) lives here.

// Today's date as the API wants it (ISO), evaluated in IST, not the browser's zone.
export function todayInputValue() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

// ISO (or a datetime string that starts with one) -> DD/MM/YYYY for display.
export function formatDateValue(value) {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

// DD/MM/YYYY -> ISO. '' for blank, null for anything that is not a real date.
export function indianDateToIso(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Timestamps arrive either as true UTC (with Z / offset) or as naive IST strings
// from MySQL; the suffix test is what tells the two apart.
export function formatIndiaDateTime(value) {
  if (!value) return "";
  const raw = String(value);
  const date = /[zZ]|[+-]\d{2}:\d{2}$/.test(raw)
    ? new Date(raw)
    : new Date(raw.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
