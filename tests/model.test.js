import { describe, it, assert } from './harness.js';
import * as M from '../js/lib/model.js';

const titles = (p, id = 'root') => p.nodes[id].children.map((c) => p.nodes[c].title);

describe('Model: projects and shapes', () => {
  it('a blank project has a part, a chapter and a section', () => {
    const p = M.newProject('Test');
    assert.equal(M.flatten(p).length, 3);
    assert.equal(p.nodes.root.title, 'Test');
  });
  it('every starting shape builds a valid tree with purposes as prompts', () => {
    for (const shape of Object.keys(M.SHAPES)) {
      const p = M.validate(M.newProject('X', shape));
      assert.ok(M.flatten(p).length > 0, `${shape} is empty`);
      assert.equal(p.targetWords, M.SHAPES[shape].target);
    }
    const novel = M.newProject('N', 'novel');
    assert.ok(M.flatten(novel).some(({ node }) => node.purpose.length > 10), 'novel has prompts');
  });
  it('validate fills in missing fields from older files', () => {
    const p = M.newProject('Old');
    delete p.trash;
    delete p.notebook;
    Object.values(p.nodes).forEach((n) => { delete n.tags; delete n.synopsis; });
    M.validate(p);
    assert.ok(Array.isArray(p.trash) && Array.isArray(p.notebook));
    assert.ok(Object.values(p.nodes).every((n) => Array.isArray(n.tags) && n.synopsis === ''));
  });
  it('validate rejects something that is not a project', () => {
    assert.throws(() => M.validate({ hello: 'world' }));
  });
});

describe('Model: tree operations', () => {
  it('adds, moves and refuses to move a block inside itself', () => {
    const p = M.newProject('T');
    const part = p.nodes.root.children[0];
    const b = M.addNode(p, 'root', 'part', null, 'Part Two');
    const ch = p.nodes[part].children[0];
    assert.ok(M.moveNode(p, ch, b.id, 0));
    assert.deepEqual(titles(p, b.id), ['Chapter 1']);
    assert.equal(M.moveNode(p, b.id, ch, 0), false, 'moving into a descendant is refused');
  });
  it('moving within the same parent lands at the intended index', () => {
    const p = M.newProject('T');
    ['A', 'B', 'C'].forEach((t) => M.addNode(p, 'root', 'part', null, t));
    const [, a, , c] = p.nodes.root.children;
    M.moveNode(p, a, 'root', 4); // to the end
    assert.deepEqual(titles(p), ['Part One', 'B', 'C', 'A']);
    M.moveNode(p, c, 'root', 0);
    assert.deepEqual(titles(p), ['C', 'Part One', 'B', 'A']);
  });
  it('split and merge round-trip the text', () => {
    const p = M.newProject('T');
    const sec = M.flatten(p).find(({ node }) => node.type === 'section').node;
    const next = M.splitNode(p, sec.id, '<p>One.</p>', '<p>Two.</p>');
    assert.equal(next.title, 'Opening (cont.)');
    M.mergeWithNext(p, sec.id);
    assert.ok(sec.content.includes('One.') && sec.content.includes('Two.'));
    assert.ok(!p.nodes[next.id]);
  });
  it('counts words, including everything inside a block', () => {
    const p = M.newProject('T');
    const sec = M.flatten(p).find(({ node }) => node.type === 'section').node;
    sec.content = '<p>The ferry left before the light did.</p><p>It’s Ines’s boat.</p>';
    assert.equal(M.nodeWords(sec), 10);
    assert.equal(M.treeWords(p), 10);
  });
});

describe('Model: trash', () => {
  it('trashing removes a block and its children from the tree and the word count', () => {
    const p = M.newProject('T');
    const sec = M.flatten(p).find(({ node }) => node.type === 'section').node;
    sec.content = '<p>four words right here</p>';
    const ch = M.parentOf(p, sec.id);
    M.trashNode(p, ch.id);
    assert.equal(M.treeWords(p), 0);
    assert.ok(!p.nodes[sec.id]);
    assert.equal(p.trash.length, 1);
    assert.equal(M.trashWords(p.trash[0]), 4);
  });
  it('restoring puts it back where it was, with notes re-attached', () => {
    const p = M.newProject('T');
    const part = p.nodes.root.children[0];
    M.addNode(p, part, 'chapter', null, 'Second');
    const first = p.nodes[part].children[0];
    p.notebook.push(M.makeNote('idea', { nodeId: first }));
    const entry = M.trashNode(p, first);
    assert.equal(p.notebook[0].nodeId, null);
    M.restoreTrash(p, entry.id);
    assert.equal(p.nodes[part].children[0], first, 'back in first position');
    assert.equal(p.notebook[0].nodeId, first, 'note re-attached');
    assert.equal(p.trash.length, 0);
  });
  it('restores to the top level if its old parent is gone', () => {
    const p = M.newProject('T');
    const part = p.nodes.root.children[0];
    const ch = p.nodes[part].children[0];
    const e = M.trashNode(p, ch);
    M.deleteNode(p, part);
    M.restoreTrash(p, e.id);
    assert.ok(p.nodes.root.children.includes(ch));
  });
});
