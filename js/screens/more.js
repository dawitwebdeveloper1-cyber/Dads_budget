// More: goals, limits, export, backup, the lock, settings, categories and folders.

import { h, ask } from '../ui/dom.js';
import { row, list, section, screenTitle, bigButton, empty } from '../ui/components.js';
import { plural, howOften, dayLabel, dateLabel } from '../ui/format.js';
import { goalsView, limitsView, exportView } from './tools.js';
import { backUpNow, restoreBackup } from '../ui/backup-actions.js';
import { lockEnabled, setUpLock, turnOffLock, changeLock } from '../ui/lock.js';
import {
  addCategory, renameCategory, deleteCategory, addFolder, renameFolder, deleteFolder, countIn, setSetting,
} from '../data/model.js';
import { FREQUENCIES, activeRange, nextOccurrence } from '../maths/schedule.js';
import { dayNumber, ymd } from '../maths/dates.js';
import { OTHER_CATEGORY_ID } from '../maths/budget.js';

async function askName(title, current, placeholder, message = null) {
  const { value, text } = await ask({
    title,
    message,
    input: { value: current, placeholder },
    buttons: [{ label: 'Save', value: true, kind: 'primary' }, { label: 'Cancel', value: false }],
  });
  return value ? text : null;
}

async function tryChange(ctx, change, done) {
  try {
    ctx.change(change, done);
  } catch (err) {
    await ask({ title: 'Can\'t do that', message: err.message });
  }
}

async function manage(ctx, { kind, item }) {
  const isFolder = kind === 'folder';
  const n = countIn(ctx.state, isFolder ? { folderId: item.id } : { categoryId: item.id });
  const canDelete = isFolder || item.id !== OTHER_CATEGORY_ID;
  const { value } = await ask({
    title: item.name,
    message: n ? `${plural(n, 'entry', 'entries')} in here.` : 'Nothing in here yet.',
    buttons: [
      { label: 'Rename', value: 'rename', kind: 'primary' },
      canDelete && { label: 'Delete', value: 'delete', kind: 'danger' },
      { label: 'Cancel', value: null },
    ].filter(Boolean),
  });
  if (value === 'rename') {
    const name = await askName(`Rename ${isFolder ? 'folder' : 'category'}`, item.name, 'Name');
    if (name !== null) {
      await tryChange(ctx, (s) => (isFolder ? renameFolder(s, item.id, name) : renameCategory(s, item.id, name)), 'Renamed');
    }
  } else if (value === 'delete') {
    const { value: sure } = await ask({
      title: 'Are you sure?',
      message: n
        ? `Delete "${item.name}"? The ${plural(n, 'entry', 'entries')} in it will move to "Other", so no money goes missing.`
        : `Delete "${item.name}"?`,
      buttons: [{ label: 'Delete', value: true, kind: 'danger' }, { label: 'Cancel', value: false }],
    });
    if (sure) await tryChange(ctx, (s) => (isFolder ? deleteFolder(s, item.id) : deleteCategory(s, item.id)), 'Deleted');
  }
}

/** Every bill and paycheque that repeats, with when it's next due. */
const regularView = {
  title: 'Regular bills and pay',
  render(ctx) {
    const s = ctx.state;
    const today = dayNumber(ctx.today);
    const thisYear = ymd(today).y;
    const all = s.entries.filter((e) => FREQUENCIES[e.freq].recurring);
    const going = all.filter((e) => activeRange(e).hi >= today);
    const stopped = all.filter((e) => activeRange(e).hi < today);
    const rowFor = (e) => {
      const next = nextOccurrence(e, today);
      return row({
        title: e.name,
        sub: next !== null ? `${howOften(e)} · next ${dayLabel(next, thisYear)}` : howOften(e),
        onClick: () => ctx.openForm({ entry: e }),
      });
    };
    const ins = going.filter((e) => e.kind === 'in');
    const outs = going.filter((e) => e.kind === 'out').sort((a, b) => b.amountCents - a.amountCents);
    return h('div', { class: 'screen' },
      h('p', { class: 'muted' }, 'These are added for you every time they come around. Tap one to change or stop it.'),
      !all.length && empty('Nothing repeating yet. When you add something, pick "Every week", "Every month" and so on.'),
      ins.length > 0 && section('Money in', list(ins.map(rowFor))),
      outs.length > 0 && section('Money out', list(outs.map(rowFor))),
      stopped.length > 0 && section('Stopped', list(stopped.map((e) => row({
        title: e.name,
        sub: `${howOften(e)} · stopped after ${dateLabel(e.endDate, thisYear)}`,
        onClick: () => ctx.openForm({ entry: e }),
      })))));
  },
};

