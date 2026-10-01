// Project data model: a tree of blocks (book → parts → chapters → sections)
// plus a notebook of loose fragments. Everything here is plain JSON so the
// whole project serializes to a single file.

export const FORMAT = 'writers-blocks';
export const FORMAT_VERSION = 1;

export const TYPES = {
  book: { label: 'Book', child: 'part' },
  part: { label: 'Part', child: 'chapter' },
  chapter: { label: 'Chapter', child: 'section' },
  section: { label: 'Section', child: 'section' },
};

export const STATUSES = [
  { id: 'idea', label: 'Idea' },
  { id: 'outlined', label: 'Outlined' },
  { id: 'drafting', label: 'Drafting' },
  { id: 'revising', label: 'Revising' },
  { id: 'done', label: 'Done' },
];

export const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5);

const now = () => new Date().toISOString();

export function makeNode(type = 'section', title = '') {
  return {
    id: uid(),
    type,
    title: title || `Untitled ${TYPES[type].label.toLowerCase()}`,
    synopsis: '',
    purpose: '',
    notes: '',
    content: '',
    status: 'idea',
    targetWords: 0,
    tags: [],
    children: [],
    collapsed: false,
  };
}

// Starting shapes for a new project. Each is a scaffold, not a rulebook: the
// "why it's here" lines are prompts to overwrite, and everything can be renamed,
// moved, split or deleted. Nodes are [type, title, purpose, children?].
export const SHAPES = {
  blank: {
    label: 'A blank page', blurb: 'One part, one chapter, one section. Build the shape as you go.', target: 80000,
    tree: [['part', 'Part One', '', [['chapter', 'Chapter 1', '', [['section', 'Opening', '']]]]]],
  },
  novel: {
    label: 'Novel in three acts', blurb: 'Setup, confrontation, resolution, with the classic turning points as chapters.', target: 80000,
    tree: [
      ['part', 'Act One: Setup', 'Who is this about, what do they want, and what upends their world?', [
        ['chapter', 'The ordinary world', 'Show the protagonist before everything changes. What’s missing for them?'],
        ['chapter', 'The inciting incident', 'The event that starts the story. Why can’t they ignore it?'],
        ['chapter', 'Crossing the threshold', 'The choice that commits them. There’s no going back.'],
      ]],
      ['part', 'Act Two: Confrontation', 'Rising stakes. What stands in the way, and how does the protagonist change?', [
        ['chapter', 'New rules', 'The protagonist in unfamiliar territory: allies, enemies, tests.'],
        ['chapter', 'The midpoint', 'A reversal or revelation that changes what the story is about.'],
        ['chapter', 'Things fall apart', 'The plan fails. The lowest point.'],
      ]],
      ['part', 'Act Three: Resolution', 'The final confrontation, and who the protagonist is at the end.', [
        ['chapter', 'The climax', 'Everything the story set up, paid off.'],
        ['chapter', 'The new normal', 'What changed? Echo the opening to show it.'],
      ]],
    ],
  },
  memoir: {
    label: 'Memoir', blurb: 'Before, the turn, after: a life organised around the change at its centre.', target: 70000,
    tree: [
      ['part', 'Before', 'The world and the self as they were. What did you believe then?', [
        ['chapter', 'Where it starts', 'An opening scene that hints at what’s coming.'],
        ['chapter', 'How things were', 'The people, place and habits the book will disturb.'],
      ]],
      ['part', 'The turn', 'The event or season everything pivots on.', [
        ['chapter', 'What happened', 'Tell it in scene. Let the reader live it with you.'],
        ['chapter', 'The aftermath', 'The immediate cost, and what you didn’t understand yet.'],
      ]],
      ['part', 'After', 'Who you became, and what you know now that you didn’t then.', [
        ['chapter', 'Making sense of it', 'Reflection: the older narrator looking back.'],
        ['chapter', 'Where it leaves us', 'An ending that answers the opening.'],
      ]],
    ],
  },
  essays: {
    label: 'Essay collection', blurb: 'Stand-alone essays grouped into movements, each with its own argument.', target: 60000,
    tree: [
      ['part', 'I', 'What ties these essays together? Name the thread.', [
        ['chapter', 'First essay', 'The essay that best introduces the collection’s question.'],
        ['chapter', 'Second essay', 'What does this add, complicate or argue against?'],
      ]],
      ['part', 'II', 'How does the collection’s question deepen here?', [
        ['chapter', 'Third essay', ''],
        ['chapter', 'Fourth essay', ''],
      ]],
    ],
  },
  nonfiction: {
    label: 'Nonfiction argument', blurb: 'A problem, the evidence, what to do about it. For ideas books and long-form journalism.', target: 70000,
    tree: [
      ['part', 'Introduction', 'The hook, the question, and the promise: what will the reader understand by the end?', [
        ['chapter', 'Why this matters now', ''],
      ]],
      ['part', 'The problem', 'Make the reader feel the problem before you explain it.', [
        ['chapter', 'A story that shows it', 'Open with a person or a scene, not a statistic.'],
        ['chapter', 'How we got here', ''],
      ]],
      ['part', 'The evidence', 'Your argument, one claim per chapter.', [
        ['chapter', 'First claim', ''],
        ['chapter', 'Second claim', ''],
        ['chapter', 'The strongest objection', 'Steelman the other side, then answer it.'],
      ]],
      ['part', 'What to do', 'What changes if the reader believes you?', [
        ['chapter', 'Conclusion', 'Return to the opening story, changed by everything since.'],
      ]],
    ],
  },
  story: {
    label: 'Short story', blurb: 'A handful of scenes in a single chapter, for pieces up to about 10,000 words.', target: 6000,
    tree: [['chapter', 'The story', 'In one sentence: who wants what, and what gets in the way?', [
      ['section', 'Opening scene', 'Start as late as you can. What’s the first sign of trouble?'],
      ['section', 'Complication', 'Make it worse.'],
      ['section', 'Crisis', 'The moment a choice has to be made.'],
      ['section', 'Ending', 'What changed? Trust the reader.'],
    ]]],
  },
};

