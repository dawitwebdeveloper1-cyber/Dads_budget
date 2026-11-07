// More: categories and folders (settings, backup and the lock come in later stages).

import { h, ask } from '../ui/dom.js';
import { row, list, section, screenTitle, bigButton } from '../ui/components.js';
import { plural } from '../ui/format.js';
import {
  addCategory, renameCategory, deleteCategory, addFolder, renameFolder, deleteFolder, countIn,
} from '../data/model.js';
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
    ctx.update(change);
    if (done) ctx.toast(done);
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

export default {
  id: 'more',
  label: 'More',
  icon: 'more',
  title: 'More',
  render(ctx) {
    const s = ctx.state;
    return h('div', { class: 'screen' },
      screenTitle('More'),
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
        h('p', { class: 'muted' }, 'Everything is saved on this phone only. Nothing is sent anywhere. Backup buttons are coming in a later update.')));
  },
};
