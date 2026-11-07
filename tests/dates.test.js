import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLeapYear, daysInMonth, parseDate, dayNumber, isoDate, addMonths, monthKey, compareMonths,
  todayISO, weekday, monthEndDay, monthStartDay,
} from '../js/maths/dates.js';

test('leap years', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2026), false);
  assert.equal(isLeapYear(2028), true);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(2100), false);
});

test('days in each month', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2026, m)),
    [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(monthEndDay(2028, 2) - monthStartDay(2028, 2) + 1, 29);
});

test('parseDate refuses impossible dates', () => {
  assert.deepEqual(parseDate('2026-11-06'), { y: 2026, m: 11, d: 6 });
  for (const bad of ['2026-02-29', '2026-13-01', '2026-04-31', '2026-1-1', 'hello', '', '2026-00-10']) {
    assert.equal(parseDate(bad), null, bad);
  }
  assert.deepEqual(parseDate('2028-02-29'), { y: 2028, m: 2, d: 29 });
});

test('day numbers step one day at a time across months, years and clock changes', () => {
  assert.equal(dayNumber('1970-01-01'), 0);
  assert.equal(dayNumber('2026-03-01') - dayNumber('2026-02-28'), 1);
  assert.equal(dayNumber('2028-03-01') - dayNumber('2028-02-28'), 2);
  assert.equal(dayNumber('2027-01-01') - dayNumber('2026-12-31'), 1);
  assert.equal(dayNumber('2026-03-09') - dayNumber('2026-03-08'), 1); // clocks change in Canada
  assert.equal(dayNumber('2026-11-02') - dayNumber('2026-11-01'), 1);
  for (let d = dayNumber('2023-12-25'); d < dayNumber('2029-01-05'); d += 1) {
    assert.equal(dayNumber(isoDate(d)), d);
  }
});

test('weekday', () => {
  assert.equal(weekday(dayNumber('2026-11-06')), 5); // a Friday
  assert.equal(weekday(dayNumber('2026-01-01')), 4); // a Thursday
});

test('addMonths and month keys', () => {
  assert.deepEqual(addMonths(2026, 11, 1), { y: 2026, m: 12 });
  assert.deepEqual(addMonths(2026, 12, 1), { y: 2027, m: 1 });
  assert.deepEqual(addMonths(2026, 1, -1), { y: 2025, m: 12 });
  assert.deepEqual(addMonths(2026, 3, -14), { y: 2025, m: 1 });
  assert.equal(monthKey(2026, 3), '2026-03');
  assert.ok(compareMonths({ y: 2026, m: 1 }, { y: 2025, m: 12 }) > 0);
});

test('todayISO uses the phone\'s own calendar day', () => {
  assert.equal(todayISO(new Date(2026, 10, 6, 23, 59)), '2026-11-06');
  assert.equal(todayISO(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});
