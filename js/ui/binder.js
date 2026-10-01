import * as M from '../lib/model.js';
import { fmt, h, icon } from '../core/dom.js';
import { P, prefs, state } from '../core/state.js';
import { addChild, outermost, removeNodes, select } from '../project/commands.js';
import { MOD, changed } from '../project/files.js';
import { goDesk } from '../project/flow.js';
import { binderHit, endDrag, hoverExpand, makeDraggable, performDrop, showDropLine } from './drag-drop.js';
import { blockMenuItems, contextMenu, openBlockMenu } from './menus.js';
import { render } from './shell.js';
import { toggleBinder } from './theme.js';

// ---- render: binder (left) -------------------------------------------------------

export function matches(n, q) {
  return [n.title, n.synopsis, n.purpose, n.notes, n.tags.join(' '), M.stripHtml(n.content)].join(' ').toLowerCase().includes(q);
}

export function renderBinder() {
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

export function binderRow(n, depth) {
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
export const carried = (id) => (state.multi.size > 1 && state.multi.has(id) ? outermost([...state.multi]) : [id]);

export function rowClick(e, id) {
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

export function selectRow(id) {
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

export function paintMulti() {
  const on = state.multi.size > 1;
  document.querySelectorAll('.tree .row[data-id]').forEach((r) => {
    const m = on && state.multi.has(r.dataset.id);
    r.classList.toggle('multi', m);
    r.setAttribute('aria-selected', String(m || r.classList.contains('selected')));
  });
  document.querySelector('.multi-bar')?.replaceWith(multiBar());
}

export function multiBar() {
  if (state.multi.size < 2) return h('div', { class: 'multi-bar', hidden: true });
  const ids = outermost([...state.multi]);
  return h('div', { class: 'multi-bar' },
    h('span', null, `${state.multi.size} selected`),
    h('button', { class: 'link', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); contextMenu({ x: r.left, y: r.top }, blockMenuItems(ids), { above: true }); } }, 'Actions…'),
    h('button', { class: 'icon-btn small', title: 'Delete selected', onclick: () => removeNodes(ids) }, icon('trash')),
    h('button', { class: 'icon-btn small', title: 'Clear selection (Esc)', onclick: () => { state.multi.clear(); paintMulti(); } }, icon('close')));
}

// Make sure a block's row is visible in the outline (open its parents, clear a search).
export function revealRow(id) {
  let changedAny = false;
  for (const a of M.ancestors(P(), id)) if (a.collapsed) { a.collapsed = false; changedAny = true; }
  if (state.filter) { state.filter = ''; changedAny = true; }
  if (changedAny) render();
  return document.querySelector(`.tree .row[data-id="${id}"]`);
}

// Rename in place in the outline. Returns false if the outline isn't showing.
export function startRename(id, { fresh = false } = {}) {
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

export function treeKeys(e) {
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
