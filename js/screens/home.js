// Home: what's left over this month, money in and out, and the next bills.

import { h } from '../ui/dom.js';
import { money, monthLabel, monthName, dayLabel, whenLabel, dateLabel } from '../ui/format.js';
import {
  row, list, section, checkWarning, upOrShort, toneOf, bigButton, empty, showMeHow,
} from '../ui/components.js';
import { monthSummary, carryOver, upcomingBills, groupOf, historyMonths } from '../maths/budget.js';
import { ymd, dayNumber } from '../maths/dates.js';
import { FREQUENCIES } from '../maths/schedule.js';
import { explainMonth, explainCarry } from '../insights/explain.js';
import { notesArea, markPaidWithUndo } from '../ui/notes.js';
import { monthView } from './history.js';
import { recapToShow, recapId } from '../insights/recap.js';
import { dismissNote } from '../data/model.js';

function welcomeCard(ctx) {
  const s = ctx.state;
  if (s.onboarded) return null;
  const hasIn = s.entries.some((e) => e.kind === 'in');
  const hasOut = s.entries.some((e) => e.kind === 'out');
  const finish = () => ctx.update((st) => ({ ...st, onboarded: true }));

  let step;
  if (!hasIn) {
    step = [
      h('h2', {}, 'Welcome!'),
      h('p', {}, 'Let\'s set things up in two quick steps. First, add your paycheque.'),
      bigButton('Add my paycheque', () => ctx.openForm({ preset: { kind: 'in', name: 'Paycheque', freq: 'biweekly' } })),
    ];
  } else if (!hasOut) {
    step = [
      h('h2', {}, 'Step 2 of 2'),
      h('p', {}, 'Nice! Now add one bill, like your phone bill or rent.'),
      bigButton('Add a bill', () => ctx.openForm({ preset: { kind: 'out', freq: 'monthly' } })),
    ];
  } else {
    step = [
      h('h2', {}, 'You\'re all set'),
      h('p', {}, 'Tap the big + button any time to add money in or out. The number below shows where you stand this month.'),
      bigButton('Got it', finish),
    ];
  }
  return h('div', { class: 'card welcome' }, step,
    !(hasIn && hasOut) && h('button', { type: 'button', class: 'link-btn', onclick: finish }, 'Skip for now'));
}

function heroCard(ctx, summary, carry) {
  const tone = toneOf(summary.leftCents);
  const allOk = summary.ok && carry.ok;
  const total = summary.leftCents + carry.cents;
  return h('div', { class: `card hero ${tone}` },
    h('p', { class: 'hero-label' }, 'Left over this month'),
    summary.ok
      ? [h('p', { class: 'hero-amount' }, money(summary.leftCents)), h('p', { class: 'hero-words' }, upOrShort(summary.leftCents))]
      : checkWarning(),
    summary.ok && showMeHow(() => explainMonth(summary)),
    allOk && carry.cents !== 0 && h('p', { class: 'hero-carry' },
      carry.cents > 0
        ? `Plus ${money(carry.cents)} carried over from earlier months = ${money(total)} in total.`
        : `Minus ${money(-carry.cents)} short from earlier months = ${money(total)} in total.`),
    allOk && carry.cents !== 0 && showMeHow(() => {
      const earlier = historyMonths(ctx.state, ctx.today).slice(1).reverse();
      return explainCarry(earlier, summary.leftCents);
    }, 'Show me how (carried over)'),
    summary.ok && !carry.ok && checkWarning());
}

