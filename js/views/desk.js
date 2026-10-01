import * as M from '../lib/model.js';
import { fmt, h } from '../core/dom.js';
import { P, state } from '../core/state.js';
import { STAGES, goStage, stageById, stageProgress, suggestions } from '../project/flow.js';
import { render } from '../ui/shell.js';
import { ago } from './welcome.js';

// ---- the Desk ---------------------------------------------------------------------------------

export function renderDesk() {
  const p = P();
  const root = p.nodes.root;
  const prog = stageProgress();
  const [first, ...rest] = suggestions();
  const recent = M.flatten(p).map((x) => x.node).filter((n) => n.editedAt).sort((a, b) => b.editedAt.localeCompare(a.editedAt)).slice(0, 4);
  const stageChip = (id) => { const s = stageById(id); return h('span', { class: 'stage-chip' }, h('span', { class: 'stage-n' }, s.n), s.label); };
  return h('div', { class: 'desk' },
    h('header', { class: 'desk-head' },
      h('div', { class: 'eyebrow' }, 'Your desk'),
      h('h1', null, root.title),
      root.synopsis.trim()
        ? h('p', { class: 'desk-premise' }, root.synopsis, ' ', h('button', { class: 'link', onclick: () => { state.view = 'premise'; state.stage = 'gather'; render(); } }, 'Edit'))
        : h('p', { class: 'muted' }, p.author ? `by ${p.author}` : '')),
    first && h('section', { class: 'next-card' },
      h('div', { class: 'next-top' }, h('span', { class: 'eyebrow' }, 'Next step'), stageChip(first.stage)),
      h('h2', null, first.title),
      h('p', null, first.body),
      h('button', { class: 'btn primary', onclick: first.go }, first.label, ' →')),
    rest.length > 0 && h('section', { class: 'also' },
      h('div', { class: 'eyebrow' }, 'Or'),
      rest.slice(0, 3).map((s) => h('button', { class: 'also-item', onclick: s.go },
        stageChip(s.stage), h('span', { class: 'also-text' }, h('strong', null, s.title), h('span', { class: 'muted small' }, s.body)), h('span', { class: 'also-go' }, `${s.label} →`)))),
    h('section', { class: 'desk-stages' },
      h('div', { class: 'eyebrow' }, 'Where the book stands'),
      h('div', { class: 'stage-strip' }, STAGES.map((s) => h('button', { class: 'stage-col', onclick: () => goStage(s.id) },
        h('div', { class: 'stage-col-top' }, h('span', { class: 'stage-n' }, s.n), h('strong', null, s.label)),
        h('div', { class: 'stage-meter' }, h('i', { style: `width:${Math.round(prog[s.id].pct * 100)}%` })),
        h('span', { class: 'muted small' }, prog[s.id].line))))),
    recent.length > 0 && h('section', { class: 'desk-recent' },
      h('div', { class: 'eyebrow' }, 'Pick up where you left off'),
      h('div', { class: 'recent-list' }, recent.map((n) => h('button', { class: 'recent-item', onclick: () => { state.selectedId = n.id; state.view = 'write'; state.stage = n.status === 'revising' ? 'revise' : 'draft'; render(); } },
        h('span', { class: `dot status-${n.status}` }),
        h('span', { class: 'recent-title' }, n.title),
        h('span', { class: 'muted small' }, `${fmt(M.treeWords(p, n.id))} w · ${ago(Date.parse(n.editedAt))}`))))),
  );
}
