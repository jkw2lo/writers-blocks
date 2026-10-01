import * as AI from '../lib/ai.js';
import * as M from '../lib/model.js';
import { autoGrow, h, icon, toast } from '../core/dom.js';
import { P, aiSettings, prefs, savePrefs, sel, sessionKey, state } from '../core/state.js';
import { snapshot } from '../core/undo.js';
import { placeNote, select } from '../project/commands.js';
import { changed } from '../project/files.js';
import { makeDraggable } from '../ui/drag-drop.js';
import { render } from '../ui/shell.js';

// ---- notebook: ideas on a grid or a canvas -----------------------------------------

export const CANVAS_W = 4000;
export const CANVAS_H = 3000;
export const NOTE_W = 240;
export const SOURCES = {
  outline: '↩ From the outline',
  ai: '✦ AI',
  freewrite: '⏱ Freewrite',
  prompt: '❖ Prompt',
  collide: '⚭ Collision',
  interview: '? Interview',
};

export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function newNote(text, extra = {}) {
  const note = M.makeNote(text, extra);
  P().notebook.push(note);
  return note;
}

export function deleteNote(id) {
  snapshot();
  M.removeNote(P(), id);
  changed();
  render();
  toast('Idea deleted.', { undo: true });
}

export function focusNote(id) {
  requestAnimationFrame(() => document.querySelector(`[data-note="${id}"] textarea`)?.focus());
}

export const hereLabel = (n) => (n.id === 'root' ? 'the book' : `“${n.title}”`);
export const aiReady = () => prefs.aiEnabled && !!sessionKey;
export const aiError = (e) => (e?.status === 401 ? 'Your API key was rejected. Check it in Settings.' : e?.message || String(e));

export function placeOptions() {
  const p = P();
  return [h('option', { value: '' }, 'Make it a block…'),
    h('option', { value: 'root' }, `in ${p.nodes.root.title}`),
    ...M.flatten(p).filter(({ node }) => node.type !== 'section').map(({ node, depth }) =>
      h('option', { value: node.id }, `${'  '.repeat(depth + 1)}in ${node.title}`))];
}

export function renderNotebook() {
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

export function noteCard(note, { canvas = false, dim = false } = {}) {
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

export function ensurePositions() {
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

export function setZoom(z) {
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

export function notesCanvas(visibleIds) {
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

export const centerOf = (el) => ({ x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 });

export function drawLinks() {
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

export function wireCanvas(wrap, board, svg) {
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

export async function riffNote(note) {
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
