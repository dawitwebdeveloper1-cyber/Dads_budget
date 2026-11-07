// Home: what's left over this month, money in and out, and the next bills.

import { h } from '../ui/dom.js';
import { money, monthLabel, dayLabel, whenLabel, dateLabel } from '../ui/format.js';
import {
  row, list, section, checkWarning, upOrShort, toneOf, bigButton, empty,
} from '../ui/components.js';
import { monthSummary, carryOver, upcomingBills, groupOf } from '../maths/budget.js';
import { ymd, dayNumber } from '../maths/dates.js';
import { FREQUENCIES } from '../maths/schedule.js';
import { monthView } from './history.js';

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
    allOk && carry.cents !== 0 && h('p', { class: 'hero-carry' },
      carry.cents > 0
        ? `Plus ${money(carry.cents)} carried over from earlier months = ${money(total)} in total.`
        : `Minus ${money(-carry.cents)} short from earlier months = ${money(total)} in total.`),
    summary.ok && !carry.ok && checkWarning());
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
    list(bills.map((b) => row({
      title: b.entry.name,
      sub: `${dayLabel(b.day, thisYear)} · ${whenLabel(b.daysAway)}`,
      amount: money(b.entry.amountCents),
      onClick: () => ctx.openForm({ entry: b.entry }),
    }))));
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
      tiles(ctx, summary),
      comingUp(ctx),
      latest(ctx),
      ctx.state.onboarded && !ctx.state.entries.length && empty('Nothing added yet. Tap the + button to add money in or out.'));
  },
};
