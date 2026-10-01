import * as M from './model.js';
import * as S from './storage.js';
import * as AI from './ai.js';
import { dealPrompt } from './prompts.js';
import * as Sound from './sound.js';
import { confetti } from './celebrate.js';
import { openHelp, startTour } from './help.js';
import * as X from './export.js';
import * as E from './echoes.js';
import * as I from './import.js';

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
  view: 'desk', // desk | premise | notebook | map | outline | board | write | read | share | trash
  stage: null, // gather | plan | draft | revise | share (null on the Desk)
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
  drawer: null, // the Echoes / Polish / Story check panel, when open
  readScope: 'root', // what the Read view shows
  mapFolded: new Set(), // branches folded on the Map (independent of the outline)
  mapScroll: null,
  mapAnchor: null, // { id, dx, dy }: keep this card here on screen across a re-layout
  mapFocus: null, // a card to bring into view after the next render
  mapFitted: false,
  multi: new Set(), // blocks selected together in the outline (⌘/Ctrl- or Shift-click)
  anchor: null, // where a Shift-click range starts
};

// Per-device preferences only (never manuscript data).
const prefs = loadPrefs();
function loadPrefs() {
  const d = { skin: 'studio', type: {}, typeCss: null, theme: 'auto', aiEnabled: false, model: AI.MODELS[0].id, rememberKey: false, apiKey: '', directionOpen: true, fontSize: 19, notebookLayout: 'grid', zoom: 1, sprintMinutes: 10,
    toured: false, inspector: true, binder: true, spellcheck: true, readTitles: false, readGaps: true, mapDir: 'right', mapDetails: false, mapZoom: 1, exportPrefs: null, sounds: false, soundVolume: 0.5, typewriterScroll: false, fadeRest: false, celebrate: true };
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
  panel: 'M4 5h16v14H4zM15 5v14',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  collapse: 'M15 6l-6 6 6 6M19 6v12',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  print: 'M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-5a2 2 0 012-2h12a2 2 0 012 2v5a1 1 0 01-1 1h-2M7 14h10v6H7z',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6',
  pen: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  home: 'M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6',
  echo: 'M4 7h9M4 12h13M4 17h9M17 5l3 2-3 2M17 15l3 2-3 2',
  import: 'M12 4v11M8 11l4 4 4-4M5 19h14',
  read: 'M3 5h6a3 3 0 013 3v11a2 2 0 00-2-2H3zM21 5h-6a3 3 0 00-3 3v11a2 2 0 012-2h7z',
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
  if (!keepPlace) { state.view = 'desk'; state.stage = null; }
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
  state.view = 'desk';
  state.stage = null;
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
  if (kind === 'json') S.download(`${base}-copy-${new Date().toISOString().slice(0, 10)}.wblocks.json`, serialize());
}

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

// ---- export dialog -------------------------------------------------------------------------
// Pick what (manuscript, working draft, outline, snapshot) and from where, see it live,
// then save it in whichever format suits: print/PDF, Word, Markdown, text or a web page.

function openExport({ kind: startKind } = {}) {
  const saved = prefs.exportPrefs || {};
  let kind = startKind || saved.kind || 'manuscript';
  const optsFor = (k) => ({ ...X.defaults(k), ...(saved.opts?.[k] || {}) });
  let opts = optsFor(kind);
  let scope = state.selectedId !== 'root' && P().nodes[state.selectedId]?.children.length && saved.scope === state.selectedId ? state.selectedId : 'root';
  const remember = () => {
    prefs.exportPrefs = { kind, scope, opts: { ...(prefs.exportPrefs?.opts || {}), [kind]: opts } };
    savePrefs();
  };
  const accent = () => {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const m = /^#([0-9a-f]{6})$/i.exec(c);
    if (!m) return '#b4532a';
    const n = parseInt(m[1], 16);
    const light = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return light > 190 ? '#6b645a' : c; // a near-white accent (dark skins) would vanish on paper
  };
  const doc = () => X.build(P(), kind, opts, scope);

  const dlg = h('dialog', { class: 'export' });
  const frame = h('iframe', { class: 'export-frame', title: 'Preview', tabindex: -1 });
  const preview = h('div', { class: 'export-preview' }, frame);
  const kindsBox = h('div', { class: 'export-kinds', role: 'radiogroup', 'aria-label': 'What to export' });
  const optsBox = h('div', { class: 'export-opts' });
  let timer;
  const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { frame.srcdoc = X.toHTML(doc(), { accent: accent(), preview: true }); }, 80); };
  const fit = () => {
    const s = Math.min(1, (preview.clientWidth - 2) / 860);
    frame.style.transform = `scale(${s})`;
    frame.style.height = `${preview.clientHeight / s}px`;
  };
  const update = () => { refresh(); remember(); };

  const check = (key, label) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: !!opts[key], onchange: (e) => { opts[key] = e.target.checked; update(); } }), label);
  const seg = (key, choices) => h('div', { class: 'seg-control' }, choices.map(([v, l]) => h('button', {
    class: opts[key] === v ? 'active' : '',
    onclick: (e) => { opts[key] = v; e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.currentTarget)); update(); paintOpts(); },
  }, l)));
  const field = (label, control, hint) => h('div', { class: 'export-field' }, h('span', { class: 'field-label' }, label), control, hint && h('span', { class: 'muted small' }, hint));

  const paintKinds = () => kindsBox.replaceChildren(...Object.entries(X.KINDS).map(([id, k]) => h('button', {
    class: `export-kind ${id === kind ? 'on' : ''}`, role: 'radio', 'aria-checked': String(id === kind),
    onclick: () => { kind = id; opts = optsFor(id); paintKinds(); paintOpts(); update(); },
  }, h('strong', null, k.label), h('span', null, k.who))));

  const paintOpts = () => {
    const from = h('select', { onchange: (e) => { scope = e.target.value; update(); } },
      h('option', { value: 'root', selected: scope === 'root' }, 'The whole book'),
      M.flatten(P()).filter(({ node }) => node.children.length).map(({ node, depth }) =>
        h('option', { value: node.id, selected: scope === node.id }, `${'\u2003'.repeat(depth + 1)}${node.title}`)));
    const parts = [field('From', from)];
    if (kind === 'manuscript' || kind === 'draft') {
      parts.push(field('Layout', seg('layout', [['reading', 'Reading copy'], ['editing', 'For marking up']]),
        opts.layout === 'editing' ? 'Double-spaced, with wide margins for your pen.' : 'Comfortable to read, like a proof copy.'));
    }
    if (kind === 'manuscript') parts.push(check('titlePage', 'Title page'), check('chapterBreaks', 'Start each chapter on a new page'), check('sectionTitles', 'Show section titles (otherwise a break between scenes)'));
    if (kind === 'draft') parts.push(check('titlePage', 'Title page'), check('notes', 'Include your notes'), check('ideas', 'Include ideas attached to blocks'), check('placeholders', 'Lined space for blocks not written yet'));
    if (kind === 'outline' || kind === 'snapshot') parts.push(field('Detail', seg('depth', [['part', 'Parts'], ['chapter', 'Chapters'], ['all', 'Everything']])));
    if (kind === 'outline') parts.push(check('what', 'What happens'), check('why', 'Why it’s here'), check('stats', 'Status and word counts'));
    if (kind === 'snapshot') {
      const written = M.flatten(P()).map((x) => x.node).filter((n) => n.content);
      parts.push(check('stats', 'Progress and word counts'), field('Excerpt', h('select', { onchange: (e) => { opts.excerpt = e.target.value; update(); } },
        h('option', { value: 'auto', selected: opts.excerpt === 'auto' }, 'The longest piece you’ve written'),
        h('option', { value: 'none', selected: opts.excerpt === 'none' }, 'No excerpt'),
        written.map((n) => h('option', { value: n.id, selected: opts.excerpt === n.id }, n.title)))));
    }
    optsBox.replaceChildren(...parts);
  };

  const base = () => [P().nodes.root.title, scope !== 'root' && P().nodes[scope]?.title, X.KINDS[kind].label].filter(Boolean).map(S.slug).join('-');
  const exportAs = (f) => {
    const d = doc();
    if (f === 'print') return X.printHTML(X.toHTML(d, { accent: accent() }));
    if (f === 'html') S.download(`${base()}.html`, X.toHTML(d, { accent: accent() }), 'text/html');
    if (f === 'md') S.download(`${base()}.md`, X.toMarkdown(d), 'text/markdown');
    if (f === 'txt') S.download(`${base()}.txt`, X.toText(d), 'text/plain');
    if (f === 'docx') S.download(`${base()}.docx`, X.toDocx(d), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    toast(`Saved your ${X.KINDS[kind].label.toLowerCase()} to your downloads.`);
  };

  const close = () => dlg.close();
  dlg.append(
    h('div', { class: 'dlg-head' }, h('h2', null, 'Export'), h('button', { class: 'icon-btn', onclick: close, title: 'Close' }, icon('close'))),
    h('div', { class: 'export-body' },
      h('div', { class: 'export-side' }, kindsBox, optsBox),
      preview),
    h('div', { class: 'export-foot' },
      X.FORMATS.map((f) => h('button', { class: `btn ${f.id === 'print' ? 'primary' : ''}`, onclick: () => exportAs(f.id) },
        f.id === 'print' && icon('print'), f.label, f.ext && h('span', { class: 'ext' }, f.ext)))),
  );
  dlg.addEventListener('close', () => { removeEventListener('resize', fit); dlg.remove(); });
  addEventListener('resize', fit);
  document.body.append(dlg);
  paintKinds();
  paintOpts();
  dlg.showModal();
  fit();
  refresh();
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
  state.multi.clear();
  state.mapFolded.clear();
  state.mapScroll = null;
  state.mapFitted = false;
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
  state.drawer = null;
  render();
  paintDrawer();
  refreshShelf();
}

// ---- help & tour -----------------------------------------------------------------------

const showHelp = (section) => openHelp({ section, onTour: state.project ? runTour : null });

