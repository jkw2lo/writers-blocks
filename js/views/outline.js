import * as M from '../lib/model.js';
import { autoGrow, fmt, h } from '../core/dom.js';
import { P, state } from '../core/state.js';
import { select } from '../project/commands.js';
import { changed } from '../project/files.js';
import { blockDone } from '../project/progress.js';
import { renderInspectorOnly } from '../ui/inspector.js';
import { blockMenuItems, contextMenu } from '../ui/menus.js';
import { render } from '../ui/shell.js';

export function renderOutline() {
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

export function statusSelect(n) {
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
