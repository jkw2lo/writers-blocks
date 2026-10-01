import { allowBackup } from '../project/backups.js';
import * as M from '../lib/model.js';
import * as S from '../lib/storage.js';
import { fmt, h, icon } from '../core/dom.js';
import { P, prefs, sel, state } from '../core/state.js';
import { MOD, changed, closeProject, cmdExport, cmdNew, cmdOpen, save, saveAs } from '../project/files.js';
import { STAGES, goDesk, goStage, stageById, stageProgress } from '../project/flow.js';
import { progressRing, showSessionSummary, trackProgress } from '../project/progress.js';
import { showConflict } from '../project/sync.js';
import { openExport } from './export-dialog.js';
import { showHelp } from './help-tour.js';
import { openImport } from './import-dialog.js';
import { openSettings } from './settings.js';
import { render } from './shell.js';
import { lookMenu, toggleBinder, toggleFocus, toggleInspector } from './theme.js';

export function renderTopbar() {
  const root = P().nodes.root;
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-row' },
      h('button', { class: 'brand', title: 'Your desk', onclick: goDesk }, h('div', { class: 'logo-blocks small', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))),
      fileMenu(),
      h('input', {
        class: 'book-title', value: root.title, 'aria-label': 'Book title',
        oninput: (e) => { root.title = e.target.value; changed(); document.querySelectorAll('[data-root-title]').forEach((x) => (x.textContent = root.title)); },
      }),
      h('div', { class: 'spacer' }),
      h('div', { id: 'status', class: 'status' }),
      h('div', { class: 'bar-cluster', role: 'group', 'aria-label': 'Layout' },
        h('button', {
          class: `icon-btn panel-btn ${prefs.binder ? 'on' : ''}`, 'aria-pressed': String(prefs.binder),
          title: `${prefs.binder ? 'Hide' : 'Show'} the outline (${MOD}⇧\\)`, onclick: toggleBinder,
        }, icon('sidebar')),
        h('button', {
          class: `icon-btn panel-btn ${prefs.inspector ? 'on' : ''}`, 'aria-pressed': String(prefs.inspector),
          title: `${prefs.inspector ? 'Hide' : 'Show'} the side panel (${MOD}\\)`, onclick: toggleInspector,
        }, icon('panel')),
        h('button', { class: 'icon-btn', title: `Focus mode (${MOD}.)`, onclick: toggleFocus }, icon('focus'))),
      h('div', { class: 'bar-cluster', role: 'group', 'aria-label': 'App' },
        lookMenu(),
        h('button', { class: 'icon-btn help-btn', title: 'Help & tour (?)', onclick: () => showHelp() }, icon('help')),
        h('button', { class: 'icon-btn', title: 'Settings', onclick: openSettings }, icon('gear')))),
    renderStageBar());
}

export function fileMenu() {
  const item = (label, fn, hint) => h('button', { role: 'menuitem', onclick: (e) => { e.target.closest('details').open = false; fn(); } }, h('span', null, label), hint && h('kbd', null, hint));
  return h('details', { class: 'menu' },
    h('summary', { class: 'btn small' }, 'File'),
    h('div', { class: 'menu-pop', role: 'menu' },
      item('New project…', cmdNew),
      item('Open…', cmdOpen),
      item(S.canAutosave ? 'Save to a new file…' : 'Save (download)', saveAs, S.canAutosave ? '' : '⌘S'),
      h('hr'),
      item('Import a manuscript…', openImport),
      item('Export or print…', () => openExport(), `${MOD}E`),
      item('Download a backup copy', () => cmdExport('json')),
      item(`Trash${P().trash.length ? ` (${P().trash.length})` : ''}`, () => { state.view = 'trash'; render(); }),
      h('hr'),
      item('Close project', closeProject),
    ));
}

