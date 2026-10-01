// Exports for people, not machines: a clean manuscript to read or mark up, a
// working draft with the skeleton showing, an outline, and a progress snapshot
// to share. Each kind is built once into a simple list of document blocks, then
// rendered to HTML (preview, print/PDF, web page), Word (.docx), Markdown or
// plain text. Everything runs in the browser, so it works offline.

import { flatten, treeWords, nodeWords, stripHtml, htmlToMarkdown, STATUSES, TYPES } from './model.js';
import { normalizeHtml } from './format.js';

export const KINDS = {
  manuscript: {
    label: 'Manuscript',
    who: 'Just the writing, clean. To read on paper, mark up by hand, or send to a reader.',
  },
  draft: {
    label: 'Working draft',
    who: 'The writing with its skeleton: each block’s direction, status and notes, and space for what isn’t written yet. For revising on paper.',
  },
  outline: {
    label: 'Outline',
    who: 'The structure alone: every part and chapter with what happens and why. For planning, or talking the book through.',
  },
  snapshot: {
    label: 'Progress snapshot',
    who: 'The idea and where it stands: premise, progress, the shape of the book and an excerpt. To share with a writing group, editor or friend.',
  },
};

export const FORMATS = [
  { id: 'print', label: 'Print or save as PDF', ext: '' },
  { id: 'docx', label: 'Word', ext: '.docx' },
  { id: 'md', label: 'Markdown', ext: '.md' },
  { id: 'txt', label: 'Plain text', ext: '.txt' },
  { id: 'html', label: 'Web page', ext: '.html' },
];

export function defaults(kind) {
  return {
    manuscript: { layout: 'reading', sectionTitles: false, titlePage: true, chapterBreaks: true },
    draft: { layout: 'editing', notes: true, ideas: true, placeholders: true, titlePage: true },
    outline: { depth: 'chapter', what: true, why: true, stats: true },
    snapshot: { stats: true, depth: 'chapter', excerpt: 'auto' },
  }[kind];
}

const STATUS_COLORS = { idea: '#a39a88', outlined: '#5b7fa6', drafting: '#d49a2a', revising: '#8a6bb0', done: '#4f8a5b' };
const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || id;
const fmt = (n) => (n || 0).toLocaleString();
const today = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const DEPTHS = { part: ['part'], chapter: ['part', 'chapter'], all: null };

// The block the export is about, and everything under it: [{ node, depth }]
function walk(p, scopeId) {
  if (scopeId === 'root' || !p.nodes[scopeId]) return flatten(p);
  return [{ node: p.nodes[scopeId], depth: 0 }, ...flatten(p, scopeId, 1)];
}
const headingLevel = (type) => ({ part: 1, chapter: 2 }[type] || 3);
const isLeaf = (n) => !n.children.length;

// The block with the most writing: the default excerpt for a snapshot.
export function bestExcerpt(p, scopeId = 'root') {
  let best = null;
  for (const { node } of walk(p, scopeId)) if (nodeWords(node) > (best ? nodeWords(best) : 0)) best = node;
  return best;
}

function truncateHtml(html, maxWords) {
  const d = document.createElement('div');
  d.innerHTML = html;
  let count = 0;
  let cut = false;
  for (const el of [...d.children]) {
    if (cut) { el.remove(); continue; }
    const w = (el.textContent.match(/\S+/g) || []).length;
    if (count + w > maxWords && count > 0) { el.remove(); cut = true; continue; }
    count += w;
  }
  return { html: d.innerHTML, truncated: cut };
}

// ---- build: project → document blocks ------------------------------------------------

