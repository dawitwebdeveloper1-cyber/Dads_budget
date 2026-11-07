import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  explainLine, explainMonth, explainCarry, explainBreakdown, explainGroup, leftOverSum,
} from '../js/insights/explain.js';
import { adviceNotes, roughMoney } from '../js/insights/advice.js';
import { monthSummary, breakdown, historyMonths } from '../js/maths/budget.js';
import { markPaid, dismissNote, setSetting } from '../js/data/model.js';
import { buildState, pay, bill } from './helpers.js';

const rep = (name, amountCents, freq, yearCents, cents) => ({ name, yearCents, cents, how: { type: 'repeating', amountCents, freq } });

// ---------------------------------------------------------------- Show me how

test('conversions are explained step by step', () => {
  assert.equal(explainLine(rep('Groceries', 5000, 'weekly', 260000, 21667), 'month'),
    'Groceries: $50.00 a week × 52 weeks ÷ 12 months = $216.67 a month');
  assert.equal(explainLine(rep('Phone bill', 8500, 'monthly', 102000, 8500), 'month'), 'Phone bill: $85.00 a month');
  assert.equal(explainLine(rep('Insurance', 120000, 'yearly', 120000, 10000), 'month'),
    'Insurance: $1,200.00 a year ÷ 12 months = $100.00 a month');
  assert.equal(explainLine(rep('Paycheque', 210000, 'biweekly', 5460000, 455000), 'month'),
    'Paycheque: $2,100.00 every 2 weeks × 26 times a year ÷ 12 months = $4,550.00 a month');
  assert.equal(explainLine(rep('Phone bill', 8500, 'monthly', 102000, 102000), 'year'),
    'Phone bill: $85.00 a month × 12 months = $1,020.00 a year');
  assert.equal(explainLine(rep('Phone bill', 8500, 'monthly', 102000, 1962), 'week'),
    'Phone bill: $85.00 a month × 12 months ÷ 52 weeks = $19.62 a week');
  assert.equal(explainLine(rep('Rent', 150000, 'monthly', 1800000, 4932), 'day'),
    'Rent: $1,500.00 a month × 12 months ÷ 365 days = $49.32 a day');
});

test('averages are explained too', () => {
  const gas = { name: 'Gas', yearCents: 160000, cents: 13333, how: { type: 'average', totalCents: 40000, months: 3, count: 5, windowStart: { y: 2026, m: 1 }, windowEnd: { y: 2026, m: 3 } } };
  assert.equal(explainLine(gas, 'month'), 'Gas: $400.00 in January–March ÷ 3 months = $133.33 a month');
  assert.equal(explainLine({ ...gas, cents: 3077 }, 'week'),
    'Gas: $400.00 in January–March ÷ 3 × 12 months = $1,600.00 a year ÷ 52 weeks = $30.77 a week');
  const soFar = { name: 'Gas', yearCents: 156000, cents: 13000, how: { type: 'average', totalCents: 13000, months: 1, count: 2, soFar: true, windowStart: { y: 2026, m: 11 }, windowEnd: { y: 2026, m: 11 } } };
  assert.equal(explainLine(soFar, 'month'), 'Gas: $130.00 so far this month = $130.00 a month');
});

test('when a cent is moved so totals add up, the explanation says so', () => {
  assert.equal(explainLine(rep('A', 10000, 'yearly', 10000, 834), 'month'),
    'A: $100.00 a year ÷ 12 months = $8.33 a month (shown as $8.34 so the total adds up exactly)');
});