/** Last month in short, shown for the first week of a new month. */
function recapCard(ctx) {
  const r = recapToShow(ctx.state, ctx.today);
  if (!r || !r.ok) return null;
  const name = monthName(r.m);
  return h('div', { class: 'card recap' },
    h('div', { class: 'recap-head' },
      h('h2', {}, `${name} in short`),
      h('button', {
        type: 'button', class: 'note-x', 'aria-label': `Put away the ${name} summary`,
        onclick: () => ctx.update((s) => dismissNote(s, recapId(r.y, r.m), ctx.today)),
      }, '×')),
    h('div', { class: 'month-figures' },
      h('span', {}, h('small', {}, 'In'), money(r.inCents)),
      h('span', {}, h('small', {}, 'Out'), money(r.outCents)),
      h('span', { class: toneOf(r.leftCents) }, h('small', {}, 'Left'), money(r.leftCents))),
    h('p', { class: `month-words ${toneOf(r.leftCents)}` }, upOrShort(r.leftCents).replace('You\'re', `In ${name} you were`).replace('were even', 'broke even')),
    r.top.length > 0 && [
      h('p', { class: 'recap-sub' }, `Biggest costs in ${name}`),
      h('ol', { class: 'recap-top' }, r.top.map((t) => h('li', {}, h('span', {}, `${t.isFolder ? '📁 ' : ''}${t.name}`), h('span', {}, money(t.cents))))),
    ],
    showMeHow(() => explainMonth(monthSummary(ctx.state, r.y, r.m))),
    h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => ctx.push(monthView(r.y, r.m)) }, `See all of ${name}`));
}

function tiles(ctx, summary) {
  const open = () => ctx.push(monthView(summary.y, summary.m));
  return h('div', { class: 'tiles' },
    h('button', { type: 'button', class: 'tile tappable', onclick: open },
      h('span', { class: 'tile-label' }, 'Money in'),
      h('span', { class: 'tile-amount up' }, summary.ok ? money(summary.inCents) : '—')),
    h('button', { type: 'button', class: 'tile tappable', onclick: open },
      h('span', { class: 'tile-label' }, 'Money out'),
      h('span', { class: 'tile-amount down' }, summary.ok ? money(summary.outCents) : '—')));
}

function comingUp(ctx) {
  const bills = upcomingBills(ctx.state, ctx.today, 3);
  if (!bills.length) return null;
  const thisYear = ymd(dayNumber(ctx.today)).y;
  return section('Coming up',
    list(bills.map((b) => h('div', { class: 'row bill-row' },
      h('button', { type: 'button', class: 'bill-main tappable', onclick: () => ctx.openForm({ entry: b.entry }) },
        h('span', { class: 'row-main' },
          h('span', { class: 'row-title' }, b.entry.name),
          h('span', { class: 'row-sub' }, `${dayLabel(b.day, thisYear)} · ${whenLabel(b.daysAway)}`)),
        h('span', { class: 'row-amount' }, money(b.entry.amountCents))),
      h('button', {
        type: 'button',
        class: 'paid-btn',
        'aria-label': `Mark ${b.entry.name} paid`,
        onclick: () => markPaidWithUndo(ctx, b.entry, b.iso),
      }, 'Paid')))),
    h('p', { class: 'muted small-note' }, 'Tap "Paid" when you\'ve paid one, and the next one shows instead.'));
}

function latest(ctx) {
  const entries = [...ctx.state.entries].reverse().slice(0, 5);
  if (!entries.length) return null;
  const thisYear = ymd(dayNumber(ctx.today)).y;
  return section('Latest entries',
    list(entries.map((e) => {
      const where = groupOf(ctx.state, e).name;
      const when = FREQUENCIES[e.freq].recurring ? FREQUENCIES[e.freq].label : dateLabel(e.startDate, thisYear);
      return row({
        title: e.name,
        sub: e.kind === 'in' ? `Money in · ${when}` : `${where} · ${when}`,
        amount: `${e.kind === 'in' ? '+' : '−'}${money(e.amountCents)}`,
        tone: e.kind === 'in' ? 'up' : '',
        onClick: () => ctx.openForm({ entry: e }),
      });
    })));
}

export default {
  id: 'home',
  label: 'Home',
  icon: 'home',
  title: 'Home',
  render(ctx) {
    const { y, m } = ymd(dayNumber(ctx.today));
    const summary = monthSummary(ctx.state, y, m);
    const carry = carryOver(ctx.state, y, m);
    return h('div', { class: 'screen' },
      h('header', { class: 'screen-head' }, h('p', { class: 'screen-kicker' }, monthLabel(y, m))),
      welcomeCard(ctx),
      heroCard(ctx, summary, carry),
      notesArea(ctx),
      recapCard(ctx),
      tiles(ctx, summary),
      comingUp(ctx),
      latest(ctx),
      ctx.state.onboarded && !ctx.state.entries.length && empty('Nothing added yet. Tap the + button to add money in or out.'));
  },
};
