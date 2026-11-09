// Mileage: km for each truck per week, 2 weeks, month or year, business use,
// fuel cost per km, and the CRA logbook.

import { h, ask, openSheet } from '../ui/dom.js';
import {
  row, list, section, screenTitle, segmented, checkWarning, showMeHow, bigButton, empty,
} from '../ui/components.js';
import { money, dayLabel, monthLabel, plural } from '../ui/format.js';
import {
  periodRange, shiftPeriod, mileageTotals, costPerKm, tripKm, formatKm, formatPct, lastEndKm, DEFAULT_ANCHOR,
} from '../maths/mileage.js';
import { dayNumber, ymd, isoDate, compareMonths, addMonths } from '../maths/dates.js';
import { addTruck, editTruck, deleteTruck, setMileageAnchor, addFolder } from '../data/model.js';
import { buildLogbook, logbookCSV } from '../data/logbook.js';
import { saveFile } from '../ui/files.js';
import { printLogbook } from '../ui/report.js';
import { openTripForm } from '../ui/trip-form.js';

const PERIOD_OPTIONS = [
  { value: 'week', label: 'Week' },
  { value: 'biweek', label: '2 weeks' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];
const THIS = { week: 'this week', biweek: 'these 2 weeks', month: 'this month', year: 'this year' };

function rangeLabel(r, thisYear) {
  if (r.kind === 'month') { const { y, m } = ymd(r.from); return monthLabel(y, m); }
  if (r.kind === 'year') return String(ymd(r.from).y);
  const short = (d) => dayLabel(d, thisYear).split(', ').slice(1).join(', ');
  return `${short(r.from)} – ${short(r.to)}`;
}

// ---------------------------------------------------------------- trucks

function openTruckForm(ctx, truck = null) {
  const s = ctx.state;
  const name = h('input', { id: 'tr-name', class: 'input', type: 'text', maxlength: '40', autocapitalize: 'words', placeholder: 'For example: Peterbilt', value: truck?.name ?? '' });
  const folder = h('select', { id: 'tr-folder', class: 'input select' });
  let chosen = truck?.fuelFolderId ?? '';
  const fillFolders = () => {
    folder.replaceChildren(
      h('option', { value: '' }, 'None yet'),
      ...ctx.state.folders.map((f) => h('option', { value: f.id }, `📁 ${f.name}`)),
      h('option', { value: 'new' }, '+ New folder…'));
    folder.value = chosen;
  };
  folder.addEventListener('change', async () => {
    if (folder.value !== 'new') { chosen = folder.value; return; }
    const suggested = name.value.trim() ? `${name.value.trim()} fuel` : '';
    const { value, text } = await ask({
      title: 'New fuel folder',
      message: 'Put only this truck\'s fuel in it.',
      input: { value: suggested, placeholder: 'Folder name' },
      buttons: [{ label: 'Add', value: true, kind: 'primary' }, { label: 'Cancel', value: false }],
    });
    if (value) {
      try {
        let id = null;
        ctx.update((st) => { const next = addFolder(st, text); id = next.folders.at(-1).id; return next; });
        chosen = id;
      } catch (err) {
        await ask({ title: 'Can\'t add that', message: err.message });
      }
    }
    fillFolders();
  });
  fillFolders();
  const error = h('p', { class: 'field-error', 'aria-live': 'polite' });
  const trips = truck ? s.mileage.trips.filter((t) => t.truckId === truck.id).length : 0;

  const save = () => {
    try {
      ctx.change((st) => (truck ? editTruck(st, truck.id, { name: name.value, fuelFolderId: chosen || null }) : addTruck(st, { name: name.value, fuelFolderId: chosen || null })), truck ? 'Truck saved' : 'Truck added');
      sheet.close();
    } catch (err) {
      error.textContent = err.message;
    }
  };
  const body = h('form', { class: 'entry-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
    h('div', { class: 'field first' }, h('label', { class: 'label', for: 'tr-name' }, 'Truck name'), name),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'tr-folder' }, 'Which folder holds this truck\'s fuel?'), folder,
      h('p', { class: 'hint' }, 'Cost per km = everything in that folder ÷ this truck\'s km. So keep only this truck\'s fuel in it. Add fuel the usual way: + → Money out → pick this folder.')),
    error,
    h('button', { type: 'submit', class: 'btn btn-primary btn-save' }, 'Save truck'),
    truck && h('button', {
      type: 'button',
      class: 'btn btn-danger-plain',
      onclick: async () => {
        const { value } = await ask({
          title: `Delete ${truck.name}?`,
          message: trips ? `This also deletes its ${plural(trips, 'trip')} from the logbook.` : 'It has no trips yet.',
          buttons: [{ label: 'Delete', value: true, kind: 'danger' }, { label: 'Cancel', value: false }],
        });
        if (!value) return;
        ctx.change((st) => deleteTruck(st, truck.id), `${truck.name} deleted`);
        sheet.close();
      },
    }, 'Delete truck'));
  const sheet = openSheet({ title: truck ? 'Edit truck' : 'Add a truck', onCancel: () => sheet.close(), body });
  if (!truck) setTimeout(() => name.focus(), 50);
}

