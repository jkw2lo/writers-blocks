import * as M from '../lib/model.js';
import { autoGrow, fmt, h, icon } from '../core/dom.js';
import { P, sel, state } from '../core/state.js';
import { addChild, select } from '../project/commands.js';
import { changed } from '../project/files.js';
import { makeDraggable, makeDropTarget } from '../ui/drag-drop.js';
import { renderInspectorOnly } from '../ui/inspector.js';
import { blockMenuItems, contextMenu } from '../ui/menus.js';
import { crumbs } from './write.js';

export function renderBoard() {
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

export function boardCard(k, i) {
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