const TOUR = [
  { el: null, title: 'Welcome to Writers Blocks', text: 'Here’s a one-minute look around. Use the arrow keys or the buttons, and press Esc to skip. You can replay this from Help any time.' },
  { el: '.binder .tree', title: 'The outline', text: 'Your book as a tree of parts, chapters and sections. Click a block to open it, drag to rearrange (a line shows where it will land), or hover and click <b>+</b> to add inside. Right-click any block for more: rename, move, change its kind, delete.' },
  { el: '.stages', title: 'Five stages of writing a book', text: '<b>Gather</b> the idea, <b>Plan</b> its shape, <b>Draft</b> it, <b>Revise</b> it, <b>Share</b> it. Each stage shows only its own views, and you can move back and forth any time.' },
  { el: '.desk-btn', title: 'Your desk', text: 'Not sure what to do next? The Desk reads your project and suggests a next step, like the block to keep writing or the part that’s ready to read through. It suggests; you choose.' },
  { el: '.direction', title: 'Every block has a direction', text: '<b>What happens</b> and <b>Why it’s here</b> keep you pointed somewhere. Below them are the blocks just before and after, so you know what you’re writing toward.' },
  { el: '.toolbar', title: 'The writing toolbar', text: 'Formatting, and <b>Split here</b> to break a block in two. On the right are your writing aids: typing sounds, typewriter scrolling, and fade the rest.' },
  { el: '.inspector', title: 'This block, and ideas', text: 'Set a block’s status and word target, add tags and notes, and move it around. Further down, <b>Brainstorm</b> deals prompts, runs freewriting sprints, and collides ideas. Hide this panel with the panel button in the top bar when you want quiet.' },
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

// Adding a block keeps you where you are: it appears in the outline with its name
// ready to type, so you can sketch the big pieces without being pulled into one.
function addChild(parentId, type) {
  snapshot();
  const n = M.addNode(P(), parentId, type);
  changed();
  afterAdd(n);
  return n;
}

function addAfter(id) {
  snapshot();
  const n = M.addSiblingAfter(P(), id);
  changed();
  afterAdd(n);
  return n;
}

function afterAdd(n) {
  if (state.view === 'map') {
    // Keep the card you clicked + on still (the + buttons set it); otherwise its neighbour.
    if (!state.mapAnchor) {
      const parent = M.parentOf(P(), n.id);
      const i = parent.children.indexOf(n.id);
      anchorMap(parent.children[i - 1] || parent.id);
    }
    state.mapFocus = n.id;
  }
  render();
  if (state.view === 'map' && startMapRename(n.id, { fresh: true })) return;
  const card = state.view === 'board' && document.querySelector(`.card[data-id="${n.id}"] .card-title`);
  if (card) { card.focus(); card.select(); return; }
  if (!startRename(n.id, { fresh: true })) toast(`Added “${n.title}” to “${M.parentOf(P(), n.id).title}”.`, { undo: true });
}

function focusTitle() {
  requestAnimationFrame(() => {
    const t = document.querySelector('.title-input') || document.querySelector(`.card[data-id="${state.selectedId}"] .card-title`);
    t?.focus();
    t?.select?.();
  });
}

// The outermost of the given blocks (drop any that sit inside another), in book order.
function outermost(ids) {
  const set = new Set(ids);
  return M.flatten(P()).map((x) => x.node.id).filter((id) => set.has(id) && !M.ancestors(P(), id).some((a) => set.has(a.id)));
}

function removeNodes(ids) {
  const p = P();
  ids = outermost(ids.filter((id) => id !== 'root'));
  if (!ids.length) return;
  // Nothing is lost: deleted blocks go to the Trash, so no confirmation needed.
  const name = ids.length === 1 ? `“${p.nodes[ids[0]].title}”` : `${ids.length} blocks`;
  snapshot();
  const fallback = M.parentOf(p, ids[0])?.id || 'root';
  for (const id of ids) { M.trashNode(p, id); delete state.aiResults[id]; }
  state.multi.clear();
  if (!p.nodes[state.selectedId]) state.selectedId = p.nodes[fallback] ? fallback : 'root';
  changed();
  render();
  toast(`Moved ${name} to the Trash.`, { undo: true });
}
const removeNode = (id) => removeNodes([id]);

function setKind(ids, type) {
  snapshot();
  ids.forEach((id) => (P().nodes[id].type = type));
  changed();
  render();
  toast(`${ids.length > 1 ? `${ids.length} blocks are` : `“${P().nodes[ids[0]].title}” is`} now ${ids.length > 1 ? `${M.TYPES[type].label.toLowerCase()}s` : `a ${M.TYPES[type].label.toLowerCase()}`}.`, { undo: true });
}

function setStatus(ids, status) {
  const finished = ids.map((id) => P().nodes[id]).filter((n) => status === 'done' && n.status !== 'done');
  ids.forEach((id) => (P().nodes[id].status = status));
  changed();
  render();
  if (finished.length) blockDone(finished[finished.length - 1]);
}

// Take blocks out of the structure and into the notebook, for pieces that don't have a
// home yet. A part or chapter becomes a labelled cluster: a label note with its title,
// then one note per piece inside (title, synopsis, text). Undo puts it all back.
function moveToNotebook(ids) {
  const p = P();
  ids = outermost(ids.filter((id) => id !== 'root'));
  if (!ids.length) return;
  snapshot();
  const placed = p.notebook.filter((nt) => nt.x != null);
  let x = placed.length ? Math.max(...placed.map((nt) => nt.x)) + 300 : 60;
  let made = 0;
  for (const id of ids) {
    const top = p.nodes[id];
    let y = 60;
    const batch = [];
    const add = (text, extra) => { batch.push(M.makeNote(text, { source: 'outline', x, y, ...extra })); y += extra.color === 'label' ? 70 : 150; made += 1; };
    const textOf = (n) => [n.title, n.synopsis, M.stripHtml(n.content).trim()].filter(Boolean).join('\n\n');
    if (top.children.length) {
      add(top.title, { color: 'label' });
      const inner = [{ node: top }, ...M.flatten(p, id)].filter(({ node }) => node.synopsis.trim() || node.content || !node.children.length);
      for (const { node } of inner) add(node === top ? [top.synopsis, M.stripHtml(top.content).trim()].filter(Boolean).join('\n\n') || top.title : textOf(node), { color: node.children.length ? 'peach' : 'yellow' });
    } else {
      add(textOf(top), { color: 'yellow' });
    }
    // The grid lists newest first, so add them last-to-first: the label reads as the cluster's heading.
    p.notebook.push(...batch.reverse());
    M.deleteNode(p, id);
    delete state.aiResults[id];
    x += 300;
  }
  state.multi.clear();
  if (!p.nodes[state.selectedId]) state.selectedId = 'root';
  changed();
  if (state.view === 'map') {
    const wrap = document.querySelector('.map-wrap');
    if (wrap) state.mapScroll = { left: wrap.scrollLeft, top: wrap.scrollTop };
  }
  render();
  toast(`Moved to the notebook as ${made} note${made === 1 ? '' : 's'}. When it finds its place, use “Make it a block”.`, { undo: true });
}

function moveInto(ids, parentId) {
  const p = P();
  ids = outermost(ids);
  if (ids.some((id) => id === parentId || M.isDescendant(p, parentId, id))) return toast("A block can't be moved inside itself.");
  snapshot();
  for (const id of ids) M.moveNode(p, id, parentId, p.nodes[parentId].children.length);
  changed();
  render();
  toast(`Moved ${ids.length > 1 ? `${ids.length} blocks` : `“${p.nodes[ids[0]].title}”`} into ${parentId === 'root' ? 'the top level' : `“${p.nodes[parentId].title}”`}.`, { undo: true });
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

// zone: before | after (siblings), inside (last child), first (first child)
function performDrop(targetId, zone) {
  const d = state.drag;
  endDrag();
  if (!d) return;
  const p = P();
  let parentId, index;
  if (zone === 'first') {
    parentId = targetId;
    index = 0;
  } else if (zone === 'inside' || targetId === 'root') {
    parentId = targetId;
    index = p.nodes[targetId].children.length;
  } else {
    const parent = M.parentOf(p, targetId);
    parentId = parent.id;
    index = parent.children.indexOf(targetId) + (zone === 'after' ? 1 : 0);
  }
  if (d.kind === 'note') return placeNote(d.id, parentId, index);
  const ids = outermost(d.ids || [d.id]);
  if (ids.includes(targetId) && zone !== 'inside' && zone !== 'first') return; // dropped on itself
  if (ids.some((id) => id === parentId || M.isDescendant(p, parentId, id))) return toast("A block can't be moved inside itself.");
  snapshot();
  for (const id of ids) {
    M.moveNode(p, id, parentId, index);
    index = p.nodes[parentId].children.indexOf(id) + 1; // the next one goes right after
  }
  changed();
  render();
  const where = parentId === 'root' ? 'the top level' : `“${p.nodes[parentId].title}”`;
  toast(`Moved ${ids.length > 1 ? `${ids.length} blocks` : `“${p.nodes[ids[0]].title}”`} to ${where}.`, { undo: true });
}

// getIds: which blocks a drag carries (the whole multi-selection, when dragging part of it)
function makeDraggable(el, kind, id, getIds) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    if (e.target.closest?.('input, textarea')) return;
    const ids = kind === 'node' ? (getIds ? getIds() : [id]) : [];
    state.drag = { kind, id, ids };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    if (kind === 'node') {
      const ghost = h('div', { class: 'drag-ghost' }, ids.length > 1 ? `${ids.length} blocks` : P().nodes[id].title);
      document.body.append(ghost);
      e.dataTransfer.setDragImage(ghost, 14, 16);
      setTimeout(() => ghost.remove());
    }
    requestAnimationFrame(() => state.drag && (ids.length ? ids : [id]).forEach((x) =>
      document.querySelectorAll(`.row[data-id="${x}"], .card[data-id="${x}"], .note[data-note="${x}"]`).forEach((r) => r.classList.add('dragging'))));
  });
  el.addEventListener('dragend', endDrag);
}

let expandTimer = null;
let expandId = null;
function endDrag() {
  state.drag = null;
  clearTimeout(expandTimer);
  expandId = null;
  clearDropMarks();
  document.querySelector('.drop-line')?.remove();
  document.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging'));
}
// The source row can be re-rendered away mid-drag (auto-expand), so also clean up here.
document.addEventListener('dragend', endDrag);

// ---- outline drop targeting: where exactly would this land? -------------------------------

function binderHit(e, tree) {
  const d = state.drag;
  if (!d) return null;
  const p = P();
  const ids = d.kind === 'node' ? d.ids : [];
  const inDrag = (id) => ids.some((x) => x === id || M.isDescendant(p, id, x));
  const row = e.target.closest?.('.row[data-id], .row.root');
  if (!row) {
    const rows = tree.querySelectorAll('.row[data-id]');
    const last = rows[rows.length - 1];
    const y = last ? last.getBoundingClientRect().bottom : tree.getBoundingClientRect().top + 30;
    return { targetId: 'root', zone: 'inside', y, depth: 0, parentId: 'root' };
  }
  if (row.classList.contains('root')) return { targetId: 'root', zone: 'first', y: row.getBoundingClientRect().bottom, depth: 0, parentId: 'root' };
  const id = row.dataset.id;
  const n = p.nodes[id];
  const depth = +row.dataset.depth;
  if (inDrag(id)) return null;
  const r = row.getBoundingClientRect();
  const f = (e.clientY - r.top) / r.height;
  if (f < 0.3) return { targetId: id, zone: 'before', y: r.top, depth, parentId: M.parentOf(p, id).id };
  if (f > 0.7) {
    if (n.children.length && !n.collapsed) return { targetId: id, zone: 'first', y: r.bottom, depth: depth + 1, parentId: id };
    // At the end of a branch, the pointer's left–right position picks the level:
    // drag left to drop after the chapter (or part) instead of after the section.
    const want = Math.floor((e.clientX - tree.getBoundingClientRect().left - 10) / 16);
    let cur = n;
    let curDepth = depth;
    while (curDepth > want) {
      const parent = M.parentOf(p, cur.id);
      if (!parent || parent.id === 'root' || parent.children[parent.children.length - 1] !== cur.id) break;
      cur = parent;
      curDepth -= 1;
    }
    return { targetId: cur.id, zone: 'after', y: r.bottom, depth: curDepth, parentId: M.parentOf(p, cur.id).id };
  }
  return { targetId: id, zone: 'inside', row, y: r.top + r.height / 2, depth, parentId: id };
}

function showDropLine(tree, hit) {
  clearDropMarks();
  let line = tree.querySelector('.drop-line');
  if (!hit) { line?.remove(); return; }
  if (!line) {
    line = h('div', { class: 'drop-line', 'aria-hidden': 'true' }, h('span', { class: 'drop-label' }));
    tree.append(line);
  }
  const p = P();
  const tr = tree.getBoundingClientRect();
  const inside = hit.zone === 'inside' && hit.row;
  line.classList.toggle('inside', !!inside);
  line.style.top = `${hit.y - tr.top + tree.scrollTop}px`;
  line.style.left = `${inside ? 0 : 10 + hit.depth * 16}px`;
  let label;
  if (inside) { hit.row.classList.add('drop-inside'); label = `Into ${p.nodes[hit.targetId].title}`; }
  else if (hit.parentId === 'root') label = hit.targetId === 'root' && hit.zone === 'inside' ? 'At the end' : 'Top level';
  else label = `In ${p.nodes[hit.parentId].title}`;
  line.querySelector('.drop-label').textContent = label;
}

// Hovering over a closed block while dragging opens it, so you can drop deeper.
function hoverExpand(hit) {
  const n = hit?.zone === 'inside' && P().nodes[hit.targetId];
  const want = n && n.collapsed && n.children.length ? n.id : null;
  if (expandId === want) return;
  clearTimeout(expandTimer);
  expandId = want;
  if (!want) return;
  expandTimer = setTimeout(() => {
    expandId = null;
    n.collapsed = false;
    changed();
    renderBinderOnly();
  }, 650);
}

function renderBinderOnly() {
  const old = document.querySelector('.binder');
  if (!old) return;
  const top = old.querySelector('.tree')?.scrollTop;
  const fresh = renderBinder();
  old.replaceWith(fresh);
  if (top != null) fresh.querySelector('.tree').scrollTop = top;
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
  syncStage();
  document.body.classList.toggle('focus', state.focus);
  document.body.classList.toggle('no-inspector', !prefs.inspector || state.view === 'desk');
  document.body.classList.toggle('no-binder', !prefs.binder);
  const scroll = document.querySelector('.main')?.scrollTop;
  const binderScroll = document.querySelector('.tree')?.scrollTop;
  app.replaceChildren(
    renderTopbar(),
    h('div', { class: 'workspace' }, renderBinder(), renderMain(), renderInspector()),
  );
  if (scroll != null && state.lastRenderKey === `${state.view}:${state.selectedId}`) document.querySelector('.main').scrollTop = scroll;
  if (binderScroll != null && document.querySelector('.tree')) document.querySelector('.tree').scrollTop = binderScroll;
  state.lastRenderKey = `${state.view}:${state.selectedId}`;
  renderStatus();
  paintDrawer();
  if (state.view === 'map') mapAfterMount();
}

