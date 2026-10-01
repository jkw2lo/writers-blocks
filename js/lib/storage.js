// Your book lives in a file on your own disk, never in browser storage.
//
// On Chromium browsers (Chrome, Edge, Arc, Brave) we use the File System
// Access API: pick a file once, then every change autosaves straight to it.
// Elsewhere (Safari, Firefox) we fall back to open-from-disk and
// download-to-save.
//
// The browser keeps only a *shelf* of recent projects (in IndexedDB) so you can
// reopen them: for each, a handle pointing to the file plus its title, word
// count and when you last opened it. No text: the handle is just a pointer, and
// the browser still asks your permission before the app can read the file again.

export const canAutosave = 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;

const PICKER_TYPES = [
  { description: 'Writers Blocks project', accept: { 'application/json': ['.json'] } },
];

export const slug = (s) =>
  (s || 'untitled').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'untitled';

export const projectFileName = (title) => `${slug(title)}.wblocks.json`;

// ---- the shelf: recent projects, in IndexedDB --------------------------------

const SHELF_MAX = 12;

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

async function readShelf() {
  let list = (await idbDo('readonly', (s) => s.get('shelf'))) || [];
  // Earlier versions remembered just one file under 'recent'; move it onto the shelf.
  const old = await idbDo('readonly', (s) => s.get('recent'));
  if (old) {
    if (!list.length) list = [{ id: newId(), handle: old, name: old.name, title: old.name.replace(/\.wblocks\.json$|\.json$/, ''), opened: Date.now() }];
    await idbDo('readwrite', (s) => { s.put(list, 'shelf'); return s.delete('recent'); });
  }
  return list;
}
const writeShelf = (list) => idbDo('readwrite', (s) => s.put(list, 'shelf'));
const newId = () => Math.random().toString(36).slice(2, 10);

async function findEntry(list, handle) {
  for (const e of list) {
    try { if (await e.handle.isSameEntry(handle)) return e; } catch { /* stale handle */ }
  }
  return null;
}

// Recent projects, most recently opened first. Empty where handles aren't supported.
export async function shelf() {
  if (!canAutosave) return [];
  try { return (await readShelf()).sort((a, b) => b.opened - a.opened); } catch { return []; }
}

// Add a project to the shelf, or update it. meta: { title, words, target }; opened: bump to the front.
export async function shelve(handle, meta = {}, { opened = false } = {}) {
  if (!canAutosave || !handle) return;
  try {
    const list = await readShelf();
    let e = await findEntry(list, handle);
    if (!e) { e = { id: newId(), handle, opened: Date.now() }; list.push(e); }
    Object.assign(e, meta, { handle, name: handle.name });
    if (opened) e.opened = Date.now();
    list.sort((a, b) => b.opened - a.opened);
    await writeShelf(list.slice(0, SHELF_MAX));
  } catch { /* the shelf is a convenience; never block saving on it */ }
}

export async function unshelve(id) {
  try { await writeShelf((await readShelf()).filter((e) => e.id !== id)); } catch { /* optional */ }
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

// ---- daily backups ----------------------------------------------------------------
// A folder you choose once. Before the first save on a new day, the project file as it
// stood at the end of your last writing day is copied there as
// "<title>-YYYY-MM-DD.wblocks.json"; only the newest few per project are kept.

export const canBackup = canAutosave && 'showDirectoryPicker' in window;

export async function pickBackupDir(startIn) {
  const dir = await window.showDirectoryPicker({ id: 'wb-backups', mode: 'readwrite', startIn: startIn || 'documents' });
  try { await idbDo('readwrite', (s) => s.put(dir, 'backupDir')); } catch { /* still usable this session */ }
  return dir;
}

export async function backupDir() {
  if (!canBackup) return null;
  try { return (await idbDo('readonly', (s) => s.get('backupDir'))) || null; } catch { return null; }
}

export async function forgetBackupDir() {
  try { await idbDo('readwrite', (s) => s.delete('backupDir')); } catch { /* optional */ }
}

// ask: may show the browser's permission prompt (needs a click to have just happened).
export async function dirPermission(dir, ask = false) {
  const opts = { mode: 'readwrite' };
  if ((await dir.queryPermission(opts)) === 'granted') return true;
  return ask && (await dir.requestPermission(opts)) === 'granted';
}

export const backupName = (title, day) => `${slug(title)}-${day}.wblocks.json`;

export async function writeBackup(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

// This project's backups, newest first: [{ name, day }]
export async function listBackups(dir, title) {
  const prefix = `${slug(title)}-`;
  const out = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file' || !name.startsWith(prefix)) continue;
    const m = /^(\d{4}-\d{2}-\d{2})\.wblocks\.json$/.exec(name.slice(prefix.length));
    if (m) out.push({ name, day: m[1] });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}

// Keep the newest `keep` backups of this project; remove older ones.
export async function pruneBackups(dir, title, keep = 5) {
  const list = await listBackups(dir, title);
  for (const b of list.slice(keep)) await dir.removeEntry(b.name);
  return list.slice(0, keep);
}
