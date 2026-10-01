import * as M from '../lib/model.js';
import { fmt, h, icon } from '../core/dom.js';
import { P, prefs, savePrefs, state } from '../core/state.js';
import { addAfter, addChild, removeNode, select, shift } from '../project/commands.js';
import { changed } from '../project/files.js';
import { carried } from '../ui/binder.js';
import { endDrag, makeDraggable, performDrop } from '../ui/drag-drop.js';
import { renderInspectorOnly } from '../ui/inspector.js';
import { blockMenuItems, contextMenu } from '../ui/menus.js';
import { render } from '../ui/shell.js';

// ---- Map view --------------------------------------------------------------------------------
// The whole book as a branching tree: the book, then parts, chapters and sections,
// everything open. Click to select, double-click to write, drag a card onto another to
// move it, right-click for the block menu. Branches fold on the map only (the outline
// keeps its own open/closed state).

export const MAP = { W: 230, GAP_DEPTH: 64, GAP_SIBLING: 14 };

// Cards grow to fit all their text, so the tree is laid out with each card's real height.
// Siblings stack along one axis; a parent centres on its children, and if it's taller
// than they are, they shift to make room so nothing overlaps.
export function mapLayout(p, heightOf) {
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

export function mapEdgePath(a, b, L) {
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
export function measureMapCards(cards) {
  const box = h('div', { class: `map-measure ${prefs.mapDir === 'down' ? 'down' : ''}`, 'aria-hidden': 'true' });
  document.body.append(box);
  const heights = {};
  for (const [id, card] of cards) { card.style.width = `${MAP.W}px`; box.append(card); }
  for (const [id, card] of cards) heights[id] = Math.ceil(card.offsetHeight);
  box.remove();
  return heights;
}

export function renderMap() {
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

export function mapCard(id) {
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
    h('span', { class: 'map-title', title: 'Double-click to rename' }, n.title)),
  // Delete floats over the corner on hover, so the text never reflows. (Rename: double-click the title, or F2.)
  !isRoot && h('span', { class: 'map-tools' },
    h('button', { class: 'map-rename-btn map-del-btn', tabindex: -1, title: 'Move to the Trash (Delete)', 'aria-label': `Delete ${n.title}`, onclick: (e) => { e.stopPropagation(); mapDelete(it.id); } }, icon('close'))),
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

export function mapShell(p, L, svg, cards, z, pad) {
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
        mapLevels(p),
        h('div', { class: 'zoom' },
          h('button', { class: 'icon-btn small', title: 'Zoom out', onclick: () => setMapZoom(prefs.mapZoom / 1.2) }, '−'),
          h('button', { class: 'link', title: 'Actual size', onclick: () => setMapZoom(1) }, `${Math.round(z * 100)}%`),
          h('button', { class: 'icon-btn small', title: 'Zoom in', onclick: () => setMapZoom(prefs.mapZoom * 1.2) }, '+')),
        h('button', { class: 'btn small', title: 'Fit the whole map on screen', onclick: fitMap }, icon('focus'), 'Fit'),
        h('button', { class: 'btn small', title: 'Fit the map’s current width (what’s unfolded) to the screen', onclick: fitMapWidth }, icon('width'), 'Fit width'))),
    wrap);
}

