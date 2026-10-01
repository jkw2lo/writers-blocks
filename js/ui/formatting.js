import * as F from '../lib/format.js';
import * as M from '../lib/model.js';
import { escapeHtml, h, icon, toast } from '../core/dom.js';
import { P, prefs, savePrefs, state } from '../core/state.js';
import { snapshot } from '../core/undo.js';
import { MOD, changed } from '../project/files.js';
import { contextMenu } from './menus.js';
import { render } from './shell.js';
import { caretBlock } from './writing-aids.js';

// ---- formatting in the draft: paragraph styles, case, smart punctuation, word styles ---------

export const PARA_STYLES = [
  { id: 'indent', label: 'Indent every paragraph' },
  { id: 'book', label: 'Indent like a printed book', hint: 'First paragraph flush' },
  { id: 'spaced', label: 'Space between, no indent' },
];
export const paraClass = () => `para-${PARA_STYLES.some((s) => s.id === prefs.paraStyle) ? prefs.paraStyle : 'indent'}`;

export const BLOCK_STYLES = [
  { tag: 'p', label: 'Body text' },
  { tag: 'h2', label: 'Heading' },
  { tag: 'h3', label: 'Subheading' },
  { tag: 'blockquote', label: 'Quote' },
];
const LIST = { ul: 'List', ol: 'Numbered list' };

const selectText = (node, start, end) => {
  const r = document.createRange();
  r.setStart(node, start);
  r.setEnd(node, end);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
};

// Wrap stray top-level text in paragraphs, keeping the caret where it was.
export function normalizeEditor(ed) {
  const s = getSelection();
  const at = s.rangeCount && ed.contains(s.anchorNode) ? [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset] : null;
  if (!F.normalizeBlocks(ed)) return false;
  if (at && at[0] !== ed && at[2] !== ed && at[0].isConnected && at[2].isConnected) s.setBaseAndExtent(...at);
  return true;
}

// The text in front of (node, offset) within its paragraph.
function textBefore(ed, node, offset) {
  const b = caretBlock(ed) || ed;
  const r = document.createRange();
  r.setStart(b, 0);
  r.setEnd(node, offset);
  return r.toString();
}

// ---- as you type ---------------------------------------------------------------------------
// Runs after each typed character. Each fix is its own edit, so ⌘Z puts back what you typed.

let busy = false;
export function autoFormat(ed, e) {
  if (busy || e.isComposing || e.inputType !== 'insertText' || !e.data || [...e.data].length !== 1) return;
  const s = getSelection();
  if (!s.isCollapsed || s.anchorNode?.nodeType !== 3 || !ed.contains(s.anchorNode)) return;
  busy = true;
  try {
    const ch = e.data;
    const node = s.anchorNode;
    const o = s.anchorOffset;
    if (prefs.smartPunct) {
      const t = node.data;
      let rep = null;
      let len = 1;
      if (ch === '"' || ch === "'") rep = F.curlyQuote(ch, textBefore(ed, node, o - 1).slice(-1));
      else if (ch === '-' && t[o - 2] === '-') { rep = '—'; len = 2; }
      else if (ch === '.' && t.slice(o - 3, o) === '...') { rep = '…'; len = 3; }
      if (rep) replaceText(node, o - len, o, () => document.execCommand('insertText', false, rep));
    }
    if (prefs.autoWordStyles && !/[\p{L}\p{N}]/u.test(ch)) fixWordBefore(ed);
  } finally { busy = false; }
}

// Just typed a space or punctuation: if the word(s) before it match a word style, fix them.
function fixWordBefore(ed) {
  const m = F.wordMatcher(P().wordStyles);
  const s = getSelection();
  const node = s.anchorNode;
  if (!m || node?.nodeType !== 3) return;
  const end = s.anchorOffset - 1;
  const hit = [...node.data.slice(0, end).matchAll(m.re)].find((x) => x.index + x[0].length === end);
  const rule = hit && m.rule(hit[0]);
  if (!rule) return;
  const tag = !F.hasStyle(node, rule.style, ed) && F.styleTag(rule.style);
  if (hit[0] === rule.form && !tag) return;
  const ok = replaceText(node, hit.index, end, () => (tag
    ? document.execCommand('insertHTML', false, `<${tag}>${escapeHtml(rule.form)}</${tag}>`)
    : document.execCommand('insertText', false, rule.form)));
  if (ok) getSelection().modify('move', 'forward', 'character'); // back past the space you typed
}

