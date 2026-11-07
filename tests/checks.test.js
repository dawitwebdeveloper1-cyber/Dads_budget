import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unusualAmount, findDuplicate } from '../js/maths/checks.js';
import { buildState, bill } from './helpers.js';

const history = () => buildState([
  bill('Hydro', 10000, 'varies', '2026-01-10', 'cat-bills'),
  bill('Hydro', 11000, 'varies', '2026-02-10', 'cat-bills'),
  bill('Hydro', 9000, 'varies', '2026-03-10', 'cat-bills'),
  bill('Phone bill', 8500, 'monthly', '2026-01-15', 'cat-bills'),
]);

const draft = (over) => ({ kind: 'out', name: 'Hydro', amountCents: 10000, freq: 'varies', startDate: '2026-04-10', ...over });

test('asks "Are you sure?" when an amount is way bigger than usual', () => {
  const s = history();
  assert.deepEqual(unusualAmount(s, draft({ amountCents: 1_000_000 })), { reason: 'bigger', usualCents: 10000 });
  assert.equal(unusualAmount(s, draft({ amountCents: 12000 })), null);
  assert.equal(unusualAmount(s, draft({ amountCents: 40000 })), null); // 4× is still fine
});

test('asks when an amount is way smaller than usual (missed zeros)', () => {
  assert.deepEqual(unusualAmount(history(), draft({ amountCents: 1000 })), { reason: 'smaller', usualCents: 10000 });
});

test('small amounts that are 5× bigger but under $50 more are fine', () => {
  const s = buildState([bill('Coffee', 300, 'varies', '2026-01-10', 'cat-food')]);
  assert.equal(unusualAmount(s, draft({ name: 'coffee', amountCents: 1500 })), null);
});

test('names match even with different capitals or spaces', () => {
  assert.equal(unusualAmount(history(), draft({ name: '  HYDRO ', amountCents: 1_000_000 })).reason, 'bigger');
});

test('when editing, the old amount is the one compared against', () => {
  const s = history();
  const phone = s.entries.find((e) => e.name === 'Phone bill');
  assert.equal(unusualAmount(s, { ...phone, amountCents: 850000 }, phone.id).reason, 'bigger');
  assert.equal(unusualAmount(s, { ...phone, amountCents: 9000 }, phone.id), null);
});

test('a first-ever amount of $10,000 or more gets double-checked', () => {
  const s = history();
  assert.deepEqual(unusualAmount(s, draft({ name: 'New boat', amountCents: 1_000_000 })), { reason: 'big', usualCents: null });
  assert.equal(unusualAmount(s, draft({ name: 'New tires', amountCents: 99_999 })), null);
});

test('flags the same bill entered twice', () => {
  const s = history();
  const again = { kind: 'out', name: 'phone bill', amountCents: 9000, freq: 'monthly', startDate: '2026-04-01' };
  assert.equal(findDuplicate(s, again)?.name, 'Phone bill');
  // Same one-time amount within 3 days
  assert.equal(findDuplicate(s, draft({ amountCents: 9000, startDate: '2026-03-12' }))?.name, 'Hydro');
  // Different amount or far apart: not a duplicate
  assert.equal(findDuplicate(s, draft({ amountCents: 9500, startDate: '2026-03-12' })), null);
  assert.equal(findDuplicate(s, draft({ amountCents: 9000, startDate: '2026-03-20' })), null);
  // Money in vs money out with the same name are different things
  assert.equal(findDuplicate(s, { ...again, kind: 'in' }), null);
});

test('editing an entry never flags itself as a duplicate', () => {
  const s = history();
  const phone = s.entries.find((e) => e.name === 'Phone bill');
  assert.equal(findDuplicate(s, phone, phone.id), null);
});

test('a stopped bill is not a duplicate of its replacement', () => {
  const s = buildState([bill('Phone bill', 8500, 'monthly', '2026-01-15', 'cat-bills', { endDate: '2026-03-31' })]);
  const replacement = { kind: 'out', name: 'Phone bill', amountCents: 9500, freq: 'monthly', startDate: '2026-04-15' };
  assert.equal(findDuplicate(s, replacement), null);
});
