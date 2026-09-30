import * as M from './model.js';
import * as S from './storage.js';
import * as AI from './ai.js';
import { dealPrompt } from './prompts.js';
import * as Sound from './sound.js';
import { confetti } from './celebrate.js';
import { openHelp, startTour } from './help.js';

// ---- state -------------------------------------------------------------------

const state = {
  project: null,
  handle: null, // FileSystemFileHandle when autosaving
  fileName: null,
  fileStamp: null, // file's lastModified as of our last read/write, to spot changes made elsewhere
  conflict: false, // the file changed elsewhere; autosave is paused until the writer decides
  dirty: false,
  saving: false,
  saveError: null,
  selectedId: 'root',
  view: 'write', // write | board | outline | notebook
  focus: false,
  filter: '',
  outlineLevel: 'all',
  undo: [],
  drag: null, // { kind: 'node' | 'note', id }
  aiResults: {}, // nodeId -> { action, loading, error, html, data }
  spark: null, // current brainstorm result { scopeId, kind, ... }
  riffing: null,
  noteFilter: '',
  noteScope: 'all',
  canvasScroll: null,
  shelf: [], // recent projects, for the welcome screen (Chromium only)
  session: null, // this sitting's progress: see startSession()
};

// Per-device preferences only (never manuscript data).
const prefs = loadPrefs();
function loadPrefs() {
  const d = { skin: 'studio', type: {}, typeCss: null, theme: 'auto', aiEnabled: false, model: AI.MODELS[0].id, rememberKey: false, apiKey: '', directionOpen: true, fontSize: 19, notebookLayout: 'grid', zoom: 1, sprintMinutes: 10,
    toured: false, sounds: false, soundVolume: 0.5, typewriterScroll: false, fadeRest: false, celebrate: true };
  try { return { ...d, ...JSON.parse(localStorage.getItem('wb-prefs') || '{}') }; } catch { return d; }
}
function savePrefs() {
  try {
    const out = { ...prefs };
    if (!out.rememberKey) out.apiKey = '';
    localStorage.setItem('wb-prefs', JSON.stringify(out));
  } catch { /* storage may be unavailable; prefs just won't persist */ }
}
let sessionKey = prefs.apiKey || '';
const aiSettings = () => ({ apiKey: sessionKey, model: prefs.model });

const P = () => state.project;
const sel = () => P().nodes[state.selectedId] || P().nodes.root;

// ---- tiny DOM helpers -----------------------------------------------------------

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('data-') || k.startsWith('aria-') || !(k in el)) el.setAttribute(k, v === true ? '' : v);
    else el[k] = v;
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  chev: 'M9 6l6 6-6 6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  split: 'M4 12h16M12 4v4M12 16v4',
  merge: 'M6 4v5a3 3 0 003 3h6a3 3 0 013 3v5M6 20v-5',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  focus: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  check: 'M5 12l5 5L20 7',
  dot: 'M12 12h.01',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5',
  note: 'M5 4h14v12l-4 4H5zM15 20v-4h4',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  arrowL: 'M15 6l-6 6 6 6',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0012 3z',
  close: 'M6 6l12 12M18 6L6 18',
  palette: 'M12 3a9 9 0 000 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7H16a5 5 0 005-5c0-4-4-7.4-9-7.4zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01M17 11.5h.01',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  sound: 'M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13',
  center: 'M4 12h16M8 6h8M8 18h8M2 9v6M22 9v6',
  fade: 'M4 6h10M4 12h16M4 18h8',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.2a2.6 2.6 0 015 .6c0 1.7-2.5 2.1-2.5 3.7M12 17h.01',
};
function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', `icon ${cls}`);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<path d="${ICONS[name]}"/>`;
  return s;
}

function autoGrow(el) {
  const fit = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; };
  el.addEventListener('input', fit);
  el.dataset.autogrow = '';
  el.fit = fit;
  requestAnimationFrame(fit);
  return el;
}

const fmt = (n) => n.toLocaleString();
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textToHtml = (t) =>
  t.split(/\n\s*\n|\r\n\s*\r\n/).map((para) => para.trim()).filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`).join('');

let toastTimer;
function toast(msg, { undo = false, error = false, cheer = false } = {}) {
  const t = document.getElementById('toast');
  t.replaceChildren(cheer ? h('span', { class: 'cheer-icon' }, icon('spark')) : '', h('span', null, msg));
  t.className = `show ${error ? 'error' : ''} ${cheer ? 'cheer' : ''}`;
  if (undo) t.append(h('button', { class: 'link', onclick: () => { restoreUndo(); t.className = ''; } }, 'Undo'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), undo || cheer ? 6000 : 3500);
}

// ---- undo for structural changes ---------------------------------------------

function snapshot() {
  state.undo.push({ json: JSON.stringify(P()), selectedId: state.selectedId });
  if (state.undo.length > 40) state.undo.shift();
}
function restoreUndo() {
  const s = state.undo.pop();
  if (!s) return;
  state.project = JSON.parse(s.json);
  state.selectedId = P().nodes[s.selectedId] ? s.selectedId : 'root';
  changed();
  render();
}

// ---- saving ----------------------------------------------------------------------

let saveTimer;
function changed() {
  state.dirty = true;
  P().updatedAt = new Date().toISOString();
  renderStatus();
  if (state.handle) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1200);
  }
}

const serialize = () => JSON.stringify(P(), null, 2);

async function save({ force = false } = {}) {
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

async function saveAs() {
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
    toast(`Saving to ${handle.name}. Changes now save automatically.`);
  } catch (e) {
    if (e.name !== 'AbortError') toast(`Couldn't save: ${e.message}`, { error: true });
  }
}

function confirmDiscard() {
  return !state.dirty || confirm('You have changes that are not saved to a file. Discard them?');
}

function loadProject(text, { handle = null, name = null, stamp = null, keepPlace = false } = {}) {
  const p = M.validate(JSON.parse(text));
  state.project = p;
  state.handle = handle;
  state.fileName = name;
  state.fileStamp = stamp;
  state.conflict = false;
  state.saveError = null;
  state.dirty = false;
  if (!keepPlace || !p.nodes[state.selectedId]) state.selectedId = firstLeaf(p) || 'root';
  state.undo = [];
  state.aiResults = {};
  state.spark = null;
  if (!keepPlace) startSession();
  render();
  if (!keepPlace) maybeTour();
}

// Title + starting shape. Resolves to { title, shape }, or null if cancelled.
function newProjectDialog() {
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

function firstLeaf(p) {
  const list = M.flatten(p);
  return (list.find(({ node }) => !node.children.length) || list[0])?.node.id;
}

async function cmdNew() {
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
  state.dirty = true;
  startSession();
  render();
  if (S.canAutosave) await saveAs();
  maybeTour();
}

async function cmdOpen() {
  if (!confirmDiscard()) return;
  try {
    const { handle, name, text, stamp } = await S.pickOpen();
    loadProject(text, { handle, name, stamp });
    if (handle) await S.shelve(handle, shelfMeta(), { opened: true });
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message, { error: true });
  }
}

