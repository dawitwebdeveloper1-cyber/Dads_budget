// Random budgets, hundreds of them. For every one, every month and every
// period, all the cross-checks must pass and every total must add up.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthSummary, carryOver, breakdown, historyMonths } from '../js/maths/budget.js';
import { PERIOD_ORDER, periodTable } from '../js/maths/periods.js';
import { FREQUENCY_ORDER } from '../js/maths/schedule.js';
import { isoDate, dayNumber, addMonths } from '../js/maths/dates.js';
import { buildState } from './helpers.js';

function randomBudget(seed) {
  let x = seed;
  const rand = (n) => { x = (x * 1103515245 + 12345) % 2147483648; return Math.floor((x / 2147483648) * n); };
  const cats = ['cat-housing', 'cat-food', 'cat-gas', 'cat-bills', 'cat-kids', 'cat-other'];
  const start = dayNumber('2027-12-01');
  const entries = Array.from({ length: 1 + rand(25) }, (_, i) => {
    const kind = rand(4) === 0 ? 'in' : 'out';
    const inFolder = kind === 'out' && rand(4) === 0;
    return {
      kind,
      name: `Item ${rand(6)}`,
      amountCents: 1 + rand(rand(2) ? 20_000 : 500_000),
      freq: FREQUENCY_ORDER[rand(FREQUENCY_ORDER.length)],
      startDate: isoDate(start + rand(400)),
      categoryId: cats[rand(cats.length)],
      folderId: inFolder ? ['fold-a', 'fold-b'][rand(2)] : null,
      tag: rand(3) === 0 ? 'business' : 'personal',
      ...(rand(5) === 0 ? { endDate: isoDate(start + 400 + rand(200)) } : {}),
    };
  });
  return buildState(entries, { today: '2027-12-01', folders: ['A', 'B'] });
}

test('random budgets: every month adds up and matches its cross-checks', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const s = randomBudget(seed);
    let running = 0;
    for (let mo = { y: 2027, m: 12 }; mo.y < 2029 || mo.m <= 6; mo = addMonths(mo.y, mo.m, 1)) {
      const all = monthSummary(s, mo.y, mo.m);
      assert.ok(all.ok, `seed ${seed} ${mo.y}-${mo.m}`);
      assert.equal(all.groups.reduce((a, g) => a + g.cents, 0), all.outCents);
      const personal = monthSummary(s, mo.y, mo.m, 'personal');
      const business = monthSummary(s, mo.y, mo.m, 'business');
      assert.equal(personal.leftCents + business.leftCents, all.leftCents);
      const carry = carryOver(s, mo.y, mo.m);
      assert.ok(carry.ok);
      assert.equal(carry.cents, running);
      running += all.leftCents;
    }
  }
});

test('random budgets: per day, week, month and year all agree', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const s = randomBudget(seed);
    for (const today of ['2027-12-15', '2028-03-01', '2028-07-31', '2029-02-28']) {
      const results = PERIOD_ORDER.map((p) => breakdown(s, today, p));
      for (const b of results) {
        assert.ok(b.ok, `seed ${seed} ${today} ${b.period}`);
        assert.equal(b.groups.reduce((a, g) => a + g.cents, 0), b.outCents);
        assert.equal(b.income.reduce((a, l) => a + l.cents, 0), b.inCents);
        assert.equal(b.leftCents, b.inCents - b.outCents);
      }
      const outTable = periodTable(results[0].outYear);
      PERIOD_ORDER.forEach((p, i) => assert.equal(results[i].outCents, outTable[p]));
    }
  }
});

test('history matches month-by-month totals', () => {
  const s = randomBudget(42);
  const months = historyMonths(s, '2028-06-15');
  assert.equal(months.length, 7);
  for (const m of months) assert.equal(m.leftCents, monthSummary(s, m.y, m.m).leftCents);
});
