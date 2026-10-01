import { describe, it, assert } from './harness.js';
import * as M from '../js/lib/model.js';
import { state, prefs } from '../js/core/state.js';
import { splitNote, outermost } from '../js/project/commands.js';
import { mapLayout } from '../js/views/map.js';
import { suggestions, nextUp, stageProgress } from '../js/project/flow.js';

function project() {
  const p = M.newProject('Test', 'novel');
  state.project = p;
  state.mapFolded = new Set();
  return p;
}

describe('Notes becoming blocks', () => {
  it('a short note: whole first line as title, its text as the synopsis', () => {
    const r = splitNote('Salt as metaphor');
    assert.deepEqual(r, { title: 'Salt as metaphor', synopsis: '', content: '' });
  });
  it('an idea-sized note keeps all its words, visible as the synopsis', () => {
    const t = 'Ines’s mainland job: something with screens and metrics. She measures everything; Avó measured by taste.';
    const r = splitNote(t);
    assert.equal(r.title, 'Ines’s mainland job: something with screens and metrics');
    assert.equal(r.synopsis, t);
    assert.equal(r.content, '');
  });
  it('never cuts a title mid-word', () => {
    const r = splitNote('A very long opening line that goes on and on without any punctuation at all for quite a while really');
    assert.ok(r.title.endsWith('…') && !/\w…$/.test(r.title.replace(/ \S+…$/, '')), r.title);
    assert.ok(r.title.split(' ').length <= 9);
  });
  it('a long note keeps everything as the draft', () => {
    const t = 'The morning after the storm. '.repeat(20);
    const r = splitNote(t);
    assert.ok(r.content.length > 0 && r.synopsis.length > 0);
  });
});

describe('Map layout', () => {
  const overlaps = (L) => {
    const boxes = L.items.map((i) => ({ id: i.id, x: i.x, y: i.y, w: 230, h: i.h }));
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a]; const B = boxes[b];
        if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) return `${A.id} × ${B.id}`;
      }
    }
    return null;
  };
  for (const dir of ['right', 'down']) {
    it(`no cards overlap (${dir}), even with very different heights`, () => {
      const p = project();
      prefs.mapDir = dir;
      const heights = {};
      M.flatten(p).forEach(({ node }, i) => (heights[node.id] = 58 + (i % 4) * 60));
      heights.root = 300; // a tall book card
      const L = mapLayout(p, (id) => heights[id] || 58);
      assert.equal(overlaps(L), null);
      assert.equal(L.items.length, M.flatten(p).length + 1);
    });
  }
  it('folded branches are left out', () => {
    const p = project();
    prefs.mapDir = 'right';
    const part = p.nodes.root.children[0];
    state.mapFolded = new Set([part]);
    const L = mapLayout(p, () => 58);
    assert.equal(L.items.length, M.flatten(p).length + 1 - M.flatten(p, part).length);
  });
});

describe('Flow: the Desk and stages', () => {
  it('a project without a premise is told to start there', () => {
    const p = project();
    p.nodes.root.synopsis = '';
    assert.equal(suggestions()[0].stage, 'gather');
  });
  it('once drafting has begun, "keep writing" comes first', () => {
    const p = project();
    p.nodes.root.synopsis = 'A premise.';
    const leaf = M.flatten(p).map((x) => x.node).find((n) => !n.children.length);
    leaf.content = '<p>Some words.</p>';
    leaf.editedAt = new Date().toISOString();
    const first = suggestions()[0];
    assert.equal(first.stage, 'draft');
    assert.equal(nextUp().id, leaf.id);
  });
  it('stage progress is between 0 and 1', () => {
    project();
    const prog = stageProgress();
    for (const k of ['gather', 'plan', 'draft', 'revise', 'share']) assert.ok(prog[k].pct >= 0 && prog[k].pct <= 1, k);
  });
  it('outermost drops blocks inside other selected blocks', () => {
    const p = project();
    const part = p.nodes.root.children[0];
    const ch = p.nodes[part].children[0];
    assert.deepEqual(outermost([ch, part]), [part]);
  });
});
