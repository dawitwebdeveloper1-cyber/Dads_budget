// The optional passcode lock: 4 numbers, typed on a big keypad.
// The passcode itself is never saved, only a scrambled fingerprint of it.
// This keeps out someone who picks up his phone; it isn't bank-level security.

import { h, ask } from './dom.js';
import { setSetting, newState } from '../data/model.js';

const LENGTH = 4;
/** After this long away from the app, the passcode is asked again. */
export const LOCK_AFTER_MS = 60 * 1000;

export function lockEnabled(state) {
  return Boolean(state.settings?.lock?.hash);
}

async function fingerprint(code, salt) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${code}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function codeMatches(state, code) {
  const lock = state.settings?.lock;
  return Boolean(lock) && (await fingerprint(code, lock.salt)) === lock.hash;
}

/**
 * A full-screen keypad. `onCode` gets the 4 numbers and returns true (done),
 * or a message to show before trying again.
 */
function keypad({ title, sub = '', onCode, extra = null, cancel = null }) {
  return new Promise((resolve) => {
    let code = '';
    let busy = false;
    const dots = h('div', { class: 'lock-dots', 'aria-hidden': 'true' });
    const status = h('p', { class: 'lock-status', 'aria-live': 'assertive' }, sub);
    const drawDots = () => dots.replaceChildren(...Array.from({ length: LENGTH }, (_, i) => h('span', { class: i < code.length ? 'dot on' : 'dot' })));

    const press = async (digit) => {
      if (busy || code.length >= LENGTH) return;
      code += digit;
      drawDots();
      if (code.length < LENGTH) return;
      busy = true;
      const result = await onCode(code);
      if (result === true) {
        finish(true);
        return;
      }
      screen.classList.add('shake');
      status.textContent = result;
      setTimeout(() => { screen.classList.remove('shake'); code = ''; drawDots(); busy = false; }, 400);
    };
    const backspace = () => { if (!busy) { code = code.slice(0, -1); drawDots(); } };
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') backspace();
      else if (e.key === 'Escape' && cancel) finish(false);
    };
    const finish = (ok) => {
      document.removeEventListener('keydown', onKey);
      screen.remove();
      resolve(ok);
    };

    const key = (label, onClick, cls = 'key') => h('button', { type: 'button', class: cls, onclick: onClick, 'aria-label': label === '⌫' ? 'Delete' : label }, label);
    const screen = h('div', { class: 'lock-screen', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'lock-inner' },
        h('h2', { class: 'lock-title' }, title),
        status,
        dots,
        h('div', { class: 'keypad' },
          ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => key(n, () => press(n))),
          cancel ? key('Cancel', () => finish(false), 'key key-text') : h('span'),
          key('0', () => press('0')),
          key('⌫', backspace, 'key key-text')),
        extra && extra(finish)));
    drawDots();
    document.getElementById('overlays').append(screen);
    document.addEventListener('keydown', onKey);
  });
}

/** Ask for the passcode before showing anything. Resolves once it's right. */
export async function unlock(ctx) {
  await keypad({
    title: 'Enter your passcode',
    onCode: async (code) => (await codeMatches(ctx.state, code)) || 'That\'s not right. Try again.',
    extra: (finish) => h('button', {
      type: 'button',
      class: 'link-btn lock-forgot',
      onclick: async () => {
        const { value } = await ask({
          title: 'Forgot your passcode?',
          message: 'The passcode can\'t be looked up. The only way back in is to erase everything on this phone, then load your backup file (More → Import backup).',
          buttons: [{ label: 'Keep trying', value: false, kind: 'primary' }, { label: 'Erase and start over', value: true, kind: 'danger' }],
        });
        if (!value) return;
        const { value: sure } = await ask({
          title: 'Erase everything?',
          message: 'All entries on this phone will be deleted. This can\'t be undone.',
          buttons: [{ label: 'Cancel', value: false, kind: 'primary' }, { label: 'Erase everything', value: true, kind: 'danger' }],
        });
        if (!sure) return;
        ctx.update(() => newState());
        finish(true);
      },
    }, 'Forgot passcode?'),
  });
}

/** Turn the lock on (or change the passcode). */
export async function setUpLock(ctx) {
  let first = null;
  const chosen = await keypad({
    title: 'Choose a passcode',
    sub: 'Pick 4 numbers you\'ll remember.',
    cancel: true,
    onCode: async (code) => { first = code; return true; },
  });
  if (!chosen) return;
  let matched = false;
  const confirmed = await keypad({
    title: 'Type it again',
    sub: 'Just to be sure.',
    cancel: true,
    onCode: async (code) => {
      matched = code === first;
      return true;
    },
  });
  if (!confirmed) return;
  if (!matched) {
    await ask({ title: 'Those didn\'t match', message: 'Nothing was changed. Please try again.' });
    return;
  }
  const salt = randomSalt();
  const hash = await fingerprint(first, salt);
  ctx.update((s) => setSetting(s, 'lock', { salt, hash }));
  ctx.toast('Passcode lock is on');
}

/** Check the current passcode first. Resolves true if it was typed correctly. */
export function checkPasscode(ctx, title) {
  return keypad({
    title,
    cancel: true,
    onCode: async (code) => (await codeMatches(ctx.state, code)) || 'That\'s not right. Try again.',
  });
}

export async function turnOffLock(ctx) {
  if (!(await checkPasscode(ctx, 'Enter your passcode to turn the lock off'))) return;
  ctx.update((s) => setSetting(s, 'lock', null));
  ctx.toast('Passcode lock is off');
}

export async function changeLock(ctx) {
  if (!(await checkPasscode(ctx, 'Enter your current passcode'))) return;
  await setUpLock(ctx);
}
