// All the totals the screens show. Every total is worked out more than one way
// and the answers compared. If they ever disagree we recalculate once, and if
// they still disagree the result is marked ok: false so the screen shows a
// warning instead of a number that might be wrong.

import {
  dayNumber, ymd, monthStartDay, monthEndDay, addMonths, compareMonths, parseMonthKey, isoDate,
} from './dates.js';
import { FREQUENCIES, occurrences, activeRange } from './schedule.js';
import { sum, roundDiv, allocateToTotal } from './money.js';
import { PERIODS, periodTable, periodsAgree, yearlyCents } from './periods.js';

export const OTHER_CATEGORY_ID = 'cat-other';

export function normalizeName(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function matchesFilter(entry, filter = 'all') {
  return filter === 'all' || entry.tag === filter;
}

/** Which category or folder an entry is shown under. */
export function groupOf(state, entry) {
  if (entry.kind === 'in') return { key: 'in', type: 'income', id: null, name: 'Money in' };
  if (entry.folderId) {
    const folder = state.folders.find((f) => f.id === entry.folderId);
    if (folder) return { key: `f:${folder.id}`, type: 'folder', id: folder.id, name: folder.name };
  }
  const cat = state.categories.find((c) => c.id === entry.categoryId)
    ?? state.categories.find((c) => c.id === OTHER_CATEGORY_ID)
    ?? { id: OTHER_CATEGORY_ID, name: 'Other' };
  return { key: `c:${cat.id}`, type: 'category', id: cat.id, name: cat.name };
}

/** The first day the app counts anything (the 1st of the month he started). */
export function trackingStartDay(state) {
  const start = parseMonthKey(state.startMonth);
  return start ? monthStartDay(start.y, start.m) : null;
}

/** Run a calculation; if its own cross-checks fail, run it once more. */
export function crossChecked(compute) {
  const first = compute();
  if (first.ok) return first;
  return compute();
}

const allEqual = (values) => values.every((v) => v === values[0]);

// ---------------------------------------------------------------- one month

/** What really happened in one calendar month, using real dates. */
export function monthSummary(state, y, m, filter = 'all') {
  return crossChecked(() => computeMonth(state, y, m, filter));
}

function computeMonth(state, y, m, filter) {
  const startDay = trackingStartDay(state);
  const to = monthEndDay(y, m);
  const from = Math.max(monthStartDay(y, m), startDay ?? Infinity);
  const items = [];
  if (startDay !== null && from <= to) {
    for (const entry of state.entries) {
      if (!matchesFilter(entry, filter)) continue;
      const dates = occurrences(entry, from, to);
      if (dates.length) items.push({ entry, dates, cents: entry.amountCents * dates.length });
    }
  }

  // Way 1: entry by entry.
  const inCents = sum(items.filter((i) => i.entry.kind === 'in').map((i) => i.cents));
  const outCents = sum(items.filter((i) => i.entry.kind === 'out').map((i) => i.cents));

  // Way 2: category and folder totals.
  const byKey = new Map();
  for (const item of items) {
    const group = groupOf(state, item.entry);
    if (!byKey.has(group.key)) byKey.set(group.key, { ...group, cents: 0, items: [] });
    const g = byKey.get(group.key);
    g.cents += item.cents;
    g.items.push(item);
  }
  const income = byKey.get('in') ?? { key: 'in', type: 'income', name: 'Money in', cents: 0, items: [] };
  byKey.delete('in');
  const groups = [...byKey.values()];
  const inByGroup = income.cents;
  const outByGroup = sum(groups.map((g) => g.cents));

  // Way 3: payment by payment.
  let inByPayment = 0;
  let outByPayment = 0;
  for (const item of items) {
    for (let k = 0; k < item.dates.length; k += 1) {
      if (item.entry.kind === 'in') inByPayment += item.entry.amountCents;
      else outByPayment += item.entry.amountCents;
    }
  }

  const ok = allEqual([inCents, inByGroup, inByPayment]) && allEqual([outCents, outByGroup, outByPayment]);

  for (const g of [income, ...groups]) g.items.sort((a, b) => b.cents - a.cents);
  groups.sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));

  return {
    y, m, ok,
    inCents, outCents, leftCents: inCents - outCents,
    income, groups, items,
  };
}

// ---------------------------------------------------------------- carry-over

/** Money left over from every earlier month, added up. */
export function carryOver(state, y, m, filter = 'all') {
  return crossChecked(() => computeCarry(state, y, m, filter));
}

