// History: every month so far, and what happened in each one.

import { h } from '../ui/dom.js';
import { money, monthLabel, monthName, dayLabel } from '../ui/format.js';
import {
  row, list, section, screenTitle, checkWarning, upOrShort, toneOf, empty, showMeHow,
} from '../ui/components.js';
import { explainMonth } from '../insights/explain.js';
import { historyMonths, monthSummary } from '../maths/budget.js';
import { ymd, dayNumber, addMonths, compareMonths, parseMonthKey } from '../maths/dates.js';
import { filterSwitch } from './shared.js';

function compareLine(now, before) {
  if (!before || !now.ok || !before.ok) return null;
  const diff = now.leftCents - before.leftCents;
  const name = monthName(before.m);
  if (diff > 0) return `${money(diff)} more left than ${name}`;
  if (diff < 0) return `${money(-diff)} less left than ${name}`;
  return `Same as ${name}`;
}

function totalsCard(s, label, withHow = false) {
  return h('div', { class: `card month-card ${toneOf(s.leftCents)}` },
    label && h('p', { class: 'month-card-title' }, label),
    s.ok
      ? [
        h('div', { class: 'month-figures' },
          h('span', {}, h('small', {}, 'In'), money(s.inCents)),
          h('span', {}, h('small', {}, 'Out'), money(s.outCents)),
          h('span', { class: 'month-left' }, h('small', {}, 'Left'), money(s.leftCents))),
        h('p', { class: 'month-words' }, upOrShort(s.leftCents)),
        withHow && showMeHow(() => explainMonth(s)),
      ]
      : checkWarning());
}

function itemRows(ctx, items, thisYear) {
  return items.map((item) => row({
    title: item.entry.name,
    sub: item.dates.length > 1
      ? `${item.dates.length} times: ${item.dates.map((d) => dayLabel(d, thisYear).split(', ').slice(1).join(', ')).join(', ')}`
      : dayLabel(item.dates[0], thisYear),
    amount: money(item.cents),
    onClick: () => ctx.openForm({ entry: item.entry }),
  }));
}

/** One month in detail: every item, grouped by category and folder. */
export function monthView(y, m) {
  return {
    title: monthLabel(y, m),
    render(ctx) {
      const filter = ctx.prefs.filter;
      const s = monthSummary(ctx.state, y, m, filter);
      const prevMonth = addMonths(y, m, -1);
      const start = parseMonthKey(ctx.state.startMonth);
      const prev = start && compareMonths(prevMonth, start) >= 0 ? monthSummary(ctx.state, prevMonth.y, prevMonth.m, filter) : null;
      const prevByKey = new Map((prev?.groups ?? []).map((g) => [g.key, g.cents]));
      const thisYear = ymd(dayNumber(ctx.today)).y;

      return h('div', { class: 'screen' },
        filterSwitch(ctx),
        totalsCard(s, null, true),
        compareLine(s, prev) && h('p', { class: 'muted center' }, compareLine(s, prev)),
        !s.items.length && empty('Nothing in this month.'),
        s.income.items.length > 0 && section('Money in', list(itemRows(ctx, s.income.items, thisYear))),
        s.groups.map((g) => {
          const before = prevByKey.get(g.key);
          return h('section', { class: 'section' },
            h('div', { class: 'group-head' },
              h('h2', { class: 'section-title' }, g.type === 'folder' ? `📁 ${g.name}` : g.name),
              h('span', { class: 'group-total' }, money(g.cents))),
            prev && h('p', { class: 'group-compare' },
              before === undefined ? `Nothing here in ${monthName(prevMonth.m)}` : `${monthName(prevMonth.m)}: ${money(before)}`),
            list(itemRows(ctx, g.items, thisYear)));
        }));
    },
  };
}

export default {
  id: 'history',
  label: 'History',
  icon: 'history',
  title: 'History',
  render(ctx) {
    const months = historyMonths(ctx.state, ctx.today, ctx.prefs.filter);
    const now = ymd(dayNumber(ctx.today));
    return h('div', { class: 'screen' },
      screenTitle('History', 'Tap a month to see everything in it.'),
      filterSwitch(ctx),
      !months.length && empty('Your months will show up here once you add something.'),
      months.map((s, i) => {
        const isNow = s.y === now.y && s.m === now.m;
        const compare = compareLine(s, months[i + 1]);
        return h('button', { type: 'button', class: 'month-button tappable', onclick: () => ctx.push(monthView(s.y, s.m)) },
          totalsCard(s, `${monthLabel(s.y, s.m)}${isNow ? ' (so far)' : ''}`),
          compare && h('span', { class: 'month-compare' }, compare));
      }));
  },
};