export function build(p, kind, opts, scopeId = 'root') {
  const root = p.nodes.root;
  const scope = p.nodes[scopeId] || root;
  const words = treeWords(p, scope.id);
  const title = root.title;
  const sub = scope.id === 'root' ? '' : scope.title;
  const blocks = [];
  const doc = { kind, title, author: p.author || '', subtitle: sub, layout: opts.layout || 'reading', blocks, words };
  const titlePage = (label) => blocks.push({ t: 'titlepage', title, subtitle: sub, author: p.author, label, words, date: today() });
  const nodes = walk(p, scope.id);

  if (kind === 'manuscript') {
    if (opts.titlePage) titlePage('');
    let prevSection = false;
    let first = true;
    for (const { node } of nodes) {
      const lvl = headingLevel(node.type);
      if (lvl < 3 || opts.sectionTitles) {
        blocks.push({ t: 'heading', level: lvl, text: node.title, pageBreak: opts.chapterBreaks && lvl < 3 && !first });
        prevSection = false;
      } else if (prevSection && node.content) {
        blocks.push({ t: 'scenebreak' });
      }
      first = false;
      if (node.content) { blocks.push({ t: 'prose', html: normalizeHtml(node.content) }); if (lvl === 3) prevSection = true; }
    }
  }

  if (kind === 'draft') {
    if (opts.titlePage) titlePage('Working draft');
    let first = true;
    for (const { node } of nodes) {
      const lvl = headingLevel(node.type);
      blocks.push({ t: 'heading', level: lvl, text: node.title, pageBreak: lvl === 1 && !first, kind: TYPES[node.type].label });
      first = false;
      const w = treeWords(p, node.id);
      const meta = `${statusLabel(node.status)} · ${fmt(w)}${node.targetWords ? ` of ${fmt(node.targetWords)}` : ''} words${node.tags.length ? ` · ${node.tags.join(', ')}` : ''}`;
      const rows = [['What happens', node.synopsis], ['Why it’s here', node.purpose]].filter(([, v]) => v);
      if (opts.notes && node.notes) rows.push(['Notes', node.notes]);
      blocks.push({ t: 'direction', rows, meta });
      if (opts.ideas) {
        const ideas = p.notebook.filter((x) => x.nodeId === node.id && x.text.trim()).map((x) => x.text.trim());
        if (ideas.length) blocks.push({ t: 'ideas', items: ideas });
      }
      if (node.content) blocks.push({ t: 'prose', html: normalizeHtml(node.content) });
      else if (opts.placeholders && isLeaf(node)) blocks.push({ t: 'placeholder', text: 'Not written yet.' });
    }
  }

  if (kind === 'outline' || kind === 'snapshot') {
    const lvls = DEPTHS[opts.depth];
    if (kind === 'snapshot') {
      blocks.push({ t: 'hero', title, subtitle: sub, author: p.author, label: `Progress snapshot · ${today()}` });
    } else {
      blocks.push({ t: 'hero', title, subtitle: sub, author: p.author, label: `Outline · ${today()}` });
    }
    const intro = scope.id === 'root' ? [['Premise', root.synopsis], ['What it’s really about', root.purpose]] : [['What happens', scope.synopsis], ['Why it’s here', scope.purpose]];
    for (const [label, text] of intro) if (text) blocks.push({ t: 'lead', label, text });

    if (kind === 'snapshot' && opts.stats) {
      const leaves = nodes.map((x) => x.node).filter((n) => isLeaf(n) && n.id !== 'root');
      const done = leaves.filter((n) => n.status === 'done').length;
      const target = scope.id === 'root' ? p.targetWords : scope.targetWords;
      const chapters = nodes.filter((x) => x.node.type === 'chapter').length;
      const items = [[fmt(words), 'words written']];
      if (target) {
        const pct = Math.min(1, words / target) * 100;
        items.push([words && pct < 1 ? '<1%' : `${Math.round(pct)}%`, `of ${fmt(target)} words`]);
      }
      if (chapters) items.push([fmt(chapters), chapters === 1 ? 'chapter' : 'chapters']);
      items.push([`${done} of ${leaves.length}`, 'pieces finished']);
      blocks.push({ t: 'stats', items });
      const segs = STATUSES.map((s) => ({ label: s.label, count: leaves.filter((n) => n.status === s.id).length, color: STATUS_COLORS[s.id] })).filter((s) => s.count);
      if (segs.length) blocks.push({ t: 'statusbar', segs });
    }

    blocks.push({ t: 'label', text: kind === 'snapshot' ? 'The shape of the book' : 'Contents' });
    for (const { node, depth } of nodes) {
      if (node.id === scope.id && scope.id !== 'root') continue;
      if (lvls && !lvls.includes(node.type)) continue;
      const w = treeWords(p, node.id);
      const showStats = kind === 'outline' ? opts.stats : true;
      blocks.push({
        t: 'item', depth: scope.id === 'root' ? depth : depth - 1, type: node.type, title: node.title,
        what: kind === 'snapshot' || opts.what ? node.synopsis : '',
        why: kind === 'outline' && opts.why ? node.purpose : '',
        meta: showStats ? `${statusLabel(node.status)} · ${fmt(w)} words` : '', status: node.status,
      });
    }

    if (kind === 'snapshot' && opts.excerpt !== 'none') {
      const ex = opts.excerpt === 'auto' ? bestExcerpt(p, scope.id) : p.nodes[opts.excerpt];
      if (ex?.content) {
        const { html, truncated } = truncateHtml(normalizeHtml(ex.content), 600);
        blocks.push({ t: 'label', text: 'An excerpt' });
        blocks.push({ t: 'excerpt', title: ex.title, html, truncated });
      }
    }
  }
  return doc;
}

