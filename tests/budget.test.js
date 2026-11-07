import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthSummary, carryOver, historyMonths, upcomingBills, breakdown, normalLines, crossChecked,
} from '../js/maths/budget.js';
import { isoDate } from '../js/maths/dates.js';
import { buildState, pay, bill } from './helpers.js';

// A realistic family budget. All expected answers below were worked out by hand.
const family = () => buildState([
  pay(200000, '2026-01-02'),
  bill('Rent', 150000, 'monthly', '2026-01-01', 'cat-housing'),
  bill('Phone bill', 8500, 'monthly', '2026-01-15', 'cat-bills'),
  bill('Groceries', 15000, 'weekly', '2026-01-03', 'cat-food'), // Saturdays
  bill('Truck repair', 90000, 'once', '2026-03-10', 'cat-other'),
  bill('School fees', 30000, 'monthly', '2026-01-05', null, { folderId: 'fold-sarah' }),
  bill('Gas', 8000, 'varies', '2026-01-07', 'cat-gas'),
  bill('Gas', 7000, 'varies', '2026-01-21', 'cat-gas'),
  bill('gas ', 9000, 'varies', '2026-02-04', 'cat-gas'),
  bill('Gas', 6000, 'varies', '2026-03-03', 'cat-gas'),
  bill('Gas', 10000, 'varies', '2026-03-20', 'cat-gas'),
  bill('Gas', 7500, 'varies', '2026-04-02', 'cat-gas'),
], { folders: ['Sarah'] });

test('month totals use real dates (3 paycheques, 5 Saturdays in January)', () => {
  const jan = monthSummary(family(), 2026, 1);
  assert.equal(jan.ok, true);
  assert.equal(jan.inCents, 600000);
  assert.equal(jan.outCents, 150000 + 8500 + 5 * 15000 + 30000 + 15000);
  assert.equal(jan.outCents, 278500);
  assert.equal(jan.leftCents, 321500);
});

test('one-time costs count only in their own month', () => {
  const s = family();
  const feb = monthSummary(s, 2026, 2);
  const mar = monthSummary(s, 2026, 3);
  assert.deepEqual([feb.inCents, feb.outCents, feb.leftCents], [400000, 257500, 142500]);
  assert.deepEqual([mar.inCents, mar.outCents, mar.leftCents], [400000, 354500, 45500]);
  assert.equal(mar.groups.find((g) => g.name === 'Other').cents, 90000);
  assert.equal(feb.groups.find((g) => g.name === 'Other'), undefined);
});

test('categories and folders add up to the total spent', () => {
  const mar = monthSummary(family(), 2026, 3);
  assert.equal(mar.groups.reduce((a, g) => a + g.cents, 0), mar.outCents);
  const sarah = mar.groups.find((g) => g.type === 'folder');
  assert.equal(sarah.name, 'Sarah');
  assert.equal(sarah.cents, 30000);
  assert.equal(sarah.items[0].entry.name, 'School fees');
  // biggest first
  const cents = mar.groups.map((g) => g.cents);
  assert.deepEqual(cents, [...cents].sort((a, b) => b - a));
});

test('leftover carries over from earlier months, checked two ways', () => {
  const s = family();
  assert.deepEqual(carryOver(s, 2026, 1), { cents: 0, ok: true });
  assert.deepEqual(carryOver(s, 2026, 2), { cents: 321500, ok: true });
  assert.deepEqual(carryOver(s, 2026, 4), { cents: 321500 + 142500 + 45500, ok: true });
});

test('history lists every month from the start, newest first', () => {
  const months = historyMonths(family(), '2026-04-10');
  assert.deepEqual(months.map((m) => m.m), [4, 3, 2, 1]);
  assert.equal(months[0].leftCents, 400000 - (150000 + 8500 + 4 * 15000 + 30000 + 7500));
  assert.ok(months.every((m) => m.ok));
});

test('nothing counts before the month he started using the app', () => {
  const s = buildState([pay(200000, '2025-06-06')], { today: '2026-01-10' });
  assert.equal(s.startMonth, '2026-01');
  assert.equal(monthSummary(s, 2025, 12).inCents, 0);
  // Every 2 weeks from June 6, 2025 lands on Jan 2, 16 and 30, 2026.
  assert.equal(monthSummary(s, 2026, 1).inCents, 600000);
  assert.deepEqual(carryOver(s, 2026, 1), { cents: 0, ok: true });
});

test('upcoming bills are the next 3, soonest first', () => {
  const next = upcomingBills(family(), '2026-04-10');
  assert.deepEqual(next.map((b) => [b.entry.name, isoDate(b.day), b.daysAway]), [
    ['Groceries', '2026-04-11', 1],
    ['Phone bill', '2026-04-15', 5],
    ['Rent', '2026-05-01', 21],
  ]);
});

