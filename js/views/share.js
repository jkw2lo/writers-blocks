import * as X from '../lib/export.js';
import { h } from '../core/dom.js';
import { state } from '../core/state.js';
import { stageProgress } from '../project/flow.js';
import { openExport } from '../ui/export-dialog.js';
import { render } from '../ui/shell.js';

// ---- Share page ----------------------------------------------------------------------------------

export function renderShare() {
  const prog = stageProgress();
  return h('div', { class: 'board share-page' },
    h('div', { class: 'board-head' },
      h('h2', null, 'Share'),
      h('p', { class: 'muted' }, `${prog.share.line}. Export it to read on paper, mark up, send to a reader, or show someone where it stands.`)),
    h('div', { class: 'share-grid' }, Object.entries(X.KINDS).map(([id, k]) => h('button', { class: 'share-card', onclick: () => openExport({ kind: id }) },
      h('strong', null, k.label), h('span', null, k.who), h('span', { class: 'share-go' }, 'Preview & export →')))),
    h('p', { class: 'muted small' }, 'Want to read it through first? ', h('button', { class: 'link', onclick: () => { state.view = 'read'; render(); } }, 'Open the Read view'), '.'));
}
