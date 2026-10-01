import { h } from '../core/dom.js';
import { prefs, state } from '../core/state.js';
import { syncStage } from '../project/flow.js';
import { renderBinder } from './binder.js';
import { renderInspector } from './inspector.js';
import { paintDrawer } from './tools.js';
import { renderStatus, renderTopbar } from './topbar.js';
import { renderBoard } from '../views/board.js';
import { renderDesk } from '../views/desk.js';
import { mapAfterMount, renderMap } from '../views/map.js';
import { renderNotebook } from '../views/notebook.js';
import { renderOutline } from '../views/outline.js';
import { renderRead } from '../views/read.js';
import { renderShare } from '../views/share.js';
import { renderTrash } from '../views/trash.js';
import { renderWelcome } from '../views/welcome.js';
import { renderBookOverview, renderWrite } from '../views/write.js';

// ---- render: shell ------------------------------------------------------------------

export const app = document.getElementById('app');

export function render() {
  document.documentElement.style.setProperty('--editor-size', `${prefs.fontSize}px`);
  if (!state.project) return renderWelcome();
  syncStage();
  document.body.classList.toggle('focus', state.focus);
  document.body.classList.toggle('no-inspector', !prefs.inspector || state.view === 'desk');
  document.body.classList.toggle('no-binder', !prefs.binder);
  const scroll = document.querySelector('.main')?.scrollTop;
  const binderScroll = document.querySelector('.tree')?.scrollTop;
  app.replaceChildren(
    renderTopbar(),
    h('div', { class: 'workspace' }, renderBinder(), renderMain(), renderInspector()),
  );
  if (scroll != null && state.lastRenderKey === `${state.view}:${state.selectedId}`) document.querySelector('.main').scrollTop = scroll;
  if (binderScroll != null && document.querySelector('.tree')) document.querySelector('.tree').scrollTop = binderScroll;
  state.lastRenderKey = `${state.view}:${state.selectedId}`;
  renderStatus();
  paintDrawer();
  if (state.view === 'map') mapAfterMount();
}
// ---- render: main views ------------------------------------------------------------

export function renderMain() {
  const view = { desk: renderDesk, premise: renderBookOverview, share: renderShare, write: renderWrite, board: renderBoard, outline: renderOutline, map: renderMap, read: renderRead, notebook: renderNotebook, trash: renderTrash }[state.view] || renderWrite;
  return h('main', { class: `main view-${state.view}` }, view());
}
