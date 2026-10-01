// Import a manuscript (.docx, .md, .txt, .html) and turn it into blocks.
//
// Step 1, read: every format becomes a flat list of items:
//   { kind: 'heading', level, text, type? } | { kind: 'break' } | { kind: 'para', html, text }
// Step 2, shape: headings become parts/chapters, scene breaks become sections.
// The optional AI layer (ai.js → importAI) can find the structure when there are no
// headings, and write titles and synopses. Everything here runs locally.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wordsIn = (s) => (s.match(/\S+/g) || []).length;
const PART_RE = /^(part|book)\b/i;
const CHAPTER_RE = /^(chapter|prologue|epilogue|interlude|afterword|foreword|introduction|conclusion)\b/i;
const BREAK_RE = /^\s*(([*#~•·]\s*){1,5}|-{3,}|_{3,})\s*$/;

export const ACCEPT = '.docx,.md,.markdown,.txt,.text,.html,.htm';

export async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return readDocx(await file.arrayBuffer());
  const text = await file.text();
  if (/\.(md|markdown)$/.test(name)) return readMarkdown(text);
  if (/\.html?$/.test(name)) return readHtml(text);
  if (name.endsWith('.json')) throw new Error('That looks like a project file. Use File → Open… instead.');
  return readText(text);
}

// ---- plain text -----------------------------------------------------------------------

function readText(text) {
  const t = text.replace(/\r\n?/g, '\n');
  const blocks = /\n\s*\n/.test(t) ? t.split(/\n\s*\n/) : t.split('\n');
  const items = [];
  for (const raw of blocks) {
    const b = raw.trim();
    if (!b) continue;
    if (BREAK_RE.test(b)) { items.push({ kind: 'break' }); continue; }
    const oneLine = !b.includes('\n') && b.length < 70;
    const shouty = oneLine && /\p{L}{2}/u.test(b) && b === b.toUpperCase() && !/[.,;:!?]$/.test(b);
    if (oneLine && (PART_RE.test(b) || CHAPTER_RE.test(b) || shouty)) {
      items.push({ kind: 'heading', level: PART_RE.test(b) ? 1 : 2, text: tidyTitle(b) });
      continue;
    }
    items.push({ kind: 'para', html: esc(b).replace(/\n/g, '<br>'), text: b });
  }
  return { items, title: '' };
}

const tidyTitle = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s:—-])(\p{L})/gu, (m, a, c) => a + c.toUpperCase()) : s);

// ---- Markdown ----------------------------------------------------------------------------

function mdInline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (m, a, b) => `<b>${a || b}</b>`)
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, '$1<i>$2</i>');
}

function readMarkdown(text) {
  const items = [];
  let para = [];
  let title = '';
  const flush = () => {
    if (!para.length) return;
    const raw = para.join('\n');
    if (raw.startsWith('>')) items.push({ kind: 'para', html: `<blockquote><p>${mdInline(raw.replace(/^>\s?/gm, ''))}</p></blockquote>`, text: raw.replace(/^>\s?/gm, '') });
    else items.push({ kind: 'para', html: mdInline(para.join(' ')), text: para.join(' ') });
    para = [];
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { flush(); items.push({ kind: 'heading', level: h[1].length, text: h[2].replace(/[*_]/g, '') }); continue; }
    if (BREAK_RE.test(line) && line.trim()) { flush(); items.push({ kind: 'break' }); continue; }
    if (!line.trim()) { flush(); continue; }
    para.push(line.trim());
  }
  flush();
  // A top-level heading at the very start is the book's title, not a block, when it's
  // the only one or the others are clearly parts ("# My Book" then "# Part One"…).
  const h1s = items.filter((x) => x.kind === 'heading' && x.level === 1);
  const first = h1s[0];
  if (first && items[0] === first && !PART_RE.test(first.text) && !CHAPTER_RE.test(first.text)
    && (h1s.length === 1 || h1s.slice(1).every((x) => PART_RE.test(x.text)))) { title = first.text; items.shift(); }
  return { items, title };
}

// ---- HTML ----------------------------------------------------------------------------------

function cleanInline(el) {
  const out = [];
  for (const c of el.childNodes) {
    if (c.nodeType === 3) out.push(esc(c.textContent));
    else if (c.nodeType === 1) {
      const inner = cleanInline(c);
      if (/^(B|STRONG)$/.test(c.tagName)) out.push(`<b>${inner}</b>`);
      else if (/^(I|EM)$/.test(c.tagName)) out.push(`<i>${inner}</i>`);
      else if (c.tagName === 'BR') out.push('<br>');
      else out.push(inner);
    }
  }
  return out.join('');
}

function readHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = [];
  const walk = (parent) => {
    for (const el of parent.children) {
      const tag = el.tagName;
      if (/^H[1-6]$/.test(tag)) items.push({ kind: 'heading', level: +tag[1], text: el.textContent.trim() });
      else if (tag === 'HR') items.push({ kind: 'break' });
      else if (tag === 'P') {
        const text = el.textContent.trim();
        if (!text) continue;
        if (BREAK_RE.test(text)) items.push({ kind: 'break' });
        else items.push({ kind: 'para', html: cleanInline(el), text });
      } else if (tag === 'BLOCKQUOTE') items.push({ kind: 'para', html: `<blockquote><p>${cleanInline(el)}</p></blockquote>`, text: el.textContent.trim() });
      else if (/^(UL|OL)$/.test(tag)) items.push({ kind: 'para', html: `<ul>${[...el.children].map((li) => `<li>${cleanInline(li)}</li>`).join('')}</ul>`, text: el.textContent.trim() });
      else if (/^(DIV|SECTION|ARTICLE|MAIN|BODY|HEADER|FOOTER)$/.test(tag)) walk(el);
    }
  };
  walk(doc.body);
  return { items, title: doc.querySelector('title')?.textContent.trim() || '' };
}

// ---- Word (.docx) ----------------------------------------------------------------------

async function unzip(buffer, wanted) {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('This doesn’t look like a Word document (.docx).');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = dv.getUint16(off + 10, true);
    const size = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const local = dv.getUint32(off + 42, true);
    const name = dec.decode(bytes.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
    if (!wanted.includes(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) out[name] = dec.decode(data);
    else if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t unpack Word files. Save it as .txt or .md and import that.');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out[name] = await new Response(stream).text();
    }
  }
  return out;
}