async function cmdReopen(entry) {
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

const shelfMeta = () => ({ title: P().nodes.root.title, words: M.treeWords(P()), target: P().targetWords || 0 });
const refreshShelf = () => S.shelf().then((list) => { state.shelf = list; if (!state.project) render(); });

async function cmdSample() {
  if (!confirmDiscard()) return;
  const res = await fetch('examples/sample.wblocks.json');
  loadProject(await res.text());
  state.dirty = true;
  renderStatus();
}

function cmdExport(kind) {
  const base = S.slug(P().nodes.root.title);
  if (kind === 'md') S.download(`${base}.md`, M.exportMarkdown(P()), 'text/markdown');
  if (kind === 'md-notes') S.download(`${base}-with-notes.md`, M.exportMarkdown(P(), { includeNotes: true }), 'text/markdown');
  if (kind === 'json') S.download(`${base}-copy-${new Date().toISOString().slice(0, 10)}.wblocks.json`, serialize());
}

// ---- changes made elsewhere ------------------------------------------------------
// If the project file changes on disk while it's open here (another device syncing it,
// another tab or app), never silently overwrite it. With nothing unsaved here we just
// pick up the new version; with unsaved changes on both sides, the writer chooses.

async function checkFileChanged() {
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

function showConflict() {
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

async function reloadFromDisk() {
  try {
    const { name, text, stamp } = await S.readHandle(state.handle);
    loadProject(text, { handle: state.handle, name, stamp, keepPlace: true });
    toast(`Loaded the version of ${name} on disk.`);
  } catch (e) {
    toast(`Couldn't load the file: ${e.message}`, { error: true });
    showConflict();
  }
}

// ---- progress & celebrations ------------------------------------------------------
// Not a daily streak: just the sense of the book coming together. We keep a picture of
// this sitting (words when it started, which blocks you worked on, what you finished)
// and celebrate crossings as they happen: a block's word target, the book's target,
// word-count milestones, and blocks marked Done. Nothing here is saved to the file.

const MILESTONES = [
  [1000, '1,000 words. The first thousand are the hardest.'],
  [2500, '2,500 words. About ten pages of a paperback.'],
  [5000, '5,000 words, the length of a good short story.'],
  [10000, '10,000 words. Around 40 printed pages.'],
  [17500, '17,500 words. Novelette territory.'],
  [25000, '25,000 words. Halfway to a NaNoWriMo novel.'],
  [40000, '40,000 words. That’s officially novel length.'],
  [50000, '50,000 words. The Great Gatsby is about 47,000.'],
  [75000, '75,000 words. Right around a typical debut novel.'],
  [100000, '100,000 words. Six figures.'],
];
const milestoneText = (m) => MILESTONES.find(([n]) => n === m)?.[1] || `${fmt(m)} words. Still going.`;
function milestonesBetween(a, b) {
  const all = [...MILESTONES.map(([n]) => n)];
  for (let m = 125000; m <= b; m += 25000) all.push(m);
  return all.filter((m) => a < m && m <= b);
}

function startSession() {
  const p = P();
  const nodeWords = {};
  for (const { node } of M.flatten(p)) nodeWords[node.id] = M.treeWords(p, node.id);
  const total = M.treeWords(p);
  state.session = { start: Date.now(), baseWords: total, lastTotal: total, nodeWords, touched: new Set(), hit: new Set(), milestones: [], done: [] };
}

function trackProgress() {
  const s = state.session;
  if (!s || !P()) return;
  const p = P();
  const total = M.treeWords(p);
  for (const m of milestonesBetween(s.lastTotal, total)) {
    if (s.hit.has(`m${m}`)) continue;
    s.hit.add(`m${m}`);
    s.milestones.push(m);
    cheer(milestoneText(m), { big: m >= 10000 });
  }
  if (p.targetWords && s.lastTotal < p.targetWords && total >= p.targetWords && !s.hit.has('book')) {
    s.hit.add('book');
    cheer(`You reached your ${fmt(p.targetWords)}-word target for the whole book!`, { big: true });
  }
  const n = sel();
  if (n.id !== 'root') {
    for (const node of [...M.ancestors(p, n.id).filter((a) => a.id !== 'root'), n]) {
      const w = M.treeWords(p, node.id);
      const prev = s.nodeWords[node.id] ?? w;
      s.nodeWords[node.id] = w;
      if (node.targetWords && prev < node.targetWords && w >= node.targetWords && !s.hit.has(node.id)) {
        s.hit.add(node.id);
        cheer(`“${node.title}” reached its ${fmt(node.targetWords)}-word target.`);
      }
    }
  }
  s.lastTotal = total;
}

function cheer(msg, { big = false, from = null } = {}) {
  if (!prefs.celebrate) return;
  toast(msg, { cheer: true });
  const r = from?.getBoundingClientRect();
  confetti(r ? { x: r.left + r.width / 2, y: r.top, count: big ? 160 : 70 } : { count: big ? 170 : 80 });
  if (prefs.sounds) Sound.play('bell', prefs.soundVolume);
}

function blockDone(n, from) {
  state.session?.done.push(n.id);
  const leaves = M.flatten(P()).map((x) => x.node).filter((x) => !x.children.length && x.id !== 'root');
  const done = leaves.filter((x) => x.status === 'done').length;
  if (leaves.length > 1 && done === leaves.length) cheer('Every block is done. That’s a whole draft!', { big: true, from });
  else cheer(`“${n.title}” is done. ${done} of ${leaves.length} blocks finished.`, { from });
}

function progressRing(words) {
  const target = P().targetWords;
  if (!target) return null;
  const pct = Math.min(1, words / target);
  const c = 2 * Math.PI * 8;
  const ring = h('button', {
    class: `progress-ring ${pct >= 1 ? 'full' : ''}`, 'aria-label': `Book progress: ${Math.round(pct * 100)}%`,
    title: `${fmt(words)} of ${fmt(target)} words (${Math.round(pct * 100)}%)`,
    onclick: () => select('root', 'write'),
  });
  ring.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" class="track"/><circle cx="10" cy="10" r="8" class="fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>`;
  return ring;
}

function sessionStats() {
  const s = state.session;
  if (!s || !P()) return null;
  const words = M.treeWords(P());
  const titles = (ids) => ids.map((id) => P().nodes[id]?.title).filter(Boolean);
  return {
    net: words - s.baseWords,
    minutes: Math.max(1, Math.round((Date.now() - s.start) / 60000)),
    touched: titles([...s.touched]),
    done: titles([...new Set(s.done)]),
    milestones: s.milestones,
    words,
  };
}

function showSessionSummary({ closing = false } = {}) {
  const st = sessionStats();
  if (!st) return;
  const dlg = h('dialog', { class: 'settings session' });
  const done = () => { dlg.close(); dlg.remove(); };
  const list = (label, items) => items.length > 0 && h('div', { class: 'session-list' },
    h('span', { class: 'eyebrow' }, label),
    h('p', null, items.slice(0, 6).join(', ') + (items.length > 6 ? ` and ${items.length - 6} more` : '')));
  const time = st.minutes < 60 ? `${st.minutes} min` : `${Math.floor(st.minutes / 60)} h ${st.minutes % 60} min`;
  dlg.append(
    h('div', { class: 'dlg-head' },
      h('h2', null, closing ? 'Nice work today' : 'This session'),
      h('button', { class: 'icon-btn', onclick: done, title: 'Close' }, icon('close'))),
    h('div', { class: 'session-stats' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, `${st.net >= 0 ? '+' : '−'}${fmt(Math.abs(st.net))}`), h('div', { class: 'stat-label' }, 'words')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, time), h('div', { class: 'stat-label' }, 'with the book open')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, fmt(st.words)), h('div', { class: 'stat-label' }, 'words in the book'))),
    list('Worked on', st.touched),
    list('Finished', st.done),
    list('Milestones', st.milestones.map((m) => `${fmt(m)} words`)),
    !st.touched.length && !st.done.length && h('p', { class: 'muted' }, 'Nothing written yet this session. The page is waiting.'),
    h('div', { class: 'dlg-foot' }, h('button', { class: 'btn primary', onclick: done }, closing ? 'See you next time' : 'Back to writing')),
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  if (closing && st.net > 0) confetti({ count: 60 });
}

function closeProject() {
  if (!confirmDiscard()) return;
  const st = sessionStats();
  const hadSession = st && (st.touched.length || st.done.length || st.net > 0);
  if (hadSession) showSessionSummary({ closing: true });
  state.project = null;
  state.session = null;
  state.dirty = false;
  render();
  refreshShelf();
}

// ---- help & tour -----------------------------------------------------------------------

const showHelp = (section) => openHelp({ section, onTour: state.project ? runTour : null });

const TOUR = [
  { el: null, title: 'Welcome to Writers Blocks', text: 'Here’s a one-minute look around. Use the arrow keys or the buttons, and press Esc to skip. You can replay this from Help any time.' },
  { el: '.binder .tree', title: 'The outline', text: 'Your book as a tree of parts, chapters and sections. Click a block to open it, drag to rearrange, or hover and click <b>+</b> to add inside. The dot shows its status.' },
  { el: '.tabs', title: 'Four ways to look at it', text: '<b>Write</b> one block at a time. <b>Board</b> shows a chapter as index cards. <b>Outline</b> is the whole book as a table. <b>Notebook</b> holds loose ideas.' },
  { el: '.direction', title: 'Every block has a direction', text: '<b>What happens</b> and <b>Why it’s here</b> keep you pointed somewhere. Below them are the blocks just before and after, so you know what you’re writing toward.' },
  { el: '.toolbar', title: 'The writing toolbar', text: 'Formatting, and <b>Split here</b> to break a block in two. On the right are your writing aids: typing sounds, typewriter scrolling, and fade the rest.' },
  { el: '.inspector', title: 'This block, and ideas', text: 'Set a block’s status and word target, add tags and notes, and move it around. Further down, <b>Brainstorm</b> deals prompts, runs freewriting sprints, and collides ideas.' },
  { el: '#status', title: 'Progress and saving', text: 'The ring fills toward your book’s word target, and <b>+N this session</b> counts this sitting. Your file’s save status is here too.' },
  { el: '.look', title: 'Make it yours', text: 'Skins for every mood, light or dark, and your own fonts and line spacing.' },
  { el: '.help-btn', title: 'Help is always here', text: 'The quick start, a guide to every feature, and this tour. Press <b>?</b> any time you’re not typing.' },
];

function runTour() {
  if (!state.project) return;
  const before = { view: state.view, id: state.selectedId };
  state.focus = false;
  state.view = 'write';
  if (sel().children.length || sel().id === 'root') state.selectedId = firstLeaf(P()) || state.selectedId;
  render();
  requestAnimationFrame(() => startTour(TOUR, {
    onEnd: () => {
      prefs.toured = true;
      savePrefs();
      if (P()?.nodes[before.id]) { state.view = before.view; state.selectedId = before.id; render(); }
    },
  }));
}

function maybeTour() {
  if (prefs.toured || !state.project) return;
  setTimeout(() => { if (!document.querySelector('dialog[open], .tour')) runTour(); }, 400);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== '?' || e.metaKey || e.ctrlKey) return;
  const t = e.target;
  if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || document.querySelector('dialog[open], .tour')) return;
  e.preventDefault();
  showHelp();
});

// ---- writing aids: typing sounds, typewriter scrolling, fade the rest ------------------

const WRITING_TOGGLES = [
  ['sounds', 'sound', 'Typing sounds', 'Typing sounds on', 'Typing sounds off'],
  ['typewriterScroll', 'center', 'Typewriter scrolling: keep the line you’re on in the middle', 'Typewriter scrolling on', 'Typewriter scrolling off'],
  ['fadeRest', 'fade', 'Fade the rest: dim every paragraph but the one you’re writing', 'Fading the rest', 'Showing everything'],
];

function setWritingPref(key, on) {
  prefs[key] = on;
  savePrefs();
  document.querySelectorAll('.editor').forEach((ed) => ed.classList.toggle('fade-rest', prefs.fadeRest));
  document.querySelectorAll('.write').forEach((w) => w.classList.toggle('tw-scroll', prefs.typewriterScroll));
  document.querySelectorAll(`[data-toggle="${key}"]`).forEach((b) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  const ed = document.querySelector('.editor');
  if (ed) followCaret(ed);
  if (key === 'sounds' && on) Sound.play('bell', prefs.soundVolume);
}

function writingToggles() {
  return h('div', { class: 'tb-toggles' },
    WRITING_TOGGLES.map(([key, ic, title, onMsg, offMsg]) => h('button', {
      class: `tb toggle ${prefs[key] ? 'on' : ''}`, title, 'aria-pressed': String(!!prefs[key]), 'data-toggle': key,
      onmousedown: (e) => e.preventDefault(), // keep the cursor in the draft
      onclick: () => { setWritingPref(key, !prefs[key]); toast(prefs[key] ? onMsg : offMsg); },
    }, icon(ic))));
}

// The top-level paragraph the caret is in (the editor's direct child), or null.
function caretBlock(ed) {
  const sel = getSelection();
  if (!sel.rangeCount || !ed.contains(sel.anchorNode)) return null;
  let node = sel.anchorNode;
  if (node === ed) return ed.children[Math.min(sel.anchorOffset, ed.children.length - 1)] || null;
  while (node && node.parentNode !== ed) node = node.parentNode;
  return node?.nodeType === 1 ? node : null;
}

// Fade: highlight the current paragraph with a generated rule, so nothing is ever
// written into the draft's own HTML.
const fadeStyle = document.head.appendChild(document.createElement('style'));
function updateFade(ed) {
  const block = prefs.fadeRest ? caretBlock(ed) : null;
  ed.classList.toggle('fading', !!block);
  fadeStyle.textContent = block ? `.editor.fade-rest.fading > :nth-child(${[...ed.children].indexOf(block) + 1}) { opacity: 1; }` : '';
}

function caretRect(ed) {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  const rect = r.getClientRects()[0];
  if (rect && rect.height) return rect;
  return caretBlock(ed)?.getBoundingClientRect() || null; // empty line: use its paragraph
}

function scrollParent(el) {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement;
}

function followCaret(ed) {
  updateFade(ed);
  if (!prefs.typewriterScroll || document.activeElement !== ed) return;
  const rect = caretRect(ed);
  if (!rect) return;
  const sc = scrollParent(ed);
  const box = sc === document.scrollingElement ? { top: 0, height: innerHeight } : sc.getBoundingClientRect();
  const delta = rect.top + rect.height / 2 - (box.top + box.height * 0.45);
  if (Math.abs(delta) > 3) sc.scrollBy({ top: delta, behavior: Math.abs(delta) > 120 ? 'smooth' : 'auto' });
}
document.addEventListener('selectionchange', () => {
  const ed = document.activeElement;
  if (ed?.classList?.contains('editor')) updateFade(ed);
});

document.addEventListener('keydown', (e) => {
  if (!prefs.sounds || e.isComposing) return;
  const t = e.target;
  const typing = t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && ['text', 'search', 'number'].includes(t.type));
  const kind = typing && Sound.soundForKey(e);
  if (kind) Sound.play(kind, prefs.soundVolume);
}, true);

// ---- structural commands -------------------------------------------------------

function select(id, view) {
  state.selectedId = id;
  if (view) state.view = view;
  render();
}

function addChild(parentId, type) {
  snapshot();
  const n = M.addNode(P(), parentId, type);
  changed();
  select(n.id, state.view === 'notebook' ? 'write' : state.view);
  focusTitle();
}

function addAfter(id) {
  snapshot();
  const n = M.addSiblingAfter(P(), id);
  changed();
  select(n.id);
  focusTitle();
}

function focusTitle() {
  requestAnimationFrame(() => {
    const t = document.querySelector('.title-input') || document.querySelector(`.card[data-id="${state.selectedId}"] .card-title`);
    t?.focus();
    t?.select?.();
  });
}

function removeNode(id) {
  const n = P().nodes[id];
  const words = M.treeWords(P(), id);
  const kids = n.children.length;
  if ((words > 0 || kids > 0) && !confirm(`Delete “${n.title}”${kids ? ` and its ${kids} block${kids > 1 ? 's' : ''}` : ''}${words ? ` (${fmt(words)} words)` : ''}?`)) return;
  snapshot();
  const parent = M.parentOf(P(), id);
  M.deleteNode(P(), id);
  delete state.aiResults[id];
  changed();
  select(parent?.id || 'root');
  toast(`Deleted “${n.title}”.`, { undo: true });
}

function shift(id, dir) {
  const parent = M.parentOf(P(), id);
  const i = parent.children.indexOf(id);
  const j = i + dir;
  if (j < 0 || j >= parent.children.length) return;
  snapshot();
  M.moveNode(P(), id, parent.id, dir > 0 ? j + 1 : j);
  changed();
  render();
}

function mergeNext(id) {
  const parent = M.parentOf(P(), id);
  const next = P().nodes[parent.children[parent.children.indexOf(id) + 1]];
  if (!next) return toast('There is no next block at this level to merge.');
  snapshot();
  M.mergeWithNext(P(), id);
  changed();
  render();
  toast(`Merged “${next.title}” into this block.`, { undo: true });
}

function splitAtCursor() {
  const ed = document.querySelector('.editor');
  const s = getSelection();
  if (!ed || !s.rangeCount || !ed.contains(s.anchorNode)) {
    return toast('Click in the text where you want to split, then press Split.');
  }
  snapshot();
  const r = s.getRangeAt(0);
  const tail = document.createRange();
  tail.setStart(r.startContainer, r.startOffset);
  tail.setEnd(ed, ed.childNodes.length);
  const box = document.createElement('div');
  box.append(tail.extractContents());
  const clean = (html) => html.replace(/^(\s*<(p|div)>(\s|<br>)*<\/\2>)+|(<(p|div)>(\s|<br>)*<\/\5>\s*)+$/g, '');
  const next = M.splitNode(P(), state.selectedId, clean(ed.innerHTML), clean(box.innerHTML));
  changed();
  select(next.id);
  toast('Split into two blocks. Give the new one a title.', { undo: true });
  focusTitle();
}

function placeNote(noteId, parentId, index = null) {
  const note = P().notebook.find((n) => n.id === noteId);
  if (!note) return;
  snapshot();
  const parent = P().nodes[parentId];
  const firstLine = note.text.trim().split('\n')[0];
  const title = firstLine.length > 60 ? `${firstLine.slice(0, 57).trim()}…` : firstLine || 'From notebook';
  const n = M.addNode(P(), parentId, M.TYPES[parent.type].child, index, title);
  n.content = textToHtml(note.text);
  M.removeNote(P(), noteId);
  changed();
  render();
  toast(`Placed in “${parent.title}”.`, { undo: true });
}

// ---- drag & drop ------------------------------------------------------------------

function dropZone(e, el, allowInside = true, horizontal = false) {
  const r = el.getBoundingClientRect();
  const f = horizontal ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
  if (!allowInside) return f < 0.5 ? 'before' : 'after';
  return f < 0.28 ? 'before' : f > 0.72 ? 'after' : 'inside';
}

function clearDropMarks() {
  document.querySelectorAll('.drop-before,.drop-after,.drop-inside').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-inside'));
}

function performDrop(targetId, zone) {
  const d = state.drag;
  state.drag = null;
  clearDropMarks();
  if (!d) return;
  const p = P();
  let parentId, index;
  if (zone === 'inside' || targetId === 'root') {
    parentId = targetId;
    index = p.nodes[targetId].children.length;
  } else {
    const parent = M.parentOf(p, targetId);
    parentId = parent.id;
    index = parent.children.indexOf(targetId) + (zone === 'after' ? 1 : 0);
  }
  if (d.kind === 'note') return placeNote(d.id, parentId, index);
  if (d.id === targetId) return;
  snapshot();
  if (!M.moveNode(p, d.id, parentId, index)) {
    state.undo.pop();
    return toast("A block can't be moved inside itself.");
  }
  changed();
  render();
  toast(`Moved “${p.nodes[d.id].title}” into “${p.nodes[parentId].title}”.`, { undo: true });
}

function makeDraggable(el, kind, id) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    state.drag = { kind, id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => { el.classList.remove('dragging'); state.drag = null; clearDropMarks(); });
}

function makeDropTarget(el, id, { allowInside = true, horizontal = false } = {}) {
  el.addEventListener('dragover', (e) => {
    if (!state.drag) return;
    e.preventDefault();
    const zone = id === 'root' ? 'inside' : dropZone(e, el, allowInside, horizontal);
    clearDropMarks();
    el.classList.add(`drop-${zone}`);
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after', 'drop-inside'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const zone = id === 'root' ? 'inside' : dropZone(e, el, allowInside, horizontal);
    performDrop(id, zone);
  });
}

// ---- render: shell ------------------------------------------------------------------

const app = document.getElementById('app');

function render() {
  document.documentElement.style.setProperty('--editor-size', `${prefs.fontSize}px`);
  if (!state.project) return renderWelcome();
  document.body.classList.toggle('focus', state.focus);
  const scroll = document.querySelector('.main')?.scrollTop;
  const binderScroll = document.querySelector('.tree')?.scrollTop;
  app.replaceChildren(
    renderTopbar(),
    h('div', { class: 'workspace' }, renderBinder(), renderMain(), renderInspector()),
  );
  if (scroll != null && state.lastRenderKey === `${state.view}:${state.selectedId}`) document.querySelector('.main').scrollTop = scroll;
  if (binderScroll != null) document.querySelector('.tree').scrollTop = binderScroll;
  state.lastRenderKey = `${state.view}:${state.selectedId}`;
  renderStatus();
}

function renderWelcome() {
  document.body.classList.remove('focus');
  app.replaceChildren(
    h('div', { class: 'welcome' },
      h('div', { class: 'welcome-card' },
        h('div', { class: 'logo-blocks', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h('h1', null, 'Writers Blocks'),
        h('p', { class: 'lede' }, 'A place to shape a long piece of writing: map its structure, give every part a direction, and rearrange freely as the book finds its form.'),
        h('div', { class: 'welcome-actions' },
          h('button', { class: 'btn primary', onclick: cmdNew }, 'Start a new project'),
          h('button', { class: 'btn', onclick: cmdOpen }, 'Open a project file…'),
          h('button', { class: 'btn ghost', onclick: cmdSample }, 'Explore a sample'),
        ),
        bookshelf(),
        h('p', { class: 'welcome-help' }, 'New here? ',
          h('button', { class: 'link', onclick: () => openHelp({ section: 'quickstart' }) }, 'How to start a project'),
          ' · ',
          h('button', { class: 'link', onclick: () => openHelp({ section: 'basics' }) }, 'Guide to every feature')),
        h('div', { class: 'vibe' },
          h('span', { class: 'eyebrow' }, 'Pick a vibe'),
          skinPicker({ compact: true })),
        h('p', { class: 'fine' },
          S.canAutosave
            ? 'Your work is saved to a file on your computer that you choose, and it autosaves as you write. The shelf only remembers where your files are, never what’s in them.'
            : 'This browser can’t autosave to your disk, so use Save to download your project file, and Open it next time. (Chrome, Edge or Arc can autosave.) Nothing is kept in the browser.'),
      ),
    ),
  );
}

// ---- the shelf -----------------------------------------------------------------------

const COVERS = ['--t-part', '--accent', '--s-outlined', '--s-revising', '--s-done', '--s-drafting'];
const coverFor = (title) => COVERS[[...(title || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % COVERS.length];

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} minutes ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const d = Math.round(hr / 24);
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function bookshelf() {
  if (!state.shelf.length) return null;
  return h('section', { class: 'shelf', 'aria-label': 'Recent projects' },
    h('div', { class: 'shelf-head' },
      h('span', { class: 'eyebrow' }, 'Your shelf'),
      h('span', { class: 'muted small' }, 'Pick up where you left off')),
    h('div', { class: 'shelf-row' },
      state.shelf.map((e) => {
        const pct = e.target ? Math.min(100, (e.words || 0) / e.target * 100) : 0;
        return h('div', { class: 'book', style: `--cover: var(${coverFor(e.title || e.name)})` },
          h('button', {
            class: 'book-cover', onclick: () => cmdReopen(e),
            title: `Open ${e.name}${e.words != null ? ` · ${fmt(e.words)} words` : ''}`,
          },
            h('span', { class: 'book-title' }, e.title || e.name),
            e.words != null && h('span', { class: 'book-words' }, `${fmt(e.words)} words`),
            e.target > 0 && h('span', { class: 'book-progress', 'aria-hidden': 'true' }, h('i', { style: `width:${pct}%` }))),
          h('span', { class: 'book-when' }, ago(e.opened)),
          h('button', {
            class: 'book-remove', title: 'Take off the shelf (the file itself isn’t touched)', 'aria-label': `Remove ${e.title || e.name} from the shelf`,
            onclick: async () => { await S.unshelve(e.id); refreshShelf(); },
          }, icon('close')));
      })));
}

function renderTopbar() {
  const root = P().nodes.root;
  const views = [['write', 'Write'], ['board', 'Board'], ['outline', 'Outline'], ['notebook', `Notebook${P().notebook.length ? ` · ${P().notebook.length}` : ''}`]];
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand', title: 'Writers Blocks' }, h('div', { class: 'logo-blocks small', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))),
    fileMenu(),
    h('input', {
      class: 'book-title', value: root.title, 'aria-label': 'Book title',
      oninput: (e) => { root.title = e.target.value; changed(); document.querySelectorAll('[data-root-title]').forEach((x) => (x.textContent = root.title)); },
    }),
    h('nav', { class: 'tabs', role: 'tablist' },
      views.map(([id, label]) => h('button', {
        role: 'tab', class: `tab ${state.view === id ? 'active' : ''}`, 'aria-selected': String(state.view === id),
        onclick: () => { state.view = id; render(); },
      }, label))),
    h('div', { class: 'spacer' }),
    h('div', { id: 'status', class: 'status' }),
    lookMenu(),
    h('button', { class: 'icon-btn help-btn', title: 'Help & tour (?)', onclick: () => showHelp() }, icon('help')),
    h('button', { class: 'icon-btn', title: 'Focus mode (Ctrl/⌘ + .)', onclick: toggleFocus }, icon('focus')),
    h('button', { class: 'icon-btn', title: 'Settings', onclick: openSettings }, icon('gear')),
  );
}

function fileMenu() {
  const item = (label, fn, hint) => h('button', { role: 'menuitem', onclick: (e) => { e.target.closest('details').open = false; fn(); } }, h('span', null, label), hint && h('kbd', null, hint));
  return h('details', { class: 'menu' },
    h('summary', { class: 'btn small' }, 'File'),
    h('div', { class: 'menu-pop', role: 'menu' },
      item('New project…', cmdNew),
      item('Open…', cmdOpen),
      item(S.canAutosave ? 'Save to a new file…' : 'Save (download)', saveAs, S.canAutosave ? '' : '⌘S'),
      h('hr'),
      item('Export manuscript (.md)', () => cmdExport('md')),
      item('Export with synopses (.md)', () => cmdExport('md-notes')),
      item('Download a backup copy', () => cmdExport('json')),
      h('hr'),
      item('Close project', closeProject),
    ));
}

function renderStatus() {
  const el = document.getElementById('status');
  if (!el || !P()) return;
  const words = M.treeWords(P());
  const parts = [progressRing(words), h('span', { class: 'total' }, `${fmt(words)} words`)];
  const net = state.session ? words - state.session.baseWords : 0;
  if (net) parts.push(h('button', { class: 'session-chip', title: 'This session so far', onclick: () => showSessionSummary() }, `${net > 0 ? '+' : '−'}${fmt(Math.abs(net))} this session`));
  if (state.conflict) {
    parts.push(h('button', { class: 'btn small danger', onclick: showConflict }, 'File changed elsewhere'));
  } else if (state.saveError) {
    parts.push(h('button', { class: 'btn small danger', onclick: () => save() }, 'Save failed. Retry'));
  } else if (state.handle) {
    parts.push(h('span', { class: `saved ${state.dirty || state.saving ? 'pending' : ''}`, title: state.fileName },
      state.dirty || state.saving ? 'Saving…' : h('span', null, icon('check'), ` ${state.fileName}`)));
  } else if (state.dirty) {
    parts.push(h('button', { class: 'btn small primary', onclick: saveAs }, S.canAutosave ? 'Save to file…' : 'Download to save'));
  } else if (state.fileName) {
    parts.push(h('span', { class: 'saved' }, icon('check'), ` ${state.fileName}`));
  }
  el.replaceChildren(...parts);
}

function refreshCounts() {
  document.querySelectorAll('[data-wc]').forEach((el) => {
    const id = el.dataset.wc;
    if (P().nodes[id]) el.textContent = fmt(M.treeWords(P(), id));
  });
  trackProgress();
  renderStatus();
  const bar = document.querySelector('[data-progress]');
  if (bar) {
    const n = sel();
    const target = n.id === 'root' ? P().targetWords : n.targetWords;
    bar.style.width = `${Math.min(100, (M.treeWords(P(), n.id) / (target || 1)) * 100)}%`;
  }
}

// ---- render: binder (left) -------------------------------------------------------

function matches(n, q) {
  return [n.title, n.synopsis, n.purpose, n.notes, n.tags.join(' '), M.stripHtml(n.content)].join(' ').toLowerCase().includes(q);
}

function renderBinder() {
  const p = P();
  const q = state.filter.trim().toLowerCase();
  let visible = null;
  if (q) {
    visible = new Set();
    for (const { node } of M.flatten(p)) {
      if (matches(node, q)) {
        visible.add(node.id);
        M.ancestors(p, node.id).forEach((a) => visible.add(a.id));
      }
    }
  }

  const rows = [];
  const walk = (id, depth) => {
    for (const cid of p.nodes[id].children) {
      const n = p.nodes[cid];
      if (!n || (visible && !visible.has(cid))) continue;
      rows.push(binderRow(n, depth));
      if (!n.collapsed || q) walk(cid, depth + 1);
    }
  };
  walk('root', 0);

  const rootRow = h('div', {
    class: `row root ${state.selectedId === 'root' && state.view !== 'notebook' ? 'selected' : ''}`,
    onclick: () => select('root', state.view === 'notebook' ? 'write' : state.view),
  }, icon('book', 'type-icon'), h('span', { class: 'row-title', 'data-root-title': '' }, p.nodes.root.title));
  makeDropTarget(rootRow, 'root');

  return h('aside', { class: 'binder' },
    h('div', { class: 'binder-search' }, icon('search'),
      h('input', {
        type: 'search', placeholder: 'Find in book…', value: state.filter, 'aria-label': 'Find in book',
        oninput: (e) => { state.filter = e.target.value; const pos = e.target.selectionStart; render(); const i = document.querySelector('.binder-search input'); i.focus(); i.setSelectionRange(pos, pos); },
      })),
    h('div', { class: 'tree', role: 'tree' }, rootRow, rows,
      q && !rows.length && h('p', { class: 'empty small' }, 'Nothing matches.'),
      !q && h('button', { class: 'add-row', onclick: () => addChild('root', 'part') }, icon('plus'), 'Add part')),
    h('button', {
      class: `row notebook-link ${state.view === 'notebook' ? 'selected' : ''}`,
      onclick: () => { state.view = 'notebook'; render(); },
    }, icon('note', 'type-icon'), h('span', { class: 'row-title' }, 'Notebook'), h('span', { class: 'wc' }, p.notebook.length || '')),
  );
}

function binderRow(n, depth) {
  const hasKids = n.children.length > 0;
  const row = h('div', {
    class: `row type-${n.type} ${n.id === state.selectedId && state.view !== 'notebook' ? 'selected' : ''}`,
    style: `--depth:${depth}`,
    'data-id': n.id,
    role: 'treeitem',
    'aria-expanded': hasKids ? String(!n.collapsed) : null,
    title: n.synopsis || n.title,
    onclick: () => select(n.id, state.view === 'notebook' ? 'write' : state.view),
  },
  h('button', {
    class: `caret ${hasKids ? '' : 'hidden'} ${n.collapsed ? '' : 'open'}`, 'aria-label': n.collapsed ? 'Expand' : 'Collapse',
    onclick: (e) => { e.stopPropagation(); n.collapsed = !n.collapsed; changed(); render(); },
  }, icon('chev')),
  h('span', { class: `dot status-${n.status}`, title: n.status }),
  h('span', { class: 'row-title' }, n.title),
  h('span', { class: 'wc', 'data-wc': n.id }, fmt(M.treeWords(P(), n.id))),
  h('button', {
    class: 'row-add', title: `Add ${M.TYPES[M.TYPES[n.type].child].label.toLowerCase()} inside`,
    onclick: (e) => { e.stopPropagation(); addChild(n.id); },
  }, icon('plus')));
  makeDraggable(row, 'node', n.id);
  makeDropTarget(row, n.id);
  return row;
}

// ---- render: main views ------------------------------------------------------------

function renderMain() {
  const view = { write: renderWrite, board: renderBoard, outline: renderOutline, notebook: renderNotebook }[state.view];
  return h('main', { class: `main view-${state.view}` }, view());
}

function crumbs(n) {
  const path = M.ancestors(P(), n.id);
  return h('div', { class: 'crumbs' },
    path.map((a) => [h('button', { class: 'crumb', onclick: () => select(a.id) }, a.title), h('span', { class: 'sep' }, '›')]),
    h('span', { class: 'crumb current' }, n.title));
}

function field(label, hint, value, onInput, { rows = 2, cls = '' } = {}) {
  return h('label', { class: `field ${cls}` },
    h('span', { class: 'field-label' }, label),
    autoGrow(h('textarea', { rows, placeholder: hint, value, oninput: (e) => { onInput(e.target.value); changed(); } })));
}

function renderWrite() {
  const n = sel();
  if (n.id === 'root') return renderBookOverview();
  const { prev, next } = M.neighbors(P(), n.id);
  const kids = n.children.map((c) => P().nodes[c]).filter(Boolean);
  const typeLabel = M.TYPES[n.type].label.toLowerCase();

  const direction = h('details', { class: 'direction', open: prefs.directionOpen, ontoggle: (e) => { prefs.directionOpen = e.target.open; savePrefs(); } },
    h('summary', null, 'Direction',
      !prefs.directionOpen && n.synopsis && h('span', { class: 'summary-peek' }, ` · ${n.synopsis}`)),
    h('div', { class: 'direction-grid' },
      field('What happens', `In a sentence or two, what happens (or what's argued) in this ${typeLabel}?`, n.synopsis, (v) => (n.synopsis = v)),
      field('Why it’s here', `What must this ${typeLabel} do for its chapter and the book? What should the reader feel or learn?`, n.purpose, (v) => (n.purpose = v)),
    ),
    (prev || next) && h('div', { class: 'neighbors' },
      neighborCard(prev, 'Before'),
      neighborCard(next, 'After')),
  );

  const ed = h('div', {
    class: 'editor prose', contentEditable: 'true', spellcheck: true,
    'data-placeholder': kids.length ? `Optional opening text for this ${typeLabel}…` : 'Start writing…',
    'aria-label': 'Draft text',
  });
  ed.innerHTML = n.content;
  ed.classList.toggle('fade-rest', prefs.fadeRest);
  let countTimer;
  ed.addEventListener('input', () => {
    n.content = /^(\s|<br>|<p><br><\/p>|<div><br><\/div>)*$/.test(ed.innerHTML) ? '' : ed.innerHTML;
    state.session?.touched.add(n.id);
    changed();
    followCaret(ed);
    clearTimeout(countTimer);
    countTimer = setTimeout(refreshCounts, 250);
  });
  ed.addEventListener('paste', (e) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const html = /\n/.test(text) ? textToHtml(text) : escapeHtml(text);
    document.execCommand('insertHTML', false, html);
  });
  ed.addEventListener('focus', () => document.execCommand('defaultParagraphSeparator', false, 'p'));
  ed.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow') || e.key.startsWith('Page')) followCaret(ed); });
  ed.addEventListener('mouseup', () => followCaret(ed));
  ed.addEventListener('focus', () => updateFade(ed));
  ed.addEventListener('blur', () => ed.classList.remove('fading')); // show everything when you're not writing

  const tb = (label, title, fn) => h('button', { class: 'tb', title, onmousedown: (e) => { e.preventDefault(); fn(); } }, label);
  const exec = (cmd, arg) => () => { document.execCommand(cmd, false, arg); ed.dispatchEvent(new Event('input')); };

  return h('div', { class: `write ${prefs.typewriterScroll ? 'tw-scroll' : ''}` },
    crumbs(n),
    h('div', { class: 'title-row' },
      h('span', { class: `type-badge type-${n.type}` }, M.TYPES[n.type].label),
      h('input', {
        class: 'title-input', value: n.title, 'aria-label': 'Title',
        oninput: (e) => { n.title = e.target.value; changed(); document.querySelector(`.row[data-id="${n.id}"] .row-title`)?.replaceChildren(n.title); },
      })),
    direction,
    kids.length > 0 && h('div', { class: 'contains' },
      h('div', { class: 'contains-head' }, `This ${typeLabel} contains`, h('button', { class: 'link', onclick: () => { state.view = 'board'; render(); } }, 'Open as board')),
      h('ol', { class: 'contains-list' }, kids.map((k) => h('li', null,
        h('button', { class: 'contains-item', onclick: () => select(k.id) },
          h('span', { class: `dot status-${k.status}` }),
          h('strong', null, k.title),
          k.synopsis && h('span', { class: 'muted' }, ` — ${k.synopsis}`),
          h('span', { class: 'wc' }, fmt(M.treeWords(P(), k.id))))))),
    ),
    h('div', { class: 'toolbar', role: 'toolbar' },
      tb(h('b', null, 'B'), 'Bold (⌘B)', exec('bold')),
      tb(h('i', null, 'I'), 'Italic (⌘I)', exec('italic')),
      tb('H', 'Heading', exec('formatBlock', 'h2')),
      tb('¶', 'Paragraph', exec('formatBlock', 'p')),
      tb('“', 'Quote', exec('formatBlock', 'blockquote')),
      tb('•', 'List', exec('insertUnorderedList')),
      tb('✱', 'Scene break', exec('insertHorizontalRule')),
      h('span', { class: 'tb-sep' }),
      h('button', { class: 'tb wide', title: 'Split this block into two at the cursor', onmousedown: (e) => { e.preventDefault(); splitAtCursor(); } }, icon('split'), 'Split here'),
      h('div', { class: 'spacer' }),
      writingToggles(ed),
      h('span', { class: 'tb-sep' }),
      h('span', { class: 'tb-count' }, h('span', { 'data-wc': n.id }, fmt(M.treeWords(P(), n.id))), n.targetWords ? ` / ${fmt(n.targetWords)}` : '', ' words'),
    ),
    ed,
    h('div', { class: 'write-foot' },
      h('button', { class: 'btn small', onclick: () => addAfter(n.id) }, icon('plus'), `New ${typeLabel} after this`),
      next && h('button', { class: 'btn small ghost', onclick: () => select(next.id) }, `Next: ${next.title} →`)),
  );
}

function neighborCard(n, label) {
  if (!n) return h('div', { class: 'neighbor empty' }, h('span', { class: 'eyebrow' }, label), h('span', { class: 'muted' }, label === 'Before' ? 'This is the first one.' : 'This is the last one.'));
  return h('button', { class: 'neighbor', onclick: () => select(n.id) },
    h('span', { class: 'eyebrow' }, label),
    h('strong', null, n.title),
    h('span', { class: 'muted' }, n.synopsis || 'No synopsis yet.'));
}

function renderBookOverview() {
  const p = P();
  const root = p.nodes.root;
  const total = M.treeWords(p);
  const all = M.flatten(p).map((x) => x.node);
  const leaves = all.filter((n) => !n.children.length);
  const byStatus = M.STATUSES.map((s) => ({ ...s, count: leaves.filter((n) => n.status === s.id).length }));
  const parts = root.children.map((id) => p.nodes[id]);
  return h('div', { class: 'write overview' },
    h('div', { class: 'eyebrow' }, 'The whole book'),
    h('input', { class: 'title-input', value: root.title, 'aria-label': 'Book title', oninput: (e) => { root.title = e.target.value; changed(); document.querySelectorAll('[data-root-title]').forEach((x) => (x.textContent = root.title)); } }),
    h('input', { class: 'author-input', value: p.author, placeholder: 'Author', 'aria-label': 'Author', oninput: (e) => { p.author = e.target.value; changed(); } }),
    h('div', { class: 'direction-grid wide' },
      field('Premise', 'The book in a few sentences. What happens, or what it argues?', root.synopsis, (v) => (root.synopsis = v), { rows: 3 }),
      field('What it’s really about', 'The question, feeling or idea underneath. What should a reader carry away?', root.purpose, (v) => (root.purpose = v), { rows: 3 }),
    ),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-num', 'data-wc': 'root' }, fmt(total)), h('div', { class: 'stat-label' }, 'words written')),
      h('div', { class: 'stat' },
        h('input', { class: 'stat-num input', type: 'number', min: 0, step: 1000, value: p.targetWords || '', placeholder: '—', 'aria-label': 'Target words', oninput: (e) => { p.targetWords = +e.target.value || 0; changed(); refreshCounts(); } }),
        h('div', { class: 'stat-label' }, 'target')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, all.filter((n) => n.type === 'chapter').length), h('div', { class: 'stat-label' }, 'chapters')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, leaves.length), h('div', { class: 'stat-label' }, 'blocks to write')),
    ),
    h('div', { class: 'progress' }, h('div', { class: 'progress-bar', 'data-progress': '', style: `width:${Math.min(100, (total / (p.targetWords || 1)) * 100)}%` })),
    h('div', { class: 'status-strip', title: 'Blocks by status' },
      byStatus.filter((s) => s.count).map((s) => h('div', { class: `seg status-${s.id}`, style: `flex:${s.count}` }, h('span', null, `${s.label} ${s.count}`)))),
    h('h3', { class: 'section-head' }, 'Parts'),
    h('div', { class: 'part-cards' },
      parts.map((pt) => h('button', { class: 'part-card', onclick: () => select(pt.id, 'board') },
        h('strong', null, pt.title),
        h('span', { class: 'muted' }, pt.synopsis || 'No synopsis yet.'),
        h('span', { class: 'wc' }, `${pt.children.length} ${pt.children.length === 1 ? 'chapter' : 'chapters'} · ${fmt(M.treeWords(p, pt.id))} words`))),
      h('button', { class: 'part-card add', onclick: () => addChild('root', 'part') }, icon('plus'), 'Add part')),
  );
}

