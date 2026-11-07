// Breakdown: his usual money per day, week, month or year, biggest costs first.

import { h } from '../ui/dom.js';
import { money, howOften, monthName, dateLabel, plural } from '../ui/format.js';
import {
  row, list, section, screenTitle, checkWarning, segmented, barRow, empty, toneOf, upOrShort, showMeHow,
} from '../ui/components.js';
import { explainBreakdown, explainGroup } from '../insights/explain.js';
import { breakdown, groupOf, matchesFilter, normalizeName } from '../maths/budget.js';
import { PERIODS, PERIOD_ORDER } from '../maths/periods.js';
import { ymd, dayNumber } from '../maths/dates.js';
import { filterSwitch } from './shared.js';

const per = (period) => `a ${PERIODS[period].word}`;

function periodSwitch(ctx) {
  return segmented({
    label: 'Show per day, week, month or year',
    value: ctx.prefs.period,
    options: PERIOD_ORDER.map((p) => ({ value: p, label: PERIODS[p].label })),
    onChange: (v) => { ctx.prefs.period = v; ctx.render(); },
  });
}

function lineSub(line) {
  if (line.how.type === 'repeating') return howOften(line.entries[0]);
  const { months, soFar, count, windowStart, windowEnd } = line.how;
  if (soFar) return `This month so far (${plural(count, 'entry', 'entries')})`;
  if (months === 1) return `From ${monthName(windowStart.m)} (${plural(count, 'entry', 'entries')})`;
  return `Average of ${monthName(windowStart.m)}–${monthName(windowEnd.m)} (${plural(count, 'entry', 'entries')})`;
}

function lineRows(ctx, lines) {
  return lines.map((line) => row({
    title: line.name,
    sub: lineSub(line),
    amount: money(line.cents),
    onClick: line.how.type === 'repeating'
      ? () => ctx.openForm({ entry: line.entries[0] })
      : () => ctx.push(logsView(line.entries[0])),
  }));
}

/** Every entry logged for something that changes each time (like gas). */
function logsView(sample) {
  return {
    title: sample.name,
    render(ctx) {
      const state = ctx.state;
      const key = groupOf(state, sample).key;
      const logs = state.entries
        .filter((e) => e.freq === 'varies' && e.kind === sample.kind && groupOf(state, e).key === key
          && normalizeName(e.name) === normalizeName(sample.name) && matchesFilter(e, ctx.prefs.filter))
        .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
      const thisYear = ymd(dayNumber(ctx.today)).y;
      return h('div', { class: 'screen' },
        h('p', { class: 'muted' }, 'Every one you\'ve added, newest first. Tap one to change it.'),
        !logs.length && empty('Nothing here any more.'),
        logs.length > 0 && list(logs.map((e) => row({
          title: dateLabel(e.startDate, thisYear),
          amount: money(e.amountCents),
          onClick: () => ctx.openForm({ entry: e }),
        }))));
    },
  };
}

/** Everything inside one category or folder. */
function groupView(groupKey, name) {
  return {
    title: name,
    render(ctx) {
      const period = ctx.prefs.period;
      const b = breakdown(ctx.state, ctx.today, period, ctx.prefs.filter);
      const g = b.groups.find((x) => x.key === groupKey);
      const oneOffs = ctx.state.entries
        .filter((e) => e.freq === 'once' && e.kind === 'out' && groupOf(ctx.state, e).key === groupKey && matchesFilter(e, ctx.prefs.filter))
        .sort((a, c) => (a.startDate < c.startDate ? 1 : -1));
      const thisYear = ymd(dayNumber(ctx.today)).y;
      return h('div', { class: 'screen' },
        periodSwitch(ctx),
        !b.ok && checkWarning(),
        b.ok && g && h('div', { class: 'card total-card' },
          h('p', { class: 'hero-label' }, `Usual cost ${per(period)}`),
          h('p', { class: 'total-amount' }, money(g.cents)),
          showMeHow(() => explainGroup(g, period))),
        b.ok && g && section('What\'s in it', list(lineRows(ctx, g.lines))),
        !g && empty('No regular costs in here right now.'),
        oneOffs.length > 0 && section('One-time costs',
          h('p', { class: 'muted' }, 'These count only in their own month, not in the usual cost above.'),
          list(oneOffs.map((e) => row({
            title: e.name,
            sub: dateLabel(e.startDate, thisYear),
            amount: money(e.amountCents),
            onClick: () => ctx.openForm({ entry: e }),
          })))));
    },
  };
}

export default {
  id: 'breakdown',
  label: 'Breakdown',
  icon: 'chart',
  title: 'Breakdown',
  render(ctx) {
    const period = ctx.prefs.period;
    const b = breakdown(ctx.state, ctx.today, period, ctx.prefs.filter);
    const biggest = Math.max(1, ...b.groups.map((g) => g.cents));
    return h('div', { class: 'screen' },
      screenTitle('Breakdown', 'Your usual money. One-time costs are left out.'),
      periodSwitch(ctx),
      filterSwitch(ctx),
      !b.ok
        ? checkWarning()
        : h('div', { class: 'card summary-card' },
          h('div', { class: 'summary-line' }, h('span', {}, `Money in ${per(period)}`), h('span', { class: 'up' }, money(b.inCents))),
          h('div', { class: 'summary-line' }, h('span', {}, `Money out ${per(period)}`), h('span', { class: 'down' }, money(b.outCents))),
          h('div', { class: `summary-line total ${toneOf(b.leftCents)}` }, h('span', {}, 'Left over'), h('span', {}, money(b.leftCents))),
          h('p', { class: 'summary-words' }, upOrShort(b.leftCents).replace('You\'re', `Usually you're`)),
          showMeHow(() => explainBreakdown(b))),
      b.ok && b.groups.length > 0 && section('Where your money goes',
        h('div', { class: 'bars' }, b.groups.map((g) => barRow({
          name: g.name,
          cents: g.cents,
          fraction: g.cents / biggest,
          isFolder: g.type === 'folder',
          onClick: () => ctx.push(groupView(g.key, g.name)),
        })))),
      b.ok && b.income.length > 0 && section('Money in', list(lineRows(ctx, b.income))),
      b.ok && !b.groups.length && !b.income.length
        && empty('Once you add regular money in and out (like your pay and bills), your usual month shows here.'));
  },
};
