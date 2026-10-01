import * as M from '../lib/model.js';
import { textToHtml, toast } from '../core/dom.js';
import { P, state } from '../core/state.js';
import { snapshot } from '../core/undo.js';
import { changed } from './files.js';
import { blockDone } from './progress.js';
import { startRename } from '../ui/binder.js';
import { render } from '../ui/shell.js';
import { anchorMap, startMapRename } from '../views/map.js';

// ---- structural commands -------------------------------------------------------

export function select(id, view) {
  state.selectedId = id;
  if (view) state.view = view;
  render();
}

// Adding a block keeps you where you are: it appears in the outline with its name
// ready to type, so you can sketch the big pieces without being pulled into one.
export function addChild(parentId, type) {
  snapshot();
  const n = M.addNode(P(), parentId, type);
  changed();
  afterAdd(n);
  return n;
}

export function addAfter(id) {
  snapshot();
  const n = M.addSiblingAfter(P(), id);
  changed();
  afterAdd(n);
  return n;
}

export function afterAdd(n) {
  if (state.view === 'map') {
    // Keep the card you clicked + on still (the + buttons set it); otherwise its neighbour.
    if (!state.mapAnchor) {
      const parent = M.parentOf(P(), n.id);
      const i = parent.children.indexOf(n.id);
      anchorMap(parent.children[i - 1] || parent.id);
    }
    state.mapFocus = n.id;
  }
  render();
  if (state.view === 'map' && startMapRename(n.id, { fresh: true })) return;
  const card = state.view === 'board' && document.querySelector(`.card[data-id="${n.id}"] .card-title`);
  if (card) { card.focus(); card.select(); return; }
  if (!startRename(n.id, { fresh: true })) toast(`Added “${n.title}” to “${M.parentOf(P(), n.id).title}”.`, { undo: true });
}

export function focusTitle() {
  requestAnimationFrame(() => {
    const t = document.querySelector('.title-input') || document.querySelector(`.card[data-id="${state.selectedId}"] .card-title`);
    t?.focus();
    t?.select?.();
  });
}

// The outermost of the given blocks (drop any that sit inside another), in book order.
export function outermost(ids) {
  const set = new Set(ids);
  return M.flatten(P()).map((x) => x.node.id).filter((id) => set.has(id) && !M.ancestors(P(), id).some((a) => set.has(a.id)));
}

export function removeNodes(ids) {
  const p = P();
  ids = outermost(ids.filter((id) => id !== 'root'));
  if (!ids.length) return;
  // Nothing is lost: deleted blocks go to the Trash, so no confirmation needed.
  const name = ids.length === 1 ? `“${p.nodes[ids[0]].title}”` : `${ids.length} blocks`;
  snapshot();
  const fallback = M.parentOf(p, ids[0])?.id || 'root';
  for (const id of ids) { M.trashNode(p, id); delete state.aiResults[id]; }
  state.multi.clear();
  if (!p.nodes[state.selectedId]) state.selectedId = p.nodes[fallback] ? fallback : 'root';
  changed();
  render();
  toast(`Moved ${name} to the Trash.`, { undo: true });
}
export const removeNode = (id) => removeNodes([id]);

export function setKind(ids, type) {
  snapshot();
  ids.forEach((id) => (P().nodes[id].type = type));
  changed();
  render();
  toast(`${ids.length > 1 ? `${ids.length} blocks are` : `“${P().nodes[ids[0]].title}” is`} now ${ids.length > 1 ? `${M.TYPES[type].label.toLowerCase()}s` : `a ${M.TYPES[type].label.toLowerCase()}`}.`, { undo: true });
}

export function setStatus(ids, status) {
  const finished = ids.map((id) => P().nodes[id]).filter((n) => status === 'done' && n.status !== 'done');
  ids.forEach((id) => (P().nodes[id].status = status));
  changed();
  render();
  if (finished.length) blockDone(finished[finished.length - 1]);
}

// Take blocks out of the structure and into the notebook, for pieces that don't have a
// home yet. A part or chapter becomes a labelled cluster: a label note with its title,
// then one note per piece inside (title, synopsis, text). Undo puts it all back.
export function moveToNotebook(ids) {
  const p = P();
  ids = outermost(ids.filter((id) => id !== 'root'));
  if (!ids.length) return;
  snapshot();
  const placed = p.notebook.filter((nt) => nt.x != null);
  let x = placed.length ? Math.max(...placed.map((nt) => nt.x)) + 300 : 60;
  let made = 0;
  for (const id of ids) {
    const top = p.nodes[id];
    let y = 60;
    const batch = [];
    const keep = (n) => ({ title: n.title, type: n.type, synopsis: n.synopsis, purpose: n.purpose, notes: n.notes, content: n.content, status: n.status, targetWords: n.targetWords, tags: [...n.tags] });
    const add = (text, extra, node) => {
      batch.push(M.makeNote(text, { source: 'outline', x, y, ...extra, ...(node && { block: keep(node), blockText: text }) }));
      y += extra.color === 'label' ? 70 : 150;
      made += 1;
    };
    const textOf = (n) => [n.title, n.synopsis, M.stripHtml(n.content).trim()].filter(Boolean).join('\n\n');
    if (top.children.length) {
      add(top.title, { color: 'label' }, top);
      const inner = M.flatten(p, id).filter(({ node }) => node.synopsis.trim() || node.content || !node.children.length);
      for (const { node } of inner) add(textOf(node), { color: node.children.length ? 'peach' : 'yellow' }, node);
    } else {
      add(textOf(top), { color: 'yellow' }, top);
    }
    // The grid lists newest first, so add them last-to-first: the label reads as the cluster's heading.
    p.notebook.push(...batch.reverse());
    M.deleteNode(p, id);
    delete state.aiResults[id];
    x += 300;
  }
  state.multi.clear();
  if (!p.nodes[state.selectedId]) state.selectedId = 'root';
  changed();
  if (state.view === 'map') {
    const wrap = document.querySelector('.map-wrap');
    if (wrap) state.mapScroll = { left: wrap.scrollLeft, top: wrap.scrollTop };
  }
  render();
  toast(`Moved to the notebook as ${made} note${made === 1 ? '' : 's'}. When it finds its place, use “Make it a block”.`, { undo: true });
}

