// The month-end summary: total in, total out, what's left, and the top 3 costs.

import { dayNumber, ymd, addMonths, compareMonths, parseMonthKey, monthKey } from '../maths/dates.js';
import { monthSummary } from '../maths/budget.js';

/** Shown on Home for the first week of each month. */
export const RECAP_DAYS = 7;

export function monthRecap(state, y, m) {
  const s = monthSummary(state, y, m);
  return {
    y, m, ok: s.ok,
    inCents: s.inCents, outCents: s.outCents, leftCents: s.leftCents,
    top: s.groups.slice(0, 3).map((g) => ({ name: g.name, cents: g.cents, isFolder: g.type === 'folder' })),
  };
}

export const recapId = (y, m) => `recap:${monthKey(y, m)}`;

/** Last month's recap, if it's the first week of a new month and he hasn't put it away. */
export function recapToShow(state, todayISO) {
  const { y, m, d } = ymd(dayNumber(todayISO));
  if (d > RECAP_DAYS) return null;
  const prev = addMonths(y, m, -1);
  const start = parseMonthKey(state.startMonth);
  if (!start || compareMonths(prev, start) < 0) return null;
  if (state.settings?.dismissed?.[recapId(prev.y, prev.m)]) return null;
  const recap = monthRecap(state, prev.y, prev.m);
  return recap.inCents || recap.outCents ? recap : null;
}