async function changeAnchor(ctx) {
  const today = dayNumber(ctx.today);
  const current = ctx.state.mileage.anchor ?? DEFAULT_ANCHOR;
  const now = periodRange('biweek', today, current);
  const other = isoDate(dayNumber(current) + 7);
  const shifted = periodRange('biweek', today, other);
  const thisYear = ymd(today).y;
  const { value } = await ask({
    title: 'When do your 2-week periods start?',
    message: 'Pick the one that matches how you count your 2 weeks.',
    buttons: [
      { label: `${rangeLabel(now, thisYear)} (now)`, value: 'keep', kind: 'primary' },
      { label: rangeLabel(shifted, thisYear), value: 'shift' },
      { label: 'Cancel', value: null },
    ],
  });
  if (value === 'shift') ctx.change((s) => setMileageAnchor(s, other), '2-week periods changed');
}

const trucksView = {
  title: 'Trucks',
  render(ctx) {
    const s = ctx.state;
    const today = dayNumber(ctx.today);
    const two = periodRange('biweek', today, s.mileage.anchor ?? DEFAULT_ANCHOR);
    return h('div', { class: 'screen' },
      !s.mileage.trucks.length && empty('No trucks yet.'),
      s.mileage.trucks.length > 0 && list(s.mileage.trucks.map((t) => {
        const folder = s.folders.find((f) => f.id === t.fuelFolderId);
        const last = lastEndKm(s, t.id);
        return row({
          title: t.name,
          sub: `${folder ? `Fuel folder: ${folder.name}` : 'No fuel folder yet'}${last !== null ? ` · last reading ${formatKm(last)}` : ''}`,
          onClick: () => openTruckForm(ctx, t),
        });
      })),
      bigButton('+ Add a truck', () => openTruckForm(ctx), 'secondary'),
      section('2-week periods', list([row({
        title: `Now: ${rangeLabel(two, ymd(today).y)}`,
        sub: 'Every other Monday. Tap to shift by a week.',
        onClick: () => changeAnchor(ctx),
      })])));
  },
};

// ---------------------------------------------------------------- CRA logbook

function logbookChoices(state, todayISO) {
  const trips = state.mileage.trips;
  if (!trips.length) return { months: [], years: [] };
  const first = trips.reduce((min, t) => (t.date < min ? t.date : min), todayISO);
  const start = ymd(dayNumber(first));
  const now = ymd(dayNumber(todayISO));
  const months = [];
  for (let mo = { y: now.y, m: now.m }; compareMonths(mo, start) >= 0; mo = addMonths(mo.y, mo.m, -1)) months.push(mo);
  return { months, years: [...new Set(months.map((mo) => mo.y))] };
}