function renderBoard() {
  const s = sel();
  const container = s.children.length || s.type !== 'section' ? s : M.parentOf(P(), s.id);
  const kids = container.children.map((id) => P().nodes[id]).filter(Boolean);
  const childType = M.TYPES[container.type].child;
  const up = container.id !== 'root' ? M.parentOf(P(), container.id) : null;

  return h('div', { class: 'board' },
    crumbs(container),
    h('div', { class: 'board-head' },
      up && h('button', { class: 'btn small ghost', onclick: () => select(up.id) }, icon('arrowL'), 'Up a level'),
      h('h2', null, container.title),
      h('p', { class: 'muted' }, 'Each card is one piece. Drag to reorder, or drag a card onto the outline at left to move it somewhere else. Edit the synopsis right on the card.')),
    h('div', { class: 'cards' },
      kids.map((k, i) => boardCard(k, i)),
      h('button', { class: 'card add', onclick: () => addChild(container.id, childType) }, icon('plus'), `Add ${M.TYPES[childType].label.toLowerCase()}`)),
  );
}

function boardCard(k, i) {
  const words = M.treeWords(P(), k.id);
  const card = h('article', { class: `card status-${k.status} ${k.id === state.selectedId ? 'selected' : ''}`, 'data-id': k.id },
    h('div', { class: 'card-top' },
      h('span', { class: 'card-num' }, i + 1),
      h('span', { class: `pill status-${k.status}` }, M.STATUSES.find((s) => s.id === k.status)?.label),
      h('span', { class: 'spacer' }),
      h('span', { class: 'wc' }, `${fmt(words)}${k.targetWords ? ` / ${fmt(k.targetWords)}` : ''} w`)),
    h('input', { class: 'card-title', value: k.title, 'aria-label': 'Title', onfocus: () => { state.selectedId = k.id; renderInspectorOnly(); }, oninput: (e) => { k.title = e.target.value; changed(); document.querySelector(`.row[data-id="${k.id}"] .row-title`)?.replaceChildren(k.title); } }),
    autoGrow(h('textarea', { class: 'card-syn', rows: 2, placeholder: 'What happens…', value: k.synopsis, oninput: (e) => { k.synopsis = e.target.value; changed(); } })),
    autoGrow(h('textarea', { class: 'card-purpose', rows: 1, placeholder: 'Why it’s here…', value: k.purpose, oninput: (e) => { k.purpose = e.target.value; changed(); } })),
    h('div', { class: 'card-foot' },
      k.children.length > 0 && h('button', { class: 'link', onclick: () => select(k.id, 'board') }, `${k.children.length} inside →`),
      h('span', { class: 'spacer' }),
      h('button', { class: 'link', onclick: () => select(k.id, 'write') }, 'Write')),
  );
  makeDraggable(card, 'node', k.id);
  makeDropTarget(card, k.id, { allowInside: false, horizontal: true });
  // Only start dragging from the card chrome, not while selecting text in fields.
  card.addEventListener('mousedown', (e) => { card.draggable = !e.target.closest('input,textarea'); });
  return card;
}

