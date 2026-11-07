// Turns amounts into per day, per week, per month and per year.
// Everything starts from an exact yearly amount in whole cents:
//   weekly  × 52, every 2 weeks × 26, monthly × 12, yearly × 1.
// Then the yearly amount is divided by 365, 52, 12 or 1 and rounded once.
// Example: $50 a week × 52 = $2,600 a year ÷ 12 = $216.67 a month.

import { roundDiv } from './money.js';
import { FREQUENCIES } from './schedule.js';

export const PERIODS = {
  day: { label: 'Day', perYear: 365, word: 'day', plural: 'days' },
  week: { label: 'Week', perYear: 52, word: 'week', plural: 'weeks' },
  month: { label: 'Month', perYear: 12, word: 'month', plural: 'months' },
  year: { label: 'Year', perYear: 1, word: 'year', plural: 'years' },
};

export const PERIOD_ORDER = ['day', 'week', 'month', 'year'];

/** Exact yearly cents for a repeating amount. */
export function yearlyCents(amountCents, freq) {
  const f = FREQUENCIES[freq];
  if (!f || !f.recurring) throw new Error(`Not a repeating frequency: ${freq}`);
  const result = amountCents * f.perYear;
  if (!Number.isSafeInteger(result)) throw new Error('Amount too big');
  return result;
}

/** Yearly cents shown for one period, rounded to the nearest cent. */
export function perPeriod(yearCents, period) {
  const p = PERIODS[period];
  if (!p) throw new Error(`Unknown period: ${period}`);
  return roundDiv(yearCents, p.perYear);
}

/** The same yearly amount shown four ways. */
export function periodTable(yearCents) {
  const table = {};
  for (const key of PERIOD_ORDER) table[key] = perPeriod(yearCents, key);
  return table;
}

/**
 * Cross-check: worked back the other way, each per-period figure must land
 * within half a cent (per period) of the same yearly amount. That proves the
 * day, week, month and year figures all describe the same money.
 */
export function periodsAgree(table, yearCents) {
  return PERIOD_ORDER.every((key) => {
    const n = PERIODS[key].perYear;
    return 2 * Math.abs(table[key] * n - yearCents) <= n;
  });
}

/** Convert an amount straight from its own frequency to a period, rounded once. */
export function convert(amountCents, freq, period) {
  return roundDiv(amountCents * FREQUENCIES[freq].perYear, PERIODS[period].perYear);
}
