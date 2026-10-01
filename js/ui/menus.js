import * as M from '../lib/model.js';
import { h, icon } from '../core/dom.js';
import { P, state } from '../core/state.js';
import { addAfter, addChild, focusTitle, mergeNext, moveInto, moveToNotebook, removeNodes, select, setKind, setStatus, shift } from '../project/commands.js';
import { carried, paintMulti, startRename } from './binder.js';
import { startMapRename } from '../views/map.js';

// ---- context menus -------------------------------------------------------------------------

export function openBlockMenu(id, at) {
  if (!(state.multi.size > 1 && state.multi.has(id))) { state.multi.clear(); paintMulti(); }
  const ids = carried(id);
  const rows = ids.map((x) => document.querySelector(`.tree .row[data-id="${x}"]`)).filter(Boolean);
  rows.forEach((r) => r.classList.add('ctx-target'));
  contextMenu(at, blockMenuItems(ids), { onClose: () => rows.forEach((r) => r.classList.remove('ctx-target')) });
}

export function blockMenuItems(ids) {
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

export function moveTargets(ids) {
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
export let closeCtx = null;
export function contextMenu(at, items, { onClose, above = false } = {}) {
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