function renderOutline() {
  const p = P();
  const levels = { all: null, chapters: ['part', 'chapter'], parts: ['part'] }[state.outlineLevel];
  const rows = M.flatten(p).filter(({ node }) => !levels || levels.includes(node.type));
  return h('div', { class: 'outline' },
    h('div', { class: 'outline-head' },
      h('h2', null, 'Outline'),
      h('p', { class: 'muted' }, 'The whole book at a glance. Read down the “What happens” column to check the story or argument holds together; read down “Why it’s here” to check every piece earns its place.'),
      h('div', { class: 'seg-control' },
        [['all', 'Everything'], ['chapters', 'Parts & chapters'], ['parts', 'Parts']].map(([id, label]) =>
          h('button', { class: state.outlineLevel === id ? 'active' : '', onclick: () => { state.outlineLevel = id; render(); } }, label)))),
    h('div', { class: 'outline-grid', role: 'table' },
      h('div', { class: 'o-row o-head', role: 'row' },
        ['Title', 'What happens', 'Why it’s here', 'Status', 'Words'].map((t) => h('div', { role: 'columnheader' }, t))),
      rows.map(({ node: n, depth }) => {
        const row = h('div', { class: `o-row type-${n.type} ${n.id === state.selectedId ? 'selected' : ''}`, role: 'row', 'data-id': n.id },
          h('div', { class: 'o-title', style: `--depth:${depth}` },
            h('span', { class: `dot status-${n.status}` }),
            h('input', { value: n.title, 'aria-label': 'Title', onfocus: () => { state.selectedId = n.id; renderInspectorOnly(); }, oninput: (e) => { n.title = e.target.value; changed(); document.querySelector(`.row[data-id="${n.id}"] .row-title`)?.replaceChildren(n.title); } })),
          autoGrow(h('textarea', { rows: 1, value: n.synopsis, placeholder: '—', 'aria-label': 'What happens', onfocus: () => { state.selectedId = n.id; renderInspectorOnly(); }, oninput: (e) => { n.synopsis = e.target.value; changed(); } })),
          autoGrow(h('textarea', { rows: 1, value: n.purpose, placeholder: '—', 'aria-label': 'Why it’s here', onfocus: () => { state.selectedId = n.id; renderInspectorOnly(); }, oninput: (e) => { n.purpose = e.target.value; changed(); } })),
          statusSelect(n),
          h('button', { class: 'o-words link', title: 'Open to write', onclick: () => select(n.id, 'write') }, fmt(M.treeWords(p, n.id))));
        return row;
      })),
  );
}

function statusSelect(n) {
  return h('select', {
    class: `status-select status-${n.status}`, 'aria-label': 'Status',
    onchange: (e) => {
      const was = n.status;
      n.status = e.target.value;
      changed();
      render();
      if (n.status === 'done' && was !== 'done') blockDone(n, e.target);
    },
  }, M.STATUSES.map((s) => h('option', { value: s.id, selected: s.id === n.status }, s.label)));
}

// ---- notebook: ideas on a grid or a canvas -----------------------------------------

const CANVAS_W = 4000;
const CANVAS_H = 3000;
const NOTE_W = 240;
const SOURCES = {
  ai: '✦ AI',
  freewrite: '⏱ Freewrite',
  prompt: '❖ Prompt',
  collide: '⚭ Collision',
  interview: '? Interview',
};

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function newNote(text, extra = {}) {
  const note = M.makeNote(text, extra);
  P().notebook.push(note);
  return note;
}

