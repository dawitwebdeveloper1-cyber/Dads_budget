// Starts the app: loads the saved data, draws the current screen and the
// bottom tab bar, and redraws whenever something changes.

import { TABS } from './tabs.js';
import * as store from './data/store.js';
import { h, icon, toast, ask } from './ui/dom.js';
import { openEntryForm } from './ui/entry-form.js';
import { lockEnabled, unlock, LOCK_AFTER_MS } from './ui/lock.js';
import { todayISO } from './maths/dates.js';

const ui = {
  tab: TABS[0].id,
  stacks: Object.fromEntries(TABS.map((t) => [t.id, []])), // screens opened inside each tab
  scroll: {},
};

const ctx = {
  get state() { return store.getState(); },
  get today() { return todayISO(); },
  prefs: { period: 'month', filter: 'all' },
  update: store.update,
  /**
   * Make a change and offer "Undo" for a few seconds. Undo puts everything
   * back exactly as it was, as long as nothing else has changed since.
   */
  change(fn, message) {
    const before = store.getState();
    const after = store.update(fn);
    if (after === before) return;
    toast(message, {
      label: 'Undo',
      onClick: () => {
        if (store.getState() !== after) { toast('Can\'t undo that now'); return; }
        store.update(() => before);
        toast('Undone');
      },
    });
  },
  toast,
  render: () => render(false),
  push(view) {
    rememberScroll();
    ui.stacks[ui.tab].push(view);
    render(true);
  },
  back() {
    ui.stacks[ui.tab].pop();
    render(false, true);
  },
  openForm: (options) => openEntryForm(ctx, options),
};

const screenEl = () => document.getElementById('screen');
const scrollKey = () => `${ui.tab}:${ui.stacks[ui.tab].length}`;
function rememberScroll() { ui.scroll[scrollKey()] = window.scrollY; }

function header() {
  const stack = ui.stacks[ui.tab];
  if (!stack.length) return null;
  const view = stack[stack.length - 1];
  return h('div', { class: 'topbar' },
    h('button', { type: 'button', class: 'back-btn', onclick: () => ctx.back() }, icon('back'), 'Back'),
    h('h1', { class: 'topbar-title' }, view.title));
}

function tabBar() {
  return h('nav', { class: 'tabbar', 'aria-label': 'Sections' },
    TABS.map((t) => h('button', {
      type: 'button',
      class: t.id === ui.tab ? 'tab on' : 'tab',
      'aria-current': t.id === ui.tab ? 'page' : null,
      onclick: () => {
        rememberScroll();
        if (ui.tab === t.id) ui.stacks[t.id] = []; // tapping the current tab goes back to its start
        ui.tab = t.id;
        render(false, true);
      },
    }, icon(t.icon), h('span', {}, t.label))));
}

function render(toTop = false, restore = false) {
  const keep = window.scrollY;
  const stack = ui.stacks[ui.tab];
  const tab = TABS.find((t) => t.id === ui.tab);
  const view = stack.length ? stack[stack.length - 1] : tab;
  let content;
  try {
    content = view.render(ctx);
  } catch (err) {
    console.error(err);
    content = h('div', { class: 'screen' }, h('div', { class: 'warning' }, 'Sorry, this screen had a problem. Your data is safe. Please go back and try again.'));
  }
  screenEl().replaceChildren(header() ?? '', content);
  document.getElementById('tabs').replaceChildren(tabBar());
  document.title = stack.length ? `${view.title} · Budget` : 'Budget';
  let y = keep;
  if (toTop) y = 0;
  else if (restore) y = ui.scroll[scrollKey()] ?? 0;
  window.scrollTo(0, y);
}

// ---- passcode lock: asked on opening, and again after a minute away.
let hiddenAt = null;
let locking = false;

async function lockNow() {
  if (locking || !lockEnabled(store.getState())) return;
  locking = true;
  document.body.classList.add('locked');
  await unlock(ctx);
  document.body.classList.remove('locked');
  locking = false;
  render();
}

function onVisibility() {
  if (document.hidden) {
    hiddenAt = Date.now();
    // Hide the numbers from the app switcher picture while away.
    if (lockEnabled(store.getState())) document.body.classList.add('privacy');
    return;
  }
  document.body.classList.remove('privacy');
  if (hiddenAt !== null && Date.now() - hiddenAt >= LOCK_AFTER_MS) lockNow();
  hiddenAt = null;
  render(); // the date may have changed
}

async function start() {
  const { loadProblem } = store.init();
  store.subscribe(() => render());
  document.getElementById('fab').addEventListener('click', () => ctx.openForm());
  render();
  await lockNow();
  if (loadProblem) {
    await ask({
      title: 'Your saved data couldn\'t be opened',
      message: `A copy has been kept aside, and the app has started fresh. (${loadProblem})`,
    });
  }
  document.addEventListener('visibilitychange', onVisibility);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Offline mode not available', err));
  }
}

start();