export function renderStatus() {
  const el = document.getElementById('status');
  if (!el || !P()) return;
  const words = M.treeWords(P());
  const parts = [progressRing(words), h('span', { class: 'total' }, `${fmt(words)} words`)];
  const net = state.session ? words - state.session.baseWords : 0;
  if (net) parts.push(h('button', { class: 'session-chip', title: 'This session so far', onclick: () => showSessionSummary() }, `${net > 0 ? '+' : '−'}${fmt(Math.abs(net))} this session`));
  // A day's backup waiting for the browser's OK to write to the backups folder.
  if (state.backupPending && !state.conflict) {
    parts.push(h('button', { class: 'btn small', title: `The browser needs your OK to write today’s backup (${state.backupPending.name}) to your backups folder.`, onclick: () => allowBackup() }, 'Allow backup'));
  }
  if (state.conflict) {
    parts.push(h('button', { class: 'btn small danger', onclick: showConflict }, 'File changed elsewhere'));
  } else if (state.saveError) {
    parts.push(h('button', { class: 'btn small danger', onclick: () => save() }, 'Save failed. Retry'));
  } else if (state.handle) {
    // Enough to know it's safe; the file's name is there on hover.
    const pending = state.dirty || state.saving;
    parts.push(h('span', { class: `saved ${pending ? 'pending' : ''}`, tabindex: 0, 'aria-label': pending ? 'Saving' : `Saved to ${state.fileName}` },
      pending ? 'Saving…' : [icon('check'), 'Saved'],
      h('span', { class: 'saved-file', role: 'tooltip' }, `Saving to ${state.fileName}`)));
  } else if (state.dirty) {
    parts.push(h('button', { class: 'btn small primary', onclick: saveAs }, S.canAutosave ? 'Save to file…' : 'Download to save'));
  } else if (state.fileName) {
    parts.push(h('span', { class: 'saved', tabindex: 0 }, icon('check'), 'Downloaded', h('span', { class: 'saved-file', role: 'tooltip' }, `Last downloaded as ${state.fileName}`)));
  }
  el.replaceChildren(...parts);
}

export function refreshCounts() {
  document.querySelectorAll('[data-wc]').forEach((el) => {
    const id = el.dataset.wc;
    if (P().nodes[id]) el.textContent = fmt(M.treeWords(P(), id));
  });
  trackProgress();
  renderStatus();
  const bar = document.querySelector('[data-progress]');
  if (bar) {
    const n = sel();
    const target = n.id === 'root' ? P().targetWords : n.targetWords;
    bar.style.width = `${Math.min(100, (M.treeWords(P(), n.id) / (target || 1)) * 100)}%`;
  }
}
// ---- the two-line top bar ----------------------------------------------------------------------

export function renderStageBar() {
  const prog = stageProgress();
  const st = stageById(state.stage);
  return h('div', { class: 'topbar-row stage-row' },
    h('button', { class: `desk-btn ${state.view === 'desk' ? 'on' : ''}`, title: 'Your desk: where you are, and what to do next', onclick: goDesk }, icon('home'), 'Desk'),
    h('nav', { class: 'stages', 'aria-label': 'Stages of writing' },
      STAGES.map((s) => h('button', {
        class: `stage ${state.stage === s.id ? 'on' : ''}`, 'aria-current': state.stage === s.id ? 'step' : null,
        title: `${s.label}: ${s.blurb}\n${prog[s.id].line}`,
        style: `--pct:${Math.round(prog[s.id].pct * 100)}%`,
        onclick: () => goStage(s.id),
      }, h('span', { class: 'stage-n' }, s.n), h('span', { class: 'stage-label' }, s.label)))),
    st && h('div', { class: 'tabs subtabs', role: 'tablist', 'aria-label': `${st.label} views` },
      st.views.map(([id, label]) => h('button', {
        class: `tab ${state.view === id ? 'active' : ''}`, role: 'tab', 'aria-selected': String(state.view === id),
        onclick: () => { state.view = id; render(); },
      }, id === 'notebook' && P().notebook.length ? `${label} · ${P().notebook.length}` : label))),
    h('div', { class: 'spacer' }),
    st && h('div', { class: 'stage-guide', title: st.blurb }, prog[st.id].line));
}
