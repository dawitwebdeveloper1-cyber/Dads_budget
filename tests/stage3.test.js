import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  setLimit, addGoal, editGoal, deleteGoal, addToGoal, removeDeposit, goalSaved, deleteCategory, deleteFolder,
  addFolder, setSetting, loadState, newState,
} from '../js/data/model.js';
import { limitStatus } from '../js/insights/limits.js';
import { goalPlan } from '../js/insights/goals.js';
import { favourites } from '../js/insights/favourites.js';
import { monthRecap, recapToShow } from '../js/insights/recap.js';
import { adviceNotes, limitNotes, goalNotes, backupNotes } from '../js/insights/advice.js';
import { buildExport, toCSV, exportFileName, exportChoices } from '../js/data/export.js';
import { makeBackup, readBackup, backupDue, backupFileName } from '../js/data/backup.js';
import { monthSummary } from '../js/maths/budget.js';
import { buildState, pay, bill } from './helpers.js';

// ---------------------------------------------------------------- spending limits

const gasMonth = () => setLimit(buildState([
  bill('Gas', 30000, 'varies', '2026-11-02', 'cat-gas'),
  bill('Gas', 20000, 'varies', '2026-11-12', 'cat-gas'),
  bill('Gas', 50000, 'varies', '2026-11-25', 'cat-gas'), // not spent yet on the 20th
], { today: '2026-11-01' }), 'c:cat-gas', 60000);

test('limits count what has been spent so far this month', () => {
  const [gas] = limitStatus(gasMonth(), '2026-11-20');
  assert.deepEqual(
    [gas.name, gas.limitCents, gas.usedCents, gas.leftCents, gas.percent, gas.daysLeft],
    ['Gas', 60000, 50000, 10000, 83, 10],
  );
});

test('"You\'ve used 83% of your Gas budget with 10 days left."', () => {
  const [note] = limitNotes(gasMonth(), '2026-11-20');
  assert.equal(note.text, 'You\'ve used 83% of your Gas budget with 10 days left.');
  assert.equal(note.tone, 'info');
  assert.deepEqual(limitNotes(gasMonth(), '2026-11-11'), []); // only 50% on the 11th
});

test('going over a limit gets a gentle warning', () => {
  const [note] = limitNotes(gasMonth(), '2026-11-26');
  assert.equal(note.text, 'You\'ve gone $400 over your Gas limit this month.');
  assert.equal(note.tone, 'warn');
});

test('limits can be changed, removed, and go when their category does', () => {
  let s = gasMonth();
  assert.throws(() => setLimit(s, 'c:cat-gas', 0));
  assert.throws(() => setLimit(s, 'c:nope', 100));
  s = setLimit(s, 'c:cat-gas', null);
  assert.deepEqual(s.limits, {});
  s = setLimit(setLimit(s, 'c:cat-gas', 100), 'c:cat-food', 200);
  s = deleteCategory(s, 'cat-gas');
  assert.deepEqual(s.limits, { 'c:cat-food': 200 });
  s = addFolder(s, 'Sarah', 'fs');
  s = deleteFolder(setLimit(s, 'f:fs', 500), 'fs');
  assert.deepEqual(s.limits, { 'c:cat-food': 200 });
});

// ---------------------------------------------------------------- savings goals

const goalState = () => addGoal(newState(), { name: 'Truck repairs', targetCents: 200000, byDate: '2027-01-29' }, '2026-11-06', 'g1');

test('goals fill up as he adds to them', () => {
  let s = goalState();
  s = addToGoal(s, 'g1', 50000, '2026-11-06', 'd1');
  s = addToGoal(s, 'g1', 25000, '2026-11-08', 'd2');
  const goal = s.goals[0];
  assert.equal(goalSaved(goal), 75000);
  const plan = goalPlan(goal, '2026-11-10');
  assert.equal(plan.percent, 37); // 37.5% rounded down
  assert.equal(plan.remaining, 125000);
  assert.equal(plan.weeksLeft, 12); // 80 days → 12 weeks (rounded up)
  assert.equal(plan.perWeek, 10417); // $1,250 ÷ 12 = $104.166… rounded up
  assert.equal(plan.lastWeekCents, 75000);
  s = removeDeposit(s, 'g1', 'd1');
  assert.equal(goalSaved(s.goals[0]), 25000);
  assert.throws(() => addToGoal(s, 'g1', 0, '2026-11-10'));
  assert.throws(() => addToGoal(s, 'nope', 100, '2026-11-10'));
});

test('"Put away $X more this week to stay on track"', () => {
  const s = addToGoal(goalState(), 'g1', 5000, '2026-11-01', 'd1');
  // $1,950 left, 12 weeks → $162.50 a week; $50 put away in the last 7 days → $112.50 more → "$113".
  const [note] = goalNotes(s, '2026-11-06');
  assert.equal(note.text, 'Put away $113 more this week to stay on track for Truck repairs.');
  assert.deepEqual(note.action, { type: 'goal', label: 'Add money', goalId: 'g1' });
  // Once he has put enough away this week, the note goes.
  assert.deepEqual(goalNotes(addToGoal(s, 'g1', 20000, '2026-11-06'), '2026-11-06'), []);
});