export function newProject(title = 'Untitled Book', shape = 'blank') {
  const root = makeNode('book', title);
  root.id = 'root';
  const nodes = { root };
  const build = ([type, name, purpose, kids = []]) => {
    const n = makeNode(type, name);
    n.purpose = purpose;
    nodes[n.id] = n;
    n.children = kids.map(build);
    return n.id;
  };
  const def = SHAPES[shape] || SHAPES.blank;
  root.children = def.tree.map(build);
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    author: '',
    targetWords: def.target,
    createdAt: now(),
    updatedAt: now(),
    nodes,
    notebook: [],
    links: [],
    trash: [],
  };
}

// ---- notebook ideas ----------------------------------------------------------

export const NOTE_COLORS = ['yellow', 'peach', 'green', 'blue', 'lilac', 'label'];

export function makeNote(text, extra = {}) {
  return { id: uid(), text, createdAt: now(), color: 'yellow', nodeId: null, source: null, x: null, y: null, ...extra };
}

export function removeNote(p, id) {
  p.notebook = p.notebook.filter((n) => n.id !== id);
  p.links = p.links.filter((l) => l.from !== id && l.to !== id);
}

export function linkNotes(p, a, b) {
  if (a === b || p.links.some((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a))) return false;
  p.links.push({ id: uid(), from: a, to: b });
  return true;
}

export function validate(p) {
  if (!p || p.format !== FORMAT || !p.nodes || !p.nodes.root) {
    throw new Error("This doesn't look like a Writers Blocks project file.");
  }
  p.notebook ||= [];
  p.links ||= [];
  p.trash ||= [];
  p.notebook.forEach((n, i) => {
    n.color ||= ['yellow', 'peach', 'green'][i % 3];
    n.nodeId ??= null;
  });
  for (const n of Object.values(p.nodes)) {
    n.children ||= [];
    n.tags ||= [];
    for (const k of ['synopsis', 'purpose', 'notes', 'content']) n[k] ||= '';
  }
  return p;
}

