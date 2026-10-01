import * as AI from '../lib/ai.js';
import * as E from '../lib/echoes.js';
import * as M from '../lib/model.js';
import { fmt, h, icon, toast } from '../core/dom.js';
import { P, aiSettings, sel, state } from '../core/state.js';
import { select } from '../project/commands.js';
import { MOD, changed } from '../project/files.js';
import { openSettings } from './settings.js';
import { aiError, aiReady, newNote } from '../views/notebook.js';

// ---- the drawer: Echoes, Polish and Story check results ---------------------------------
// A panel that slides in from the right and stays put while you write. It lives outside
// #app, so re-rendering the workspace doesn't close it.

// Keeps the same data object, so async work that started it can fill it in later.
export function openDrawer(kind, data = {}) {
  state.drawer = Object.assign(data, { kind });
  paintDrawer();
}

export function closeDrawer() {
  state.drawer = null;
  E.clearHighlight();
  paintDrawer();
}

export function paintDrawer() {
  let el = document.getElementById('drawer');
  const d = state.drawer;
  if (!d || !state.project) { el?.remove(); if (!d) E.clearHighlight(); return; }
  if (!el) {
    el = h('aside', { id: 'drawer', class: 'drawer', 'aria-label': 'Tools' });
    document.body.append(el);
  }
  const titles = { echoes: 'Echoes', polish: '✦ Polish', story: '✦ Story check' };
  const body = { echoes: echoesBody, polish: polishBody, story: storyBody }[d.kind]();
  el.replaceChildren(
    h('div', { class: 'drawer-head' }, h('h3', null, titles[d.kind]), h('button', { class: 'icon-btn small', title: 'Close', onclick: closeDrawer }, icon('close'))),
    h('div', { class: 'drawer-body' }, body));
}
// ---- Echoes ------------------------------------------------------------------------------

// What Echoes looks at: the open draft, or everything in the Read view.
export function echoesRoots() {
  if (state.view === 'read') return [...document.querySelectorAll('.read .read-prose')];
  if (state.view === 'write') return [...document.querySelectorAll('.write .editor')];
  return [];
}

export function openEchoes() {
  if (state.drawer?.kind === 'echoes') return closeDrawer();
  openDrawer('echoes', { term: null, idx: 0 });
}

