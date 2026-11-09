import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOdometer, formatKm, formatPct, periodRange, shiftPeriod, mileageTotals, costPerKm, fuelSpent,
  odometerCheck, findDuplicateTrip, lastEndKm, yearOdometer, tripsBetween,
} from '../js/maths/mileage.js';
import {
  addTruck, editTruck, deleteTruck, addTrip, editTrip, deleteTrip, setMileageAnchor, deleteFolder,
  tripNeedsNotes, loadState, newState,
} from '../js/data/model.js';
import { buildLogbook, logbookCSV } from '../js/data/logbook.js';
import { dayNumber, isoDate } from '../js/maths/dates.js';
import { makeBackup, readBackup } from '../js/data/backup.js';
import { buildState, bill } from './helpers.js';

const trip = (id, truckId, date, startKm, endKm, tag = 'business', where = 'Calgary to Red Deer', purpose = 'Delivery') => ({ id, truckId, date, startKm, endKm, tag, where, purpose });

/** Two trucks; Pete's fuel goes in its own folder. All answers below were worked out by hand. */
function fleet() {
  let s = buildState([
    bill('Diesel', 30000, 'varies', '2026-11-02', null, { folderId: 'fold-pete' }),
    bill('Diesel', 25000, 'varies', '2026-11-09', null, { folderId: 'fold-pete' }),
  ], { today: '2026-11-01', folders: ['Pete'] });
  s = addTruck(s, { name: 'Peterbilt', fuelFolderId: 'fold-pete' }, 'pete');
  s = addTruck(s, { name: 'Kenworth' }, 'ken');
  const trips = [
    trip('t1', 'pete', '2026-11-02', 100000, 100400),
    trip('t2', 'pete', '2026-11-03', 100400, 100700),
    trip('t3', 'pete', '2026-11-07', 100700, 100750, 'personal', '', ''),
    trip('t4', 'ken', '2026-11-04', 50000, 50500),
    trip('t5', 'pete', '2026-11-10', 100750, 101000),
  ];
  for (const t of trips) s = addTrip(s, t, '2026-11-10', t.id);
  return s;
}

const day = (iso) => dayNumber(iso);
const span = (r) => [isoDate(r.from), isoDate(r.to)];

// ---------------------------------------------------------------- odometer readings

test('odometer readings: commas fine, typos refused', () => {
  assert.deepEqual(parseOdometer('245310'), { ok: true, km: 245310 });
  assert.deepEqual(parseOdometer('245,310'), { ok: true, km: 245310 });
  assert.deepEqual(parseOdometer(' 245310 km '), { ok: true, km: 245310 });
  assert.deepEqual(parseOdometer('0'), { ok: true, km: 0 });
  for (const bad of ['', 'abc', '12a', '-5', '245310.5', '24,53,10', '99999999']) {
    assert.equal(parseOdometer(bad).ok, false, bad);
  }
  assert.equal(formatKm(245310), '245,310 km');
  assert.equal(formatPct(960), '96%');
  assert.equal(formatPct(933), '93.3%');
});

// ---------------------------------------------------------------- periods

test('weeks run Monday to Sunday', () => {
  assert.deepEqual(span(periodRange('week', day('2026-11-04'))), ['2026-11-02', '2026-11-08']);
  assert.deepEqual(span(periodRange('week', day('2026-11-08'))), ['2026-11-02', '2026-11-08']); // a Sunday
  assert.deepEqual(span(periodRange('week', day('2026-11-09'))), ['2026-11-09', '2026-11-15']);
  assert.deepEqual(span(periodRange('week', day('2026-12-31'))), ['2026-12-28', '2027-01-03']); // across New Year
});

test('2-week periods run every other Monday from Jan 5, 2026', () => {
  assert.deepEqual(span(periodRange('biweek', day('2026-01-05'))), ['2026-01-05', '2026-01-18']);
  assert.deepEqual(span(periodRange('biweek', day('2026-11-04'))), ['2026-10-26', '2026-11-08']);
  assert.deepEqual(span(periodRange('biweek', day('2026-11-09'))), ['2026-11-09', '2026-11-22']);
  assert.deepEqual(span(periodRange('biweek', day('2025-12-31'))), ['2025-12-22', '2026-01-04']); // before the anchor
  assert.deepEqual(span(periodRange('biweek', day('2026-11-04'), '2026-01-12')), ['2026-11-02', '2026-11-15']); // shifted a week
});

test('months and years, including leap years', () => {
  assert.deepEqual(span(periodRange('month', day('2028-02-10'))), ['2028-02-01', '2028-02-29']);
  assert.deepEqual(span(periodRange('year', day('2026-06-01'))), ['2026-01-01', '2026-12-31']);
});

