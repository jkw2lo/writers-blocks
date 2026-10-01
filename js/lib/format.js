// Text formatting: tidy paragraphs, change case, smart punctuation and word styles
// (names that should always be written a certain way). Plain functions over strings
// and DOM trees, so the editor, the Read view and exports all share them.

const BLOCK = /^(P|DIV|H[1-6]|BLOCKQUOTE|LI|UL|OL|HR|PRE)$/;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;

// ---- paragraphs ----------------------------------------------------------------------
// A browser editor leaves the first line you type as bare text, and pasted HTML can bring
// <div>s. Every top-level run of text becomes a <p>, so spacing and indents are the same
// for every paragraph. Moves the existing nodes, so a caret inside them stays put.
export function normalizeBlocks(root) {
  let changed = false;
  let run = null;
  for (const c of [...root.childNodes]) {
    const isBlock = c.nodeType === 1 && BLOCK.test(c.nodeName);
    const blank = c.nodeType === 3 && !c.data.trim() && /\n/.test(c.data); // formatting whitespace
    if (c.nodeType === 8 || (blank && !run)) { if (blank) { c.remove(); changed = true; } continue; }
    if (isBlock) {
      run = null;
      if (c.nodeName === 'DIV') {
        if ([...c.children].some((k) => BLOCK.test(k.nodeName))) { c.replaceWith(...c.childNodes); normalizeBlocks(root); return true; }
        const p = document.createElement('p');
        while (c.firstChild) p.append(c.firstChild);
        c.replaceWith(p);
        changed = true;
      }
      continue;
    }
    if (!run) { run = document.createElement('p'); root.insertBefore(run, c); changed = true; }
    run.append(c);
  }
  return changed;
}

export function normalizeHtml(html) {
  if (!html) return html;
  const t = document.createElement('template');
  t.innerHTML = html;
  return normalizeBlocks(t.content) ? t.innerHTML : html;
}

// ---- walking text across inline formatting -------------------------------------------

function blockOf(node, root) {
  for (let n = node.parentNode; n && n !== root; n = n.parentNode) if (BLOCK.test(n.nodeName)) return n;
  return root;
}

export function textNodes(root) {
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) out.push(w.currentNode);
  return out;
}

// ---- smart punctuation -----------------------------------------------------------------

