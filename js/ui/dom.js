// Small helpers for building the screen, plus pop-up questions and messages.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && !['list', 'type'].includes(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  truck: '<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  warning: '<path d="M12 3 2 21h20zM12 10v5M12 18v.01"/>',
};

export function icon(name, cls = 'icon') {
  const span = document.createElement('span');
  span.className = cls;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}

const overlayRoot = () => document.getElementById('overlays');

/**
 * Ask a question in a card. Resolves with the value of the button tapped
 * (null if he taps outside), plus the typed text if there was a text box.
 */
export function ask({ title, message, buttons = [{ label: 'OK', value: true, kind: 'primary' }], input = null }) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    let field = null;
    if (input) {
      field = h('input', {
        class: `input${input.inputmode === 'decimal' ? ' amount-input dialog-amount' : ''}`,
        type: 'text', value: input.value ?? '', placeholder: input.placeholder ?? '',
        inputmode: input.inputmode ?? null,
        autocapitalize: input.inputmode ? 'off' : 'words', enterkeyhint: 'done', 'aria-label': title,
      });
    }
    const done = (value) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      previousFocus?.focus?.({ preventScroll: true });
      resolve({ value, text: field ? field.value : null });
    };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    const card = h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', { class: 'dialog-title' }, title),
      message && (message instanceof Node ? message : h('p', { class: 'dialog-text' }, message)),
      field,
      h('div', { class: 'dialog-buttons' },
        buttons.map((b) => h('button', { type: 'button', class: `btn btn-${b.kind ?? 'plain'}`, onclick: () => done(b.value) }, b.label))));
    const backdrop = h('div', { class: 'backdrop', onclick: (e) => { if (e.target === backdrop) done(null); } }, card);
    if (field) field.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(buttons[0].value); });
    overlayRoot().append(backdrop);
    document.addEventListener('keydown', onKey);
    (field ?? card.querySelector('.btn'))?.focus({ preventScroll: true });
  });
}

/** A full-screen panel that slides up (used for the add/edit form). */
export function openSheet({ title, onCancel, body }) {
  const heading = h('h2', { class: 'sheet-title' }, title);
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('button', { type: 'button', class: 'link-btn', onclick: () => onCancel() }, 'Cancel'),
      heading,
      h('span', { class: 'sheet-head-spacer' })),
    h('div', { class: 'sheet-body' }, body));
  overlayRoot().append(panel);
  document.body.classList.add('sheet-open');
  return {
    setTitle(text) { heading.textContent = text; panel.setAttribute('aria-label', text); },
    close() { panel.remove(); document.body.classList.remove('sheet-open'); },
  };
}

let toastTimer = null;
/** A short message near the bottom. Pass `action` ({ label, onClick }) to add a button like "Undo". */
export function toast(text, action = null) {
  const root = overlayRoot();
  root.querySelector('.toast')?.remove();
  const el = h('div', { class: `toast${action ? ' with-action' : ''}`, role: 'status' },
    h('span', {}, text),
    action && h('button', {
      type: 'button',
      class: 'toast-action',
      onclick: () => { el.remove(); action.onClick(); },
    }, action.label));
  root.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), action ? 6000 : 2600);
}