function renderWelcome() {
  document.body.classList.remove('focus');
  // Two columns on wide screens (intro | shelf and vibe) so it all fits without scrolling.
  app.replaceChildren(
    h('div', { class: 'welcome' },
      h('div', { class: 'welcome-card' },
        h('div', { class: 'welcome-intro' },
          h('div', { class: 'logo-blocks', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
          h('h1', null, 'Writers Blocks'),
          h('p', { class: 'lede' }, 'A place to shape a long piece of writing: map its structure, give every part a direction, and rearrange freely as the book finds its form.'),
          h('div', { class: 'welcome-actions' },
            h('button', { class: 'btn primary', onclick: cmdNew }, 'Start a new project'),
            h('button', { class: 'btn', onclick: cmdOpen }, 'Open a project file…'),
            h('button', { class: 'btn', onclick: openImport }, 'Import a manuscript…'),
            h('button', { class: 'btn ghost', onclick: cmdSample }, 'Explore a sample'),
          ),
          h('p', { class: 'welcome-help' }, 'New here? ',
            h('button', { class: 'link', onclick: () => openHelp({ section: 'quickstart' }) }, 'How to start a project'),
            ' · ',
            h('button', { class: 'link', onclick: () => openHelp({ section: 'basics' }) }, 'Guide to every feature')),
          h('p', { class: 'fine' },
            S.canAutosave
              ? 'Your work is saved to a file on your computer that you choose, and it autosaves as you write. The shelf only remembers where your files are, never what’s in them.'
              : 'This browser can’t autosave to your disk, so use Save to download your project file, and Open it next time. (Chrome, Edge or Arc can autosave.) Nothing is kept in the browser.')),
        h('div', { class: 'welcome-side' },
          bookshelf(),
          h('div', { class: 'vibe' },
            h('span', { class: 'eyebrow' }, 'Pick a vibe'),
            skinPicker({ compact: true }))),
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
  if (!state.shelf.length) {
    return S.canAutosave ? h('div', { class: 'shelf-empty' }, h('b', null, 'Your shelf'), 'Projects you open or start will wait here, ready to pick up where you left off.') : null;
  }
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
            h('span', { class: 'cover-title' }, e.title || e.name),
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
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-row' },
      h('button', { class: 'brand', title: 'Your desk', onclick: goDesk }, h('div', { class: 'logo-blocks small', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))),
      fileMenu(),
      h('input', {
        class: 'book-title', value: root.title, 'aria-label': 'Book title',
        oninput: (e) => { root.title = e.target.value; changed(); document.querySelectorAll('[data-root-title]').forEach((x) => (x.textContent = root.title)); },
      }),
      h('div', { class: 'spacer' }),
      h('div', { id: 'status', class: 'status' }),
      h('div', { class: 'bar-cluster', role: 'group', 'aria-label': 'Layout' },
        h('button', {
          class: `icon-btn panel-btn ${prefs.binder ? 'on' : ''}`, 'aria-pressed': String(prefs.binder),
          title: `${prefs.binder ? 'Hide' : 'Show'} the outline (${MOD}⇧\\)`, onclick: toggleBinder,
        }, icon('sidebar')),
        h('button', {
          class: `icon-btn panel-btn ${prefs.inspector ? 'on' : ''}`, 'aria-pressed': String(prefs.inspector),
          title: `${prefs.inspector ? 'Hide' : 'Show'} the side panel (${MOD}\\)`, onclick: toggleInspector,
        }, icon('panel')),
        h('button', { class: 'icon-btn', title: `Focus mode (${MOD}.)`, onclick: toggleFocus }, icon('focus'))),
      h('div', { class: 'bar-cluster', role: 'group', 'aria-label': 'App' },
        lookMenu(),
        h('button', { class: 'icon-btn help-btn', title: 'Help & tour (?)', onclick: () => showHelp() }, icon('help')),
        h('button', { class: 'icon-btn', title: 'Settings', onclick: openSettings }, icon('gear')))),
    renderStageBar());
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
      item('Import a manuscript…', openImport),
      item('Export or print…', () => openExport(), `${MOD}E`),
      item('Download a backup copy', () => cmdExport('json')),
      item(`Trash${P().trash.length ? ` (${P().trash.length})` : ''}`, () => { state.view = 'trash'; render(); }),
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
    // Enough to know it's safe; the file's name is there on hover.
    const pending = state.dirty || state.saving;
    parts.push(h('span', { class: `saved ${pending ? 'pending' : ''}`, tabindex: 0, 'aria-label': pending ? 'Saving' : `Saved to ${state.fileName}` },
      pending ? 'Saving…' : [icon('check'), 'Saved'],
      h('span', { class: 'saved-file', role: 'tooltip' }, `Saving to ${state.fileName}`)));
  } else if (state.dirty) {
    parts.push(h('button', { class: 'btn small primary', onclick: saveAs }, S.canAutosave ? 'Save to file…' : 'Download to save'));
  } else if (state.fileName) {
    parts.push(h('span', { class: 'saved', tabindex: 0 }, icon('check'), 'Downloaded', h('span', { class: 'saved-file', role: 'tooltip' }, `Last downloaded as ${state.fileName}`)));
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
  if (!prefs.binder) {
    return h('button', { class: 'binder-tab', title: `Show the outline (${MOD}⇧\\)`, 'aria-label': 'Show the outline', onclick: toggleBinder },
      icon('sidebar'), h('span', null, 'Outline'));
  }
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
    onclick: () => { state.multi.clear(); state.selectedId = 'root'; goDesk(); },
  }, icon('book', 'type-icon'), h('span', { class: 'row-title', 'data-root-title': '' }, p.nodes.root.title));

  const tree = h('div', { class: 'tree', role: 'tree', 'aria-multiselectable': 'true' }, rootRow, rows,
    q && !rows.length && h('p', { class: 'empty small' }, 'Nothing matches.'),
    !q && h('button', { class: 'add-row', onclick: () => addChild('root', 'part') }, icon('plus'), 'Add part'));
  tree.addEventListener('dragover', (e) => {
    if (!state.drag) return;
    e.preventDefault();
    const r = tree.getBoundingClientRect();
    if (e.clientY < r.top + 36) tree.scrollTop -= 10;
    else if (e.clientY > r.bottom - 36) tree.scrollTop += 10;
    const hit = binderHit(e, tree);
    e.dataTransfer.dropEffect = hit ? 'move' : 'none';
    showDropLine(tree, hit);
    hoverExpand(hit);
  });
  tree.addEventListener('dragleave', (e) => { if (!tree.contains(e.relatedTarget)) showDropLine(tree, null); });
  tree.addEventListener('drop', (e) => {
    e.preventDefault();
    const hit = binderHit(e, tree);
    if (hit) performDrop(hit.targetId, hit.zone);
    else endDrag();
  });
  tree.addEventListener('keydown', treeKeys);

  return h('aside', { class: 'binder' },
    h('div', { class: 'binder-search' }, icon('search'),
      h('button', { class: 'icon-btn small binder-hide', title: `Hide the outline (${MOD}⇧\\)`, 'aria-label': 'Hide the outline', onclick: toggleBinder }, icon('collapse')),
      h('input', {
        type: 'search', placeholder: 'Find in book…', value: state.filter, 'aria-label': 'Find in book',
        oninput: (e) => { state.filter = e.target.value; const pos = e.target.selectionStart; render(); const i = document.querySelector('.binder-search input'); i.focus(); i.setSelectionRange(pos, pos); },
      })),
    tree,
    multiBar(),
    h('button', {
      class: `row notebook-link ${state.view === 'notebook' ? 'selected' : ''}`,
      onclick: () => { state.view = 'notebook'; render(); },
    }, icon('note', 'type-icon'), h('span', { class: 'row-title' }, 'Notebook'), h('span', { class: 'wc' }, p.notebook.length || '')),
    p.trash.length > 0 && h('button', {
      class: `row notebook-link trash-link ${state.view === 'trash' ? 'selected' : ''}`,
      onclick: () => { state.view = 'trash'; render(); },
    }, icon('trash', 'type-icon'), h('span', { class: 'row-title' }, 'Trash'), h('span', { class: 'wc' }, p.trash.length)),
  );
}

function binderRow(n, depth) {
  const hasKids = n.children.length > 0;
  const selected = n.id === state.selectedId && state.view !== 'notebook';
  const inMulti = state.multi.size > 1 && state.multi.has(n.id);
  const row = h('div', {
    class: `row type-${n.type} ${selected ? 'selected' : ''} ${inMulti ? 'multi' : ''}`,
    style: `--depth:${depth}`,
    'data-id': n.id,
    'data-depth': depth,
    role: 'treeitem',
    tabindex: selected ? 0 : -1,
    'aria-selected': String(selected || inMulti),
    'aria-expanded': hasKids ? String(!n.collapsed) : null,
    title: n.synopsis || n.title,
    onclick: (e) => rowClick(e, n.id),
    ondblclick: (e) => { if (!e.target.closest('button')) startRename(n.id); },
    oncontextmenu: (e) => { e.preventDefault(); openBlockMenu(n.id, { x: e.clientX, y: e.clientY }); },
  },
  h('button', {
    class: `caret ${hasKids ? '' : 'hidden'} ${n.collapsed ? '' : 'open'}`, 'aria-label': n.collapsed ? 'Expand' : 'Collapse',
    onclick: (e) => { e.stopPropagation(); n.collapsed = !n.collapsed; changed(); render(); },
  }, icon('chev')),
  h('span', { class: `dot status-${n.status}`, title: n.status }),
  h('span', { class: 'row-title' }, n.title),
  h('span', { class: 'wc', 'data-wc': n.id }, fmt(M.treeWords(P(), n.id))),
  h('span', { class: 'row-actions' },
    h('button', {
      class: 'row-btn', title: `Add ${M.TYPES[M.TYPES[n.type].child].label.toLowerCase()} inside`, tabindex: -1,
      onclick: (e) => { e.stopPropagation(); addChild(n.id); },
    }, icon('plus')),
    h('button', {
      class: 'row-btn', title: 'More: rename, move, change kind, delete…', tabindex: -1,
      onclick: (e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); openBlockMenu(n.id, { x: r.left, y: r.bottom + 4 }); },
    }, icon('more'))));
  makeDraggable(row, 'node', n.id, () => carried(n.id));
  return row;
}

// ---- outline selection, rename & keys ------------------------------------------------------

// The blocks an action on this row applies to: the multi-selection if it's part of it.
const carried = (id) => (state.multi.size > 1 && state.multi.has(id) ? outermost([...state.multi]) : [id]);

function rowClick(e, id) {
  if (e.target.closest('button, input')) return;
  if (e.metaKey || e.ctrlKey) {
    if (!state.multi.size && state.selectedId !== 'root') state.multi.add(state.selectedId);
    if (state.multi.has(id)) state.multi.delete(id); else state.multi.add(id);
    state.anchor = id;
    return paintMulti();
  }
  if (e.shiftKey) {
    const order = [...document.querySelectorAll('.tree .row[data-id]')].map((r) => r.dataset.id);
    const a = order.indexOf(state.anchor || state.selectedId);
    const b = order.indexOf(id);
    if (a >= 0 && b >= 0) {
      state.multi = new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1));
      return paintMulti();
    }
  }
  selectRow(id);
}

