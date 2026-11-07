// Quick-add: things he enters again and again (like gas) become one-tap
// buttons at the top of the add form. Worked out automatically, nothing to set up.

import { dayNumber } from '../maths/dates.js';
import { normalizeName } from '../maths/budget.js';

export const FAVOURITE_DAYS = 90;
export const FAVOURITE_MIN_TIMES = 2;

/** Up to `max` favourites, most used first, each with the amount he used last time. */
export function favourites(state, todayISO, max = 4) {
  const today = dayNumber(todayISO);
  const groups = new Map();
  for (const e of state.entries) {
    if (e.freq !== 'once' && e.freq !== 'varies') continue;
    const day = dayNumber(e.startDate);
    if (day > today || today - day > FAVOURITE_DAYS) continue;
    const where = e.kind === 'out' ? (e.folderId ? `f:${e.folderId}` : `c:${e.categoryId}`) : '';
    const key = `${e.kind}|${where}|${normalizeName(e.name)}`;
    const g = groups.get(key) ?? { count: 0, latest: null };
    g.count += 1;
    if (!g.latest || e.startDate >= g.latest.startDate) g.latest = e;
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.count >= FAVOURITE_MIN_TIMES)
    .sort((a, b) => b.count - a.count || (a.latest.startDate < b.latest.startDate ? 1 : -1))
    .slice(0, max)
    .map(({ count, latest: e }) => ({
      kind: e.kind,
      name: e.name,
      where: e.kind === 'out' ? (e.folderId ? `f:${e.folderId}` : `c:${e.categoryId}`) : '',
      freq: e.freq,
      tag: e.tag,
      amountCents: e.amountCents,
      count,
    }));
}
