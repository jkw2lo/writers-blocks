import * as M from './model.js';
import * as S from './storage.js';
import * as AI from './ai.js';
import { dealPrompt } from './prompts.js';

// ---- state -------------------------------------------------------------------

const state = {
  project: null,
  handle: null, // FileSystemFileHandle when autosaving
  fileName: null,
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
  recent: null,
};

// Per-device preferences only (never manuscript data).
const prefs = loadPrefs();
function loadPrefs() {
  const d = { skin: 'studio', theme: 'auto', aiEnabled: false, model: AI.MODELS[0].id, rememberKey: false, apiKey: '', directionOpen: true, fontSize: 19, notebookLayout: 'grid', zoom: 1, sprintMinutes: 10 };
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
function toast(msg, { undo = false, error = false } = {}) {
  const t = document.getElementById('toast');
  t.replaceChildren(h('span', null, msg));
  t.className = `show ${error ? 'error' : ''}`;
  if (undo) t.append(h('button', { class: 'link', onclick: () => { restoreUndo(); t.className = ''; } }, 'Undo'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), undo ? 7000 : 3500);
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

async function save() {
  if (!state.handle) return saveAs();
  clearTimeout(saveTimer);
  state.saving = true;
  renderStatus();
  try {
    await S.writeHandle(state.handle, serialize());
    state.dirty = false;
    state.saveError = null;
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
    await S.rememberHandle(handle);
    await save();
    toast(`Saving to ${handle.name}. Changes now save automatically.`);
  } catch (e) {
    if (e.name !== 'AbortError') toast(`Couldn't save: ${e.message}`, { error: true });
  }
}

function confirmDiscard() {
  return !state.dirty || confirm('You have changes that are not saved to a file. Discard them?');
}

function loadProject(text, { handle = null, name = null } = {}) {
  const p = M.validate(JSON.parse(text));
  state.project = p;
  state.handle = handle;
  state.fileName = name;
  state.dirty = false;
  state.selectedId = firstLeaf(p) || 'root';
  state.undo = [];
  state.aiResults = {};
  state.spark = null;
  render();
}

function firstLeaf(p) {
  const list = M.flatten(p);
  return (list.find(({ node }) => !node.children.length) || list[0])?.node.id;
}

async function cmdNew() {
  if (!confirmDiscard()) return;
  const title = prompt('What is your book (or project) called?', 'Untitled Book');
  if (title === null) return;
  state.project = M.newProject(title.trim() || 'Untitled Book');
  state.handle = null;
  state.fileName = null;
  state.undo = [];
  state.aiResults = {};
  state.spark = null;
  state.selectedId = 'root';
  state.dirty = true;
  render();
  if (S.canAutosave) await saveAs();
}

async function cmdOpen() {
  if (!confirmDiscard()) return;
  try {
    const { handle, name, text } = await S.pickOpen();
    loadProject(text, { handle, name });
    if (handle) await S.rememberHandle(handle);
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message, { error: true });
  }
}

async function cmdReopen() {
  try {
    const { name, text } = await S.readHandle(state.recent);
    loadProject(text, { handle: state.recent, name });
  } catch (e) {
    toast(`Couldn't reopen: ${e.message}`, { error: true });
    await S.forgetRecent();
    state.recent = null;
    render();
  }
}

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
          state.recent && h('button', { class: 'btn primary', onclick: cmdReopen }, `Reopen ${state.recent.name}`),
          h('button', { class: `btn ${state.recent ? '' : 'primary'}`, onclick: cmdNew }, 'Start a new project'),
          h('button', { class: 'btn', onclick: cmdOpen }, 'Open a project file…'),
          h('button', { class: 'btn ghost', onclick: cmdSample }, 'Explore a sample'),
        ),
        h('div', { class: 'vibe' },
          h('span', { class: 'eyebrow' }, 'Pick a vibe'),
          skinPicker({ compact: true })),
        h('p', { class: 'fine' },
          S.canAutosave
            ? 'Your work is saved to a file on your computer that you choose, and it autosaves as you write. Nothing is kept in the browser.'
            : 'This browser can’t autosave to your disk, so use Save to download your project file, and Open it next time. (Chrome, Edge or Arc can autosave.) Nothing is kept in the browser.'),
      ),
    ),
  );
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
      item('Close project', () => { if (confirmDiscard()) { state.project = null; state.dirty = false; render(); } }),
    ));
}

function renderStatus() {
  const el = document.getElementById('status');
  if (!el || !P()) return;
  const words = M.treeWords(P());
  const parts = [h('span', { class: 'total', 'data-wc-total': '' }, `${fmt(words)} words`)];
  if (state.saveError) {
    parts.push(h('button', { class: 'btn small danger', onclick: save }, 'Save failed. Retry'));
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
  const t = document.querySelector('[data-wc-total]');
  if (t) t.textContent = `${fmt(M.treeWords(P()))} words`;
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
  let countTimer;
  ed.addEventListener('input', () => {
    n.content = /^(\s|<br>|<p><br><\/p>|<div><br><\/div>)*$/.test(ed.innerHTML) ? '' : ed.innerHTML;
    changed();
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

  const tb = (label, title, fn) => h('button', { class: 'tb', title, onmousedown: (e) => { e.preventDefault(); fn(); } }, label);
  const exec = (cmd, arg) => () => { document.execCommand(cmd, false, arg); ed.dispatchEvent(new Event('input')); };

  return h('div', { class: 'write' },
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
    onchange: (e) => { n.status = e.target.value; changed(); render(); },
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

function openSettings() {
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
}

// ---- skins ---------------------------------------------------------------------------
// Tokens and signature touches live in css/themes.css; these swatches only draw the picker.

const SKINS = [
  { id: 'studio', name: 'Studio', vibe: 'Warm paper, bookish serif', bg: '#f5f0e6', card: '#fffdf8', ink: '#2a2520', accent: '#b4532a', font: "'Literata', serif" },
  { id: 'minimal', name: 'Minimal', vibe: 'Sleek, modern, quiet', bg: '#fafafa', card: '#ffffff', ink: '#0a0a0b', accent: '#111113', font: "'Geist', sans-serif" },
  { id: 'typewriter', name: 'Typewriter', vibe: 'Inked paper, ribbon red', bg: '#e6dfcd', card: '#f7f2e4', ink: '#211f1b', accent: '#b0302a', font: "'Special Elite', monospace" },
  { id: 'nocturne', name: 'Nocturne', vibe: '2am, candlelit. Always dark', bg: '#0d1019', card: '#141925', ink: '#ebe4d6', accent: '#e8ae5b', font: "'Cormorant Garamond', serif", dark: true },
  { id: 'meadow', name: 'Meadow', vibe: 'Soft, cosy, a little dreamy', bg: '#f4f2e8', card: '#fffdf7', ink: '#2c3327', accent: '#c25e68', font: "'Fraunces', serif" },
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
  requestAnimationFrame(refitTextareas);
  document.querySelectorAll('.skin-opt').forEach((b) => b.classList.toggle('on', b.dataset.skin === prefs.skin));
  document.querySelectorAll('.mode-control').forEach((c) => c.replaceWith(modeControl()));
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
      h('div', { class: 'look-foot' }, h('span', { class: 'eyebrow' }, 'Mode'), modeControl())));
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
S.recentHandle().then((hd) => { state.recent = hd; if (!state.project) render(); });
render();