// Select part of a text node and run an edit on it. If the browser refuses the edit, put the
// caret back, so the next key doesn't type over the selection.
function replaceText(node, start, end, edit) {
  const caret = [getSelection().anchorNode, getSelection().anchorOffset];
  selectText(node, start, end);
  if (edit()) return true;
  getSelection().collapse(...caret);
  return false;
}

// ---- case ------------------------------------------------------------------------------------

const CASES = [
  { id: 'sentence', label: 'Sentence case' },
  { id: 'lower', label: 'lowercase' },
  { id: 'upper', label: 'UPPERCASE' },
  { id: 'title', label: 'Title Case' },
];

// Change the case of the selection, or of the whole paragraph when nothing is selected.
// Edits each run of text in place, so italics and bold survive.
export function changeCase(ed, mode, range) {
  let r = range;
  if (!r || !ed.contains(r.startContainer)) return toast('Put the cursor in your draft, or select some text, first.');
  if (r.collapsed) {
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    const b = caretBlock(ed);
    if (!b) return;
    r = document.createRange();
    r.selectNodeContents(b);
  }
  const segs = F.textNodes(ed).filter((n) => r.intersectsNode(n))
    .map((n) => ({ n, a: n === r.startContainer ? r.startOffset : 0, b: n === r.endContainer ? r.endOffset : n.length }))
    .filter((x) => x.b > x.a);
  if (!segs.length) return;
  const keep = (P().wordStyles || []).map((w) => w.form).filter(Boolean);
  const blockOf = (n) => { let x = n; while (x.parentNode && x.parentNode !== ed) x = x.parentNode; return x; };
  const groups = [];
  for (const sg of segs) {
    const b = blockOf(sg.n);
    if (groups.at(-1)?.block !== b) groups.push({ block: b, segs: [] });
    groups.at(-1).segs.push(sg);
  }
  const span = offsetsOf(ed, r);
  const was = ed.innerHTML;
  // Text is edited in place rather than retyped: retyping next to an <em> can pull the new
  // text into the italics. So undo is ours (⌘Z right after, or the toast).
  for (const g of groups) {
    const first = g.segs[0];
    const pre = document.createRange();
    pre.setStart(g.block, 0);
    pre.setEnd(first.n, first.a);
    const text = g.segs.map((x) => x.n.data.slice(x.a, x.b)).join('');
    const out = F.changeCase(text, mode, { before: pre.toString(), keep });
    let pos = 0;
    for (const x of g.segs) {
      const len = x.b - x.a;
      const next = out.slice(pos, pos + len);
      pos += len;
      if (next !== x.n.data.slice(x.a, x.b)) x.n.replaceData(x.a, len, next);
    }
  }
  if (ed.innerHTML === was) return;
  ed.focus();
  selectOffsets(ed, ...span); // lengths don't change, so the same positions cover the same text
  ed.dispatchEvent(new Event('input'));
  const after = ed.innerHTML;
  const undo = () => {
    if (!ed.isConnected || ed.innerHTML !== after) return toast('You’ve edited since, so that can’t be undone now.');
    ed.innerHTML = was;
    ed.dispatchEvent(new Event('input'));
    ed.focus();
    selectOffsets(ed, ...span);
  };
  lastCase = { ed, html: after, undo };
  toast(`Changed to ${CASES.find((c) => c.id === mode).label}.`, { onUndo: undo });
}

let lastCase = null;
document.addEventListener('keydown', (e) => {
  if (!lastCase || e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey) return;
  const { ed, html, undo } = lastCase;
  lastCase = null;
  if (document.activeElement !== ed || ed.innerHTML !== html) return; // you've typed since
  e.preventDefault();
  undo();
}, true);

