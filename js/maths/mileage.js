// Mileage maths: odometer readings, km totals per week / 2 weeks / month / year,
// business-use %, and fuel cost per km. Km are whole numbers; money stays in
// whole cents. Like the budget, every total is worked out two ways and compared.

import { dayNumber, ymd, weekday, monthStartDay, monthEndDay, dayFromYMD, addMonths } from './dates.js';
import { roundDiv, sum } from './money.js';
import { occurrences } from './schedule.js';
import { spendingBetween, trackingStartDay } from './budget.js';

export const MAX_ODOMETER = 9_999_999;
/** A day longer than this gets an "Are you sure?" */
export const LONG_DAY_KM = 1500;
/** 2-week periods start on this Monday, then every other Monday. */
export const DEFAULT_ANCHOR = '2026-01-05';

const fail = (message) => ({ ok: false, message });

/** Read an odometer reading: "245310", "245,310" or "245310 km". Whole km only. */
export function parseOdometer(input) {
  const raw = String(input ?? '').trim();
  if (raw === '') return fail('Please type the odometer reading.');
  let s = raw.replace(/\s+/g, '').replace(/km$/i, '');
  if (s.startsWith('-')) return fail('An odometer reading can\'t be negative.');
  if (s.includes('.')) return fail('Please type whole kilometres, like 245310.');
  if (s.includes(',')) {
    if (!/^\d{1,3}(,\d{3})+$/.test(s)) return fail('Please check the commas. Type it like 245310 or 245,310.');
    s = s.replace(/,/g, '');
  }
  if (!/^\d+$/.test(s)) return fail('Please use numbers only, like 245310.');
  const km = Number(s);
  if (km > MAX_ODOMETER) return fail('That reading is too big. Please check it.');
  return { ok: true, km };
}