// ---- tree helpers ---------------------------------------------------------

export function parentOf(p, id) {
  for (const n of Object.values(p.nodes)) if (n.children.includes(id)) return n;
  return null;
}

export function ancestors(p, id) {
  const out = [];
  let cur = parentOf(p, id);
  while (cur) {
    out.unshift(cur);
    cur = parentOf(p, cur.id);
  }
  return out;
}

export function isDescendant(p, id, maybeAncestorId) {
  return ancestors(p, id).some((a) => a.id === maybeAncestorId);
}

/** Depth-first list of {node, depth}, excluding the root. */
export function flatten(p, fromId = 'root', depth = 0, out = []) {
  for (const cid of p.nodes[fromId].children) {
    const n = p.nodes[cid];
    if (!n) continue;
    out.push({ node: n, depth });
    flatten(p, cid, depth + 1, out);
  }
  return out;
}

/** The previous and next block of the same type in reading order. */
export function neighbors(p, id) {
  const node = p.nodes[id];
  const list = flatten(p).map((x) => x.node).filter((n) => n.type === node.type);
  const i = list.findIndex((n) => n.id === id);
  return { prev: list[i - 1] || null, next: list[i + 1] || null };
}

export function addNode(p, parentId, type, index = null, title = '') {
  const parent = p.nodes[parentId];
  const node = makeNode(type || TYPES[parent.type].child, title);
  p.nodes[node.id] = node;
  if (index === null || index > parent.children.length) parent.children.push(node.id);
  else parent.children.splice(index, 0, node.id);
  parent.collapsed = false;
  return node;
}

export function addSiblingAfter(p, id, type) {
  const parent = parentOf(p, id);
  const idx = parent.children.indexOf(id);
  return addNode(p, parent.id, type || p.nodes[id].type, idx + 1);
}

export function moveNode(p, id, newParentId, index) {
  if (id === 'root' || id === newParentId || isDescendant(p, newParentId, id)) return false;
  const oldParent = parentOf(p, id);
  const oldIdx = oldParent.children.indexOf(id);
  oldParent.children.splice(oldIdx, 1);
  const np = p.nodes[newParentId];
  if (oldParent.id === newParentId && oldIdx < index) index -= 1;
  np.children.splice(Math.max(0, Math.min(index, np.children.length)), 0, id);
  np.collapsed = false;
  return true;
}

export function deleteNode(p, id) {
  if (id === 'root') return;
  const parent = parentOf(p, id);
  parent.children = parent.children.filter((c) => c !== id);
  const drop = (nid) => {
    for (const c of p.nodes[nid]?.children || []) drop(c);
    delete p.nodes[nid];
    for (const note of p.notebook) if (note.nodeId === nid) note.nodeId = null;
  };
  drop(id);
}

/** Split a block's text into two blocks; the second becomes the next sibling. */
// ---- trash -------------------------------------------------------------------
// Deleting moves a block (and everything inside it) out of the tree into p.trash,
// remembering where it was, so it can be restored. Its words leave the totals and
// it's left out of exports until it comes back.

export function trashNode(p, id) {
  if (id === 'root' || !p.nodes[id]) return null;
  const parent = parentOf(p, id);
  const index = parent.children.indexOf(id);
  parent.children.splice(index, 1);
  const nodes = {};
  const take = (nid) => {
    const n = p.nodes[nid];
    if (!n) return;
    nodes[nid] = n;
    delete p.nodes[nid];
    n.children.forEach(take);
  };
  take(id);
  const notes = p.notebook.filter((note) => nodes[note.nodeId]).map((note) => { const link = [note.id, note.nodeId]; note.nodeId = null; return link; });
  const entry = { id: uid(), rootId: id, parentId: parent.id, index, deletedAt: now(), nodes, notes };
  p.trash.unshift(entry);
  return entry;
}

