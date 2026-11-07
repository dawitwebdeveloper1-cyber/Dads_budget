import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yearlyCents, perPeriod, periodTable, periodsAgree, convert } from '../js/maths/periods.js';

test('weekly to monthly: $50 a week × 52 ÷ 12 = $216.67', () => {
  assert.equal(yearlyCents(5000, 'weekly'), 260000);
  assert.equal(perPeriod(260000, 'month'), 21667);
  assert.equal(convert(5000, 'weekly', 'month'), 21667);
});

test('every 2 weeks to monthly: $2,000 × 26 ÷ 12 = $4,333.33', () => {
  assert.equal(convert(200000, 'biweekly', 'month'), 433333);
  assert.equal(convert(200000, 'biweekly', 'year'), 5200000);
  assert.equal(convert(200000, 'biweekly', 'week'), 100000);
  assert.equal(convert(200000, 'biweekly', 'day'), 14247); // 52,000 ÷ 365 = 142.4657…
});

test('monthly and yearly conversions', () => {
  assert.equal(convert(150000, 'monthly', 'year'), 1800000);
  assert.equal(convert(150000, 'monthly', 'month'), 150000);
  assert.equal(convert(150000, 'monthly', 'week'), 34615); // 18,000 ÷ 52 = 346.1538…
  assert.equal(convert(150000, 'monthly', 'day'), 4932); // 18,000 ÷ 365 = 49.3150…
  assert.equal(convert(120000, 'yearly', 'month'), 10000);
  assert.equal(convert(100000, 'yearly', 'month'), 8333);
  assert.equal(convert(8500, 'monthly', 'week'), 1962); // 1,020 ÷ 52 = 19.615…
});

test('one-time and changes-each-time have no fixed yearly amount', () => {
  assert.throws(() => yearlyCents(100, 'once'));
  assert.throws(() => yearlyCents(100, 'varies'));
});

test('per day, week, month and year always agree with each other', () => {
  for (const year of [0, 1, 11, 260000, 1800000, 5200000, 9999999, 123456789]) {
    const table = periodTable(year);
    assert.equal(table.year, year);
    assert.ok(periodsAgree(table, year));
  }
  // A deliberately wrong table must be caught.
  const wrong = { ...periodTable(260000), month: 21600 };
  assert.equal(periodsAgree(wrong, 260000), false);
});
