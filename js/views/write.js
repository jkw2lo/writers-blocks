import * as M from '../lib/model.js';
import { autoGrow, escapeHtml, fmt, h, icon, textToHtml } from '../core/dom.js';
import { P, prefs, savePrefs, sel, state } from '../core/state.js';
import { snapshot } from '../core/undo.js';
import { addAfter, addChild, select, splitAtCursor } from '../project/commands.js';
import { changed } from '../project/files.js';
import { nextInOrder } from '../project/flow.js';
import { openExport } from '../ui/export-dialog.js';
import { blockMenuItems, contextMenu } from '../ui/menus.js';
import { render } from '../ui/shell.js';
import { openEchoes, paintDrawer, runPolish } from '../ui/tools.js';
import { refreshCounts } from '../ui/topbar.js';
import { followCaret, updateFade, writingToggles } from '../ui/writing-aids.js';
import { autoFormat, blockStyleButton, formatMenuButton, normalizeEditor, paraClass, refreshToolbar } from '../ui/formatting.js';
import { aiReady } from './notebook.js';

export function crumbs(n) {
  const path = M.ancestors(P(), n.id);
  return h('div', { class: 'crumbs' },
    path.map((a) => [h('button', { class: 'crumb', onclick: () => select(a.id) }, a.title), h('span', { class: 'sep' }, '›')]),
    h('span', { class: 'crumb current' }, n.title));
}

export function field(label, hint, value, onInput, { rows = 2, cls = '' } = {}) {
  return h('label', { class: `field ${cls}` },
    h('span', { class: 'field-label' }, label),
    autoGrow(h('textarea', { rows, placeholder: hint, value, oninput: (e) => { onInput(e.target.value); changed(); } })));
}