/** 245310 -> "245,310 km" */
export function formatKm(km) {
  return `${String(km).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;
}

export const tripKm = (trip) => trip.endKm - trip.startKm;

/** 875 tenths of a percent -> "87.5%", 1000 -> "100%" */
export function formatPct(tenths) {
  return tenths % 10 === 0 ? `${tenths / 10}%` : `${Math.floor(tenths / 10)}.${tenths % 10}%`;
}

// ---------------------------------------------------------------- periods

export const MILEAGE_PERIODS = ['week', 'biweek', 'month', 'year'];

/** The week (Monday to Sunday), 2 weeks, month or year that contains `day`. */
export function periodRange(kind, day, anchorISO = DEFAULT_ANCHOR) {
  if (kind === 'week') {
    const from = day - ((weekday(day) + 6) % 7);
    return { kind, from, to: from + 6 };
  }
  if (kind === 'biweek') {
    const anchor = dayNumber(anchorISO);
    const from = day - ((((day - anchor) % 14) + 14) % 14);
    return { kind, from, to: from + 13 };
  }
  const { y, m } = ymd(day);
  if (kind === 'month') return { kind, from: monthStartDay(y, m), to: monthEndDay(y, m) };
  if (kind === 'year') return { kind, from: dayFromYMD(y, 1, 1), to: dayFromYMD(y, 12, 31) };
  throw new Error(`Unknown period: ${kind}`);
}

/** The period `steps` before (negative) or after (positive) this one. */
export function shiftPeriod(range, steps, anchorISO = DEFAULT_ANCHOR) {
  const { kind, from } = range;
  if (kind === 'week') return periodRange(kind, from + 7 * steps, anchorISO);
  if (kind === 'biweek') return periodRange(kind, from + 14 * steps, anchorISO);
  const { y, m } = ymd(from);
  if (kind === 'month') {
    const next = addMonths(y, m, steps);
    return periodRange(kind, monthStartDay(next.y, next.m), anchorISO);
  }
  return periodRange(kind, dayFromYMD(y + steps, 1, 1), anchorISO);
}

// ---------------------------------------------------------------- trips and totals

const byDateThenOdometer = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startKm - b.startKm);

export function tripsBetween(state, from, to, truckId = null) {
  return (state.mileage?.trips ?? [])
    .filter((t) => (!truckId || t.truckId === truckId) && dayNumber(t.date) >= from && dayNumber(t.date) <= to)
    .sort(byDateThenOdometer);
}

/** Km totals for a period, for one truck or (truckId null) all of them. */
export function mileageTotals(state, from, to, truckId = null) {
  const trips = tripsBetween(state, from, to, truckId);

  // Way 1: trip by trip.
  const totalKm = sum(trips.map(tripKm));
  const businessKm = sum(trips.filter((t) => t.tag === 'business').map(tripKm));
  const personalKm = sum(trips.filter((t) => t.tag === 'personal').map(tripKm));

  // Way 2: truck by truck.
  const trucks = (state.mileage?.trucks ?? []).filter((tr) => !truckId || tr.id === truckId);
  const byTruck = trucks.map((truck) => {
    const own = trips.filter((t) => t.truckId === truck.id);
    return {
      truck,
      km: sum(own.map(tripKm)),
      businessKm: sum(own.filter((t) => t.tag === 'business').map(tripKm)),
      trips: own.length,
    };
  });

  const ok = trips.every((t) => tripKm(t) >= 0)
    && totalKm === businessKm + personalKm
    && totalKm === sum(byTruck.map((t) => t.km))
    && businessKm === sum(byTruck.map((t) => t.businessKm));

  return {
    from, to, trips, ok,
    totalKm, businessKm, personalKm,
    businessPctTenths: totalKm ? roundDiv(businessKm * 1000, totalKm) : null,
    byTruck,
  };
}

// ---------------------------------------------------------------- fuel cost per km

/** Money out in a folder between two days, worked out two ways. */
export function fuelSpent(state, folderId, from, to) {
  // Way 1: the budget's own category/folder totals.
  const viaBudget = spendingBetween(state, from, to).get(`f:${folderId}`)?.cents ?? 0;
  // Way 2: entry by entry.
  const start = trackingStartDay(state);
  let direct = 0;
  if (start !== null) {
    for (const e of state.entries) {
      if (e.kind !== 'out' || e.folderId !== folderId) continue;
      direct += e.amountCents * occurrences(e, Math.max(from, start), to).length;
    }
  }
  return { cents: viaBudget, ok: viaBudget === direct };
}

/**
 * Fuel cost per km for one truck: its fuel folder's total ÷ its km.
 * status: 'ok', 'no-folder' (no fuel folder picked) or 'no-km' (no driving yet).
 */
export function costPerKm(state, truck, from, to) {
  const folder = truck.fuelFolderId && state.folders.find((f) => f.id === truck.fuelFolderId);
  if (!folder) return { status: 'no-folder' };
  const totals = mileageTotals(state, from, to, truck.id);
  const fuel = fuelSpent(state, folder.id, from, to);
  if (!totals.totalKm) return { status: 'no-km', fuelCents: fuel.cents, folderName: folder.name, ok: fuel.ok };
  const centsPerKm = roundDiv(fuel.cents, totals.totalKm);
  // Cross-check: worked back, cost per km × km must land within half a km's cost of the fuel total.
  const back = Math.abs(centsPerKm * totals.totalKm - fuel.cents) * 2 <= totals.totalKm;
  return {
    status: 'ok',
    folderName: folder.name,
    fuelCents: fuel.cents,
    km: totals.totalKm,
    centsPerKm,
    ok: fuel.ok && totals.ok && back,
  };
}

// ---------------------------------------------------------------- checks before saving

/** The last trip for this truck on or before `date` (leaving out the one being edited). */
export function previousTrip(state, truckId, date, excludeId = null) {
  const earlier = (state.mileage?.trips ?? [])
    .filter((t) => t.truckId === truckId && t.id !== excludeId && t.date <= date)
    .sort(byDateThenOdometer);
  return earlier.length ? earlier[earlier.length - 1] : null;
}

/** The highest end reading this truck has, to fill in the next start reading. */
export function lastEndKm(state, truckId) {
  const trips = (state.mileage?.trips ?? []).filter((t) => t.truckId === truckId);
  return trips.length ? Math.max(...trips.map((t) => t.endKm)) : null;
}

/**
 * Compare the start reading with where this truck's last trip ended.
 * 'gap': it starts higher (a trip may be missing). 'overlap': it starts lower.
 */
export function odometerCheck(state, draft, editingId = null) {
  const prev = previousTrip(state, draft.truckId, draft.date, editingId);
  if (!prev) return null;
  if (draft.startKm > prev.endKm) return { type: 'gap', prev, missingKm: draft.startKm - prev.endKm };
  if (draft.startKm < prev.endKm) return { type: 'overlap', prev };
  return null;
}

/** Same truck, same day, same start reading: probably entered twice. */
export function findDuplicateTrip(state, draft, editingId = null) {
  return (state.mileage?.trips ?? []).find((t) => t.id !== editingId && t.truckId === draft.truckId
    && t.date === draft.date && t.startKm === draft.startKm) ?? null;
}

/** Odometer at the first and last trip of a year (the CRA asks for these). */
export function yearOdometer(state, truckId, y) {
  const trips = tripsBetween(state, dayFromYMD(y, 1, 1), dayFromYMD(y, 12, 31), truckId);
  if (!trips.length) return null;
  return { startKm: trips[0].startKm, endKm: Math.max(...trips.map((t) => t.endKm)) };
}
