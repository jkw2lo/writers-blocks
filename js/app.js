// Writers Blocks: start-up, global keys, and offline support. Everything else lives in
// core/ (state, DOM helpers), project/ (files, sync, progress, commands, stages),
// ui/ (shell, panels, menus, dialogs), views/ (one file per view) and lib/ (model & services).

import { toast } from './core/dom.js';
import { prefs, state } from './core/state.js';
import { select } from './project/commands.js';
import { closeProject, cmdSample, refreshShelf, save, saveAs } from './project/files.js';
import { goDesk, goStage } from './project/flow.js';
import { shelf } from './lib/storage.js';
import { loadBackupDir } from './project/backups.js';
import { openExport } from './ui/export-dialog.js';
import { app, render } from './ui/shell.js';
import { applyTheme, toggleBinder, toggleFocus, toggleInspector } from './ui/theme.js';
import { mapDelete } from './views/map.js';
import './core/state.js';
import './core/dom.js';
import './core/undo.js';
import './project/files.js';
import './project/backups.js';
import './ui/export-dialog.js';
import './project/sync.js';
import './project/progress.js';
import './ui/help-tour.js';
import './ui/writing-aids.js';
import './project/commands.js';
import './ui/drag-drop.js';
import './ui/shell.js';
import './views/welcome.js';
import './ui/topbar.js';
import './ui/binder.js';
import './ui/menus.js';
import './views/write.js';
import './views/board.js';
import './views/outline.js';
import './views/notebook.js';
import './ui/brainstorm.js';
import './ui/inspector.js';
import './ui/settings.js';
import './ui/theme.js';
import './ui/tools.js';
import './views/read.js';
import './views/trash.js';
import './ui/import-dialog.js';
import './views/map.js';
import './project/flow.js';
import './views/desk.js';
import './views/share.js';

// ---- a demo for visitors from Jen's portfolio (js/demo-welcome.js) ---------------------
// The sample is only ever in memory, never saved, so the demo lasts while it's open. The demo
// has its own walk round the stages, so the first-project tour (help-tour.js) sits this one out;
// it's still in Help, and a visitor's own first project still gets it.

const SAMPLE = 'The Salt Year';
window.DemoWelcome?.init({
  id: 'writers-blocks',
  name: 'Writers Blocks',
  accent: '#b5502a',
  demo: 'The Salt Year, a novel taking shape: an outline of 14 blocks from idea to revising, with notes.',
  fresh: 'An empty desk. Start a project, open one, or import a manuscript.',
  isEmpty: async () => !state.project && !(await shelf()).length,
  loadDemo: async () => {
    const toured = prefs.toured;
    prefs.toured = true; // just for this opening, not saved
    await cmdSample();
    setTimeout(() => { prefs.toured = toured; }, 1000);
  },
  clear: () => { state.dirty = false; closeProject(); },
  stillDemo: () => state.project?.nodes?.root?.title === SAMPLE,
  tour: [
    { go: goDesk, el: 'main.main', title: 'Your desk',
      text: 'It reads the book and suggests a next step, like the block to keep writing or a part ready to read through. It suggests; you choose.' },
    { el: '.stages', title: 'Five stages of a book',
      text: 'Gather the idea, plan its shape, draft it, revise it, share it. Each stage shows only its own views.' },
    { go: () => { state.view = 'map'; state.stage = 'plan'; render(); }, el: 'main.main', title: 'The map',
      text: 'The whole book as a tree, with each block’s status and word count. Drag cards to restructure it.' },
    { go: () => { state.view = 'board'; state.stage = 'plan'; render(); }, el: 'main.main', title: 'The board',
      text: 'Index cards for the pieces of a chapter. Drag to reorder them, and edit what happens right on the card.' },
    { go: () => goStage('draft'), el: '.direction', title: 'Every block has a direction',
      text: 'What happens, and why it’s here, keep each section pointed somewhere, with the blocks before and after it close by.' },
    { el: '.inspector .spark', title: 'Ideas when you’re stuck',
      text: 'Brainstorm deals prompts, runs freewriting sprints and collides ideas, all about the block you’re on.' },
    { go: () => { state.view = 'share'; state.stage = 'share'; render(); }, el: 'main.main', title: 'Export, print and share',
      text: 'A reading copy, a draft to mark up, the outline or a progress snapshot, as PDF, Word, Markdown or a web page.' },
    { go: () => goStage('draft'), title: 'Over to you',
      text: 'It’s all real: write, move blocks around, try a different skin. Nothing is saved unless you save it, and Start fresh at the bottom left gives you an empty desk.' },
  ],
});

// ---- global keys & lifecycle ------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (!state.project) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); state.handle ? save() : saveAs(); }
  if (mod && e.key === '.') { e.preventDefault(); toggleFocus(); }
  if (state.view === 'map' && (e.key === 'Delete' || e.key === 'Backspace') && !mod && state.selectedId !== 'root'
    && !e.target.closest?.('input, textarea, select, [contenteditable="true"], .map-card, dialog') && !document.querySelector('dialog[open], .ctx')) {
    e.preventDefault();
    mapDelete(state.selectedId);
  }
  if (mod && !e.shiftKey && e.key === '\\') { e.preventDefault(); toggleInspector(); }
  if (mod && e.shiftKey && (e.key === '|' || e.key === '\\')) { e.preventDefault(); toggleBinder(); }
  if (mod && e.key.toLowerCase() === 'e' && !document.querySelector('dialog[open]')) { e.preventDefault(); openExport(); }
  if (e.key === 'Escape' && state.focus) toggleFocus();
});

// Close popover menus on an outside click.
document.addEventListener('click', (e) => {
  document.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
});

window.addEventListener('beforeunload', (e) => {
  if (state.project && (state.dirty || state.saving)) {
    if (state.handle) save();
    e.preventDefault();
  }
});
// ---- offline ---------------------------------------------------------------------------
// sw.js caches the app so it opens with no connection. Once it's in place, fetch every
// skin's fonts in the background too, so switching skins offline still looks right.

const SKIN_FONTS = ['Inter', 'Literata', 'Geist', 'Courier Prime', 'Special Elite', 'IBM Plex Mono', 'EB Garamond', 'Cormorant Garamond', 'Fraunces', 'Lora', 'Nunito Sans'];
function warmFonts() {
  const faces = SKIN_FONTS.flatMap((f) => [`400 16px "${f}"`, `600 16px "${f}"`, `italic 400 16px "${f}"`]);
  Promise.allSettled(faces.map((f) => document.fonts.load(f)));
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(async (reg) => {
    const first = !navigator.serviceWorker.controller;
    await navigator.serviceWorker.ready;
    (window.requestIdleCallback || setTimeout)(warmFonts);
    if (first && reg.active) toast('Writers Blocks now works offline.');
  }).catch(() => { /* offline support is a bonus; the app works without it */ });
}

applyTheme();
refreshShelf();
loadBackupDir();
render();