test('reaching a goal gets a "well done"', () => {
  const s = addToGoal(goalState(), 'g1', 200000, '2026-11-06');
  assert.equal(goalPlan(s.goals[0], '2026-11-06').percent, 100);
  assert.equal(goalNotes(s, '2026-11-06')[0].text, 'Well done! You reached your Truck repairs goal of $2,000.');
});

test('goals without a date never nag', () => {
  const s = addGoal(newState(), { name: 'Rainy day', targetCents: 100000 }, '2026-11-06', 'g2');
  assert.equal(goalPlan(s.goals[0], '2026-11-06').perWeek, null);
  assert.deepEqual(goalNotes(s, '2026-11-06'), []);
});

test('goal checks', () => {
  const s = goalState();
  assert.throws(() => addGoal(s, { name: 'truck REPAIRS', targetCents: 100 }, '2026-11-06'), /already/);
  assert.throws(() => addGoal(s, { name: '', targetCents: 100 }, '2026-11-06'), /name/);
  assert.throws(() => addGoal(s, { name: 'X', targetCents: -1 }, '2026-11-06'), /amount/);
  assert.throws(() => addGoal(s, { name: 'X', targetCents: 100, byDate: '2026-11-01' }, '2026-11-06'), /after today/);
  const edited = editGoal(s, 'g1', { targetCents: 300000, byDate: '' });
  assert.equal(edited.goals[0].targetCents, 300000);
  assert.equal(edited.goals[0].byDate, null);
  assert.deepEqual(deleteGoal(s, 'g1').goals, []);
});

// ---------------------------------------------------------------- quick-add

test('things he enters again and again become quick-add buttons', () => {
  const s = buildState([
    bill('Gas', 7000, 'varies', '2026-10-20', 'cat-gas'),
    bill('gas', 8000, 'varies', '2026-11-02', 'cat-gas'),
    bill('Gas', 6500, 'varies', '2026-11-05', 'cat-gas'),
    bill('Coffee', 450, 'once', '2026-11-01', 'cat-food'),
    bill('Coffee', 500, 'once', '2026-11-04', 'cat-food'),
    bill('Repair', 90000, 'once', '2026-11-03', 'cat-other'), // only once: not a favourite
    bill('Rent', 150000, 'monthly', '2026-11-01', 'cat-housing'), // repeats on its own: not needed
    bill('Old', 100, 'varies', '2026-01-01', 'cat-other'),
    bill('Old', 100, 'varies', '2026-01-02', 'cat-other'), // too long ago
  ], { today: '2026-01-01' });
  assert.deepEqual(favourites(s, '2026-11-06').map((f) => [f.name, f.amountCents, f.where, f.count]), [
    ['Gas', 6500, 'c:cat-gas', 3],
    ['Coffee', 500, 'c:cat-food', 2],
  ]);
});

// ---------------------------------------------------------------- month-end summary

test('month-end recap: in, out, left and the top 3', () => {
  const s = buildState([
    pay(200000, '2026-10-02'),
    bill('Rent', 150000, 'monthly', '2026-10-01', 'cat-housing'),
    bill('Groceries', 15000, 'weekly', '2026-10-03', 'cat-food'),
    bill('Phone', 8500, 'monthly', '2026-10-15', 'cat-bills'),
    bill('Gas', 6000, 'varies', '2026-10-09', 'cat-gas'),
  ], { today: '2026-10-01' });
  const r = monthRecap(s, 2026, 10);
  assert.deepEqual([r.inCents, r.outCents, r.leftCents], [600000, 239500, 360500]);
  assert.deepEqual(r.top.map((t) => [t.name, t.cents]), [['Housing', 150000], ['Food', 75000], ['Bills', 8500]]);
  assert.equal(recapToShow(s, '2026-11-03').m, 10);
  assert.equal(recapToShow(s, '2026-11-08'), null); // only the first week
  assert.equal(recapToShow(setSetting(s, 'dismissed', { 'recap:2026-10': '2026-11-02' }), '2026-11-03'), null);
  assert.equal(recapToShow(s, '2026-10-05'), null); // no month before he started
});

// ---------------------------------------------------------------- export

const taxYear = () => buildState([
  pay(200000, '2026-01-02'),
  bill('Truck insurance', 120000, 'monthly', '2026-01-10', 'cat-bills', { tag: 'business' }),
  bill('Fuel, diesel', 40000, 'varies', '2026-02-03', 'cat-gas', { tag: 'business' }),
  bill('Phone "family" plan', 8500, 'monthly', '2026-01-15', 'cat-bills'),
  bill('=SUM(A1)', 100, 'once', '2026-03-01', 'cat-other'),
]);

