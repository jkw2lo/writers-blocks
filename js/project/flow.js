import * as M from '../lib/model.js';
import { fmt } from '../core/dom.js';
import { P, sel, state } from '../core/state.js';
import { snapshot } from '../core/undo.js';
import { render } from '../ui/shell.js';

// ---- stages: the flow of writing a book -------------------------------------------------------
// Gather → Plan → Draft → Revise → Share. Each stage shows only its own views, and the
// side panel follows it. You move between stages yourself; the Desk only suggests.

export const STAGES = [
  { id: 'gather', n: 1, label: 'Gather', blurb: 'Find the idea: premise, fragments, what-ifs.', views: [['premise', 'Premise'], ['notebook', 'Notebook']] },
  { id: 'plan', n: 2, label: 'Plan', blurb: 'Give it a shape, and every piece a direction.', views: [['map', 'Map'], ['outline', 'Outline'], ['board', 'Board']] },
  { id: 'draft', n: 3, label: 'Draft', blurb: 'Write it, one block at a time.', views: [['write', 'Write'], ['notebook', 'Notebook']] },
  { id: 'revise', n: 4, label: 'Revise', blurb: 'Read it through and make it good.', views: [['read', 'Read'], ['write', 'Write']] },
  { id: 'share', n: 5, label: 'Share', blurb: 'Export, print, and show where it stands.', views: [['share', 'Share'], ['read', 'Read']] },
];
export const stageById = (id) => STAGES.find((s) => s.id === id);
export const DEFAULT_STAGE = { premise: 'gather', notebook: 'gather', map: 'plan', outline: 'plan', board: 'plan', write: 'draft', read: 'revise', share: 'share' };

// Keep the stage in step with the view, whichever way you got there (a click in the outline,
// a double-click on the map…): stay in the current stage if it has this view.
export function syncStage() {
  if (state.view === 'desk') { state.stage = null; return; }
  if (state.view === 'trash') return;
  const cur = stageById(state.stage);
  if (cur && cur.views.some(([v]) => v === state.view)) return;
  state.stage = DEFAULT_STAGE[state.view] || state.stage || 'draft';
}

export function goStage(id) {
  const st = stageById(id);
  state.stage = id;
  if (!st.views.some(([v]) => v === state.view)) state.view = st.views[0][0];
  // Drafting starts on something to write, not the book overview.
  if (id === 'draft' && (state.selectedId === 'root' || sel().children.length)) {
    const next = nextUp();
    if (next) state.selectedId = next.id;
  }
  render();
}

export function goDesk() {
  state.view = 'desk';
  state.multi.clear();
  render();
}
// ---- reading the project ---------------------------------------------------------------------

export const leavesOf = (p) => M.flatten(p).map((x) => x.node).filter((n) => !n.children.length);
export const blockWords = (n) => M.nodeWords(n);

// The block to write next: the one you were last working on (if unfinished), else the first
// unwritten one in book order.
export function nextUp() {
  const p = P();
  const leaves = leavesOf(p);
  const recent = leaves.filter((n) => n.editedAt && n.status !== 'done' && !(n.targetWords && blockWords(n) >= n.targetWords))
    .sort((a, b) => b.editedAt.localeCompare(a.editedAt))[0];
  return recent || leaves.find((n) => !n.content) || leaves.find((n) => n.status !== 'done') || null;
}

// The next block in book order after this one (for "Next up" at the end of a draft).
export function nextInOrder(id) {
  const leaves = leavesOf(P());
  const order = M.flatten(P()).map((x) => x.node.id);
  const at = order.indexOf(id);
  return leaves.find((n) => order.indexOf(n.id) > at) || null;
}

