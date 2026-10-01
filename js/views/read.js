import * as E from '../lib/echoes.js';
import * as M from '../lib/model.js';
import { fmt, h, icon } from '../core/dom.js';
import { P, prefs, savePrefs, state } from '../core/state.js';
import { select } from '../project/commands.js';
import { render } from '../ui/shell.js';
import { openEchoes, runStoryCheck } from '../ui/tools.js';
import { aiReady } from './notebook.js';

// ---- Read view ------------------------------------------------------------------------------
// The book as continuous pages. Double-click any paragraph to edit it right there.

export function readScope() {
  return P().nodes[state.readScope] ? state.readScope : 'root';
}

export function renderRead() {
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
export function jumpTo(id, index) {
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