test('normal month: repeating bills converted, gas averaged over the last 3 full months', () => {
  const lines = normalLines(family(), '2026-04-10');
  const gas = lines.find((l) => l.name.trim().toLowerCase() === 'gas');
  assert.equal(gas.how.type, 'average');
  assert.equal(gas.how.months, 3);
  assert.equal(gas.how.totalCents, 8000 + 7000 + 9000 + 6000 + 10000);
  assert.equal(gas.yearCents, 160000);
  assert.equal(lines.some((l) => l.name === 'Truck repair'), false);
});

test('breakdown per month: biggest first, pieces add up exactly', () => {
  const b = breakdown(family(), '2026-04-10', 'month');
  assert.equal(b.ok, true);
  assert.equal(b.inCents, 433333);
  assert.equal(b.outCents, 266833);
  assert.equal(b.leftCents, 166500);
  assert.deepEqual(b.groups.map((g) => [g.name, g.cents]), [
    ['Housing', 150000], ['Food', 65000], ['Sarah', 30000], ['Gas', 13333], ['Bills', 8500],
  ]);
});

test('breakdown per day, week and year match the monthly picture', () => {
  const s = family();
  const year = breakdown(s, '2026-04-10', 'year');
  const week = breakdown(s, '2026-04-10', 'week');
  const day = breakdown(s, '2026-04-10', 'day');
  assert.equal(year.outCents, 3202000);
  assert.equal(year.inCents, 5200000);
  assert.equal(week.outCents, 61577); // 32,020 ÷ 52 = 615.769…
  assert.equal(week.inCents, 100000);
  assert.equal(day.outCents, 8773); // 32,020 ÷ 365 = 87.726…
  for (const b of [year, week, day]) {
    assert.equal(b.ok, true);
    assert.equal(b.groups.reduce((a, g) => a + g.cents, 0), b.outCents);
  }
});

test('changes-each-time uses this month so far when he only just started', () => {
  const s = buildState([
    bill('Gas', 6000, 'varies', '2026-11-02', 'cat-gas'),
    bill('Gas', 7000, 'varies', '2026-11-05', 'cat-gas'),
  ], { today: '2026-11-06' });
  const gas = normalLines(s, '2026-11-06')[0];
  assert.equal(gas.how.months, 1);
  assert.equal(gas.how.soFar, true);
  assert.equal(breakdown(s, '2026-11-06', 'month').outCents, 13000);
});

test('irregular pay is averaged too', () => {
  const s = buildState([
    pay(150000, '2026-01-09', { freq: 'varies', name: 'Load pay' }),
    pay(210000, '2026-02-13', { freq: 'varies', name: 'Load pay' }),
  ], { today: '2026-01-09' });
  const b = breakdown(s, '2026-03-05', 'month');
  assert.equal(b.inCents, 180000); // (1,500 + 2,100) ÷ 2 months
});

test('personal and business can be viewed separately or together', () => {
  const s = buildState([
    pay(200000, '2026-01-02'),
    bill('Truck insurance', 120000, 'monthly', '2026-01-10', 'cat-bills', { tag: 'business' }),
    bill('Phone bill', 8500, 'monthly', '2026-01-15', 'cat-bills'),
  ]);
  const all = monthSummary(s, 2026, 2);
  const personal = monthSummary(s, 2026, 2, 'personal');
  const business = monthSummary(s, 2026, 2, 'business');
  assert.equal(all.outCents, 128500);
  assert.equal(personal.outCents, 8500);
  assert.equal(business.outCents, 120000);
  assert.equal(personal.outCents + business.outCents, all.outCents);
  assert.equal(breakdown(s, '2026-02-01', 'month', 'business').outCents, 120000);
});

test('stopped bills drop out of the normal month but stay in history', () => {
  const s = buildState([bill('Netflix', 2000, 'monthly', '2026-01-05', 'cat-bills', { endDate: '2026-02-28' })]);
  assert.equal(monthSummary(s, 2026, 2).outCents, 2000);
  assert.equal(monthSummary(s, 2026, 3).outCents, 0);
  assert.equal(breakdown(s, '2026-03-10', 'month').outCents, 0);
});

test('an empty budget shows zeros, not errors', () => {
  const s = buildState([]);
  assert.equal(monthSummary(s, 2026, 1).leftCents, 0);
  assert.equal(breakdown(s, '2026-01-01', 'month').leftCents, 0);
  assert.deepEqual(historyMonths(s, '2026-01-01'), []);
  assert.deepEqual(upcomingBills(s, '2026-01-01'), []);
});

test('a failed cross-check is recalculated once, then reported', () => {
  let calls = 0;
  assert.equal(crossChecked(() => ({ ok: ++calls > 1 })).ok, true);
  assert.equal(calls, 2);
  calls = 0;
  assert.equal(crossChecked(() => ({ ok: false, n: ++calls })).ok, false);
  assert.equal(calls, 2);
});
