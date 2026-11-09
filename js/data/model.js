// The shape of the saved data and every change that can be made to it.
// These functions never change the data in place: they return a new copy.
// That keeps them easy to test (and makes "Undo" simple in Stage 3).

import { OTHER_CATEGORY_ID, normalizeName, trackingStartDay } from '../maths/budget.js';
import { FREQUENCIES, occurrences } from '../maths/schedule.js';
import {
  dayNumber, ymd, monthKey, monthStartDay, monthEndDay, isoDate, isValidDate, parseMonthKey, weekday,
} from '../maths/dates.js';
import { MAX_CENTS } from '../maths/money.js';
import { DEFAULT_ANCHOR } from '../maths/mileage.js';

export const DATA_VERSION = 1;

export const DEFAULT_CATEGORIES = [
  { id: 'cat-housing', name: 'Housing' },
  { id: 'cat-food', name: 'Food' },
  { id: 'cat-gas', name: 'Gas' },
  { id: 'cat-bills', name: 'Bills' },
  { id: 'cat-kids', name: 'Kids' },
  { id: OTHER_CATEGORY_ID, name: 'Other' },
];

export function newState() {
  return {
    version: DATA_VERSION,
    startMonth: null,
    onboarded: false,
    entries: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    folders: [],
    paid: {},
    limits: {},
    goals: [],
    mileage: { trucks: [], trips: [], anchor: DEFAULT_ANCHOR },
    settings: {},
  };
}

export function makeId(prefix = 'e') {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

// ------------------------------------------------------------ checking data

/** Problems with one entry, in plain words. Empty list means it's fine. */
export function entryProblems(state, e) {
  const problems = [];
  if (e.kind !== 'in' && e.kind !== 'out') problems.push('Pick money in or money out.');
  if (!Number.isSafeInteger(e.amountCents) || e.amountCents <= 0 || e.amountCents > MAX_CENTS) problems.push('The amount isn\'t right.');
  if (!normalizeName(e.name)) problems.push('Please give it a name.');
  if (!FREQUENCIES[e.freq]) problems.push('Pick how often.');
  if (!isValidDate(e.startDate)) problems.push('Please pick a date.');
  if (e.tag !== 'personal' && e.tag !== 'business') problems.push('Pick personal or business.');
  if (e.kind === 'out') {
    if (e.folderId && !state.folders.some((f) => f.id === e.folderId)) problems.push('That folder no longer exists.');
    if (!e.folderId && !state.categories.some((c) => c.id === e.categoryId)) problems.push('Pick a category.');
  }
  return problems;
}

/**
 * One-time and changes-each-time entries can't be dated before the month he
 * started using the app, because those months aren't counted anywhere.
 */
export function dateTooEarly(state, draft, todayISO) {
  if (FREQUENCIES[draft.freq]?.recurring) return false;
  const startDay = trackingStartDay(state) ?? firstOfMonth(todayISO);
  return dayNumber(draft.startDate) < startDay;
}

function firstOfMonth(iso) {
  const { y, m } = ymd(dayNumber(iso));
  return monthStartDay(y, m);
}

function cleanEntry(draft) {
  const e = {
    id: draft.id,
    kind: draft.kind,
    amountCents: draft.amountCents,
    name: String(draft.name).trim().replace(/\s+/g, ' '),
    categoryId: draft.kind === 'out' && !draft.folderId ? draft.categoryId : null,
    folderId: draft.kind === 'out' ? (draft.folderId || null) : null,
    freq: draft.freq,
    startDate: draft.startDate,
    tag: draft.tag ?? 'personal',
    createdAt: draft.createdAt,
  };
  if (draft.fromDate) e.fromDate = draft.fromDate;
  if (draft.endDate) e.endDate = draft.endDate;
  return e;
}

// ------------------------------------------------------------ entries

export function addEntry(state, draft, todayISO, id = makeId()) {
  const entry = cleanEntry({ ...draft, id, createdAt: draft.createdAt ?? todayISO });
  const problems = entryProblems(state, entry);
  if (problems.length) throw new Error(problems.join(' '));
  const today = ymd(dayNumber(todayISO));
  return {
    ...state,
    startMonth: state.startMonth ?? monthKey(today.y, today.m),
    entries: [...state.entries, entry],
  };
}

const SCHEDULE_FIELDS = ['amountCents', 'freq', 'startDate', 'kind'];

/**
 * Would this edit change past months? True when a repeating entry already
 * counted in earlier months and the amount, how often or date is changing.
 * In that case we ask: "Did it change from this month, or fix a mistake?"
 */
export function editAffectsPast(state, id, changes, todayISO) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry || !FREQUENCIES[entry.freq].recurring) return false;
  if (!SCHEDULE_FIELDS.some((f) => f in changes && changes[f] !== entry[f])) return false;
  const startDay = trackingStartDay(state);
  if (startDay === null) return false;
  const { y, m } = ymd(dayNumber(todayISO));
  const thisMonthStart = monthStartDay(y, m);
  if (entry.endDate && dayNumber(entry.endDate) < thisMonthStart) return false;
  return occurrences(entry, startDay, thisMonthStart - 1).length > 0;
}