export function echoesBody() {
  const d = state.drawer;
  const roots = echoesRoots();
  if (!roots.length) return h('p', { class: 'muted' }, 'Open a block in Write, or the Read view, to check its wording.');
  const a = E.analyze(roots.map((r) => r.innerText).join('\n\n'));
  if (a.total < 30) return h('p', { class: 'muted' }, 'Write a little more first. Echoes needs a few paragraphs to find patterns.');
  const pick = (term) => { d.term = d.term === term ? null : term; d.idx = 0; d.scroll = true; paintDrawer(); };
  const item = (term, label) => h('button', { class: `echo-item ${d.term === term ? 'on' : ''}`, onclick: () => pick(term) },
    h('span', { class: 'echo-term' }, term), h('span', { class: 'echo-count' }, label));
  const group = (title, hint, items) => items.length > 0 && h('section', { class: 'echo-group' },
    h('div', { class: 'eyebrow' }, title), h('p', { class: 'muted small' }, hint), h('div', { class: 'echo-list' }, items));

  let stepper = null;
  if (d.term) {
    const ranges = E.highlight(roots, d.term);
    if (ranges.length) {
      d.idx = ((d.idx % ranges.length) + ranges.length) % ranges.length;
      E.highlightCurrent(ranges[d.idx]);
      if (d.scroll) { ranges[d.idx].startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' }); d.scroll = false; }
      const step = (n) => { d.idx += n; d.scroll = true; paintDrawer(); };
      stepper = h('div', { class: 'echo-stepper' },
        h('span', null, h('b', null, `“${d.term}”`), ` ${d.idx + 1} of ${ranges.length}`),
        h('button', { class: 'icon-btn small', title: 'Previous', onclick: () => step(-1) }, icon('arrowL')),
        h('button', { class: 'icon-btn small flip', title: 'Next', onclick: () => step(1) }, icon('arrowL')));
    }
  } else E.clearHighlight();

  return [
    h('p', { class: 'muted small' }, `${fmt(a.total)} words ${state.view === 'read' ? 'in this reading' : 'in this block'}. Click anything to see where it appears.`),
    !E.canHighlight && h('p', { class: 'muted small' }, 'This browser can’t highlight words in place, so you’ll see counts only.'),
    stepper,
    group('Close repeats', 'The same word again within a few lines.', a.echoes.map((x) => item(x.word, `×${x.count}`))),
    group('Words you lean on', 'Used often for a piece this long.', a.overused.map((x) => item(x.word, `×${x.count}`))),
    group('Repeated phrases', 'The same few words, more than once.', a.repeated.map((x) => item(x.phrase, `×${x.count}`))),
    group('Crutch words', 'Often filler, or telling instead of showing. Keep the ones that earn their place.', a.crutch.map((x) => item(x.word, `×${x.count}`))),
    !a.echoes.length && !a.overused.length && !a.repeated.length && !a.crutch.length && h('p', { class: 'muted' }, 'Nothing stands out. Nice and varied.'),
    h('button', { class: 'btn small ghost', onclick: () => paintDrawer() }, 'Check again'),
  ];
}
// ---- Polish (AI line editing) ------------------------------------------------------------

export function runPolish() {
  const n = sel();
  const ed = document.querySelector('.write .editor');
  if (!ed) return;
  const s = getSelection();
  const picked = s.rangeCount && ed.contains(s.anchorNode) ? s.toString().trim() : '';
  if (picked && picked.split(/\s+/).length >= 2) {
    const r = s.getRangeAt(0);
    const before = document.createRange();
    before.setStart(ed, 0);
    before.setEnd(r.startContainer, r.startOffset);
    const after = document.createRange();
    after.setStart(r.endContainer, r.endOffset);
    after.setEnd(ed, ed.childNodes.length);
    const d = { mode: 'alt', nodeId: n.id, original: picked, range: r.cloneRange(), loading: true };
    openDrawer('polish', d);
    AI.polish.alternatives.run(aiSettings(), P(), n.id, picked, before.toString().slice(-500), after.toString().slice(0, 500))
      .then((data) => { d.data = data; }, (e) => { d.error = aiError(e); })
      .finally(() => { d.loading = false; if (state.drawer === d) paintDrawer(); });
    return;
  }
  if (!M.stripHtml(n.content).trim()) return toast('Write something first, or select a passage, then Polish.');
  const d = { mode: 'edit', nodeId: n.id, loading: true, applied: new Set() };
  openDrawer('polish', d);
  AI.polish.lineEdit.run(aiSettings(), P(), n.id)
    .then((data) => { d.data = data; }, (e) => { d.error = aiError(e); })
    .finally(() => { d.loading = false; if (state.drawer === d) paintDrawer(); });
}

// Replace text in the open draft the way typing would, so ⌘Z undoes it.
export function replaceInDraft(nodeId, original, replacement, range) {
  const ed = document.querySelector('.write .editor');
  if (!ed || state.selectedId !== nodeId) return 'away';
  const r = range && ed.contains(range.startContainer) && range.toString().trim() === original ? range : E.findRanges(ed, original)[0];
  if (!r) return 'missing';
  ed.focus();
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
  document.execCommand('insertText', false, replacement);
  return 'ok';
}

export function polishBody() {
  const d = state.drawer;
  const node = P().nodes[d.nodeId];
  if (d.loading) return h('div', { class: 'ai-result loading' }, h('span', { class: 'spinner' }), d.mode === 'alt' ? 'Trying other ways to say it…' : 'Reading closely…');
  if (d.error) return h('p', { class: 'error-text' }, d.error);
  if (!node) return h('p', { class: 'muted' }, 'That block is gone.');
  const away = state.selectedId !== d.nodeId || state.view !== 'write';
  const goBack = away && h('button', { class: 'btn small', onclick: () => select(d.nodeId, 'write') }, `Back to “${node.title}” to apply`);
  const result = (status) => {
    if (status === 'ok') return true;
    toast(status === 'missing' ? 'Couldn’t find that exact text any more. It may have changed since.' : 'Open the block to apply this.', { error: status === 'missing' });
    return false;
  };
  if (d.mode === 'alt') {
    return [
      h('div', { class: 'eyebrow' }, 'Your words'),
      h('blockquote', { class: 'polish-orig' }, d.original),
      goBack,
      h('div', { class: 'eyebrow' }, 'Other ways to say it'),
      d.data.options.map((o) => h('div', { class: 'polish-card' },
        h('p', { class: 'polish-text' }, o.text),
        h('p', { class: 'muted small' }, o.note),
        h('button', {
          class: 'btn small', disabled: away,
          onclick: () => { if (result(replaceInDraft(d.nodeId, d.original, o.text, d.range))) { toast(`Replaced. ${MOD}Z to undo.`); closeDrawer(); } },
        }, 'Use this'))),
      h('p', { class: 'muted small' }, 'Select a different passage and Polish again for more.'),
    ];
  }
  return [
    h('p', { class: 'polish-overall' }, d.data.overall),
    goBack,
    !d.data.edits.length && h('p', { class: 'muted' }, 'Nothing to change. It reads well.'),
    d.data.edits.map((x, i) => {
      const done = d.applied.has(i);
      const show = () => {
        const ed = document.querySelector('.write .editor');
        const r = ed && E.findRanges(ed, x.original)[0];
        if (!r) return toast('Couldn’t find that passage in the open draft.');
        E.highlightCurrent(r);
        r.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      return h('div', { class: `polish-card edit ${done ? 'done' : ''}` },
        h('span', { class: 'chip' }, x.kind),
        h('p', { class: 'polish-del' }, x.original),
        h('p', { class: 'polish-ins' }, x.suggestion),
        h('p', { class: 'muted small' }, x.why),
        h('div', { class: 'polish-actions' },
          h('button', { class: 'btn small', disabled: done || away, onclick: () => { if (result(replaceInDraft(d.nodeId, x.original, x.suggestion))) { d.applied.add(i); paintDrawer(); } } }, done ? 'Applied' : 'Apply'),
          !done && h('button', { class: 'btn small ghost', disabled: away, onclick: show }, 'Show me')));
    }),
  ];
}
// ---- Story check (AI) ------------------------------------------------------------------

export async function runStoryCheck(scopeId = 'root') {
  if (!aiReady()) return openSettings();
  const words = AI.storyCheckSize(P(), scopeId);
  const what = scopeId === 'root' ? 'your whole manuscript' : `“${P().nodes[scopeId].title}”`;
  if (words > 1500 && !confirm(`Story check reads ${what}: about ${fmt(words)} words, sent to Anthropic with your API key. Longer books take a few minutes and cost more. Go ahead?`)) return;
  const d = { scopeId, loading: true };
  openDrawer('story', d);
  try { d.data = await AI.storyCheck.run(aiSettings(), P(), scopeId); } catch (e) { d.error = aiError(e); }
  d.loading = false;
  if (state.drawer === d) paintDrawer();
}

export function storyBody() {
  const d = state.drawer;
  if (d.loading) return h('div', { class: 'ai-result loading' }, h('span', { class: 'spinner' }), 'Reading the whole thing. This can take a few minutes for a long book…');
  if (d.error) return h('p', { class: 'error-text' }, d.error);
  const { summary, issues } = d.data;
  const order = { high: 0, medium: 1, low: 2 };
  const linkTo = (id) => P().nodes[id] && h('button', { class: 'chip link-chip', onclick: () => select(id, 'write') }, P().nodes[id].title);
  return [
    h('p', { class: 'polish-overall' }, summary),
    !issues.length && h('p', { class: 'muted' }, 'No problems found in the story’s logic.'),
    [...issues].sort((a, b) => order[a.severity] - order[b.severity]).map((x) => h('div', { class: `story-card sev-${x.severity}` },
      h('div', { class: 'story-top' }, h('span', { class: 'sev' }, x.severity), h('span', { class: 'chip' }, x.kind)),
      h('strong', null, x.title),
      h('p', null, x.detail),
      h('p', { class: 'muted small' }, h('b', null, 'Try: '), x.suggestion),
      h('div', { class: 'story-links' }, x.ids.map(linkTo),
        h('button', { class: 'link', onclick: (e) => { newNote(`Story check · ${x.title}\n${x.detail}\nTry: ${x.suggestion}`, { nodeId: x.ids[0] || null }); e.currentTarget.replaceWith(h('span', { class: 'muted small' }, 'Saved to notebook')); } }, 'Save to notebook')))),
    h('p', { class: 'muted small' }, 'The assistant can miss things and occasionally flag something that’s fine. Trust your own read.'),
  ];
}
