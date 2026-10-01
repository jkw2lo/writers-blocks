import { openHelp } from '../lib/help.js';
import * as M from '../lib/model.js';
import * as S from '../lib/storage.js';
import { h, icon, toast } from '../core/dom.js';
import { P, state } from '../core/state.js';
import { sessionStats, showSessionSummary, startSession } from './progress.js';
import { showConflict } from './sync.js';
import { backupBeforeSave } from './backups.js';
import { maybeTour } from '../ui/help-tour.js';
import { render } from '../ui/shell.js';
import { paintDrawer } from '../ui/tools.js';
import { renderStatus } from '../ui/topbar.js';
import { field } from '../views/write.js';

// ---- saving ----------------------------------------------------------------------

export let saveTimer;
export function changed() {
  state.dirty = true;
  P().updatedAt = new Date().toISOString();
  renderStatus();
  if (state.handle) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1200);
  }
}

export const serialize = () => JSON.stringify(P(), null, 2);

export async function save({ force = false } = {}) {
  if (!state.handle) return saveAs();
  clearTimeout(saveTimer);
  if (state.conflict && !force) return;
  state.saving = true;
  renderStatus();
  try {
    if (!force && state.fileStamp != null && (await S.fileStamp(state.handle)) !== state.fileStamp) {
      state.saving = false;
      return showConflict();
    }
    await backupBeforeSave(); // first save of a new day: copy the file as it was, then write
    state.fileStamp = await S.writeHandle(state.handle, serialize());
    S.shelve(state.handle, shelfMeta());
    state.dirty = false;
    state.saveError = null;
    state.conflict = false;
  } catch (e) {
    state.saveError = e.message;
    toast(`Couldn't save: ${e.message}`, { error: true });
  }
  state.saving = false;
  renderStatus();
}

export async function saveAs() {
  const name = S.projectFileName(P().nodes.root.title);
  if (!S.canAutosave) {
    S.download(name, serialize());
    state.dirty = false;
    state.fileName = name;
    renderStatus();
    toast('Downloaded. Open this file next time to keep working.');
    return;
  }
  try {
    const handle = await S.pickSaveHandle(name);
    state.handle = handle;
    state.fileName = handle.name;
    state.fileStamp = null; // a file we just chose (and may be replacing) is ours to write
    state.conflict = false;
    await save();
    await S.shelve(handle, shelfMeta(), { opened: true });
    toast(`Saving to ${handle.name}. Changes now save automatically.${S.canBackup && !state.backupDir ? ' Tip: turn on daily backups in Settings.' : ''}`);
  } catch (e) {
    if (e.name !== 'AbortError') toast(`Couldn't save: ${e.message}`, { error: true });
  }
}

export function confirmDiscard() {
  return !state.dirty || confirm('You have changes that are not saved to a file. Discard them?');
}

export function loadProject(text, { handle = null, name = null, stamp = null, keepPlace = false } = {}) {
  const p = M.validate(JSON.parse(text));
  state.project = p;
  state.handle = handle;
  state.fileName = name;
  state.fileStamp = stamp;
  state.conflict = false;
  state.saveError = null;
  state.dirty = false;
  if (!keepPlace || !p.nodes[state.selectedId]) state.selectedId = firstLeaf(p) || 'root';
  if (!keepPlace) { state.view = 'desk'; state.stage = null; }
  state.undo = [];
  state.aiResults = {};
  state.spark = null;
  if (!keepPlace) startSession();
  render();
  if (!keepPlace) maybeTour();
}