/**
 * Save an edit.
 * mode 'everywhere': fix the entry in all months (for typos).
 * mode 'fromThisMonth': earlier months keep the old version; the new version
 *   counts from the 1st of this month on.
 */
export function editEntry(state, id, changes, todayISO, mode = 'everywhere', newId = makeId()) {
  const old = state.entries.find((e) => e.id === id);
  if (!old) throw new Error('That entry no longer exists.');
  const updated = cleanEntry({ ...old, ...changes, id: old.id, createdAt: old.createdAt });
  const problems = entryProblems(state, updated);
  if (problems.length) throw new Error(problems.join(' '));

  if (mode !== 'fromThisMonth') {
    return { ...state, entries: state.entries.map((e) => (e.id === id ? updated : e)) };
  }
  const { y, m } = ymd(dayNumber(todayISO));
  const thisMonthStart = monthStartDay(y, m);
  const ended = { ...old, endDate: isoDate(thisMonthStart - 1) };
  const continued = { ...updated, id: newId, fromDate: isoDate(thisMonthStart), createdAt: todayISO };
  if (old.endDate) continued.endDate = old.endDate;
  return {
    ...state,
    entries: state.entries.flatMap((e) => (e.id === id ? [ended, continued] : [e])),
  };
}

/** Stop a repeating entry after this month. Earlier months keep it. */
export function stopEntry(state, id, todayISO) {
  const { y, m } = ymd(dayNumber(todayISO));
  const endDate = isoDate(monthEndDay(y, m));
  return {
    ...state,
    entries: state.entries.map((e) => (e.id === id ? { ...e, endDate } : e)),
  };
}

export function deleteEntry(state, id) {
  const paid = Object.fromEntries(Object.entries(state.paid ?? {}).filter(([key]) => !key.startsWith(`${id}|`)));
  return { ...state, paid, entries: state.entries.filter((e) => e.id !== id) };
}

// ------------------------------------------------------------ bills ticked off as paid

export const paidKey = (entryId, iso) => `${entryId}|${iso}`;

export function isPaid(state, entryId, iso) {
  return Boolean(state.paid?.[paidKey(entryId, iso)]);
}

/** Tick one bill off as paid. This is only a reminder tick; it doesn't change any totals. */
export function markPaid(state, entryId, iso) {
  if (!state.entries.some((e) => e.id === entryId)) throw new Error('That bill no longer exists.');
  if (!isValidDate(iso)) throw new Error('Not a valid date.');
  return { ...state, paid: { ...state.paid, [paidKey(entryId, iso)]: true } };
}

