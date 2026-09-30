// Your book lives in a file on your own disk, never in browser storage.
//
// On Chromium browsers (Chrome, Edge, Arc, Brave) we use the File System
// Access API: pick a file once, then every change autosaves straight to it.
// Elsewhere (Safari, Firefox) we fall back to open-from-disk and
// download-to-save.
//
// The only thing kept in the browser is a *handle* to the last file you
// opened (in IndexedDB) so "Reopen" works — it holds no text, and the browser
// still asks your permission before the app can read the file again.

export const canAutosave = 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;

const PICKER_TYPES = [
  { description: 'Writers Blocks project', accept: { 'application/json': ['.json'] } },
];

export const slug = (s) =>
  (s || 'untitled').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'untitled';

export const projectFileName = (title) => `${slug(title)}.wblocks.json`;

// ---- tiny IndexedDB store for the recent file handle ------------------------

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('writers-blocks', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', mode);
    const req = fn(tx.objectStore('handles'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function rememberHandle(handle) {
  try { await idbDo('readwrite', (s) => s.put(handle, 'recent')); } catch { /* optional */ }
}

export async function recentHandle() {
  if (!canAutosave) return null;
  try { return (await idbDo('readonly', (s) => s.get('recent'))) || null; } catch { return null; }
}

export async function forgetRecent() {
  try { await idbDo('readwrite', (s) => s.delete('recent')); } catch { /* optional */ }
}

// ---- file operations ----------------------------------------------------------

async function ensurePermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

export async function readHandle(handle) {
  if (!(await ensurePermission(handle))) throw new Error('Permission to open the file was denied.');
  const file = await handle.getFile();
  return { name: file.name, text: await file.text(), stamp: file.lastModified };
}

// When the file on disk last changed. Comparing this with the stamp from our own
// last read/write tells us if something else (another device syncing through
// iCloud or Dropbox, another tab, another app) has written to it since.
export async function fileStamp(handle) {
  return (await handle.getFile()).lastModified;
}

// Returns the file's new stamp.
export async function writeHandle(handle, text) {
  if (!(await ensurePermission(handle))) throw new Error('Permission to save the file was denied.');
  // createWritable writes to a temp file and swaps on close, so a crash
  // mid-save can't leave you with a half-written book.
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
  return fileStamp(handle);
}

export async function pickSaveHandle(suggestedName) {
  return window.showSaveFilePicker({ suggestedName, types: PICKER_TYPES });
}

export async function pickOpen() {
  if (canAutosave) {
    const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
    const { name, text, stamp } = await readHandle(handle);
    return { handle, name, text, stamp };
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return reject(new DOMException('No file', 'AbortError'));
      resolve({ handle: null, name: file.name, text: await file.text() });
    };
    input.click();
  });
}

export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
