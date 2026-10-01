import * as X from '../lib/export.js';
import * as M from '../lib/model.js';
import * as S from '../lib/storage.js';
import { h, icon, toast } from '../core/dom.js';
import { P, prefs, savePrefs, state } from '../core/state.js';
import { snapshot } from '../core/undo.js';
import { select } from '../project/commands.js';
import { field } from '../views/write.js';

// ---- export dialog -------------------------------------------------------------------------
// Pick what (manuscript, working draft, outline, snapshot) and from where, see it live,
// then save it in whichever format suits: print/PDF, Word, Markdown, text or a web page.

export function openExport({ kind: startKind } = {}) {
  const saved = prefs.exportPrefs || {};
  let kind = startKind || saved.kind || 'manuscript';
  const optsFor = (k) => ({ ...X.defaults(k), ...(saved.opts?.[k] || {}) });
  let opts = optsFor(kind);
  let scope = state.selectedId !== 'root' && P().nodes[state.selectedId]?.children.length && saved.scope === state.selectedId ? state.selectedId : 'root';
  const remember = () => {
    prefs.exportPrefs = { kind, scope, opts: { ...(prefs.exportPrefs?.opts || {}), [kind]: opts } };
    savePrefs();
  };
  const accent = () => {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const m = /^#([0-9a-f]{6})$/i.exec(c);
    if (!m) return '#b4532a';
    const n = parseInt(m[1], 16);
    const light = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return light > 190 ? '#6b645a' : c; // a near-white accent (dark skins) would vanish on paper
  };
  const doc = () => X.build(P(), kind, opts, scope);

  const dlg = h('dialog', { class: 'export' });
  const frame = h('iframe', { class: 'export-frame', title: 'Preview', tabindex: -1 });
  const preview = h('div', { class: 'export-preview' }, frame);
  const kindsBox = h('div', { class: 'export-kinds', role: 'radiogroup', 'aria-label': 'What to export' });
  const optsBox = h('div', { class: 'export-opts' });
  let timer;
  const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { frame.srcdoc = X.toHTML(doc(), { accent: accent(), preview: true }); }, 80); };
  const fit = () => {
    const s = Math.min(1, (preview.clientWidth - 2) / 860);
    frame.style.transform = `scale(${s})`;
    frame.style.height = `${preview.clientHeight / s}px`;
  };
  const update = () => { refresh(); remember(); };

  const check = (key, label) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: !!opts[key], onchange: (e) => { opts[key] = e.target.checked; update(); } }), label);
  const seg = (key, choices) => h('div', { class: 'seg-control' }, choices.map(([v, l]) => h('button', {
    class: opts[key] === v ? 'active' : '',
    onclick: (e) => { opts[key] = v; e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.currentTarget)); update(); paintOpts(); },
  }, l)));
  const field = (label, control, hint) => h('div', { class: 'export-field' }, h('span', { class: 'field-label' }, label), control, hint && h('span', { class: 'muted small' }, hint));

  const paintKinds = () => kindsBox.replaceChildren(...Object.entries(X.KINDS).map(([id, k]) => h('button', {
    class: `export-kind ${id === kind ? 'on' : ''}`, role: 'radio', 'aria-checked': String(id === kind),
    onclick: () => { kind = id; opts = optsFor(id); paintKinds(); paintOpts(); update(); },
  }, h('strong', null, k.label), h('span', null, k.who))));

  const paintOpts = () => {
    const from = h('select', { onchange: (e) => { scope = e.target.value; update(); } },
      h('option', { value: 'root', selected: scope === 'root' }, 'The whole book'),
      M.flatten(P()).filter(({ node }) => node.children.length).map(({ node, depth }) =>
        h('option', { value: node.id, selected: scope === node.id }, `${'\u2003'.repeat(depth + 1)}${node.title}`)));
    const parts = [field('From', from)];
    if (kind === 'manuscript' || kind === 'draft') {
      parts.push(field('Layout', seg('layout', [['reading', 'Reading copy'], ['editing', 'For marking up']]),
        opts.layout === 'editing' ? 'Double-spaced, with wide margins for your pen.' : 'Comfortable to read, like a proof copy.'));
    }
    if (kind === 'manuscript') parts.push(check('titlePage', 'Title page'), check('chapterBreaks', 'Start each chapter on a new page'), check('sectionTitles', 'Show section titles (otherwise a break between scenes)'));
    if (kind === 'draft') parts.push(check('titlePage', 'Title page'), check('notes', 'Include your notes'), check('ideas', 'Include ideas attached to blocks'), check('placeholders', 'Lined space for blocks not written yet'));
    if (kind === 'outline' || kind === 'snapshot') parts.push(field('Detail', seg('depth', [['part', 'Parts'], ['chapter', 'Chapters'], ['all', 'Everything']])));
    if (kind === 'outline') parts.push(check('what', 'What happens'), check('why', 'Why it’s here'), check('stats', 'Status and word counts'));
    if (kind === 'snapshot') {
      const written = M.flatten(P()).map((x) => x.node).filter((n) => n.content);
      parts.push(check('stats', 'Progress and word counts'), field('Excerpt', h('select', { onchange: (e) => { opts.excerpt = e.target.value; update(); } },
        h('option', { value: 'auto', selected: opts.excerpt === 'auto' }, 'The longest piece you’ve written'),
        h('option', { value: 'none', selected: opts.excerpt === 'none' }, 'No excerpt'),
        written.map((n) => h('option', { value: n.id, selected: opts.excerpt === n.id }, n.title)))));
    }
    optsBox.replaceChildren(...parts);
  };

  const base = () => [P().nodes.root.title, scope !== 'root' && P().nodes[scope]?.title, X.KINDS[kind].label].filter(Boolean).map(S.slug).join('-');
  const exportAs = (f) => {
    const d = doc();
    if (f === 'print') return X.printHTML(X.toHTML(d, { accent: accent() }));
    if (f === 'html') S.download(`${base()}.html`, X.toHTML(d, { accent: accent() }), 'text/html');
    if (f === 'md') S.download(`${base()}.md`, X.toMarkdown(d), 'text/markdown');
    if (f === 'txt') S.download(`${base()}.txt`, X.toText(d), 'text/plain');
    if (f === 'docx') S.download(`${base()}.docx`, X.toDocx(d), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    toast(`Saved your ${X.KINDS[kind].label.toLowerCase()} to your downloads.`);
  };

  const close = () => dlg.close();
  dlg.append(
    h('div', { class: 'dlg-head' }, h('h2', null, 'Export'), h('button', { class: 'icon-btn', onclick: close, title: 'Close' }, icon('close'))),
    h('div', { class: 'export-body' },
      h('div', { class: 'export-side' }, kindsBox, optsBox),
      preview),
    h('div', { class: 'export-foot' },
      X.FORMATS.map((f) => h('button', { class: `btn ${f.id === 'print' ? 'primary' : ''}`, onclick: () => exportAs(f.id) },
        f.id === 'print' && icon('print'), f.label, f.ext && h('span', { class: 'ext' }, f.ext)))),
  );
  dlg.addEventListener('close', () => { removeEventListener('resize', fit); dlg.remove(); });
  addEventListener('resize', fit);
  document.body.append(dlg);
  paintKinds();
  paintOpts();
  dlg.showModal();
  fit();
  refresh();
}