function selectRow(id) {
  state.multi.clear();
  state.anchor = id;
  // Views about one block or the structure stay put; pages that aren't (Desk, Premise,
  // Share, Notebook, Trash) open the block in Write.
  const stays = ['write', 'board', 'outline', 'map', 'read'].includes(state.view);
  if (id !== state.selectedId || !stays) select(id, stays ? state.view : 'write');
  else paintMulti();
  if (state.view === 'read') document.querySelector(`.read-block[data-id="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  document.querySelector(`.tree .row[data-id="${id}"]`)?.focus({ preventScroll: true });
}

function paintMulti() {
  const on = state.multi.size > 1;
  document.querySelectorAll('.tree .row[data-id]').forEach((r) => {
    const m = on && state.multi.has(r.dataset.id);
    r.classList.toggle('multi', m);
    r.setAttribute('aria-selected', String(m || r.classList.contains('selected')));
  });
  document.querySelector('.multi-bar')?.replaceWith(multiBar());
}

function multiBar() {
  if (state.multi.size < 2) return h('div', { class: 'multi-bar', hidden: true });
  const ids = outermost([...state.multi]);
  return h('div', { class: 'multi-bar' },
    h('span', null, `${state.multi.size} selected`),
    h('button', { class: 'link', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); contextMenu({ x: r.left, y: r.top }, blockMenuItems(ids), { above: true }); } }, 'Actions…'),
    h('button', { class: 'icon-btn small', title: 'Delete selected', onclick: () => removeNodes(ids) }, icon('trash')),
    h('button', { class: 'icon-btn small', title: 'Clear selection (Esc)', onclick: () => { state.multi.clear(); paintMulti(); } }, icon('close')));
}

// Make sure a block's row is visible in the outline (open its parents, clear a search).
function revealRow(id) {
  let changedAny = false;
  for (const a of M.ancestors(P(), id)) if (a.collapsed) { a.collapsed = false; changedAny = true; }
  if (state.filter) { state.filter = ''; changedAny = true; }
  if (changedAny) render();
  return document.querySelector(`.tree .row[data-id="${id}"]`);
}

// Rename in place in the outline. Returns false if the outline isn't showing.
function startRename(id, { fresh = false } = {}) {
  const row = revealRow(id);
  if (!row || !row.offsetParent) return false;
  const n = P().nodes[id];
  const span = row.querySelector('.row-title');
  const input = h('input', { class: 'row-rename', value: n.title, 'aria-label': `Name this ${M.TYPES[n.type].label.toLowerCase()}`, spellcheck: false });
  span.replaceWith(input);
  row.draggable = false;
  row.classList.add('renaming');
  if (fresh) row.classList.add('just-added');
  row.scrollIntoView({ block: 'nearest' });
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (commit && v && v !== n.title) { n.title = v; changed(); }
    render();
    document.querySelector(`.tree .row[data-id="${id}"]`)?.focus({ preventScroll: true });
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());
  return true;
}

function treeKeys(e) {
  if (e.target.closest('input')) return;
  const row = e.target.closest('.row[data-id]');
  if (!row) return;
  const id = row.dataset.id;
  const n = P().nodes[id];
  const rows = [...e.currentTarget.querySelectorAll('.row[data-id]')];
  const i = rows.indexOf(row);
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeNodes(carried(id)); }
  else if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); startRename(id); }
  else if (e.key === 'Escape' && state.multi.size) { state.multi.clear(); paintMulti(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    if (e.shiftKey) {
      if (!state.multi.size) state.multi.add(id);
      state.multi.add(next.dataset.id);
      paintMulti();
      next.focus();
    } else selectRow(next.dataset.id);
  } else if ((e.key === 'ArrowRight' && n.collapsed) || (e.key === 'ArrowLeft' && !n.collapsed && n.children.length)) {
    e.preventDefault();
    n.collapsed = e.key === 'ArrowLeft';
    changed();
    render();
    document.querySelector(`.tree .row[data-id="${id}"]`)?.focus();
  } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
    e.preventDefault();
    const r = row.getBoundingClientRect();
    openBlockMenu(id, { x: r.left + 30, y: r.bottom });
  }
}

// ---- context menus -------------------------------------------------------------------------

function openBlockMenu(id, at) {
  if (!(state.multi.size > 1 && state.multi.has(id))) { state.multi.clear(); paintMulti(); }
  const ids = carried(id);
  const rows = ids.map((x) => document.querySelector(`.tree .row[data-id="${x}"]`)).filter(Boolean);
  rows.forEach((r) => r.classList.add('ctx-target'));
  contextMenu(at, blockMenuItems(ids), { onClose: () => rows.forEach((r) => r.classList.remove('ctx-target')) });
}

function blockMenuItems(ids) {
  const p = P();
  const nodes = ids.map((id) => p.nodes[id]).filter(Boolean);
  const one = nodes.length === 1 ? nodes[0] : null;
  const label = (t) => M.TYPES[t].label.toLowerCase();
  const items = [];
  if (one) {
    items.push({ label: 'Open', run: () => { state.multi.clear(); select(one.id, 'write'); } });
    if (one.children.length) items.push({ label: 'Open as board', run: () => select(one.id, 'board') });
    items.push({ label: 'Rename', hint: 'F2', run: () => (state.view === 'map' ? startMapRename(one.id) : startRename(one.id)) || focusTitle() });
    items.push('sep',
      { label: `Add ${label(M.TYPES[one.type].child)} inside`, icon: 'plus', run: () => addChild(one.id) },
      { label: `Add ${label(one.type)} after`, run: () => addAfter(one.id) },
      'sep');
  } else {
    items.push({ label: `${nodes.length} blocks selected`, disabled: true }, 'sep');
  }
  items.push({
    label: 'Turn into',
    sub: ['part', 'chapter', 'section'].map((t) => ({ label: M.TYPES[t].label, checked: nodes.every((n) => n.type === t), run: () => setKind(ids, t) })),
  });
  items.push({ label: 'Move to', sub: () => moveTargets(ids) });
  items.push({ label: 'Move to notebook', icon: 'note', run: () => moveToNotebook(ids) });
  items.push({
    label: 'Status',
    sub: M.STATUSES.map((st) => ({ label: st.label, dot: st.id, checked: nodes.every((n) => n.status === st.id), run: () => setStatus(ids, st.id) })),
  });
  if (one) {
    const parent = M.parentOf(p, one.id);
    const i = parent.children.indexOf(one.id);
    items.push('sep',
      { label: 'Move up', disabled: i === 0, run: () => shift(one.id, -1) },
      { label: 'Move down', disabled: i === parent.children.length - 1, run: () => shift(one.id, 1) },
      { label: 'Merge with next', disabled: i === parent.children.length - 1, run: () => mergeNext(one.id) });
  }
  items.push('sep', { label: nodes.length > 1 ? `Delete ${nodes.length} blocks` : 'Delete', icon: 'trash', danger: true, hint: '⌫', run: () => removeNodes(ids) });
  return items;
}

function moveTargets(ids) {
  const p = P();
  const moving = (id) => ids.some((x) => x === id || M.isDescendant(p, id, x));
  const already = (pid) => ids.every((x) => M.parentOf(p, x)?.id === pid);
  return [
    { label: 'Top level of the book', icon: 'book', disabled: already('root'), run: () => moveInto(ids, 'root') },
    'sep',
    ...M.flatten(p).filter(({ node }) => !moving(node.id)).map(({ node, depth }) => ({
      label: node.title, indent: depth, dot: node.status, disabled: already(node.id), run: () => moveInto(ids, node.id),
    })),
  ];
}

// A small menu at a point. items: { label, run, sub (items or a function), icon, dot,
// checked, hint, danger, disabled, indent } or 'sep'. Arrow keys, Enter and Esc work.
let closeCtx = null;
function contextMenu(at, items, { onClose, above = false } = {}) {
  closeCtx?.();
  const menus = [];
  const close = () => {
    menus.forEach((m) => m.remove());
    menus.length = 0;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keys, true);
    removeEventListener('blur', close);
    removeEventListener('resize', close);
    closeCtx = null;
    onClose?.();
  };
  const outside = (e) => { if (!menus.some((m) => m.contains(e.target))) close(); };
  const build = (list, x, y, level, opener = null) => {
    while (menus.length > level) menus.pop().remove();
    const m = h('div', { class: 'ctx', role: 'menu' });
    m.opener = opener;
    for (const it of typeof list === 'function' ? list() : list) {
      if (it === 'sep') { m.append(h('div', { class: 'ctx-sep', role: 'separator' })); continue; }
      const b = h('button', {
        class: `ctx-item ${it.danger ? 'danger' : ''}`, role: 'menuitem', disabled: !!it.disabled,
        style: it.indent ? `padding-left:${10 + it.indent * 14}px` : null, 'aria-haspopup': it.sub ? 'menu' : null,
      },
      h('span', { class: 'ctx-icon' }, it.checked ? icon('check') : it.icon ? icon(it.icon) : it.dot ? h('span', { class: `dot status-${it.dot}` }) : ''),
      h('span', { class: 'ctx-label' }, it.label),
      it.hint && h('kbd', null, it.hint),
      it.sub && h('span', { class: 'ctx-arrow' }, icon('chev')));
      if (it.sub) {
        b.openSub = () => { const r = b.getBoundingClientRect(); build(it.sub, r.right - 2, r.top - 5, level + 1, b); };
        b.addEventListener('pointerenter', b.openSub);
        b.addEventListener('click', () => { b.openSub(); menus[level + 1]?.querySelector('.ctx-item:not(:disabled)')?.focus(); });
      } else {
        b.addEventListener('pointerenter', () => { while (menus.length > level + 1) menus.pop().remove(); if (!b.disabled) b.focus({ preventScroll: true }); });
        b.addEventListener('click', () => { close(); it.run?.(); });
      }
      m.append(b);
    }
    document.body.append(m);
    const w = m.offsetWidth;
    const ht = m.offsetHeight;
    let left = x;
    let top = above && level === 0 ? y - ht - 4 : y;
    if (left + w > innerWidth - 8) left = opener ? opener.getBoundingClientRect().left - w + 2 : innerWidth - w - 8;
    if (top + ht > innerHeight - 8) top = innerHeight - ht - 8;
    m.style.left = `${Math.max(8, left)}px`;
    m.style.top = `${Math.max(8, top)}px`;
    menus.push(m);
    return m;
  };
  const keys = (e) => {
    const level = Math.max(0, menus.findIndex((m) => m.contains(document.activeElement)));
    const m = menus[level];
    const list = [...m.querySelectorAll('.ctx-item:not(:disabled)')];
    const i = list.indexOf(document.activeElement);
    const back = () => { const sub = menus.pop(); sub.remove(); sub.opener?.focus(); };
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (level > 0) back(); else close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'ArrowRight' && document.activeElement?.openSub) { e.preventDefault(); document.activeElement.openSub(); menus[level + 1]?.querySelector('.ctx-item:not(:disabled)')?.focus(); }
    else if (e.key === 'ArrowLeft' && level > 0) { e.preventDefault(); back(); }
    else if (e.key === 'Tab') e.preventDefault();
  };
  build(items, at.x, at.y, 0);
  menus[0].querySelector('.ctx-item:not(:disabled)')?.focus({ preventScroll: true });
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  document.addEventListener('keydown', keys, true);
  addEventListener('blur', close);
  addEventListener('resize', close);
  closeCtx = close;
}

// ---- render: main views ------------------------------------------------------------

function renderMain() {
  const view = { desk: renderDesk, premise: renderBookOverview, share: renderShare, write: renderWrite, board: renderBoard, outline: renderOutline, map: renderMap, read: renderRead, notebook: renderNotebook, trash: renderTrash }[state.view] || renderWrite;
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
    class: 'editor prose', contentEditable: 'true', spellcheck: prefs.spellcheck,
    'data-placeholder': kids.length ? `Optional opening text for this ${typeLabel}…` : 'Start writing…',
    'aria-label': 'Draft text',
  });
  ed.innerHTML = n.content;
  ed.classList.toggle('fade-rest', prefs.fadeRest);
  const countTimer = { echo: null };
  let wcTimer;
  ed.addEventListener('input', () => {
    n.content = /^(\s|<br>|<p><br><\/p>|<div><br><\/div>)*$/.test(ed.innerHTML) ? '' : ed.innerHTML;
    state.session?.touched.add(n.id);
    n.editedAt = new Date().toISOString();
    changed();
    if (state.drawer?.kind === 'echoes') { clearTimeout(countTimer.echo); countTimer.echo = setTimeout(paintDrawer, 700); }
    followCaret(ed);
    clearTimeout(wcTimer);
    wcTimer = setTimeout(refreshCounts, 250);
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
      }),
      h('button', { class: 'icon-btn title-more', title: 'More: move, change kind, delete…', 'aria-label': 'More actions', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); contextMenu({ x: r.left, y: r.bottom + 4 }, blockMenuItems([n.id])); } }, icon('more'))),
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
      h('button', { class: 'tb wide', title: 'Echoes: repeated words, phrases and crutch words in this block', onmousedown: (e) => e.preventDefault(), onclick: openEchoes }, icon('echo'), 'Echoes'),
      aiReady() && h('button', { class: 'tb wide', title: 'Polish: select a passage for other ways to say it, or click with nothing selected to line-edit this block (AI)', onmousedown: (e) => e.preventDefault(), onclick: runPolish }, icon('spark'), 'Polish'),
      h('div', { class: 'spacer' }),
      writingToggles(ed),
      h('span', { class: 'tb-sep' }),
      h('span', { class: 'tb-count' }, h('span', { 'data-wc': n.id }, fmt(M.treeWords(P(), n.id))), n.targetWords ? ` / ${fmt(n.targetWords)}` : '', ' words'),
    ),
    ed,
    h('div', { class: 'write-foot' },
      h('button', { class: 'btn small', onclick: () => addAfter(n.id) }, icon('plus'), `New ${typeLabel} after this`),
      (() => { const up = nextInOrder(n.id); return up && h('button', { class: 'btn small primary next-up', onclick: () => select(up.id, 'write'), title: 'The next block in the book' }, `Next up: ${up.title} →`); })()),
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
    h('div', { class: 'overview-actions' },
      h('button', { class: 'btn small', onclick: () => openExport({ kind: 'snapshot' }) }, icon('share'), 'Share your progress…'),
      h('button', { class: 'btn small ghost', onclick: () => openExport() }, icon('print'), 'Export…')),
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
      h('span', { class: 'wc' }, `${fmt(words)}${k.targetWords ? ` / ${fmt(k.targetWords)}` : ''} w`),
      h('button', { class: 'icon-btn small card-more', title: 'More: move, change kind, delete…', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); contextMenu({ x: r.left, y: r.bottom + 4 }, blockMenuItems([k.id])); } }, icon('more'))),
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
  card.addEventListener('contextmenu', (e) => {
    if (e.target.closest('input, textarea')) return;
    e.preventDefault();
    contextMenu({ x: e.clientX, y: e.clientY }, blockMenuItems([k.id]));
  });
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
        const row = h('div', {
          class: `o-row type-${n.type} ${n.id === state.selectedId ? 'selected' : ''}`, role: 'row', 'data-id': n.id,
          oncontextmenu: (e) => { if (e.target.closest('textarea')) return; e.preventDefault(); contextMenu({ x: e.clientX, y: e.clientY }, blockMenuItems([n.id])); },
        },
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
  outline: '↩ From the outline',
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
  document.querySelectorAll('.o-row.selected, .card.selected, .map-card.selected').forEach((r) => r.classList.remove('selected'));
  document.querySelectorAll(`.o-row[data-id="${state.selectedId}"], .card[data-id="${state.selectedId}"], .map-card[data-id="${state.selectedId}"]`).forEach((r) => r.classList.add('selected'));
  document.querySelectorAll('.binder .row.selected').forEach((r) => r.classList.remove('selected'));
  document.querySelector(`.binder .row[data-id="${state.selectedId}"]`)?.classList.add('selected');
}

function renderInspector() {
  const n = sel();
  const isRoot = n.id === 'root';
  const block = !isRoot && inspectorBlock(n);
  const ideas = !isRoot && renderIdeasFor(n);
  if (state.view === 'notebook') return h('aside', { class: 'inspector' }, renderSpark(n));
  const byStage = {
    gather: [renderSpark(n), ideas, renderAssistant(n)],
    plan: [block, renderAssistant(n), ideas],
    draft: [block, ideas, renderSpark(n), renderAssistant(n)],
    revise: [revisePanel(n), renderAssistant(n), block],
    share: [sharePanel(), block],
  }[state.stage] || [block, renderSpark(n), renderAssistant(n)];
  return h('aside', { class: 'inspector' }, byStage);
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
  const list = ({
    gather: [],
    plan: isRoot ? ['structure', 'breakdown'] : ['direction', 'breakdown', ...(hasText ? ['summarize'] : [])],
    draft: isRoot ? [] : ['direction', 'flow'],
    revise: isRoot ? ['structure'] : ['flow', ...(hasText ? ['summarize'] : [])],
  })[state.stage] ?? (isRoot ? ['structure', 'breakdown'] : ['direction', 'flow', ...(hasText ? ['summarize'] : []), 'breakdown']);
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
    (isRoot || n.children.length > 0) && state.stage !== 'revise' && state.stage !== 'gather' && h('button', {
      class: 'ai-btn', onclick: () => runStoryCheck(n.id),
      title: 'Reads the writing for plot holes, continuity slips, dropped threads and motivation gaps',
    }, h('strong', null, 'Story check'), h('span', null, `Plot holes, continuity, dropped threads${isRoot ? ' across the book' : ` in this ${M.TYPES[n.type].label.toLowerCase()}`}.`)),
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
      h('input', { type: 'checkbox', checked: prefs.spellcheck, onchange: (e) => { prefs.spellcheck = e.target.checked; savePrefs(); document.querySelectorAll('.editor').forEach((x) => (x.spellcheck = prefs.spellcheck)); } }),
      h('span', null, h('strong', null, 'Check spelling as I type'), h('br'), h('span', { class: 'muted small' }, 'Uses your browser’s own dictionary: misspellings get a red underline, and right-click shows suggestions. Works offline.'))),
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
document.fonts?.addEventListener('loadingdone', () => { if (state.project && state.view === 'map' && !document.querySelector('.map-rename')) renderMapOnly(); });

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

function toggleBinder() {
  prefs.binder = !prefs.binder;
  savePrefs();
  render();
  if (!prefs.binder) toast(`Outline tucked away. Click the tab on the left (or ${MOD}⇧\\) to bring it back.`);
}

function toggleInspector() {
  prefs.inspector = !prefs.inspector;
  savePrefs();
  render();
  toast(prefs.inspector ? 'Side panel is back.' : `Side panel hidden. ${MOD}\\ or the panel button brings it back.`);
}

function toggleFocus() {
  state.focus = !state.focus;
  if (state.focus && state.view !== 'write') state.view = 'write';
  render();
  if (state.focus) toast('Focus mode. Press Esc to exit.');
}

// ---- the drawer: Echoes, Polish and Story check results ---------------------------------
// A panel that slides in from the right and stays put while you write. It lives outside
// #app, so re-rendering the workspace doesn't close it.

// Keeps the same data object, so async work that started it can fill it in later.
function openDrawer(kind, data = {}) {
  state.drawer = Object.assign(data, { kind });
  paintDrawer();
}

function closeDrawer() {
  state.drawer = null;
  E.clearHighlight();
  paintDrawer();
}

function paintDrawer() {
  let el = document.getElementById('drawer');
  const d = state.drawer;
  if (!d || !state.project) { el?.remove(); if (!d) E.clearHighlight(); return; }
  if (!el) {
    el = h('aside', { id: 'drawer', class: 'drawer', 'aria-label': 'Tools' });
    document.body.append(el);
  }
  const titles = { echoes: 'Echoes', polish: '✦ Polish', story: '✦ Story check' };
  const body = { echoes: echoesBody, polish: polishBody, story: storyBody }[d.kind]();
  el.replaceChildren(
    h('div', { class: 'drawer-head' }, h('h3', null, titles[d.kind]), h('button', { class: 'icon-btn small', title: 'Close', onclick: closeDrawer }, icon('close'))),
    h('div', { class: 'drawer-body' }, body));
}

// ---- Echoes ------------------------------------------------------------------------------

// What Echoes looks at: the open draft, or everything in the Read view.
function echoesRoots() {
  if (state.view === 'read') return [...document.querySelectorAll('.read .read-prose')];
  if (state.view === 'write') return [...document.querySelectorAll('.write .editor')];
  return [];
}

function openEchoes() {
  if (state.drawer?.kind === 'echoes') return closeDrawer();
  openDrawer('echoes', { term: null, idx: 0 });
}

function echoesBody() {
  const d = state.drawer;
  const roots = echoesRoots();
  if (!roots.length) return h('p', { class: 'muted' }, 'Open a block in Write, or the Read view, to check its wording.');
  const a = E.analyze(roots.map((r) => r.innerText).join('\n\n'));
  if (a.total < 30) return h('p', { class: 'muted' }, 'Write a little more first. Echoes needs a few paragraphs to find patterns.');
  const pick = (term) => { d.term = d.term === term ? null : term; d.idx = 0; d.scroll = true; paintDrawer(); };
  const item = (term, label) => h('button', { class: `echo-item ${d.term === term ? 'on' : ''}`, onclick: () => pick(term) },
    h('span', { class: 'echo-term' }, term), h('span', { class: 'echo-count' }, label));
  const group = (title, hint, items) => items.length > 0 && h('section', { class: 'echo-group' },
    h('div', { class: 'eyebrow' }, title), h('p', { class: 'muted small' }, hint), h('div', { class: 'echo-list' }, items));

  let stepper = null;
  if (d.term) {
    const ranges = E.highlight(roots, d.term);
    if (ranges.length) {
      d.idx = ((d.idx % ranges.length) + ranges.length) % ranges.length;
      E.highlightCurrent(ranges[d.idx]);
      if (d.scroll) { ranges[d.idx].startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' }); d.scroll = false; }
      const step = (n) => { d.idx += n; d.scroll = true; paintDrawer(); };
      stepper = h('div', { class: 'echo-stepper' },
        h('span', null, h('b', null, `“${d.term}”`), ` ${d.idx + 1} of ${ranges.length}`),
        h('button', { class: 'icon-btn small', title: 'Previous', onclick: () => step(-1) }, icon('arrowL')),
        h('button', { class: 'icon-btn small flip', title: 'Next', onclick: () => step(1) }, icon('arrowL')));
    }
  } else E.clearHighlight();

  return [
    h('p', { class: 'muted small' }, `${fmt(a.total)} words ${state.view === 'read' ? 'in this reading' : 'in this block'}. Click anything to see where it appears.`),
    !E.canHighlight && h('p', { class: 'muted small' }, 'This browser can’t highlight words in place, so you’ll see counts only.'),
    stepper,
    group('Close repeats', 'The same word again within a few lines.', a.echoes.map((x) => item(x.word, `×${x.count}`))),
    group('Words you lean on', 'Used often for a piece this long.', a.overused.map((x) => item(x.word, `×${x.count}`))),
    group('Repeated phrases', 'The same few words, more than once.', a.repeated.map((x) => item(x.phrase, `×${x.count}`))),
    group('Crutch words', 'Often filler, or telling instead of showing. Keep the ones that earn their place.', a.crutch.map((x) => item(x.word, `×${x.count}`))),
    !a.echoes.length && !a.overused.length && !a.repeated.length && !a.crutch.length && h('p', { class: 'muted' }, 'Nothing stands out. Nice and varied.'),
    h('button', { class: 'btn small ghost', onclick: () => paintDrawer() }, 'Check again'),
  ];
}

// ---- Polish (AI line editing) ------------------------------------------------------------

function runPolish() {
  const n = sel();
  const ed = document.querySelector('.write .editor');
  if (!ed) return;
  const s = getSelection();
  const picked = s.rangeCount && ed.contains(s.anchorNode) ? s.toString().trim() : '';
  if (picked && picked.split(/\s+/).length >= 2) {
    const r = s.getRangeAt(0);
    const before = document.createRange();
    before.setStart(ed, 0);
    before.setEnd(r.startContainer, r.startOffset);
    const after = document.createRange();
    after.setStart(r.endContainer, r.endOffset);
    after.setEnd(ed, ed.childNodes.length);
    const d = { mode: 'alt', nodeId: n.id, original: picked, range: r.cloneRange(), loading: true };
    openDrawer('polish', d);
    AI.polish.alternatives.run(aiSettings(), P(), n.id, picked, before.toString().slice(-500), after.toString().slice(0, 500))
      .then((data) => { d.data = data; }, (e) => { d.error = aiError(e); })
      .finally(() => { d.loading = false; if (state.drawer === d) paintDrawer(); });
    return;
  }
  if (!M.stripHtml(n.content).trim()) return toast('Write something first, or select a passage, then Polish.');
  const d = { mode: 'edit', nodeId: n.id, loading: true, applied: new Set() };
  openDrawer('polish', d);
  AI.polish.lineEdit.run(aiSettings(), P(), n.id)
    .then((data) => { d.data = data; }, (e) => { d.error = aiError(e); })
    .finally(() => { d.loading = false; if (state.drawer === d) paintDrawer(); });
}

// Replace text in the open draft the way typing would, so ⌘Z undoes it.
function replaceInDraft(nodeId, original, replacement, range) {
  const ed = document.querySelector('.write .editor');
  if (!ed || state.selectedId !== nodeId) return 'away';
  const r = range && ed.contains(range.startContainer) && range.toString().trim() === original ? range : E.findRanges(ed, original)[0];
  if (!r) return 'missing';
  ed.focus();
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
  document.execCommand('insertText', false, replacement);
  return 'ok';
}

function polishBody() {
  const d = state.drawer;
  const node = P().nodes[d.nodeId];
  if (d.loading) return h('div', { class: 'ai-result loading' }, h('span', { class: 'spinner' }), d.mode === 'alt' ? 'Trying other ways to say it…' : 'Reading closely…');
  if (d.error) return h('p', { class: 'error-text' }, d.error);
  if (!node) return h('p', { class: 'muted' }, 'That block is gone.');
  const away = state.selectedId !== d.nodeId || state.view !== 'write';
  const goBack = away && h('button', { class: 'btn small', onclick: () => select(d.nodeId, 'write') }, `Back to “${node.title}” to apply`);
  const result = (status) => {
    if (status === 'ok') return true;
    toast(status === 'missing' ? 'Couldn’t find that exact text any more. It may have changed since.' : 'Open the block to apply this.', { error: status === 'missing' });
    return false;
  };
  if (d.mode === 'alt') {
    return [
      h('div', { class: 'eyebrow' }, 'Your words'),
      h('blockquote', { class: 'polish-orig' }, d.original),
      goBack,
      h('div', { class: 'eyebrow' }, 'Other ways to say it'),
      d.data.options.map((o) => h('div', { class: 'polish-card' },
        h('p', { class: 'polish-text' }, o.text),
        h('p', { class: 'muted small' }, o.note),
        h('button', {
          class: 'btn small', disabled: away,
          onclick: () => { if (result(replaceInDraft(d.nodeId, d.original, o.text, d.range))) { toast(`Replaced. ${MOD}Z to undo.`); closeDrawer(); } },
        }, 'Use this'))),
      h('p', { class: 'muted small' }, 'Select a different passage and Polish again for more.'),
    ];
  }
  return [
    h('p', { class: 'polish-overall' }, d.data.overall),
    goBack,
    !d.data.edits.length && h('p', { class: 'muted' }, 'Nothing to change. It reads well.'),
    d.data.edits.map((x, i) => {
      const done = d.applied.has(i);
      const show = () => {
        const ed = document.querySelector('.write .editor');
        const r = ed && E.findRanges(ed, x.original)[0];
        if (!r) return toast('Couldn’t find that passage in the open draft.');
        E.highlightCurrent(r);
        r.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      return h('div', { class: `polish-card edit ${done ? 'done' : ''}` },
        h('span', { class: 'chip' }, x.kind),
        h('p', { class: 'polish-del' }, x.original),
        h('p', { class: 'polish-ins' }, x.suggestion),
        h('p', { class: 'muted small' }, x.why),
        h('div', { class: 'polish-actions' },
          h('button', { class: 'btn small', disabled: done || away, onclick: () => { if (result(replaceInDraft(d.nodeId, x.original, x.suggestion))) { d.applied.add(i); paintDrawer(); } } }, done ? 'Applied' : 'Apply'),
          !done && h('button', { class: 'btn small ghost', disabled: away, onclick: show }, 'Show me')));
    }),
  ];
}

// ---- Story check (AI) ------------------------------------------------------------------

async function runStoryCheck(scopeId = 'root') {
  if (!aiReady()) return openSettings();
  const words = AI.storyCheckSize(P(), scopeId);
  const what = scopeId === 'root' ? 'your whole manuscript' : `“${P().nodes[scopeId].title}”`;
  if (words > 1500 && !confirm(`Story check reads ${what}: about ${fmt(words)} words, sent to Anthropic with your API key. Longer books take a few minutes and cost more. Go ahead?`)) return;
  const d = { scopeId, loading: true };
  openDrawer('story', d);
  try { d.data = await AI.storyCheck.run(aiSettings(), P(), scopeId); } catch (e) { d.error = aiError(e); }
  d.loading = false;
  if (state.drawer === d) paintDrawer();
}

function storyBody() {
  const d = state.drawer;
  if (d.loading) return h('div', { class: 'ai-result loading' }, h('span', { class: 'spinner' }), 'Reading the whole thing. This can take a few minutes for a long book…');
  if (d.error) return h('p', { class: 'error-text' }, d.error);
  const { summary, issues } = d.data;
  const order = { high: 0, medium: 1, low: 2 };
  const linkTo = (id) => P().nodes[id] && h('button', { class: 'chip link-chip', onclick: () => select(id, 'write') }, P().nodes[id].title);
  return [
    h('p', { class: 'polish-overall' }, summary),
    !issues.length && h('p', { class: 'muted' }, 'No problems found in the story’s logic.'),
    [...issues].sort((a, b) => order[a.severity] - order[b.severity]).map((x) => h('div', { class: `story-card sev-${x.severity}` },
      h('div', { class: 'story-top' }, h('span', { class: 'sev' }, x.severity), h('span', { class: 'chip' }, x.kind)),
      h('strong', null, x.title),
      h('p', null, x.detail),
      h('p', { class: 'muted small' }, h('b', null, 'Try: '), x.suggestion),
      h('div', { class: 'story-links' }, x.ids.map(linkTo),
        h('button', { class: 'link', onclick: (e) => { newNote(`Story check · ${x.title}\n${x.detail}\nTry: ${x.suggestion}`, { nodeId: x.ids[0] || null }); e.currentTarget.replaceWith(h('span', { class: 'muted small' }, 'Saved to notebook')); } }, 'Save to notebook')))),
    h('p', { class: 'muted small' }, 'The assistant can miss things and occasionally flag something that’s fine. Trust your own read.'),
  ];
}

// ---- Read view ------------------------------------------------------------------------------
// The book as continuous pages. Double-click any paragraph to edit it right there.

function readScope() {
  return P().nodes[state.readScope] ? state.readScope : 'root';
}

function renderRead() {
  const p = P();
  const scope = readScope();
  const list = scope === 'root' ? M.flatten(p) : [{ node: p.nodes[scope], depth: 0 }, ...M.flatten(p, scope, 1)];
  const words = M.treeWords(p, scope);
  const toggle = (key, label) => h('label', { class: 'check small' },
    h('input', { type: 'checkbox', checked: prefs[key], onchange: (e) => { prefs[key] = e.target.checked; savePrefs(); render(); } }), label);
  const blocks = [];
  let prevScene = false;
  for (const { node } of list) {
    const lvl = { part: 1, chapter: 2 }[node.type] || 3;
    const showTitle = lvl < 3 || prefs.readTitles;
    const head = showTitle ? h(`h${lvl + 1}`, { class: `read-h read-h${lvl}` }, node.title)
      : prevScene && node.content ? h('p', { class: 'read-break', 'aria-hidden': 'true' }, '✱ ✱ ✱') : null;
    if (lvl < 3) prevScene = false;
    const empty = !node.content && !node.children.length;
    const body = node.content ? h('div', { class: 'read-prose prose', html: node.content })
      : empty && prefs.readGaps ? h('p', { class: 'read-gap' }, `${node.title}: not written yet`, node.synopsis && ` · ${node.synopsis}`) : null;
    if (node.content && lvl === 3) prevScene = true;
    if (!head && !body) continue;
    blocks.push(h('section', { class: `read-block read-l${lvl}`, 'data-id': node.id }, head, body,
      h('button', { class: 'read-edit icon-btn small', title: `Edit “${node.title}”`, onclick: () => select(node.id, 'write') }, icon('pen'))));
  }
  const page = h('div', { class: 'read-page' }, blocks.length ? blocks : h('p', { class: 'empty' }, 'Nothing written here yet.'));
  page.addEventListener('dblclick', (e) => {
    const prose = e.target.closest('.read-prose');
    if (!prose) return;
    let el = e.target;
    while (el && el.parentElement !== prose) el = el.parentElement;
    jumpTo(prose.closest('.read-block').dataset.id, [...prose.children].indexOf(el));
  });
  const scopes = M.flatten(p).filter(({ node }) => node.children.length);
  return h('div', { class: 'read' },
    h('div', { class: 'read-bar' },
      h('select', { class: 'read-scope', 'aria-label': 'What to read', onchange: (e) => { state.readScope = e.target.value; render(); } },
        h('option', { value: 'root', selected: scope === 'root' }, `The whole book`),
        scopes.map(({ node, depth }) => h('option', { value: node.id, selected: scope === node.id }, `${' '.repeat(depth + 1)}${node.title}`))),
      h('span', { class: 'muted small' }, `${fmt(words)} words · about ${Math.max(1, Math.round(words / 250))} min`),
      h('span', { class: 'spacer' }),
      toggle('readTitles', 'Section titles'),
      toggle('readGaps', 'Show gaps'),
      h('button', { class: 'btn small ghost', onclick: openEchoes }, icon('echo'), 'Echoes'),
      aiReady() && h('button', { class: 'btn small ghost', onclick: () => runStoryCheck(scope) }, icon('spark'), 'Story check')),
    h('div', { class: 'read-title' },
      h('div', { class: 'eyebrow' }, scope === 'root' ? (p.author || 'Read-through') : M.TYPES[p.nodes[scope].type].label),
      h('h1', null, p.nodes[scope].title)),
    page,
    h('p', { class: 'read-hint muted small' }, 'Double-click any paragraph to edit it right there.'));
}

// Open a block in Write with the cursor at the start of one of its paragraphs.
function jumpTo(id, index) {
  select(id, 'write');
  requestAnimationFrame(() => {
    const ed = document.querySelector('.write .editor');
    const el = ed?.children[Math.max(0, index)];
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    ed.focus();
    const r = document.createRange();
    r.setStart(el, 0);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    const all = document.createRange();
    all.selectNodeContents(el);
    E.highlightCurrent(all);
    setTimeout(() => { if (!state.drawer) E.clearHighlight(); }, 1400);
  });
}

// ---- Trash view ----------------------------------------------------------------------------

function renderTrash() {
  const p = P();
  const restore = (e) => {
    snapshot();
    const n = M.restoreTrash(p, e.id);
    changed();
    render();
    const parent = n && M.parentOf(p, n.id);
    toast(`Restored “${n.title}”${parent && parent.id !== 'root' ? ` to “${parent.title}”` : ''}.`, { undo: true });
  };
  const forget = (e) => {
    if (!confirm(`Delete “${e.nodes[e.rootId].title}” for good? This can’t be undone once you leave this page.`)) return;
    snapshot();
    p.trash = p.trash.filter((x) => x !== e);
    changed();
    render();
    toast('Deleted for good.', { undo: true });
  };
  return h('div', { class: 'board trash' },
    h('div', { class: 'board-head' },
      h('h2', null, 'Trash'),
      h('p', { class: 'muted' }, 'Deleted parts, chapters and sections wait here until you restore them or delete them for good. They’re kept in your project file, and they don’t count toward word totals or exports.'),
      p.trash.length > 0 && h('button', { class: 'btn small danger-ghost', onclick: () => {
        if (!confirm(`Empty the Trash? ${p.trash.length} item${p.trash.length > 1 ? 's' : ''} will be deleted for good.`)) return;
        snapshot(); p.trash = []; changed(); render(); toast('Trash emptied.', { undo: true });
      } }, icon('trash'), 'Empty trash')),
    !p.trash.length && h('p', { class: 'empty' }, 'Nothing in the Trash.'),
    h('div', { class: 'trash-list' }, p.trash.map((e) => {
      const n = e.nodes[e.rootId];
      const inside = Object.keys(e.nodes).length - 1;
      const was = p.nodes[e.parentId];
      const preview = M.stripHtml(n.content).trim().split(/\s+/).slice(0, 40).join(' ');
      return h('article', { class: 'trash-item' },
        h('div', { class: 'trash-top' },
          h('span', { class: `type-badge type-${n.type}` }, M.TYPES[n.type].label),
          h('strong', null, n.title)),
        h('p', { class: 'muted small' }, [
          `Deleted ${ago(Date.parse(e.deletedAt))}`,
          `${fmt(M.trashWords(e))} words`,
          inside && `${inside} block${inside > 1 ? 's' : ''} inside`,
          was ? (e.parentId === 'root' ? 'was at the top level' : `was in “${was.title}”`) : 'its old place is gone',
        ].filter(Boolean).join(' · ')),
        n.synopsis && h('p', { class: 'trash-syn' }, n.synopsis),
        preview && h('p', { class: 'trash-preview' }, `${preview}…`),
        h('div', { class: 'trash-actions' },
          h('button', { class: 'btn small primary', onclick: () => restore(e) }, 'Restore'),
          h('button', { class: 'btn small danger-ghost', onclick: () => forget(e) }, 'Delete for good')));
    })));
}

// ---- Import --------------------------------------------------------------------------------

function openImport() {
  const dlg = h('dialog', { class: 'settings import' });
  let parsed = null;  // { items, title, name }
  let tree = null;
  const file = h('input', { type: 'file', accept: I.ACCEPT, hidden: true });
  const body = h('div', { class: 'import-body' });
  const status = h('p', { class: 'muted small import-status' });
  let busy = false;
  const close = () => { if (!busy) dlg.close(); };

  const pickStep = () => {
    const drop = h('button', { class: 'import-drop', onclick: () => file.click() },
      icon('import'), h('strong', null, 'Choose a file, or drop it here'),
      h('span', { class: 'muted small' }, 'Word (.docx), Markdown (.md), plain text (.txt) or a web page (.html)'));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) read(e.dataTransfer.files[0]); });
    body.replaceChildren(
      h('p', null, 'Bring in a manuscript you’ve already started. Chapter headings become chapters, and scene breaks (like *** or #) become sections. Your file isn’t changed.'),
      drop);
  };

  const read = async (f) => {
    status.textContent = 'Reading…';
    try {
      const r = await I.readFile(f);
      parsed = { ...r, name: f.name.replace(/\.[^.]+$/, '') };
      tree = I.shape(r.items);
      reviewStep();
    } catch (e) {
      status.textContent = '';
      toast(e.message, { error: true });
    }
  };
  file.addEventListener('change', () => file.files[0] && read(file.files[0]));

  const reviewStep = () => {
    const st = I.stats(tree);
    const flat = !st.parts && st.chapters <= 1;
    const titleIn = h('input', { value: parsed.title || parsed.name, 'aria-label': 'Title' });
    const aiStructure = h('input', { type: 'checkbox', checked: flat });
    const aiDescribe = h('input', { type: 'checkbox', checked: true });
    const where = h('select', null,
      h('option', { value: 'new' }, 'As a new project'),
      state.project && h('option', { value: 'append' }, `Added to the end of “${P().nodes.root.title}”`));
    const outlineRows = [];
    const walk = (list, depth) => list.forEach((b) => {
      if (outlineRows.length < 80) outlineRows.push(h('li', { style: `--depth:${depth}` }, h('span', { class: `dot type-${b.type}` }), b.title, h('span', { class: 'muted small' }, ` ${fmt(I.stats([{ ...b, children: [] }]).words)} w`)));
      walk(b.children, depth + 1);
    });
    walk(tree, 0);
    body.replaceChildren(
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Title'), titleIn),
      h('p', { class: 'import-stats' }, [st.parts && `${st.parts} parts`, `${st.chapters} chapter${st.chapters === 1 ? '' : 's'}`, st.sections && `${st.sections} sections`, `${fmt(st.words)} words`].filter(Boolean).join(' · ')),
      flat && h('p', { class: 'muted small' }, 'No chapter headings were found, so it all landed in one chapter.' + (aiReady() ? ' The assistant can find the chapters and scenes for you.' : ' Turn on the assistant in Settings and it can find the chapters and scenes for you.')),
      h('ul', { class: 'import-outline' }, outlineRows),
      aiReady()
        ? h('div', { class: 'import-ai' },
          h('div', { class: 'eyebrow' }, icon('spark'), ' With the assistant'),
          h('label', { class: 'check' }, aiStructure, h('span', null, 'Find the chapters and scenes', h('br'), h('span', { class: 'muted small' }, 'Reads the opening of every paragraph and decides where chapters and scenes begin.'))),
          h('label', { class: 'check' }, aiDescribe, h('span', null, 'Write a title, synopsis and purpose for each block', h('br'), h('span', { class: 'muted small' }, 'So the outline and board are useful straight away.'))),
          h('p', { class: 'muted small' }, `Sends the text (about ${fmt(st.words)} words) to Anthropic with your API key. A long book takes a few minutes.`))
        : h('p', { class: 'muted small' }, 'Tip: with the assistant on (Settings), it can also find chapters and write a synopsis for every block as it imports.'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Bring it in'), where),
      h('div', { class: 'dlg-foot' },
        h('button', { class: 'btn ghost', onclick: pickStep }, 'Choose another file'),
        h('button', { class: 'btn primary', onclick: () => go({ title: titleIn.value.trim() || parsed.name, structure: aiReady() && aiStructure.checked, describe: aiReady() && aiDescribe.checked, where: where.value }) }, 'Import')));
  };

  const go = async (o) => {
    if (o.where === 'new' && state.project && !confirmDiscard()) return;
    busy = true;
    body.querySelectorAll('button, input, select').forEach((x) => (x.disabled = true));
    try {
      if (o.structure) {
        status.textContent = 'Finding the chapters and scenes…';
        const paras = I.paragraphsOf(parsed.items);
        const { blocks } = await AI.importAI.structure.run(aiSettings(), paras.map((x) => x.text));
        tree = I.shapeFromStarts(paras, blocks);
      }
      if (o.describe) {
        const all = [];
        const walk = (list) => list.forEach((b) => { all.push(b); walk(b.children); });
        walk(tree);
        const BATCH = 12;
        for (let i = 0; i < all.length; i += BATCH) {
          status.textContent = `Writing synopses: ${Math.min(i + BATCH, all.length)} of ${all.length} blocks…`;
          const batch = all.slice(i, i + BATCH).map((b, k) => ({ ref: `B${i + k + 1}`, type: b.type, title: b.title, text: I.plainOf(b.html) || b.children.map((c) => c.title).join(', ') }));
          const { blocks } = await AI.importAI.describe.run(aiSettings(), o.title, batch);
          for (const r of blocks) {
            const b = all[+r.ref.replace(/\D/g, '') - 1];
            if (b) Object.assign(b, { title: r.title || b.title, synopsis: r.synopsis, purpose: r.purpose });
          }
        }
      }
    } catch (e) {
      busy = false;
      status.textContent = '';
      toast(`The assistant step didn’t finish: ${aiError(e)} Importing without it.`, { error: true });
    }
    busy = false;
    status.textContent = '';
    finishImport(tree, o);
    dlg.close();
  };

  dlg.append(
    h('div', { class: 'dlg-head' }, h('h2', null, 'Import a manuscript'), h('button', { class: 'icon-btn', onclick: close, title: 'Close' }, icon('close'))),
    body, status, file);
  dlg.addEventListener('cancel', (e) => { if (busy) e.preventDefault(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  pickStep();
  dlg.showModal();
}

function addTree(p, parentId, list) {
  for (const b of list) {
    const n = M.addNode(p, parentId, b.type, null, b.title);
    n.content = b.html || '';
    n.synopsis = b.synopsis || '';
    n.purpose = b.purpose || '';
    n.status = n.content ? 'drafting' : 'idea';
    addTree(p, n.id, b.children);
  }
}

async function finishImport(tree, o) {
  const words = I.stats(tree).words;
  if (o.where === 'append' && state.project) {
    snapshot();
    addTree(P(), 'root', tree);
    changed();
    render();
    toast(`Imported ${fmt(words)} words into “${P().nodes.root.title}”.`, { undo: true });
    return;
  }
  const p = M.newProject(o.title, 'blank');
  p.nodes = { root: p.nodes.root };
  p.nodes.root.children = [];
  p.targetWords = Math.max(p.targetWords, Math.ceil((words * 1.1) / 10000) * 10000);
  addTree(p, 'root', tree);
  state.project = p;
  state.handle = null;
  state.fileName = null;
  state.fileStamp = null;
  state.conflict = false;
  state.undo = [];
  state.aiResults = {};
  state.selectedId = 'root';
  state.view = 'outline';
  state.dirty = true;
  startSession();
  render();
  toast(`Imported ${fmt(words)} words. Have a look at the outline.`);
  if (S.canAutosave) await saveAs();
}

// ---- Map view --------------------------------------------------------------------------------
// The whole book as a branching tree: the book, then parts, chapters and sections,
// everything open. Click to select, double-click to write, drag a card onto another to
// move it, right-click for the block menu. Branches fold on the map only (the outline
// keeps its own open/closed state).

const MAP = { W: 230, GAP_DEPTH: 64, GAP_SIBLING: 14 };

// Cards grow to fit all their text, so the tree is laid out with each card's real height.
// Siblings stack along one axis; a parent centres on its children, and if it's taller
// than they are, they shift to make room so nothing overlaps.
function mapLayout(p, heightOf) {
  const vertical = prefs.mapDir === 'down';
  const { W, GAP_SIBLING: G, GAP_DEPTH: D } = MAP;
  const items = [];
  const edges = [];
  const ext = (it) => (vertical ? W : it.h);
  let cursor = 0;
  const place = (id, depth) => {
    const n = p.nodes[id];
    const kids = state.mapFolded.has(id) ? [] : n.children.filter((c) => p.nodes[c]);
    const item = { id, depth, h: heightOf(id) };
    const at = items.length;
    items.push(item);
    if (!kids.length) {
      item.cross = cursor;
      cursor += ext(item) + G;
      return item;
    }
    const start = cursor;
    const placed = kids.map((c) => place(c, depth + 1));
    const first = placed[0];
    const last = placed[placed.length - 1];
    item.cross = ((first.cross + ext(first) / 2) + (last.cross + ext(last) / 2)) / 2 - ext(item) / 2;
    if (item.cross < start) {
      const shift = start - item.cross;
      for (let i = at + 1; i < items.length; i++) items[i].cross += shift;
      item.cross = start;
      cursor += shift;
    }
    cursor = Math.max(cursor, item.cross + ext(item) + G);
    placed.forEach((k) => edges.push([item, k]));
    return item;
  };
  place('root', 0);
  const maxDepth = Math.max(...items.map((i) => i.depth));
  // Top-down: each row is as tall as its tallest card.
  const rowH = Array.from({ length: maxDepth + 1 }, (_, d) => Math.max(...items.filter((i) => i.depth === d).map((i) => i.h)));
  const rowY = rowH.map((_, d) => rowH.slice(0, d).reduce((sum, hh) => sum + hh + D, 0));
  for (const it of items) {
    it.x = vertical ? it.cross : it.depth * (W + D);
    it.y = vertical ? rowY[it.depth] : it.cross;
  }
  const span = Math.max(cursor - G, vertical ? W : 0);
  const width = vertical ? span : maxDepth * (W + D) + W;
  const height = vertical ? rowY[maxDepth] + rowH[maxDepth] : span;
  return { items, edges, width, height, vertical };
}

function mapEdgePath(a, b, L) {
  if (L.vertical) {
    const x1 = a.x + MAP.W / 2; const y1 = a.y + a.h;
    const x2 = b.x + MAP.W / 2; const y2 = b.y;
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  }
  const x1 = a.x + MAP.W; const y1 = a.y + a.h / 2;
  const x2 = b.x; const y2 = b.y + b.h / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

// Build a card's content once, then measure its natural height off-screen.
function measureMapCards(cards) {
  const box = h('div', { class: `map-measure ${prefs.mapDir === 'down' ? 'down' : ''}`, 'aria-hidden': 'true' });
  document.body.append(box);
  const heights = {};
  for (const [id, card] of cards) { card.style.width = `${MAP.W}px`; box.append(card); }
  for (const [id, card] of cards) heights[id] = Math.ceil(card.offsetHeight);
  box.remove();
  return heights;
}

function renderMap() {
  const p = P();
  const visible = [];
  const walk = (id) => { visible.push(id); if (!state.mapFolded.has(id)) p.nodes[id].children.forEach((c) => p.nodes[c] && walk(c)); };
  walk('root');
  const built = new Map(visible.map((id) => [id, mapCard(id)]));
  const heights = measureMapCards(built);
  const L = mapLayout(p, (id) => heights[id]);
  state.mapSize = { width: L.width, height: L.height };
  const z = prefs.mapZoom;
  const pad = 40;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'map-edges');
  svg.setAttribute('width', L.width);
  svg.setAttribute('height', L.height);
  for (const [a, b] of L.edges) {
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', mapEdgePath(a, b, L));
    path.setAttribute('class', `edge to-${p.nodes[b.id].type}`);
    svg.append(path);
  }

  const cards = L.items.map((it) => {
    const card = built.get(it.id);
    Object.assign(card.dataset, { x: it.x, y: it.y, h: it.h });
    card.style.cssText = `left:${it.x}px;top:${it.y}px;width:${MAP.W}px;height:${it.h}px`;
    return card;
  });
  return mapShell(p, L, svg, cards, z, pad);
}

function mapCard(id) {
  const p = P();
  const it = { id };
  const descendants = (nid) => M.flatten(p, nid).length;
  const n = p.nodes[it.id];
  const isRoot = it.id === 'root';
  const words = M.treeWords(p, it.id);
  const target = isRoot ? p.targetWords : n.targetWords;
  const folded = state.mapFolded.has(it.id);
  const card = h('div', {
    class: `map-card type-${isRoot ? 'book' : n.type} ${it.id === state.selectedId ? 'selected' : ''}`,
    'data-id': it.id,
    tabindex: 0,
    onclick: (e) => { if (!e.target.closest('button')) mapSelect(it.id); },
    // Double-click the title to rename it here; anywhere else on the card opens it.
    ondblclick: (e) => {
      if (e.target.closest('button, input')) return;
      if (e.target.closest('.map-title')) startMapRename(it.id);
      else select(it.id, 'write');
    },
    onkeydown: (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter') select(it.id, 'write');
      if (e.key === 'F2') { e.preventDefault(); startMapRename(it.id); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isRoot) { e.preventDefault(); mapDelete(it.id); }
    },
    oncontextmenu: (e) => { if (isRoot) return; e.preventDefault(); mapSelect(it.id); contextMenu({ x: e.clientX, y: e.clientY }, blockMenuItems([it.id])); },
  },
  h('div', { class: 'map-card-top' },
    isRoot ? icon('book', 'map-book') : h('span', { class: `dot status-${n.status}`, title: n.status }),
    h('span', { class: 'map-title', title: 'Double-click to rename' }, n.title),
    h('button', { class: 'map-rename-btn', tabindex: -1, title: 'Rename (F2)', 'aria-label': `Rename ${n.title}`, onclick: (e) => { e.stopPropagation(); startMapRename(it.id); } }, icon('pen')),
    !isRoot && h('button', { class: 'map-rename-btn map-del-btn', tabindex: -1, title: 'Move to the Trash (Delete)', 'aria-label': `Delete ${n.title}`, onclick: (e) => { e.stopPropagation(); mapDelete(it.id); } }, icon('close'))),
  prefs.mapDetails && h('p', { class: 'map-syn' }, n.synopsis || h('span', { class: 'muted' }, 'No synopsis yet.')),
  h('div', { class: 'map-meta' },
    h('span', { class: 'map-wc' }, `${fmt(words)} w`),
    target ? h('span', { class: 'map-bar', title: `${fmt(words)} of ${fmt(target)} words` }, h('i', { style: `width:${Math.min(100, (words / target) * 100)}%` })) : h('span', { class: 'spacer' }),
    n.children.length > 0 && h('button', {
      class: `map-fold ${folded ? 'folded' : ''}`,
      title: folded ? `Show the ${descendants(it.id)} blocks inside` : 'Fold this branch (on the map only)',
      onclick: (e) => { e.stopPropagation(); anchorMap(it.id); if (folded) state.mapFolded.delete(it.id); else state.mapFolded.add(it.id); render(); },
    }, folded ? `+${descendants(it.id)}` : '−')));
  // + on the outer edge adds inside; + in the gap after adds a sibling. Neither moves you.
  const childType = M.TYPES[isRoot ? 'book' : n.type].child;
  card.append(h('button', {
    class: 'map-add map-add-child', tabindex: -1, title: `Add a ${childType} inside`,
    onclick: (e) => { e.stopPropagation(); anchorMap(it.id); state.mapFolded.delete(it.id); addChild(it.id, childType); },
  }, icon('plus')));
  if (!isRoot) {
    card.append(h('button', {
      class: 'map-add map-add-after', tabindex: -1, title: `Add a ${n.type} after this`,
      onclick: (e) => { e.stopPropagation(); anchorMap(it.id); addAfter(it.id); },
    }, icon('plus')));
    makeDraggable(card, 'node', it.id, () => carried(it.id));
  }
  return card;
}

function mapShell(p, L, svg, cards, z, pad) {
  const canvas = h('div', { class: 'map-canvas', style: `width:${L.width}px;height:${L.height}px;transform:scale(${z});left:${pad}px;top:${pad}px` }, svg, cards);
  canvas.addEventListener('dragover', (e) => {
    if (!state.drag) return;
    e.preventDefault();
    const w = canvas.closest('.map-wrap');
    const r = w?.getBoundingClientRect();
    if (r) {
      if (e.clientY < r.top + 40) w.scrollTop -= 12; else if (e.clientY > r.bottom - 40) w.scrollTop += 12;
      if (e.clientX < r.left + 40) w.scrollLeft -= 12; else if (e.clientX > r.right - 40) w.scrollLeft += 12;
    }
    const hit = mapHit(e, L);
    e.dataTransfer.dropEffect = hit ? 'move' : 'none';
    showMapDrop(canvas, hit, L);
    mapHoverUnfold(hit);
  });
  canvas.addEventListener('dragleave', (e) => { if (!canvas.contains(e.relatedTarget)) showMapDrop(canvas, null, L); });
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const hit = mapHit(e, L);
    if (hit) performDrop(hit.targetId, hit.zone);
    else endDrag();
  });
  const sizer = h('div', { class: 'map-sizer', style: `width:${L.width * z + pad * 2}px;height:${L.height * z + pad * 2}px` }, canvas);
  const wrap = h('div', { class: `map-wrap ${L.vertical ? 'down' : ''}` }, sizer);

  // Drag empty space to pan; ⌘/Ctrl + scroll to zoom.
  wrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.map-card')) return;
    const sx = e.clientX; const sy = e.clientY; const sl = wrap.scrollLeft; const st = wrap.scrollTop;
    wrap.classList.add('panning');
    const move = (ev) => { wrap.scrollLeft = sl - (ev.clientX - sx); wrap.scrollTop = st - (ev.clientY - sy); };
    const up = () => { wrap.classList.remove('panning'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
  wrap.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setMapZoom(prefs.mapZoom * (e.deltaY < 0 ? 1.1 : 0.9));
  }, { passive: false });
  wrap.addEventListener('scroll', () => { state.mapScroll = { left: wrap.scrollLeft, top: wrap.scrollTop }; });

  const seg = (key, choices) => h('div', { class: 'seg-control' }, choices.map(([v, l]) => h('button', {
    class: prefs[key] === v ? 'active' : '', onclick: () => { prefs[key] = v; savePrefs(); state.mapScroll = null; render(); },
  }, l)));
  const totalBlocks = M.flatten(p).length;
  return h('div', { class: 'map' },
    h('div', { class: 'map-bar-top' },
      h('div', null,
        h('h2', null, 'Map'),
        h('p', { class: 'muted small' }, `${totalBlocks} blocks · double-click a title to rename it, double-click a card to write, drag to move, right-click for more.`)),
      h('div', { class: 'map-controls' },
        seg('mapDir', [['right', 'Sideways'], ['down', 'Top-down']]),
        h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: prefs.mapDetails, onchange: (e) => { prefs.mapDetails = e.target.checked; savePrefs(); render(); } }), 'Synopses'),
        state.mapFolded.size > 0
          ? h('button', { class: 'btn small ghost', onclick: () => { state.mapFolded.clear(); render(); } }, 'Unfold all')
          : h('button', { class: 'btn small ghost', title: 'Fold every chapter so you see parts and chapters only', onclick: () => { M.flatten(p).forEach(({ node }) => { if (node.type === 'chapter' && node.children.length) state.mapFolded.add(node.id); }); render(); } }, 'Fold chapters'),
        h('div', { class: 'zoom' },
          h('button', { class: 'icon-btn small', title: 'Zoom out', onclick: () => setMapZoom(prefs.mapZoom / 1.2) }, '−'),
          h('button', { class: 'link', title: 'Actual size', onclick: () => setMapZoom(1) }, `${Math.round(z * 100)}%`),
          h('button', { class: 'icon-btn small', title: 'Zoom in', onclick: () => setMapZoom(prefs.mapZoom * 1.2) }, '+')),
        h('button', { class: 'btn small', title: 'Fit the whole map on screen', onclick: fitMap }, icon('focus'), 'Fit'))),
    wrap);
}

// Where would a drop land? Along the sibling axis: the first third of a card is "before",
// the last third "after", the middle "into". Nothing can go inside itself.
// Runs right after the map is put on the page (no waiting a frame, so it never flashes
// in the wrong place): restore the scroll, keep the anchored card where it was on screen,
// and bring a new card into view, gently and only as far as needed.
function mapAfterMount() {
  const wrap = document.querySelector('.map-wrap');
  if (!wrap) return;
  if (!state.mapScroll && !state.mapFitted) { state.mapFitted = true; fitMap(); return; }
  if (state.mapScroll) { wrap.scrollLeft = state.mapScroll.left; wrap.scrollTop = state.mapScroll.top; }
  const wr = wrap.getBoundingClientRect();
  const a = state.mapAnchor;
  state.mapAnchor = null;
  const ac = a && wrap.querySelector(`.map-card[data-id="${a.id}"]`);
  if (ac) {
    const cr = ac.getBoundingClientRect();
    wrap.scrollLeft += cr.left - wr.left - a.dx;
    wrap.scrollTop += cr.top - wr.top - a.dy;
  }
  const f = state.mapFocus;
  state.mapFocus = null;
  const fc = f && wrap.querySelector(`.map-card[data-id="${f}"]`);
  if (fc) {
    const cr = fc.getBoundingClientRect();
    const m = 48;
    const dx = cr.left < wr.left + m ? cr.left - wr.left - m : cr.right > wr.right - m ? cr.right - wr.right + m : 0;
    const dy = cr.top < wr.top + m ? cr.top - wr.top - m : cr.bottom > wr.bottom - m ? cr.bottom - wr.bottom + m : 0;
    if (dx || dy) wrap.scrollBy({ left: dx, top: dy, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  state.mapScroll = { left: wrap.scrollLeft, top: wrap.scrollTop };
}

function mapHit(e, L) {
  const d = state.drag;
  const card = e.target.closest?.('.map-card');
  if (!d || !card) return null;
  const p = P();
  const id = card.dataset.id;
  const ids = d.kind === 'node' ? d.ids : [];
  if (ids.some((x) => x === id || M.isDescendant(p, id, x))) return null;
  if (id === 'root') return { targetId: 'root', zone: 'inside', card };
  const r = card.getBoundingClientRect();
  const f = L.vertical ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
  return { targetId: id, zone: f < 0.3 ? 'before' : f > 0.7 ? 'after' : 'inside', card };
}

function showMapDrop(canvas, hit, L) {
  canvas.querySelectorAll('.map-card.drop-inside').forEach((c) => c.classList.remove('drop-inside'));
  let mark = canvas.querySelector('.map-drop');
  if (!hit) { mark?.remove(); return; }
  if (!mark) { mark = h('div', { class: 'map-drop', 'aria-hidden': 'true' }, h('span', { class: 'drop-label' })); canvas.append(mark); }
  const p = P();
  const x = +hit.card.dataset.x;
  const y = +hit.card.dataset.y;
  const gap = MAP.GAP_SIBLING / 2;
  const inside = hit.zone === 'inside';
  mark.className = `map-drop ${inside ? 'is-inside' : L.vertical ? 'is-col' : 'is-row'}`;
  let style;
  if (inside) {
    hit.card.classList.add('drop-inside');
    style = `left:${x + MAP.W}px;top:${y}px`;
  } else if (L.vertical) {
    style = `left:${hit.zone === 'before' ? x - gap : x + MAP.W + gap}px;top:${y}px;height:${+hit.card.dataset.h}px`;
  } else {
    style = `left:${x}px;top:${hit.zone === 'before' ? y - gap : y + +hit.card.dataset.h + gap}px;width:${MAP.W}px`;
  }
  mark.style.cssText = style;
  const parent = inside ? null : M.parentOf(p, hit.targetId);
  mark.querySelector('.drop-label').textContent = inside
    ? (hit.targetId === 'root' ? 'Into the book, at the end' : `Into ${p.nodes[hit.targetId].title}`)
    : parent.id === 'root' ? 'Top level' : `In ${parent.title}`;
}

// Hovering over a folded card while dragging unfolds it.
let mapUnfoldTimer = null;
let mapUnfoldId = null;
function mapHoverUnfold(hit) {
  const want = hit?.zone === 'inside' && state.mapFolded.has(hit.targetId) ? hit.targetId : null;
  if (want === mapUnfoldId) return;
  clearTimeout(mapUnfoldTimer);
  mapUnfoldId = want;
  if (want) mapUnfoldTimer = setTimeout(() => { mapUnfoldId = null; state.mapFolded.delete(want); renderMapOnly(); }, 650);
}

function renderMapOnly() {
  const wrap = document.querySelector('.map-wrap');
  if (wrap) state.mapScroll = { left: wrap.scrollLeft, top: wrap.scrollTop };
  document.querySelector('.main.view-map')?.replaceChildren(renderMap());
  mapAfterMount();
}

// Name (or rename) a block right on its card.
function startMapRename(id, { fresh = false } = {}) {
  for (const a of M.ancestors(P(), id)) state.mapFolded.delete(a.id);
  const card = document.querySelector(`.map-card[data-id="${id}"]`);
  if (!card) return false;
  const n = P().nodes[id];
  const title = card.querySelector('.map-title');
  const input = h('input', { class: 'map-rename', value: n.title, 'aria-label': `Name this ${M.TYPES[n.type].label.toLowerCase()}`, spellcheck: false });
  title.replaceWith(input);
  card.draggable = false;
  card.classList.add('renaming');
  if (fresh) card.classList.add('just-added');
  input.focus({ preventScroll: true });
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (commit && v && v !== n.title) { n.title = v; changed(); }
    anchorMap(id);
    render();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  ['click', 'dblclick', 'pointerdown'].forEach((t) => input.addEventListener(t, (e) => e.stopPropagation()));
  return true;
}

// Remember where a card sits on screen, so the next re-layout can keep it there.
function anchorMap(id) {
  const wrap = document.querySelector('.map-wrap');
  const card = id && wrap?.querySelector(`.map-card[data-id="${id}"]`);
  if (!wrap) return;
  state.mapScroll = { left: wrap.scrollLeft, top: wrap.scrollTop };
  if (!card) return;
  const cr = card.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  state.mapAnchor = { id, dx: cr.left - wr.left, dy: cr.top - wr.top };
}

// Delete from the map without losing your place on it (it goes to the Trash; Undo works).
function mapDelete(id) {
  const parent = M.parentOf(P(), id);
  const i = parent.children.indexOf(id);
  anchorMap(parent.children[i - 1] || parent.id);
  removeNode(id);
}

function mapSelect(id) {
  state.selectedId = id;
  state.multi.clear();
  document.querySelectorAll('.map-card.selected').forEach((c) => c.classList.remove('selected'));
  document.querySelector(`.map-card[data-id="${id}"]`)?.classList.add('selected');
  renderInspectorOnly();
}

function setMapZoom(z) {
  prefs.mapZoom = Math.min(2, Math.max(0.2, Math.round(z * 100) / 100));
  savePrefs();
  const wrap = document.querySelector('.map-wrap');
  if (wrap) state.mapScroll = { left: wrap.scrollLeft, top: wrap.scrollTop };
  render();
}

function fitMap() {
  const wrap = document.querySelector('.map-wrap');
  if (!wrap) return;
  const L = state.mapSize || { width: 1000, height: 600 };
  const z = Math.min(1.2, (wrap.clientWidth - 80) / L.width, (wrap.clientHeight - 80) / L.height);
  state.mapScroll = { left: 0, top: 0 };
  setMapZoom(Math.max(0.2, z));
}

// ---- stages: the flow of writing a book -------------------------------------------------------
// Gather → Plan → Draft → Revise → Share. Each stage shows only its own views, and the
// side panel follows it. You move between stages yourself; the Desk only suggests.

const STAGES = [
  { id: 'gather', n: 1, label: 'Gather', blurb: 'Find the idea: premise, fragments, what-ifs.', views: [['premise', 'Premise'], ['notebook', 'Notebook']] },
  { id: 'plan', n: 2, label: 'Plan', blurb: 'Give it a shape, and every piece a direction.', views: [['map', 'Map'], ['outline', 'Outline'], ['board', 'Board']] },
  { id: 'draft', n: 3, label: 'Draft', blurb: 'Write it, one block at a time.', views: [['write', 'Write'], ['notebook', 'Notebook']] },
  { id: 'revise', n: 4, label: 'Revise', blurb: 'Read it through and make it good.', views: [['read', 'Read'], ['write', 'Write']] },
  { id: 'share', n: 5, label: 'Share', blurb: 'Export, print, and show where it stands.', views: [['share', 'Share'], ['read', 'Read']] },
];
const stageById = (id) => STAGES.find((s) => s.id === id);
const DEFAULT_STAGE = { premise: 'gather', notebook: 'gather', map: 'plan', outline: 'plan', board: 'plan', write: 'draft', read: 'revise', share: 'share' };

// Keep the stage in step with the view, whichever way you got there (a click in the outline,
// a double-click on the map…): stay in the current stage if it has this view.
function syncStage() {
  if (state.view === 'desk') { state.stage = null; return; }
  if (state.view === 'trash') return;
  const cur = stageById(state.stage);
  if (cur && cur.views.some(([v]) => v === state.view)) return;
  state.stage = DEFAULT_STAGE[state.view] || state.stage || 'draft';
}

function goStage(id) {
  const st = stageById(id);
  state.stage = id;
  if (!st.views.some(([v]) => v === state.view)) state.view = st.views[0][0];
  // Drafting starts on something to write, not the book overview.
  if (id === 'draft' && (state.selectedId === 'root' || sel().children.length)) {
    const next = nextUp();
    if (next) state.selectedId = next.id;
  }
  render();
}

function goDesk() {
  state.view = 'desk';
  state.multi.clear();
  render();
}

// ---- reading the project ---------------------------------------------------------------------

const leavesOf = (p) => M.flatten(p).map((x) => x.node).filter((n) => !n.children.length);
const blockWords = (n) => M.nodeWords(n);

// The block to write next: the one you were last working on (if unfinished), else the first
// unwritten one in book order.
function nextUp() {
  const p = P();
  const leaves = leavesOf(p);
  const recent = leaves.filter((n) => n.editedAt && n.status !== 'done' && !(n.targetWords && blockWords(n) >= n.targetWords))
    .sort((a, b) => b.editedAt.localeCompare(a.editedAt))[0];
  return recent || leaves.find((n) => !n.content) || leaves.find((n) => n.status !== 'done') || null;
}

// The next block in book order after this one (for "Next up" at the end of a draft).
function nextInOrder(id) {
  const leaves = leavesOf(P());
  const order = M.flatten(P()).map((x) => x.node.id);
  const at = order.indexOf(id);
  return leaves.find((n) => order.indexOf(n.id) > at) || null;
}

function stageProgress() {
  const p = P();
  const root = p.nodes.root;
  const all = M.flatten(p).map((x) => x.node);
  const leaves = leavesOf(p);
  const words = M.treeWords(p);
  const ideas = p.notebook.length;
  const directed = all.filter((n) => n.synopsis.trim()).length;
  const written = leaves.filter((n) => n.content).length;
  const revised = leaves.filter((n) => n.status === 'revising' || n.status === 'done').length;
  const done = leaves.filter((n) => n.status === 'done').length;
  const s = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  return {
    gather: {
      pct: (root.synopsis.trim() ? 0.6 : 0) + Math.min(0.4, ideas / 25),
      line: root.synopsis.trim() ? `Premise written · ${s(ideas, 'idea', 'ideas')} in the notebook` : 'Start with a premise: what happens, and what it’s really about.',
    },
    plan: {
      pct: all.length ? directed / all.length : 0,
      line: all.length <= 3 ? 'Sketch the parts and chapters on the Map.' : `${directed} of ${all.length} blocks have a direction`,
    },
    draft: {
      pct: p.targetWords ? Math.min(1, words / p.targetWords) : leaves.length ? written / leaves.length : 0,
      line: `${written} of ${s(leaves.length, 'section', 'sections')} drafted · ${fmt(words)}${p.targetWords ? ` of ${fmt(p.targetWords)}` : ''} words`,
    },
    revise: {
      pct: leaves.length ? revised / leaves.length : 0,
      line: written ? `${revised} of ${s(written, 'drafted section', 'drafted sections')} revised` : 'Nothing drafted yet to revise.',
    },
    share: {
      pct: leaves.length ? done / leaves.length : 0,
      line: `${done} of ${s(leaves.length, 'section', 'sections')} marked done`,
    },
  };
}

// What to do next, most useful first. The Desk shows these; it never moves you by itself.
function suggestions() {
  const p = P();
  const root = p.nodes.root;
  const all = M.flatten(p).map((x) => x.node);
  const leaves = leavesOf(p);
  const out = [];
  const add = (s) => out.push(s);
  const write = (n) => () => { state.selectedId = n.id; state.view = 'write'; state.stage = 'draft'; render(); };

  if (!root.synopsis.trim()) {
    add({ stage: 'gather', title: 'Start here: write your premise', body: 'Two or three sentences: what happens, and what it’s really about. It keeps every later choice pointed somewhere.', label: 'Write the premise', go: () => { state.view = 'premise'; state.stage = 'gather'; render(); } });
  }
  if (all.length <= 3) {
    add({ stage: 'plan', title: 'Sketch the big pieces', body: 'Lay out the parts and chapters you imagine on the Map. Rough is fine; you’ll move things around.', label: 'Open the Map', go: () => goStage('plan') });
  }
  const next = nextUp();
  if (next) {
    const w = blockWords(next);
    const where = M.ancestors(p, next.id).filter((a) => a.id !== 'root').map((a) => a.title).join(' › ');
    add({
      stage: 'draft',
      title: next.content ? `Continue: ${next.title}` : `Start drafting: ${next.title}`,
      body: [where, next.content ? `${fmt(w)}${next.targetWords ? ` of ${fmt(next.targetWords)}` : ''} words so far` : next.synopsis || 'Not started yet.'].filter(Boolean).join(' · '),
      label: next.content ? 'Keep writing' : 'Start writing',
      go: write(next),
    });
  }
  const undirected = all.filter((n) => n.type !== 'section' && !n.synopsis.trim());
  if (undirected.length && all.length > 3) {
    add({ stage: 'plan', title: `Give ${undirected.length} ${undirected.length === 1 ? M.TYPES[undirected[0].type].label.toLowerCase() : 'parts and chapters'} a direction`, body: `${undirected.slice(0, 3).map((n) => `“${n.title}”`).join(', ')}${undirected.length > 3 ? '…' : ''} still need a “what happens”.`, label: 'Plan in the Outline', go: () => { state.view = 'outline'; state.stage = 'plan'; render(); } });
  }
  // A whole part (or chapter, when there are no parts) drafted but not yet revised: read it.
  const units = all.filter((n) => n.type === 'part').length ? all.filter((n) => n.type === 'part') : all.filter((n) => n.type === 'chapter');
  const ripe = units.find((u) => {
    const ls = M.flatten(p, u.id).map((x) => x.node).filter((n) => !n.children.length);
    return ls.length && ls.every((n) => n.content) && !ls.every((n) => n.status === 'revising' || n.status === 'done');
  });
  if (ripe) {
    add({ stage: 'revise', title: `${ripe.title} is drafted. Read it through.`, body: 'Read it as a reader would, start to finish, before changing anything. Echoes and Story check can help after.', label: 'Read it', go: () => { state.readScope = ripe.id; state.view = 'read'; state.stage = 'revise'; render(); } });
  }
  if (leaves.length && leaves.every((n) => n.status === 'done')) {
    add({ stage: 'share', title: 'Every section is done. Share it.', body: 'Export a clean manuscript, or a progress snapshot for your readers.', label: 'Share', go: () => goStage('share') });
  }
  // Put the most natural next move first: once drafting has begun, keep writing.
  const drafting = leaves.some((n) => n.content);
  if (drafting && root.synopsis.trim()) out.sort((a, b) => (b.stage === 'draft') - (a.stage === 'draft'));
  return out;
}

// ---- the two-line top bar ----------------------------------------------------------------------

function renderStageBar() {
  const prog = stageProgress();
  const st = stageById(state.stage);
  return h('div', { class: 'topbar-row stage-row' },
    h('button', { class: `desk-btn ${state.view === 'desk' ? 'on' : ''}`, title: 'Your desk: where you are, and what to do next', onclick: goDesk }, icon('home'), 'Desk'),
    h('nav', { class: 'stages', 'aria-label': 'Stages of writing' },
      STAGES.map((s) => h('button', {
        class: `stage ${state.stage === s.id ? 'on' : ''}`, 'aria-current': state.stage === s.id ? 'step' : null,
        title: `${s.label}: ${s.blurb}\n${prog[s.id].line}`,
        style: `--pct:${Math.round(prog[s.id].pct * 100)}%`,
        onclick: () => goStage(s.id),
      }, h('span', { class: 'stage-n' }, s.n), h('span', { class: 'stage-label' }, s.label)))),
    st && h('div', { class: 'tabs subtabs', role: 'tablist', 'aria-label': `${st.label} views` },
      st.views.map(([id, label]) => h('button', {
        class: `tab ${state.view === id ? 'active' : ''}`, role: 'tab', 'aria-selected': String(state.view === id),
        onclick: () => { state.view = id; render(); },
      }, id === 'notebook' && P().notebook.length ? `${label} · ${P().notebook.length}` : label))),
    h('div', { class: 'spacer' }),
    st && h('div', { class: 'stage-guide', title: st.blurb }, prog[st.id].line));
}

// ---- the Desk ---------------------------------------------------------------------------------

function renderDesk() {
  const p = P();
  const root = p.nodes.root;
  const prog = stageProgress();
  const [first, ...rest] = suggestions();
  const recent = M.flatten(p).map((x) => x.node).filter((n) => n.editedAt).sort((a, b) => b.editedAt.localeCompare(a.editedAt)).slice(0, 4);
  const stageChip = (id) => { const s = stageById(id); return h('span', { class: 'stage-chip' }, h('span', { class: 'stage-n' }, s.n), s.label); };
  return h('div', { class: 'desk' },
    h('header', { class: 'desk-head' },
      h('div', { class: 'eyebrow' }, 'Your desk'),
      h('h1', null, root.title),
      root.synopsis.trim()
        ? h('p', { class: 'desk-premise' }, root.synopsis, ' ', h('button', { class: 'link', onclick: () => { state.view = 'premise'; state.stage = 'gather'; render(); } }, 'Edit'))
        : h('p', { class: 'muted' }, p.author ? `by ${p.author}` : '')),
    first && h('section', { class: 'next-card' },
      h('div', { class: 'next-top' }, h('span', { class: 'eyebrow' }, 'Next step'), stageChip(first.stage)),
      h('h2', null, first.title),
      h('p', null, first.body),
      h('button', { class: 'btn primary', onclick: first.go }, first.label, ' →')),
    rest.length > 0 && h('section', { class: 'also' },
      h('div', { class: 'eyebrow' }, 'Or'),
      rest.slice(0, 3).map((s) => h('button', { class: 'also-item', onclick: s.go },
        stageChip(s.stage), h('span', { class: 'also-text' }, h('strong', null, s.title), h('span', { class: 'muted small' }, s.body)), h('span', { class: 'also-go' }, `${s.label} →`)))),
    h('section', { class: 'desk-stages' },
      h('div', { class: 'eyebrow' }, 'Where the book stands'),
      h('div', { class: 'stage-strip' }, STAGES.map((s) => h('button', { class: 'stage-col', onclick: () => goStage(s.id) },
        h('div', { class: 'stage-col-top' }, h('span', { class: 'stage-n' }, s.n), h('strong', null, s.label)),
        h('div', { class: 'stage-meter' }, h('i', { style: `width:${Math.round(prog[s.id].pct * 100)}%` })),
        h('span', { class: 'muted small' }, prog[s.id].line))))),
    recent.length > 0 && h('section', { class: 'desk-recent' },
      h('div', { class: 'eyebrow' }, 'Pick up where you left off'),
      h('div', { class: 'recent-list' }, recent.map((n) => h('button', { class: 'recent-item', onclick: () => { state.selectedId = n.id; state.view = 'write'; state.stage = n.status === 'revising' ? 'revise' : 'draft'; render(); } },
        h('span', { class: `dot status-${n.status}` }),
        h('span', { class: 'recent-title' }, n.title),
        h('span', { class: 'muted small' }, `${fmt(M.treeWords(p, n.id))} w · ${ago(Date.parse(n.editedAt))}`))))),
  );
}

// ---- Share page ----------------------------------------------------------------------------------

function renderShare() {
  const prog = stageProgress();
  return h('div', { class: 'board share-page' },
    h('div', { class: 'board-head' },
      h('h2', null, 'Share'),
      h('p', { class: 'muted' }, `${prog.share.line}. Export it to read on paper, mark up, send to a reader, or show someone where it stands.`)),
    h('div', { class: 'share-grid' }, Object.entries(X.KINDS).map(([id, k]) => h('button', { class: 'share-card', onclick: () => openExport({ kind: id }) },
      h('strong', null, k.label), h('span', null, k.who), h('span', { class: 'share-go' }, 'Preview & export →')))),
    h('p', { class: 'muted small' }, 'Want to read it through first? ', h('button', { class: 'link', onclick: () => { state.view = 'read'; render(); } }, 'Open the Read view'), '.'));
}

// ---- the side panel, by stage ------------------------------------------------------------------

function revisePanel(n) {
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('span', { class: 'eyebrow' }, 'Revise'), h('span', { class: 'panel-title' }, n.id === 'root' ? 'The whole book' : n.title)),
    h('div', { class: 'tool-list' },
      h('button', { class: 'ai-btn', onclick: () => { if (state.view !== 'read' && state.view !== 'write') state.view = 'write'; openEchoes(); } }, h('strong', null, 'Echoes'), h('span', null, 'Repeated words, phrases and crutch words.')),
      aiReady() && n.id !== 'root' && state.view === 'write' && h('button', { class: 'ai-btn', onclick: runPolish }, h('strong', null, '✦ Polish'), h('span', null, 'Select a passage for other wordings, or line-edit this block.')),
      aiReady() && h('button', { class: 'ai-btn', onclick: () => runStoryCheck(n.id === 'root' || n.children.length ? n.id : M.parentOf(P(), n.id).id) }, h('strong', null, '✦ Story check'), h('span', null, 'Plot holes, continuity, dropped threads.'))),
    n.id !== 'root' && h('div', { class: 'kv revise-status' }, h('label', null, 'Status'), statusSelect(n)));
}

function sharePanel() {
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('span', { class: 'eyebrow' }, 'Share')),
    h('div', { class: 'tool-list' }, Object.entries(X.KINDS).map(([id, k]) => h('button', { class: 'ai-btn', onclick: () => openExport({ kind: id }) }, h('strong', null, k.label), h('span', null, k.who.split('. ')[0] + '.')))));
}

// ---- global keys & lifecycle ------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (!state.project) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); state.handle ? save() : saveAs(); }
  if (mod && e.key === '.') { e.preventDefault(); toggleFocus(); }
  if (state.view === 'map' && (e.key === 'Delete' || e.key === 'Backspace') && !mod && state.selectedId !== 'root'
    && !e.target.closest?.('input, textarea, select, [contenteditable="true"], .map-card, dialog') && !document.querySelector('dialog[open], .ctx')) {
    e.preventDefault();
    mapDelete(state.selectedId);
  }
  if (mod && !e.shiftKey && e.key === '\\') { e.preventDefault(); toggleInspector(); }
  if (mod && e.shiftKey && (e.key === '|' || e.key === '\\')) { e.preventDefault(); toggleBinder(); }
  if (mod && e.key.toLowerCase() === 'e' && !document.querySelector('dialog[open]')) { e.preventDefault(); openExport(); }
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
