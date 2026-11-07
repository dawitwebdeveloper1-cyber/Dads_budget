import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmount, formatCents, centsToInput, roundDiv, allocateToTotal, sum, MAX_CENTS,
} from '../js/maths/money.js';

test('parseAmount accepts normal ways of typing money', () => {
  const cases = {
    '85': 8500, '85.5': 8550, '85.50': 8550, '85.': 8500, '.5': 50, '0.01': 1,
    '$1,200': 120000, '1,200.50': 120050, '$ 1200': 120000, ' 42 ': 4200,
    '1,234,567.89': 123456789, '007': 700, '10000000': MAX_CENTS,
  };
  for (const [typed, cents] of Object.entries(cases)) {
    assert.deepEqual(parseAmount(typed), { ok: true, cents }, typed);
  }
});

test('parseAmount refuses blanks, letters, negatives, zero and bad cents', () => {
  for (const bad of ['', '   ', null, undefined, 'abc', '12a', '1.2.3', '-5', '$-5', '- 5', '0', '0.00',
    '1.234', '1,20', '12,00.00', '1e5', 'Infinity', 'NaN', '10000000.01', '999999999', '$', '.']) {
    const result = parseAmount(bad);
    assert.equal(result.ok, false, `should refuse ${JSON.stringify(bad)}`);
    assert.ok(result.message.length > 0);
  }
});

test('formatCents shows dollars with commas and two cents digits', () => {
  assert.equal(formatCents(0), '$0.00');
  assert.equal(formatCents(5), '$0.05');
  assert.equal(formatCents(8550), '$85.50');
  assert.equal(formatCents(123456789), '$1,234,567.89');
  assert.equal(formatCents(-15000), '-$150.00');
  assert.equal(formatCents(100000), '$1,000.00');
  assert.throws(() => formatCents(1.5));
});

test('centsToInput gives back what was typed', () => {
  assert.equal(centsToInput(8550), '85.50');
  assert.equal(centsToInput(7), '0.07');
  for (const c of [1, 99, 100, 123456, MAX_CENTS]) assert.equal(parseAmount(centsToInput(c)).cents, c);
});

test('roundDiv rounds to the nearest cent, halves away from zero', () => {
  assert.equal(roundDiv(260000, 12), 21667); // $2,600 a year = $216.67 a month
  assert.equal(roundDiv(5, 2), 3);
  assert.equal(roundDiv(-5, 2), -3);
  assert.equal(roundDiv(4, 3), 1);
  assert.equal(roundDiv(10000, 3), 3333);
  assert.equal(roundDiv(20000, 3), 6667);
  assert.equal(roundDiv(0, 365), 0);
  assert.throws(() => roundDiv(1, 0));
  assert.throws(() => roundDiv(0.5, 2));
});

test('allocateToTotal makes the pieces add up exactly', () => {
  // $100 split three ways: one piece gets the extra cent.
  assert.deepEqual(allocateToTotal([10000, 10000, 10000], 3, 10000), [3334, 3333, 3333]);
  // biggest leftover fraction gets rounded up first
  assert.deepEqual(allocateToTotal([10, 11, 14], 12, roundDiv(35, 12)), [1, 1, 1]);
  assert.deepEqual(allocateToTotal([5, 5], 10, 1), [1, 0]);
  assert.deepEqual(allocateToTotal([], 12, 0), []);
  assert.throws(() => allocateToTotal([12], 12, 5));
});

test('allocateToTotal never moves a piece by a cent or more (random check)', () => {
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let round = 0; round < 2000; round += 1) {
    const den = [1, 12, 52, 365][rand(4)];
    const nums = Array.from({ length: 1 + rand(8) }, () => rand(5_000_000));
    const total = roundDiv(nums.reduce((a, b) => a + b, 0), den);
    const pieces = allocateToTotal(nums, den, total);
    assert.equal(pieces.reduce((a, b) => a + b, 0), total);
    pieces.forEach((p, i) => assert.ok(Math.abs(p * den - nums[i]) < den));
  }
});

test('sum refuses anything that is not whole cents', () => {
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(sum([]), 0);
  assert.throws(() => sum([1, 0.1]));
});