export function unmarkPaid(state, entryId, iso) {
  const paid = { ...state.paid };
  delete paid[paidKey(entryId, iso)];
  return { ...state, paid };
}

// ------------------------------------------------------------ settings and notes

export function setSetting(state, key, value) {
  return { ...state, settings: { ...state.settings, [key]: value } };
}

/** Hide a note. Old hidden notes are forgotten after about two months. */
export function dismissNote(state, noteId, todayISO) {
  const today = dayNumber(todayISO);
  const kept = Object.entries(state.settings.dismissed ?? {})
    .filter(([, iso]) => isValidDate(iso) && today - dayNumber(iso) <= 62);
  return setSetting(state, 'dismissed', { ...Object.fromEntries(kept), [noteId]: todayISO });
}

/** Has this repeating entry already counted in an earlier month? */
export function hasPastMonths(state, entry, todayISO) {
  const startDay = trackingStartDay(state);
  if (startDay === null) return false;
  const { y, m } = ymd(dayNumber(todayISO));
  return occurrences(entry, startDay, monthStartDay(y, m) - 1).length > 0;
}

// ------------------------------------------------------------ categories and folders

function checkNewName(list, name, exceptId, what) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error(`Please type a name for the ${what}.`);
  if (clean.length > 40) throw new Error('That name is a bit long. Please keep it under 40 letters.');
  if (list.some((x) => x.id !== exceptId && normalizeName(x.name) === normalizeName(clean))) {
    throw new Error(`There's already a ${what} called "${clean}".`);
  }
  return clean;
}

export function addCategory(state, name, id = makeId('cat')) {
  const clean = checkNewName(state.categories, name, null, 'category');
  return { ...state, categories: [...state.categories, { id, name: clean }] };
}

export function renameCategory(state, id, name) {
  const clean = checkNewName(state.categories, name, id, 'category');
  return { ...state, categories: state.categories.map((c) => (c.id === id ? { ...c, name: clean } : c)) };
}

/** Delete a category. Anything in it moves to "Other", so no money disappears. */
export function deleteCategory(state, id) {
  if (id === OTHER_CATEGORY_ID) throw new Error('"Other" can\'t be deleted. It catches anything without a category.');
  return {
    ...withoutLimit(state, `c:${id}`),
    categories: state.categories.filter((c) => c.id !== id),
    entries: state.entries.map((e) => (e.categoryId === id ? { ...e, categoryId: OTHER_CATEGORY_ID } : e)),
  };
}

export function addFolder(state, name, id = makeId('fold')) {
  const clean = checkNewName(state.folders, name, null, 'folder');
  return { ...state, folders: [...state.folders, { id, name: clean }] };
}

export function renameFolder(state, id, name) {
  const clean = checkNewName(state.folders, name, id, 'folder');
  return { ...state, folders: state.folders.map((f) => (f.id === id ? { ...f, name: clean } : f)) };
}

/** Delete a folder. Anything in it moves to "Other", so no money disappears. */
export function deleteFolder(state, id) {
  const mileage = state.mileage ?? newState().mileage;
  return {
    ...withoutLimit(state, `f:${id}`),
    folders: state.folders.filter((f) => f.id !== id),
    entries: state.entries.map((e) => (e.folderId === id ? { ...e, folderId: null, categoryId: OTHER_CATEGORY_ID } : e)),
    // A truck whose fuel folder is deleted just stops showing cost per km until a new one is picked.
    mileage: { ...mileage, trucks: mileage.trucks.map((t) => (t.fuelFolderId === id ? { ...t, fuelFolderId: null } : t)) },
  };
}

// ------------------------------------------------------------ mileage: trucks

const milesOf = (state) => state.mileage ?? newState().mileage;

function checkTruckName(state, name, exceptId) {
  return checkNewName(milesOf(state).trucks, name, exceptId, 'truck');
}

function checkFuelFolder(state, folderId) {
  if (folderId && !state.folders.some((f) => f.id === folderId)) throw new Error('That folder no longer exists.');
  return folderId || null;
}

