import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newState, addEntry, editEntry, editAffectsPast, stopEntry, deleteEntry, hasPastMonths, dateTooEarly,
  addCategory, renameCategory, deleteCategory, addFolder, renameFolder, deleteFolder, loadState,
} from '../js/data/model.js';
import { monthSummary, carryOver, breakdown } from '../js/maths/budget.js';
import { buildState, pay, bill } from './helpers.js';

test('a new budget starts with the default categories', () => {
  assert.deepEqual(newState().categories.map((c) => c.name), ['Housing', 'Food', 'Gas', 'Bills', 'Kids', 'Other']);
});

test('the first entry sets the start month', () => {
  const s = addEntry(newState(), pay(200000, '2026-11-13'), '2026-11-06', 'p');
  assert.equal(s.startMonth, '2026-11');
  const s2 = addEntry(s, bill('Rent', 150000, 'monthly', '2026-12-01', 'cat-housing'), '2026-12-02', 'r');
  assert.equal(s2.startMonth, '2026-11');
});

test('bad entries are refused', () => {
  const s = newState();
  assert.throws(() => addEntry(s, { ...pay(0, '2026-11-13') }, '2026-11-06'));
  assert.throws(() => addEntry(s, { ...pay(12.5, '2026-11-13') }, '2026-11-06'));
  assert.throws(() => addEntry(s, { ...pay(100, '2026-02-30') }, '2026-11-06'));
  assert.throws(() => addEntry(s, { ...pay(100, '2026-11-13'), name: '   ' }, '2026-11-06'));
  assert.throws(() => addEntry(s, { ...pay(100, '2026-11-13'), freq: 'daily' }, '2026-11-06'));
  assert.throws(() => addEntry(s, bill('X', 100, 'monthly', '2026-11-13', 'cat-nope'), '2026-11-06'));
});

test('names are tidied but kept as he typed them', () => {
  const s = addEntry(newState(), { ...pay(100, '2026-11-13'), name: '  Truck   insurance ' }, '2026-11-06', 'x');
  assert.equal(s.entries[0].name, 'Truck insurance');
});

test('fixing a typo changes every month', () => {
  const s = buildState([bill('Rent', 15000, 'monthly', '2026-01-01', 'cat-housing', { id: 'rent' })]);
  assert.equal(editAffectsPast(s, 'rent', { amountCents: 150000 }, '2026-04-10'), true);
  const fixed = editEntry(s, 'rent', { amountCents: 150000 }, '2026-04-10', 'everywhere');
  assert.equal(fixed.entries.length, 1);
  assert.equal(monthSummary(fixed, 2026, 1).outCents, 150000);
});

test('a real change from this month keeps old months as they were', () => {
  const s = buildState([bill('Rent', 150000, 'monthly', '2026-01-31', 'cat-housing', { id: 'rent' })]);
  const raised = editEntry(s, 'rent', { amountCents: 160000 }, '2026-04-10', 'fromThisMonth', 'rent2');
  assert.equal(raised.entries.length, 2);
  assert.equal(monthSummary(raised, 2026, 3).outCents, 150000);
  assert.equal(monthSummary(raised, 2026, 4).outCents, 160000);
  assert.equal(monthSummary(raised, 2026, 5).outCents, 160000);
  // Still lands on the last day of the month (the 31st anchor is kept).
  assert.equal(monthSummary(raised, 2026, 5).items[0].dates.length, 1);
  assert.equal(carryOver(raised, 2026, 4).cents, -450000);
  assert.equal(breakdown(raised, '2026-04-10', 'month').outCents, 160000);
});

test('editing a name only, or a brand-new entry, never needs the question', () => {
  const s = buildState([bill('Rent', 150000, 'monthly', '2026-01-01', 'cat-housing', { id: 'rent' })]);
  assert.equal(editAffectsPast(s, 'rent', { name: 'House rent' }, '2026-04-10'), false);
  assert.equal(editAffectsPast(s, 'rent', { amountCents: 150000 }, '2026-04-10'), false); // same amount
  const fresh = buildState([bill('Rent', 150000, 'monthly', '2026-04-01', 'cat-housing', { id: 'rent' })], { today: '2026-04-01' });
  assert.equal(editAffectsPast(fresh, 'rent', { amountCents: 160000 }, '2026-04-10'), false);
});

