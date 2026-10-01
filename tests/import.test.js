import { describe, it, assert } from './harness.js';
import * as I from '../js/lib/import.js';

const outline = (tree) => {
  const out = [];
  const walk = (list, d) => list.forEach((b) => { out.push(`${'  '.repeat(d)}${b.type}: ${b.title}`); walk(b.children, d + 1); });
  walk(tree, 0);
  return out;
};
const read = (text, name) => I.readFile(new File([text], name));

describe('Import: reading and shaping manuscripts', () => {
  it('Markdown: book title, parts, chapters and scene breaks', async () => {
    const r = await read('# The Salt Year\n\n# Part One\n\n## Chapter 1\n\nShe **arrived** late.\n\n***\n\nThe house.\n\n# Part Two\n\n## Chapter 2\n\nBy August.', 'b.md');
    assert.equal(r.title, 'The Salt Year');
    assert.deepEqual(outline(I.shape(r.items)), [
      'part: Part One', '  chapter: Chapter 1', '    section: Scene 1', '    section: Scene 2',
      'part: Part Two', '  chapter: Chapter 2',
    ]);
  });
  it('keeps bold and italic', async () => {
    const r = await read('## One\n\nShe **arrived** *late*.', 'b.md');
    const html = I.shape(r.items)[0].html;
    assert.ok(html.includes('<b>arrived</b>') && html.includes('<i>late</i>'), html);
  });
  it('plain text: CHAPTER lines become chapters, # becomes a scene break, caps are tidied', async () => {
    const r = await read('CHAPTER ONE\n\nShe arrived late.\n\n#\n\nThe house.\n\nChapter Two\n\nThe ledger.', 'c.txt');
    assert.deepEqual(outline(I.shape(r.items)), ['chapter: Chapter One', '  section: Scene 1', '  section: Scene 2', 'chapter: Chapter Two']);
  });
  it('text with no headings lands in one chapter', async () => {
    const r = await read('Para one.\n\nPara two.', 'e.txt');
    const st = I.stats(I.shape(r.items));
    assert.equal(st.chapters, 1);
    assert.equal(st.words, 4);
  });
  it('HTML headings and <hr>', async () => {
    const r = await read('<h1>Prologue</h1><p>Before.</p><h1>Chapter 1</h1><p>One <em>two</em>.</p><hr><p>Three.</p>', 'd.html');
    assert.deepEqual(outline(I.shape(r.items)), ['chapter: Prologue', 'chapter: Chapter 1', '  section: Scene 1', '  section: Scene 2']);
  });
  it('an AI structure (paragraph starts) becomes a tree', () => {
    const paras = ['a', 'b', 'c', 'd'].map((t) => ({ html: t, text: t }));
    const tree = I.shapeFromStarts(paras, [{ type: 'chapter', title: 'One', start: 1 }, { type: 'section', title: 'S', start: 2 }, { type: 'chapter', title: 'Two', start: 4 }]);
    assert.deepEqual(outline(tree), ['chapter: One', '  section: S', 'chapter: Two']);
  });
  it('refuses a project file (that is what Open is for)', async () => {
    let err = null;
    try { await read('{}', 'x.wblocks.json'); } catch (e) { err = e; }
    assert.ok(err);
  });
});
