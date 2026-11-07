// Calendar maths on plain dates, with no clock times and no time zones.
// Dates are stored as text like "2026-11-06". For maths we turn them into a
// "day number": the count of days since 1970-01-01. Adding 7 to a day number
// is always exactly one week later, whatever the month, leap year or clock change.

const MS_PER_DAY = 86400000;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y, m) {
  if (m === 2 && isLeapYear(y)) return 29;
  return DAYS_IN_MONTH[m - 1];
}

export function parseDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function isValidDate(iso) {
  return parseDate(iso) !== null;
}

export function dayFromYMD(y, m, d) {
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function dayNumber(iso) {
  const p = parseDate(iso);
  if (!p) throw new Error(`Not a valid date: ${iso}`);
  return dayFromYMD(p.y, p.m, p.d);
}

export function ymd(day) {
  const dt = new Date(day * MS_PER_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function isoFromYMD(y, m, d) {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function isoDate(day) {
  const { y, m, d } = ymd(day);
  return isoFromYMD(y, m, d);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(day) {
  return new Date(day * MS_PER_DAY).getUTCDay();
}

export function monthStartDay(y, m) {
  return dayFromYMD(y, m, 1);
}

export function monthEndDay(y, m) {
  return dayFromYMD(y, m, daysInMonth(y, m));
}

/** Move k months forward (or back if k is negative). */
export function addMonths(y, m, k) {
  const total = y * 12 + (m - 1) + k;
  return { y: Math.floor(total / 12), m: (((total % 12) + 12) % 12) + 1 };
}

export function monthKey(y, m) {
  return `${pad(y, 4)}-${pad(m)}`;
}

export function parseMonthKey(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) return null;
  return { y, m };
}

/** Compare two {y, m} months: negative if a is earlier. */
export function compareMonths(a, b) {
  return (a.y * 12 + a.m) - (b.y * 12 + b.m);
}

/** Today's date on the phone's own calendar, as "YYYY-MM-DD". */
export function todayISO(now = new Date()) {
  return isoFromYMD(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