const logbookView = {
  title: 'Logbook for taxes',
  render(ctx) {
    const prefs = (ctx.prefs.logbook ??= { type: 'year', index: 0, truck: 'all' });
    const choices = logbookChoices(ctx.state, ctx.today);
    if (!choices.months.length) return h('div', { class: 'screen' }, empty('Once you\'ve logged some trips, you can make your logbook here.'));
    const options = prefs.type === 'month'
      ? choices.months.map((mo) => ({ label: monthLabel(mo.y, mo.m), period: { type: 'month', y: mo.y, m: mo.m } }))
      : choices.years.map((y) => ({ label: String(y), period: { type: 'year', y } }));
    if (prefs.index >= options.length) prefs.index = 0;
    const trucks = ctx.state.mileage.trucks;
    if (prefs.truck !== 'all' && !trucks.some((t) => t.id === prefs.truck)) prefs.truck = 'all';
    const book = buildLogbook(ctx.state, options[prefs.index].period, prefs.truck === 'all' ? null : prefs.truck);

    return h('div', { class: 'screen' },
      h('p', { class: 'muted' }, 'Every trip with its odometer readings, plus total km and business use, ready for the CRA or your accountant.'),
      segmented({
        label: 'Month or year', value: prefs.type,
        options: [{ value: 'year', label: 'A year' }, { value: 'month', label: 'A month' }],
        onChange: (v) => { prefs.type = v; prefs.index = 0; ctx.render(); },
      }),
      h('div', { class: 'field' }, h('select', {
        class: 'input select', 'aria-label': 'Which period',
        onchange: (e) => { prefs.index = Number(e.target.value); ctx.render(); },
      }, options.map((o, i) => h('option', { value: String(i), selected: i === prefs.index }, o.label)))),
      trucks.length > 1 && segmented({
        label: 'Which truck', small: true, value: prefs.truck,
        options: [{ value: 'all', label: 'Both' }, ...trucks.map((t) => ({ value: t.id, label: t.name }))],
        onChange: (v) => { prefs.truck = v; ctx.render(); },
      }),
      !book.ok
        ? checkWarning()
        : h('div', { class: 'card summary-card' },
          h('p', { class: 'month-card-title' }, book.title.replace('Mileage logbook: ', '')),
          h('div', { class: 'summary-line' }, h('span', {}, 'Total'), h('span', {}, formatKm(book.totalKm))),
          h('div', { class: 'summary-line' }, h('span', {}, 'Business'), h('span', {}, formatKm(book.businessKm))),
          h('div', { class: 'summary-line total' }, h('span', {}, 'Business use'), h('span', {}, book.businessPct || '—')),
          book.perTruck.filter((t) => t.trips).map((t) => h('p', { class: 'summary-words' },
            `${t.name}: odometer ${formatKm(t.startKm)} → ${formatKm(t.endKm)}, ${plural(t.trips, 'trip')}`))),
      book.ok && book.rows.length > 0 && bigButton('Spreadsheet (CSV)', async () => {
        const result = await saveFile(book.fileName, logbookCSV(book), 'text/csv');
        if (result !== 'cancelled') ctx.toast('Logbook ready');
      }),
      book.ok && book.rows.length > 0 && bigButton('PDF (print or save)', () => printLogbook(book), 'secondary'),
      book.ok && !book.rows.length && empty('No trips in this period.'));
  },
};

// ---------------------------------------------------------------- the tab

function summaryHow(t, names) {
  const lines = [{ kind: 'main', text: `Business ${formatKm(t.businessKm)} + personal ${formatKm(t.personalKm)} = ${formatKm(t.totalKm)}` }];
  if (t.trips.length && t.trips.length <= 12) {
    lines.push({ kind: 'line', text: `Each trip: ${t.trips.map((x) => tripKm(x).toLocaleString('en-CA')).join(' + ')} = ${formatKm(t.totalKm)}` });
  }
  if (t.byTruck.length > 1) for (const b of t.byTruck) lines.push({ kind: 'line', text: `${b.truck.name}: ${formatKm(b.km)}` });
  if (t.totalKm) lines.push({ kind: 'line', text: `Business use: ${formatKm(t.businessKm)} ÷ ${formatKm(t.totalKm)} = ${formatPct(t.businessPctTenths)}` });
  lines.push({ kind: 'line', text: 'Each trip\'s km = odometer at the end − odometer at the start.' });
  return lines;
}