test('stopping a bill keeps this month and earlier, then stops', () => {
  const s = buildState([bill('Netflix', 2000, 'monthly', '2026-01-05', 'cat-bills', { id: 'n' })]);
  assert.equal(hasPastMonths(s, s.entries[0], '2026-04-10'), true);
  const stopped = stopEntry(s, 'n', '2026-04-10');
  assert.equal(stopped.entries[0].endDate, '2026-04-30');
  assert.equal(monthSummary(stopped, 2026, 4).outCents, 2000);
  assert.equal(monthSummary(stopped, 2026, 5).outCents, 0);
  assert.equal(monthSummary(stopped, 2026, 1).outCents, 2000);
});

test('deleting removes it everywhere', () => {
  const s = buildState([bill('Netflix', 2000, 'monthly', '2026-01-05', 'cat-bills', { id: 'n' })]);
  assert.equal(monthSummary(deleteEntry(s, 'n'), 2026, 1).outCents, 0);
});

test('one-time entries can\'t be dated before he started', () => {
  const s = buildState([pay(100, '2026-03-05')], { today: '2026-03-05' });
  assert.equal(dateTooEarly(s, bill('Old repair', 100, 'once', '2026-02-27'), '2026-03-06'), true);
  assert.equal(dateTooEarly(s, bill('Repair', 100, 'once', '2026-03-01'), '2026-03-06'), false);
  assert.equal(dateTooEarly(s, bill('Rent', 100, 'monthly', '2025-01-01'), '2026-03-06'), false);
  assert.equal(dateTooEarly(newState(), bill('Repair', 100, 'once', '2026-02-27'), '2026-03-06'), true);
});

test('categories can be added, renamed and deleted (money moves to Other)', () => {
  let s = buildState([bill('Groceries', 15000, 'weekly', '2026-01-03', 'cat-food')]);
  s = addCategory(s, 'Eating out', 'cat-eat');
  assert.throws(() => addCategory(s, ' eating OUT '), /already/);
  assert.throws(() => addCategory(s, '  '), /name/);
  s = renameCategory(s, 'cat-food', 'Groceries & food');
  assert.equal(monthSummary(s, 2026, 1).groups[0].name, 'Groceries & food');
  const before = monthSummary(s, 2026, 1).outCents;
  s = deleteCategory(s, 'cat-food');
  assert.equal(s.entries[0].categoryId, 'cat-other');
  assert.equal(monthSummary(s, 2026, 1).outCents, before);
  assert.throws(() => deleteCategory(s, 'cat-other'));
});

test('folders hold their own expenses and show as one total', () => {
  let s = buildState([], { folders: [] });
  s = addFolder(s, 'Sarah', 'fs');
  s = addFolder(s, 'Mike', 'fm');
  assert.throws(() => addFolder(s, 'sarah'));
  s = addEntry(s, bill('Hockey', 40000, 'yearly', '2026-01-10', null, { folderId: 'fm', tag: 'personal' }), '2026-01-01', 'h');
  s = addEntry(s, bill('Dance', 6000, 'monthly', '2026-01-12', null, { folderId: 'fs', tag: 'personal' }), '2026-01-01', 'd');
  s = addEntry(s, bill('Clothes', 5000, 'once', '2026-01-20', null, { folderId: 'fs', tag: 'personal' }), '2026-01-01', 'c');
  const jan = monthSummary(s, 2026, 1);
  assert.deepEqual(jan.groups.map((g) => [g.name, g.cents, g.items.length]), [['Mike', 40000, 1], ['Sarah', 11000, 2]]);
  s = renameFolder(s, 'fs', 'Sarah (school)');
  s = deleteFolder(s, 'fm');
  const after = monthSummary(s, 2026, 1);
  assert.equal(after.outCents, jan.outCents);
  assert.deepEqual(after.groups.map((g) => g.name), ['Other', 'Sarah (school)']);
});

test('saved data is checked before it is trusted', () => {
  const s = buildState([pay(200000, '2026-01-02')]);
  const copy = loadState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(copy, s);
  assert.throws(() => loadState(null));
  assert.throws(() => loadState({ ...s, version: 99 }));
  assert.throws(() => loadState({ ...s, entries: [{ ...s.entries[0], amountCents: -5 }] }), /damaged/);
  assert.throws(() => loadState({ ...s, entries: [{ ...s.entries[0], amountCents: 10.5 }] }), /damaged/);
});