// Where would a drop land? Along the sibling axis: the first third of a card is "before",
// the last third "after", the middle "into". Nothing can go inside itself.
// Runs right after the map is put on the page (no waiting a frame, so it never flashes
// in the wrong place): restore the scroll, keep the anchored card where it was on screen,
// and bring a new card into view, gently and only as far as needed.
export function mapAfterMount() {
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

export function mapHit(e, L) {
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

export function showMapDrop(canvas, hit, L) {
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
export let mapUnfoldTimer = null;
export let mapUnfoldId = null;
export function mapHoverUnfold(hit) {
  const want = hit?.zone === 'inside' && state.mapFolded.has(hit.targetId) ? hit.targetId : null;
  if (want === mapUnfoldId) return;
  clearTimeout(mapUnfoldTimer);
  mapUnfoldId = want;
  if (want) mapUnfoldTimer = setTimeout(() => { mapUnfoldId = null; state.mapFolded.delete(want); renderMapOnly(); }, 650);
}

export function renderMapOnly() {
  const wrap = document.querySelector('.map-wrap');
  if (wrap) state.mapScroll = { left: wrap.scrollLeft, top: wrap.scrollTop };
  document.querySelector('.main.view-map')?.replaceChildren(renderMap());
  mapAfterMount();
}

// Name (or rename) a block right on its card.
export function startMapRename(id, { fresh = false } = {}) {
  for (const a of M.ancestors(P(), id)) state.mapFolded.delete(a.id);
  const card = document.querySelector(`.map-card[data-id="${id}"]`);
  if (!card) return false;
  const n = P().nodes[id];
  const title = card.querySelector('.map-title');
  // A wrapping box that grows as you type, so a long title is always fully visible.
  const input = h('textarea', { class: 'map-rename', rows: 1, value: n.title, 'aria-label': `Name this ${M.TYPES[n.type].label.toLowerCase()}`, spellcheck: false });
  title.replaceWith(input);
  card.draggable = false;
  card.classList.add('renaming');
  card.style.height = 'auto';
  const grow = () => { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`; };
  input.addEventListener('input', () => {
    if (/\n/.test(input.value)) input.value = input.value.replace(/\s*\n+\s*/g, ' '); // titles are one line (pasted text too)
    grow();
  });
  requestAnimationFrame(grow);
  grow();
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
export function anchorMap(id) {
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
export function mapDelete(id) {
  const parent = M.parentOf(P(), id);
  const i = parent.children.indexOf(id);
  anchorMap(parent.children[i - 1] || parent.id);
  removeNode(id);
}

// "Show" levels: fold the whole map down to a depth (Parts, Chapters, Sections…), named
// after what mostly lives at that depth in this book.
export function mapLevels(p) {
  const all = M.flatten(p);
  const maxDepth = Math.max(0, ...all.map((x) => x.depth));
  const label = (d) => {
    const count = {};
    all.filter((x) => x.depth === d).forEach((x) => (count[x.node.type] = (count[x.node.type] || 0) + 1));
    const type = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || 'section';
    return `${M.TYPES[type].label}s`;
  };
  // Folding at depth d hides everything below it.
  const foldedAt = (d) => new Set(all.filter((x) => x.depth === d && x.node.children.length).map((x) => x.node.id));
  const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const levels = [];
  for (let d = 0; d < maxDepth; d++) levels.push({ label: label(d), set: foldedAt(d) });
  levels.push({ label: 'All', set: new Set() });
  const apply = (set) => {
    anchorMap(state.selectedId !== 'root' && document.querySelector(`.map-card[data-id="${state.selectedId}"]`) ? state.selectedId : 'root');
    state.mapFolded = new Set(set);
    render();
  };
  return h('div', { class: 'map-levels' },
    h('span', { class: 'muted small' }, 'Show'),
    h('div', { class: 'seg-control' }, levels.map((lv) => h('button', {
      class: same(lv.set, state.mapFolded) ? 'active' : '',
      title: lv.label === 'All' ? 'Unfold everything' : `Fold the map down to ${lv.label.toLowerCase()}`,
      onclick: () => apply(lv.set),
    }, lv.label))));
}

export function mapSelect(id) {
  state.selectedId = id;
  state.multi.clear();
  document.querySelectorAll('.map-card.selected').forEach((c) => c.classList.remove('selected'));
  document.querySelector(`.map-card[data-id="${id}"]`)?.classList.add('selected');
  renderInspectorOnly();
}

export function setMapZoom(z) {
  prefs.mapZoom = Math.min(2, Math.max(0.2, Math.round(z * 100) / 100));
  savePrefs();
  const wrap = document.querySelector('.map-wrap');
  if (wrap) state.mapScroll = { left: wrap.scrollLeft, top: wrap.scrollTop };
  render();
}

// Zoom so the map's current width (whatever is unfolded) fills the screen, from the top.
export function fitMapWidth() {
  const wrap = document.querySelector('.map-wrap');
  if (!wrap) return;
  const L = state.mapSize || { width: 1000 };
  state.mapScroll = { left: 0, top: 0 };
  setMapZoom(Math.max(0.2, Math.min(1.6, (wrap.clientWidth - 80) / L.width)));
}

export function fitMap() {
  const wrap = document.querySelector('.map-wrap');
  if (!wrap) return;
  const L = state.mapSize || { width: 1000, height: 600 };
  const z = Math.min(1.2, (wrap.clientWidth - 80) / L.width, (wrap.clientHeight - 80) / L.height);
  state.mapScroll = { left: 0, top: 0 };
  setMapZoom(Math.max(0.2, z));
}
