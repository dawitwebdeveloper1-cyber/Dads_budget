// The words behind every "Show me how" button: each total, worked out step by
// step in plain English. Each function returns a list of lines:
//   { kind: 'main' }  the headline sum
//   { kind: 'head' }  a small heading
//   { kind: 'line' }  one step

import { formatCents as money, roundDiv } from '../maths/money.js';
import { PERIODS } from '../maths/periods.js';
import { monthName, monthLabel, dayLabel } from '../ui/format.js';

const main = (text) => ({ kind: 'main', text });
const head = (text) => ({ kind: 'head', text });
const line = (text) => ({ kind: 'line', text });

const FREQ_PHRASE = { weekly: 'a week', biweekly: 'every 2 weeks', monthly: 'a month', yearly: 'a year' };
const FREQ_COUNT = { weekly: 'weeks', biweekly: 'times a year', monthly: 'months', yearly: 'year' };
const FREQ_PERIOD = { weekly: 'week', monthly: 'month', yearly: 'year' };
const PER_YEAR = { weekly: 52, biweekly: 26, monthly: 12, yearly: 1 };

const per = (period) => `a ${PERIODS[period].word}`;

/** "Money in $4,200.00 − Money out $3,530.40 = $669.60 left over." */
export function leftOverSum(inCents, outCents, leftCents) {
  const result = leftCents < 0 ? `${money(leftCents)} (short ${money(-leftCents)})` : `${money(leftCents)} left over`;
  return `Money in ${money(inCents)} − Money out ${money(outCents)} = ${result}.`;
}

function dateList(dates, thisYear) {
  return dates.map((d) => dayLabel(d, thisYear).split(', ').slice(1).join(', ')).join(', ');
}

function itemStep(item, thisYear) {
  const n = item.dates.length;
  const amount = item.entry.amountCents;
  if (n === 1) return line(`${item.entry.name}: ${money(amount)} (${dateList(item.dates, thisYear)})`);
  return line(`${item.entry.name}: ${money(amount)} × ${n} (${dateList(item.dates, thisYear)}) = ${money(item.cents)}`);
}

/** How one month's leftover is worked out, from monthSummary(). */
export function explainMonth(summary) {
  const thisYear = summary.y;
  const lines = [main(leftOverSum(summary.inCents, summary.outCents, summary.leftCents))];
  lines.push(head(`Money in: ${money(summary.inCents)}`));
  if (!summary.income.items.length) lines.push(line('Nothing has come in this month yet.'));
  for (const item of summary.income.items) lines.push(itemStep(item, thisYear));
  lines.push(head(`Money out: ${money(summary.outCents)}`));
  if (!summary.groups.length) lines.push(line('Nothing has gone out this month yet.'));
  for (const g of summary.groups) {
    if (g.items.length === 1) {
      const itemName = g.items[0].entry.name;
      const label = itemName.trim().toLowerCase() === g.name.trim().toLowerCase() ? itemName : `${g.name} · ${itemName}`;
      lines.push(itemStep({ ...g.items[0], entry: { ...g.items[0].entry, name: label } }, thisYear));
    } else {
      lines.push(line(`${g.name}: ${g.items.map((i) => money(i.cents)).join(' + ')} = ${money(g.cents)}`));
    }
  }
  if (summary.groups.length > 1) {
    lines.push(line(`Added up: ${summary.groups.map((g) => money(g.cents)).join(' + ')} = ${money(summary.outCents)}`));
  }
  return lines;
}

/** How the carried-over amount is worked out, from a list of earlier monthSummary() results (oldest first). */
export function explainCarry(earlierMonths, thisMonthLeft) {
  const carry = earlierMonths.reduce((a, s) => a + s.leftCents, 0);
  const lines = [main(`This month ${money(thisMonthLeft)} + carried over ${money(carry)} = ${money(thisMonthLeft + carry)} in total.`)];
  lines.push(head('Left over in earlier months'));
  for (const s of earlierMonths) lines.push(line(`${monthLabel(s.y, s.m)}: ${money(s.leftCents)}`));
  if (earlierMonths.length > 1) {
    lines.push(line(`Added up: ${earlierMonths.map((s) => money(s.leftCents)).join(' + ')} = ${money(carry)}`));
  }
  return lines;
}

