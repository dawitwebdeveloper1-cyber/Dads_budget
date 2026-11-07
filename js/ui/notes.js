// The gentle note cards on Home. Tap a note to see why; swipe it sideways
// (or tap ×) to put it away.

import { h } from './dom.js';
import { howLines } from './components.js';
import { adviceNotes } from '../insights/advice.js';
import { markPaid, unmarkPaid, dismissNote } from '../data/model.js';
import { monthView } from '../screens/history.js';

/** Tick a bill off, with an Undo button in case it was the wrong one. */
export function markPaidWithUndo(ctx, entry, iso) {
  ctx.update((s) => markPaid(s, entry.id, iso));
  ctx.toast(`${entry.name} marked paid`, {
    label: 'Undo',
    onClick: () => ctx.update((s) => unmarkPaid(s, entry.id, iso)),
  });
}

function runAction(ctx, action) {
  if (action.type === 'paid') {
    const entry = ctx.state.entries.find((e) => e.id === action.entryId);
    if (entry) markPaidWithUndo(ctx, entry, action.iso);
  } else if (action.type === 'month') {
    ctx.push(monthView(action.y, action.m));
  }
}

function noteCard(ctx, note) {
  let swiped = false;
  const why = h('div', { class: 'note-why', hidden: true },
    howLines(note.why),
    note.action && h('button', { type: 'button', class: 'btn btn-secondary note-action', onclick: () => runAction(ctx, note.action) }, note.action.label));
  const text = h('button', { type: 'button', class: 'note-text', 'aria-expanded': 'false' },
    h('span', {}, note.text), h('span', { class: 'note-more' }, 'Why?'));
  const card = h('div', { class: `note note-${note.tone}` });

  const putAway = () => {
    card.classList.add('gone');
    setTimeout(() => ctx.update((s) => dismissNote(s, note.id, ctx.today)), 200);
  };
  text.addEventListener('click', () => {
    if (swiped) { swiped = false; return; }
    why.hidden = !why.hidden;
    text.setAttribute('aria-expanded', String(!why.hidden));
    text.querySelector('.note-more').textContent = why.hidden ? 'Why?' : 'Hide';
  });

  // Swipe sideways to put it away.
  let startX = null;
  let dx = 0;
  card.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { startX = e.clientX; dx = 0; } });
  card.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    dx = e.clientX - startX;
    if (Math.abs(dx) > 10) {
      swiped = true;
      card.style.transform = `translateX(${dx}px)`;
      card.style.opacity = String(1 - Math.min(Math.abs(dx) / 260, 0.7));
    }
  });
  const end = () => {
    if (startX === null) return;
    startX = null;
    if (Math.abs(dx) > 100) { putAway(); return; }
    card.style.transform = '';
    card.style.opacity = '';
    setTimeout(() => { swiped = false; }, 50);
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);

  card.append(
    h('div', { class: 'note-top' },
      text,
      h('button', { type: 'button', class: 'note-x', 'aria-label': 'Put this note away', onclick: putAway }, '×')),
    why);
  return card;
}

export function notesArea(ctx) {
  const notes = adviceNotes(ctx.state, ctx.today);
  if (!notes.length) return null;
  return h('div', { class: 'notes', 'aria-label': 'Helpful notes' }, notes.map((n) => noteCard(ctx, n)));
}