function computeCarry(state, y, m, filter) {
  const start = parseMonthKey(state.startMonth);
  if (!start || compareMonths({ y, m }, start) <= 0) return { cents: 0, ok: true };

  // Way 1: add up each earlier month's leftover.
  let byMonth = 0;
  let monthsOk = true;
  for (let mo = start; compareMonths(mo, { y, m }) < 0; mo = addMonths(mo.y, mo.m, 1)) {
    const s = monthSummary(state, mo.y, mo.m, filter);
    monthsOk = monthsOk && s.ok;
    byMonth += s.leftCents;
  }

  // Way 2: every payment from the start day up to the end of last month, in one go.
  const from = monthStartDay(start.y, start.m);
  const to = monthStartDay(y, m) - 1;
  let direct = 0;
  for (const entry of state.entries) {
    if (!matchesFilter(entry, filter)) continue;
    const n = occurrences(entry, from, to).length;
    direct += (entry.kind === 'in' ? 1 : -1) * entry.amountCents * n;
  }

  return { cents: byMonth, ok: monthsOk && byMonth === direct };
}

// ---------------------------------------------------------------- history

/** Every month from when he started up to this month, newest first. */
export function historyMonths(state, todayISO, filter = 'all') {
  const start = parseMonthKey(state.startMonth);
  if (!start) return [];
  const now = ymd(dayNumber(todayISO));
  const months = [];
  for (let mo = start; compareMonths(mo, now) <= 0; mo = addMonths(mo.y, mo.m, 1)) {
    months.push(monthSummary(state, mo.y, mo.m, filter));
  }
  return months.reverse();
}

/** Money out per category or folder between two days (inclusive), by real dates. */
export function spendingBetween(state, from, to, filter = 'all') {
  const totals = new Map();
  const start = trackingStartDay(state);
  if (start === null) return totals;
  const lo = Math.max(from, start);
  if (lo > to) return totals;
  for (const entry of state.entries) {
    if (entry.kind !== 'out' || !matchesFilter(entry, filter)) continue;
    const n = occurrences(entry, lo, to).length;
    if (!n) continue;
    const group = groupOf(state, entry);
    const t = totals.get(group.key) ?? { group, cents: 0 };
    t.cents += entry.amountCents * n;
    totals.set(group.key, t);
  }
  return totals;
}

// ---------------------------------------------------------------- upcoming bills

/**
 * The next few repeating bills from today on, soonest first. A bill he has
 * already ticked as paid is skipped, so its next due date shows instead.
 */
export function upcomingBills(state, todayISO, count = 3) {
  const today = dayNumber(todayISO);
  const from = Math.max(today, trackingStartDay(state) ?? today);
  const paid = state.paid ?? {};
  const found = [];
  for (const entry of state.entries) {
    if (entry.kind !== 'out' || !FREQUENCIES[entry.freq].recurring) continue;
    const day = occurrences(entry, from, from + 800).find((d) => !paid[`${entry.id}|${isoDate(d)}`]);
    if (day !== undefined) found.push({ entry, day, iso: isoDate(day), daysAway: day - today });
  }
  found.sort((a, b) => a.day - b.day || b.entry.amountCents - a.entry.amountCents);
  return found.slice(0, count);
}

// ---------------------------------------------------------------- normal picture

/**
 * The "normal month" lines: every repeating entry that is still going, plus an
 * average for each thing that changes each time (like gas or variable pay).
 * One-time entries are left out on purpose.
 * Averages use up to the last 3 full months (never before he started).
 * If he only started this month, it uses this month so far.
 */
