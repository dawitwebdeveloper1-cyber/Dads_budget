// Building blocks shared by the screens.

import { h, icon } from './dom.js';
import { money } from './format.js';

/** A tappable line in a list: title and small text on the left, amount on the right. */
export function row({ title, sub = null, amount = null, tone = '', onClick = null, lead = null }) {
  const props = onClick ? { type: 'button', class: 'row tappable', onclick: onClick } : { class: 'row' };
  return h(onClick ? 'button' : 'div', props,
    lead,
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, title),
      sub && h('span', { class: 'row-sub' }, sub)),
    amount != null && h('span', { class: `row-amount ${tone}` }, amount),
    onClick && icon('chevron', 'icon chevron'));
}

export function list(rows) {
  return h('div', { class: 'list' }, rows);
}

export function section(title, ...children) {
  return h('section', { class: 'section' }, title && h('h2', { class: 'section-title' }, title), children);
}

export function screenTitle(text, sub = null) {
  return h('header', { class: 'screen-head' }, h('h1', {}, text), sub && h('p', { class: 'screen-sub' }, sub));
}

/** Shown instead of a number whose cross-check didn't match. */
export function checkWarning() {
  return h('div', { class: 'warning', role: 'alert' },
    icon('warning'),
    h('span', {}, 'Something doesn\'t add up here, so the number is hidden rather than shown wrong. Try closing and reopening the app. If it stays, please check your entries.'));
}

/** Money text, or a warning if the cross-check failed. */
export function checkedMoney(ok, cents, cls = '') {
  return ok ? h('span', { class: cls }, money(cents)) : h('span', { class: `${cls} hidden-number` }, '—');
}

/** A row of buttons where one is picked, like Day / Week / Month / Year. */
export function segmented({ options, value, onChange, label, small = false }) {
  return h('div', { class: `segmented${small ? ' small' : ''}`, role: 'radiogroup', 'aria-label': label },
    options.map((o) => h('button', {
      type: 'button',
      class: o.value === value ? 'seg on' : 'seg',
      role: 'radio',
      'aria-checked': String(o.value === value),
      onclick: () => onChange(o.value),
    }, o.label)));
}

/** A category or folder with a bar showing its share. */
export function barRow({ name, cents, fraction, isFolder, sub, onClick }) {
  return h('button', { type: 'button', class: 'bar-row tappable', onclick: onClick },
    h('span', { class: 'bar-top' },
      h('span', { class: 'bar-name' }, isFolder && icon('folder', 'icon folder-icon'), name),
      h('span', { class: 'bar-amount' }, money(cents)),
      icon('chevron', 'icon chevron')),
    h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `width:${Math.max(2, Math.round(fraction * 100))}%` })),
    sub && h('span', { class: 'row-sub' }, sub));
}

export function empty(text, button = null) {
  return h('div', { class: 'empty' }, h('p', {}, text), button);
}

export function bigButton(label, onClick, kind = 'primary') {
  return h('button', { type: 'button', class: `btn btn-${kind}`, onclick: onClick }, label);
}

/** "You're up $X" / "You're short $X" */
export function upOrShort(cents) {
  if (cents > 0) return `You're up ${money(cents)}`;
  if (cents < 0) return `You're short ${money(-cents)}`;
  return 'You\'re even';
}

export function toneOf(cents) {
  if (cents > 0) return 'up';
  if (cents < 0) return 'down';
  return '';
}
