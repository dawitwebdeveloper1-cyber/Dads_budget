// Works out the exact dates an entry lands on.
// Weekly and every-2-weeks entries step forward 7 or 14 days from their first
// date, so they land 5 (or 3) times in some months, just like real life.
// Monthly entries land on the same day each month; if that day doesn't exist
// (say the 31st in April), they land on the last day of that month instead.

import { dayNumber, dayFromYMD, ymd, daysInMonth, addMonths, compareMonths } from './dates.js';

export const FREQUENCIES = {
  once: { label: 'Just once', short: 'one time', recurring: false, perYear: 0 },
  varies: { label: 'Changes each time', short: 'changes each time', recurring: false, perYear: 0 },
  weekly: { label: 'Every week', short: 'weekly', recurring: true, perYear: 52, stepDays: 7 },
  biweekly: { label: 'Every 2 weeks', short: 'every 2 weeks', recurring: true, perYear: 26, stepDays: 14 },
  monthly: { label: 'Every month', short: 'monthly', recurring: true, perYear: 12 },
  yearly: { label: 'Every year', short: 'yearly', recurring: true, perYear: 1 },
};

export const FREQUENCY_ORDER = ['once', 'varies', 'weekly', 'biweekly', 'monthly', 'yearly'];

export function isRecurring(freq) {
  const f = FREQUENCIES[freq];
  if (!f) throw new Error(`Unknown frequency: ${freq}`);
  return f.recurring;
}

/** The first and last day this entry can count on (fromDate/endDate trim it). */
export function activeRange(entry) {
  let lo = dayNumber(entry.startDate);
  if (entry.fromDate) lo = Math.max(lo, dayNumber(entry.fromDate));
  const hi = entry.endDate ? dayNumber(entry.endDate) : Infinity;
  return { lo, hi };
}

/** Every day number in [from, to] (inclusive) that this entry lands on, in order. */
export function occurrences(entry, from, to) {
  const f = FREQUENCIES[entry.freq];
  if (!f) throw new Error(`Unknown frequency: ${entry.freq}`);
  const start = dayNumber(entry.startDate);
  const range = activeRange(entry);
  const lo = Math.max(from, range.lo);
  const hi = Math.min(to, range.hi);
  if (lo > hi) return [];
  if (!Number.isFinite(hi)) throw new Error('occurrences() needs an end day');

  if (!f.recurring) return start >= lo && start <= hi ? [start] : [];

  const out = [];
  if (f.stepDays) {
    const k0 = Math.max(0, Math.ceil((lo - start) / f.stepDays));
    for (let d = start + k0 * f.stepDays; d <= hi; d += f.stepDays) out.push(d);
    return out;
  }

  const anchor = ymd(start);
  if (entry.freq === 'monthly') {
    const first = ymd(lo);
    const last = ymd(hi);
    for (let mo = { y: first.y, m: first.m }; compareMonths(mo, last) <= 0; mo = addMonths(mo.y, mo.m, 1)) {
      const d = dayFromYMD(mo.y, mo.m, Math.min(anchor.d, daysInMonth(mo.y, mo.m)));
      if (d >= lo && d <= hi) out.push(d);
    }
    return out;
  }

  // yearly
  const firstYear = ymd(lo).y;
  const lastYear = ymd(hi).y;
  for (let y = firstYear; y <= lastYear; y += 1) {
    const d = dayFromYMD(y, anchor.m, Math.min(anchor.d, daysInMonth(y, anchor.m)));
    if (d >= lo && d <= hi) out.push(d);
  }
  return out;
}

/** The next day (on or after `from`) this entry lands on, or null if none within ~2 years. */
export function nextOccurrence(entry, from) {
  const found = occurrences(entry, from, from + 800);
  return found.length ? found[0] : null;
}
