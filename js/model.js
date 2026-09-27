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

export function newProject(title = 'Untitled Book') {
  const root = makeNode('book', title);
  root.id = 'root';
  const part = makeNode('part', 'Part One');
  const chapter = makeNode('chapter', 'Chapter 1');
  const section = makeNode('section', 'Opening');
  chapter.children.push(section.id);
  part.children.push(chapter.id);
  root.children.push(part.id);
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    author: '',
    targetWords: 80000,
    createdAt: now(),
    updatedAt: now(),
    nodes: { root, [part.id]: part, [chapter.id]: chapter, [section.id]: section },
    notebook: [],
  };
}

export function validate(p) {
  if (!p || p.format !== FORMAT || !p.nodes || !p.nodes.root) {
    throw new Error("This doesn't look like a Writers Blocks project file.");
  }
  p.notebook ||= [];
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
  };
  drop(id);
}

/** Split a block's text into two blocks; the second becomes the next sibling. */
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

export function exportMarkdown(p, { includeNotes = false } = {}) {
  const root = p.nodes.root;
  const lines = [`# ${root.title}`];
  if (p.author) lines.push(`*by ${p.author}*`);
  lines.push('');
  const depthHeading = { part: '#', chapter: '##', section: '###' };
  for (const { node } of flatten(p)) {
    const h = depthHeading[node.type] || '###';
    lines.push(`${h}# ${node.title}`, '');
    if (includeNotes && node.synopsis) lines.push(`> **Synopsis:** ${node.synopsis}`, '');
    if (includeNotes && node.purpose) lines.push(`> **Purpose:** ${node.purpose}`, '');
    const md = htmlToMarkdown(node.content);
    if (md) lines.push(md, '');
  }
  return lines.join('\n');
}
