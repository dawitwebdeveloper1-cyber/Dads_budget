// The add / edit form: money in or out, amount, name, where it goes, how often.

import { h, ask, openSheet } from './dom.js';
import { money, monthLabel, howOften, dateLabel as dateText } from './format.js';
import { parseAmount, centsToInput } from '../maths/money.js';
import { FREQUENCIES, FREQUENCY_ORDER } from '../maths/schedule.js';
import { normalizeName, trackingStartDay } from '../maths/budget.js';
import { unusualAmount, findDuplicate } from '../maths/checks.js';
import { favourites } from '../insights/favourites.js';
import { ymd, dayNumber, isValidDate } from '../maths/dates.js';
import {
  addEntry, editEntry, editAffectsPast, deleteEntry, stopEntry, hasPastMonths, dateTooEarly,
  addCategory, addFolder,
} from '../data/model.js';

const HINTS = {
  out: {
    once: 'Like a repair or a big purchase. It counts in its own month only, not in your normal month.',
    varies: 'Like gas or groceries. Add each one when it happens and the app works out your average.',
  },
  in: {
    once: 'Like a gift or a tax refund. It counts in its own month only.',
    varies: 'Pay that\'s different each time. Add each one as it comes in and the app works out your average.',
  },
};

/**
 * Open the form. Pass `entry` to edit one, or `preset` to fill in some answers
 * (used by the first-time walkthrough).
 */
