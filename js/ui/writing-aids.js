import * as Sound from '../lib/sound.js';
import { h, icon, toast } from '../core/dom.js';
import { prefs, savePrefs, sel } from '../core/state.js';

// ---- writing aids: typing sounds, typewriter scrolling, fade the rest ------------------

export const WRITING_TOGGLES = [
  ['sounds', 'sound', 'Typing sounds', 'Typing sounds on', 'Typing sounds off'],
  ['typewriterScroll', 'center', 'Typewriter scrolling: keep the line you’re on in the middle', 'Typewriter scrolling on', 'Typewriter scrolling off'],
  ['fadeRest', 'fade', 'Fade the rest: dim every paragraph but the one you’re writing', 'Fading the rest', 'Showing everything'],
];

export function setWritingPref(key, on) {
  prefs[key] = on;
  savePrefs();
  document.querySelectorAll('.editor').forEach((ed) => ed.classList.toggle('fade-rest', prefs.fadeRest));
  document.querySelectorAll('.write').forEach((w) => w.classList.toggle('tw-scroll', prefs.typewriterScroll));
  document.querySelectorAll(`[data-toggle="${key}"]`).forEach((b) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  const ed = document.querySelector('.editor');
  if (ed) followCaret(ed);
  if (key === 'sounds' && on) Sound.play('bell', prefs.soundVolume);
}

export function writingToggles() {
  return h('div', { class: 'tb-toggles' },
    WRITING_TOGGLES.map(([key, ic, title, onMsg, offMsg]) => h('button', {
      class: `tb toggle ${prefs[key] ? 'on' : ''}`, title, 'aria-pressed': String(!!prefs[key]), 'data-toggle': key,
      onmousedown: (e) => e.preventDefault(), // keep the cursor in the draft
      onclick: () => { setWritingPref(key, !prefs[key]); toast(prefs[key] ? onMsg : offMsg); },
    }, icon(ic))));
}

// The top-level paragraph the caret is in (the editor's direct child), or null.
export function caretBlock(ed) {
  const sel = getSelection();
  if (!sel.rangeCount || !ed.contains(sel.anchorNode)) return null;
  let node = sel.anchorNode;
  if (node === ed) return ed.children[Math.min(sel.anchorOffset, ed.children.length - 1)] || null;
  while (node && node.parentNode !== ed) node = node.parentNode;
  return node?.nodeType === 1 ? node : null;
}

// Fade: highlight the current paragraph with a generated rule, so nothing is ever
// written into the draft's own HTML.
export const fadeStyle = document.head.appendChild(document.createElement('style'));
export function updateFade(ed) {
  const block = prefs.fadeRest ? caretBlock(ed) : null;
  ed.classList.toggle('fading', !!block);
  fadeStyle.textContent = block ? `.editor.fade-rest.fading > :nth-child(${[...ed.children].indexOf(block) + 1}) { opacity: 1; }` : '';
}

export function caretRect(ed) {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  const rect = r.getClientRects()[0];
  if (rect && rect.height) return rect;
  return caretBlock(ed)?.getBoundingClientRect() || null; // empty line: use its paragraph
}

export function scrollParent(el) {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement;
}

export function followCaret(ed) {
  updateFade(ed);
  if (!prefs.typewriterScroll || document.activeElement !== ed) return;
  const rect = caretRect(ed);
  if (!rect) return;
  const sc = scrollParent(ed);
  const box = sc === document.scrollingElement ? { top: 0, height: innerHeight } : sc.getBoundingClientRect();
  const delta = rect.top + rect.height / 2 - (box.top + box.height * 0.45);
  if (Math.abs(delta) > 3) sc.scrollBy({ top: delta, behavior: Math.abs(delta) > 120 ? 'smooth' : 'auto' });
}
document.addEventListener('selectionchange', () => {
  const ed = document.activeElement;
  if (ed?.classList?.contains('editor')) updateFade(ed);
});

document.addEventListener('keydown', (e) => {
  if (!prefs.sounds || e.isComposing) return;
  const t = e.target;
  const typing = t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && ['text', 'search', 'number'].includes(t.type));
  const kind = typing && Sound.soundForKey(e);
  if (kind) Sound.play(kind, prefs.soundVolume);
}, true);