test('month leftover: "Income − Bills = left"', () => {
  assert.equal(leftOverSum(420000, 310000, 110000), 'Money in $4,200.00 − Money out $3,100.00 = $1,100.00 left over.');
  assert.equal(leftOverSum(100000, 115000, -15000), 'Money in $1,000.00 − Money out $1,150.00 = -$150.00 (short $150.00).');
  const s = buildState([
    pay(200000, '2026-01-02'),
    bill('Rent', 150000, 'monthly', '2026-01-01', 'cat-housing'),
    bill('Groceries', 15000, 'weekly', '2026-01-03', 'cat-food'),
  ]);
  const lines = explainMonth(monthSummary(s, 2026, 1));
  assert.equal(lines[0].text, 'Money in $6,000.00 − Money out $2,250.00 = $3,750.00 left over.');
  const texts = lines.map((l) => l.text);
  assert.ok(texts.includes('Paycheque: $2,000.00 × 3 (Jan 2, Jan 16, Jan 30) = $6,000.00'));
  assert.ok(texts.includes('Food · Groceries: $150.00 × 5 (Jan 3, Jan 10, Jan 17, Jan 24, Jan 31) = $750.00'));
  assert.ok(texts.includes('Added up: $1,500.00 + $750.00 = $2,250.00'));
});

test('carry-over explained month by month', () => {
  const s = buildState([pay(100000, '2026-01-05', { freq: 'monthly' }), bill('Rent', 60000, 'monthly', '2026-01-01')]);
  const earlier = historyMonths(s, '2026-03-10').reverse().slice(0, 2);
  const lines = explainCarry(earlier, 40000);
  assert.equal(lines[0].text, 'This month $400.00 + carried over $800.00 = $1,200.00 in total.');
  assert.ok(lines.some((l) => l.text === 'Added up: $400.00 + $400.00 = $800.00'));
});

test('breakdown explanation adds up to what is shown', () => {
  const s = buildState([
    pay(210000, '2026-01-02'),
    bill('Rent', 150000, 'monthly', '2026-01-01', 'cat-housing'),
    bill('Groceries', 5000, 'weekly', '2026-01-03', 'cat-food'),
  ]);
  const b = breakdown(s, '2026-02-10', 'month');
  const lines = explainBreakdown(b);
  assert.equal(lines[0].text, 'Money in $4,550.00 − Money out $1,716.67 = $2,833.33 left over a month.');
  assert.ok(lines.some((l) => l.text === 'Added up: $1,500.00 + $216.67 = $1,716.67'));
  const food = b.groups.find((g) => g.name === 'Food');
  assert.equal(explainGroup(food, 'month')[1].text, 'Groceries: $50.00 a week × 52 weeks ÷ 12 months = $216.67 a month');
});

// ---------------------------------------------------------------- gentle notes

test('rough money rounds to whole dollars', () => {
  assert.equal(roughMoney(15049), '$150');
  assert.equal(roughMoney(15050), '$151');
  assert.equal(roughMoney(123456), '$1,235');
});

// These budgets were 'just backed up', so the weekly backup note stays out of the way.
const quiet = (s) => setSetting(s, 'lastBackup', '2026-11-08');

const shortMonth = () => quiet(buildState([
  pay(100000, '2026-11-02', { freq: 'once', name: 'Pay' }),
  bill('Rent', 90000, 'once', '2026-11-03', 'cat-housing'),
  bill('Gas', 5000, 'varies', '2026-11-04', 'cat-gas'),
  bill('Gas', 5000, 'varies', '2026-11-09', 'cat-gas'),
], { today: '2026-11-02' }));

test('"At this pace you\'ll be about $X short"', () => {
  // $1,000 in, $1,000 out so far. Gas is $100 after 10 days → about $300 for 30 days → $200 more.
  const notes = adviceNotes(shortMonth(), '2026-11-10');
  assert.equal(notes[0].text, 'At this pace you\'ll be about $200 short this month.');
  assert.equal(notes[0].tone, 'warn');
  assert.equal(notes[0].why.at(-1).text, '$1,000.00 − $1,000.00 − $200.00 = -$200.00');
});

test('no shortfall note early in the month or when things look fine', () => {
  assert.deepEqual(adviceNotes(shortMonth(), '2026-11-04').filter((n) => n.id.startsWith('short')), []);
  const fine = quiet(buildState([pay(500000, '2026-11-02', { freq: 'once', name: 'Pay' }), bill('Gas', 5000, 'varies', '2026-11-04', 'cat-gas')], { today: '2026-11-02' }));
  assert.deepEqual(adviceNotes(fine, '2026-11-10'), []);
});

