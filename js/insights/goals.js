// Savings goals: how far along each one is, and what it takes to stay on track.

import { dayNumber } from '../maths/dates.js';
import { divMod } from '../maths/money.js';
import { goalSaved } from '../data/model.js';

/**
 * percent is rounded down (never shows 100% early).
 * If the goal has a "by" date: perWeek is what's needed each week from now on
 * (rounded up to the cent), and lastWeekCents is what he put in over the last 7 days.
 */
export function goalPlan(goal, todayISO) {
  const today = dayNumber(todayISO);
  const saved = goalSaved(goal);
  const remaining = Math.max(0, goal.targetCents - saved);
  const done = remaining === 0;
  const percent = Math.min(100, Math.floor((saved * 100) / goal.targetCents));
  const plan = { saved, remaining, done, percent, perWeek: null, weeksLeft: null, daysLeft: null, lastWeekCents: 0 };
  plan.lastWeekCents = goal.deposits
    .filter((dep) => dayNumber(dep.date) > today - 7 && dayNumber(dep.date) <= today)
    .reduce((t, dep) => t + dep.cents, 0);
  if (!goal.byDate || done) return plan;
  plan.daysLeft = dayNumber(goal.byDate) - today;
  if (plan.daysLeft < 0) return plan;
  plan.weeksLeft = Math.max(1, Math.ceil(plan.daysLeft / 7));
  const { q, r } = divMod(remaining, plan.weeksLeft);
  plan.perWeek = r ? q + 1 : q;
  return plan;
}