export function renderWrite() {
  const n = sel();
  if (n.id === 'root') return renderBookOverview();
  const { prev, next } = M.neighbors(P(), n.id);
  const kids = n.children.map((c) => P().nodes[c]).filter(Boolean);
  const typeLabel = M.TYPES[n.type].label.toLowerCase();

  const direction = h('details', { class: 'direction', open: prefs.directionOpen, ontoggle: (e) => { prefs.directionOpen = e.target.open; savePrefs(); } },
    h('summary', null, 'Direction',
      !prefs.directionOpen && n.synopsis && h('span', { class: 'summary-peek' }, ` · ${n.synopsis}`)),
    h('div', { class: 'direction-grid' },
      field('What happens', `In a sentence or two, what happens (or what's argued) in this ${typeLabel}?`, n.synopsis, (v) => (n.synopsis = v)),
      field('Why it’s here', `What must this ${typeLabel} do for its chapter and the book? What should the reader feel or learn?`, n.purpose, (v) => (n.purpose = v)),
    ),
    (prev || next) && h('div', { class: 'neighbors' },
      neighborCard(prev, 'Before'),
      neighborCard(next, 'After')),
  );

  const ed = h('div', {
    class: `editor prose ${paraClass()}`, contentEditable: 'true', spellcheck: prefs.spellcheck,
    'data-placeholder': kids.length ? `Optional opening text for this ${typeLabel}…` : 'Start writing…',
    'aria-label': 'Draft text',
  });
  ed.innerHTML = n.content;
  if (normalizeEditor(ed)) n.content = ed.innerHTML; // older drafts: every paragraph gets a <p>
  ed.classList.toggle('fade-rest', prefs.fadeRest);
  const countTimer = { echo: null };
  let wcTimer;
  ed.addEventListener('input', (e) => {
    normalizeEditor(ed);
    autoFormat(ed, e);
    n.content = /^(\s|<br>|<p><br><\/p>|<div><br><\/div>)*$/.test(ed.innerHTML) ? '' : ed.innerHTML;
    state.session?.touched.add(n.id);
    n.editedAt = new Date().toISOString();
    changed();
    if (state.drawer?.kind === 'echoes') { clearTimeout(countTimer.echo); countTimer.echo = setTimeout(paintDrawer, 700); }
    followCaret(ed);
    clearTimeout(wcTimer);
    wcTimer = setTimeout(refreshCounts, 250);
  });
  ed.addEventListener('paste', (e) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const html = /\n/.test(text) ? textToHtml(text) : escapeHtml(text);
    document.execCommand('insertHTML', false, html);
  });
  ed.addEventListener('focus', () => document.execCommand('defaultParagraphSeparator', false, 'p'));
  ed.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow') || e.key.startsWith('Page')) followCaret(ed); });
  // Clicking only updates the fade: scrolling here would move the page between the two
  // clicks of a double-click. Typewriter scrolling catches up on your next keystroke.
  ed.addEventListener('mouseup', () => updateFade(ed));
  ed.addEventListener('focus', () => updateFade(ed));
  ed.addEventListener('blur', () => ed.classList.remove('fading')); // show everything when you're not writing

  const tb = (label, title, fn, cmd) => h('button', { class: 'tb', title, 'data-cmd': cmd, onmousedown: (e) => { e.preventDefault(); fn(); } }, label);
  const exec = (cmd, arg) => () => { document.execCommand(cmd, false, arg); ed.dispatchEvent(new Event('input')); refreshToolbar(ed); };

  return h('div', { class: `write ${prefs.typewriterScroll ? 'tw-scroll' : ''}` },
    crumbs(n),
    h('div', { class: 'title-row' },
      h('span', { class: `type-badge type-${n.type}` }, M.TYPES[n.type].label),
      h('input', {
        class: 'title-input', value: n.title, 'aria-label': 'Title',
        oninput: (e) => { n.title = e.target.value; changed(); document.querySelector(`.row[data-id="${n.id}"] .row-title`)?.replaceChildren(n.title); },
      }),
      h('button', { class: 'icon-btn title-more', title: 'More: move, change kind, delete…', 'aria-label': 'More actions', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); contextMenu({ x: r.left, y: r.bottom + 4 }, blockMenuItems([n.id])); } }, icon('more'))),
    direction,
    kids.length > 0 && h('div', { class: 'contains' },
      h('div', { class: 'contains-head' }, `This ${typeLabel} contains`, h('button', { class: 'link', onclick: () => { state.view = 'board'; render(); } }, 'Open as board')),
      h('ol', { class: 'contains-list' }, kids.map((k) => h('li', null,
        h('button', { class: 'contains-item', onclick: () => select(k.id) },
          h('span', { class: `dot status-${k.status}` }),
          h('strong', null, k.title),
          k.synopsis && h('span', { class: 'muted' }, ` — ${k.synopsis}`),
          h('span', { class: 'wc' }, fmt(M.treeWords(P(), k.id))))))),
    ),
    h('div', { class: 'toolbar', role: 'toolbar' },
      blockStyleButton(ed),
      h('span', { class: 'tb-sep' }),
      tb(h('b', null, 'B'), 'Bold (⌘B)', exec('bold'), 'bold'),
      tb(h('i', null, 'I'), 'Italic (⌘I)', exec('italic'), 'italic'),
      tb('•', 'Bulleted list', exec('insertUnorderedList'), 'insertUnorderedList'),
      tb('✱', 'Scene break', exec('insertHorizontalRule')),
      formatMenuButton(ed),
      h('span', { class: 'tb-sep' }),
      h('button', { class: 'tb wide', title: 'Split this block into two at the cursor', onmousedown: (e) => { e.preventDefault(); splitAtCursor(); } }, icon('split'), 'Split here'),
      h('button', { class: 'tb wide', title: 'Echoes: repeated words, phrases and crutch words in this block', onmousedown: (e) => e.preventDefault(), onclick: openEchoes }, icon('echo'), 'Echoes'),
      aiReady() && h('button', { class: 'tb wide', title: 'Polish: select a passage for other ways to say it, or click with nothing selected to line-edit this block (AI)', onmousedown: (e) => e.preventDefault(), onclick: runPolish }, icon('spark'), 'Polish'),
      h('div', { class: 'spacer' }),
      writingToggles(ed),
      h('span', { class: 'tb-sep' }),
      h('span', { class: 'tb-count' }, h('span', { 'data-wc': n.id }, fmt(M.treeWords(P(), n.id))), n.targetWords ? ` / ${fmt(n.targetWords)}` : '', ' words'),
    ),
    ed,
    h('div', { class: 'write-foot' },
      h('button', { class: 'btn small', onclick: () => addAfter(n.id) }, icon('plus'), `New ${typeLabel} after this`),
      (() => { const up = nextInOrder(n.id); return up && h('button', { class: 'btn small primary next-up', onclick: () => select(up.id, 'write'), title: 'The next block in the book' }, `Next up: ${up.title} →`); })()),
  );
}

