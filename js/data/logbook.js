// The CRA logbook export: every trip for a month or year, plus for each truck
// the odometer at the start and end of the period, total km, business km and
// business-use %. Totals are cross-checked before anything is exported.

import { monthStartDay, monthEndDay, dayFromYMD } from '../maths/dates.js';
import { mileageTotals, tripKm, formatPct } from '../maths/mileage.js';
import { periodLabel, exportFileName } from './export.js';

function range(period) {
  if (period.type === 'month') return { from: monthStartDay(period.y, period.m), to: monthEndDay(period.y, period.m) };
  return { from: dayFromYMD(period.y, 1, 1), to: dayFromYMD(period.y, 12, 31) };
}

export function buildLogbook(state, period, truckId = null) {
  const { from, to } = range(period);
  const all = mileageTotals(state, from, to, truckId);
  const trucks = (state.mileage?.trucks ?? []).filter((t) => !truckId || t.id === truckId);
  const names = new Map(trucks.map((t) => [t.id, t.name]));

  const perTruck = trucks.map((truck) => {
    const own = all.trips.filter((t) => t.truckId === truck.id);
    const totals = mileageTotals(state, from, to, truck.id);
    return {
      name: truck.name,
      trips: own.length,
      startKm: own.length ? own[0].startKm : null,
      endKm: own.length ? Math.max(...own.map((t) => t.endKm)) : null,
      totalKm: totals.totalKm,
      businessKm: totals.businessKm,
      personalKm: totals.personalKm,
      businessPct: totals.businessPctTenths === null ? '' : formatPct(totals.businessPctTenths),
      ok: totals.ok,
    };
  });

  const rows = all.trips.map((t) => ({
    date: t.date,
    truck: names.get(t.truckId) ?? '',
    startKm: t.startKm,
    endKm: t.endKm,
    km: tripKm(t),
    tag: t.tag,
    where: t.where,
    purpose: t.purpose,
  }));

  const truckLabel = truckId ? (names.get(truckId) ?? '') : 'All trucks';
  return {
    period,
    title: `Mileage logbook: ${periodLabel(period)} · ${truckLabel}`,
    fileName: exportFileName(period, 'all', 'csv').replace('budget-', `mileage-${truckId ? `${truckLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-` : ''}`),
    rows,
    perTruck,
    totalKm: all.totalKm,
    businessKm: all.businessKm,
    personalKm: all.personalKm,
    businessPct: all.businessPctTenths === null ? '' : formatPct(all.businessPctTenths),
    ok: all.ok && perTruck.every((t) => t.ok)
      && perTruck.reduce((s, t) => s + t.totalKm, 0) === all.totalKm
      && rows.reduce((s, r) => s + r.km, 0) === all.totalKm,
  };
}

function cell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function logbookCSV(book) {
  const lines = [
    [book.title],
    [],
    ['Date', 'Truck', 'Odometer start', 'Odometer end', 'Km', 'Business or personal', 'Where', 'Purpose'],
    ...book.rows.map((r) => [r.date, r.truck, r.startKm, r.endKm, r.km, r.tag === 'business' ? 'Business' : 'Personal', r.where, r.purpose]),
    [],
    ['Truck', 'Odometer at first trip', 'Odometer at last trip', 'Total km', 'Business km', 'Personal km', 'Business use'],
    ...book.perTruck.map((t) => [t.name, t.startKm ?? '', t.endKm ?? '', t.totalKm, t.businessKm, t.personalKm, t.businessPct]),
    ['All', '', '', book.totalKm, book.businessKm, book.personalKm, book.businessPct],
  ];
  return `﻿${lines.map((l) => l.map(cell).join(',')).join('\r\n')}\r\n`;
}
