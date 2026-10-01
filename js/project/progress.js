import { confetti } from '../lib/celebrate.js';
import * as M from '../lib/model.js';
import * as Sound from '../lib/sound.js';
import { fmt, h, icon, toast } from '../core/dom.js';
import { P, prefs, sel, state } from '../core/state.js';
import { select } from './commands.js';

// ---- progress & celebrations ------------------------------------------------------
// Not a daily streak: just the sense of the book coming together. We keep a picture of
// this sitting (words when it started, which blocks you worked on, what you finished)
// and celebrate crossings as they happen: a block's word target, the book's target,
// word-count milestones, and blocks marked Done. Nothing here is saved to the file.

export const MILESTONES = [
  [1000, '1,000 words. The first thousand are the hardest.'],
  [2500, '2,500 words. About ten pages of a paperback.'],
  [5000, '5,000 words, the length of a good short story.'],
  [10000, '10,000 words. Around 40 printed pages.'],
  [17500, '17,500 words. Novelette territory.'],
  [25000, '25,000 words. Halfway to a NaNoWriMo novel.'],
  [40000, '40,000 words. That’s officially novel length.'],
  [50000, '50,000 words. The Great Gatsby is about 47,000.'],
  [75000, '75,000 words. Right around a typical debut novel.'],
  [100000, '100,000 words. Six figures.'],
];
export const milestoneText = (m) => MILESTONES.find(([n]) => n === m)?.[1] || `${fmt(m)} words. Still going.`;
export function milestonesBetween(a, b) {
  const all = [...MILESTONES.map(([n]) => n)];
  for (let m = 125000; m <= b; m += 25000) all.push(m);
  return all.filter((m) => a < m && m <= b);
}

export function startSession() {
  const p = P();
  const nodeWords = {};
  for (const { node } of M.flatten(p)) nodeWords[node.id] = M.treeWords(p, node.id);
  const total = M.treeWords(p);
  state.multi.clear();
  state.mapFolded.clear();
  state.mapScroll = null;
  state.mapFitted = false;
  state.session = { start: Date.now(), baseWords: total, lastTotal: total, nodeWords, touched: new Set(), hit: new Set(), milestones: [], done: [] };
}

export function trackProgress() {
  const s = state.session;
  if (!s || !P()) return;
  const p = P();
  const total = M.treeWords(p);
  for (const m of milestonesBetween(s.lastTotal, total)) {
    if (s.hit.has(`m${m}`)) continue;
    s.hit.add(`m${m}`);
    s.milestones.push(m);
    cheer(milestoneText(m), { big: m >= 10000 });
  }
  if (p.targetWords && s.lastTotal < p.targetWords && total >= p.targetWords && !s.hit.has('book')) {
    s.hit.add('book');
    cheer(`You reached your ${fmt(p.targetWords)}-word target for the whole book!`, { big: true });
  }
  const n = sel();
  if (n.id !== 'root') {
    for (const node of [...M.ancestors(p, n.id).filter((a) => a.id !== 'root'), n]) {
      const w = M.treeWords(p, node.id);
      const prev = s.nodeWords[node.id] ?? w;
      s.nodeWords[node.id] = w;
      if (node.targetWords && prev < node.targetWords && w >= node.targetWords && !s.hit.has(node.id)) {
        s.hit.add(node.id);
        cheer(`“${node.title}” reached its ${fmt(node.targetWords)}-word target.`);
      }
    }
  }
  s.lastTotal = total;
}

export function cheer(msg, { big = false, from = null } = {}) {
  if (!prefs.celebrate) return;
  toast(msg, { cheer: true });
  const r = from?.getBoundingClientRect();
  confetti(r ? { x: r.left + r.width / 2, y: r.top, count: big ? 160 : 70 } : { count: big ? 170 : 80 });
  if (prefs.sounds) Sound.play('bell', prefs.soundVolume);
}

export function blockDone(n, from) {
  state.session?.done.push(n.id);
  const leaves = M.flatten(P()).map((x) => x.node).filter((x) => !x.children.length && x.id !== 'root');
  const done = leaves.filter((x) => x.status === 'done').length;
  if (leaves.length > 1 && done === leaves.length) cheer('Every block is done. That’s a whole draft!', { big: true, from });
  else cheer(`“${n.title}” is done. ${done} of ${leaves.length} blocks finished.`, { from });
}

export function progressRing(words) {
  const target = P().targetWords;
  if (!target) return null;
  const pct = Math.min(1, words / target);
  const c = 2 * Math.PI * 8;
  const ring = h('button', {
    class: `progress-ring ${pct >= 1 ? 'full' : ''}`, 'aria-label': `Book progress: ${Math.round(pct * 100)}%`,
    title: `${fmt(words)} of ${fmt(target)} words (${Math.round(pct * 100)}%)`,
    onclick: () => select('root', 'write'),
  });
  ring.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" class="track"/><circle cx="10" cy="10" r="8" class="fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>`;
  return ring;
}

export function sessionStats() {
  const s = state.session;
  if (!s || !P()) return null;
  const words = M.treeWords(P());
  const titles = (ids) => ids.map((id) => P().nodes[id]?.title).filter(Boolean);
  return {
    net: words - s.baseWords,
    minutes: Math.max(1, Math.round((Date.now() - s.start) / 60000)),
    touched: titles([...s.touched]),
    done: titles([...new Set(s.done)]),
    milestones: s.milestones,
    words,
  };
}

export function showSessionSummary({ closing = false } = {}) {
  const st = sessionStats();
  if (!st) return;
  const dlg = h('dialog', { class: 'settings session' });
  const done = () => { dlg.close(); dlg.remove(); };
  const list = (label, items) => items.length > 0 && h('div', { class: 'session-list' },
    h('span', { class: 'eyebrow' }, label),
    h('p', null, items.slice(0, 6).join(', ') + (items.length > 6 ? ` and ${items.length - 6} more` : '')));
  const time = st.minutes < 60 ? `${st.minutes} min` : `${Math.floor(st.minutes / 60)} h ${st.minutes % 60} min`;
  dlg.append(
    h('div', { class: 'dlg-head' },
      h('h2', null, closing ? 'Nice work today' : 'This session'),
      h('button', { class: 'icon-btn', onclick: done, title: 'Close' }, icon('close'))),
    h('div', { class: 'session-stats' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, `${st.net >= 0 ? '+' : '−'}${fmt(Math.abs(st.net))}`), h('div', { class: 'stat-label' }, 'words')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, time), h('div', { class: 'stat-label' }, 'with the book open')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, fmt(st.words)), h('div', { class: 'stat-label' }, 'words in the book'))),
    list('Worked on', st.touched),
    list('Finished', st.done),
    list('Milestones', st.milestones.map((m) => `${fmt(m)} words`)),
    !st.touched.length && !st.done.length && h('p', { class: 'muted' }, 'Nothing written yet this session. The page is waiting.'),
    h('div', { class: 'dlg-foot' }, h('button', { class: 'btn primary', onclick: done }, closing ? 'See you next time' : 'Back to writing')),
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  if (closing && st.net > 0) confetti({ count: 60 });
}