export function addTruck(state, { name, fuelFolderId = null }, id = makeId('truck')) {
  const m = milesOf(state);
  const truck = { id, name: checkTruckName(state, name, null), fuelFolderId: checkFuelFolder(state, fuelFolderId) };
  return { ...state, mileage: { ...m, trucks: [...m.trucks, truck] } };
}

export function editTruck(state, id, { name, fuelFolderId }) {
  const m = milesOf(state);
  if (!m.trucks.some((t) => t.id === id)) throw new Error('That truck no longer exists.');
  const clean = checkTruckName(state, name, id);
  const folder = checkFuelFolder(state, fuelFolderId);
  return { ...state, mileage: { ...m, trucks: m.trucks.map((t) => (t.id === id ? { ...t, name: clean, fuelFolderId: folder } : t)) } };
}

/** Delete a truck and all of its trips. */
export function deleteTruck(state, id) {
  const m = milesOf(state);
  return { ...state, mileage: { ...m, trucks: m.trucks.filter((t) => t.id !== id), trips: m.trips.filter((t) => t.truckId !== id) } };
}

/** 2-week mileage periods start on this Monday (and every other Monday from it). */
export function setMileageAnchor(state, iso) {
  if (!isValidDate(iso) || weekday(dayNumber(iso)) !== 1) throw new Error('2-week periods have to start on a Monday.');
  return { ...state, mileage: { ...milesOf(state), anchor: iso } };
}

// ------------------------------------------------------------ mileage: trips

function cleanTrip(t) {
  const text = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
  return {
    id: t.id,
    truckId: t.truckId,
    date: t.date,
    startKm: t.startKm,
    endKm: t.endKm,
    where: text(t.where),
    purpose: text(t.purpose),
    tag: t.tag,
    createdAt: t.createdAt ?? null,
  };
}

/** Problems with one trip, in plain words. Empty list means it's fine. */
export function tripProblems(state, t, todayISO = null) {
  const problems = [];
  const odo = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 9_999_999;
  if (!milesOf(state).trucks.some((tr) => tr.id === t?.truckId)) problems.push('Pick a truck.');
  if (!isValidDate(t?.date)) problems.push('Please pick a date.');
  else if (todayISO && t.date > todayISO) problems.push('The date can\'t be in the future.');
  if (!odo(t?.startKm)) problems.push('Please check the start reading.');
  if (!odo(t?.endKm)) problems.push('Please check the end reading.');
  if (odo(t?.startKm) && odo(t?.endKm) && t.endKm < t.startKm) problems.push('The end reading is lower than the start reading.');
  if (t?.tag !== 'business' && t?.tag !== 'personal') problems.push('Pick business or personal.');
  if (String(t?.where ?? '').length > 80 || String(t?.purpose ?? '').length > 80) problems.push('Please keep the notes under 80 letters.');
  return problems;
}

/** The CRA logbook asks where and why for business trips. */
export function tripNeedsNotes(t) {
  return t.tag === 'business' && (!String(t.where ?? '').trim() || !String(t.purpose ?? '').trim());
}

export function addTrip(state, draft, todayISO, id = makeId('trip')) {
  const trip = cleanTrip({ ...draft, id, createdAt: todayISO });
  const problems = tripProblems(state, trip, todayISO);
  if (problems.length) throw new Error(problems.join(' '));
  const m = milesOf(state);
  return { ...state, mileage: { ...m, trips: [...m.trips, trip] } };
}

export function editTrip(state, id, changes, todayISO) {
  const m = milesOf(state);
  const old = m.trips.find((t) => t.id === id);
  if (!old) throw new Error('That trip no longer exists.');
  const trip = cleanTrip({ ...old, ...changes, id, createdAt: old.createdAt });
  const problems = tripProblems(state, trip, todayISO);
  if (problems.length) throw new Error(problems.join(' '));
  return { ...state, mileage: { ...m, trips: m.trips.map((t) => (t.id === id ? trip : t)) } };
}

