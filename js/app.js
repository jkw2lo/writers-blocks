// Writers Blocks: start-up, global keys, and offline support. Everything else lives in
// core/ (state, DOM helpers), project/ (files, sync, progress, commands, stages),
// ui/ (shell, panels, menus, dialogs), views/ (one file per view) and lib/ (model & services).

import { toast } from './core/dom.js';
import { state } from './core/state.js';
import { select } from './project/commands.js';
import { refreshShelf, save, saveAs } from './project/files.js';
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
