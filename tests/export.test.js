import { describe, it, assert } from './harness.js';
import * as M from '../js/lib/model.js';
import * as X from '../js/lib/export.js';

function sample() {
  const p = M.newProject('Test Book', 'blank');
  p.author = 'Me';
  const sec = M.flatten(p).find(({ node }) => node.type === 'section').node;
  sec.content = '<p>Hello <b>bold</b> &amp; <i>it</i>.</p><h2>A heading</h2><blockquote><p>Quoted</p></blockquote><ul><li>One</li></ul><hr><p>After.</p>';
  sec.synopsis = 'What happens';
  return p;
}

// Read the files back out of our stored (uncompressed) zip.
async function unzip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  const dec = new TextDecoder();
  const files = {};
  let off = 0;
  while (dv.getUint32(off, true) === 0x04034b50) {
    const size = dv.getUint32(off + 18, true);
    const nlen = dv.getUint16(off + 26, true);
    files[dec.decode(buf.slice(off + 30, off + 30 + nlen))] = dec.decode(buf.slice(off + 30 + nlen, off + 30 + nlen + size));
    off += 30 + nlen + size;
  }
  return { files, eocd: dv.getUint32(buf.length - 22, true) === 0x06054b50 };
}

describe('Export', () => {
  for (const kind of Object.keys(X.KINDS)) {
    for (const layout of ['reading', 'editing']) {
      it(`${kind} (${layout}) makes a valid Word file`, async () => {
        const doc = X.build(sample(), kind, { ...X.defaults(kind), layout }, 'root');
        const { files, eocd } = await unzip(X.toDocx(doc));
        assert.ok(eocd, 'zip has an end record');
        for (const name of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml']) assert.ok(files[name], `${name} present`);
        for (const [name, xml] of Object.entries(files)) {
          const bad = new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror');
          assert.ok(!bad, `${name} is well-formed XML`);
        }
      });
    }
  }
  it('paragraph properties follow Word’s required order (spacing before jc)', async () => {
    const { files } = await unzip(X.toDocx(X.build(sample(), 'manuscript', X.defaults('manuscript'), 'root')));
    assert.ok(!/<w:jc [^>]*\/><w:spacing/.test(files['word/styles.xml']), 'jc must come after spacing');
  });
  it('the manuscript keeps the words; the draft adds direction', () => {
    const md = X.toMarkdown(X.build(sample(), 'manuscript', X.defaults('manuscript'), 'root'));
    assert.ok(md.includes('**bold**') && md.includes('*it*'));
    assert.ok(!md.includes('What happens'));
    const draft = X.toMarkdown(X.build(sample(), 'draft', X.defaults('draft'), 'root'));
    assert.ok(draft.includes('What happens'));
  });
  it('a snapshot shows progress and an excerpt', () => {
    const html = X.toHTML(X.build(sample(), 'snapshot', X.defaults('snapshot'), 'root'));
    assert.ok(html.includes('words written') && html.includes('An excerpt'));
  });
});