// Title + starting shape. Resolves to { title, shape }, or null if cancelled.
export function newProjectDialog() {
  return new Promise((resolve) => {
    let shape = 'blank';
    const dlg = h('dialog', { class: 'settings newproj' });
    const title = h('input', { class: 'newproj-title', value: '', placeholder: 'Untitled Book', 'aria-label': 'Title' });
    const finish = (ok) => { resolve(ok ? { title: title.value.trim() || 'Untitled Book', shape } : null); dlg.close(); };
    const preview = (def) => def.tree.map(([, name]) => name).slice(0, 4).join(' · ');
    const cards = Object.entries(M.SHAPES).map(([id, def]) => h('button', {
      class: `shape-opt ${id === shape ? 'on' : ''}`, role: 'radio', 'aria-checked': String(id === shape), type: 'button',
      onclick: (e) => {
        shape = id;
        dlg.querySelectorAll('.shape-opt').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
      },
      ondblclick: () => finish(true),
    }, h('strong', null, def.label), h('span', { class: 'shape-blurb' }, def.blurb), h('span', { class: 'shape-preview' }, preview(def))));
    dlg.append(
      h('div', { class: 'dlg-head' }, h('h2', null, 'Start a new project'), h('button', { class: 'icon-btn', onclick: () => finish(false), title: 'Close' }, icon('close'))),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'What’s it called? (You can change this any time.)'), title),
      h('div', { class: 'field-label newproj-label' }, 'Choose a starting shape'),
      h('div', { class: 'shape-grid', role: 'radiogroup' }, cards),
      h('p', { class: 'muted small' }, 'Every shape is just a scaffold: rename, move, split or delete anything. ',
        h('button', { class: 'link', type: 'button', onclick: () => openHelp({ section: 'quickstart' }) }, 'How should I start?')),
      h('div', { class: 'dlg-foot' },
        h('button', { class: 'btn ghost', onclick: () => finish(false) }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => finish(true) }, 'Create project')),
    );
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); });
    dlg.addEventListener('cancel', () => resolve(null));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(null); });
    document.body.append(dlg);
    dlg.showModal();
    title.focus();
  });
}

export function firstLeaf(p) {
  const list = M.flatten(p);
  return (list.find(({ node }) => !node.children.length) || list[0])?.node.id;
}

export async function cmdNew() {
  if (!confirmDiscard()) return;
  const choice = await newProjectDialog();
  if (!choice) return;
  state.project = M.newProject(choice.title, choice.shape);
  state.handle = null;
  state.fileName = null;
  state.fileStamp = null;
  state.conflict = false;
  state.undo = [];
  state.aiResults = {};
  state.spark = null;
  state.selectedId = 'root';
  state.view = 'desk';
  state.stage = null;
  state.dirty = true;
  startSession();
  render();
  if (S.canAutosave) await saveAs();
  maybeTour();
}

export async function cmdOpen() {
  if (!confirmDiscard()) return;
  try {
    const { handle, name, text, stamp } = await S.pickOpen();
    loadProject(text, { handle, name, stamp });
    if (handle) await S.shelve(handle, shelfMeta(), { opened: true });
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message, { error: true });
  }
}

export async function cmdReopen(entry) {
  try {
    const { name, text, stamp } = await S.readHandle(entry.handle);
    loadProject(text, { handle: entry.handle, name, stamp });
    await S.shelve(entry.handle, shelfMeta(), { opened: true });
  } catch (e) {
    if (e.name === 'NotFoundError') {
      // moved, renamed or deleted: it can't come back from here, so take it off the shelf
      await S.unshelve(entry.id);
      toast(`Couldn't find ${entry.name}. It may have been moved or renamed, so it’s off the shelf. Use Open to find it.`, { error: true });
      refreshShelf();
    } else {
      toast(`Couldn't reopen ${entry.name}: ${e.message}`, { error: true });
    }
  }
}

export const shelfMeta = () => ({ title: P().nodes.root.title, words: M.treeWords(P()), target: P().targetWords || 0 });
export const refreshShelf = () => S.shelf().then((list) => { state.shelf = list; if (!state.project) render(); });

export async function cmdSample() {
  if (!confirmDiscard()) return;
  const res = await fetch('examples/sample.wblocks.json');
  loadProject(await res.text());
  state.dirty = true;
  renderStatus();
}

export function cmdExport(kind) {
  const base = S.slug(P().nodes.root.title);
  if (kind === 'json') S.download(`${base}-copy-${new Date().toISOString().slice(0, 10)}.wblocks.json`, serialize());
}

export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

export function closeProject() {
  if (!confirmDiscard()) return;
  const st = sessionStats();
  const hadSession = st && (st.touched.length || st.done.length || st.net > 0);
  if (hadSession) showSessionSummary({ closing: true });
  state.project = null;
  state.session = null;
  state.dirty = false;
  state.drawer = null;
  render();
  paintDrawer();
  refreshShelf();
}