export function deleteTrip(state, id) {
  const m = milesOf(state);
  return { ...state, mileage: { ...m, trips: m.trips.filter((t) => t.id !== id) } };
}

export function countIn(state, { categoryId, folderId }) {
  return state.entries.filter((e) => (folderId ? e.folderId === folderId : !e.folderId && e.kind === 'out' && e.categoryId === categoryId)).length;
}

// ------------------------------------------------------------ spending limits

function groupExists(state, key) {
  if (key.startsWith('c:')) return state.categories.some((c) => c.id === key.slice(2));
  if (key.startsWith('f:')) return state.folders.some((f) => f.id === key.slice(2));
  return false;
}

function withoutLimit(state, key) {
  const limits = { ...(state.limits ?? {}) };
  delete limits[key];
  return { ...state, limits };
}

/** Set a monthly limit for a category ("c:id") or folder ("f:id"). Pass null to remove it. */
export function setLimit(state, key, cents) {
  if (cents === null) return withoutLimit(state, key);
  if (!groupExists(state, key)) throw new Error('That category or folder no longer exists.');
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) throw new Error('Please check the limit amount.');
  return { ...state, limits: { ...(state.limits ?? {}), [key]: cents } };
}

// ------------------------------------------------------------ savings goals

function checkGoal(state, goal, id) {
  const name = String(goal.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Please give the goal a name, like "Truck repairs".');
  if (name.length > 40) throw new Error('That name is a bit long. Please keep it under 40 letters.');
  if ((state.goals ?? []).some((g) => g.id !== id && normalizeName(g.name) === normalizeName(name))) {
    throw new Error(`There's already a goal called "${name}".`);
  }
  if (!Number.isSafeInteger(goal.targetCents) || goal.targetCents <= 0 || goal.targetCents > MAX_CENTS) {
    throw new Error('Please check the goal amount.');
  }
  if (goal.byDate && !isValidDate(goal.byDate)) throw new Error('Please check the date.');
  return name;
}

export function addGoal(state, { name, targetCents, byDate = null }, todayISO, id = makeId('goal')) {
  const clean = checkGoal(state, { name, targetCents, byDate }, null);
  if (byDate && dayNumber(byDate) <= dayNumber(todayISO)) throw new Error('Please pick a date after today.');
  const goal = { id, name: clean, targetCents, byDate: byDate || null, createdAt: todayISO, deposits: [] };
  return { ...state, goals: [...(state.goals ?? []), goal] };
}

export function editGoal(state, id, changes) {
  const old = (state.goals ?? []).find((g) => g.id === id);
  if (!old) throw new Error('That goal no longer exists.');
  const next = { ...old, ...changes };
  next.name = checkGoal(state, next, id);
  next.byDate = next.byDate || null;
  return { ...state, goals: state.goals.map((g) => (g.id === id ? next : g)) };
}

export function deleteGoal(state, id) {
  return { ...state, goals: (state.goals ?? []).filter((g) => g.id !== id) };
}

/** Put money toward a goal. This doesn't change the monthly numbers. */
export function addToGoal(state, goalId, cents, todayISO, depositId = makeId('dep')) {
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) throw new Error('Please check the amount.');
  const goal = (state.goals ?? []).find((g) => g.id === goalId);
  if (!goal) throw new Error('That goal no longer exists.');
  const deposits = [...goal.deposits, { id: depositId, date: todayISO, cents }];
  return { ...state, goals: state.goals.map((g) => (g.id === goalId ? { ...g, deposits } : g)) };
}

export function removeDeposit(state, goalId, depositId) {
  return {
    ...state,
    goals: (state.goals ?? []).map((g) => (g.id === goalId ? { ...g, deposits: g.deposits.filter((d) => d.id !== depositId) } : g)),
  };
}

