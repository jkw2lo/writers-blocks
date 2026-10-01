import * as AI from '../lib/ai.js';
import { typeCss } from '../ui/theme.js';
import { readScope } from '../views/read.js';

// ---- state -------------------------------------------------------------------

export const state = {
  project: null,
  handle: null, // FileSystemFileHandle when autosaving
  fileName: null,
  backupDir: null, // the daily backups folder (a directory handle), if chosen
  backupPending: null, // a day's copy waiting for folder permission: { name, text, title }
  lastBackup: null,
  fileStamp: null, // file's lastModified as of our last read/write, to spot changes made elsewhere
  conflict: false, // the file changed elsewhere; autosave is paused until the writer decides
  dirty: false,
  saving: false,
  saveError: null,
  selectedId: 'root',
  view: 'desk', // desk | premise | notebook | map | outline | board | write | read | share | trash
  stage: null, // gather | plan | draft | revise | share (null on the Desk)
  focus: false,
  filter: '',
  outlineLevel: 'all',
  undo: [],
  drag: null, // { kind: 'node' | 'note', id }
  aiResults: {}, // nodeId -> { action, loading, error, html, data }
  spark: null, // current brainstorm result { scopeId, kind, ... }
  riffing: null,
  noteFilter: '',
  noteScope: 'all',
  canvasScroll: null,
  shelf: [], // recent projects, for the welcome screen (Chromium only)
  session: null, // this sitting's progress: see startSession()
  drawer: null, // the Echoes / Polish / Story check panel, when open
  readScope: 'root', // what the Read view shows
  mapFolded: new Set(), // branches folded on the Map (independent of the outline)
  mapScroll: null,
  mapAnchor: null, // { id, dx, dy }: keep this card here on screen across a re-layout
  mapFocus: null, // a card to bring into view after the next render
  mapFitted: false,
  multi: new Set(), // blocks selected together in the outline (⌘/Ctrl- or Shift-click)
  anchor: null, // where a Shift-click range starts
};

// Per-device preferences only (never manuscript data).
export const prefs = loadPrefs();
export function loadPrefs() {
  const d = { skin: 'studio', type: {}, typeCss: null, theme: 'auto', aiEnabled: false, model: AI.MODELS[0].id, rememberKey: false, apiKey: '', directionOpen: true, fontSize: 19, notebookLayout: 'grid', zoom: 1, sprintMinutes: 10,
    toured: false, inspector: true, binder: true, spellcheck: true, readTitles: false, readGaps: true, mapDir: 'right', mapDetails: false, mapZoom: 1, exportPrefs: null, sounds: false, soundVolume: 0.5, typewriterScroll: false, fadeRest: false, celebrate: true,
    paraStyle: 'indent', smartPunct: true, autoWordStyles: true };
  try { return { ...d, ...JSON.parse(localStorage.getItem('wb-prefs') || '{}') }; } catch { return d; }
}
export function savePrefs() {
  try {
    const out = { ...prefs };
    if (!out.rememberKey) out.apiKey = '';
    localStorage.setItem('wb-prefs', JSON.stringify(out));
  } catch { /* storage may be unavailable; prefs just won't persist */ }
}
export let sessionKey = prefs.apiKey || '';
// The API key for this tab (set from Settings). A function, so other modules can change it.
export function setSessionKey(key) { sessionKey = key; }
export const aiSettings = () => ({ apiKey: sessionKey, model: prefs.model });

export const P = () => state.project;
export const sel = () => P().nodes[state.selectedId] || P().nodes.root;