test('export totals match the app\'s own month totals', () => {
  const s = taxYear();
  const jan = buildExport(s, { type: 'month', y: 2026, m: 1 });
  assert.equal(jan.ok, true);
  assert.equal(jan.inCents, monthSummary(s, 2026, 1).inCents);
  assert.equal(jan.outCents, monthSummary(s, 2026, 1).outCents);
  assert.equal(jan.rows.length, 3 + 1 + 1);
  const year = buildExport(s, { type: 'year', y: 2026 });
  assert.equal(year.ok, true);
  assert.equal(year.inCents, 26 * 200000);
  assert.equal(year.outCents, 12 * 120000 + 40000 + 12 * 8500 + 100);
});

test('business-only and personal-only exports for tax time', () => {
  const s = taxYear();
  const biz = buildExport(s, { type: 'year', y: 2026 }, 'business');
  assert.equal(biz.ok, true);
  assert.equal(biz.outCents, 12 * 120000 + 40000);
  assert.ok(biz.rows.every((r) => r.tag === 'business'));
  const personal = buildExport(s, { type: 'year', y: 2026 }, 'personal');
  assert.equal(personal.outCents + biz.outCents, buildExport(s, { type: 'year', y: 2026 }).outCents);
  assert.equal(exportFileName({ type: 'year', y: 2026 }, 'business', 'csv'), 'budget-2026-business.csv');
  assert.equal(exportFileName({ type: 'month', y: 2026, m: 3 }, 'all', 'csv'), 'budget-2026-03.csv');
});

test('the spreadsheet file is safe and adds up', () => {
  const csv = toCSV(buildExport(taxYear(), { type: 'month', y: 2026, m: 3 }));
  assert.ok(csv.startsWith('﻿Budget export: March 2026 · Personal and business\r\n'));
  assert.ok(csv.includes('2026-03-01,Money out,\'=SUM(A1),Other,Just once,Personal,1.00'));
  assert.ok(csv.includes('"Phone ""family"" plan"'));
  const feb = toCSV(buildExport(taxYear(), { type: 'month', y: 2026, m: 2 }));
  assert.ok(feb.includes('2026-02-03,Money out,"Fuel, diesel",Gas,Changes each time,Business,400.00'));
  assert.ok(csv.includes('Total money in,,,,,,4000.00'));
  assert.ok(csv.includes('Total money out,,,,,,1286.00'));
  assert.ok(csv.includes('Left over,,,,,,2714.00'));
});

test('he can export any month or year since he started', () => {
  const s = buildState([pay(100, '2026-11-02')], { today: '2026-11-02' });
  const choices = exportChoices(s, '2027-01-15');
  assert.deepEqual(choices.months.map((m) => `${m.y}-${m.m}`), ['2027-1', '2026-12', '2026-11']);
  assert.deepEqual(choices.years, [2027, 2026]);
});

// ---------------------------------------------------------------- backup

test('a backup loads back exactly as it was', () => {
  let s = taxYear();
  s = setLimit(s, 'c:cat-gas', 50000);
  s = addGoal(s, { name: 'Truck repairs', targetCents: 200000 }, '2026-11-06', 'g1');
  s = addToGoal(s, 'g1', 5000, '2026-11-06', 'd1');
  const file = makeBackup(s, '2026-11-06');
  const back = readBackup(file);
  assert.deepEqual(back.state, s);
  assert.equal(back.exportedAt, '2026-11-06');
  assert.equal(backupFileName('2026-11-06'), 'budget-backup-2026-11-06.json');
});

test('a wrong or damaged file is refused, and nothing changes', () => {
  assert.throws(() => readBackup('not json'), /isn't a Budget backup/);
  assert.throws(() => readBackup('{"hello":1}'), /isn't a Budget backup/);
  const s = taxYear();
  const broken = JSON.parse(makeBackup(s, '2026-11-06'));
  broken.data.entries[0].amountCents = 'lots';
  assert.throws(() => readBackup(JSON.stringify(broken)), /damaged/);
});

test('"Time to back up your data" about once a week', () => {
  const s = buildState([pay(100, '2026-11-02')], { today: '2026-11-02' });
  assert.equal(backupDue(newState(), '2026-12-01'), false); // nothing to back up
  assert.equal(backupDue(s, '2026-11-08'), false); // first week
  assert.equal(backupDue(s, '2026-11-09'), true);
  assert.equal(backupNotes(s, '2026-11-09')[0].text, 'Time to back up your data.');
  const backedUp = setSetting(s, 'lastBackup', '2026-11-09');
  assert.equal(backupDue(backedUp, '2026-11-15'), false);
  assert.equal(backupDue(backedUp, '2026-11-16'), true);
  // Shows even when notes are turned off.
  assert.equal(adviceNotes(setSetting(s, 'notes', false), '2026-11-09')[0].action.type, 'backup');
});

test('older saved data (before limits and goals) still opens', () => {
  const s = taxYear();
  const { limits, goals, ...old } = JSON.parse(JSON.stringify(s));
  const loaded = loadState(old);
  assert.deepEqual(loaded.limits, {});
  assert.deepEqual(loaded.goals, []);
});
