// Typo and duplicate checks, run before anything is saved.

import { normalizeName } from './budget.js';
import { FREQUENCIES, activeRange } from './schedule.js';
import { dayNumber } from './dates.js';

/** Over this, we double-check even when there's nothing to compare against ($10,000). */
export const BIG_FIRST_AMOUNT_CENTS = 1_000_000;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Is this amount far away from what he usually puts for this name?
 * Returns null if it looks fine, or { reason, usualCents } if we should ask
 * "Are you sure?". "Far away" means at least 5 times bigger (and at least
 * $50 more), or 10 times smaller, than his usual amount.
 */
export function unusualAmount(state, draft, editingId = null) {
  const name = normalizeName(draft.name);
  const past = state.entries
    .filter((e) => e.id !== editingId && e.kind === draft.kind && normalizeName(e.name) === name)
    .map((e) => e.amountCents);
  if (editingId) {
    const original = state.entries.find((e) => e.id === editingId);
    if (original) past.push(original.amountCents);
  }
  const amount = draft.amountCents;
  if (past.length === 0) {
    return amount >= BIG_FIRST_AMOUNT_CENTS ? { reason: 'big', usualCents: null } : null;
  }
  const usual = median(past);
  if (amount >= usual * 5 && amount - usual >= 5000) return { reason: 'bigger', usualCents: usual };
  if (amount * 10 <= usual) return { reason: 'smaller', usualCents: usual };
  return null;
}

/**
 * Does this look like something that's already been entered?
 * - Same name and both repeating the same way (and both still going), or
 * - Same name and same amount within 3 days of each other.
 * Returns the matching entry, or null.
 */
export function findDuplicate(state, draft, editingId = null) {
  const name = normalizeName(draft.name);
  if (!name) return null;
  const draftDay = dayNumber(draft.startDate);
  const draftRecurring = FREQUENCIES[draft.freq].recurring;
  for (const e of state.entries) {
    if (e.id === editingId || e.kind !== draft.kind || normalizeName(e.name) !== name) continue;
    if (draftRecurring && e.freq === draft.freq) {
      const stillGoing = activeRange(e).hi >= draftDay;
      if (stillGoing) return e;
    }
    if (e.amountCents === draft.amountCents && Math.abs(dayNumber(e.startDate) - draftDay) <= 3) return e;
  }
  return null;
}