export function normalLines(state, todayISO, filter = 'all') {
  const today = dayNumber(todayISO);
  const now = ymd(today);
  const thisMonth = { y: now.y, m: now.m };
  const start = parseMonthKey(state.startMonth) ?? thisMonth;
  const lines = [];

  for (const entry of state.entries) {
    if (!matchesFilter(entry, filter) || !FREQUENCIES[entry.freq].recurring) continue;
    if (activeRange(entry).hi < today) continue; // stopped already
    lines.push({
      kind: entry.kind,
      group: groupOf(state, entry),
      name: entry.name,
      yearCents: yearlyCents(entry.amountCents, entry.freq),
      how: { type: 'repeating', amountCents: entry.amountCents, freq: entry.freq },
      entries: [entry],
    });
  }

  const varying = new Map();
  for (const entry of state.entries) {
    if (!matchesFilter(entry, filter) || entry.freq !== 'varies') continue;
    const group = groupOf(state, entry);
    const key = `${entry.kind}|${group.key}|${normalizeName(entry.name)}`;
    if (!varying.has(key)) varying.set(key, { group, entries: [] });
    varying.get(key).entries.push(entry);
  }

  for (const { group, entries } of varying.values()) {
    entries.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
    const firstDay = dayNumber(entries[0].startDate);
    const first = ymd(firstDay);
    let windowStart = { y: first.y, m: first.m };
    if (compareMonths(windowStart, start) < 0) windowStart = start;
    let windowEnd;
    if (compareMonths(windowStart, thisMonth) >= 0) {
      windowStart = thisMonth;
      windowEnd = thisMonth;
    } else {
      windowEnd = addMonths(thisMonth.y, thisMonth.m, -1);
      const threeBack = addMonths(thisMonth.y, thisMonth.m, -3);
      if (compareMonths(windowStart, threeBack) < 0) windowStart = threeBack;
    }
    const months = compareMonths(windowEnd, windowStart) + 1; // 1, 2 or 3
    const from = monthStartDay(windowStart.y, windowStart.m);
    const to = monthEndDay(windowEnd.y, windowEnd.m);
    const counted = entries.filter((e) => {
      const d = dayNumber(e.startDate);
      return d >= from && d <= to;
    });
    const totalCents = sum(counted.map((e) => e.amountCents));
    if (totalCents === 0) continue;
    // 12 ÷ months is a whole number for 1, 2 or 3 months, so this stays exact.
    const yearCents = (totalCents * 12) / months;
    lines.push({
      kind: entries[0].kind,
      group,
      name: entries[entries.length - 1].name,
      yearCents,
      how: { type: 'average', totalCents, months, count: counted.length, windowStart, windowEnd, soFar: months === 1 && compareMonths(windowStart, thisMonth) === 0 },
      entries,
    });
  }
  return lines;
}

/** The usual money in and out for one period (day, week, month or year). */
export function breakdown(state, todayISO, period = 'month', filter = 'all') {
  return crossChecked(() => computeBreakdown(state, todayISO, period, filter));
}

function shareOut(lines, den, total) {
  const shown = allocateToTotal(lines.map((l) => l.yearCents), den, total);
  return lines.map((l, i) => ({ ...l, cents: shown[i] }));
}

function computeBreakdown(state, todayISO, period, filter) {
  const den = PERIODS[period].perYear;
  const lines = normalLines(state, todayISO, filter);
  const inLines = lines.filter((l) => l.kind === 'in').sort((a, b) => b.yearCents - a.yearCents);
  const outLines = lines.filter((l) => l.kind === 'out');

  // Way 1: add up every line.
  const inYear = sum(inLines.map((l) => l.yearCents));
  const outYear = sum(outLines.map((l) => l.yearCents));

  // Way 2: add up the category and folder totals.
  const byKey = new Map();
  for (const line of outLines) {
    if (!byKey.has(line.group.key)) byKey.set(line.group.key, { ...line.group, yearCents: 0, lines: [] });
    const g = byKey.get(line.group.key);
    g.yearCents += line.yearCents;
    g.lines.push(line);
  }
  const groupList = [...byKey.values()].sort((a, b) => b.yearCents - a.yearCents || a.name.localeCompare(b.name));
  const outByGroup = sum(groupList.map((g) => g.yearCents));

  // Round for display so the pieces always add up exactly to the totals shown.
  const inCents = roundDiv(inYear, den);
  const outCents = roundDiv(outYear, den);
  const groupShown = allocateToTotal(groupList.map((g) => g.yearCents), den, outCents);
  const groups = groupList.map((g, i) => ({
    ...g,
    cents: groupShown[i],
    lines: shareOut(g.lines.sort((a, b) => b.yearCents - a.yearCents), den, groupShown[i]),
  }));
  const income = shareOut(inLines, den, inCents);

  // Every figure shown must be within one cent of its exact value.
  const close = (shown, exact) => Math.abs(shown * den - exact) < den;
  const shownOk = groups.every((g) => close(g.cents, g.yearCents) && g.lines.every((l) => close(l.cents, l.yearCents)))
    && income.every((l) => close(l.cents, l.yearCents));

  // Per day, week, month and year must all describe the same money.
  const inTable = periodTable(inYear);
  const outTable = periodTable(outYear);
  const periodsOk = periodsAgree(inTable, inYear) && periodsAgree(outTable, outYear)
    && inTable[period] === inCents && outTable[period] === outCents;

  const ok = outYear === outByGroup
    && sum(groups.map((g) => g.cents)) === outCents
    && sum(income.map((l) => l.cents)) === inCents
    && groups.every((g) => sum(g.lines.map((l) => l.cents)) === g.cents)
    && shownOk && periodsOk;

  return {
    period, den, ok,
    inYear, outYear,
    inCents, outCents, leftCents: inCents - outCents,
    income, groups,
    inTable, outTable,
  };
}