export function neighborCard(n, label) {
  if (!n) return h('div', { class: 'neighbor empty' }, h('span', { class: 'eyebrow' }, label), h('span', { class: 'muted' }, label === 'Before' ? 'This is the first one.' : 'This is the last one.'));
  return h('button', { class: 'neighbor', onclick: () => select(n.id) },
    h('span', { class: 'eyebrow' }, label),
    h('strong', null, n.title),
    h('span', { class: 'muted' }, n.synopsis || 'No synopsis yet.'));
}

export function renderBookOverview() {
  const p = P();
  const root = p.nodes.root;
  const total = M.treeWords(p);
  const all = M.flatten(p).map((x) => x.node);
  const leaves = all.filter((n) => !n.children.length);
  const byStatus = M.STATUSES.map((s) => ({ ...s, count: leaves.filter((n) => n.status === s.id).length }));
  const parts = root.children.map((id) => p.nodes[id]);
  return h('div', { class: 'write overview' },
    h('div', { class: 'eyebrow' }, 'The whole book'),
    h('input', { class: 'title-input', value: root.title, 'aria-label': 'Book title', oninput: (e) => { root.title = e.target.value; changed(); document.querySelectorAll('[data-root-title]').forEach((x) => (x.textContent = root.title)); } }),
    h('input', { class: 'author-input', value: p.author, placeholder: 'Author', 'aria-label': 'Author', oninput: (e) => { p.author = e.target.value; changed(); } }),
    h('div', { class: 'direction-grid wide' },
      field('Premise', 'The book in a few sentences. What happens, or what it argues?', root.synopsis, (v) => (root.synopsis = v), { rows: 3 }),
      field('What it’s really about', 'The question, feeling or idea underneath. What should a reader carry away?', root.purpose, (v) => (root.purpose = v), { rows: 3 }),
    ),
    h('div', { class: 'overview-actions' },
      h('button', { class: 'btn small', onclick: () => openExport({ kind: 'snapshot' }) }, icon('share'), 'Share your progress…'),
      h('button', { class: 'btn small ghost', onclick: () => openExport() }, icon('print'), 'Export…')),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-num', 'data-wc': 'root' }, fmt(total)), h('div', { class: 'stat-label' }, 'words written')),
      h('div', { class: 'stat' },
        h('input', { class: 'stat-num input', type: 'number', min: 0, step: 1000, value: p.targetWords || '', placeholder: '—', 'aria-label': 'Target words', oninput: (e) => { p.targetWords = +e.target.value || 0; changed(); refreshCounts(); } }),
        h('div', { class: 'stat-label' }, 'target')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, all.filter((n) => n.type === 'chapter').length), h('div', { class: 'stat-label' }, 'chapters')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, leaves.length), h('div', { class: 'stat-label' }, 'blocks to write')),
    ),
    h('div', { class: 'progress' }, h('div', { class: 'progress-bar', 'data-progress': '', style: `width:${Math.min(100, (total / (p.targetWords || 1)) * 100)}%` })),
    h('div', { class: 'status-strip', title: 'Blocks by status' },
      byStatus.filter((s) => s.count).map((s) => h('div', { class: `seg status-${s.id}`, style: `flex:${s.count}` }, h('span', null, `${s.label} ${s.count}`)))),
    h('h3', { class: 'section-head' }, 'Parts'),
    h('div', { class: 'part-cards' },
      parts.map((pt) => h('button', { class: 'part-card', onclick: () => select(pt.id, 'board') },
        h('strong', null, pt.title),
        h('span', { class: 'muted' }, pt.synopsis || 'No synopsis yet.'),
        h('span', { class: 'wc' }, `${pt.children.length} ${pt.children.length === 1 ? 'chapter' : 'chapters'} · ${fmt(M.treeWords(p, pt.id))} words`))),
      h('button', { class: 'part-card add', onclick: () => addChild('root', 'part') }, icon('plus'), 'Add part')),
  );
}