function deleteNote(id) {
  snapshot();
  M.removeNote(P(), id);
  changed();
  render();
  toast('Idea deleted.', { undo: true });
}

function focusNote(id) {
  requestAnimationFrame(() => document.querySelector(`[data-note="${id}"] textarea`)?.focus());
}

const hereLabel = (n) => (n.id === 'root' ? 'the book' : `“${n.title}”`);
const aiReady = () => prefs.aiEnabled && !!sessionKey;
const aiError = (e) => (e?.status === 401 ? 'Your API key was rejected. Check it in Settings.' : e?.message || String(e));

function placeOptions() {
  const p = P();
  return [h('option', { value: '' }, 'Make it a block…'),
    h('option', { value: 'root' }, `in ${p.nodes.root.title}`),
    ...M.flatten(p).filter(({ node }) => node.type !== 'section').map(({ node, depth }) =>
      h('option', { value: node.id }, `${'  '.repeat(depth + 1)}in ${node.title}`))];
}

function renderNotebook() {
  const p = P();
  const q = state.noteFilter.trim().toLowerCase();
  const canvas = prefs.notebookLayout === 'canvas';
  const visible = p.notebook.filter((n) =>
    (!q || n.text.toLowerCase().includes(q)) &&
    (state.noteScope === 'all' || (state.noteScope === 'loose' ? !n.nodeId : !!n.nodeId)));

  const capture = autoGrow(h('textarea', {
    class: 'capture', rows: canvas ? 1 : 3,
    placeholder: 'Jot an idea, a line of dialogue, a fragment, a “what if”…  (⌘/Ctrl + Enter to add)',
    onkeydown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(); },
  }));
  function addNote() {
    const text = capture.value.trim();
    if (!text) return;
    const extra = {};
    if (canvas) {
      const s = state.canvasScroll || { l: 0, t: 0 };
      const k = p.notebook.length % 6;
      extra.x = Math.round(s.l / prefs.zoom + 60 + k * 24);
      extra.y = Math.round(s.t / prefs.zoom + 60 + k * 24);
    }
    newNote(text, extra);
    changed();
    render();
    document.querySelector('.capture')?.focus();
  }

  const refocus = (sel) => { const i = document.querySelector(sel); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); };

  return h('div', { class: `notebook ${canvas ? 'canvas-mode' : ''}` },
    h('div', { class: 'outline-head' },
      h('h2', null, 'Notebook'),
      !canvas && h('p', { class: 'muted' }, 'Loose ideas and fragments that don’t have a home yet. When one finds its place, drag it onto the outline at left or use “Make it a block”. Try the Canvas to spread ideas out, cluster them and draw connections.'),
      h('div', { class: 'nb-controls' },
        h('div', { class: 'seg-control' },
          [['grid', 'Grid'], ['canvas', 'Canvas']].map(([id, label]) => h('button', {
            class: prefs.notebookLayout === id ? 'active' : '',
            onclick: () => { prefs.notebookLayout = id; savePrefs(); render(); },
          }, label))),
        h('input', { class: 'note-filter', type: 'search', placeholder: 'Search ideas…', value: state.noteFilter, oninput: (e) => { state.noteFilter = e.target.value; render(); refocus('.note-filter'); } }),
        h('select', { class: 'note-scope', 'aria-label': 'Show', onchange: (e) => { state.noteScope = e.target.value; render(); } },
          [['all', 'All ideas'], ['loose', 'Loose ideas'], ['attached', 'Attached to a block']].map(([v, l]) => h('option', { value: v, selected: state.noteScope === v }, l))),
        canvas && h('div', { class: 'zoom' },
          h('button', { class: 'icon-btn small', title: 'Zoom out', onclick: () => setZoom(prefs.zoom / 1.2) }, '−'),
          h('button', { class: 'link', title: 'Reset zoom', onclick: () => setZoom(1) }, `${Math.round(prefs.zoom * 100)}%`),
          h('button', { class: 'icon-btn small', title: 'Zoom in', onclick: () => setZoom(prefs.zoom * 1.2) }, '+')),
      ),
      canvas && h('p', { class: 'muted small canvas-tips' }, 'Double-click to add an idea · drag a note by its top edge · drag ', icon('link'), ' onto another note to connect them · click a line to remove it · drag empty space to pan · ⌘/Ctrl + scroll to zoom'),
    ),
    h('div', { class: 'capture-wrap' }, capture, h('button', { class: 'btn primary', onclick: addNote }, 'Add idea')),
    canvas ? notesCanvas(new Set(visible.map((n) => n.id))) : [
      visible.length === 0 && h('p', { class: 'empty' }, p.notebook.length ? 'No ideas match.' : 'Your notebook is empty. Anything goes here.'),
      h('div', { class: 'notes' }, [...visible].reverse().map((n) => noteCard(n))),
    ],
  );
}

function noteCard(note, { canvas = false, dim = false } = {}) {
  const block = note.nodeId && P().nodes[note.nodeId];
  const busy = state.riffing === note.id;
  const el = h('article', {
    class: `note c-${note.color} ${canvas ? 'cnote' : ''} ${dim ? 'dim' : ''}`,
    'data-note': note.id,
    style: canvas ? `left:${note.x}px;top:${note.y}px` : null,
  },
  canvas && h('div', { class: 'cnote-grip', title: 'Drag to move' }),
  (block || note.source) && h('div', { class: 'note-chips' },
    block && h('button', { class: 'chip', title: 'Open this block', onclick: () => select(block.id, 'write') }, `↳ ${block.title}`),
    note.source && h('span', { class: 'chip src' }, SOURCES[note.source] || note.source)),
  autoGrow(h('textarea', {
    value: note.text, 'aria-label': 'Idea', rows: 1,
    placeholder: note.color === 'label' ? 'Cluster label' : 'An idea…',
    oninput: (e) => { note.text = e.target.value; changed(); if (canvas) requestAnimationFrame(drawLinks); },
  })),
  h('div', { class: 'note-foot' },
    h('div', { class: 'swatches' }, M.NOTE_COLORS.map((c) => h('button', {
      class: `sw c-${c} ${note.color === c ? 'on' : ''}`,
      title: c === 'label' ? 'Make this a cluster label' : `${c[0].toUpperCase()}${c.slice(1)}`,
      'aria-label': c === 'label' ? 'Label' : c,
      onclick: () => { note.color = c; changed(); render(); },
    }, c === 'label' ? 'T' : ''))),
    h('span', { class: 'spacer' }),
    aiReady() && note.color !== 'label' && h('button', {
      class: 'icon-btn small', title: 'Riff on this idea: spin off five connected variations (AI)', disabled: busy,
      onclick: () => riffNote(note),
    }, busy ? h('span', { class: 'spinner' }) : icon('spark')),
    canvas && h('button', { class: 'icon-btn small link-handle', title: 'Drag onto another note to connect them' }, icon('link')),
    h('select', { class: 'place', title: 'Turn this idea into a block in the book', onchange: (e) => e.target.value && placeNote(note.id, e.target.value) }, placeOptions()),
    h('button', { class: 'icon-btn small', title: 'Delete idea', onclick: () => deleteNote(note.id) }, icon('trash'))),
  );
  if (!canvas) {
    makeDraggable(el, 'note', note.id);
    el.addEventListener('mousedown', (e) => { el.draggable = !e.target.closest('textarea,select,button'); });
  }
  return el;
}

function ensurePositions() {
  const notes = P().notebook;
  const placed = notes.filter((n) => n.x != null);
  const y0 = placed.length ? Math.max(...placed.map((n) => n.y)) + 240 : 60;
  let i = 0;
  for (const n of notes) {
    if (n.x != null) continue;
    n.x = 60 + (i % 5) * (NOTE_W + 50);
    n.y = y0 + Math.floor(i / 5) * 220;
    i++;
  }
}

function setZoom(z) {
  const wrap = document.querySelector('.canvas-wrap');
  const old = prefs.zoom;
  prefs.zoom = Math.min(1.6, Math.max(0.35, Math.round(z * 100) / 100));
  savePrefs();
  if (wrap) {
    // Keep the centre of the view in place while zooming.
    const cx = (wrap.scrollLeft + wrap.clientWidth / 2) / old;
    const cy = (wrap.scrollTop + wrap.clientHeight / 2) / old;
    state.canvasScroll = { l: cx * prefs.zoom - wrap.clientWidth / 2, t: cy * prefs.zoom - wrap.clientHeight / 2 };
  }
  render();
}

function notesCanvas(visibleIds) {
  ensurePositions();
  const notes = P().notebook;
  const z = prefs.zoom;
  const w = Math.max(CANVAS_W, ...notes.map((n) => n.x + NOTE_W + 800));
  const ht = Math.max(CANVAS_H, ...notes.map((n) => n.y + 900));
  const svg = svgEl('svg', { class: 'links', width: w, height: ht });
  const board = h('div', { class: 'canvas', style: `width:${w}px;height:${ht}px;transform:scale(${z})` },
    svg, notes.map((n) => noteCard(n, { canvas: true, dim: !visibleIds.has(n.id) })));
  const wrap = h('div', { class: 'canvas-wrap' },
    h('div', { class: 'canvas-sizer', style: `width:${w * z}px;height:${ht * z}px` }, board),
    notes.length === 0 && h('div', { class: 'canvas-empty' }, 'Double-click anywhere to add your first idea.'));
  wireCanvas(wrap, board, svg);
  requestAnimationFrame(() => {
    drawLinks();
    if (state.canvasScroll) { wrap.scrollLeft = state.canvasScroll.l; wrap.scrollTop = state.canvasScroll.t; }
  });
  return wrap;
}

const centerOf = (el) => ({ x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 });

function drawLinks() {
  const svg = document.querySelector('svg.links');
  if (!svg) return;
  svg.querySelectorAll('g.link').forEach((g) => g.remove());
  for (const l of P().links) {
    const a = document.querySelector(`.cnote[data-note="${l.from}"]`);
    const b = document.querySelector(`.cnote[data-note="${l.to}"]`);
    if (!a || !b) continue;
    const ca = centerOf(a);
    const cb = centerOf(b);
    const mx = (ca.x + cb.x) / 2;
    const d = `M${ca.x},${ca.y} C${mx},${ca.y} ${mx},${cb.y} ${cb.x},${cb.y}`;
    const g = svgEl('g', { class: 'link' });
    g.append(svgEl('path', { d, class: 'hit' }), svgEl('path', { d, class: 'line' }));
    g.addEventListener('click', () => {
      snapshot();
      P().links = P().links.filter((x) => x.id !== l.id);
      changed();
      drawLinks();
      toast('Connection removed.', { undo: true });
    });
    svg.prepend(g);
  }
}

function wireCanvas(wrap, board, svg) {
  const toBoard = (e) => {
    const r = board.getBoundingClientRect();
    return { x: (e.clientX - r.left) / prefs.zoom, y: (e.clientY - r.top) / prefs.zoom };
  };
  const drag = (onMove, onUp) => {
    const up = (ev) => { removeEventListener('pointermove', onMove); removeEventListener('pointerup', up); onUp?.(ev); };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', up);
  };

  wrap.addEventListener('scroll', () => { state.canvasScroll = { l: wrap.scrollLeft, t: wrap.scrollTop }; });

  board.addEventListener('dblclick', (e) => {
    if (e.target !== board) return;
    const { x, y } = toBoard(e);
    const n = newNote('', { x: Math.round(x - NOTE_W / 2), y: Math.round(y - 24) });
    changed();
    render();
    focusNote(n.id);
  });

  board.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.cnote-grip');
    const handle = e.target.closest('.link-handle');
    if (grip) {
      e.preventDefault();
      const el = grip.closest('.cnote');
      const note = P().notebook.find((n) => n.id === el.dataset.note);
      const start = toBoard(e);
      const ox = note.x;
      const oy = note.y;
      el.classList.add('moving');
      drag((ev) => {
        const pt = toBoard(ev);
        note.x = Math.max(0, Math.round(ox + pt.x - start.x));
        note.y = Math.max(0, Math.round(oy + pt.y - start.y));
        el.style.left = `${note.x}px`;
        el.style.top = `${note.y}px`;
        drawLinks();
      }, () => {
        el.classList.remove('moving');
        if (note.x !== ox || note.y !== oy) changed();
      });
    } else if (handle) {
      e.preventDefault();
      const el = handle.closest('.cnote');
      const c = centerOf(el);
      const line = svgEl('line', { class: 'rubber', x1: c.x, y1: c.y, x2: c.x, y2: c.y });
      svg.append(line);
      drag((ev) => {
        const pt = toBoard(ev);
        line.setAttribute('x2', pt.x);
        line.setAttribute('y2', pt.y);
      }, (ev) => {
        line.remove();
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.cnote');
        if (!target || target === el) return;
        snapshot();
        if (M.linkNotes(P(), el.dataset.note, target.dataset.note)) { changed(); drawLinks(); } else state.undo.pop();
      });
    } else if (e.target === board) {
      const sx = e.clientX;
      const sy = e.clientY;
      const l = wrap.scrollLeft;
      const t = wrap.scrollTop;
      wrap.classList.add('panning');
      drag((ev) => {
        wrap.scrollLeft = l - (ev.clientX - sx);
        wrap.scrollTop = t - (ev.clientY - sy);
      }, () => wrap.classList.remove('panning'));
    }
  });

  wrap.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom(prefs.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
  }, { passive: false });
}

