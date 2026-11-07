// Gentle notes: small, friendly hints near the big number. Never alarms.
// At most two show at a time, he can swipe any away, and he can turn them
// all off in More.
//
// Each note: { id, tone: 'warn' | 'info' | 'good', text, why: [lines], action }
// The id includes the month (or the bill's date), so a note he swiped away
// can come back next month if it's true again.

import { formatCents as money, roundDiv } from '../maths/money.js';
import {
  dayNumber, ymd, monthStartDay, daysInMonth, addMonths, compareMonths, parseMonthKey, monthKey,
} from '../maths/dates.js';
import { monthSummary, upcomingBills, spendingBetween } from '../maths/budget.js';
import { monthName, dayLabel, plural } from '../ui/format.js';
import { limitStatus } from './limits.js';
import { goalPlan } from './goals.js';
import { backupDue } from '../data/backup.js';

export const MAX_NOTES = 2;

/** Notes about spending only start this many days into the month, so they're fair. */
export const COMPARE_FROM_DAY = 7;
export const SHORTFALL_FROM_DAY = 5;
/** A change has to be at least $50 and at least a fifth bigger or smaller to be worth a note. */
export const CHANGE_MIN_CENTS = 5000;

const line = (text) => ({ kind: 'line', text });
const main = (text) => ({ kind: 'main', text });

/** Whole dollars for friendly text: 15049 -> "$150" */
export function roughMoney(cents) {
  return money(roundDiv(cents, 100) * 100).replace(/\.00$/, '');
}

export function adviceNotes(state, todayISO) {
  const dismissed = state.settings?.dismissed ?? {};
  // The backup reminder shows even with notes turned off, because losing data is worse.
  if (state.settings?.notes === false) return backupNotes(state, todayISO).filter((n) => !dismissed[n.id]);
  const limits = limitNotes(state, todayISO);
  const notes = [
    ...shortfallNotes(state, todayISO),
    ...limits.filter((n) => n.tone === 'warn'),
    ...billNotes(state, todayISO),
    ...backupNotes(state, todayISO),
    ...limits.filter((n) => n.tone !== 'warn'),
    ...goalNotes(state, todayISO),
    ...comparisonNotes(state, todayISO),
  ];
  return notes.filter((n) => !dismissed[n.id]).slice(0, MAX_NOTES);
}

const weekKey = (todayISO) => Math.floor(dayNumber(todayISO) / 7);

/** "You've used 80% of your Gas budget with 10 days left." / "You've gone $40 over your Gas limit." */
export function limitNotes(state, todayISO) {
  const { y, m } = ymd(dayNumber(todayISO));
  const notes = [];
  for (const l of limitStatus(state, todayISO)) {
    const why = [
      line(`Limit for ${monthName(m)}: ${money(l.limitCents)}`),
      line(`Spent so far: ${money(l.usedCents)} (${l.percent}%)`),
      line(l.leftCents >= 0 ? `Left to spend: ${money(l.leftCents)}, with ${plural(l.daysLeft, 'day')} to go.` : `Over by: ${money(-l.leftCents)}`),
    ];
    if (l.usedCents > l.limitCents) {
      notes.push({
        id: `over:${l.key}:${monthKey(y, m)}`,
        tone: 'warn',
        text: `You've gone ${roughMoney(l.usedCents - l.limitCents)} over your ${l.name} limit this month.`,
        why, action: null,
      });
    } else if (l.percent >= 80) {
      notes.push({
        id: `near:${l.key}:${monthKey(y, m)}`,
        tone: 'info',
        text: l.daysLeft > 0
          ? `You've used ${l.percent}% of your ${l.name} budget with ${plural(l.daysLeft, 'day')} left.`
          : `You've used ${l.percent}% of your ${l.name} budget this month.`,
        why, action: null,
      });
    }
  }
  return notes;
}

/** "Put away $50 more this week to stay on track for your repair fund." */
export function goalNotes(state, todayISO) {
  const notes = [];
  for (const goal of state.goals ?? []) {
    const plan = goalPlan(goal, todayISO);
    if (plan.done) {
      notes.push({
        id: `goaldone:${goal.id}`,
        tone: 'good',
        text: `Well done! You reached your ${goal.name} goal of ${roughMoney(goal.targetCents)}.`,
        why: [line(`Saved: ${money(plan.saved)} of ${money(goal.targetCents)}.`)],
        action: null,
      });
      continue;
    }
    if (plan.perWeek === null) continue;
    const needMore = plan.perWeek - plan.lastWeekCents;
    if (needMore < 500) continue;
    notes.push({
      id: `goal:${goal.id}:${weekKey(todayISO)}`,
      tone: 'info',
      text: `Put away ${roughMoney(Math.ceil(needMore / 100) * 100)} more this week to stay on track for ${goal.name}.`,
      why: [
        line(`${money(plan.remaining)} still to go, with ${plural(plan.weeksLeft, 'week')} left.`),
        line(`${money(plan.remaining)} ÷ ${plan.weeksLeft} = ${money(plan.perWeek)} a week.`),
        line(`Put away in the last 7 days: ${money(plan.lastWeekCents)}.`),
      ],
      action: { type: 'goal', label: 'Add money', goalId: goal.id },
    });
  }
  return notes;
}