export function moveInto(ids, parentId) {
  const p = P();
  ids = outermost(ids);
  if (ids.some((id) => id === parentId || M.isDescendant(p, parentId, id))) return toast("A block can't be moved inside itself.");
  snapshot();
  for (const id of ids) M.moveNode(p, id, parentId, p.nodes[parentId].children.length);
  changed();
  render();
  toast(`Moved ${ids.length > 1 ? `${ids.length} blocks` : `“${p.nodes[ids[0]].title}”`} into ${parentId === 'root' ? 'the top level' : `“${p.nodes[parentId].title}”`}.`, { undo: true });
}

export function shift(id, dir) {
  const parent = M.parentOf(P(), id);
  const i = parent.children.indexOf(id);
  const j = i + dir;
  if (j < 0 || j >= parent.children.length) return;
  snapshot();
  M.moveNode(P(), id, parent.id, dir > 0 ? j + 1 : j);
  changed();
  render();
}

export function mergeNext(id) {
  const parent = M.parentOf(P(), id);
  const next = P().nodes[parent.children[parent.children.indexOf(id) + 1]];
  if (!next) return toast('There is no next block at this level to merge.');
  snapshot();
  M.mergeWithNext(P(), id);
  changed();
  render();
  toast(`Merged “${next.title}” into this block.`, { undo: true });
}

export function splitAtCursor() {
  const ed = document.querySelector('.editor');
  const s = getSelection();
  if (!ed || !s.rangeCount || !ed.contains(s.anchorNode)) {
    return toast('Click in the text where you want to split, then press Split.');
  }
  snapshot();
  const r = s.getRangeAt(0);
  const tail = document.createRange();
  tail.setStart(r.startContainer, r.startOffset);
  tail.setEnd(ed, ed.childNodes.length);
  const box = document.createElement('div');
  box.append(tail.extractContents());
  const clean = (html) => html.replace(/^(\s*<(p|div)>(\s|<br>)*<\/\2>)+|(<(p|div)>(\s|<br>)*<\/\5>\s*)+$/g, '');
  const next = M.splitNode(P(), state.selectedId, clean(ed.innerHTML), clean(box.innerHTML));
  changed();
  select(next.id);
  toast('Split into two blocks. Give the new one a title.', { undo: true });
  focusTitle();
}

// Turn a note's text into a block: a short title (never cut mid-word), and the words where
// they'll show. An idea-sized note becomes the synopsis (visible on the Map, Board and
// Outline); a long one (a freewrite, say) becomes the draft, with its opening as synopsis.
export function splitNote(text) {
  const t = text.trim();
  if (!t) return { title: 'From notebook', synopsis: '', content: '' };
  const lines = t.split('\n');
  const first = lines[0].trim();
  const sentence = (/^.*?[.!?…](?=\s|$)/s.exec(t)?.[0] || first).trim();
  const words = first.split(/\s+/);
  let title;
  let rest;
  if (first.length <= 70) { title = first; rest = lines.slice(1).join('\n').trim(); }
  else if (sentence.length <= 70) { title = sentence.replace(/[.]$/, ''); rest = t; }
  else { title = `${words.slice(0, 8).join(' ')}…`; rest = t; }
  if (t.length <= 320) return { title, synopsis: rest, content: '' };
  const opening = (/^[\s\S]{0,240}[.!?](?=\s|$)/.exec(rest)?.[0] || rest.slice(0, 200).replace(/\s+\S*$/, '…')).trim();
  return { title, synopsis: opening, content: textToHtml(rest) };
}

export function placeNote(noteId, parentId, index = null) {
  const note = P().notebook.find((n) => n.id === noteId);
  if (!note) return;
  snapshot();
  const parent = P().nodes[parentId];
  // A note that came from the outline (and wasn't edited since) comes back exactly as it was.
  const saved = note.block && note.text === note.blockText ? note.block : null;
  const parts = saved ? null : splitNote(note.text);
  const n = M.addNode(P(), parentId, M.TYPES[parent.type].child, index, saved ? saved.title : parts.title);
  if (saved) {
    Object.assign(n, { synopsis: saved.synopsis || '', purpose: saved.purpose || '', notes: saved.notes || '', content: saved.content || '', status: saved.status || 'idea', targetWords: saved.targetWords || 0, tags: saved.tags || [] });
  } else {
    n.synopsis = parts.synopsis;
    n.content = parts.content;
  }
  M.removeNote(P(), noteId);
  changed();
  render();
  toast(`Placed in “${parent.title}”.`, { undo: true });
}
