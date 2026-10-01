import { describe, it, assert } from './harness.js';
import * as E from '../js/lib/echoes.js';

describe('Echoes', () => {
  it('finds a word repeated close together', () => {
    const a = E.analyze('The tide came in. The tide went out, and the gulls watched the tide again.');
    assert.ok(a.echoes.some((x) => x.word === 'tide'), JSON.stringify(a.echoes));
  });
  it('flags crutch words', () => {
    const a = E.analyze('She just went. He just stayed. It was really very quiet and really very cold, just so.');
    assert.ok(a.crutch.some((x) => x.word === 'just' && x.count === 3));
  });
  it('finds repeated phrases', () => {
    const a = E.analyze('At the edge of the pans she stopped. Later, at the edge of the pans, he waited.');
    assert.ok(a.repeated.some((x) => x.phrase.includes('edge of the pans')), JSON.stringify(a.repeated));
  });
  it('finds text across paragraphs, including a sentence ending in a full stop', () => {
    const d = document.createElement('div');
    d.innerHTML = '<p>It sounded like someone else.</p><p>Behind her.</p>';
    assert.equal(E.findRanges(d, 'It sounded like someone else.').length, 1);
    assert.equal(E.findRanges(d, 'someone').length, 1);
    assert.equal(E.findRanges(d, 'some').length, 0, 'whole words only');
  });
});
