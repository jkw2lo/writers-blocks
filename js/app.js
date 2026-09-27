import * as M from './model.js';
import * as S from './storage.js';
import * as AI from './ai.js';

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
  recent: null,
};

// Per-device preferences only (never manuscript data).
const prefs = loadPrefs();
function loadPrefs() {
  const d = { theme: 'auto', aiEnabled: false, model: AI.MODELS[0].id, rememberKey: false, apiKey: '', directionOpen: true, fontSize: 19 };
  try { return { ...d, ...JSON.parse(localStorage.getItem('wb-prefs') || '{}') }; } catch { return d; }
}
function savePrefs() {
  try {
    const out = { ...prefs };
    if (!out.rememberKey) out.apiKey = '';
    localStorage.setItem('wb-prefs', JSON.stringify(out));
    localStorage.setItem('wb-theme', prefs.theme);
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
  close: 'M6 6l12 12M18 6L6 18',
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
  P().notebook = P().notebook.filter((x) => x.id !== noteId);
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

function renderNotebook() {
  const p = P();
  const q = (state.noteFilter || '').toLowerCase();
  const notes = [...p.notebook].reverse().filter((n) => !q || n.text.toLowerCase().includes(q));
  const capture = autoGrow(h('textarea', {
    class: 'capture', rows: 3, placeholder: 'Jot an idea, a line of dialogue, a fragment, a “what if”…  (⌘/Ctrl + Enter to add)',
    onkeydown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(); },
  }));
  function addNote() {
    const text = capture.value.trim();
    if (!text) return;
    p.notebook.push({ id: M.uid(), text, createdAt: new Date().toISOString() });
    changed();
    render();
    document.querySelector('.capture')?.focus();
  }
  const placeOptions = [h('option', { value: '' }, 'Place in book…'),
    h('option', { value: 'root' }, p.nodes.root.title),
    ...M.flatten(p).filter(({ node }) => node.type !== 'section').map(({ node, depth }) =>
      h('option', { value: node.id }, `${'  '.repeat(depth + 1)}${node.title}`))];

  return h('div', { class: 'notebook' },
    h('div', { class: 'outline-head' },
      h('h2', null, 'Notebook'),
      h('p', { class: 'muted' }, 'Loose ideas and fragments that don’t have a home yet. When one finds its place, drag it onto the outline at left, or use “Place in book”, and it becomes a block with its text.')),
    h('div', { class: 'capture-wrap' }, capture, h('button', { class: 'btn primary', onclick: addNote }, 'Add to notebook')),
    p.notebook.length > 4 && h('input', { class: 'note-filter', type: 'search', placeholder: 'Search notes…', value: state.noteFilter || '', oninput: (e) => { state.noteFilter = e.target.value; render(); const i = document.querySelector('.note-filter'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }),
    notes.length === 0 && h('p', { class: 'empty' }, p.notebook.length ? 'No notes match.' : 'Your notebook is empty. Anything goes here.'),
    h('div', { class: 'notes' }, notes.map((note) => {
      const card = h('article', { class: 'note' },
        autoGrow(h('textarea', { value: note.text, 'aria-label': 'Note', oninput: (e) => { note.text = e.target.value; changed(); } })),
        h('div', { class: 'note-foot' },
          h('span', { class: 'muted small' }, new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
          h('span', { class: 'spacer' }),
          h('select', { class: 'place', 'aria-label': 'Place in book', onchange: (e) => e.target.value && placeNote(note.id, e.target.value) }, placeOptions.map((o) => o.cloneNode(true))),
          h('button', {
            class: 'icon-btn small', title: 'Delete note',
            onclick: () => { snapshot(); p.notebook = p.notebook.filter((x) => x.id !== note.id); changed(); render(); toast('Note deleted.', { undo: true }); },
          }, icon('trash'))));
      makeDraggable(card, 'note', note.id);
      card.addEventListener('mousedown', (e) => { card.draggable = !e.target.closest('textarea,select,button'); });
      return card;
    })),
  );
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
  return h('aside', { class: 'inspector' },
    isRoot ? null : inspectorBlock(n),
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
    const msg = e?.status === 401 ? 'Your API key was rejected. Check it in Settings.' : e.message || String(e);
    state.aiResults[id] = { action, error: msg };
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
    h('div', { class: 'kv' },
      h('label', null, 'Theme'),
      h('select', { onchange: (e) => { prefs.theme = e.target.value; savePrefs(); applyTheme(); } },
        [['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('option', { value: v, selected: prefs.theme === v }, l))),
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

function applyTheme() {
  if (prefs.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = prefs.theme;
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

window.addEventListener('beforeunload', (e) => {
  if (state.project && (state.dirty || state.saving)) {
    if (state.handle) save();
    e.preventDefault();
  }
});

applyTheme();
S.recentHandle().then((hd) => { state.recent = hd; if (!state.project) render(); });
render();
