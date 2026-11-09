// The "log a day's driving" form: truck, date, odometer start and end,
// where and why, business or personal.

import { h, ask, openSheet } from './dom.js';
import { dateLabel } from './format.js';
import {
  parseOdometer, formatKm, lastEndKm, odometerCheck, findDuplicateTrip, LONG_DAY_KM,
} from '../maths/mileage.js';
import { isValidDate } from '../maths/dates.js';
import { addTrip, editTrip, deleteTrip, tripNeedsNotes } from '../data/model.js';

export function openTripForm(ctx, { trip = null } = {}) {
  const today = ctx.today;
  const editing = Boolean(trip);
  const trucks = ctx.state.mileage.trucks;
  const d = {
    truckId: trip?.truckId ?? (trucks.some((t) => t.id === ctx.prefs.lastTruck) ? ctx.prefs.lastTruck : trucks[0].id),
    tag: trip?.tag ?? 'business',
  };
  let startTouched = editing;
  let dirty = false;
  const truckName = (id) => trucks.find((t) => t.id === id)?.name ?? '';

  const truckButtons = Object.fromEntries(trucks.map((t) => [t.id, h('button', { type: 'button', class: 'choice', role: 'radio' }, t.name)]));
  const dateInput = h('input', { id: 't-date', class: 'input', type: 'date', value: trip?.date ?? today, max: today });
  const startInput = h('input', { id: 't-start', class: 'input odo-input', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'For example: 245310' });
  const endInput = h('input', { id: 't-end', class: 'input odo-input', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'For example: 245722' });
  const kmLine = h('p', { class: 'km-line', 'aria-live': 'polite' });
  const whereInput = h('input', { id: 't-where', class: 'input', type: 'text', maxlength: '80', autocapitalize: 'sentences', placeholder: 'For example: Calgary to Red Deer', value: trip?.where ?? '' });
  const purposeInput = h('input', { id: 't-purpose', class: 'input', type: 'text', maxlength: '80', autocapitalize: 'sentences', placeholder: 'For example: Delivery for ABC Freight', value: trip?.purpose ?? '' });
  const errors = {
    date: h('p', { class: 'field-error', 'aria-live': 'polite' }),
    start: h('p', { class: 'field-error', 'aria-live': 'polite' }),
    end: h('p', { class: 'field-error', 'aria-live': 'polite' }),
    notes: h('p', { class: 'field-error', 'aria-live': 'polite' }),
  };
  const tagButtons = {
    business: h('button', { type: 'button', class: 'seg', role: 'radio' }, 'Business'),
    personal: h('button', { type: 'button', class: 'seg', role: 'radio' }, 'Personal'),
  };
  const notesHint = h('p', { class: 'hint' });

  if (editing) {
    startInput.value = String(trip.startKm);
    endInput.value = String(trip.endKm);
  } else {
    const last = lastEndKm(ctx.state, d.truckId);
    if (last !== null) startInput.value = String(last);
  }

  const body = h('form', { class: 'entry-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
    trucks.length > 1 && h('div', { class: 'field first' }, h('span', { class: 'label' }, 'Which truck?'),
      h('div', { class: 'choice-grid', role: 'radiogroup', 'aria-label': 'Which truck?' }, Object.values(truckButtons))),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 't-date' }, 'Which day?'), dateInput, errors.date),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 't-start' }, 'Odometer at the start'), startInput,
      h('p', { class: 'hint' }, 'Filled in from where this truck ended last time. Change it if it\'s different.'), errors.start),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 't-end' }, 'Odometer at the end'), endInput, errors.end, kmLine),
    h('div', { class: 'field' },
      h('span', { class: 'label' }, 'Business or personal?'),
      h('div', { class: 'segmented small', role: 'radiogroup', 'aria-label': 'Business or personal' }, tagButtons.business, tagButtons.personal)),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 't-where' }, 'Where did you go?'), whereInput),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 't-purpose' }, 'What was it for?'), purposeInput, notesHint, errors.notes),
    h('button', { type: 'button', class: 'btn btn-primary btn-save', onclick: () => save() }, 'Save'),
    editing && h('button', { type: 'button', class: 'btn btn-danger-plain', onclick: () => remove() }, 'Delete'));

  const sheet = openSheet({ title: editing ? 'Edit trip' : 'Log a trip', onCancel: cancel, body });

  function showKm() {
    const a = parseOdometer(startInput.value);
    const b = parseOdometer(endInput.value);
    kmLine.textContent = a.ok && b.ok && b.km >= a.km ? `= ${formatKm(b.km - a.km)}` : '';
  }

  function refresh() {
    for (const [id, b] of Object.entries(truckButtons)) {
      b.classList.toggle('on', id === d.truckId);
      b.setAttribute('aria-checked', String(id === d.truckId));
    }
    for (const [t, b] of Object.entries(tagButtons)) {
      b.classList.toggle('on', d.tag === t);
      b.setAttribute('aria-checked', String(d.tag === t));
    }
    notesHint.textContent = d.tag === 'business' ? 'For business trips, the CRA logbook needs where you went and why.' : 'Optional for personal trips.';
    showKm();
  }

  for (const [id, b] of Object.entries(truckButtons)) {
    b.addEventListener('click', () => {
      d.truckId = id;
      dirty = true;
      if (!startTouched) {
        const last = lastEndKm(ctx.state, id);
        startInput.value = last === null ? '' : String(last);
      }
      refresh();
    });
  }
  for (const [t, b] of Object.entries(tagButtons)) b.addEventListener('click', () => { d.tag = t; dirty = true; errors.notes.textContent = ''; refresh(); });
  startInput.addEventListener('input', () => { startTouched = true; dirty = true; errors.start.textContent = ''; showKm(); });
  endInput.addEventListener('input', () => { dirty = true; errors.end.textContent = ''; showKm(); });
  for (const el of [dateInput, whereInput, purposeInput]) el.addEventListener('input', () => { dirty = true; errors.date.textContent = ''; errors.notes.textContent = ''; });

  function readForm() {
    for (const e of Object.values(errors)) e.textContent = '';
    let ok = true;
    const start = parseOdometer(startInput.value);
    const end = parseOdometer(endInput.value);
    if (!start.ok) { errors.start.textContent = start.message; ok = false; }
    if (!end.ok) { errors.end.textContent = end.message; ok = false; }
    if (start.ok && end.ok && end.km < start.km) { errors.end.textContent = 'The end reading is lower than the start reading. Please check them.'; ok = false; }
    if (!isValidDate(dateInput.value)) { errors.date.textContent = 'Please pick a date.'; ok = false; } else if (dateInput.value > today) { errors.date.textContent = 'The date can\'t be in the future.'; ok = false; }
    const draft = {
      truckId: d.truckId, date: dateInput.value, startKm: start.km, endKm: end.km,
      where: whereInput.value, purpose: purposeInput.value, tag: d.tag,
    };
    if (tripNeedsNotes(draft)) { errors.notes.textContent = 'For business trips, please fill in where you went and what it was for.'; ok = false; }
    if (!ok) {
      body.querySelector('.field-error:not(:empty)')?.closest('.field')?.querySelector('input')?.focus();
      return null;
    }
    return draft;
  }

  async function save() {
    const draft = readForm();
    if (!draft) return;
    const km = draft.endKm - draft.startKm;
    const name = truckName(draft.truckId);

    if (km > LONG_DAY_KM) {
      const { value } = await ask({
        title: 'Are you sure?',
        message: `That's ${formatKm(km)} in one day. Just checking the readings are right.`,
        buttons: [{ label: 'Let me fix it', value: false, kind: 'primary' }, { label: 'Yes, that\'s right', value: true }],
      });
      if (!value) { endInput.focus(); return; }
    }

    const check = odometerCheck(ctx.state, draft, trip?.id ?? null);
    if (check) {
      const when = dateLabel(check.prev.date);
      const { value } = await ask({
        title: check.type === 'gap' ? 'Missing a trip?' : 'Please check the start reading',
        message: check.type === 'gap'
          ? `Last time, ${name} ended at ${formatKm(check.prev.endKm)} (${when}). This trip starts at ${formatKm(draft.startKm)}, so ${formatKm(check.missingKm)} aren't in the logbook.`
          : `Last time, ${name} ended at ${formatKm(check.prev.endKm)} (${when}). This trip starts lower, at ${formatKm(draft.startKm)}.`,
        buttons: [{ label: 'Let me fix it', value: false, kind: 'primary' }, { label: 'Save anyway', value: true }],
      });
      if (!value) { startInput.focus(); return; }
    }

    const twin = findDuplicateTrip(ctx.state, draft, trip?.id ?? null);
    if (twin) {
      const { value } = await ask({
        title: 'Already logged?',
        message: `${name} already has a trip on ${dateLabel(twin.date)} starting at ${formatKm(twin.startKm)}. Save this one too?`,
        buttons: [{ label: 'Don\'t save', value: false, kind: 'primary' }, { label: 'Save anyway', value: true }],
      });
      if (!value) return;
    }

    const { value: confirmed } = await ask({
      title: editing ? 'Save these changes?' : 'Save this trip?',
      message: h('div', { class: 'confirm' },
        h('p', { class: 'confirm-amount' }, formatKm(km)),
        h('p', { class: 'confirm-sentence' }, `Save ${formatKm(km)} for ${name} on ${dateLabel(draft.date)} (${draft.tag})?`),
        h('dl', { class: 'confirm-details' },
          h('dt', {}, 'Truck'), h('dd', {}, name),
          h('dt', {}, 'Odometer'), h('dd', {}, `${formatKm(draft.startKm)} → ${formatKm(draft.endKm)}`),
          draft.where.trim() && [h('dt', {}, 'Where'), h('dd', {}, draft.where.trim())],
          draft.purpose.trim() && [h('dt', {}, 'For'), h('dd', {}, draft.purpose.trim())])),
      buttons: [{ label: 'Confirm', value: true, kind: 'primary' }, { label: 'Edit', value: false }],
    });
    if (!confirmed) return;

    try {
      ctx.change((s) => (editing ? editTrip(s, trip.id, draft, today) : addTrip(s, draft, today)), 'Trip saved');
    } catch (err) {
      await ask({ title: 'Not saved', message: err.message });
      return;
    }
    ctx.prefs.lastTruck = draft.truckId;
    sheet.close();
  }

  async function cancel() {
    if (dirty) {
      const { value } = await ask({
        title: 'Close without saving?',
        buttons: [{ label: 'Keep editing', value: false, kind: 'primary' }, { label: 'Close without saving', value: true, kind: 'danger' }],
      });
      if (!value) return;
    }
    sheet.close();
  }

  async function remove() {
    const { value } = await ask({
      title: 'Are you sure?',
      message: `Delete the ${formatKm(trip.endKm - trip.startKm)} trip for ${truckName(trip.truckId)} on ${dateLabel(trip.date)}?`,
      buttons: [{ label: 'Delete', value: true, kind: 'danger' }, { label: 'Cancel', value: false }],
    });
    if (!value) return;
    ctx.change((s) => deleteTrip(s, trip.id), 'Trip deleted');
    sheet.close();
  }

  refresh();
  if (!editing) setTimeout(() => endInput.focus(), 50);
}
