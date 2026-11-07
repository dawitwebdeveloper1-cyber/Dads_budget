// The "Export backup" and "Import backup" buttons.

import { ask } from './dom.js';
import { saveFile, pickTextFile } from './files.js';
import { makeBackup, readBackup, backupFileName } from '../data/backup.js';
import { setSetting } from '../data/model.js';
import { dateLabel, plural } from './format.js';

export async function backUpNow(ctx) {
  const today = ctx.today;
  const result = await saveFile(backupFileName(today), makeBackup(ctx.state, today), 'application/json');
  if (result === 'cancelled') return;
  ctx.update((s) => setSetting(s, 'lastBackup', today));
  ctx.toast(result === 'shared' ? 'Backup made' : 'Backup downloaded');
}

export async function restoreBackup(ctx) {
  const picked = await pickTextFile();
  if (!picked) return;
  if (picked.error) {
    await ask({ title: 'Can\'t use this file', message: picked.error });
    return;
  }
  let backup;
  try {
    backup = readBackup(picked.text);
  } catch (err) {
    await ask({ title: 'Can\'t use this file', message: `${err.message} Nothing on this phone was changed.` });
    return;
  }
  const n = backup.state.entries.length;
  const from = backup.exportedAt ? ` from ${dateLabel(backup.exportedAt)}` : '';
  const { value } = await ask({
    title: 'Replace everything?',
    message: `This replaces everything on this phone with the backup${from} (${plural(n, 'entry', 'entries')}).`,
    buttons: [
      { label: 'Replace with backup', value: true, kind: 'danger' },
      { label: 'Cancel', value: false },
    ],
  });
  if (!value) return;
  ctx.change(() => backup.state, 'Backup loaded');
}
