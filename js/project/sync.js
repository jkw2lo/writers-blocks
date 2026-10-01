import * as S from '../lib/storage.js';
import { h, toast } from '../core/dom.js';
import { state } from '../core/state.js';
import { changed, loadProject, save, saveAs, saveTimer } from './files.js';
import { app } from '../ui/shell.js';
import { renderStatus } from '../ui/topbar.js';

// ---- changes made elsewhere ------------------------------------------------------
// If the project file changes on disk while it's open here (another device syncing it,
// another tab or app), never silently overwrite it. With nothing unsaved here we just
// pick up the new version; with unsaved changes on both sides, the writer chooses.

export async function checkFileChanged() {
  if (!state.handle || state.saving || state.conflict || state.fileStamp == null) return;
  let stamp;
  try { stamp = await S.fileStamp(state.handle); } catch { return; } // moved or no permission: save() will report it
  if (stamp === state.fileStamp) return;
  if (state.dirty) return showConflict();
  try {
    const { name, text, stamp: fresh } = await S.readHandle(state.handle);
    loadProject(text, { handle: state.handle, name, stamp: fresh, keepPlace: true });
    toast(`Updated with the latest version of ${name}.`);
  } catch (e) {
    toast(`Couldn't load the updated file: ${e.message}`, { error: true });
  }
}
window.addEventListener('focus', checkFileChanged);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkFileChanged(); });

export function showConflict() {
  clearTimeout(saveTimer);
  state.conflict = true;
  renderStatus();
  if (document.querySelector('dialog.conflict')) return;
  const dlg = h('dialog', { class: 'settings conflict' });
  const done = () => { dlg.close(); dlg.remove(); };
  const act = (fn) => async () => { done(); await fn(); };
  dlg.append(
    h('div', { class: 'dlg-head' }, h('h2', null, 'This file changed somewhere else')),
    h('p', null, `${state.fileName} was saved from another device, tab or app while you had unsaved changes here. Autosave is paused so nothing gets overwritten.`),
    h('div', { class: 'conflict-choices' },
      h('button', { class: 'btn primary', onclick: act(() => saveAs()) },
        h('strong', null, 'Save mine as a copy…'), h('span', null, 'Keeps both versions. Compare them, then carry on in either.')),
      h('button', { class: 'btn', onclick: act(reloadFromDisk) },
        h('strong', null, 'Use the file’s version'), h('span', null, 'Loads what’s on disk and drops your unsaved changes here.')),
      h('button', { class: 'btn danger-ghost', onclick: act(() => save({ force: true })) },
        h('strong', null, 'Keep mine and overwrite'), h('span', null, 'Replaces the file with this version. The other changes are lost.'))),
  );
  dlg.addEventListener('cancel', (e) => e.preventDefault()); // Esc would leave autosave paused with no explanation
  document.body.append(dlg);
  dlg.showModal();
}

export async function reloadFromDisk() {
  try {
    const { name, text, stamp } = await S.readHandle(state.handle);
    loadProject(text, { handle: state.handle, name, stamp, keepPlace: true });
    toast(`Loaded the version of ${name} on disk.`);
  } catch (e) {
    toast(`Couldn't load the file: ${e.message}`, { error: true });
    showConflict();
  }
}
