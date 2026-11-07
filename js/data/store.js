// Keeps the budget saved on the phone itself (in the browser's storage for
// this app). Nothing is ever sent anywhere.

import { newState, loadState } from './model.js';

const KEY = 'dads-budget.data.v1';

let state = newState();
let loadProblem = null;
const listeners = new Set();

export function init() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    state = raw ? loadState(JSON.parse(raw)) : newState();
  } catch (err) {
    // Keep the damaged copy aside so nothing is lost, then start fresh.
    loadProblem = err.message;
    try { if (raw) localStorage.setItem(`${KEY}.damaged-${Date.now()}`, raw); } catch { /* storage full */ }
    state = newState();
  }
  // Ask the phone to keep this data even when space runs low.
  try { navigator.storage?.persist?.(); } catch { /* not supported */ }
  return { loadProblem };
}

export function getState() {
  return state;
}

/**
 * Apply a change. `change` gets the current data and returns the new data.
 * The new data is saved before anyone sees it; if saving fails, nothing changes.
 */
export function update(change) {
  const next = change(state);
  if (next === state) return state;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    throw new Error('Your phone couldn\'t save this. It may be out of space.');
  }
  state = next;
  for (const fn of listeners) fn(state);
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