async function readDocx(buffer) {
  const files = await unzip(buffer, ['word/document.xml', 'word/styles.xml']);
  if (!files['word/document.xml']) throw new Error('Couldn’t find the text inside this Word document.');
  const xml = new DOMParser().parseFromString(files['word/document.xml'], 'application/xml');
  const styleNames = {};
  if (files['word/styles.xml']) {
    const sx = new DOMParser().parseFromString(files['word/styles.xml'], 'application/xml');
    for (const st of sx.getElementsByTagName('w:style')) {
      const name = st.getElementsByTagName('w:name')[0]?.getAttribute('w:val') || '';
      const lvl = st.getElementsByTagName('w:outlineLvl')[0]?.getAttribute('w:val');
      styleNames[st.getAttribute('w:styleId')] = { name: name.toLowerCase(), lvl: lvl != null ? +lvl : null };
    }
  }
  const on = (rPr, tag) => { const el = rPr?.getElementsByTagName(tag)[0]; return el && !/^(0|false)$/.test(el.getAttribute('w:val') || ''); };
  const items = [];
  let title = '';
  for (const p of xml.getElementsByTagName('w:p')) {
    const pPr = p.getElementsByTagName('w:pPr')[0];
    const styleId = pPr?.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') || '';
    const style = styleNames[styleId] || { name: styleId.toLowerCase(), lvl: null };
    const ownLvl = pPr?.getElementsByTagName('w:outlineLvl')[0]?.getAttribute('w:val');
    let html = '';
    let text = '';
    for (const r of p.getElementsByTagName('w:r')) {
      const rPr = r.getElementsByTagName('w:rPr')[0];
      let chunk = '';
      for (const c of r.childNodes) {
        if (c.nodeName === 'w:t') chunk += esc(c.textContent);
        else if (c.nodeName === 'w:tab') chunk += ' ';
        else if (c.nodeName === 'w:br' && c.getAttribute('w:type') !== 'page') chunk += '<br>';
      }
      text += chunk.replace(/<br>/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      if (on(rPr, 'w:b')) chunk = `<b>${chunk}</b>`;
      if (on(rPr, 'w:i')) chunk = `<i>${chunk}</i>`;
      html += chunk;
    }
    text = text.trim();
    if (!text) continue;
    const hm = /heading\s*(\d)/.exec(style.name) || /^heading(\d)$/i.exec(styleId);
    const level = hm ? +hm[1] : ownLvl != null ? +ownLvl + 1 : style.lvl != null && style.lvl < 9 ? style.lvl + 1 : 0;
    if (style.name === 'title' || styleId === 'Title') { if (!title) title = text; continue; }
    if (level) items.push({ kind: 'heading', level, text });
    else if (BREAK_RE.test(text)) items.push({ kind: 'break' });
    else if (/quote/.test(style.name)) items.push({ kind: 'para', html: `<blockquote><p>${html}</p></blockquote>`, text });
    else if (text.length < 70 && !/[.,;:!?”"]$/.test(text) && (PART_RE.test(text) || CHAPTER_RE.test(text))) items.push({ kind: 'heading', level: PART_RE.test(text) ? 1 : 2, text });
    else items.push({ kind: 'para', html: html.trim(), text });
  }
  return { items, title };
}

// ---- shaping: items → a tree of blocks --------------------------------------------------

// tree: [{ type, title, html, children }]
export function shape(items) {
  items = items.map((x) => (x.kind === 'heading' ? { ...x, text: tidyTitle(x.text) } : x));
  const levels = [...new Set(items.filter((x) => x.kind === 'heading').map((x) => x.level))].sort((a, b) => a - b);
  const top = items.filter((x) => x.kind === 'heading' && x.level === levels[0]);
  const hasParts = levels.length >= 3 || top.some((x) => PART_RE.test(x.text));
  const typeFor = (lvl, text) => {
    if (PART_RE.test(text) && hasParts) return 'part';
    const i = levels.indexOf(lvl);
    if (hasParts) return ['part', 'chapter'][i] || 'section';
    return i === 0 ? 'chapter' : 'section';
  };

  const roots = [];
  let part = null;
  let chapter = null;
  let section = null;
  let sawBreak = false;
  const newBlock = (type, title) => ({ type, title, html: '', children: [] });
  const ensureChapter = () => {
    if (chapter) return chapter;
    chapter = newBlock('chapter', roots.length || part ? 'Untitled chapter' : 'Opening');
    (part ? part.children : roots).push(chapter);
    return chapter;
  };
  const target = () => section || ensureChapter();

  for (const it of items) {
    if (it.kind === 'heading') {
      const type = typeFor(it.level, it.text);
      if (type === 'part') { part = newBlock('part', it.text); roots.push(part); chapter = null; section = null; }
      else if (type === 'chapter') { chapter = newBlock('chapter', it.text); (part ? part.children : roots).push(chapter); section = null; sawBreak = false; }
      else { section = newBlock('section', it.text); ensureChapter().children.push(section); }
    } else if (it.kind === 'break') {
      // A scene break: what came before becomes scene 1 (if the chapter had no scenes yet).
      const ch = ensureChapter();
      if (!sawBreak && !ch.children.length && ch.html) {
        ch.children.push({ ...newBlock('section', 'Scene 1'), html: ch.html });
        ch.html = '';
      }
      sawBreak = true;
      section = newBlock('section', `Scene ${ch.children.length + 1}`);
      ch.children.push(section);
    } else {
      target().html += `<p>${it.html}</p>`.replace(/^<p>(<(blockquote|ul)>)/, '$1').replace(/(<\/(blockquote|ul)>)<\/p>$/, '$1');
    }
  }
  return prune(roots);
}

const prune = (list) => list.filter((b) => {
  b.children = prune(b.children);
  return b.html || b.children.length || b.type !== 'section';
});

// From an AI structure ([{type, title, start}] over the paragraph list) to a tree.
export function shapeFromStarts(paragraphs, starts) {
  const sorted = starts.filter((b) => b.start >= 1 && b.start <= paragraphs.length).sort((a, b) => a.start - b.start);
  if (!sorted.length || sorted[0].start !== 1) sorted.unshift({ type: 'chapter', title: 'Opening', start: 1 });
  const roots = [];
  let part = null;
  let chapter = null;
  sorted.forEach((b, i) => {
    const end = (sorted[i + 1]?.start || paragraphs.length + 1) - 1;
    const html = paragraphs.slice(b.start - 1, end).map((x) => (/^<(blockquote|ul)>/.test(x.html) ? x.html : `<p>${x.html}</p>`)).join('');
    const block = { type: b.type, title: b.title, html, children: [] };
    if (b.type === 'part') { roots.push(block); part = block; chapter = null; }
    else if (b.type === 'chapter' || !chapter) { block.type = b.type === 'section' && !chapter ? 'chapter' : b.type; (part ? part.children : roots).push(block); chapter = block; }
    else chapter.children.push(block);
  });
  return roots;
}

export function stats(tree) {
  const out = { parts: 0, chapters: 0, sections: 0, words: 0 };
  const walk = (list) => list.forEach((b) => {
    out[`${b.type}s`] += 1;
    out.words += wordsIn(b.html.replace(/<[^>]+>/g, ' '));
    walk(b.children);
  });
  walk(tree);
  return out;
}

export const paragraphsOf = (items) => items.filter((x) => x.kind === 'para');
export const plainOf = (html) => html.replace(/<br>/g, '\n').replace(/<\/p>/g, '\n\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