async function riffNote(note) {
  state.riffing = note.id;
  render();
  try {
    const { riffs } = await AI.brainstorm.riff.run(aiSettings(), P(), note);
    snapshot();
    ensurePositions();
    riffs.forEach((text, i) => {
      const n = newNote(text, {
        source: 'ai',
        color: note.color === 'label' ? 'yellow' : note.color,
        nodeId: note.nodeId,
        x: note.x + NOTE_W + 90 + (i % 2) * 40,
        y: Math.max(0, note.y + (i - (riffs.length - 1) / 2) * 175),
      });
      M.linkNotes(P(), note.id, n.id);
    });
    changed();
    toast(`Spun off ${riffs.length} variations${prefs.notebookLayout === 'grid' ? '. Switch to Canvas to see how they connect' : ''}.`, { undo: true });
  } catch (e) {
    toast(aiError(e), { error: true });
  }
  state.riffing = null;
  render();
}

// ---- brainstorm tools: prompts, freewrite, collide, AI sparks ------------------------

function openModal(dlg) {
  dlg.addEventListener('close', () => { dlg.remove(); render(); });
  document.body.append(dlg);
  dlg.showModal();
}

function openCollide() {
  const pool = P().notebook.filter((n) => n.text.trim() && n.color !== 'label');
  if (pool.length < 2) return toast('Collide needs at least two ideas in your notebook.');
  let a;
  let b;
  const dlg = h('dialog', { class: 'modal collide' });
  const pair = h('div', { class: 'pair' });
  const answer = autoGrow(h('textarea', { rows: 3, placeholder: 'How might these connect? What happens if both are true? Nonsense is allowed.' }));
  const card = (n) => h('div', { class: `note static c-${n.color}` }, h('p', null, n.text));
  const shuffle = () => {
    const i = Math.floor(Math.random() * pool.length);
    let j = Math.floor(Math.random() * (pool.length - 1));
    if (j >= i) j++;
    [a, b] = [pool[i], pool[j]];
    pair.replaceChildren(card(a), h('div', { class: 'plus' }, '+'), card(b));
    answer.value = '';
    answer.focus();
  };
  const keep = () => {
    const text = answer.value.trim();
    if (!text) return answer.focus();
    snapshot();
    const pos = a.x != null && b.x != null ? { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) + 140 } : {};
    const n = newNote(text, { source: 'collide', color: 'lilac', nodeId: a.nodeId || b.nodeId || null, ...pos });
    M.linkNotes(P(), a.id, n.id);
    M.linkNotes(P(), b.id, n.id);
    changed();
    toast('Saved the connection to your notebook.');
    shuffle();
  };
  dlg.append(
    h('div', { class: 'dlg-head' }, h('h2', null, 'Collide two ideas'), h('button', { class: 'icon-btn', onclick: () => dlg.close(), title: 'Close' }, icon('close'))),
    h('p', { class: 'muted' }, 'Two random ideas from your notebook, side by side. Unexpected pairings are where new material comes from.'),
    pair, answer,
    h('div', { class: 'dlg-foot' },
      h('button', { class: 'btn', onclick: shuffle }, 'Shuffle'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', onclick: keep }, 'Save connection')),
  );
  answer.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) keep(); });
  openModal(dlg);
  shuffle();
}

function openFreewrite(prompt = '', scopeId = state.selectedId) {
  let minutes = prefs.sprintMinutes || 10;
  let strict = false;
  let started = false;
  let finished = false;
  let timer;
  let endAt;
  const dlg = h('dialog', { class: 'sprint' });
  const promptInput = h('input', { class: 'sprint-prompt-input', value: prompt, placeholder: 'Optional: a prompt or question to write toward' });
  const ta = h('textarea', { class: 'sprint-text prose', placeholder: 'Go. Don’t stop, don’t fix, just keep moving…' });
  const clock = h('span', { class: 'sprint-clock' });
  const wc = h('span', { class: 'sprint-wc' }, '0 words');
  const minuteBtns = h('div', { class: 'seg-control' });
  const drawMinutes = () => minuteBtns.replaceChildren(...[5, 10, 15, 20].map((m) =>
    h('button', { class: m === minutes ? 'active' : '', onclick: () => { minutes = m; drawMinutes(); } }, `${m} min`)));
  drawMinutes();

  const setup = h('div', { class: 'sprint-setup' },
    h('h2', null, 'Freewrite'),
    h('p', { class: 'muted' }, `Write without stopping for a set time${scopeId !== 'root' ? ` about ${hereLabel(P().nodes[scopeId])}` : ''}. Don’t edit and don’t judge. Whatever comes out goes into your notebook, where you can mine it later.`),
    promptInput,
    minuteBtns,
    h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => (strict = e.target.checked) }), 'No deleting: backspace is switched off, so keep moving forward'),
    h('div', { class: 'dlg-foot' },
      h('button', { class: 'btn ghost', onclick: () => dlg.close() }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: start }, 'Start')));

  const running = h('div', { class: 'sprint-run' },
    h('div', { class: 'sprint-bar' },
      h('span', { class: 'sprint-prompt' }),
      h('span', { class: 'spacer' }), wc, clock,
      h('button', { class: 'btn small', onclick: finish }, 'Done')),
    ta);
  running.hidden = true;

  function start() {
    started = true;
    prefs.sprintMinutes = minutes;
    savePrefs();
    running.querySelector('.sprint-prompt').textContent = promptInput.value.trim();
    setup.hidden = true;
    running.hidden = false;
    endAt = Date.now() + minutes * 60000;
    tick();
    timer = setInterval(tick, 500);
    ta.focus();
  }
  function tick() {
    const left = Math.max(0, endAt - Date.now());
    if (left === 0) {
      clearInterval(timer);
      clock.textContent = 'Time’s up. Finish your thought';
      clock.classList.add('done');
      return;
    }
    const s = Math.ceil(left / 1000);
    clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    const text = ta.value.trim();
    if (text) {
      const pr = promptInput.value.trim();
      newNote(pr ? `${pr}\n\n${text}` : text, { source: 'freewrite', color: 'peach', nodeId: scopeId !== 'root' ? scopeId : null });
      changed();
      toast(`Saved ${fmt(M.countWords(text))} freewritten words to your notebook.`);
    }
    dlg.close();
  }
  ta.addEventListener('input', () => { wc.textContent = `${fmt(M.countWords(ta.value))} words`; });
  ta.addEventListener('keydown', (e) => {
    if (strict && (e.key === 'Backspace' || e.key === 'Delete' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x'))) e.preventDefault();
  });
  dlg.addEventListener('cancel', (e) => { if (started) { e.preventDefault(); finish(); } });
  dlg.append(setup, running);
  openModal(dlg);
  promptInput.focus();
}

async function runSpark(scopeId, kind) {
  state.spark = { scopeId, kind, loading: true };
  renderInspectorOnly();
  try {
    const data = await AI.brainstorm[kind].run(aiSettings(), P(), scopeId);
    state.spark = { scopeId, kind, data, kept: new Set(), answers: [] };
  } catch (e) {
    state.spark = { scopeId, kind, error: aiError(e) };
  }
  renderInspectorOnly();
}

function renderSpark(n) {
  const sp = state.spark?.scopeId === n.id ? state.spark : null;
  const btn = (label, hint, fn, disabled = false) => h('button', { class: 'spark-btn', title: hint, disabled, onclick: fn }, label);
  const scope = state.view === 'notebook'
    ? h('select', { class: 'scope-select', 'aria-label': 'Brainstorm about', onchange: (e) => { state.selectedId = e.target.value; renderInspectorOnly(); } },
      h('option', { value: 'root', selected: n.id === 'root' }, 'about the whole book'),
      M.flatten(P()).map(({ node, depth }) => h('option', { value: node.id, selected: node.id === n.id }, `${'  '.repeat(depth)}about ${node.title}`)))
    : h('span', { class: 'panel-sub' }, `about ${hereLabel(n)}`);
  return h('section', { class: 'panel spark' },
    h('div', { class: 'panel-head' }, h('span', { class: 'eyebrow' }, icon('bulb'), ' Brainstorm'), scope),
    h('div', { class: 'spark-grid' },
      btn('Deal a prompt', 'A random prompt to get you thinking sideways', () => { state.spark = { scopeId: n.id, kind: 'prompt', card: dealPrompt(hereLabel(n)) }; renderInspectorOnly(); }),
      btn('Freewrite', 'Write without stopping for a few minutes; it all goes to the notebook', () => openFreewrite('', n.id)),
      btn('Collide', 'Two random ideas from your notebook. How do they connect?', openCollide, P().notebook.length < 2),
      aiReady() && btn('✦ What if…?', 'Eight possibilities, from grounded to wild (AI)', () => runSpark(n.id, 'whatIf'), sp?.loading),
      aiReady() && btn('✦ Interview me', 'Questions only you can answer (AI)', () => runSpark(n.id, 'interview'), sp?.loading),
    ),
    !aiReady() && h('p', { class: 'muted small' }, 'With the assistant on (Settings), you also get AI “what ifs”, interviews, and riffs on any note.'),
    sp && renderSparkResult(sp, n),
  );
}

function renderSparkResult(sp, n) {
  const nodeId = n.id !== 'root' ? n.id : null;
  const close = h('button', { class: 'icon-btn small', title: 'Dismiss', onclick: () => { state.spark = null; renderInspectorOnly(); } }, icon('close'));
  const wrap = (label, ...kids) => h('div', { class: 'ai-result spark-result' }, h('div', { class: 'ai-result-head' }, h('span', { class: 'eyebrow' }, label), close), ...kids);
  if (sp.loading) return h('div', { class: 'ai-result loading' }, h('span', { class: 'spinner' }), 'Brainstorming…');
  if (sp.error) return wrap('Brainstorm', h('p', { class: 'error-text' }, sp.error));

  if (sp.kind === 'prompt') {
    return wrap(sp.card.category,
      h('p', { class: 'prompt-text' }, sp.card.text),
      h('div', { class: 'actions' },
        h('button', { class: 'btn small', onclick: () => { sp.card = dealPrompt(hereLabel(n)); renderInspectorOnly(); } }, 'Another'),
        h('button', { class: 'btn small', onclick: () => { newNote(sp.card.text, { source: 'prompt', color: 'blue', nodeId }); changed(); toast('Kept in your notebook.'); render(); } }, 'Keep as idea'),
        h('button', { class: 'btn small primary', onclick: () => openFreewrite(sp.card.text, n.id) }, 'Freewrite on it')));
  }
  if (sp.kind === 'whatIf') {
    const keep = (i) => { newNote(sp.data.ideas[i].idea, { source: 'ai', nodeId }); sp.kept.add(i); };
    return wrap('What if…',
      h('ol', { class: 'spark-ideas' }, sp.data.ideas.map((idea, i) => h('li', null,
        h('span', { class: 'kind' }, idea.kind),
        h('span', { class: 'idea-text' }, idea.idea),
        h('button', {
          class: 'btn small', disabled: sp.kept.has(i),
          onclick: () => { keep(i); changed(); render(); },
        }, sp.kept.has(i) ? 'Kept' : 'Keep')))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn small', onclick: () => { sp.data.ideas.forEach((_, i) => !sp.kept.has(i) && keep(i)); changed(); render(); toast('All kept in your notebook.'); } }, 'Keep all'),
        h('button', { class: 'btn small', onclick: () => runSpark(n.id, 'whatIf') }, 'More ideas')));
  }
  if (sp.kind === 'interview') {
    return wrap('Interview',
      h('p', { class: 'muted small' }, 'Answer any that spark something. Rough is fine.'),
      h('ol', { class: 'interview' }, sp.data.questions.map((q, i) => h('li', null,
        h('p', null, q),
        autoGrow(h('textarea', { rows: 2, value: sp.answers[i] || '', placeholder: 'Your answer…', oninput: (e) => (sp.answers[i] = e.target.value) }))))),
      h('div', { class: 'actions' },
        h('button', {
          class: 'btn small primary', onclick: () => {
            const pairs = sp.data.questions.map((q, i) => [q, (sp.answers[i] || '').trim()]).filter(([, a]) => a);
            if (!pairs.length) return toast('Answer at least one question first.');
            pairs.forEach(([q, a]) => newNote(`${q}\n\n${a}`, { source: 'interview', color: 'green', nodeId }));
            state.spark = null;
            changed();
            render();
            toast(`Saved ${pairs.length} answer${pairs.length > 1 ? 's' : ''} to your notebook.`);
          },
        }, 'Save answers as ideas'),
        h('button', { class: 'btn small', onclick: () => runSpark(n.id, 'interview') }, 'Different questions')));
  }
  return null;
}

function renderIdeasFor(n) {
  const ideas = P().notebook.filter((x) => x.nodeId === n.id);
  const add = h('input', {
    placeholder: 'Jot an idea for this block (Enter)',
    onkeydown: (e) => {
      if (e.key !== 'Enter' || !e.target.value.trim()) return;
      newNote(e.target.value.trim(), { nodeId: n.id });
      changed();
      renderInspectorOnly();
      document.querySelector('.ideas input')?.focus();
    },
  });
  return h('section', { class: 'panel ideas' },
    h('div', { class: 'panel-head row-head' },
      h('span', { class: 'eyebrow' }, icon('note'), ` Ideas for this block${ideas.length ? ` · ${ideas.length}` : ''}`),
      ideas.length > 0 && h('button', { class: 'link', onclick: () => { state.view = 'notebook'; state.noteScope = 'attached'; render(); } }, 'In notebook')),
    ideas.length > 0 && h('ul', { class: 'idea-list' }, ideas.map((x) => h('li', { class: `c-${x.color}` },
      autoGrow(h('textarea', { rows: 1, value: x.text, 'aria-label': 'Idea', oninput: (e) => { x.text = e.target.value; changed(); } })),
      x.source && h('span', { class: 'chip src' }, SOURCES[x.source]),
      h('button', { class: 'icon-btn small', title: 'Delete idea', onclick: () => deleteNote(x.id) }, icon('close'))))),
    add);
}

// ---- render: inspector (right) ----------------------------------------------------

function renderInspectorOnly() {
  document.querySelector('.inspector')?.replaceWith(renderInspector());
  document.querySelectorAll('.o-row.selected, .card.selected').forEach((r) => r.classList.remove('selected'));
  document.querySelectorAll(`.o-row[data-id="${state.selectedId}"], .card[data-id="${state.selectedId}"]`).forEach((r) => r.classList.add('selected'));
  document.querySelectorAll('.binder .row.selected').forEach((r) => r.classList.remove('selected'));
  document.querySelector(`.binder .row[data-id="${state.selectedId}"]`)?.classList.add('selected');
}

function renderInspector() {
  const n = sel();
  const isRoot = n.id === 'root';
  if (state.view === 'notebook') return h('aside', { class: 'inspector' }, renderSpark(n));
  return h('aside', { class: 'inspector' },
    isRoot ? null : inspectorBlock(n),
    isRoot ? null : renderIdeasFor(n),
    renderSpark(n),
    renderAssistant(n),
  );
}

function inspectorBlock(n) {
  const words = M.treeWords(P(), n.id);
  const parent = M.parentOf(P(), n.id);
  const idx = parent.children.indexOf(n.id);
  const childType = M.TYPES[n.type].child;
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('span', { class: 'eyebrow' }, 'This block'), h('span', { class: 'panel-title' }, n.title)),
    h('div', { class: 'kv' },
      h('label', null, 'Kind'),
      h('select', { onchange: (e) => { n.type = e.target.value; changed(); render(); } },
        ['part', 'chapter', 'section'].map((t) => h('option', { value: t, selected: n.type === t }, M.TYPES[t].label))),
      h('label', null, 'Status'), statusSelect(n),
      h('label', null, 'Target'),
      h('input', { type: 'number', min: 0, step: 100, value: n.targetWords || '', placeholder: 'words', oninput: (e) => { n.targetWords = +e.target.value || 0; changed(); refreshCounts(); } }),
    ),
    h('div', { class: 'progress small' }, h('div', { class: 'progress-bar', 'data-progress': '', style: `width:${n.targetWords ? Math.min(100, (words / n.targetWords) * 100) : 0}%` })),
    h('div', { class: 'muted small' }, h('span', { 'data-wc': n.id }, fmt(words)), n.targetWords ? ` of ${fmt(n.targetWords)} words` : ' words'),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Tags'),
      h('input', { value: n.tags.join(', '), placeholder: 'e.g. flashback, Mara, needs research', oninput: (e) => { n.tags = e.target.value.split(',').map((t) => t.trim()).filter(Boolean); changed(); } })),
    field('Notes', 'Margin notes, research, reminders to self…', n.notes, (v) => (n.notes = v), { rows: 3 }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', onclick: () => addChild(n.id, childType) }, icon('plus'), `${M.TYPES[childType].label} inside`),
      h('button', { class: 'btn small', onclick: () => addAfter(n.id) }, icon('plus'), `${M.TYPES[n.type].label} after`),
      h('button', { class: 'btn small', disabled: idx === 0, onclick: () => shift(n.id, -1), title: 'Move up' }, icon('up'), 'Up'),
      h('button', { class: 'btn small', disabled: idx === parent.children.length - 1, onclick: () => shift(n.id, 1), title: 'Move down' }, icon('down'), 'Down'),
      h('button', { class: 'btn small', disabled: idx === parent.children.length - 1, onclick: () => mergeNext(n.id), title: 'Combine this block with the next one at the same level' }, icon('merge'), 'Merge next'),
      h('button', { class: 'btn small danger-ghost', onclick: () => removeNode(n.id) }, icon('trash'), 'Delete'),
    ),
  );
}

