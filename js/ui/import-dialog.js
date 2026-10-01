import * as AI from '../lib/ai.js';
import * as I from '../lib/import.js';
import * as M from '../lib/model.js';
import * as S from '../lib/storage.js';
import { fmt, h, icon, toast } from '../core/dom.js';
import { P, aiSettings, state } from '../core/state.js';
import { snapshot } from '../core/undo.js';
import { select } from '../project/commands.js';
import { changed, confirmDiscard, saveAs } from '../project/files.js';
import { startSession } from '../project/progress.js';
import { render } from './shell.js';
import { aiError, aiReady } from '../views/notebook.js';
import { field } from '../views/write.js';

// ---- Import --------------------------------------------------------------------------------

export function openImport() {
  const dlg = h('dialog', { class: 'settings import' });
  let parsed = null;  // { items, title, name }
  let tree = null;
  const file = h('input', { type: 'file', accept: I.ACCEPT, hidden: true });
  const body = h('div', { class: 'import-body' });
  const status = h('p', { class: 'muted small import-status' });
  let busy = false;
  const close = () => { if (!busy) dlg.close(); };

  const pickStep = () => {
    const drop = h('button', { class: 'import-drop', onclick: () => file.click() },
      icon('import'), h('strong', null, 'Choose a file, or drop it here'),
      h('span', { class: 'muted small' }, 'Word (.docx), Markdown (.md), plain text (.txt) or a web page (.html)'));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) read(e.dataTransfer.files[0]); });
    body.replaceChildren(
      h('p', null, 'Bring in a manuscript you’ve already started. Chapter headings become chapters, and scene breaks (like *** or #) become sections. Your file isn’t changed.'),
      drop);
  };

  const read = async (f) => {
    status.textContent = 'Reading…';
    try {
      const r = await I.readFile(f);
      parsed = { ...r, name: f.name.replace(/\.[^.]+$/, '') };
      tree = I.shape(r.items);
      reviewStep();
    } catch (e) {
      status.textContent = '';
      toast(e.message, { error: true });
    }
  };
  file.addEventListener('change', () => file.files[0] && read(file.files[0]));

  const reviewStep = () => {
    const st = I.stats(tree);
    const flat = !st.parts && st.chapters <= 1;
    const titleIn = h('input', { value: parsed.title || parsed.name, 'aria-label': 'Title' });
    const aiStructure = h('input', { type: 'checkbox', checked: flat });
    const aiDescribe = h('input', { type: 'checkbox', checked: true });
    const where = h('select', null,
      h('option', { value: 'new' }, 'As a new project'),
      state.project && h('option', { value: 'append' }, `Added to the end of “${P().nodes.root.title}”`));
    const outlineRows = [];
    const walk = (list, depth) => list.forEach((b) => {
      if (outlineRows.length < 80) outlineRows.push(h('li', { style: `--depth:${depth}` }, h('span', { class: `dot type-${b.type}` }), b.title, h('span', { class: 'muted small' }, ` ${fmt(I.stats([{ ...b, children: [] }]).words)} w`)));
      walk(b.children, depth + 1);
    });
    walk(tree, 0);
    body.replaceChildren(
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Title'), titleIn),
      h('p', { class: 'import-stats' }, [st.parts && `${st.parts} parts`, `${st.chapters} chapter${st.chapters === 1 ? '' : 's'}`, st.sections && `${st.sections} sections`, `${fmt(st.words)} words`].filter(Boolean).join(' · ')),
      flat && h('p', { class: 'muted small' }, 'No chapter headings were found, so it all landed in one chapter.' + (aiReady() ? ' The assistant can find the chapters and scenes for you.' : ' Turn on the assistant in Settings and it can find the chapters and scenes for you.')),
      h('ul', { class: 'import-outline' }, outlineRows),
      aiReady()
        ? h('div', { class: 'import-ai' },
          h('div', { class: 'eyebrow' }, icon('spark'), ' With the assistant'),
          h('label', { class: 'check' }, aiStructure, h('span', null, 'Find the chapters and scenes', h('br'), h('span', { class: 'muted small' }, 'Reads the opening of every paragraph and decides where chapters and scenes begin.'))),
          h('label', { class: 'check' }, aiDescribe, h('span', null, 'Write a title, synopsis and purpose for each block', h('br'), h('span', { class: 'muted small' }, 'So the outline and board are useful straight away.'))),
          h('p', { class: 'muted small' }, `Sends the text (about ${fmt(st.words)} words) to Anthropic with your API key. A long book takes a few minutes.`))
        : h('p', { class: 'muted small' }, 'Tip: with the assistant on (Settings), it can also find chapters and write a synopsis for every block as it imports.'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Bring it in'), where),
      h('div', { class: 'dlg-foot' },
        h('button', { class: 'btn ghost', onclick: pickStep }, 'Choose another file'),
        h('button', { class: 'btn primary', onclick: () => go({ title: titleIn.value.trim() || parsed.name, structure: aiReady() && aiStructure.checked, describe: aiReady() && aiDescribe.checked, where: where.value }) }, 'Import')));
  };

  const go = async (o) => {
    if (o.where === 'new' && state.project && !confirmDiscard()) return;
    busy = true;
    body.querySelectorAll('button, input, select').forEach((x) => (x.disabled = true));
    try {
      if (o.structure) {
        status.textContent = 'Finding the chapters and scenes…';
        const paras = I.paragraphsOf(parsed.items);
        const { blocks } = await AI.importAI.structure.run(aiSettings(), paras.map((x) => x.text));
        tree = I.shapeFromStarts(paras, blocks);
      }
      if (o.describe) {
        const all = [];
        const walk = (list) => list.forEach((b) => { all.push(b); walk(b.children); });
        walk(tree);
        const BATCH = 12;
        for (let i = 0; i < all.length; i += BATCH) {
          status.textContent = `Writing synopses: ${Math.min(i + BATCH, all.length)} of ${all.length} blocks…`;
          const batch = all.slice(i, i + BATCH).map((b, k) => ({ ref: `B${i + k + 1}`, type: b.type, title: b.title, text: I.plainOf(b.html) || b.children.map((c) => c.title).join(', ') }));
          const { blocks } = await AI.importAI.describe.run(aiSettings(), o.title, batch);
          for (const r of blocks) {
            const b = all[+r.ref.replace(/\D/g, '') - 1];
            if (b) Object.assign(b, { title: r.title || b.title, synopsis: r.synopsis, purpose: r.purpose });
          }
        }
      }
    } catch (e) {
      busy = false;
      status.textContent = '';
      toast(`The assistant step didn’t finish: ${aiError(e)} Importing without it.`, { error: true });
    }
    busy = false;
    status.textContent = '';
    finishImport(tree, o);
    dlg.close();
  };

  dlg.append(
    h('div', { class: 'dlg-head' }, h('h2', null, 'Import a manuscript'), h('button', { class: 'icon-btn', onclick: close, title: 'Close' }, icon('close'))),
    body, status, file);
  dlg.addEventListener('cancel', (e) => { if (busy) e.preventDefault(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  pickStep();
  dlg.showModal();
}

export function addTree(p, parentId, list) {
  for (const b of list) {
    const n = M.addNode(p, parentId, b.type, null, b.title);
    n.content = b.html || '';
    n.synopsis = b.synopsis || '';
    n.purpose = b.purpose || '';
    n.status = n.content ? 'drafting' : 'idea';
    addTree(p, n.id, b.children);
  }
}

export async function finishImport(tree, o) {
  const words = I.stats(tree).words;
  if (o.where === 'append' && state.project) {
    snapshot();
    addTree(P(), 'root', tree);
    changed();
    render();
    toast(`Imported ${fmt(words)} words into “${P().nodes.root.title}”.`, { undo: true });
    return;
  }
  const p = M.newProject(o.title, 'blank');
  p.nodes = { root: p.nodes.root };
  p.nodes.root.children = [];
  p.targetWords = Math.max(p.targetWords, Math.ceil((words * 1.1) / 10000) * 10000);
  addTree(p, 'root', tree);
  state.project = p;
  state.handle = null;
  state.fileName = null;
  state.fileStamp = null;
  state.conflict = false;
  state.undo = [];
  state.aiResults = {};
  state.selectedId = 'root';
  state.view = 'outline';
  state.dirty = true;
  startSession();
  render();
  toast(`Imported ${fmt(words)} words. Have a look at the outline.`);
  if (S.canAutosave) await saveAs();
}
