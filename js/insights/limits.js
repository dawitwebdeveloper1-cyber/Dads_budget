// Spending limits: how much of each monthly limit has been used so far.

import { dayNumber, ymd, monthStartDay, daysInMonth } from '../maths/dates.js';
import { spendingBetween } from '../maths/budget.js';

/** The name of a category ("c:id") or folder ("f:id"), or null if it's gone. */
export function groupName(state, key) {
  if (key.startsWith('c:')) return state.categories.find((c) => c.id === key.slice(2))?.name ?? null;
  if (key.startsWith('f:')) return state.folders.find((f) => f.id === key.slice(2))?.name ?? null;
  return null;
}

/**
 * Every limit with what's been spent so far this month (up to today, by real dates).
 * percent is rounded down, so "80%" never shows before he has really used 80%.
 */
export function limitStatus(state, todayISO) {
  const today = dayNumber(todayISO);
  const { y, m, d } = ymd(today);
  const spent = spendingBetween(state, monthStartDay(y, m), today);
  const daysLeft = daysInMonth(y, m) - d;
  return Object.entries(state.limits ?? {})
    .map(([key, limitCents]) => {
      const name = groupName(state, key);
      const usedCents = spent.get(key)?.cents ?? 0;
      return {
        key, name, isFolder: key.startsWith('f:'),
        limitCents, usedCents,
        leftCents: limitCents - usedCents,
        percent: Math.floor((usedCents * 100) / limitCents),
        daysLeft,
      };
    })
    .filter((l) => l.name !== null)
    .sort((a, b) => b.percent - a.percent);
}
