import * as AI from '../lib/ai.js';
import * as X from '../lib/export.js';
import * as M from '../lib/model.js';
import { autoGrow, fmt, h, icon, toast } from '../core/dom.js';
import { P, aiSettings, prefs, sel, sessionKey, state } from '../core/state.js';
import { snapshot } from '../core/undo.js';
import { addAfter, addChild, mergeNext, removeNode, select, shift } from '../project/commands.js';
import { changed } from '../project/files.js';
import { renderIdeasFor, renderSpark } from './brainstorm.js';
import { openExport } from './export-dialog.js';
import { openSettings } from './settings.js';
import { render } from './shell.js';
import { openEchoes, runPolish, runStoryCheck } from './tools.js';
import { refreshCounts } from './topbar.js';
import { aiError, aiReady } from '../views/notebook.js';
import { statusSelect } from '../views/outline.js';
import { field } from '../views/write.js';

// ---- render: inspector (right) ----------------------------------------------------

export function renderInspectorOnly() {
  document.querySelector('.inspector')?.replaceWith(renderInspector());
  document.querySelectorAll('.o-row.selected, .card.selected, .map-card.selected').forEach((r) => r.classList.remove('selected'));
  document.querySelectorAll(`.o-row[data-id="${state.selectedId}"], .card[data-id="${state.selectedId}"], .map-card[data-id="${state.selectedId}"]`).forEach((r) => r.classList.add('selected'));
  document.querySelectorAll('.binder .row.selected').forEach((r) => r.classList.remove('selected'));
  document.querySelector(`.binder .row[data-id="${state.selectedId}"]`)?.classList.add('selected');
}

export function renderInspector() {
  const n = sel();
  const isRoot = n.id === 'root';
  const block = !isRoot && inspectorBlock(n);
  const ideas = !isRoot && renderIdeasFor(n);
  if (state.view === 'notebook') return h('aside', { class: 'inspector' }, renderSpark(n));
  const byStage = {
    gather: [renderSpark(n), ideas, renderAssistant(n)],
    plan: [block, renderAssistant(n), ideas],
    draft: [block, ideas, renderSpark(n), renderAssistant(n)],
    revise: [revisePanel(n), renderAssistant(n), block],
    share: [sharePanel(), block],
  }[state.stage] || [block, renderSpark(n), renderAssistant(n)];
  return h('aside', { class: 'inspector' }, byStage);
}

export function inspectorBlock(n) {
  const words = M.treeWords(P(), n.id);
  const parent = M.parentOf(P(), n.id);
  const idx = parent.children.indexOf(n.id);
  const childType = M.TYPES[n.type].child;
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('span', { class: 'eyebrow' }, 'This block'), h('span', { class: 'panel-title' }, n.title)),
    h('div', { class: 'kv' },
      h('label', null, 'Kind'),
      h('select', { onchange: (e) => { n.type = e.target.value; changed(); render(); } },
        ['part', 'chapter', 'section'].map((t) => h('option', { value: t, selected: n.type === t }, M.TYPES[t].label))),
      h('label', null, 'Status'), statusSelect(n),
      h('label', null, 'Target'),
      h('input', { type: 'number', min: 0, step: 100, value: n.targetWords || '', placeholder: 'words', oninput: (e) => { n.targetWords = +e.target.value || 0; changed(); refreshCounts(); } }),
    ),
    h('div', { class: 'progress small' }, h('div', { class: 'progress-bar', 'data-progress': '', style: `width:${n.targetWords ? Math.min(100, (words / n.targetWords) * 100) : 0}%` })),
    h('div', { class: 'muted small' }, h('span', { 'data-wc': n.id }, fmt(words)), n.targetWords ? ` of ${fmt(n.targetWords)} words` : ' words'),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Tags'),
      h('input', { value: n.tags.join(', '), placeholder: 'e.g. flashback, Mara, needs research', oninput: (e) => { n.tags = e.target.value.split(',').map((t) => t.trim()).filter(Boolean); changed(); } })),
    field('Notes', 'Margin notes, research, reminders to self…', n.notes, (v) => (n.notes = v), { rows: 3 }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', onclick: () => addChild(n.id, childType) }, icon('plus'), `${M.TYPES[childType].label} inside`),
      h('button', { class: 'btn small', onclick: () => addAfter(n.id) }, icon('plus'), `${M.TYPES[n.type].label} after`),
      h('button', { class: 'btn small', disabled: idx === 0, onclick: () => shift(n.id, -1), title: 'Move up' }, icon('up'), 'Up'),
      h('button', { class: 'btn small', disabled: idx === parent.children.length - 1, onclick: () => shift(n.id, 1), title: 'Move down' }, icon('down'), 'Down'),
      h('button', { class: 'btn small', disabled: idx === parent.children.length - 1, onclick: () => mergeNext(n.id), title: 'Combine this block with the next one at the same level' }, icon('merge'), 'Merge next'),
      h('button', { class: 'btn small danger-ghost', onclick: () => removeNode(n.id) }, icon('trash'), 'Delete'),
    ),
  );
}
// ---- assistant -------------------------------------------------------------------------