// ---- assistant -------------------------------------------------------------------------

function renderAssistant(n) {
  const head = h('div', { class: 'panel-head' }, h('span', { class: 'eyebrow' }, icon('spark'), ' Assistant'));
  if (!prefs.aiEnabled) {
    return h('section', { class: 'panel assistant off' }, head,
      h('p', { class: 'muted small' }, 'Optional AI help with direction, flow and breaking big pieces down. It’s off, and nothing leaves your computer.'),
      h('button', { class: 'btn small', onclick: openSettings }, 'Set up assistant'));
  }
  if (!sessionKey) {
    return h('section', { class: 'panel assistant' }, head,
      h('p', { class: 'muted small' }, 'Add your Anthropic API key in Settings to use the assistant.'),
      h('button', { class: 'btn small', onclick: openSettings }, 'Add key'));
  }
  const isRoot = n.id === 'root';
  const hasText = !!M.stripHtml(n.content).trim();
  const list = isRoot ? ['structure', 'breakdown'] : ['direction', 'flow', ...(hasText ? ['summarize'] : []), 'breakdown'];
  const res = state.aiResults[n.id];
  const askBox = h('textarea', { rows: 2, placeholder: isRoot ? 'Ask about the book…' : `Ask about this ${M.TYPES[n.type].label.toLowerCase()}…`, onkeydown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runAsk(); } });
  function runAsk() {
    const q = askBox.value.trim();
    if (q) runAI(n.id, 'ask', () => AI.ask(aiSettings(), P(), n.id, q));
  }
  return h('section', { class: 'panel assistant' }, head,
    h('div', { class: 'ai-actions' }, list.map((a) => h('button', {
      class: 'ai-btn', disabled: res?.loading, title: AI.actions[a].hint,
      onclick: () => runAI(n.id, a, () => AI.actions[a].run(aiSettings(), P(), n.id)),
    }, h('strong', null, AI.actions[a].label), h('span', null, AI.actions[a].hint)))),
    h('div', { class: 'ask' }, autoGrow(askBox), h('button', { class: 'btn small', disabled: res?.loading, onclick: runAsk }, 'Ask')),
    res && renderAIResult(n, res),
  );
}

async function runAI(id, action, fn) {
  state.aiResults[id] = { action, loading: true };
  renderInspectorOnly();
  try {
    const out = await fn();
    state.aiResults[id] = typeof out === 'string' ? { action, html: AI.renderMarkdown(out) } : { action, data: out };
  } catch (e) {
    state.aiResults[id] = { action, error: aiError(e) };
  }
  if (state.selectedId === id) renderInspectorOnly();
}

function renderAIResult(n, res) {
  const close = h('button', { class: 'icon-btn small', title: 'Dismiss', onclick: () => { delete state.aiResults[n.id]; renderInspectorOnly(); } }, icon('close'));
  const label = res.action === 'ask' ? 'Answer' : AI.actions[res.action]?.label;
  const wrap = (...kids) => h('div', { class: 'ai-result' }, h('div', { class: 'ai-result-head' }, h('span', { class: 'eyebrow' }, label), close), ...kids);
  if (res.loading) return h('div', { class: 'ai-result loading' }, h('span', { class: 'spinner' }), 'Thinking it through…');
  if (res.error) return wrap(h('p', { class: 'error-text' }, res.error));
  if (res.html) return wrap(h('div', { class: 'ai-body', html: res.html }));
  if (res.action === 'summarize') {
    const { synopsis, purpose } = res.data;
    const use = (key, val) => { snapshot(); n[key] = val; changed(); render(); toast('Updated.', { undo: true }); };
    return wrap(
      h('div', { class: 'suggest' }, h('span', { class: 'field-label' }, 'What happens'), h('p', null, synopsis), h('button', { class: 'btn small', onclick: () => use('synopsis', synopsis) }, 'Use this')),
      h('div', { class: 'suggest' }, h('span', { class: 'field-label' }, 'Why it’s here'), h('p', null, purpose), h('button', { class: 'btn small', onclick: () => use('purpose', purpose) }, 'Use this')));
  }
  if (res.action === 'breakdown') {
    const picks = res.data.pieces.map(() => true);
    return wrap(
      h('p', { class: 'muted small' }, res.data.note),
      h('ol', { class: 'pieces' }, res.data.pieces.map((pc, i) => h('li', null,
        h('label', null, h('input', { type: 'checkbox', checked: true, onchange: (e) => (picks[i] = e.target.checked) }),
          h('span', null, h('strong', null, pc.title), h('br'), pc.synopsis, h('br'), h('em', { class: 'muted' }, pc.purpose)))))),
      h('button', {
        class: 'btn small primary', onclick: () => {
          snapshot();
          const type = M.TYPES[n.type].child;
          res.data.pieces.forEach((pc, i) => {
            if (!picks[i]) return;
            const c = M.addNode(P(), n.id, type, null, pc.title);
            c.synopsis = pc.synopsis;
            c.purpose = pc.purpose;
            c.status = 'outlined';
          });
          delete state.aiResults[n.id];
          changed();
          select(n.id, 'board');
          toast('Added. Rearrange them on the board.', { undo: true });
        },
      }, `Add as ${M.TYPES[M.TYPES[n.type].child].label.toLowerCase()}s`));
  }
  return null;
}

// ---- settings ------------------------------------------------------------------------