export default {
  id: 'mileage',
  label: 'Mileage',
  icon: 'truck',
  title: 'Mileage',
  addLabel: 'Log a trip',
  onAdd(ctx) {
    if (!ctx.state.mileage.trucks.length) { openTruckForm(ctx); return; }
    openTripForm(ctx);
  },
  render(ctx) {
    const s = ctx.state;
    if (!s.mileage.trucks.length) {
      return h('div', { class: 'screen' },
        screenTitle('Mileage'),
        h('div', { class: 'card welcome' },
          h('h2', {}, 'Set up your trucks'),
          h('p', {}, 'Add each truck once. Then log each day\'s driving with the odometer at the start and end, and the app adds up your km, business use and fuel cost per km.'),
          bigButton('+ Add a truck', () => openTruckForm(ctx))));
    }

    const p = ctx.prefs;
    p.milePeriod ??= 'week';
    p.mileOffset ??= 0;
    p.mileTruck ??= 'all';
    if (p.mileTruck !== 'all' && !s.mileage.trucks.some((t) => t.id === p.mileTruck)) p.mileTruck = 'all';
    const today = dayNumber(ctx.today);
    const thisYear = ymd(today).y;
    const anchor = s.mileage.anchor ?? DEFAULT_ANCHOR;
    const range = shiftPeriod(periodRange(p.milePeriod, today, anchor), p.mileOffset, anchor);
    const truckId = p.mileTruck === 'all' ? null : p.mileTruck;
    const totals = mileageTotals(s, range.from, range.to, truckId);
    const names = new Map(s.mileage.trucks.map((t) => [t.id, t.name]));
    const shownTrucks = s.mileage.trucks.filter((t) => !truckId || t.id === truckId);

    return h('div', { class: 'screen' },
      screenTitle('Mileage'),
      segmented({
        label: 'Week, 2 weeks, month or year', value: p.milePeriod, options: PERIOD_OPTIONS,
        onChange: (v) => { p.milePeriod = v; p.mileOffset = 0; ctx.render(); },
      }),
      s.mileage.trucks.length > 1 && segmented({
        label: 'Which truck', small: true, value: p.mileTruck,
        options: [{ value: 'all', label: 'Both' }, ...s.mileage.trucks.map((t) => ({ value: t.id, label: t.name }))],
        onChange: (v) => { p.mileTruck = v; ctx.render(); },
      }),
      h('div', { class: 'period-nav' },
        h('button', { type: 'button', class: 'nav-btn', 'aria-label': 'Earlier', onclick: () => { p.mileOffset -= 1; ctx.render(); } }, '‹'),
        h('span', { class: 'period-label' }, rangeLabel(range, thisYear), p.mileOffset === 0 && h('small', {}, THIS[p.milePeriod])),
        h('button', { type: 'button', class: 'nav-btn', 'aria-label': 'Later', disabled: p.mileOffset >= 0, onclick: () => { p.mileOffset += 1; ctx.render(); } }, '›')),
      !totals.ok
        ? checkWarning()
        : h('div', { class: 'card hero' },
          h('p', { class: 'hero-label' }, 'Km driven'),
          h('p', { class: 'hero-amount' }, formatKm(totals.totalKm)),
          h('div', { class: 'km-split' },
            h('span', {}, h('small', {}, 'Business'), formatKm(totals.businessKm)),
            h('span', {}, h('small', {}, 'Personal'), formatKm(totals.personalKm)),
            h('span', {}, h('small', {}, 'Business use'), totals.businessPctTenths === null ? '—' : formatPct(totals.businessPctTenths))),
          showMeHow(() => summaryHow(totals, names))),
      section('Fuel cost per km', list(shownTrucks.map((truck) => {
        const c = costPerKm(s, truck, range.from, range.to);
        if (c.status === 'no-folder') {
          return row({ title: truck.name, sub: 'Pick this truck\'s fuel folder to see its cost per km', onClick: () => openTruckForm(ctx, truck) });
        }
        if (c.status === 'no-km') return row({ title: truck.name, sub: `No driving logged ${THIS[p.milePeriod] && p.mileOffset === 0 ? THIS[p.milePeriod] : 'in this period'}`, amount: '—' });
        if (!c.ok) return h('div', { class: 'row' }, checkWarning());
        return h('div', { class: 'row cpk-row' },
          h('span', { class: 'row-main' },
            h('span', { class: 'row-title' }, truck.name),
            h('span', { class: 'row-sub' }, `${money(c.fuelCents)} fuel ÷ ${formatKm(c.km)}`),
            showMeHow(() => [
              { kind: 'main', text: `${money(c.fuelCents)} ÷ ${formatKm(c.km)} = ${money(c.centsPerKm)} a km` },
              { kind: 'line', text: `Fuel: everything in the "${c.folderName}" folder in this period.` },
              { kind: 'line', text: `Km: ${truck.name}'s trips in this period.` },
              { kind: 'line', text: 'Rounded to the nearest cent.' },
            ])),
          h('span', { class: 'row-amount' }, `${money(c.centsPerKm)} a km`));
      }))),
      section('Trips',
        !totals.trips.length && empty('No trips in this period. Tap + to log one.'),
        totals.trips.length > 0 && list([...totals.trips].reverse().map((t) => row({
          title: `${dayLabel(dayNumber(t.date), thisYear)}${s.mileage.trucks.length > 1 ? ` · ${names.get(t.truckId)}` : ''}`,
          sub: t.tag === 'personal'
            ? ['Personal', t.where].filter(Boolean).join(' · ')
            : [t.where, t.purpose].filter(Boolean).join(' · '),
          amount: formatKm(tripKm(t)),
          onClick: () => openTripForm(ctx, { trip: t }),
        })))),
      section(null, list([
        row({ title: 'Logbook for taxes', sub: 'Spreadsheet or PDF for the CRA', onClick: () => ctx.push(logbookView) }),
        row({ title: 'Trucks', sub: `${plural(s.mileage.trucks.length, 'truck')} · fuel folders · 2-week periods`, onClick: () => ctx.push(trucksView) }),
      ])));
  },
};