export function renderAssistant(n) {
  const head = h('div', { class: 'panel-head' }, h('span', { class: 'eyebrow' }, icon('spark'), ' Assistant'));
  if (!prefs.aiEnabled) {
    return h('section', { class: 'panel assistant off' }, head,
      h('p', { class: 'muted small' }, 'Optional AI help with direction, flow and breaking big pieces down. It’s off, and nothing leaves your computer.'),
      h('button', { class: 'btn small', onclick: openSettings }, 'Set up assistant'));
  }
  if (!sessionKey) {
    return h('section', { class: 'panel assistant' }, head,
      h('p', { class: 'muted small' }, 'Add your Anthropic API key in Settings to use the assistant.'),
      h('button', { class: 'btn small', onclick: openSettings }, 'Add key'));
  }
  const isRoot = n.id === 'root';
  const hasText = !!M.stripHtml(n.content).trim();
  const list = ({
    gather: [],
    plan: isRoot ? ['structure', 'breakdown'] : ['direction', 'breakdown', ...(hasText ? ['summarize'] : [])],
    draft: isRoot ? [] : ['direction', 'flow'],
    revise: isRoot ? ['structure'] : ['flow', ...(hasText ? ['summarize'] : [])],
  })[state.stage] ?? (isRoot ? ['structure', 'breakdown'] : ['direction', 'flow', ...(hasText ? ['summarize'] : []), 'breakdown']);
  const res = state.aiResults[n.id];
  const askBox = h('textarea', { rows: 2, placeholder: isRoot ? 'Ask about the book…' : `Ask about this ${M.TYPES[n.type].label.toLowerCase()}…`, onkeydown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runAsk(); } });
  function runAsk() {
    const q = askBox.value.trim();
    if (q) runAI(n.id, 'ask', () => AI.ask(aiSettings(), P(), n.id, q));
  }
  return h('section', { class: 'panel assistant' }, head,
    h('div', { class: 'ai-actions' }, list.map((a) => h('button', {
      class: 'ai-btn', disabled: res?.loading, title: AI.actions[a].hint,
      onclick: () => runAI(n.id, a, () => AI.actions[a].run(aiSettings(), P(), n.id)),
    }, h('strong', null, AI.actions[a].label), h('span', null, AI.actions[a].hint)))),
    (isRoot || n.children.length > 0) && state.stage !== 'revise' && state.stage !== 'gather' && h('button', {
      class: 'ai-btn', onclick: () => runStoryCheck(n.id),
      title: 'Reads the writing for plot holes, continuity slips, dropped threads and motivation gaps',
    }, h('strong', null, 'Story check'), h('span', null, `Plot holes, continuity, dropped threads${isRoot ? ' across the book' : ` in this ${M.TYPES[n.type].label.toLowerCase()}`}.`)),
    h('div', { class: 'ask' }, autoGrow(askBox), h('button', { class: 'btn small', disabled: res?.loading, onclick: runAsk }, 'Ask')),
    res && renderAIResult(n, res),
  );
}

export async function runAI(id, action, fn) {
  state.aiResults[id] = { action, loading: true };
  renderInspectorOnly();
  try {
    const out = await fn();
    state.aiResults[id] = typeof out === 'string' ? { action, html: AI.renderMarkdown(out) } : { action, data: out };
  } catch (e) {
    state.aiResults[id] = { action, error: aiError(e) };
  }
  if (state.selectedId === id) renderInspectorOnly();
}