test('stepping back and forward between periods', () => {
  const week = periodRange('week', day('2026-11-04'));
  assert.deepEqual(span(shiftPeriod(week, -1)), ['2026-10-26', '2026-11-01']);
  const two = periodRange('biweek', day('2026-11-04'));
  assert.deepEqual(span(shiftPeriod(two, 1)), ['2026-11-09', '2026-11-22']);
  const jan = periodRange('month', day('2026-01-15'));
  assert.deepEqual(span(shiftPeriod(jan, -1)), ['2025-12-01', '2025-12-31']);
  assert.deepEqual(span(shiftPeriod(periodRange('year', day('2026-05-01')), 1)), ['2027-01-01', '2027-12-31']);
});

// ---------------------------------------------------------------- totals

test('week totals: km, business, personal and business %', () => {
  const t = mileageTotals(fleet(), day('2026-11-02'), day('2026-11-08'));
  assert.equal(t.ok, true);
  assert.deepEqual([t.totalKm, t.businessKm, t.personalKm], [1250, 1200, 50]);
  assert.equal(formatPct(t.businessPctTenths), '96%');
  assert.deepEqual(t.byTruck.map((b) => [b.truck.name, b.km]), [['Peterbilt', 750], ['Kenworth', 500]]);
});

test('one truck at a time', () => {
  const pete = mileageTotals(fleet(), day('2026-11-02'), day('2026-11-08'), 'pete');
  assert.deepEqual([pete.totalKm, pete.businessKm], [750, 700]);
  assert.equal(formatPct(pete.businessPctTenths), '93.3%'); // 700 ÷ 750
  const month = mileageTotals(fleet(), day('2026-11-01'), day('2026-11-30'));
  assert.equal(month.totalKm, 1500);
  assert.equal(mileageTotals(fleet(), day('2026-10-01'), day('2026-10-31')).businessPctTenths, null); // no driving
});

// ---------------------------------------------------------------- fuel cost per km

test('fuel cost per km = the truck\'s fuel folder ÷ its km', () => {
  const s = fleet();
  const month = costPerKm(s, s.mileage.trucks[0], day('2026-11-01'), day('2026-11-30'));
  assert.deepEqual([month.status, month.fuelCents, month.km, month.centsPerKm, month.ok], ['ok', 55000, 1000, 55, true]);
  const week = costPerKm(s, s.mileage.trucks[0], day('2026-11-02'), day('2026-11-08'));
  assert.deepEqual([week.fuelCents, week.km, week.centsPerKm], [30000, 750, 40]); // $300 ÷ 750 km = $0.40
  assert.equal(costPerKm(s, s.mileage.trucks[1], day('2026-11-01'), day('2026-11-30')).status, 'no-folder');
  assert.equal(costPerKm(s, s.mileage.trucks[0], day('2026-12-01'), day('2026-12-31')).status, 'no-km');
});

test('cost per km rounds to the nearest cent', () => {
  let s = buildState([bill('Diesel', 10000, 'varies', '2026-11-02', null, { folderId: 'fold-f' })], { today: '2026-11-01', folders: ['F'] });
  s = addTruck(s, { name: 'T', fuelFolderId: 'fold-f' }, 'x');
  s = addTrip(s, trip('a', 'x', '2026-11-02', 0, 300), '2026-11-02', 'a');
  assert.equal(costPerKm(s, s.mileage.trucks[0], day('2026-11-01'), day('2026-11-30')).centsPerKm, 33); // $100 ÷ 300 = 33.3¢
  assert.deepEqual(fuelSpent(s, 'fold-f', day('2026-11-01'), day('2026-11-30')), { cents: 10000, ok: true });
});

// ---------------------------------------------------------------- checks before saving

test('start reading fills in from the last trip, and gaps or overlaps are caught', () => {
  const s = fleet();
  assert.equal(lastEndKm(s, 'pete'), 101000);
  assert.equal(lastEndKm(s, 'ken'), 50500);
  const next = { truckId: 'pete', date: '2026-11-11', startKm: 101000, endKm: 101300 };
  assert.equal(odometerCheck(s, next), null);
  assert.deepEqual(odometerCheck(s, { ...next, startKm: 101200 }).missingKm, 200);
  assert.equal(odometerCheck(s, { ...next, startKm: 100900 }).type, 'overlap');
  assert.equal(odometerCheck(s, { truckId: 'ken', date: '2026-11-01', startKm: 1, endKm: 2 }), null); // nothing before it
  // Editing a trip doesn't compare it with itself.
  const t5 = s.mileage.trips.find((t) => t.id === 't5');
  assert.equal(odometerCheck(s, t5, 't5'), null);
  assert.equal(findDuplicateTrip(s, { truckId: 'pete', date: '2026-11-03', startKm: 100400 })?.id, 't2');
  assert.equal(findDuplicateTrip(s, t5, 't5'), null);
});

