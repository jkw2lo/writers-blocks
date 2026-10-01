import * as M from '../lib/model.js';
import { h, toast } from '../core/dom.js';
import { P, state } from '../core/state.js';
import { snapshot } from '../core/undo.js';
import { outermost, placeNote } from '../project/commands.js';
import { changed } from '../project/files.js';
import { renderBinder } from './binder.js';
import { render } from './shell.js';

// ---- drag & drop ------------------------------------------------------------------

export function dropZone(e, el, allowInside = true, horizontal = false) {
  const r = el.getBoundingClientRect();
  const f = horizontal ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
  if (!allowInside) return f < 0.5 ? 'before' : 'after';
  return f < 0.28 ? 'before' : f > 0.72 ? 'after' : 'inside';
}

export function clearDropMarks() {
  document.querySelectorAll('.drop-before,.drop-after,.drop-inside').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-inside'));
}

// zone: before | after (siblings), inside (last child), first (first child)
export function performDrop(targetId, zone) {
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
export function makeDraggable(el, kind, id, getIds) {
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

export let expandTimer = null;
export let expandId = null;
export function endDrag() {
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

export function binderHit(e, tree) {
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

export function showDropLine(tree, hit) {
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
export function hoverExpand(hit) {
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

export function renderBinderOnly() {
  const old = document.querySelector('.binder');
  if (!old) return;
  const top = old.querySelector('.tree')?.scrollTop;
  const fresh = renderBinder();
  old.replaceWith(fresh);
  if (top != null) fresh.querySelector('.tree').scrollTop = top;
}

export function makeDropTarget(el, id, { allowInside = true, horizontal = false } = {}) {
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