const OPENS = /^$|[\s([{<“‘—–\-/ ]$/;
// The curly version of a straight quote, given the character before it.
export function curlyQuote(q, before = '') {
  const open = OPENS.test(before);
  if (q === '"') return open ? '“' : '”';
  return open ? '‘' : '’';
}

// Curly quotes, em dashes, ellipses and single spaces in a run of text.
export function smartPunct(text, before = '') {
  let out = '';
  for (const c of text) out += c === '"' || c === "'" ? curlyQuote(c, out ? out.slice(-1) : before.slice(-1)) : c;
  return out.replace(/\s*---?\s*/g, (m) => (/\n/.test(m) ? m : '—')).replace(/\.\.\./g, '…').replace(/ {2,}/g, ' ');
}

// Tidy a draft: smart punctuation, no doubled spaces, no stray spaces at the start or
// end of a paragraph (spaces typed as a fake indent). Returns the new HTML and whether it changed.
export function tidyHtml(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const root = t.content;
  normalizeBlocks(root);
  let prevBlock = null;
  let prev = '';
  for (const n of textNodes(root)) {
    const b = blockOf(n, root);
    if (b !== prevBlock) { prev = ''; prevBlock = b; }
    let s = smartPunct(n.data, prev);
    if (prev === ' ' || prev === '') s = s.replace(/^[  \t]+/, '');
    if (s !== n.data) n.data = s;
    if (s) prev = s.slice(-1);
  }
  for (const b of root.querySelectorAll('p, h2, h3, li, blockquote')) {
    const last = textNodes(b).filter((x) => x.data).pop();
    if (last && /[  \t]+$/.test(last.data)) last.data = last.data.replace(/[  \t]+$/, '');
  }
  const out = t.innerHTML;
  return { html: out, changed: out !== html };
}

// ---- case ----------------------------------------------------------------------------

const SMALL = new Set('a an and as at but by en for from if in into nor of off on onto or over per so than the to up via vs with yet'.split(' '));
const upFirst = (w) => w.replace(/\p{L}/u, (c) => c.toUpperCase());

// Change the case of some text. `before` is the text in front of it in the same paragraph,
// so sentence case knows whether it starts a sentence; `keep` is a list of exact forms
// (word styles like "iPhone") to restore afterwards. The result is always the same length.
export function changeCase(text, mode, { before = '', keep = [] } = {}) {
  let out;
  const allCaps = !/\p{Ll}/u.test(text);
  // An acronym (BBC) is a capitalised word on its own; a run of them is shouting.
  const words = [...text.matchAll(WORD)];
  const caps = words.map((m) => /\p{Lu}/u.test(m[0]) && m[0] === m[0].toUpperCase());
  const at = new Map(words.map((m, k) => [m.index, k]));
  const acronym = (w, i) => { const k = at.get(i); return !allCaps && w.length > 1 && caps[k] && !caps[k - 1] && !caps[k + 1]; };
  if (mode === 'upper') out = text.toUpperCase();
  else if (mode === 'lower') out = text.toLowerCase();
  else if (mode === 'title') {
    out = text.replace(WORD, (w, i) => {
      if (acronym(w, i)) return w;
      if (!allCaps && /\p{Lu}/u.test(w.slice(1))) return w; // McKay, iPhone
      const k = at.get(i);
      const edge = k === 0 || k === words.length - 1 || /[:—–]\s*$/.test(text.slice(0, i));
      const lw = w.toLowerCase();
      return !edge && SMALL.has(lw) ? lw : upFirst(lw);
    }).replace(/(-)(\p{Ll})/gu, (m, d, c) => d + c.toUpperCase());
  } else if (mode === 'sentence') {
    out = text.replace(WORD, (w, i) => (acronym(w, i) ? w : w.toLowerCase()));
    const starts = /^\s*$/.test(before) || /[.!?…]["'”’)\]]*\s*$/.test(before);
    out = out.replace(/(^|[.!?…]["'”’)\]]*\s+)(["'“‘([]*)(\p{L})/gu, (m, a, q, c, i) => (i === 0 && !starts ? m : a + q + c.toUpperCase()));
    out = out.replace(/(^|[^\p{L}\p{N}])i(?![\p{L}\p{N}]|\.e\.)/gu, '$1I');
  } else return text;
  for (const form of mode === 'sentence' || mode === 'title' ? keep : []) {
    if (!form) continue;
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(form)}(?![\\p{L}\\p{N}])`, 'giu'), (m) => (m.length === form.length ? form : m));
  }
  return out.length === text.length ? out : text;
}

// ---- word styles -----------------------------------------------------------------------
// A rule: { id, form: 'ACME Corp.', also: 'acme corp, acme', style: '' | 'i' | 'b' }.
// Any variant (the form itself in any case, or one of the "also" spellings) is rewritten
// as the form, in the style.

export const WORD_STYLES = [
  { id: '', label: 'As written' },
  { id: 'i', label: 'Italic' },
  { id: 'b', label: 'Bold' },
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s\\u00a0]+');
}
const squash = (s) => s.toLowerCase().replace(/[\s ]+/g, ' ').trim();

export function variants(rule) {
  return [rule.form, ...(rule.also || '').split(',')].map((v) => v.trim()).filter(Boolean);
}

// One regex for every rule, longest spellings first, plus a lookup back to the rule.
export function wordMatcher(rules) {
  const by = new Map();
  for (const r of rules || []) if (r.form?.trim()) for (const v of variants(r)) if (!by.has(squash(v))) by.set(squash(v), r);
  if (!by.size) return null;
  const alts = [...by.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  return {
    re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu'),
    rule: (text) => by.get(squash(text)),
  };
}

const STYLE_TAGS = { i: /^(EM|I)$/, b: /^(STRONG|B)$/ };
export function hasStyle(node, style, root) {
  if (!style) return true;
  for (let n = node.parentNode; n && n !== root; n = n.parentNode) if (STYLE_TAGS[style].test(n.nodeName)) return true;
  return false;
}
export const styleTag = (style) => ({ i: 'em', b: 'strong' }[style]);

// Rewrite every variant under `root` (a DOM node) as its rule says. Returns how many changed.
export function applyWordStylesTo(root, rules) {
  const m = wordMatcher(rules);
  if (!m) return 0;
  let count = 0;
  for (const n of textNodes(root)) {
    const hits = [...n.data.matchAll(m.re)].map((x) => ({ at: x.index, text: x[0], rule: m.rule(x[0]) }))
      .filter((x) => x.rule && (x.text !== x.rule.form || !hasStyle(n, x.rule.style, root)));
    if (!hits.length) continue;
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const x of hits) {
      frag.append(n.data.slice(pos, x.at));
      const tag = !hasStyle(n, x.rule.style, root) && styleTag(x.rule.style);
      frag.append(tag ? Object.assign(document.createElement(tag), { textContent: x.rule.form }) : x.rule.form);
      pos = x.at + x.text.length;
      count++;
    }
    frag.append(n.data.slice(pos));
    n.replaceWith(frag);
  }
  root.normalize?.();
  return count;
}

export function applyWordStyles(html, rules) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const count = applyWordStylesTo(t.content, rules);
  return { html: count ? t.innerHTML : html, count };
}