export function stageProgress() {
  const p = P();
  const root = p.nodes.root;
  const all = M.flatten(p).map((x) => x.node);
  const leaves = leavesOf(p);
  const words = M.treeWords(p);
  const ideas = p.notebook.length;
  const directed = all.filter((n) => n.synopsis.trim()).length;
  const written = leaves.filter((n) => n.content).length;
  const revised = leaves.filter((n) => n.status === 'revising' || n.status === 'done').length;
  const done = leaves.filter((n) => n.status === 'done').length;
  const s = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  return {
    gather: {
      pct: (root.synopsis.trim() ? 0.6 : 0) + Math.min(0.4, ideas / 25),
      line: root.synopsis.trim() ? `Premise written · ${s(ideas, 'idea', 'ideas')} in the notebook` : 'Start with a premise: what happens, and what it’s really about.',
    },
    plan: {
      pct: all.length ? directed / all.length : 0,
      line: all.length <= 3 ? 'Sketch the parts and chapters on the Map.' : `${directed} of ${all.length} blocks have a direction`,
    },
    draft: {
      pct: p.targetWords ? Math.min(1, words / p.targetWords) : leaves.length ? written / leaves.length : 0,
      line: `${written} of ${s(leaves.length, 'section', 'sections')} drafted · ${fmt(words)}${p.targetWords ? ` of ${fmt(p.targetWords)}` : ''} words`,
    },
    revise: {
      pct: leaves.length ? revised / leaves.length : 0,
      line: written ? `${revised} of ${s(written, 'drafted section', 'drafted sections')} revised` : 'Nothing drafted yet to revise.',
    },
    share: {
      pct: leaves.length ? done / leaves.length : 0,
      line: `${done} of ${s(leaves.length, 'section', 'sections')} marked done`,
    },
  };
}

// What to do next, most useful first. The Desk shows these; it never moves you by itself.
export function suggestions() {
  const p = P();
  const root = p.nodes.root;
  const all = M.flatten(p).map((x) => x.node);
  const leaves = leavesOf(p);
  const out = [];
  const add = (s) => out.push(s);
  const write = (n) => () => { state.selectedId = n.id; state.view = 'write'; state.stage = 'draft'; render(); };

  if (!root.synopsis.trim()) {
    add({ stage: 'gather', title: 'Start here: write your premise', body: 'Two or three sentences: what happens, and what it’s really about. It keeps every later choice pointed somewhere.', label: 'Write the premise', go: () => { state.view = 'premise'; state.stage = 'gather'; render(); } });
  }
  if (all.length <= 3) {
    add({ stage: 'plan', title: 'Sketch the big pieces', body: 'Lay out the parts and chapters you imagine on the Map. Rough is fine; you’ll move things around.', label: 'Open the Map', go: () => goStage('plan') });
  }
  const next = nextUp();
  if (next) {
    const w = blockWords(next);
    const where = M.ancestors(p, next.id).filter((a) => a.id !== 'root').map((a) => a.title).join(' › ');
    add({
      stage: 'draft',
      title: next.content ? `Continue: ${next.title}` : `Start drafting: ${next.title}`,
      body: [where, next.content ? `${fmt(w)}${next.targetWords ? ` of ${fmt(next.targetWords)}` : ''} words so far` : next.synopsis || 'Not started yet.'].filter(Boolean).join(' · '),
      label: next.content ? 'Keep writing' : 'Start writing',
      go: write(next),
    });
  }
  const undirected = all.filter((n) => n.type !== 'section' && !n.synopsis.trim());
  if (undirected.length && all.length > 3) {
    add({ stage: 'plan', title: `Give ${undirected.length} ${undirected.length === 1 ? M.TYPES[undirected[0].type].label.toLowerCase() : 'parts and chapters'} a direction`, body: `${undirected.slice(0, 3).map((n) => `“${n.title}”`).join(', ')}${undirected.length > 3 ? '…' : ''} still need a “what happens”.`, label: 'Plan in the Outline', go: () => { state.view = 'outline'; state.stage = 'plan'; render(); } });
  }
  // A whole part (or chapter, when there are no parts) drafted but not yet revised: read it.
  const units = all.filter((n) => n.type === 'part').length ? all.filter((n) => n.type === 'part') : all.filter((n) => n.type === 'chapter');
  const ripe = units.find((u) => {
    const ls = M.flatten(p, u.id).map((x) => x.node).filter((n) => !n.children.length);
    return ls.length && ls.every((n) => n.content) && !ls.every((n) => n.status === 'revising' || n.status === 'done');
  });
  if (ripe) {
    add({ stage: 'revise', title: `${ripe.title} is drafted. Read it through.`, body: 'Read it as a reader would, start to finish, before changing anything. Echoes and Story check can help after.', label: 'Read it', go: () => { state.readScope = ripe.id; state.view = 'read'; state.stage = 'revise'; render(); } });
  }
  if (leaves.length && leaves.every((n) => n.status === 'done')) {
    add({ stage: 'share', title: 'Every section is done. Share it.', body: 'Export a clean manuscript, or a progress snapshot for your readers.', label: 'Share', go: () => goStage('share') });
  }
  // Put the most natural next move first: once drafting has begun, keep writing.
  const drafting = leaves.some((n) => n.content);
  if (drafting && root.synopsis.trim()) out.sort((a, b) => (b.stage === 'draft') - (a.stage === 'draft'));
  return out;
}