function openSettings({ scrollTo } = {}) {
  const dlg = h('dialog', { class: 'settings' });
  const keyInput = h('input', { type: 'password', value: sessionKey, placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: false });
  const close = () => { dlg.close(); dlg.remove(); render(); };
  dlg.append(
    h('div', { class: 'dlg-head' }, h('h2', null, 'Settings'), h('button', { class: 'icon-btn', onclick: close, title: 'Close' }, icon('close'))),
    h('h3', null, 'Appearance'),
    skinPicker(),
    h('div', { class: 'kv' },
      h('label', null, 'Mode'), modeControl(),
      h('label', null, 'Text size'),
      h('input', { type: 'range', min: 15, max: 24, value: prefs.fontSize, oninput: (e) => { prefs.fontSize = +e.target.value; savePrefs(); document.documentElement.style.setProperty('--editor-size', `${prefs.fontSize}px`); } })),
    typeControls(),
    h('h3', null, 'Writing'),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.sounds, onchange: (e) => setWritingPref('sounds', e.target.checked) }),
      h('span', null, h('strong', null, 'Typing sounds'), h('br'), h('span', { class: 'muted small' }, 'Typewriter clacks as you type, and a bell with the carriage return on Enter.'))),
    h('div', { class: 'kv indent' },
      h('label', null, 'Volume'),
      h('div', { class: 'range-row' },
        h('input', { type: 'range', min: 0.05, max: 1, step: 0.05, value: prefs.soundVolume, oninput: (e) => { prefs.soundVolume = +e.target.value; savePrefs(); }, onchange: () => Sound.play('key', prefs.soundVolume) }),
        h('button', { class: 'btn small', onclick: () => { Sound.play('key', prefs.soundVolume); setTimeout(() => Sound.play('key', prefs.soundVolume), 120); setTimeout(() => Sound.play('enter', prefs.soundVolume), 300); } }, 'Try it'))),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.typewriterScroll, onchange: (e) => setWritingPref('typewriterScroll', e.target.checked) }),
      h('span', null, h('strong', null, 'Typewriter scrolling'), h('br'), h('span', { class: 'muted small' }, 'Keeps the line you’re writing in the middle of the screen.'))),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.fadeRest, onchange: (e) => setWritingPref('fadeRest', e.target.checked) }),
      h('span', null, h('strong', null, 'Fade the rest'), h('br'), h('span', { class: 'muted small' }, 'Dims every paragraph except the one you’re writing.'))),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.celebrate, onchange: (e) => { prefs.celebrate = e.target.checked; savePrefs(); } }),
      h('span', null, h('strong', null, 'Celebrations & milestones'), h('br'), h('span', { class: 'muted small' }, 'A little confetti when you hit a word target, finish a block, or pass a milestone.'))),
    h('p', { class: 'muted small' }, 'The first three are also buttons on the writing toolbar, so you can flip them any time.'),
    h('h3', null, 'AI assistant ', h('span', { class: 'muted small' }, '(optional)')),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.aiEnabled, onchange: (e) => { prefs.aiEnabled = e.target.checked; savePrefs(); } }),
      'Turn on the assistant'),
    h('p', { class: 'muted small' },
      'The assistant acts as a developmental editor: it asks questions and suggests directions, but doesn’t write for you. It uses your own ',
      h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener' }, 'Anthropic API key'),
      '. Your text goes straight from this browser to Anthropic, and only when you click an assistant action.'),
    h('div', { class: 'kv' },
      h('label', null, 'API key'), keyInput,
      h('label', null, 'Model'),
      h('select', { onchange: (e) => { prefs.model = e.target.value; savePrefs(); } },
        AI.MODELS.map((m) => h('option', { value: m.id, selected: prefs.model === m.id }, m.label)))),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.rememberKey, onchange: (e) => { prefs.rememberKey = e.target.checked; savePrefs(); } }),
      'Remember the key on this device (otherwise it’s forgotten when you close the tab)'),
    h('div', { class: 'dlg-foot' }, h('button', { class: 'btn primary', onclick: close }, 'Done')),
  );
  keyInput.addEventListener('input', () => { sessionKey = keyInput.value.trim(); prefs.apiKey = sessionKey; savePrefs(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  if (scrollTo) dlg.querySelector(`#${scrollTo}`)?.scrollIntoView({ block: 'start' });
}

// ---- skins ---------------------------------------------------------------------------
// Tokens and signature touches live in css/themes.css; these swatches only draw the picker.

const SKINS = [
  { id: 'studio', name: 'Studio', vibe: 'Warm paper, bookish serif', bg: '#f5f0e6', card: '#fffdf8', ink: '#2a2520', accent: '#b4532a', font: "'Literata', serif", type: { prose: 'Literata', display: 'Literata', ui: 'Inter', leading: 1.75 } },
  { id: 'minimal', name: 'Minimal', vibe: 'Sleek, modern, quiet', bg: '#fafafa', card: '#ffffff', ink: '#0a0a0b', accent: '#111113', font: "'Geist', sans-serif", type: { prose: 'Geist', display: 'Geist', ui: 'Geist', leading: 1.8 } },
  { id: 'typewriter', name: 'Typewriter', vibe: 'Inked paper, ribbon red', bg: '#e6dfcd', card: '#f7f2e4', ink: '#211f1b', accent: '#b0302a', font: "'Special Elite', monospace", type: { prose: 'Courier Prime', display: 'Special Elite', ui: 'IBM Plex Mono', leading: 1.85 } },
  { id: 'nocturne', name: 'Nocturne', vibe: '2am, candlelit. Always dark', bg: '#0d1019', card: '#141925', ink: '#ebe4d6', accent: '#e8ae5b', font: "'Cormorant Garamond', serif", dark: true, type: { prose: 'EB Garamond', display: 'Cormorant Garamond', ui: 'Inter', leading: 1.7 } },
  { id: 'meadow', name: 'Meadow', vibe: 'Soft, cosy, a little dreamy', bg: '#f4f2e8', card: '#fffdf7', ink: '#2c3327', accent: '#c25e68', font: "'Fraunces', serif", type: { prose: 'Lora', display: 'Fraunces', ui: 'Nunito Sans', leading: 1.8 } },
];
const skinOf = () => SKINS.find((k) => k.id === prefs.skin) || SKINS[0];
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

function applyTheme(animate = false) {
  const d = document.documentElement;
  const dark = skinOf().dark || prefs.theme === 'dark' || (prefs.theme === 'auto' && darkQuery.matches);
  if (animate) {
    d.classList.add('skin-switching');
    clearTimeout(applyTheme.t);
    applyTheme.t = setTimeout(() => d.classList.remove('skin-switching'), 400);
  }
  d.dataset.skin = skinOf().id;
  d.dataset.mode = dark ? 'dark' : 'light';
  applyType();
  requestAnimationFrame(refitTextareas);
  document.querySelectorAll('.skin-opt').forEach((b) => b.classList.toggle('on', b.dataset.skin === prefs.skin));
  document.querySelectorAll('.mode-control').forEach((c) => c.replaceWith(modeControl()));
  document.querySelectorAll('.type-controls').forEach((c) => c.replaceWith(typeControls()));
}
darkQuery.addEventListener('change', () => applyTheme(true));
// A new skin brings new fonts: re-measure auto-growing textareas when they arrive.
const refitTextareas = () => document.querySelectorAll('textarea[data-autogrow]').forEach((t) => t.fit?.());
document.fonts?.addEventListener('loadingdone', refitTextareas);

function setSkin(id) { prefs.skin = id; savePrefs(); applyTheme(true); }

function skinPicker({ compact = false } = {}) {
  return h('div', { class: `skin-picker ${compact ? 'compact' : ''}`, role: 'radiogroup', 'aria-label': 'Skin' },
    SKINS.map((k) => h('button', {
      class: `skin-opt ${prefs.skin === k.id ? 'on' : ''}`, 'data-skin': k.id, role: 'radio', title: k.vibe,
      'aria-checked': String(prefs.skin === k.id),
      onclick: () => setSkin(k.id),
    },
      h('span', { class: 'skin-swatch', style: `--sw-bg:${k.bg};--sw-card:${k.card};--sw-ink:${k.ink};--sw-accent:${k.accent};--sw-font:${k.font}` },
        h('span', { class: 'sw-card' }, h('b', null, 'Aa'), h('i'), h('i'))),
      h('span', { class: 'skin-name' }, k.name),
      !compact && h('span', { class: 'skin-vibe' }, k.vibe))));
}

function modeControl() {
  const forced = skinOf().dark;
  return h('div', { class: 'seg-control mode-control', title: forced ? `${skinOf().name} is always dark` : '' },
    [['auto', 'Auto'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']].map(([v, l, ic]) => h('button', {
      class: prefs.theme === v && !forced ? 'active' : '', disabled: forced,
      onclick: () => { prefs.theme = v; savePrefs(); applyTheme(true); },
    }, ic && icon(ic), l)));
}

function lookMenu() {
  return h('details', { class: 'menu look' },
    h('summary', { class: 'icon-btn', title: 'Look & feel' }, icon('palette')),
    h('div', { class: 'menu-pop right look-pop' },
      h('div', { class: 'eyebrow' }, 'Skin'),
      skinPicker(),
      h('div', { class: 'look-foot' }, h('span', { class: 'eyebrow' }, 'Mode'), modeControl()),
      h('button', { class: 'link look-fonts', onclick: (e) => { e.target.closest('details').open = false; openSettings({ scrollTo: 'type' }); } }, 'Change fonts & spacing…')));
}

// ---- type ------------------------------------------------------------------------------
// Each skin has its own fonts, but writers can swap any of the three (writing, headings,
// interface) and the line spacing, per skin. Overrides are set as inline custom properties
// on <html>, which beat the skin's tokens. Fonts not already in index.html load on demand
// (and the service worker keeps them for offline use).

const GF = 'https://fonts.googleapis.com/css2?display=swap&family=';
const FONTS = [
  // name, group, Google Fonts spec (null: already loaded by index.html), size scale for prose, heading weight
  { name: 'Literata', group: 'Serif', w: 600 },
  { name: 'Lora', group: 'Serif', w: 600 },
  { name: 'EB Garamond', group: 'Serif', scale: 1.1, w: 600 },
  { name: 'Crimson Pro', group: 'Serif', spec: 'Crimson+Pro:ital,wght@0,400;0,600;1,400', scale: 1.1, w: 600 },
  { name: 'Source Serif 4', group: 'Serif', spec: 'Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400', w: 600 },
  { name: 'Newsreader', group: 'Serif', spec: 'Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400', scale: 1.04, w: 600 },
  { name: 'Spectral', group: 'Serif', spec: 'Spectral:ital,wght@0,400;0,600;1,400', w: 600 },
  { name: 'Libre Baskerville', group: 'Serif', spec: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400', scale: .92, w: 700 },
  { name: 'Merriweather', group: 'Serif', spec: 'Merriweather:ital,wght@0,400;0,700;1,400', scale: .92, w: 700 },
  { name: 'Inter', group: 'Sans', scale: .95, w: 600 },
  { name: 'Geist', group: 'Sans', scale: .95, w: 600 },
  { name: 'Nunito Sans', group: 'Sans', w: 700 },
  { name: 'DM Sans', group: 'Sans', spec: 'DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;1,9..40,400', scale: .97, w: 600 },
  { name: 'Atkinson Hyperlegible', group: 'Sans', spec: 'Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400', note: 'designed for legibility', w: 700 },
  { name: 'Lexend', group: 'Sans', spec: 'Lexend:wght@400;600', note: 'designed for easier reading', scale: .93, w: 600 },
  { name: 'Space Grotesk', group: 'Sans', spec: 'Space+Grotesk:wght@400;600', scale: .95, w: 600 },
  { name: 'Courier Prime', group: 'Mono', scale: .9, w: 700 },
  { name: 'IBM Plex Mono', group: 'Mono', scale: .88, w: 600 },
  { name: 'JetBrains Mono', group: 'Mono', spec: 'JetBrains+Mono:ital,wght@0,400;0,600;1,400', scale: .88, w: 600 },
  { name: 'Space Mono', group: 'Mono', spec: 'Space+Mono:ital,wght@0,400;0,700;1,400', scale: .88, w: 700 },
  { name: 'Fraunces', group: 'Display', w: 500 },
  { name: 'Cormorant Garamond', group: 'Display', scale: 1.15, w: 600 },
  { name: 'Playfair Display', group: 'Display', spec: 'Playfair+Display:ital,wght@0,400;0,600;1,400', w: 600 },
  { name: 'DM Serif Display', group: 'Display', spec: 'DM+Serif+Display:ital@0;1', w: 400 },
  { name: 'Instrument Serif', group: 'Display', spec: 'Instrument+Serif:ital@0;1', scale: 1.1, w: 400 },
  { name: 'Special Elite', group: 'Display', scale: .9, w: 400 },
  { name: 'Caveat', group: 'Handwritten', spec: 'Caveat:wght@400;600', scale: 1.3, w: 600 },
  { name: 'Patrick Hand', group: 'Handwritten', spec: 'Patrick+Hand', scale: 1.1, w: 400 },
];
const GENERIC = { Serif: 'Georgia, serif', Sans: 'system-ui, sans-serif', Mono: 'ui-monospace, Menlo, monospace', Display: 'Georgia, serif', Handwritten: 'cursive' };
const fontOf = (name) => FONTS.find((f) => f.name === name);
const stack = (f) => `'${f.name}', ${GENERIC[f.group]}`;
const TYPE_SLOTS = [
  ['prose', 'Writing', 'Your draft, synopses and notes'],
  ['display', 'Headings', 'Titles and headings'],
  ['ui', 'Interface', 'Buttons, labels and menus'],
];

// The CSS for the current skin's overrides. Kept in prefs so index.html can apply it before first paint.
function typeCss() {
  const t = prefs.type[prefs.skin] || {};
  const vars = {};
  const hrefs = [];
  const use = (name) => { const f = fontOf(name); if (f?.spec) hrefs.push(GF + f.spec); return f; };
  const prose = t.prose && use(t.prose);
  if (prose) Object.assign(vars, { '--serif': stack(prose), '--prose-scale': String(prose.scale || 1) });
  const display = t.display && use(t.display);
  if (display) Object.assign(vars, { '--display': stack(display), '--display-w': String(display.w) });
  const ui = t.ui && use(t.ui);
  if (ui) Object.assign(vars, { '--ui': stack(ui), '--ui-size': ui.group === 'Mono' ? '13px' : '14px' });
  if (t.leading) vars['--prose-leading'] = String(t.leading);
  return { vars, hrefs };
}

const TYPE_VARS = ['--serif', '--prose-scale', '--display', '--display-w', '--ui', '--ui-size', '--prose-leading'];
function applyType() {
  const css = typeCss();
  const st = document.documentElement.style;
  TYPE_VARS.forEach((v) => st.removeProperty(v));
  Object.entries(css.vars).forEach(([k, v]) => st.setProperty(k, v));
  css.hrefs.forEach(loadFontCss);
  if (JSON.stringify(css) !== JSON.stringify(prefs.typeCss)) { prefs.typeCss = css; savePrefs(); }
  requestAnimationFrame(refitTextareas);
}

function loadFontCss(href) {
  if ([...document.querySelectorAll('link[data-font]')].some((l) => l.href === href)) return;
  document.head.append(h('link', { rel: 'stylesheet', href, 'data-font': '' }));
}

function setType(slot, value) {
  const t = { ...(prefs.type[prefs.skin] || {}) };
  if (value == null || value === '') delete t[slot]; else t[slot] = value;
  prefs.type = { ...prefs.type, [prefs.skin]: t };
  savePrefs();
  applyType();
  document.querySelectorAll('.type-controls').forEach((c) => c.replaceWith(typeControls()));
}

function typeControls() {
  const k = skinOf();
  const t = prefs.type[k.id] || {};
  const groups = [...new Set(FONTS.map((f) => f.group))];
  const select = (slot) => h('select', { onchange: (e) => setType(slot, e.target.value) },
    h('option', { value: '' }, `${k.name} default (${k.type[slot]})`),
    groups.map((g) => h('optgroup', { label: g },
      FONTS.filter((f) => f.group === g).map((f) => h('option', { value: f.name, selected: t[slot] === f.name }, f.note ? `${f.name}, ${f.note}` : f.name)))));
  const leading = t.leading || k.type.leading;
  const custom = Object.keys(t).length > 0;
  return h('div', { class: 'type-controls', id: 'type' },
    h('div', { class: 'type-head' },
      h('span', { class: 'eyebrow' }, `Fonts for ${k.name}`),
      custom && h('button', { class: 'link', onclick: () => { prefs.type = { ...prefs.type, [k.id]: {} }; setType('prose', null); } }, 'Reset to skin defaults')),
    h('div', { class: 'type-sample' },
      h('strong', null, 'Chapter One: The Crossing'),
      h('p', null, 'The ferry left before the light did, which suited her. She stood at the rail, rehearsing the sentence she would say on Monday.')),
    h('div', { class: 'kv' },
      TYPE_SLOTS.map(([slot, label, hint]) => [h('label', { title: hint }, label), select(slot)]),
      h('label', null, 'Line spacing'),
      h('div', { class: 'range-row' },
        h('input', { type: 'range', min: 1.3, max: 2.3, step: 0.05, value: leading, oninput: (e) => {
          const v = +e.target.value;
          const t2 = { ...(prefs.type[k.id] || {}) };
          if (Math.abs(v - k.type.leading) < 0.001) delete t2.leading; else t2.leading = v;
          prefs.type = { ...prefs.type, [k.id]: t2 };
          savePrefs(); applyType();
          e.target.nextSibling.textContent = v.toFixed(2);
        } }),
        h('span', { class: 'range-val' }, leading.toFixed(2)))));
}

function toggleFocus() {
  state.focus = !state.focus;
  if (state.focus && state.view !== 'write') state.view = 'write';
  render();
  if (state.focus) toast('Focus mode. Press Esc to exit.');
}

// ---- global keys & lifecycle ------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (!state.project) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); state.handle ? save() : saveAs(); }
  if (mod && e.key === '.') { e.preventDefault(); toggleFocus(); }
  if (e.key === 'Escape' && state.focus) toggleFocus();
});

// Close popover menus on an outside click.
document.addEventListener('click', (e) => {
  document.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
});

window.addEventListener('beforeunload', (e) => {
  if (state.project && (state.dirty || state.saving)) {
    if (state.handle) save();
    e.preventDefault();
  }
});

// ---- offline ---------------------------------------------------------------------------
// sw.js caches the app so it opens with no connection. Once it's in place, fetch every
// skin's fonts in the background too, so switching skins offline still looks right.

const SKIN_FONTS = ['Inter', 'Literata', 'Geist', 'Courier Prime', 'Special Elite', 'IBM Plex Mono', 'EB Garamond', 'Cormorant Garamond', 'Fraunces', 'Lora', 'Nunito Sans'];
function warmFonts() {
  const faces = SKIN_FONTS.flatMap((f) => [`400 16px "${f}"`, `600 16px "${f}"`, `italic 400 16px "${f}"`]);
  Promise.allSettled(faces.map((f) => document.fonts.load(f)));
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(async (reg) => {
    const first = !navigator.serviceWorker.controller;
    await navigator.serviceWorker.ready;
    (window.requestIdleCallback || setTimeout)(warmFonts);
    if (first && reg.active) toast('Writers Blocks now works offline.');
  }).catch(() => { /* offline support is a bonus; the app works without it */ });
}

applyTheme();
refreshShelf();
render();