export default {
  id: 'more',
  label: 'More',
  icon: 'more',
  title: 'More',
  render(ctx) {
    const s = ctx.state;
    const notesOn = s.settings.notes !== false;
    const repeating = s.entries.filter((e) => FREQUENCIES[e.freq].recurring).length;
    return h('div', { class: 'screen' },
      screenTitle('More'),
      section(null, list([
        row({
          title: 'Regular bills and pay',
          sub: `${plural(repeating, 'item')} that repeat on their own`,
          onClick: () => ctx.push(regularView),
        }),
        row({
          title: 'Savings goals',
          sub: (s.goals ?? []).length ? plural(s.goals.length, 'goal') : 'Save up for something',
          onClick: () => ctx.push(goalsView),
        }),
        row({
          title: 'Spending limits',
          sub: Object.keys(s.limits ?? {}).length ? plural(Object.keys(s.limits).length, 'limit') : 'Set a monthly limit, like $600 for food',
          onClick: () => ctx.push(limitsView),
        }),
        row({
          title: 'Export for taxes',
          sub: 'Spreadsheet or PDF of any month or year',
          onClick: () => ctx.push(exportView),
        }),
      ])),
      section('Backup',
        h('p', { class: 'muted' }, s.settings.lastBackup
          ? `Last backup: ${dateLabel(s.settings.lastBackup)}. Save the file somewhere safe, like Files or iCloud Drive.`
          : 'No backup yet. A backup is one small file. Save it somewhere safe, like Files or iCloud Drive, so nothing is lost if you change phones.'),
        bigButton('Export backup', () => backUpNow(ctx)),
        bigButton('Import backup', () => restoreBackup(ctx), 'secondary')),
      section('Passcode lock',
        h('p', { class: 'muted' }, lockEnabled(s)
          ? 'On. The app asks for your 4-number passcode when it opens.'
          : 'Off. Turn it on so nobody else can open the app on this phone.'),
        lockEnabled(s)
          ? [bigButton('Change passcode', () => changeLock(ctx), 'secondary'), bigButton('Turn lock off', () => turnOffLock(ctx), 'plain')]
          : bigButton('Turn on passcode lock', () => setUpLock(ctx), 'secondary')),
      section('Settings',
        h('label', { class: 'switch-row' },
          h('span', { class: 'row-main' },
            h('span', { class: 'row-title' }, 'Helpful notes'),
            h('span', { class: 'row-sub' }, 'Small tips on Home, like a bill coming up or spending more than usual.')),
          h('input', {
            type: 'checkbox',
            class: 'switch',
            checked: notesOn,
            onchange: (e) => ctx.update((st) => setSetting(st, 'notes', e.target.checked)),
          }))),
      section('Categories',
        list(s.categories.map((c) => row({
          title: c.name,
          sub: plural(countIn(s, { categoryId: c.id }), 'entry', 'entries'),
          onClick: () => manage(ctx, { kind: 'category', item: c }),
        }))),
        bigButton('+ Add a category', async () => {
          const name = await askName('New category', '', 'Category name');
          if (name !== null) await tryChange(ctx, (st) => addCategory(st, name), 'Category added');
        }, 'secondary')),
      section('Folders',
        h('p', { class: 'muted' }, 'A folder keeps related costs together, for example one folder for each child. It shows as one total, and you can tap it to see what\'s inside.'),
        s.folders.length > 0 && list(s.folders.map((f) => row({
          title: `📁 ${f.name}`,
          sub: plural(countIn(s, { folderId: f.id }), 'entry', 'entries'),
          onClick: () => manage(ctx, { kind: 'folder', item: f }),
        }))),
        bigButton('+ Add a folder', async () => {
          const name = await askName('New folder', '', 'Folder name', 'For example, your child\'s name.');
          if (name !== null) await tryChange(ctx, (st) => addFolder(st, name), 'Folder added');
        }, 'secondary')),
      section('Your data',
        h('p', { class: 'muted' }, 'Everything is saved on this phone only. Nothing is sent anywhere. Deleting the app from your home screen deletes its data, so keep a backup.')));
  },
};