// Put a trashed block back where it was (or at the end of the book if its old home is gone).
export function restoreTrash(p, entryId) {
  const i = p.trash.findIndex((e) => e.id === entryId);
  if (i < 0) return null;
  const [e] = p.trash.splice(i, 1);
  Object.assign(p.nodes, e.nodes);
  const parent = p.nodes[e.parentId] || p.nodes.root;
  parent.children.splice(parent === p.nodes[e.parentId] ? Math.min(e.index, parent.children.length) : parent.children.length, 0, e.rootId);
  parent.collapsed = false;
  for (const [noteId, nodeId] of e.notes || []) {
    const note = p.notebook.find((x) => x.id === noteId);
    if (note && !note.nodeId) note.nodeId = nodeId;
  }
  return p.nodes[e.rootId];
}

export const trashWords = (e) => Object.values(e.nodes).reduce((sum, n) => sum + nodeWords(n), 0);

export function splitNode(p, id, beforeHtml, afterHtml) {
  const node = p.nodes[id];
  node.content = beforeHtml;
  const next = addSiblingAfter(p, id, node.type);
  next.title = `${node.title} (cont.)`;
  next.content = afterHtml;
  next.status = node.status;
  return next;
}

/** Merge the next sibling's text and children into this block. */
export function mergeWithNext(p, id) {
  const parent = parentOf(p, id);
  const idx = parent.children.indexOf(id);
  const nextId = parent.children[idx + 1];
  if (!nextId) return false;
  const a = p.nodes[id];
  const b = p.nodes[nextId];
  a.content = [a.content, b.content].filter((s) => stripHtml(s).trim()).join('<hr>');
  if (b.synopsis) a.synopsis = [a.synopsis, b.synopsis].filter(Boolean).join(' ');
  if (b.notes) a.notes = [a.notes, b.notes].filter(Boolean).join('\n\n');
  a.children.push(...b.children);
  b.children = [];
  deleteNode(p, nextId);
  return true;
}

// ---- words ---------------------------------------------------------------

export function stripHtml(html) {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html.replace(/<\/(p|div|h\d|li|blockquote)>/gi, '$&\n').replace(/<br\s*\/?>/gi, '\n');
  return d.textContent || '';
}

export function countWords(text) {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

const wcCache = new Map();
export function nodeWords(n) {
  const hit = wcCache.get(n.id);
  if (hit && hit.html === n.content) return hit.count;
  const count = countWords(stripHtml(n.content));
  wcCache.set(n.id, { html: n.content, count });
  return count;
}

export function treeWords(p, id = 'root') {
  const n = p.nodes[id];
  if (!n) return 0;
  return nodeWords(n) + n.children.reduce((s, c) => s + treeWords(p, c), 0);
}

// ---- export --------------------------------------------------------------

export function htmlToMarkdown(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  const walk = (el) =>
    [...el.childNodes]
      .map((c) => {
        if (c.nodeType === 3) return c.textContent;
        if (c.nodeType !== 1) return '';
        const inner = walk(c);
        switch (c.tagName) {
          case 'B': case 'STRONG': return `**${inner}**`;
          case 'I': case 'EM': return `*${inner}*`;
          case 'H2': return `\n### ${inner}\n\n`;
          case 'H3': return `\n#### ${inner}\n\n`;
          case 'BLOCKQUOTE': return inner.split('\n').filter(Boolean).map((l) => `> ${l}`).join('\n') + '\n\n';
          case 'LI': return `- ${inner}\n`;
          case 'UL': case 'OL': return `${inner}\n`;
          case 'HR': return '\n* * *\n\n';
          case 'BR': return '\n';
          case 'P': case 'DIV': return `${inner}\n\n`;
          default: return inner;
        }
      })
      .join('');
  return walk(d).replace(/\n{3,}/g, '\n\n').trim();
}