/** "Time to back up your data" — about once a week. */
export function backupNotes(state, todayISO) {
  if (!backupDue(state, todayISO)) return [];
  const last = state.settings?.lastBackup;
  return [{
    id: `backup:${weekKey(todayISO)}`,
    tone: 'info',
    text: 'Time to back up your data.',
    why: [line(last
      ? `Your last backup was on ${dayLabel(dayNumber(last))}. A backup is one small file you can keep in Files or iCloud Drive, so nothing is lost if you change or lose your phone.`
      : 'You haven\'t made a backup yet. A backup is one small file you can keep in Files or iCloud Drive, so nothing is lost if you change or lose your phone.')],
    action: { type: 'backup', label: 'Back up now' },
  }];
}

/** "At this pace you'll be about $150 short this month." */
export function shortfallNotes(state, todayISO) {
  const today = dayNumber(todayISO);
  const { y, m, d } = ymd(today);
  if (d < SHORTFALL_FROM_DAY) return [];
  const s = monthSummary(state, y, m);
  if (!s.ok || !s.items.length) return [];

  let variesSoFar = 0;
  for (const item of s.items) {
    if (item.entry.kind === 'out' && item.entry.freq === 'varies' && item.dates[0] <= today) variesSoFar += item.cents;
  }
  const days = daysInMonth(y, m);
  const paceTotal = roundDiv(variesSoFar * days, d);
  const extra = paceTotal - variesSoFar;
  const projected = s.leftCents - extra;
  if (projected >= 0) return [];

  const why = [line(`So far this month: money in ${money(s.inCents)}, money out ${money(s.outCents)}. Bills still to come this month are already counted.`)];
  if (variesSoFar > 0) {
    why.push(line(`Spending that changes each time (like gas) is ${money(variesSoFar)} after ${d} days. At that pace it comes to about ${money(paceTotal)} for all ${days} days, so about ${money(extra)} more.`));
  }
  why.push(main(`${money(s.inCents)} − ${money(s.outCents)}${extra ? ` − ${money(extra)}` : ''} = ${money(projected)}`));
  return [{
    id: `short:${monthKey(y, m)}`,
    tone: 'warn',
    text: `At this pace you'll be about ${roughMoney(-projected)} short this month.`,
    why,
    action: null,
  }];
}

/** "Phone bill ($85.00) is due in 3 days." */
export function billNotes(state, todayISO) {
  const soon = upcomingBills(state, todayISO, 5).filter((b) => b.daysAway <= 3);
  if (!soon.length) return [];
  const b = soon[0];
  const when = b.daysAway === 0 ? 'due today' : b.daysAway === 1 ? 'due tomorrow' : `due in ${b.daysAway} days`;
  return [{
    id: `bill:${b.entry.id}:${b.iso}`,
    tone: 'info',
    text: `${b.entry.name} (${money(b.entry.amountCents)}) is ${when}.`,
    why: [line(`It's due on ${dayLabel(b.day)}. Tap "Mark paid" once it's paid and this note goes away.`)],
    action: { type: 'paid', label: 'Mark paid', entryId: b.entry.id, iso: b.iso },
  }];
}

/**
 * "Food is $120 higher than last month." / "Nice, you spent $90 less on Food than last month."
 * Compares the same days of each month (for example the 1st to the 15th) so it's fair mid-month.
 */
export function comparisonNotes(state, todayISO) {
  const today = dayNumber(todayISO);
  const { y, m, d } = ymd(today);
  if (d < COMPARE_FROM_DAY) return [];
  const prev = addMonths(y, m, -1);
  const start = parseMonthKey(state.startMonth);
  if (!start || compareMonths(prev, start) < 0) return [];

  const prevDays = Math.min(d, daysInMonth(prev.y, prev.m));
  const now = spendingBetween(state, monthStartDay(y, m), today);
  const before = spendingBetween(state, monthStartDay(prev.y, prev.m), monthStartDay(prev.y, prev.m) + prevDays - 1);
  const keys = new Set([...now.keys(), ...before.keys()]);

  const notes = [];
  for (const key of keys) {
    const group = (now.get(key) ?? before.get(key)).group;
    const nowCents = now.get(key)?.cents ?? 0;
    const beforeCents = before.get(key)?.cents ?? 0;
    const diff = nowCents - beforeCents;
    const size = Math.abs(diff);
    if (size < CHANGE_MIN_CENTS || size * 5 < beforeCents) continue;
    const why = [
      line(`${monthName(m)} 1–${d}: ${money(nowCents)}`),
      line(`${monthName(prev.m)} 1–${prevDays}: ${money(beforeCents)}`),
      line(`That's ${money(size)} ${diff > 0 ? 'more' : 'less'}. Comparing the same days of each month keeps it fair.`),
    ];
    notes.push(diff > 0
      ? {
        id: `more:${key}:${monthKey(y, m)}`,
        tone: 'info',
        text: `${group.name} is ${roughMoney(size)} higher than last month. Want to take a look?`,
        why,
        action: { type: 'month', label: 'Take a look', y, m },
        size,
      }
      : {
        id: `less:${key}:${monthKey(y, m)}`,
        tone: 'good',
        text: `Nice, you spent ${roughMoney(size)} less on ${group.name} than last month.`,
        why,
        action: null,
        size,
      });
  }
  return notes.sort((a, b) => b.size - a.size);
}