function offsetsOf(ed, r) {
  const pre = document.createRange();
  pre.setStart(ed, 0);
  pre.setEnd(r.startContainer, r.startOffset);
  const a = pre.toString().length;
  return [a, a + r.toString().length];
}
function selectOffsets(ed, a, b) {
  const r = document.createRange();
  let pos = 0;
  let started = false;
  for (const n of F.textNodes(ed)) {
    const end = pos + n.length;
    if (!started && a <= end) { r.setStart(n, a - pos); started = true; }
    if (started && b <= end) { r.setEnd(n, b - pos); break; }
    pos = end;
  }
  if (!started) return;
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

// ---- whole-block and whole-book rewrites ------------------------------------------------------

function rewrite(scope, fn, { done, none }) {
  const p = P();
  const ids = scope === 'book' ? M.flatten(p).map((x) => x.node.id).concat('root') : [state.selectedId];
  snapshot();
  let count = 0;
  for (const id of ids) {
    const n = p.nodes[id];
    if (!n?.content) continue;
    const r = fn(n.content);
    if (r.html === n.content) continue;
    n.content = r.html;
    count += r.count ?? 1;
  }
  if (!count) { state.undo.pop(); return toast(none); }
  changed();
  render();
  toast(done(count), { undo: true });
}

export const tidy = (scope) => rewrite(scope, F.tidyHtml, {
  done: (n) => (scope === 'book' ? `Tidied ${n} ${n === 1 ? 'block' : 'blocks'}.` : 'Tidied this block.'),
  none: 'Already tidy: nothing to change.',
});

export function applyWordStyles(scope) {
  if (!P().wordStyles?.some((w) => w.form?.trim())) return openWordStyles();
  rewrite(scope, (html) => F.applyWordStyles(html, P().wordStyles), {
    done: (n) => `Fixed ${n} ${n === 1 ? 'spelling' : 'spellings'}${scope === 'book' ? ' across the book' : ''}.`,
    none: 'Every word style is already right.',
  });
}

// ---- word styles dialog -------------------------------------------------------------------

export function openWordStyles() {
  const p = P();
  p.wordStyles ||= [];
  const dlg = h('dialog', { class: 'modal word-styles' });
  const list = h('div', { class: 'ws-list' });
  const save = () => changed();
  const row = (rule) => h('div', { class: 'ws-row' },
    h('input', { value: rule.form, placeholder: 'e.g. iPhone', 'aria-label': 'Always write it as', oninput: (e) => { rule.form = e.target.value; save(); } }),
    h('input', { value: rule.also || '', placeholder: 'Other spellings to catch (optional)', 'aria-label': 'Also catch', oninput: (e) => { rule.also = e.target.value; save(); } }),
    h('select', { 'aria-label': 'Style', onchange: (e) => { rule.style = e.target.value; save(); } },
      F.WORD_STYLES.map((s) => h('option', { value: s.id, selected: (rule.style || '') === s.id }, s.label))),
    h('button', { class: 'icon-btn small', title: 'Remove', onclick: () => { p.wordStyles = p.wordStyles.filter((x) => x !== rule); save(); paint(); } }, icon('close')));
  const paint = () => list.replaceChildren(
    h('div', { class: 'ws-row ws-head' }, h('span', null, 'Always write it as'), h('span', null, 'Also catch'), h('span', null, 'Style'), h('span')),
    ...(p.wordStyles.length ? p.wordStyles.map(row) : [h('p', { class: 'muted small ws-empty' }, 'No word styles yet. Add a name, brand or term you want spelled the same way every time.')]));
  const add = (form = '', style = '') => {
    p.wordStyles.push({ id: M.uid(), form, also: '', style });
    paint();
    list.querySelector('.ws-row:last-of-type input')?.focus();
  };
  const close = () => {
    p.wordStyles = p.wordStyles.filter((x) => x.form.trim());
    save();
    dlg.close();
    dlg.remove();
  };
  const run = (scope) => { close(); applyWordStyles(scope); };
  paint();
  dlg.append(
    h('div', { class: 'dlg-head' }, h('h2', null, 'Word styles'), h('button', { class: 'icon-btn', onclick: close, title: 'Close' }, icon('close'))),
    h('p', { class: 'muted small' }, 'Names and terms that should always look the same: a company (“eBay”, “McKinsey & Company”), a character, a ship or book title in italics. Any capitalisation of the word is caught, plus any other spellings you list (separate them with commas). They’re saved with this project.'),
    list,
    h('button', { class: 'btn small', onclick: () => add() }, icon('plus'), 'Add a word'),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.autoWordStyles, onchange: (e) => { prefs.autoWordStyles = e.target.checked; savePrefs(); } }),
      h('span', null, h('strong', null, 'Fix as I type'), h('br'), h('span', { class: 'muted small' }, `Corrects a word the moment you finish it. ${MOD}Z puts it back the way you typed it.`))),
    h('div', { class: 'dlg-foot' },
      h('span', { class: 'muted small' }, 'Fix what’s already written:'),
      state.view === 'write' && state.selectedId !== 'root' && h('button', { class: 'btn small', onclick: () => run('block') }, 'This block'),
      h('button', { class: 'btn small', onclick: () => run('book') }, 'The whole book'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small primary', onclick: close }, 'Done')));
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  const picked = getSelection().toString().trim();
  document.body.append(dlg);
  dlg.showModal();
  if (picked && picked.length < 60 && !/\n/.test(picked) && !p.wordStyles.some((w) => w.form === picked)) add(picked);
}

// ---- toolbar pieces -------------------------------------------------------------------------

export function currentBlockStyle(ed) {
  const b = caretBlock(ed);
  const tag = b?.nodeName.toLowerCase();
  return LIST[tag] || BLOCK_STYLES.find((s) => s.tag === tag)?.label || 'Body text';
}

// Remember where the selection was when a toolbar menu opens, since the menu takes focus.
let savedRange = null;
const keepRange = (ed) => {
  const s = getSelection();
  savedRange = s.rangeCount && ed.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null;
};
const restoreRange = (ed) => {
  ed.focus();
  if (!savedRange || !savedRange.startContainer.isConnected) return;
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(savedRange);
};
const below = (e) => { const r = e.currentTarget.getBoundingClientRect(); return { x: r.left, y: r.bottom + 4 }; };

export function blockStyleButton(ed) {
  return h('button', {
    class: 'tb wide style-pick', title: 'Paragraph style: body text, heading or quote', 'aria-haspopup': 'menu',
    onmousedown: (e) => { e.preventDefault(); keepRange(ed); },
    onclick: (e) => {
      const now = currentBlockStyle(ed);
      contextMenu(below(e), BLOCK_STYLES.map((s) => ({
        label: s.label, checked: now === s.label,
        run: () => {
          restoreRange(ed);
          // Choosing the style it already has turns it back into body text.
          document.execCommand('formatBlock', false, now === s.label ? 'p' : s.tag);
          ed.dispatchEvent(new Event('input'));
          refreshToolbar(ed);
        },
      })));
    },
  }, h('span', { 'data-block-style': '' }, currentBlockStyle(ed)), icon('chev', 'down-chev'));
}

export function formatMenuButton(ed) {
  const setPara = (id) => { prefs.paraStyle = id; savePrefs(); document.querySelectorAll('.prose').forEach((x) => { x.classList.remove(...PARA_STYLES.map((s) => `para-${s.id}`)); x.classList.add(paraClass()); }); };
  const togglePref = (key, on, off) => { prefs[key] = !prefs[key]; savePrefs(); toast(prefs[key] ? on : off); };
  const items = () => [
    { label: 'Change case', icon: 'case', sub: CASES.map((c) => ({ label: c.label, run: () => { restoreRange(ed); changeCase(ed, c.id, savedRange); } })) },
    { label: 'Clear formatting', icon: 'eraser', run: () => { restoreRange(ed); document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'p'); ed.dispatchEvent(new Event('input')); refreshToolbar(ed); } },
    'sep',
    { label: 'Word styles…', icon: 'tag', run: () => { restoreRange(ed); openWordStyles(); } },
    { label: 'Apply word styles', sub: [
      { label: 'To this block', run: () => applyWordStyles('block') },
      { label: 'To the whole book', run: () => applyWordStyles('book') }] },
    { label: 'Tidy punctuation & spaces', sub: [
      { label: 'In this block', run: () => tidy('block') },
      { label: 'In the whole book', run: () => tidy('book') }] },
    'sep',
    { label: 'Paragraphs', icon: 'para', sub: PARA_STYLES.map((s) => ({ label: s.label, hint: s.hint, checked: paraClass() === `para-${s.id}`, run: () => setPara(s.id) })) },
    { label: 'Smart quotes & dashes as I type', checked: prefs.smartPunct, run: () => togglePref('smartPunct', 'Smart quotes & dashes on', 'Smart quotes & dashes off') },
    { label: 'Fix word styles as I type', checked: prefs.autoWordStyles, run: () => togglePref('autoWordStyles', 'Fixing word styles as you type', 'Word styles: only when you apply them') },
  ];
  return h('button', {
    class: 'tb wide', title: 'Format: change case, word styles, tidy punctuation, paragraph indents', 'aria-haspopup': 'menu',
    onmousedown: (e) => { e.preventDefault(); keepRange(ed); },
    onclick: (e) => contextMenu(below(e), items()),
  }, h('span', { class: 'aa' }, 'Aa'), 'Format', icon('chev', 'down-chev'));
}

// Show which style the caret is in, and whether bold / italic are on.
export function refreshToolbar(ed) {
  const bar = ed.closest('.write')?.querySelector('.toolbar');
  if (!bar) return;
  const label = bar.querySelector('[data-block-style]');
  if (label) label.textContent = currentBlockStyle(ed);
  const inEd = ed.contains(getSelection().anchorNode);
  for (const b of bar.querySelectorAll('[data-cmd]')) {
    const on = inEd && document.queryCommandState(b.dataset.cmd);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}
document.addEventListener('selectionchange', () => {
  const ed = document.querySelector('.write .editor');
  if (ed && document.activeElement === ed) refreshToolbar(ed);
});
