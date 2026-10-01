import { restoreUndo } from './undo.js';
import { cheer } from '../project/progress.js';

// ---- tiny DOM helpers -----------------------------------------------------------

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('data-') || k.startsWith('aria-') || !(k in el)) el.setAttribute(k, v === true ? '' : v);
    else el[k] = v;
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const ICONS = {
  plus: 'M12 5v14M5 12h14',
  chev: 'M9 6l6 6-6 6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  split: 'M4 12h16M12 4v4M12 16v4',
  merge: 'M6 4v5a3 3 0 003 3h6a3 3 0 013 3v5M6 20v-5',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  focus: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  check: 'M5 12l5 5L20 7',
  dot: 'M12 12h.01',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5',
  note: 'M5 4h14v12l-4 4H5zM15 20v-4h4',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  arrowL: 'M15 6l-6 6 6 6',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0012 3z',
  close: 'M6 6l12 12M18 6L6 18',
  palette: 'M12 3a9 9 0 000 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7H16a5 5 0 005-5c0-4-4-7.4-9-7.4zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01M17 11.5h.01',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  sound: 'M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13',
  center: 'M4 12h16M8 6h8M8 18h8M2 9v6M22 9v6',
  fade: 'M4 6h10M4 12h16M4 18h8',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.2a2.6 2.6 0 015 .6c0 1.7-2.5 2.1-2.5 3.7M12 17h.01',
  panel: 'M4 5h16v14H4zM15 5v14',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  collapse: 'M15 6l-6 6 6 6M19 6v12',
  width: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  print: 'M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-5a2 2 0 012-2h12a2 2 0 012 2v5a1 1 0 01-1 1h-2M7 14h10v6H7z',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6',
  pen: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  home: 'M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6',
  echo: 'M4 7h9M4 12h13M4 17h9M17 5l3 2-3 2M17 15l3 2-3 2',
  import: 'M12 4v11M8 11l4 4 4-4M5 19h14',
  read: 'M3 5h6a3 3 0 013 3v11a2 2 0 00-2-2H3zM21 5h-6a3 3 0 00-3 3v11a2 2 0 012-2h7z',
};
export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', `icon ${cls}`);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<path d="${ICONS[name]}"/>`;
  return s;
}

export function autoGrow(el) {
  const fit = () => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; };
  el.addEventListener('input', fit);
  el.dataset.autogrow = '';
  el.fit = fit;
  growQueue.push(el);
  if (growQueue.length === 1) requestAnimationFrame(fitQueued);
  return el;
}

// New boxes are sized together in one frame: all writes, then all reads, then all writes,
// so a long outline costs one layout instead of one per box.
const growQueue = [];
function fitQueued() {
  const els = growQueue.splice(0).filter((el) => el.isConnected);
  els.forEach((el) => (el.style.height = 'auto'));
  const hs = els.map((el) => el.scrollHeight);
  els.forEach((el, i) => (el.style.height = `${hs[i] + 2}px`));
}

export const fmt = (n) => n.toLocaleString();
export const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const textToHtml = (t) =>
  t.split(/\n\s*\n|\r\n\s*\r\n/).map((para) => para.trim()).filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`).join('');

export let toastTimer;
export function toast(msg, { undo = false, error = false, cheer = false } = {}) {
  const t = document.getElementById('toast');
  t.replaceChildren(cheer ? h('span', { class: 'cheer-icon' }, icon('spark')) : '', h('span', null, msg));
  t.className = `show ${error ? 'error' : ''} ${cheer ? 'cheer' : ''}`;
  if (undo) t.append(h('button', { class: 'link', onclick: () => { restoreUndo(); t.className = ''; } }, 'Undo'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), undo || cheer ? 6000 : 3500);
}
