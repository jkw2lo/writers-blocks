import { openHelp, startTour } from '../lib/help.js';
import { P, prefs, savePrefs, sel, state } from '../core/state.js';
import { firstLeaf, save } from '../project/files.js';
import { render } from './shell.js';

// ---- help & tour -----------------------------------------------------------------------

export const showHelp = (section) => openHelp({ section, onTour: state.project ? runTour : null });

export const TOUR = [
  { el: null, title: 'Welcome to Writers Blocks', text: 'Here’s a one-minute look around. Use the arrow keys or the buttons, and press Esc to skip. You can replay this from Help any time.' },
  { el: '.binder .tree', title: 'The outline', text: 'Your book as a tree of parts, chapters and sections. Click a block to open it, drag to rearrange (a line shows where it will land), or hover and click <b>+</b> to add inside. Right-click any block for more: rename, move, change its kind, delete.' },
  { el: '.stages', title: 'Five stages of writing a book', text: '<b>Gather</b> the idea, <b>Plan</b> its shape, <b>Draft</b> it, <b>Revise</b> it, <b>Share</b> it. Each stage shows only its own views, and you can move back and forth any time.' },
  { el: '.desk-btn', title: 'Your desk', text: 'Not sure what to do next? The Desk reads your project and suggests a next step, like the block to keep writing or the part that’s ready to read through. It suggests; you choose.' },
  { el: '.direction', title: 'Every block has a direction', text: '<b>What happens</b> and <b>Why it’s here</b> keep you pointed somewhere. Below them are the blocks just before and after, so you know what you’re writing toward.' },
  { el: '.toolbar', title: 'The writing toolbar', text: 'Formatting, and <b>Split here</b> to break a block in two. On the right are your writing aids: typing sounds, typewriter scrolling, and fade the rest.' },
  { el: '.inspector', title: 'This block, and ideas', text: 'Set a block’s status and word target, add tags and notes, and move it around. Further down, <b>Brainstorm</b> deals prompts, runs freewriting sprints, and collides ideas. Hide this panel with the panel button in the top bar when you want quiet.' },
  { el: '#status', title: 'Progress and saving', text: 'The ring fills toward your book’s word target, and <b>+N this session</b> counts this sitting. Your file’s save status is here too.' },
  { el: '.look', title: 'Make it yours', text: 'Skins for every mood, light or dark, and your own fonts and line spacing.' },
  { el: '.help-btn', title: 'Help is always here', text: 'The quick start, a guide to every feature, and this tour. Press <b>?</b> any time you’re not typing.' },
];

export function runTour() {
  if (!state.project) return;
  const before = { view: state.view, id: state.selectedId };
  state.focus = false;
  state.view = 'write';
  if (sel().children.length || sel().id === 'root') state.selectedId = firstLeaf(P()) || state.selectedId;
  render();
  requestAnimationFrame(() => startTour(TOUR, {
    onEnd: () => {
      prefs.toured = true;
      savePrefs();
      if (P()?.nodes[before.id]) { state.view = before.view; state.selectedId = before.id; render(); }
    },
  }));
}

export function maybeTour() {
  if (prefs.toured || !state.project) return;
  setTimeout(() => { if (!document.querySelector('dialog[open], .tour')) runTour(); }, 400);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== '?' || e.metaKey || e.ctrlKey) return;
  const t = e.target;
  if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || document.querySelector('dialog[open], .tour')) return;
  e.preventDefault();
  showHelp();
});