// ---- HTML (preview, print, web page) ---------------------------------------------------

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

function blockHtml(b, doc) {
  switch (b.t) {
    case 'titlepage':
      return `<section class="titlepage">${b.label ? `<div class="tp-label">${esc(b.label)}</div>` : ''}<h1 class="tp-title">${esc(b.title)}</h1>${b.subtitle ? `<div class="tp-sub">${esc(b.subtitle)}</div>` : ''}${b.author ? `<div class="tp-author">${esc(b.author)}</div>` : ''}<div class="tp-meta">${fmt(b.words)} words · ${esc(b.date)}</div></section>`;
    case 'heading':
      return `<h${b.level + 1} class="h${b.level}${b.pageBreak ? ' pb' : ''}">${b.kind && doc.kind === 'draft' ? `<span class="kind">${esc(b.kind)}</span>` : ''}${esc(b.text)}</h${b.level + 1}>`;
    case 'prose': return `<div class="prose">${b.html}</div>`;
    case 'scenebreak': return `<p class="scenebreak">${doc.layout === 'editing' ? '#' : '✱ ✱ ✱'}</p>`;
    case 'direction':
      return `<aside class="direction"><div class="dir-meta">${esc(b.meta)}</div>${b.rows.map(([l, v]) => `<div class="dir-row"><span>${esc(l)}</span><p>${nl2br(v)}</p></div>`).join('')}</aside>`;
    case 'ideas': return `<aside class="ideas"><span>Ideas</span><ul>${b.items.map((x) => `<li>${nl2br(x)}</li>`).join('')}</ul></aside>`;
    case 'placeholder': return `<div class="placeholder"><em>${esc(b.text)}</em><div class="ruled"></div></div>`;
    case 'hero':
      return `<header class="hero">${b.label ? `<div class="hero-label">${esc(b.label)}</div>` : ''}<h1>${esc(b.title)}</h1>${b.subtitle ? `<div class="hero-sub">${esc(b.subtitle)}</div>` : ''}${b.author ? `<div class="hero-author">by ${esc(b.author)}</div>` : ''}</header>`;
    case 'lead': return `<section class="lead"><div class="lbl">${esc(b.label)}</div><p>${nl2br(b.text)}</p></section>`;
    case 'stats': return `<section class="stats">${b.items.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</section>`;
    case 'statusbar':
      return `<section class="statusbar"><div class="bar">${b.segs.map((s) => `<i style="flex:${s.count};background:${s.color}"></i>`).join('')}</div><div class="legend">${b.segs.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)} ${s.count}</span>`).join('')}</div></section>`;
    case 'label': return `<h2 class="lbl-head">${esc(b.text)}</h2>`;
    case 'item':
      return `<div class="item d${b.depth} t-${b.type}"><div class="item-head"><i class="dot" style="background:${STATUS_COLORS[b.status] || '#999'}"></i><b>${esc(b.title)}</b>${b.meta ? `<span class="item-meta">${esc(b.meta)}</span>` : ''}</div>${b.what ? `<p class="what">${nl2br(b.what)}</p>` : ''}${b.why ? `<p class="why">${nl2br(b.why)}</p>` : ''}</div>`;
    case 'excerpt': return `<section class="excerpt"><h3>${esc(b.title)}</h3><div class="prose">${b.html}</div>${b.truncated ? '<p class="more">…</p>' : ''}</section>`;
    default: return '';
  }
}

export function toHTML(doc, { accent = '#b4532a', preview = false } = {}) {
  const editing = doc.layout === 'editing';
  const draft = doc.kind === 'draft';
  const showcase = doc.kind === 'outline' || doc.kind === 'snapshot';
  const running = `${doc.author ? `${doc.author} / ` : ''}${doc.title.toUpperCase()}`;
  const css = `
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  html { background: ${preview ? '#e9e6e0' : '#fff'}; }
  body { margin: 0; color: #1c1a17; font: ${editing ? '12pt/2 "Times New Roman", Times, serif' : '11.5pt/1.6 Georgia, "Iowan Old Style", "Times New Roman", serif'}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  main { max-width: ${showcase ? '7.2in' : '6.5in'}; margin: 0 auto; padding: ${preview ? '0.9in 0.9in 1.2in' : '0.6in 0.4in'}; background: #fff; ${preview ? 'box-shadow: 0 2px 16px rgb(0 0 0 / .12); min-height: 100vh;' : ''} }
  ${draft && editing ? 'main { padding-right: 1.9in; }' : ''}
  .prose p { margin: 0; text-indent: 0.5in; }
  .prose h2 + p, .prose h3 + p, h2 + .prose p:first-child, h3 + .prose p:first-child, h4 + .prose p:first-child, .scenebreak + .prose p:first-child, aside + .prose p:first-child, .titlepage + .prose p:first-child { text-indent: 0; }
  .prose h2, .prose h3 { font-size: 1em; font-weight: bold; margin: 1.2em 0 .4em; }
  .prose blockquote { margin: .6em .5in; font-style: italic; }
  .prose blockquote p { text-indent: 0; }
  .prose hr { border: 0; text-align: center; margin: 1em 0; height: 1.6em; }
  .prose hr::after { content: '${editing ? '#' : '✱ ✱ ✱'}'; }
  .prose ul { margin: .4em 0 .4em .5in; padding: 0; }
  h2.h1, h3.h2, h4.h3 { font-family: ${editing ? 'inherit' : 'Georgia, serif'}; line-height: 1.25; }
  h2.h1 { font-size: ${editing ? '14pt' : '22pt'}; text-align: center; margin: ${editing ? '2in' : '1.2in'} 0 .6in; font-weight: normal; letter-spacing: .04em; ${editing ? 'text-transform: uppercase;' : ''} }
  h3.h2 { font-size: ${editing ? '12pt' : '17pt'}; text-align: center; margin: ${editing ? '1.6in 0 .5in' : '.9in 0 .4in'}; font-weight: normal; }
  h4.h3 { font-size: ${editing ? '12pt' : '12.5pt'}; margin: 1.6em 0 .5em; font-weight: bold; }
  h2:first-child, h3:first-child { margin-top: 0; }
  .kind { display: block; font: 600 7.5pt/1.4 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); margin-bottom: 4pt; }
  .scenebreak { text-align: center; margin: .8em 0; text-indent: 0; }
  .titlepage { text-align: center; padding: 2.4in 0 1in; ${preview ? 'border-bottom: 1px dashed #ccc; margin-bottom: 1in;' : 'break-after: page;'} line-height: 1.4; }
  .tp-label { font: 600 8pt/1.4 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); margin-bottom: 18pt; }
  .tp-title { font-size: ${editing ? '16pt' : '28pt'}; font-weight: normal; margin: 0 0 10pt; ${editing ? 'text-transform: uppercase;' : ''} }
  .tp-sub { font-size: 13pt; font-style: italic; margin-bottom: 10pt; }
  .tp-author { font-size: 13pt; margin-top: 18pt; }
  .tp-meta { font-size: 9.5pt; color: #777; margin-top: 30pt; }
  .direction, .ideas { font: 9.5pt/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; background: #f7f4ef; border-left: 3px solid var(--accent); padding: 8pt 11pt; margin: 0 0 14pt; break-inside: avoid; }
  .dir-meta { font-size: 8pt; letter-spacing: .06em; text-transform: uppercase; color: #8a8175; margin-bottom: 4pt; }
  .dir-row { display: grid; grid-template-columns: 1.05in 1fr; gap: 8pt; margin-top: 3pt; }
  .dir-row span, .ideas > span { font-weight: 600; color: #5a5249; }
  .dir-row p { margin: 0; }
  .ideas { background: #fbf6e2; border-left-color: #d9b847; }
  .ideas ul { margin: 3pt 0 0; padding-left: 1.1em; }
  .placeholder { color: #8a8175; margin: 0 0 18pt; }
  .placeholder em { font-size: 10pt; }
  .ruled { height: ${editing ? '2.4in' : '1.4in'}; margin-top: 6pt; background: repeating-linear-gradient(transparent 0 calc(0.32in - 1px), #d9d4cb calc(0.32in - 1px) 0.32in); }
  .hero { border-top: 6px solid var(--accent); padding-top: 22pt; margin-bottom: 20pt; }
  .hero-label, .lbl, .lbl-head { font: 600 8pt/1.4 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
  .hero h1 { font: normal 30pt/1.1 Georgia, serif; margin: 8pt 0 6pt; }
  .hero-sub { font-size: 14pt; font-style: italic; }
  .hero-author { color: #6b645a; margin-top: 4pt; }
  .lead { margin: 0 0 14pt; }
  .lead p { margin: 3pt 0 0; font-size: 12.5pt; line-height: 1.55; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(1.1in, 1fr)); gap: 8pt; margin: 18pt 0 10pt; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  .stats div { border: 1px solid #e6e1d8; border-radius: 6pt; padding: 8pt 10pt; }
  .stats b { display: block; font: normal 17pt/1.2 Georgia, serif; }
  .stats span { font-size: 8.5pt; color: #7b7368; }
  .statusbar { margin: 0 0 20pt; font: 8.5pt/1.4 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #5a5249; }
  .bar { display: flex; gap: 2px; height: 8pt; border-radius: 4pt; overflow: hidden; }
  .legend { display: flex; flex-wrap: wrap; gap: 4pt 12pt; margin-top: 5pt; }
  .legend i { display: inline-block; width: 7pt; height: 7pt; border-radius: 50%; margin-right: 4pt; vertical-align: -.5pt; }
  .lbl-head { margin: 22pt 0 8pt; padding-bottom: 5pt; border-bottom: 1px solid #e6e1d8; }
  .item { margin: 0 0 9pt; break-inside: avoid; }
  .item.d1 { margin-left: .3in; } .item.d2 { margin-left: .6in; } .item.d3, .item.d4 { margin-left: .9in; }
  .item-head { display: flex; align-items: baseline; gap: 6pt; }
  .item-head .dot { flex: none; width: 6pt; height: 6pt; border-radius: 50%; position: relative; top: -1pt; }
  .t-part > .item-head b { font-size: 13pt; }
  .item-meta { margin-left: auto; font: 8pt -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #8a8175; white-space: nowrap; padding-left: 10pt; }
  .item p { margin: 2pt 0 0 12pt; font-size: 10.5pt; line-height: 1.45; }
  .item .why { font-style: italic; color: #6b645a; }
  .excerpt h3 { font: italic normal 15pt Georgia, serif; margin: 6pt 0 10pt; }
  .excerpt .prose p:first-child { text-indent: 0; }
  .more { text-align: center; color: #8a8175; }
  .pb { break-before: page; ${preview ? 'border-top: 1px dashed #ccc; padding-top: .8in;' : ''} }
  @page { size: auto; margin: 1in ${draft && editing ? '1in' : '1in'} 1in 1in;
    @bottom-center { content: counter(page); font: 9pt Georgia, serif; color: #888; }
    ${editing ? `@top-right { content: "${running.replace(/"/g, '\\"')} / " counter(page); font: 9pt "Times New Roman", serif; color: #555; }` : ''} }
  @page :first { @top-right { content: none; } @bottom-center { content: none; } }
  @media print { html { background: #fff; } main { padding: 0; max-width: none; box-shadow: none; } ${draft && editing ? 'main { padding-right: 1.6in; }' : ''} }`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(doc.title)}${doc.subtitle ? ` · ${esc(doc.subtitle)}` : ''}</title><style>${css}</style></head><body><main>${doc.blocks.map((b) => blockHtml(b, doc)).join('\n')}</main></body></html>`;
}

// Print (or save as PDF) through a hidden frame, so the app itself isn't printed.
export function printHTML(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = html;
  frame.onload = () => {
    const w = frame.contentWindow;
    w.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 500));
    setTimeout(() => { w.focus(); w.print(); }, 50);
    setTimeout(() => frame.remove(), 10 * 60 * 1000); // in case afterprint never fires
  };
  document.body.append(frame);
}

// ---- Markdown & plain text ------------------------------------------------------------

export function toMarkdown(doc) {
  const out = [];
  for (const b of doc.blocks) {
    switch (b.t) {
      case 'titlepage': case 'hero':
        out.push(`# ${b.title}`);
        if (b.subtitle) out.push(`## ${b.subtitle}`);
        if (b.author) out.push(`*by ${b.author}*`);
        if (b.label) out.push(`*${b.label}*`);
        out.push('');
        break;
      case 'heading': out.push(`${'#'.repeat(b.level + 1)} ${b.text}`, ''); break;
      case 'prose': out.push(htmlToMarkdown(b.html), ''); break;
      case 'scenebreak': out.push('* * *', ''); break;
      case 'direction':
        out.push(`> *${b.meta}*`);
        for (const [l, v] of b.rows) out.push('>', `> **${l}:** ${v.replace(/\n/g, '\n> ')}`);
        out.push('');
        break;
      case 'ideas': out.push('**Ideas**', ...b.items.map((x) => `- ${x.replace(/\n/g, ' ')}`), ''); break;
      case 'placeholder': out.push(`*${b.text}*`, ''); break;
      case 'lead': out.push(`**${b.label}.** ${b.text}`, ''); break;
      case 'stats': out.push(b.items.map(([v, l]) => `**${v}** ${l}`).join(' · '), ''); break;
      case 'statusbar': out.push(b.segs.map((s) => `${s.label}: ${s.count}`).join(' · '), ''); break;
      case 'label': out.push(`## ${b.text}`, ''); break;
      case 'item': {
        const pad = '  '.repeat(Math.max(0, b.depth));
        out.push(`${pad}- **${b.title}**${b.meta ? ` (${b.meta})` : ''}`);
        if (b.what) out.push(`${pad}  ${b.what.replace(/\n/g, ' ')}`);
        if (b.why) out.push(`${pad}  *${b.why.replace(/\n/g, ' ')}*`);
        break;
      }
      case 'excerpt': out.push(`### ${b.title}`, '', htmlToMarkdown(b.html), b.truncated ? '\n…' : '', ''); break;
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function toText(doc) {
  const out = [];
  const wrapProse = (html) => stripHtml(html).replace(/\n{3,}/g, '\n\n').trim();
  for (const b of doc.blocks) {
    switch (b.t) {
      case 'titlepage': case 'hero':
        out.push(b.title.toUpperCase());
        if (b.subtitle) out.push(b.subtitle);
        if (b.author) out.push(`by ${b.author}`);
        if (b.label) out.push(b.label);
        out.push('', '');
        break;
      case 'heading':
        out.push(b.level === 1 ? b.text.toUpperCase() : b.text, b.level < 3 ? '='.repeat(Math.min(60, b.text.length)) : '', '');
        break;
      case 'prose': out.push(wrapProse(b.html), ''); break;
      case 'scenebreak': out.push('                *   *   *', ''); break;
      case 'direction':
        out.push(`[${b.meta}]`, ...b.rows.map(([l, v]) => `[${l}: ${v.replace(/\n/g, ' ')}]`), '');
        break;
      case 'ideas': out.push('Ideas:', ...b.items.map((x) => `  - ${x.replace(/\n/g, ' ')}`), ''); break;
      case 'placeholder': out.push(`(${b.text})`, ''); break;
      case 'lead': out.push(`${b.label.toUpperCase()}: ${b.text}`, ''); break;
      case 'stats': out.push(b.items.map(([v, l]) => `${v} ${l}`).join('  |  '), ''); break;
      case 'statusbar': out.push(b.segs.map((s) => `${s.label} ${s.count}`).join('  |  '), ''); break;
      case 'label': out.push(b.text.toUpperCase(), '-'.repeat(b.text.length), ''); break;
      case 'item': {
        const pad = '    '.repeat(Math.max(0, b.depth));
        out.push(`${pad}* ${b.title}${b.meta ? `  (${b.meta})` : ''}`);
        if (b.what) out.push(`${pad}  ${b.what.replace(/\n/g, ' ')}`);
        if (b.why) out.push(`${pad}  Why: ${b.why.replace(/\n/g, ' ')}`);
        break;
      }
      case 'excerpt': out.push(b.title, '', wrapProse(b.html), b.truncated ? '…' : '', ''); break;
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---- Word (.docx) -----------------------------------------------------------------------
// A minimal but real .docx (opens in Word, Pages, Google Docs, LibreOffice), zipped by hand.

const xe = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function run(text, { b, i, color, size, caps } = {}) {
  const pr = [b && '<w:b/>', i && '<w:i/>', caps && '<w:caps/>', color && `<w:color w:val="${color}"/>`, size && `<w:sz w:val="${size}"/>`].filter(Boolean).join('');
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xe(text)}</w:t></w:r>`;
}
const brRun = '<w:r><w:br/></w:r>';
// Word is strict about the order of paragraph and run properties (the schema's order),
// so these are always emitted pStyle → keepNext → pageBreakBefore → pBdr → shd → spacing → ind → jc.
function para(runs, { style, align, pageBreak, indent, noIndent, shade, border, keepNext, after } = {}) {
  const pr = [
    style && `<w:pStyle w:val="${style}"/>`,
    keepNext && '<w:keepNext/>',
    pageBreak && '<w:pageBreakBefore/>',
    border && `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${border}"/></w:pBdr>`,
    shade && `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>`,
    after != null && `<w:spacing w:after="${after}"/>`,
    (indent || noIndent) && `<w:ind w:left="${indent || 0}"${noIndent ? ' w:firstLine="0"' : ''}/>`,
    align && `<w:jc w:val="${align}"/>`,
  ].filter(Boolean).join('');
  return `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ''}${Array.isArray(runs) ? runs.join('') : runs}</w:p>`;
}

// Draft HTML → Word paragraphs, keeping bold, italic, headings, quotes, lists and breaks.
function proseToDocx(html, editing) {
  const d = document.createElement('div');
  d.innerHTML = html;
  const out = [];
  const inline = (el, fmtState = {}) => [...el.childNodes].map((c) => {
    if (c.nodeType === 3) return c.textContent ? run(c.textContent, fmtState) : '';
    if (c.nodeType !== 1) return '';
    if (c.tagName === 'BR') return brRun;
    const next = { ...fmtState };
    if (/^(B|STRONG)$/.test(c.tagName)) next.b = true;
    if (/^(I|EM)$/.test(c.tagName)) next.i = true;
    return inline(c, next);
  }).join('');
  let first = true;
  const pushBody = (runs, extra = {}) => { out.push(para(runs, { style: first ? 'FirstParagraph' : 'BodyText', ...extra })); first = false; };
  for (const c of [...d.childNodes]) {
    if (c.nodeType === 3) { if (c.textContent.trim()) pushBody(run(c.textContent)); continue; }
    if (c.nodeType !== 1) continue;
    switch (c.tagName) {
      case 'H2': case 'H3': out.push(para(inline(c), { style: 'Heading3' })); first = true; break;
      case 'BLOCKQUOTE': {
        const ps = c.querySelectorAll('p');
        (ps.length ? [...ps] : [c]).forEach((p) => out.push(para(inline(p, { i: true }), { style: 'Quote' })));
        break;
      }
      case 'UL': case 'OL':
        [...c.children].forEach((li, k) => out.push(para([run(c.tagName === 'OL' ? `${k + 1}. ` : '• '), inline(li)], { style: 'ListPara' })));
        break;
      case 'HR': out.push(para(run(editing ? '#' : '*   *   *'), { style: 'SceneBreak' })); first = true; break;
      default: pushBody(inline(c));
    }
  }
  return out.join('');
}

function docxBody(doc) {
  const editing = doc.layout === 'editing';
  const out = [];
  for (const b of doc.blocks) {
    switch (b.t) {
      case 'titlepage':
        out.push(para('', { after: 2400 }));
        if (b.label) out.push(para(run(b.label, { caps: true, color: 'B4532A', size: 18 }), { style: 'Centered' }));
        out.push(para(run(b.title), { style: 'Title' }));
        if (b.subtitle) out.push(para(run(b.subtitle, { i: true }), { style: 'Centered' }));
        if (b.author) out.push(para(run(b.author), { style: 'Centered' }));
        out.push(para(run(`${fmt(b.words)} words · ${b.date}`, { color: '777777', size: 18 }), { style: 'Centered' }));
        out.push(para('<w:r><w:br w:type="page"/></w:r>'));
        break;
      case 'hero':
        if (b.label) out.push(para(run(b.label, { caps: true, color: 'B4532A', size: 16 }), { noIndent: true }));
        out.push(para(run(b.title), { style: 'Title', align: 'left' }));
        if (b.subtitle) out.push(para(run(b.subtitle, { i: true }), { noIndent: true }));
        if (b.author) out.push(para(run(`by ${b.author}`, { color: '6B645A' }), { noIndent: true }));
        break;
      case 'heading': out.push(para(run(b.text), { style: `Heading${b.level}`, pageBreak: b.pageBreak })); break;
      case 'prose': out.push(proseToDocx(b.html, editing)); break;
      case 'scenebreak': out.push(para(run(editing ? '#' : '*   *   *'), { style: 'SceneBreak' })); break;
      case 'direction':
        out.push(para(run(b.meta, { caps: true, color: '8A8175', size: 16 }), { style: 'Direction' }));
        for (const [l, v] of b.rows) out.push(para([run(`${l}: `, { b: true }), ...v.split('\n').map((line, k) => (k ? brRun : '') + run(line))], { style: 'Direction' }));
        break;
      case 'ideas':
        out.push(para(run('Ideas', { b: true }), { style: 'Direction' }));
        for (const x of b.items) out.push(para(run(`• ${x.replace(/\n/g, ' ')}`), { style: 'Direction' }));
        break;
      case 'placeholder':
        out.push(para(run(b.text, { i: true, color: '8A8175' }), { noIndent: true }));
        for (let k = 0; k < (editing ? 6 : 4); k++) out.push(para('', { style: 'Ruled' }));
        break;
      case 'lead': out.push(para([run(`${b.label}. `, { b: true }), run(b.text)], { noIndent: true, after: 160 })); break;
      case 'stats': out.push(para(b.items.map(([v, l], k) => (k ? run('   ·   ', { color: 'AAAAAA' }) : '') + run(v, { b: true }) + run(` ${l}`)).join(''), { noIndent: true, after: 120 })); break;
      case 'statusbar': out.push(para(b.segs.map((s) => run(`${s.label} ${s.count}   `, { color: s.color.slice(1).toUpperCase() })).join(''), { noIndent: true, after: 200 })); break;
      case 'label': out.push(para(run(b.text, { caps: true, color: 'B4532A', b: true, size: 18 }), { noIndent: true, keepNext: true, after: 120 })); break;
      case 'item': {
        const indent = Math.max(0, b.depth) * 360;
        out.push(para([run(b.title, { b: true }), b.meta ? run(`   ${b.meta}`, { color: '8A8175', size: 18 }) : ''], { indent, noIndent: true, keepNext: !!(b.what || b.why), after: b.what || b.why ? 0 : 120 }));
        if (b.what) out.push(para(run(b.what.replace(/\n/g, ' ')), { indent: indent + 240, noIndent: true, after: b.why ? 0 : 120 }));
        if (b.why) out.push(para(run(b.why.replace(/\n/g, ' '), { i: true, color: '6B645A' }), { indent: indent + 240, noIndent: true, after: 120 }));
        break;
      }
      case 'excerpt':
        out.push(para(run(b.title, { i: true }), { style: 'Heading3' }));
        out.push(proseToDocx(b.html, editing));
        if (b.truncated) out.push(para(run('…'), { style: 'SceneBreak' }));
        break;
    }
  }
  return out.join('');
}

function docxStyles(doc) {
  const editing = doc.layout === 'editing';
  const font = editing ? 'Times New Roman' : 'Georgia';
  const line = editing ? 480 : 336; // double, or ~1.4
  const size = editing ? 24 : 23;
  const style = (id, name, pPr, rPr, based = 'Normal') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${based}"/><w:qFormat/>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}</w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${style('BodyText', 'Body Text', '<w:ind w:firstLine="720"/>', '')}
${style('FirstParagraph', 'First Paragraph', '<w:ind w:firstLine="0"/>', '')}
${style('Title', 'Title', '<w:spacing w:before="0" w:after="240"/><w:jc w:val="center"/>', `<w:sz w:val="${editing ? 32 : 56}"/>`)}
${style('Centered', 'Centered', '<w:spacing w:after="120"/><w:jc w:val="center"/>', '')}
${style('Heading1', 'heading 1', `<w:keepNext/><w:spacing w:before="${editing ? 2400 : 1600}" w:after="720"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/>`, `<w:caps/><w:spacing w:val="20"/><w:sz w:val="${editing ? 28 : 40}"/>`)}
${style('Heading2', 'heading 2', `<w:keepNext/><w:spacing w:before="${editing ? 1800 : 1080}" w:after="480"/><w:jc w:val="center"/><w:outlineLvl w:val="1"/>`, `<w:sz w:val="${editing ? 24 : 32}"/>`)}
${style('Heading3', 'heading 3', '<w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="2"/>', '<w:b/>')}
${style('Quote', 'Quote', '<w:spacing w:before="120" w:after="120"/><w:ind w:left="720" w:right="720"/>', '<w:i/>')}
${style('ListPara', 'List Paragraph', '<w:ind w:left="720" w:hanging="360"/>', '')}
${style('SceneBreak', 'Scene Break', '<w:spacing w:before="120" w:after="120"/><w:jc w:val="center"/>', '')}
${style('Direction', 'Direction', '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="B4532A"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F7F4EF"/><w:spacing w:line="276" w:lineRule="auto" w:after="40"/><w:ind w:left="200"/>', '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="18"/>')}
${style('Ruled', 'Ruled line', '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="D9D4CB"/></w:pBdr><w:spacing w:line="440" w:lineRule="exact"/>', '')}
</w:styles>`;
}

function docxDocument(doc) {
  const draftEditing = doc.kind === 'draft' && doc.layout === 'editing';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${docxBody(doc)}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="${draftEditing ? 2880 : 1440}" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/><w:titlePg/></w:sectPr></w:body>
</w:document>`;
}

const FOOTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;

export function toDocx(doc) {
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(doc.title)}</dc:title><dc:creator>${xe(doc.author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`,
    'word/document.xml': docxDocument(doc),
    'word/styles.xml': docxStyles(doc),
    'word/footer1.xml': FOOTER,
  };
  return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ---- a tiny zip writer (stored, no compression) ------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true);      // stored
    local.setUint16(12, 33, true);    // 1 Jan 1980
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(14, 33, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cdSize = central.reduce((s, a) => s + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]);
}
