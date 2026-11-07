import { newState, addEntry, addFolder } from '../js/data/model.js';

/** Build a state by adding entries the normal way, so all the same checks run. */
export function buildState(entries, { today = '2026-01-01', folders = [] } = {}) {
  let state = newState();
  for (const name of folders) state = addFolder(state, name, `fold-${name.toLowerCase()}`);
  let n = 0;
  for (const draft of entries) {
    n += 1;
    state = addEntry(state, { tag: 'personal', categoryId: 'cat-other', ...draft }, today, draft.id ?? `e${n}`);
  }
  return state;
}

export const pay = (amountCents, startDate, extra = {}) => ({ kind: 'in', name: 'Paycheque', amountCents, freq: 'biweekly', startDate, ...extra });
export const bill = (name, amountCents, freq, startDate, categoryId = 'cat-bills', extra = {}) => ({ kind: 'out', name, amountCents, freq, startDate, categoryId, ...extra });