export function renderAIResult(n, res) {
  const close = h('button', { class: 'icon-btn small', title: 'Dismiss', onclick: () => { delete state.aiResults[n.id]; renderInspectorOnly(); } }, icon('close'));
  const label = res.action === 'ask' ? 'Answer' : AI.actions[res.action]?.label;
  const wrap = (...kids) => h('div', { class: 'ai-result' }, h('div', { class: 'ai-result-head' }, h('span', { class: 'eyebrow' }, label), close), ...kids);
  if (res.loading) return h('div', { class: 'ai-result loading' }, h('span', { class: 'spinner' }), 'Thinking it through…');
  if (res.error) return wrap(h('p', { class: 'error-text' }, res.error));
  if (res.html) return wrap(h('div', { class: 'ai-body', html: res.html }));
  if (res.action === 'summarize') {
    const { synopsis, purpose } = res.data;
    const use = (key, val) => { snapshot(); n[key] = val; changed(); render(); toast('Updated.', { undo: true }); };
    return wrap(
      h('div', { class: 'suggest' }, h('span', { class: 'field-label' }, 'What happens'), h('p', null, synopsis), h('button', { class: 'btn small', onclick: () => use('synopsis', synopsis) }, 'Use this')),
      h('div', { class: 'suggest' }, h('span', { class: 'field-label' }, 'Why it’s here'), h('p', null, purpose), h('button', { class: 'btn small', onclick: () => use('purpose', purpose) }, 'Use this')));
  }
  if (res.action === 'breakdown') {
    const picks = res.data.pieces.map(() => true);
    return wrap(
      h('p', { class: 'muted small' }, res.data.note),
      h('ol', { class: 'pieces' }, res.data.pieces.map((pc, i) => h('li', null,
        h('label', null, h('input', { type: 'checkbox', checked: true, onchange: (e) => (picks[i] = e.target.checked) }),
          h('span', null, h('strong', null, pc.title), h('br'), pc.synopsis, h('br'), h('em', { class: 'muted' }, pc.purpose)))))),
      h('button', {
        class: 'btn small primary', onclick: () => {
          snapshot();
          const type = M.TYPES[n.type].child;
          res.data.pieces.forEach((pc, i) => {
            if (!picks[i]) return;
            const c = M.addNode(P(), n.id, type, null, pc.title);
            c.synopsis = pc.synopsis;
            c.purpose = pc.purpose;
            c.status = 'outlined';
          });
          delete state.aiResults[n.id];
          changed();
          select(n.id, 'board');
          toast('Added. Rearrange them on the board.', { undo: true });
        },
      }, `Add as ${M.TYPES[M.TYPES[n.type].child].label.toLowerCase()}s`));
  }
  return null;
}
// ---- the side panel, by stage ------------------------------------------------------------------

export function revisePanel(n) {
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('span', { class: 'eyebrow' }, 'Revise'), h('span', { class: 'panel-title' }, n.id === 'root' ? 'The whole book' : n.title)),
    h('div', { class: 'tool-list' },
      h('button', { class: 'ai-btn', onclick: () => { if (state.view !== 'read' && state.view !== 'write') state.view = 'write'; openEchoes(); } }, h('strong', null, 'Echoes'), h('span', null, 'Repeated words, phrases and crutch words.')),
      aiReady() && n.id !== 'root' && state.view === 'write' && h('button', { class: 'ai-btn', onclick: runPolish }, h('strong', null, '✦ Polish'), h('span', null, 'Select a passage for other wordings, or line-edit this block.')),
      aiReady() && h('button', { class: 'ai-btn', onclick: () => runStoryCheck(n.id === 'root' || n.children.length ? n.id : M.parentOf(P(), n.id).id) }, h('strong', null, '✦ Story check'), h('span', null, 'Plot holes, continuity, dropped threads.'))),
    n.id !== 'root' && h('div', { class: 'kv revise-status' }, h('label', null, 'Status'), statusSelect(n)));
}

export function sharePanel() {
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('span', { class: 'eyebrow' }, 'Share')),
    h('div', { class: 'tool-list' }, Object.entries(X.KINDS).map(([id, k]) => h('button', { class: 'ai-btn', onclick: () => openExport({ kind: id }) }, h('strong', null, k.label), h('span', null, k.who.split('. ')[0] + '.')))));
}
