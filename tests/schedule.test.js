import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, nextOccurrence } from '../js/maths/schedule.js';
import { dayNumber, isoDate, monthStartDay, monthEndDay } from '../js/maths/dates.js';

const inMonth = (entry, y, m) => occurrences(entry, monthStartDay(y, m), monthEndDay(y, m)).map(isoDate);
const e = (freq, startDate, extra = {}) => ({ freq, startDate, amountCents: 100, ...extra });

test('one-time entry counts only in its own month', () => {
  const repair = e('once', '2026-11-20');
  assert.deepEqual(inMonth(repair, 2026, 11), ['2026-11-20']);
  assert.deepEqual(inMonth(repair, 2026, 10), []);
  assert.deepEqual(inMonth(repair, 2026, 12), []);
});

test('weekly bill lands 5 times in months with 5 of that weekday', () => {
  const fridays = e('weekly', '2026-01-02'); // a Friday
  assert.deepEqual(inMonth(fridays, 2026, 1), ['2026-01-02', '2026-01-09', '2026-01-16', '2026-01-23', '2026-01-30']);
  assert.equal(inMonth(fridays, 2026, 2).length, 4);
  assert.equal(inMonth(fridays, 2026, 5).length, 5); // May 2026 has 5 Fridays
  assert.equal(inMonth(fridays, 2026, 10).length, 5);
  assert.equal(inMonth(fridays, 2026, 11).length, 4);
  // Across a whole year a weekly bill lands 52 or 53 times.
  assert.equal(occurrences(fridays, dayNumber('2026-01-01'), dayNumber('2026-12-31')).length, 52);
});

test('every-2-weeks paycheque lands 3 times in some months', () => {
  const pay = e('biweekly', '2026-01-02');
  const counts = Array.from({ length: 12 }, (_, i) => inMonth(pay, 2026, i + 1).length);
  assert.deepEqual(counts, [3, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2]);
  assert.equal(counts.reduce((a, b) => a + b, 0), 26);
  assert.deepEqual(inMonth(pay, 2026, 7), ['2026-07-03', '2026-07-17', '2026-07-31']);
});

test('weekly entries never count before their first date', () => {
  const pay = e('weekly', '2026-11-18');
  assert.deepEqual(inMonth(pay, 2026, 11), ['2026-11-18', '2026-11-25']);
  assert.deepEqual(inMonth(pay, 2026, 10), []);
});

test('monthly bill on the 31st lands on the last day of short months', () => {
  const rent = e('monthly', '2026-01-31');
  assert.deepEqual(inMonth(rent, 2026, 2), ['2026-02-28']);
  assert.deepEqual(inMonth(rent, 2026, 3), ['2026-03-31']); // goes back to the 31st
  assert.deepEqual(inMonth(rent, 2026, 4), ['2026-04-30']);
  assert.deepEqual(inMonth(rent, 2028, 2), ['2028-02-29']); // leap year
  assert.deepEqual(inMonth(rent, 2025, 12), []); // before it started
});

test('monthly bill counts exactly once every month for years', () => {
  const phone = e('monthly', '2026-01-15');
  for (let y = 2026; y <= 2030; y += 1) {
    for (let m = 1; m <= 12; m += 1) assert.equal(inMonth(phone, y, m).length, 1);
  }
});

test('yearly bill lands once a year, Feb 29 falls back to Feb 28', () => {
  const ins = e('yearly', '2028-02-29');
  assert.deepEqual(inMonth(ins, 2028, 2), ['2028-02-29']);
  assert.deepEqual(inMonth(ins, 2029, 2), ['2029-02-28']);
  assert.deepEqual(inMonth(ins, 2032, 2), ['2032-02-29']);
  assert.deepEqual(inMonth(ins, 2029, 3), []);
  const truck = e('yearly', '2026-06-10');
  assert.equal(occurrences(truck, dayNumber('2026-01-01'), dayNumber('2030-12-31')).length, 5);
});

test('fromDate and endDate trim when an entry counts', () => {
  const old = e('monthly', '2026-01-15', { endDate: '2026-10-31' });
  assert.deepEqual(inMonth(old, 2026, 10), ['2026-10-15']);
  assert.deepEqual(inMonth(old, 2026, 11), []);
  const newer = e('monthly', '2026-01-15', { fromDate: '2026-11-01' });
  assert.deepEqual(inMonth(newer, 2026, 10), []);
  assert.deepEqual(inMonth(newer, 2026, 11), ['2026-11-15']);
  // Split at a month boundary: every month still counted exactly once.
  for (let m = 1; m <= 12; m += 1) assert.equal(inMonth(old, 2026, m).length + inMonth(newer, 2026, m).length, 1);
});

test('nextOccurrence finds the next due date', () => {
  assert.equal(isoDate(nextOccurrence(e('monthly', '2026-01-20'), dayNumber('2026-11-06'))), '2026-11-20');
  assert.equal(isoDate(nextOccurrence(e('monthly', '2026-01-02'), dayNumber('2026-11-06'))), '2026-12-02');
  assert.equal(isoDate(nextOccurrence(e('biweekly', '2026-01-02'), dayNumber('2026-11-06'))), '2026-11-06');
  assert.equal(nextOccurrence(e('monthly', '2026-01-02', { endDate: '2026-10-31' }), dayNumber('2026-11-06')), null);
});
