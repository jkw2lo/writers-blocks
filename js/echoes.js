// Echoes: a repetition checker. Finds words you lean on, words repeated close
// together, repeated phrases, and common crutch words, all locally (no AI, works
// offline). Highlights use the CSS Custom Highlight API, which paints ranges
// without touching the draft's HTML.

const STOP = new Set(`a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves
i'm it's don't didn't can't won't isn't wasn't she'd he'd i'd you'd they'd we'd she's he's that's there's what's let's i've you've we've they've i'll you'll he'll she'll we'll they'll one two also back said says say like get got go went come came know knew see saw look looked make made take took thing things way even still much many well something nothing anything everything someone anyone everyone`.split(/\s+/));

// Words and phrases editors flag as filler or as telling-not-showing.
export const CRUTCH = ['just', 'really', 'very', 'actually', 'suddenly', 'somehow', 'quite', 'rather', 'basically', 'literally', 'seemed', 'seems', 'began to', 'started to', 'felt', 'feel', 'realized', 'noticed', 'little', 'slightly', 'almost', 'totally', 'completely', 'simply', 'definitely', 'certainly', 'in order to', 'that'];

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const norm = (w) => w.toLowerCase().replace(/’/g, "'").replace(/'s$/, '');

export function analyze(text, { closeWindow = 40 } = {}) {
  const words = [...text.matchAll(WORD)].map((m) => norm(m[0]));
  const total = words.length;
  const counts = new Map();
  words.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));

  // Overused: content words used often for the length of the text.
  const minCount = Math.max(3, Math.round(total / 600));
  const overused = [...counts].filter(([w, c]) => !STOP.has(w) && w.length > 2 && !/^\d+$/.test(w) && c >= minCount)
    .map(([word, count]) => ({ word, count, per1k: Math.round((count / Math.max(total, 1)) * 10000) / 10 }))
    .sort((a, b) => b.count - a.count).slice(0, 20);

  // Echoes: the same content word again within a few lines.
  const lastAt = new Map();
  const close = new Map();
  words.forEach((w, i) => {
    if (STOP.has(w) || w.length < 4) return;
    if (lastAt.has(w) && i - lastAt.get(w) <= closeWindow) close.set(w, (close.get(w) || 0) + 1);
    lastAt.set(w, i);
  });
  const echoes = [...close].map(([word, count]) => ({ word, count: count + 1 })).sort((a, b) => b.count - a.count).slice(0, 15);

  // Repeated phrases: 3–4 word sequences that occur more than once (not made only of stop words).
  const phrases = new Map();
  for (const n of [4, 3]) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n);
      if (gram.every((w) => STOP.has(w))) continue;
      const key = gram.join(' ');
      phrases.set(key, (phrases.get(key) || 0) + 1);
    }
  }
  const repeated = [...phrases].filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .reduce((kept, [phrase, count]) => {
      if (!kept.some((k) => k.phrase.includes(phrase) && k.count >= count)) kept.push({ phrase, count });
      return kept;
    }, []).slice(0, 12);

  // Crutch words, with how often they appear.
  const lower = ` ${words.join(' ')} `;
  const crutch = CRUTCH.map((c) => ({ word: c, count: lower.split(` ${c} `).length - 1 }))
    .filter((c) => c.count >= (c.word === 'that' ? Math.max(4, Math.round(total / 120)) : 2))
    .sort((a, b) => b.count - a.count);

  return { total, overused, echoes, repeated, crutch };
}

// DOM Ranges for every occurrence of a word or phrase inside an element.
export function findRanges(root, term) {
  const parts = term.split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]"));
  // Whole words only, but only at an edge that is itself a letter or digit: a quoted
  // sentence ending in "." can be followed directly by the next paragraph's text.
  const wordy = /[\p{L}\p{N}]/u;
  const head = wordy.test(term.trim()[0]) ? '(?<![\\p{L}\\p{N}])' : '';
  const tail = wordy.test(term.trim().slice(-1)) ? "(?:['’]s)?(?![\\p{L}\\p{N}])" : '';
  const re = new RegExp(`${head}${parts.join('\\s*')}${tail}`, 'giu');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let text = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { nodes.push({ n, at: text.length }); text += n.data; }
  const ranges = [];
  const locate = (pos) => {
    let lo = 0;
    let hi = nodes.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (nodes[mid].at <= pos) lo = mid; else hi = mid - 1; }
    return nodes[lo];
  };
  for (const m of text.matchAll(re)) {
    const a = locate(m.index);
    const b = locate(m.index + m[0].length - 1);
    const r = document.createRange();
    r.setStart(a.n, m.index - a.at);
    r.setEnd(b.n, m.index + m[0].length - b.at);
    ranges.push(r);
  }
  return ranges;
}

export const canHighlight = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

export function highlight(roots, term) {
  if (!canHighlight) return [];
  clearHighlight();
  if (!term) return [];
  const ranges = roots.flatMap((r) => findRanges(r, term));
  CSS.highlights.set('echo', new Highlight(...ranges));
  return ranges;
}

// The one occurrence you're looking at, drawn more strongly.
export function highlightCurrent(range) {
  if (canHighlight) CSS.highlights.set('echo-now', new Highlight(range));
}

export function clearHighlight() {
  if (!canHighlight) return;
  CSS.highlights.delete('echo');
  CSS.highlights.delete('echo-now');
}