function monthRange(how) {
  if (how.months === 1) return monthName(how.windowStart.m);
  return `${monthName(how.windowStart.m)}–${monthName(how.windowEnd.m)}`;
}

/**
 * One line of the Breakdown, converted to the period being shown.
 * Example: "Groceries: $50.00 a week × 52 weeks ÷ 12 months = $216.67 a month"
 */
export function explainLine(ln, period) {
  const P = PERIODS[period];
  const exact = roundDiv(ln.yearCents, P.perYear);
  let text;
  if (ln.how.type === 'repeating') {
    const { amountCents, freq } = ln.how;
    if (FREQ_PERIOD[freq] === period) {
      text = `${money(amountCents)} ${FREQ_PHRASE[freq]}`;
    } else {
      text = `${money(amountCents)} ${FREQ_PHRASE[freq]}`;
      if (PER_YEAR[freq] !== 1) text += ` × ${PER_YEAR[freq]} ${FREQ_COUNT[freq]}`;
      if (P.perYear !== 1) text += ` ÷ ${P.perYear} ${P.plural}`;
      text += ` = ${money(exact)} ${per(period)}`;
    }
  } else {
    const { totalCents, months, soFar } = ln.how;
    const source = soFar ? `${money(totalCents)} so far this month` : `${money(totalCents)} in ${monthRange(ln.how)}`;
    if (period === 'month') {
      text = months === 1 ? `${source} = ${money(exact)} a month` : `${source} ÷ ${months} months = ${money(exact)} a month`;
    } else {
      text = `${source}${months === 1 ? '' : ` ÷ ${months}`} × 12 months = ${money(ln.yearCents)} a year`;
      if (P.perYear !== 1) text += ` ÷ ${P.perYear} ${P.plural} = ${money(exact)} ${per(period)}`;
    }
  }
  if (ln.cents !== undefined && ln.cents !== exact) {
    text += ` (shown as ${money(ln.cents)} so the total adds up exactly)`;
  }
  return `${ln.name}: ${text}`;
}

/** How the Breakdown summary is worked out, from breakdown(). */
export function explainBreakdown(b) {
  const p = b.period;
  const lines = [main(`Money in ${money(b.inCents)} − Money out ${money(b.outCents)} = ${money(b.leftCents)} left over ${per(p)}.`)];
  lines.push(head(`Money in ${per(p)}: ${money(b.inCents)}`));
  if (!b.income.length) lines.push(line('No regular money in yet.'));
  for (const l of b.income) lines.push(line(explainLine(l, p)));
  lines.push(head(`Money out ${per(p)}: ${money(b.outCents)}`));
  if (!b.groups.length) lines.push(line('No regular money out yet.'));
  for (const g of b.groups) lines.push(line(`${g.name}: ${money(g.cents)}`));
  if (b.groups.length > 1) lines.push(line(`Added up: ${b.groups.map((g) => money(g.cents)).join(' + ')} = ${money(b.outCents)}`));
  lines.push(line('Tap a category to see how each cost in it is worked out.'));
  lines.push(line('One-time costs are left out, because they aren\'t part of a normal month.'));
  return lines;
}

/** How one category or folder's usual cost is worked out. */
export function explainGroup(g, period) {
  const lines = [main(g.lines.length > 1
    ? `${g.lines.map((l) => money(l.cents)).join(' + ')} = ${money(g.cents)} ${per(period)}`
    : `${money(g.cents)} ${per(period)}`)];
  for (const l of g.lines) lines.push(line(explainLine(l, period)));
  return lines;
}