test('bad trips are refused', () => {
  const s = fleet();
  assert.throws(() => addTrip(s, trip('x', 'pete', '2026-11-11', 500, 400), '2026-11-11'), /lower than the start/);
  assert.throws(() => addTrip(s, trip('x', 'pete', '2026-11-12', 1, 2), '2026-11-11'), /future/);
  assert.throws(() => addTrip(s, trip('x', 'nope', '2026-11-11', 1, 2), '2026-11-11'), /truck/);
  assert.throws(() => addTrip(s, trip('x', 'pete', '2026-11-11', 1.5, 2), '2026-11-11'), /start reading/);
  assert.equal(tripNeedsNotes(trip('x', 'pete', '2026-11-11', 1, 2, 'business', '', '')), true);
  assert.equal(tripNeedsNotes(trip('x', 'pete', '2026-11-11', 1, 2, 'personal', '', '')), false);
});

test('trips can be edited and deleted; deleting a truck deletes its trips', () => {
  let s = fleet();
  s = editTrip(s, 't5', { endKm: 101100 }, '2026-11-10');
  assert.equal(mileageTotals(s, day('2026-11-09'), day('2026-11-15')).totalKm, 350);
  s = deleteTrip(s, 't5');
  assert.equal(mileageTotals(s, day('2026-11-09'), day('2026-11-15')).totalKm, 0);
  s = deleteTruck(s, 'ken');
  assert.deepEqual(s.mileage.trucks.map((t) => t.name), ['Peterbilt']);
  assert.equal(tripsBetween(s, day('2026-01-01'), day('2026-12-31'), 'ken').length, 0);
});

test('trucks: names must be unique; deleting the fuel folder clears it from the truck', () => {
  let s = fleet();
  assert.throws(() => addTruck(s, { name: 'peterbilt' }), /already/);
  assert.throws(() => addTruck(s, { name: 'X', fuelFolderId: 'nope' }), /folder/);
  s = editTruck(s, 'ken', { name: 'Kenworth T680', fuelFolderId: null });
  assert.equal(s.mileage.trucks[1].name, 'Kenworth T680');
  s = deleteFolder(s, 'fold-pete');
  assert.equal(s.mileage.trucks[0].fuelFolderId, null);
  assert.equal(costPerKm(s, s.mileage.trucks[0], day('2026-11-01'), day('2026-11-30')).status, 'no-folder');
});

test('2-week periods can be shifted, but only to a Monday', () => {
  const s = setMileageAnchor(fleet(), '2026-01-12');
  assert.equal(s.mileage.anchor, '2026-01-12');
  assert.throws(() => setMileageAnchor(s, '2026-01-13'), /Monday/);
});

// ---------------------------------------------------------------- CRA logbook

test('the logbook lists every trip and adds up', () => {
  const book = buildLogbook(fleet(), { type: 'year', y: 2026 });
  assert.equal(book.ok, true);
  assert.equal(book.rows.length, 5);
  assert.deepEqual([book.totalKm, book.businessKm, book.personalKm, book.businessPct], [1500, 1450, 50, '96.7%']);
  assert.deepEqual(book.perTruck.map((t) => [t.name, t.startKm, t.endKm, t.totalKm, t.businessPct]), [
    ['Peterbilt', 100000, 101000, 1000, '95%'],
    ['Kenworth', 50000, 50500, 500, '100%'],
  ]);
  assert.deepEqual(yearOdometer(fleet(), 'pete', 2026), { startKm: 100000, endKm: 101000 });
  const one = buildLogbook(fleet(), { type: 'month', y: 2026, m: 11 }, 'pete');
  assert.equal(one.rows.length, 4);
  assert.equal(one.fileName, 'mileage-peterbilt-2026-11.csv');
});

test('the logbook spreadsheet', () => {
  const csv = logbookCSV(buildLogbook(fleet(), { type: 'year', y: 2026 }));
  assert.ok(csv.startsWith('﻿Mileage logbook: 2026 · All trucks\r\n'));
  assert.ok(csv.includes('Date,Truck,Odometer start,Odometer end,Km,Business or personal,Where,Purpose'));
  assert.ok(csv.includes('2026-11-02,Peterbilt,100000,100400,400,Business,Calgary to Red Deer,Delivery'));
  assert.ok(csv.includes('2026-11-07,Peterbilt,100700,100750,50,Personal,,'));
  assert.ok(csv.includes('All,,,1500,1450,50,96.7%'));
});

// ---------------------------------------------------------------- saving

test('mileage goes into backups, and older data without it still opens', () => {
  const s = fleet();
  assert.deepEqual(readBackup(makeBackup(s, '2026-11-10')).state, s);
  const { mileage, ...old } = JSON.parse(JSON.stringify(s));
  assert.deepEqual(loadState(old).mileage, newState().mileage);
  const broken = JSON.parse(JSON.stringify(s));
  broken.mileage.trips[0].endKm = 5;
  assert.throws(() => loadState(broken), /damaged/);
});
