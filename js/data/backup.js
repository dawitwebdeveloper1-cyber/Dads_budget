// Backups: everything in one small file he can save to Files, iCloud Drive or
// email, and load back on a new phone.

import { loadState } from './model.js';
import { dayNumber } from '../maths/dates.js';

export const BACKUP_APP = 'dads-budget';
export const BACKUP_EVERY_DAYS = 7;

export function backupFileName(todayISO) {
  return `budget-backup-${todayISO}.json`;
}

export function makeBackup(state, todayISO) {
  return JSON.stringify({ app: BACKUP_APP, kind: 'backup', exportedAt: todayISO, data: state }, null, 1);
}

/** Read a backup file. Throws a plain-words reason if it isn't a good backup. */
export function readBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch {
    throw new Error('This file isn\'t a Budget backup.');
  }
  if (!parsed || parsed.app !== BACKUP_APP || parsed.kind !== 'backup') throw new Error('This file isn\'t a Budget backup.');
  const state = loadState(parsed.data);
  return { state, exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null };
}

/** Time for the weekly "Time to back up your data" note? */
export function backupDue(state, todayISO) {
  if (!state.entries.length) return false;
  const today = dayNumber(todayISO);
  const last = state.settings?.lastBackup;
  if (last) return today - dayNumber(last) >= BACKUP_EVERY_DAYS;
  const firstAdded = state.entries.reduce((min, e) => (e.createdAt && e.createdAt < min ? e.createdAt : min), todayISO);
  return today - dayNumber(firstAdded) >= BACKUP_EVERY_DAYS;
}
