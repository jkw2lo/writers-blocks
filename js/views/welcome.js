import { openHelp } from '../lib/help.js';
import * as S from '../lib/storage.js';
import { fmt, h, icon } from '../core/dom.js';
import { state } from '../core/state.js';
import { cmdNew, cmdOpen, cmdReopen, cmdSample, refreshShelf } from '../project/files.js';
import { openImport } from '../ui/import-dialog.js';
import { app } from '../ui/shell.js';
import { skinPicker } from '../ui/theme.js';

export function renderWelcome() {
  document.body.classList.remove('focus');
  // Two columns on wide screens (intro | shelf and vibe), with help and the saving note in a
  // footer under both, so it all fits without scrolling.
  app.replaceChildren(
    h('div', { class: 'welcome' },
      h('div', { class: 'welcome-card' },
        h('div', { class: 'welcome-intro' },
          h('div', { class: 'logo-blocks', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
          h('h1', null, 'Writers Blocks'),
          h('p', { class: 'lede' }, 'A place to shape a long piece of writing: map its structure, give every part a direction, and rearrange freely as the book finds its form.'),
          h('div', { class: 'welcome-actions' },
            h('button', { class: 'btn primary', onclick: cmdNew }, 'Start a new project'),
            h('button', { class: 'btn', onclick: cmdSample }, 'Explore a sample'),
            h('button', { class: 'btn', onclick: cmdOpen }, 'Open a project file…'),
            h('button', { class: 'btn', onclick: openImport }, 'Import a manuscript…'))),
        h('div', { class: 'welcome-side' },
          bookshelf(),
          h('div', { class: 'vibe' },
            h('span', { class: 'eyebrow' }, 'Pick a vibe'),
            skinPicker({ compact: true }))),
        h('footer', { class: 'welcome-foot' },
          h('p', { class: 'welcome-help' }, 'New here? ',
            h('button', { class: 'link', onclick: () => openHelp({ section: 'quickstart' }) }, 'How to start a project'),
            ' · ',
            h('button', { class: 'link', onclick: () => openHelp({ section: 'basics' }) }, 'Guide to every feature')),
          h('p', { class: 'fine' },
            S.canAutosave
              ? 'Your work is saved to a file on your computer that you choose, and it autosaves as you write. The shelf only remembers where your files are, never what’s in them.'
              : 'This browser can’t autosave to your disk, so use Save to download your project file, and Open it next time. (Chrome, Edge or Arc can autosave.) Nothing is kept in the browser.')),
      ),
    ),
  );
}
// ---- the shelf -----------------------------------------------------------------------

export const COVERS = ['--t-part', '--accent', '--s-outlined', '--s-revising', '--s-done', '--s-drafting'];
export const coverFor = (title) => COVERS[[...(title || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % COVERS.length];

export function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} minutes ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const d = Math.round(hr / 24);
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function bookshelf() {
  if (!state.shelf.length) {
    return S.canAutosave ? h('div', { class: 'shelf-empty' }, h('b', null, 'Your shelf'), 'Projects you open or start will wait here, ready to pick up where you left off.') : null;
  }
  return h('section', { class: 'shelf', 'aria-label': 'Recent projects' },
    h('div', { class: 'shelf-head' },
      h('span', { class: 'eyebrow' }, 'Your shelf'),
      h('span', { class: 'muted small' }, 'Pick up where you left off')),
    h('div', { class: 'shelf-row' },
      state.shelf.map((e) => {
        const pct = e.target ? Math.min(100, (e.words || 0) / e.target * 100) : 0;
        return h('div', { class: 'book', style: `--cover: var(${coverFor(e.title || e.name)})` },
          h('button', {
            class: 'book-cover', onclick: () => cmdReopen(e),
            title: `Open ${e.name}${e.words != null ? ` · ${fmt(e.words)} words` : ''}`,
          },
            h('span', { class: 'cover-title' }, e.title || e.name),
            e.words != null && h('span', { class: 'book-words' }, `${fmt(e.words)} words`),
            e.target > 0 && h('span', { class: 'book-progress', 'aria-hidden': 'true' }, h('i', { style: `width:${pct}%` }))),
          h('span', { class: 'book-when' }, ago(e.opened)),
          h('button', {
            class: 'book-remove', title: 'Take off the shelf (the file itself isn’t touched)', 'aria-label': `Remove ${e.title || e.name} from the shelf`,
            onclick: async () => { await S.unshelve(e.id); refreshShelf(); },
          }, icon('close')));
      })));
}