export function goalSaved(goal) {
  return goal.deposits.reduce((total, d) => total + d.cents, 0);
}

// ------------------------------------------------------------ loading saved data

/**
 * Check saved data before trusting it. Returns a clean state, or throws with
 * a plain-words reason. Used on start-up (and for backups in Stage 3).
 */
export function loadState(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('This doesn\'t look like budget data.');
  if (raw.version !== DATA_VERSION) throw new Error('This data is from a different version of the app.');
  const state = {
    ...newState(),
    startMonth: raw.startMonth && parseMonthKey(raw.startMonth) ? raw.startMonth : null,
    onboarded: Boolean(raw.onboarded),
    categories: Array.isArray(raw.categories) ? raw.categories.filter((c) => c && c.id && c.name) : newState().categories,
    folders: Array.isArray(raw.folders) ? raw.folders.filter((f) => f && f.id && f.name) : [],
    settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
    entries: [],
    paid: {},
  };
  if (raw.paid && typeof raw.paid === 'object') {
    for (const [key, value] of Object.entries(raw.paid)) {
      const [, iso] = key.split('|');
      if (value === true && isValidDate(iso)) state.paid[key] = true;
    }
  }
  if (!state.categories.some((c) => c.id === OTHER_CATEGORY_ID)) {
    state.categories.push({ id: OTHER_CATEGORY_ID, name: 'Other' });
  }
  for (const e of Array.isArray(raw.entries) ? raw.entries : []) {
    const problems = entryProblems(state, e);
    if (problems.length) throw new Error(`An entry called "${e?.name}" is damaged: ${problems.join(' ')}`);
    state.entries.push(cleanEntry(e));
  }
  if (state.entries.length && !state.startMonth) throw new Error('The start month is missing.');

  if (raw.limits && typeof raw.limits === 'object') {
    for (const [key, cents] of Object.entries(raw.limits)) {
      if (groupExists(state, key) && Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_CENTS) state.limits[key] = cents;
    }
  }
  for (const g of Array.isArray(raw.goals) ? raw.goals : []) {
    try {
      const deposits = (Array.isArray(g.deposits) ? g.deposits : [])
        .filter((d) => d && d.id && isValidDate(d.date) && Number.isSafeInteger(d.cents) && d.cents > 0);
      const goal = {
        id: String(g.id), name: g.name, targetCents: g.targetCents,
        byDate: isValidDate(g.byDate) ? g.byDate : null,
        createdAt: isValidDate(g.createdAt) ? g.createdAt : null,
        deposits,
      };
      goal.name = checkGoal(state, goal, goal.id);
      state.goals.push(goal);
    } catch (err) {
      throw new Error(`A savings goal called "${g?.name}" is damaged: ${err.message}`);
    }
  }

  const rawMileage = raw.mileage && typeof raw.mileage === 'object' ? raw.mileage : {};
  if (isValidDate(rawMileage.anchor) && weekday(dayNumber(rawMileage.anchor)) === 1) state.mileage.anchor = rawMileage.anchor;
  for (const tr of Array.isArray(rawMileage.trucks) ? rawMileage.trucks : []) {
    try {
      const truck = { id: String(tr.id), name: tr.name, fuelFolderId: state.folders.some((f) => f.id === tr.fuelFolderId) ? tr.fuelFolderId : null };
      truck.name = checkTruckName(state, truck.name, truck.id);
      state.mileage.trucks.push(truck);
    } catch (err) {
      throw new Error(`A truck called "${tr?.name}" is damaged: ${err.message}`);
    }
  }
  for (const t of Array.isArray(rawMileage.trips) ? rawMileage.trips : []) {
    const problems = tripProblems(state, t);
    if (problems.length) throw new Error(`A trip on ${t?.date} is damaged: ${problems.join(' ')}`);
    state.mileage.trips.push(cleanTrip(t));
  }
  return state;
}
