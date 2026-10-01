import { describe, it, assert } from './harness.js';
import * as F from '../js/lib/format.js';

describe('Formatting: paragraphs', () => {
  it('the first line typed (bare text) becomes a paragraph like the rest', () => {
    assert.equal(F.normalizeHtml('First para<p>Second</p><p>Third</p>'), '<p>First para</p><p>Second</p><p>Third</p>');
  });
  it('inline formatting stays with its paragraph', () => {
    assert.equal(F.normalizeHtml('Hello <em>there</em> you<p>Next</p>'), '<p>Hello <em>there</em> you</p><p>Next</p>');
  });
  it('divs become paragraphs; tidy HTML is left alone', () => {
    assert.equal(F.normalizeHtml('<div>One</div><div>Two</div>'), '<p>One</p><p>Two</p>');
    const ok = '<p>One</p><h2>Two</h2><blockquote>Three</blockquote>';
    assert.equal(F.normalizeHtml(ok), ok);
  });
});

describe('Formatting: case', () => {
  it('sentence case keeps acronyms, the pronoun I and word styles', () => {
    assert.equal(F.changeCase('The Ferry Left. i Saw The BBC On My IPHONE', 'sentence', { keep: ['iPhone'] }),
      'The ferry left. I saw the BBC on my iPhone');
  });
  it('a run of capitals is shouting, not acronyms', () => {
    assert.equal(F.changeCase('THE SALT YEAR BEGINS. i went to the BBC', 'sentence'), 'The salt year begins. I went to the BBC');
  });
  it('sentence case of shouting lowers everything but sentence starts', () => {
    assert.equal(F.changeCase('WHERE ARE YOU? HOME.', 'sentence'), 'Where are you? Home.');
  });
  it('sentence case mid-sentence does not capitalise the first word', () => {
    assert.equal(F.changeCase('Very Tired', 'sentence', { before: 'She was ' }), 'very tired');
    assert.equal(F.changeCase('very tired', 'sentence', { before: 'Done. ' }), 'Very tired');
  });
  it('title case leaves small words lower, except first and last', () => {
    assert.equal(F.changeCase('the salt year of the world', 'title'), 'The Salt Year of the World');
    assert.equal(F.changeCase('a tale to come back to', 'title'), 'A Tale to Come Back To');
  });
  it('upper and lower, and always the same length', () => {
    assert.equal(F.changeCase('Salt Year', 'upper'), 'SALT YEAR');
    assert.equal(F.changeCase('Salt Year', 'lower'), 'salt year');
  });
});

describe('Formatting: smart punctuation and tidying', () => {
  it('curly quotes open after a space and close after a letter', () => {
    assert.equal(F.smartPunct('"Don\'t," she said. \'Fine.\''), '“Don’t,” she said. ‘Fine.’');
  });
  it('dashes and ellipses', () => {
    assert.equal(F.smartPunct('wait -- no... yes'), 'wait—no… yes');
  });
  it('tidy strips fake indents and doubled spaces, across formatting', () => {
    const r = F.tidyHtml('<p>   Indented  start "<em>quoted</em>" </p>Bare');
    assert.equal(r.html, '<p>Indented start “<em>quoted</em>”</p><p>Bare</p>');
    assert.ok(r.changed);
    assert.equal(F.tidyHtml('<p>Fine.</p>').changed, false);
  });
});

describe('Formatting: word styles', () => {
  const rules = [
    { form: 'eBay', also: '', style: '' },
    { form: 'McKinsey & Company', also: 'mckinsey and company, mckinsey & co', style: '' },
    { form: 'Salt Queen', also: '', style: 'i' },
  ];
  it('rewrites any capitalisation and listed spellings, whole words only', () => {
    const r = F.applyWordStyles('<p>EBAY and ebay, not ebayer. Mckinsey and Company too.</p>', rules);
    assert.equal(r.html, '<p>eBay and eBay, not ebayer. McKinsey &amp; Company too.</p>');
    assert.equal(r.count, 3);
  });
  it('adds the style, and leaves already-styled words alone', () => {
    assert.equal(F.applyWordStyles('<p>The salt queen sailed.</p>', rules).html, '<p>The <em>Salt Queen</em> sailed.</p>');
    assert.equal(F.applyWordStyles('<p>The <em>Salt Queen</em> sailed.</p>', rules).count, 0);
  });
  it('the matcher finds the rule for a spelling', () => {
    const m = F.wordMatcher(rules);
    assert.equal(m.rule('MCKINSEY  & CO').form, 'McKinsey & Company');
    assert.equal(F.wordMatcher([]), null);
  });
});