export function openEntryForm(ctx, { entry = null, preset = {} } = {}) {
  const today = ctx.today;
  const editing = Boolean(entry);
  const d = {
    kind: entry?.kind ?? preset.kind ?? 'out',
    name: entry?.name ?? preset.name ?? '',
    where: entry ? (entry.folderId ? `f:${entry.folderId}` : `c:${entry.categoryId}`) : (preset.where ?? ''),
    freq: entry?.freq ?? preset.freq ?? 'once',
    date: entry?.startDate ?? today,
    tag: entry?.tag ?? 'personal',
  };
  let freqTouched = editing || Boolean(preset.freq);
  let dirty = false;

  // ---- fields
  const kindButtons = {
    in: h('button', { type: 'button', class: 'kind-btn in' }, 'Money in'),
    out: h('button', { type: 'button', class: 'kind-btn out' }, 'Money out'),
  };
  const amountInput = h('input', {
    id: 'f-amount', class: 'input amount-input', type: 'text', inputmode: 'decimal', autocomplete: 'off',
    placeholder: '0.00', value: entry ? centsToInput(entry.amountCents) : '', enterkeyhint: 'next',
  });
  const amountError = h('p', { class: 'field-error', id: 'f-amount-err', 'aria-live': 'polite' });
  amountInput.setAttribute('aria-describedby', 'f-amount-err');

  const nameList = h('datalist', { id: 'f-names' });
  const nameInput = h('input', {
    id: 'f-name', class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'sentences',
    placeholder: 'For example: Phone bill', value: d.name, list: 'f-names', maxlength: '60', enterkeyhint: 'done',
  });
  const nameError = h('p', { class: 'field-error', 'aria-live': 'polite' });

  const whereSelect = h('select', { id: 'f-where', class: 'input select' });
  const whereError = h('p', { class: 'field-error', 'aria-live': 'polite' });
  const whereField = h('div', { class: 'field' },
    h('label', { class: 'label', for: 'f-where' }, 'Where does it go?'), whereSelect, whereError);

  const freqButtons = {};
  const freqGrid = h('div', { class: 'choice-grid', role: 'radiogroup', 'aria-label': 'How often?' },
    FREQUENCY_ORDER.map((f) => {
      freqButtons[f] = h('button', { type: 'button', class: 'choice', role: 'radio' }, FREQUENCIES[f].label);
      return freqButtons[f];
    }));
  const freqHint = h('p', { class: 'hint' });

  const dateLabel = h('label', { class: 'label', for: 'f-date' });
  const dateInput = h('input', { id: 'f-date', class: 'input', type: 'date', value: d.date });
  const dateHint = h('p', { class: 'hint' });
  const dateError = h('p', { class: 'field-error', 'aria-live': 'polite' });

  const tagButtons = {
    personal: h('button', { type: 'button', class: 'seg' }, 'Personal'),
    business: h('button', { type: 'button', class: 'seg' }, 'Business'),
  };

  const saveButton = h('button', { type: 'button', class: 'btn btn-primary btn-save' }, 'Save');
  const deleteButton = editing ? h('button', { type: 'button', class: 'btn btn-danger-plain' }, 'Delete') : null;

  // Quick-add: one tap fills in something he enters often, ready for the new amount.
  const quick = editing ? [] : favourites(ctx.state, today);
  const quickAdd = quick.length > 0 && h('div', { class: 'quick-add' },
    h('span', { class: 'label' }, 'Quick add'),
    h('div', { class: 'quick-list' }, quick.map((f) => h('button', {
      type: 'button',
      class: 'quick-btn',
      onclick: () => {
        Object.assign(d, { kind: f.kind, name: f.name, where: f.where, freq: f.freq, tag: f.tag, date: today });
        freqTouched = true;
        dirty = true;
        nameInput.value = f.name;
        dateInput.value = today;
        amountInput.value = centsToInput(f.amountCents);
        for (const el of [amountError, nameError, whereError, dateError]) el.textContent = '';
        fillWhereOptions();
        fillNames();
        refresh();
        amountInput.focus();
        amountInput.select();
      },
    }, h('span', { class: 'quick-name' }, f.name), h('span', { class: 'quick-amount' }, `last ${money(f.amountCents)}`)))),
    h('p', { class: 'hint' }, 'Tap one, change the amount if needed, then Save.'));

  const body = h('form', { class: 'entry-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
    quickAdd,
    h('div', { class: 'kind-toggle', role: 'radiogroup', 'aria-label': 'Money in or money out' }, kindButtons.in, kindButtons.out),
    h('div', { class: 'field' },
      h('label', { class: 'label', for: 'f-amount' }, 'How much?'),
      h('div', { class: 'amount-wrap' }, h('span', { class: 'amount-sign', 'aria-hidden': 'true' }, '$'), amountInput),
      amountError),
    h('div', { class: 'field' },
      h('label', { class: 'label', for: 'f-name' }, 'What is it?'), nameInput, nameList, nameError),
    whereField,
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'How often?'), freqGrid, freqHint),
    h('div', { class: 'field' }, dateLabel, dateInput, dateHint, dateError),
    h('div', { class: 'field' },
      h('span', { class: 'label' }, 'Personal or business?'),
      h('div', { class: 'segmented small', role: 'radiogroup', 'aria-label': 'Personal or business' }, tagButtons.personal, tagButtons.business)),
    saveButton,
    deleteButton);

  const sheet = openSheet({ title: titleText(), onCancel: cancel, body });

  // ---- keeping the form in step with the answers
  function titleText() {
    if (editing) return 'Edit';
    return d.kind === 'in' ? 'Add money in' : 'Add money out';
  }

  function fillWhereOptions() {
    const s = ctx.state;
    whereSelect.replaceChildren(
      h('option', { value: '' }, 'Pick one…'),
      h('optgroup', { label: 'Categories' }, s.categories.map((c) => h('option', { value: `c:${c.id}` }, c.name))),
      s.folders.length > 0 && h('optgroup', { label: 'Folders' }, s.folders.map((f) => h('option', { value: `f:${f.id}` }, `📁 ${f.name}`))),
      h('optgroup', { label: 'Add new' },
        h('option', { value: 'new:cat' }, '+ New category…'),
        h('option', { value: 'new:folder' }, '+ New folder…')));
    whereSelect.value = d.where;
    if (whereSelect.value !== d.where) d.where = '';
  }

  function fillNames() {
    const seen = new Map();
    for (const e of ctx.state.entries) if (e.kind === d.kind) seen.set(normalizeName(e.name), e.name);
    nameList.replaceChildren(...[...seen.values()].sort().map((n) => h('option', { value: n })));
  }

  function refresh() {
    sheet.setTitle(titleText());
    for (const [k, b] of Object.entries(kindButtons)) {
      b.classList.toggle('on', d.kind === k);
      b.setAttribute('aria-checked', String(d.kind === k));
      b.setAttribute('role', 'radio');
    }
    whereField.hidden = d.kind === 'in';
    for (const [f, b] of Object.entries(freqButtons)) {
      b.classList.toggle('on', d.freq === f);
      b.setAttribute('aria-checked', String(d.freq === f));
    }
    const recurring = FREQUENCIES[d.freq].recurring;
    freqHint.textContent = recurring ? 'The app adds it for you every time it comes around.' : HINTS[d.kind][d.freq];
    if (recurring) {
      dateLabel.textContent = d.kind === 'in' ? 'Pick a payday' : 'Pick a day it\'s due';
      dateHint.textContent = 'Pick the most recent one (or the next one if it hasn\'t started yet). The app works out the rest.';
    } else {
      dateLabel.textContent = 'When?';
      dateHint.textContent = '';
    }
    for (const [t, b] of Object.entries(tagButtons)) {
      b.classList.toggle('on', d.tag === t);
      b.setAttribute('aria-checked', String(d.tag === t));
      b.setAttribute('role', 'radio');
    }
  }

  // ---- reacting to taps and typing
  for (const [k, b] of Object.entries(kindButtons)) {
    b.addEventListener('click', () => { d.kind = k; dirty = true; fillNames(); refresh(); });
  }
  for (const [f, b] of Object.entries(freqButtons)) {
    b.addEventListener('click', () => { d.freq = f; freqTouched = true; dirty = true; refresh(); });
  }
  for (const [t, b] of Object.entries(tagButtons)) {
    b.addEventListener('click', () => { d.tag = t; dirty = true; refresh(); });
  }
  amountInput.addEventListener('input', () => { dirty = true; amountError.textContent = ''; });
  dateInput.addEventListener('input', () => { dirty = true; d.date = dateInput.value; dateError.textContent = ''; });
  nameInput.addEventListener('input', () => { dirty = true; d.name = nameInput.value; nameError.textContent = ''; });
  nameInput.addEventListener('change', () => {
    if (editing) return;
    // If he's used this name before, fill in where it went and how often.
    const key = normalizeName(nameInput.value);
    const past = [...ctx.state.entries].reverse().find((e) => e.kind === d.kind && normalizeName(e.name) === key);
    if (!past) return;
    if (!d.where && past.kind === 'out') {
      d.where = past.folderId ? `f:${past.folderId}` : `c:${past.categoryId}`;
      fillWhereOptions();
    }
    if (!freqTouched) d.freq = past.freq;
    d.tag = past.tag;
    refresh();
  });
  whereSelect.addEventListener('change', async () => {
    dirty = true;
    whereError.textContent = '';
    const v = whereSelect.value;
    if (v === 'new:cat' || v === 'new:folder') {
      const isFolder = v === 'new:folder';
      const { value, text } = await ask({
        title: isFolder ? 'New folder' : 'New category',
        message: isFolder ? 'For example, one folder for each child.' : null,
        input: { placeholder: isFolder ? 'Folder name' : 'Category name' },
        buttons: [{ label: 'Add', value: true, kind: 'primary' }, { label: 'Cancel', value: false }],
      });
      if (value && text.trim()) {
        try {
          let newId = null;
          ctx.update((s) => {
            const next = isFolder ? addFolder(s, text) : addCategory(s, text);
            newId = (isFolder ? next.folders : next.categories).at(-1).id;
            return next;
          });
          d.where = `${isFolder ? 'f' : 'c'}:${newId}`;
        } catch (err) {
          await ask({ title: 'Can\'t add that', message: err.message });
        }
      }
      fillWhereOptions();
      return;
    }
    d.where = v;
  });

  // ---- saving
  function readForm() {
    const parsed = parseAmount(amountInput.value);
    let ok = true;
    if (!parsed.ok) { amountError.textContent = parsed.message; ok = false; }
    d.name = nameInput.value;
    if (!normalizeName(d.name)) { nameError.textContent = 'Please give it a name, like "Phone bill".'; ok = false; }
    if (d.kind === 'out' && !d.where) { whereError.textContent = 'Please pick where it goes.'; ok = false; }
    d.date = dateInput.value;
    if (!isValidDate(d.date)) { dateError.textContent = 'Please pick a date.'; ok = false; }
    if (!ok) return null;
    const draft = {
      kind: d.kind,
      amountCents: parsed.cents,
      name: d.name,
      categoryId: d.kind === 'out' && d.where.startsWith('c:') ? d.where.slice(2) : null,
      folderId: d.kind === 'out' && d.where.startsWith('f:') ? d.where.slice(2) : null,
      freq: d.freq,
      startDate: d.date,
      tag: d.tag,
    };
    if (dateTooEarly(ctx.state, draft, today)) {
      const startDay = trackingStartDay(ctx.state) ?? dayNumber(today);
      const { y, m } = ymd(startDay);
      dateError.textContent = `Please pick a date in ${monthLabel(y, m)} or later. That's when you started, so earlier months aren't counted.`;
      return null;
    }
    return draft;
  }

  function focusFirstError() {
    const err = body.querySelector('.field-error:not(:empty)');
    err?.closest('.field')?.querySelector('input, select')?.focus();
  }

  async function save() {
    const draft = readForm();
    if (!draft) { focusFirstError(); return; }

    let mode = 'everywhere';
    if (editing && editAffectsPast(ctx.state, entry.id, draft, today)) {
      const { value } = await ask({
        title: 'Did it change, or was it a mistake?',
        message: 'Earlier months used the old details.',
        buttons: [
          { label: 'It changed from this month on', value: 'fromThisMonth', kind: 'primary' },
          { label: 'Fix a mistake in all months', value: 'everywhere', kind: 'plain' },
          { label: 'Go back', value: null, kind: 'plain' },
        ],
      });
      if (!value) return;
      mode = value;
    }

    const unusual = unusualAmount(ctx.state, draft, entry?.id ?? null);
    if (unusual) {
      const message = unusual.usualCents === null
        ? `${money(draft.amountCents)} is a big amount. Just checking it's right.`
        : `You usually put ${money(unusual.usualCents)} for ${draft.name.trim()}. This is ${money(draft.amountCents)}.`;
      const { value } = await ask({
        title: 'Are you sure?',
        message,
        buttons: [{ label: 'Let me fix it', value: false, kind: 'primary' }, { label: 'Yes, that\'s right', value: true }],
      });
      if (!value) { amountInput.focus(); amountInput.select(); return; }
    }

    const twin = findDuplicate(ctx.state, draft, entry?.id ?? null);
    if (twin) {
      const { value } = await ask({
        title: 'Already entered?',
        message: `"${twin.name}" (${howOften(twin)}) is already in your list. Save this one too?`,
        buttons: [{ label: 'Don\'t save', value: false, kind: 'primary' }, { label: 'Save anyway', value: true }],
      });
      if (!value) return;
    }

    const { value: confirmed } = await ask({
      title: editing ? 'Save these changes?' : 'Save this?',
      message: confirmCard(draft),
      buttons: [{ label: 'Confirm', value: true, kind: 'primary' }, { label: 'Edit', value: false }],
    });
    if (!confirmed) return;

    try {
      ctx.change(
        (s) => (editing ? editEntry(s, entry.id, draft, today, mode) : addEntry(s, draft, today)),
        mode === 'fromThisMonth' ? 'Saved. Earlier months keep the old details.' : 'Saved',
      );
    } catch (err) {
      await ask({ title: 'Not saved', message: err.message });
      return;
    }
    sheet.close();
  }

  /** The big, easy-to-read summary shown before saving, so a typo stands out. */
  function confirmCard(draft) {
    const f = FREQUENCIES[draft.freq];
    const s = ctx.state;
    const where = draft.kind === 'in'
      ? 'Money in'
      : draft.folderId
        ? `📁 ${s.folders.find((x) => x.id === draft.folderId)?.name ?? ''}`
        : s.categories.find((c) => c.id === draft.categoryId)?.name ?? '';
    const when = f.recurring ? `Starting from ${dateText(draft.startDate)}` : dateText(draft.startDate);
    const changedAmount = editing && entry.amountCents !== draft.amountCents;
    return h('div', { class: 'confirm' },
      h('p', { class: `confirm-amount ${draft.kind === 'in' ? 'up' : 'down'}` }, money(draft.amountCents)),
      changedAmount && h('p', { class: 'confirm-was' }, `Was ${money(entry.amountCents)}`),
      h('p', { class: 'confirm-sentence' }, f.recurring
        ? `Save ${money(draft.amountCents)} for ${draft.name.trim()}, ${f.short}?`
        : `Save ${money(draft.amountCents)} for ${draft.name.trim()} on ${dateText(draft.startDate)}?`),
      h('dl', { class: 'confirm-details' },
        h('dt', {}, 'Name'), h('dd', {}, draft.name.trim()),
        h('dt', {}, draft.kind === 'in' ? 'Type' : 'Goes in'), h('dd', {}, where),
        h('dt', {}, 'How often'), h('dd', {}, f.label),
        h('dt', {}, 'When'), h('dd', {}, when),
        draft.tag === 'business' && [h('dt', {}, 'For'), h('dd', {}, 'Business')]));
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
    const s = ctx.state;
    const current = s.entries.find((e) => e.id === entry.id);
    if (!current) { sheet.close(); return; }
    const stillGoing = !current.endDate || dayNumber(current.endDate) >= dayNumber(today);
    if (FREQUENCIES[current.freq].recurring && stillGoing && hasPastMonths(s, current, today)) {
      const { value } = await ask({
        title: `Remove ${current.name}?`,
        message: 'It\'s already counted in earlier months.',
        buttons: [
          { label: 'Stop it after this month', value: 'stop', kind: 'primary' },
          { label: 'Delete it from all months', value: 'delete', kind: 'danger' },
          { label: 'Cancel', value: null },
        ],
      });
      if (!value) return;
      ctx.change(
        (st) => (value === 'stop' ? stopEntry(st, current.id, today) : deleteEntry(st, current.id)),
        value === 'stop' ? `${current.name} stops after this month` : 'Deleted',
      );
      sheet.close();
      return;
    }
    const { value } = await ask({
      title: 'Are you sure?',
      message: `Delete ${current.name} (${howOften(current)})?`,
      buttons: [{ label: 'Delete', value: true, kind: 'danger' }, { label: 'Cancel', value: false }],
    });
    if (!value) return;
    ctx.change((st) => deleteEntry(st, current.id), 'Deleted');
    sheet.close();
  }

  saveButton.addEventListener('click', save);
  deleteButton?.addEventListener('click', remove);

  fillWhereOptions();
  fillNames();
  refresh();
  if (!editing) setTimeout(() => amountInput.focus(), 50);
}
