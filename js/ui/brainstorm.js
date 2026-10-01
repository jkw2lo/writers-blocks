import * as AI from '../lib/ai.js';
import * as M from '../lib/model.js';
import { dealPrompt } from '../lib/prompts.js';
import { autoGrow, fmt, h, icon, toast } from '../core/dom.js';
import { P, aiSettings, prefs, savePrefs, state } from '../core/state.js';
import { snapshot } from '../core/undo.js';
import { select } from '../project/commands.js';
import { changed } from '../project/files.js';
import { renderInspectorOnly } from './inspector.js';
import { render } from './shell.js';
import { SOURCES, aiError, aiReady, deleteNote, hereLabel, newNote } from '../views/notebook.js';

// ---- brainstorm tools: prompts, freewrite, collide, AI sparks ------------------------

export function openModal(dlg) {
  dlg.addEventListener('close', () => { dlg.remove(); render(); });
  document.body.append(dlg);
  dlg.showModal();
}

export function openCollide() {
  const pool = P().notebook.filter((n) => n.text.trim() && n.color !== 'label');
  if (pool.length < 2) return toast('Collide needs at least two ideas in your notebook.');
  let a;
  let b;
  const dlg = h('dialog', { class: 'modal collide' });
  const pair = h('div', { class: 'pair' });
  const answer = autoGrow(h('textarea', { rows: 3, placeholder: 'How might these connect? What happens if both are true? Nonsense is allowed.' }));
  const card = (n) => h('div', { class: `note static c-${n.color}` }, h('p', null, n.text));
  const shuffle = () => {
    const i = Math.floor(Math.random() * pool.length);
    let j = Math.floor(Math.random() * (pool.length - 1));
    if (j >= i) j++;
    [a, b] = [pool[i], pool[j]];
    pair.replaceChildren(card(a), h('div', { class: 'plus' }, '+'), card(b));
    answer.value = '';
    answer.focus();
  };
  const keep = () => {
    const text = answer.value.trim();
    if (!text) return answer.focus();
    snapshot();
    const pos = a.x != null && b.x != null ? { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) + 140 } : {};
    const n = newNote(text, { source: 'collide', color: 'lilac', nodeId: a.nodeId || b.nodeId || null, ...pos });
    M.linkNotes(P(), a.id, n.id);
    M.linkNotes(P(), b.id, n.id);
    changed();
    toast('Saved the connection to your notebook.');
    shuffle();
  };
  dlg.append(
    h('div', { class: 'dlg-head' }, h('h2', null, 'Collide two ideas'), h('button', { class: 'icon-btn', onclick: () => dlg.close(), title: 'Close' }, icon('close'))),
    h('p', { class: 'muted' }, 'Two random ideas from your notebook, side by side. Unexpected pairings are where new material comes from.'),
    pair, answer,
    h('div', { class: 'dlg-foot' },
      h('button', { class: 'btn', onclick: shuffle }, 'Shuffle'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', onclick: keep }, 'Save connection')),
  );
  answer.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) keep(); });
  openModal(dlg);
  shuffle();
}