test('"Phone bill ($85.00) is due in 3 days", and gone once marked paid', () => {
  let s = quiet(buildState([pay(500000, '2026-11-02', { freq: 'monthly' }), bill('Phone bill', 8500, 'monthly', '2026-11-13', 'cat-bills', { id: 'ph' })], { today: '2026-11-01' }));
  const [note] = adviceNotes(s, '2026-11-10');
  assert.equal(note.text, 'Phone bill ($85.00) is due in 3 days.');
  assert.deepEqual(note.action, { type: 'paid', label: 'Mark paid', entryId: 'ph', iso: '2026-11-13' });
  assert.equal(adviceNotes(s, '2026-11-12')[0].text, 'Phone bill ($85.00) is due tomorrow.');
  assert.equal(adviceNotes(s, '2026-11-13')[0].text, 'Phone bill ($85.00) is due today.');
  assert.deepEqual(adviceNotes(s, '2026-11-09'), []); // 4 days away: not yet
  s = markPaid(s, 'ph', '2026-11-13');
  assert.deepEqual(adviceNotes(s, '2026-11-10'), []);
});

const twoMonths = () => quiet(buildState([
  pay(500000, '2026-10-01', { freq: 'monthly' }),
  bill('Groceries', 10000, 'varies', '2026-10-03', 'cat-food'),
  bill('Groceries', 22000, 'varies', '2026-11-03', 'cat-food'),
  bill('Gas', 30000, 'varies', '2026-10-05', 'cat-gas'),
  bill('Gas', 10000, 'varies', '2026-11-05', 'cat-gas'),
  bill('Late gas', 99999, 'varies', '2026-10-25', 'cat-gas'), // after the 10th: not compared
], { today: '2026-10-01' }));

test('"Food is $120 higher than last month" and "Nice, you spent $200 less"', () => {
  const notes = adviceNotes(twoMonths(), '2026-11-10');
  assert.deepEqual(notes.map((n) => n.text), [
    'Nice, you spent $200 less on Gas than last month.',
    'Food is $120 higher than last month. Want to take a look?',
  ]);
  assert.equal(notes[1].why[0].text, 'November 1–10: $220.00');
  assert.equal(notes[1].why[1].text, 'October 1–10: $100.00');
  assert.deepEqual(notes[1].action, { type: 'month', label: 'Take a look', y: 2026, m: 11 });
});

test('small changes don\'t get a note', () => {
  const s = buildState([
    bill('Groceries', 10000, 'varies', '2026-10-03', 'cat-food'),
    bill('Groceries', 14000, 'varies', '2026-11-03', 'cat-food'), // $40 more: under $50
  ], { today: '2026-10-01' });
  assert.deepEqual(adviceNotes(s, '2026-11-10').filter((n) => n.id.startsWith('more')), []);
});

test('notes can be swiped away, turned off, and never more than two show', () => {
  let s = twoMonths();
  const [first] = adviceNotes(s, '2026-11-10');
  s = dismissNote(s, first.id, '2026-11-10');
  assert.deepEqual(adviceNotes(s, '2026-11-10').map((n) => n.id), ['more:c:cat-food:2026-11']);
  // Swiped-away notes are forgotten after about two months.
  s = dismissNote(s, 'other', '2027-02-01');
  assert.deepEqual(Object.keys(s.settings.dismissed), ['other']);
  assert.deepEqual(adviceNotes(setSetting(twoMonths(), 'notes', false), '2026-11-10'), []);
  const busy = quiet(buildState([
    ...twoMonths().entries,
    bill('Phone bill', 8500, 'monthly', '2026-11-12', 'cat-bills'),
  ].map(({ id, createdAt, ...e }) => e), { today: '2026-10-01' }));
  assert.equal(adviceNotes(busy, '2026-11-10').length, 2);
});
