// Daily backups. Before the first save on a new day, the project file as it stood at the
// end of the last writing day is copied into the backups folder, and only the newest
// KEEP copies per project are kept. Days without edits make no copy (nothing is saved).
//
// The folder needs the browser's permission. We never pop a permission prompt in the
// middle of typing: if access has lapsed (a new browser session), the copy is held in
// memory and the top bar offers "Allow backup", one click to finish it.

import * as S from '../lib/storage.js';
import { P, state } from '../core/state.js';
import { toast } from '../core/dom.js';
import { renderStatus } from '../ui/topbar.js';

export const KEEP = 5;

// Today as YYYY-MM-DD, in local time.
export function dayKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function loadBackupDir() {
  state.backupDir = await S.backupDir();
}

// Called by save() just before it writes. Copies the file on disk (the end of the last
// writing day) if this is the first save of a new day, then stamps today's date.
export async function backupBeforeSave() {
  const p = P();
  const today = dayKey();
  const last = p.lastSavedDay;
  p.lastSavedDay = today;
  if (!last || last === today || !state.backupDir || !state.handle) return;
  try {
    const text = await (await state.handle.getFile()).text();
    await writeOrHold({ name: S.backupName(p.nodes.root.title, last), text, title: p.nodes.root.title });
  } catch (e) {
    console.warn('Backup skipped:', e);
  }
}

async function writeOrHold(copy) {
  if (await S.dirPermission(state.backupDir)) {
    await S.writeBackup(state.backupDir, copy.name, copy.text);
    await S.pruneBackups(state.backupDir, copy.title, KEEP);
    state.backupPending = null;
    state.lastBackup = copy.name;
  } else {
    state.backupPending = copy;
  }
  renderStatus();
}

// From a click: ask for the folder again and finish a held copy.
export async function allowBackup() {
  const copy = state.backupPending;
  if (!state.backupDir) return;
  if (!(await S.dirPermission(state.backupDir, true))) return toast('Backups need access to the backups folder.', { error: true });
  if (copy) await writeOrHold(copy);
  toast(copy ? `Backed up: ${copy.name}` : 'Backups are on.');
}

// Settings → Back up now: today's state, as it is right now.
export async function backupNow(text) {
  const p = P();
  if (!state.backupDir) return;
  if (!(await S.dirPermission(state.backupDir, true))) return toast('Backups need access to the backups folder.', { error: true });
  const copy = { name: S.backupName(p.nodes.root.title, dayKey()), text, title: p.nodes.root.title };
  await writeOrHold(copy);
  toast(`Backed up: ${copy.name}`);
}

export async function chooseBackupDir() {
  try {
    state.backupDir = await S.pickBackupDir(state.handle || undefined);
    if (state.backupPending) await writeOrHold(state.backupPending);
    toast(`Daily backups go to “${state.backupDir.name}”. The ${KEEP} most recent days are kept for each project.`);
    return true;
  } catch (e) {
    if (e.name !== 'AbortError') toast(`Couldn't use that folder: ${e.message}`, { error: true });
    return false;
  }
}

export async function turnOffBackups() {
  await S.forgetBackupDir();
  state.backupDir = null;
  state.backupPending = null;
  renderStatus();
}

// For Settings: this project's copies, newest first (empty if we can't look without asking).
export async function currentBackups() {
  if (!state.backupDir || !P() || !(await S.dirPermission(state.backupDir))) return null;
  return S.listBackups(state.backupDir, P().nodes.root.title);
}