export function openFreewrite(prompt = '', scopeId = state.selectedId) {
  let minutes = prefs.sprintMinutes || 10;
  let strict = false;
  let started = false;
  let finished = false;
  let timer;
  let endAt;
  const dlg = h('dialog', { class: 'sprint' });
  const promptInput = h('input', { class: 'sprint-prompt-input', value: prompt, placeholder: 'Optional: a prompt or question to write toward' });
  const ta = h('textarea', { class: 'sprint-text prose', placeholder: 'Go. Don’t stop, don’t fix, just keep moving…' });
  const clock = h('span', { class: 'sprint-clock' });
  const wc = h('span', { class: 'sprint-wc' }, '0 words');
  const minuteBtns = h('div', { class: 'seg-control' });
  const drawMinutes = () => minuteBtns.replaceChildren(...[5, 10, 15, 20].map((m) =>
    h('button', { class: m === minutes ? 'active' : '', onclick: () => { minutes = m; drawMinutes(); } }, `${m} min`)));
  drawMinutes();

  const setup = h('div', { class: 'sprint-setup' },
    h('h2', null, 'Freewrite'),
    h('p', { class: 'muted' }, `Write without stopping for a set time${scopeId !== 'root' ? ` about ${hereLabel(P().nodes[scopeId])}` : ''}. Don’t edit and don’t judge. Whatever comes out goes into your notebook, where you can mine it later.`),
    promptInput,
    minuteBtns,
    h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => (strict = e.target.checked) }), 'No deleting: backspace is switched off, so keep moving forward'),
    h('div', { class: 'dlg-foot' },
      h('button', { class: 'btn ghost', onclick: () => dlg.close() }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: start }, 'Start')));

  const running = h('div', { class: 'sprint-run' },
    h('div', { class: 'sprint-bar' },
      h('span', { class: 'sprint-prompt' }),
      h('span', { class: 'spacer' }), wc, clock,
      h('button', { class: 'btn small', onclick: finish }, 'Done')),
    ta);
  running.hidden = true;

  function start() {
    started = true;
    prefs.sprintMinutes = minutes;
    savePrefs();
    running.querySelector('.sprint-prompt').textContent = promptInput.value.trim();
    setup.hidden = true;
    running.hidden = false;
    endAt = Date.now() + minutes * 60000;
    tick();
    timer = setInterval(tick, 500);
    ta.focus();
  }
  function tick() {
    const left = Math.max(0, endAt - Date.now());
    if (left === 0) {
      clearInterval(timer);
      clock.textContent = 'Time’s up. Finish your thought';
      clock.classList.add('done');
      return;
    }
    const s = Math.ceil(left / 1000);
    clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    const text = ta.value.trim();
    if (text) {
      const pr = promptInput.value.trim();
      newNote(pr ? `${pr}\n\n${text}` : text, { source: 'freewrite', color: 'peach', nodeId: scopeId !== 'root' ? scopeId : null });
      changed();
      toast(`Saved ${fmt(M.countWords(text))} freewritten words to your notebook.`);
    }
    dlg.close();
  }
  ta.addEventListener('input', () => { wc.textContent = `${fmt(M.countWords(ta.value))} words`; });
  ta.addEventListener('keydown', (e) => {
    if (strict && (e.key === 'Backspace' || e.key === 'Delete' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x'))) e.preventDefault();
  });
  dlg.addEventListener('cancel', (e) => { if (started) { e.preventDefault(); finish(); } });
  dlg.append(setup, running);
  openModal(dlg);
  promptInput.focus();
}

export async function runSpark(scopeId, kind) {
  state.spark = { scopeId, kind, loading: true };
  renderInspectorOnly();
  try {
    const data = await AI.brainstorm[kind].run(aiSettings(), P(), scopeId);
    state.spark = { scopeId, kind, data, kept: new Set(), answers: [] };
  } catch (e) {
    state.spark = { scopeId, kind, error: aiError(e) };
  }
  renderInspectorOnly();
}

export function renderSpark(n) {
  const sp = state.spark?.scopeId === n.id ? state.spark : null;
  const btn = (label, hint, fn, disabled = false) => h('button', { class: 'spark-btn', title: hint, disabled, onclick: fn }, label);
  const scope = state.view === 'notebook'
    ? h('select', { class: 'scope-select', 'aria-label': 'Brainstorm about', onchange: (e) => { state.selectedId = e.target.value; renderInspectorOnly(); } },
      h('option', { value: 'root', selected: n.id === 'root' }, 'about the whole book'),
      M.flatten(P()).map(({ node, depth }) => h('option', { value: node.id, selected: node.id === n.id }, `${'  '.repeat(depth)}about ${node.title}`)))
    : h('span', { class: 'panel-sub' }, `about ${hereLabel(n)}`);
  return h('section', { class: 'panel spark' },
    h('div', { class: 'panel-head' }, h('span', { class: 'eyebrow' }, icon('bulb'), ' Brainstorm'), scope),
    h('div', { class: 'spark-grid' },
      btn('Deal a prompt', 'A random prompt to get you thinking sideways', () => { state.spark = { scopeId: n.id, kind: 'prompt', card: dealPrompt(hereLabel(n)) }; renderInspectorOnly(); }),
      btn('Freewrite', 'Write without stopping for a few minutes; it all goes to the notebook', () => openFreewrite('', n.id)),
      btn('Collide', 'Two random ideas from your notebook. How do they connect?', openCollide, P().notebook.length < 2),
      aiReady() && btn('✦ What if…?', 'Eight possibilities, from grounded to wild (AI)', () => runSpark(n.id, 'whatIf'), sp?.loading),
      aiReady() && btn('✦ Interview me', 'Questions only you can answer (AI)', () => runSpark(n.id, 'interview'), sp?.loading),
    ),
    !aiReady() && h('p', { class: 'muted small' }, 'With the assistant on (Settings), you also get AI “what ifs”, interviews, and riffs on any note.'),
    sp && renderSparkResult(sp, n),
  );
}

export function renderSparkResult(sp, n) {
  const nodeId = n.id !== 'root' ? n.id : null;
  const close = h('button', { class: 'icon-btn small', title: 'Dismiss', onclick: () => { state.spark = null; renderInspectorOnly(); } }, icon('close'));
  const wrap = (label, ...kids) => h('div', { class: 'ai-result spark-result' }, h('div', { class: 'ai-result-head' }, h('span', { class: 'eyebrow' }, label), close), ...kids);
  if (sp.loading) return h('div', { class: 'ai-result loading' }, h('span', { class: 'spinner' }), 'Brainstorming…');
  if (sp.error) return wrap('Brainstorm', h('p', { class: 'error-text' }, sp.error));

  if (sp.kind === 'prompt') {
    return wrap(sp.card.category,
      h('p', { class: 'prompt-text' }, sp.card.text),
      h('div', { class: 'actions' },
        h('button', { class: 'btn small', onclick: () => { sp.card = dealPrompt(hereLabel(n)); renderInspectorOnly(); } }, 'Another'),
        h('button', { class: 'btn small', onclick: () => { newNote(sp.card.text, { source: 'prompt', color: 'blue', nodeId }); changed(); toast('Kept in your notebook.'); render(); } }, 'Keep as idea'),
        h('button', { class: 'btn small primary', onclick: () => openFreewrite(sp.card.text, n.id) }, 'Freewrite on it')));
  }
  if (sp.kind === 'whatIf') {
    const keep = (i) => { newNote(sp.data.ideas[i].idea, { source: 'ai', nodeId }); sp.kept.add(i); };
    return wrap('What if…',
      h('ol', { class: 'spark-ideas' }, sp.data.ideas.map((idea, i) => h('li', null,
        h('span', { class: 'kind' }, idea.kind),
        h('span', { class: 'idea-text' }, idea.idea),
        h('button', {
          class: 'btn small', disabled: sp.kept.has(i),
          onclick: () => { keep(i); changed(); render(); },
        }, sp.kept.has(i) ? 'Kept' : 'Keep')))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn small', onclick: () => { sp.data.ideas.forEach((_, i) => !sp.kept.has(i) && keep(i)); changed(); render(); toast('All kept in your notebook.'); } }, 'Keep all'),
        h('button', { class: 'btn small', onclick: () => runSpark(n.id, 'whatIf') }, 'More ideas')));
  }
  if (sp.kind === 'interview') {
    return wrap('Interview',
      h('p', { class: 'muted small' }, 'Answer any that spark something. Rough is fine.'),
      h('ol', { class: 'interview' }, sp.data.questions.map((q, i) => h('li', null,
        h('p', null, q),
        autoGrow(h('textarea', { rows: 2, value: sp.answers[i] || '', placeholder: 'Your answer…', oninput: (e) => (sp.answers[i] = e.target.value) }))))),
      h('div', { class: 'actions' },
        h('button', {
          class: 'btn small primary', onclick: () => {
            const pairs = sp.data.questions.map((q, i) => [q, (sp.answers[i] || '').trim()]).filter(([, a]) => a);
            if (!pairs.length) return toast('Answer at least one question first.');
            pairs.forEach(([q, a]) => newNote(`${q}\n\n${a}`, { source: 'interview', color: 'green', nodeId }));
            state.spark = null;
            changed();
            render();
            toast(`Saved ${pairs.length} answer${pairs.length > 1 ? 's' : ''} to your notebook.`);
          },
        }, 'Save answers as ideas'),
        h('button', { class: 'btn small', onclick: () => runSpark(n.id, 'interview') }, 'Different questions')));
  }
  return null;
}

export function renderIdeasFor(n) {
  const ideas = P().notebook.filter((x) => x.nodeId === n.id);
  const add = h('input', {
    placeholder: 'Jot an idea for this block (Enter)',
    onkeydown: (e) => {
      if (e.key !== 'Enter' || !e.target.value.trim()) return;
      newNote(e.target.value.trim(), { nodeId: n.id });
      changed();
      renderInspectorOnly();
      document.querySelector('.ideas input')?.focus();
    },
  });
  return h('section', { class: 'panel ideas' },
    h('div', { class: 'panel-head row-head' },
      h('span', { class: 'eyebrow' }, icon('note'), ` Ideas for this block${ideas.length ? ` · ${ideas.length}` : ''}`),
      ideas.length > 0 && h('button', { class: 'link', onclick: () => { state.view = 'notebook'; state.noteScope = 'attached'; render(); } }, 'In notebook')),
    ideas.length > 0 && h('ul', { class: 'idea-list' }, ideas.map((x) => h('li', { class: `c-${x.color}` },
      autoGrow(h('textarea', { rows: 1, value: x.text, 'aria-label': 'Idea', oninput: (e) => { x.text = e.target.value; changed(); } })),
      x.source && h('span', { class: 'chip src' }, SOURCES[x.source]),
      h('button', { class: 'icon-btn small', title: 'Delete idea', onclick: () => deleteNote(x.id) }, icon('close'))))),
    add);
}
