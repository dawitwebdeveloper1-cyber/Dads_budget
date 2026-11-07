// Exporting a month or a year: every payment with its real date, plus totals,
// as a spreadsheet file (CSV) or a printable page (PDF). The totals are
// cross-checked against the app's own month totals before anything is exported.

import {
  monthStartDay, monthEndDay, isoDate, compareMonths, parseMonthKey, addMonths,
} from '../maths/dates.js';
import { occurrences } from '../maths/schedule.js';
import { FREQUENCIES } from '../maths/schedule.js';
import { matchesFilter, groupOf, monthSummary, trackingStartDay } from '../maths/budget.js';
import { centsToInput } from '../maths/money.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FILTER_WORDS = { all: 'Personal and business', personal: 'Personal only', business: 'Business only' };

/** { type: 'month', y, m } or { type: 'year', y } */
export function periodLabel(period) {
  return period.type === 'month' ? `${MONTHS[period.m - 1]} ${period.y}` : `${period.y}`;
}

export function exportFileName(period, filter, ext) {
  const when = period.type === 'month' ? `${period.y}-${String(period.m).padStart(2, '0')}` : `${period.y}`;
  const who = filter === 'all' ? '' : `-${filter}`;
  return `budget-${when}${who}.${ext}`;
}

function monthsIn(period) {
  if (period.type === 'month') return [{ y: period.y, m: period.m }];
  return Array.from({ length: 12 }, (_, i) => ({ y: period.y, m: i + 1 }));
}

/** Everything needed for an export, with totals checked against the app's month totals. */
export function buildExport(state, period, filter = 'all') {
  const months = monthsIn(period);
  const first = months[0];
  const last = months[months.length - 1];
  const startDay = trackingStartDay(state);
  const from = Math.max(monthStartDay(first.y, first.m), startDay ?? Infinity);
  const to = monthEndDay(last.y, last.m);

  const rows = [];
  if (startDay !== null && from <= to) {
    for (const entry of state.entries) {
      if (!matchesFilter(entry, filter)) continue;
      const group = groupOf(state, entry);
      for (const day of occurrences(entry, from, to)) {
        rows.push({
          date: isoDate(day),
          kind: entry.kind,
          name: entry.name,
          group: entry.kind === 'in' ? '' : group.name,
          isFolder: group.type === 'folder',
          often: FREQUENCIES[entry.freq].label,
          tag: entry.tag,
          cents: entry.amountCents,
        });
      }
    }
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'in' ? -1 : 1));

  const inCents = rows.filter((r) => r.kind === 'in').reduce((t, r) => t + r.cents, 0);
  const outCents = rows.filter((r) => r.kind === 'out').reduce((t, r) => t + r.cents, 0);
  const byGroup = new Map();
  for (const r of rows) {
    if (r.kind !== 'out') continue;
    byGroup.set(r.group, (byGroup.get(r.group) ?? 0) + r.cents);
  }

  // Cross-check: the same totals, worked out month by month by the app itself.
  const start = parseMonthKey(state.startMonth);
  let checkIn = 0;
  let checkOut = 0;
  let monthsOk = true;
  for (const mo of months) {
    if (!start || compareMonths(mo, start) < 0) continue;
    const s = monthSummary(state, mo.y, mo.m, filter);
    monthsOk = monthsOk && s.ok;
    checkIn += s.inCents;
    checkOut += s.outCents;
  }

  return {
    period, filter,
    title: `${periodLabel(period)} · ${FILTER_WORDS[filter]}`,
    rows,
    inCents, outCents, leftCents: inCents - outCents,
    byGroup: [...byGroup.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents),
    ok: monthsOk && checkIn === inCents && checkOut === outCents,
  };
}

/** A cell that's safe in a spreadsheet: quoted when needed, and never read as a formula. */
function cell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The spreadsheet file. Starts with a marker so Excel shows accents and symbols correctly. */
export function toCSV(report) {
  const lines = [
    [`Budget export: ${report.title}`],
    [],
    ['Date', 'Money in or out', 'Name', 'Category or folder', 'How often', 'Personal or business', 'Amount'],
    ...report.rows.map((r) => [
      r.date, r.kind === 'in' ? 'Money in' : 'Money out', r.name, r.group, r.often,
      r.tag === 'business' ? 'Business' : 'Personal', centsToInput(r.cents),
    ]),
    [],
    ['Total money in', '', '', '', '', '', centsToInput(report.inCents)],
    ['Total money out', '', '', '', '', '', centsToInput(report.outCents)],
    ['Left over', '', '', '', '', '', report.leftCents < 0 ? `-${centsToInput(-report.leftCents)}` : centsToInput(report.leftCents)],
  ];
  return `﻿${lines.map((l) => l.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** The months and years he can export, newest first. */
export function exportChoices(state, todayISO) {
  const start = parseMonthKey(state.startMonth);
  if (!start) return { months: [], years: [] };
  const now = { y: Number(todayISO.slice(0, 4)), m: Number(todayISO.slice(5, 7)) };
  const months = [];
  for (let mo = now; compareMonths(mo, start) >= 0; mo = addMonths(mo.y, mo.m, -1)) months.push(mo);
  const years = [...new Set(months.map((mo) => mo.y))];
  return { months, years };
}
