import * as M from '../lib/model.js';
import { fmt, h, icon, toast } from '../core/dom.js';
import { P } from '../core/state.js';
import { snapshot } from '../core/undo.js';
import { changed } from '../project/files.js';
import { render } from '../ui/shell.js';
import { ago } from './welcome.js';

// ---- Trash view ----------------------------------------------------------------------------

export function renderTrash() {
  const p = P();
  const restore = (e) => {
    snapshot();
    const n = M.restoreTrash(p, e.id);
    changed();
    render();
    const parent = n && M.parentOf(p, n.id);
    toast(`Restored “${n.title}”${parent && parent.id !== 'root' ? ` to “${parent.title}”` : ''}.`, { undo: true });
  };
  const forget = (e) => {
    if (!confirm(`Delete “${e.nodes[e.rootId].title}” for good? This can’t be undone once you leave this page.`)) return;
    snapshot();
    p.trash = p.trash.filter((x) => x !== e);
    changed();
    render();
    toast('Deleted for good.', { undo: true });
  };
  return h('div', { class: 'board trash' },
    h('div', { class: 'board-head' },
      h('h2', null, 'Trash'),
      h('p', { class: 'muted' }, 'Deleted parts, chapters and sections wait here until you restore them or delete them for good. They’re kept in your project file, and they don’t count toward word totals or exports.'),
      p.trash.length > 0 && h('button', { class: 'btn small danger-ghost', onclick: () => {
        if (!confirm(`Empty the Trash? ${p.trash.length} item${p.trash.length > 1 ? 's' : ''} will be deleted for good.`)) return;
        snapshot(); p.trash = []; changed(); render(); toast('Trash emptied.', { undo: true });
      } }, icon('trash'), 'Empty trash')),
    !p.trash.length && h('p', { class: 'empty' }, 'Nothing in the Trash.'),
    h('div', { class: 'trash-list' }, p.trash.map((e) => {
      const n = e.nodes[e.rootId];
      const inside = Object.keys(e.nodes).length - 1;
      const was = p.nodes[e.parentId];
      const preview = M.stripHtml(n.content).trim().split(/\s+/).slice(0, 40).join(' ');
      return h('article', { class: 'trash-item' },
        h('div', { class: 'trash-top' },
          h('span', { class: `type-badge type-${n.type}` }, M.TYPES[n.type].label),
          h('strong', null, n.title)),
        h('p', { class: 'muted small' }, [
          `Deleted ${ago(Date.parse(e.deletedAt))}`,
          `${fmt(M.trashWords(e))} words`,
          inside && `${inside} block${inside > 1 ? 's' : ''} inside`,
          was ? (e.parentId === 'root' ? 'was at the top level' : `was in “${was.title}”`) : 'its old place is gone',
        ].filter(Boolean).join(' · ')),
        n.synopsis && h('p', { class: 'trash-syn' }, n.synopsis),
        preview && h('p', { class: 'trash-preview' }, `${preview}…`),
        h('div', { class: 'trash-actions' },
          h('button', { class: 'btn small primary', onclick: () => restore(e) }, 'Restore'),
          h('button', { class: 'btn small danger-ghost', onclick: () => forget(e) }, 'Delete for good')));
    })));
}
