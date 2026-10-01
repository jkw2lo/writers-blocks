// In-app help: a quick start on how to approach a project, a searchable guide to
// every feature, and a spotlight tour of the interface. Content is static and
// written here, so it all works offline.

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
const k = (...keys) => keys.map((x) => `<kbd class="key">${x}</kbd>`).join(' ');

export const SECTIONS = [
  {
    id: 'quickstart', title: 'Quick start: how to begin', html: `
<p class="lede-s">A long piece of writing is too big to hold in your head at once. Writers Blocks lets you stop trying. You break the book into <strong>blocks</strong>, give each one a direction, and write them one sitting at a time, in any order.</p>

<h3>How to think about it</h3>
<ul class="ideas">
  <li><strong>The book is a tree, not a scroll.</strong> Parts hold chapters, chapters hold sections. A section is roughly one scene, one sitting, or one idea: something you could draft in an hour or two.</li>
  <li><strong>Every block gets a direction before a draft.</strong> Two lines: <em>What happens</em> (the synopsis) and <em>Why it’s here</em> (what it has to do for the book). If you can’t write the second line, the block may not belong.</li>
  <li><strong>The shape will change, and that’s the point.</strong> Nothing is fixed. Drag blocks around, split them, merge them. Your first outline is a guess you’ll improve.</li>
  <li><strong>Loose ideas go in the Notebook.</strong> Not everything has a place yet. Catch it anyway; you can drag it into the outline when it finds one.</li>
</ul>

<h3>Your first twenty minutes</h3>
<ol class="steps">
  <li><strong>Pick a starting shape.</strong> <em>Start a new project</em> offers a blank page or a scaffold (a novel in three acts, memoir, essays, a nonfiction argument, a short story). Choose whatever’s closest; you can reshape it all.</li>
  <li><strong>Write the premise.</strong> Click the book’s title at the top of the outline. Fill in <em>Premise</em> and <em>What it’s really about</em>. Keep them rough. They’re for you.</li>
  <li><strong>Sketch the big pieces.</strong> Rename the parts and chapters to what you actually imagine. Add or delete freely. Don’t go deeper than chapters yet.</li>
  <li><strong>Give a few chapters a direction.</strong> Open the <em>Outline</em> tab and fill in <em>What happens</em> down the column. Read it top to bottom: does the story hold together?</li>
  <li><strong>Write the block you’re most excited about.</strong> Not necessarily the first one. Select it, and start writing in the <em>Write</em> view.</li>
</ol>

<h3>Habits that help</h3>
<ul class="ideas">
  <li>Stuck on a block? Look at <em>Before</em> and <em>After</em> in its Direction panel. You’re only writing the bridge between them.</li>
  <li>Set a word target on the blocks you care about. The progress ring and celebrations will do the rest.</li>
  <li>Use the <em>Board</em> when the order feels wrong. Seeing chapters as index cards makes restructuring feel light.</li>
  <li>When you can’t write, brainstorm: deal a prompt, or freewrite for ten minutes. It all lands in the Notebook.</li>
</ul>` },
  {
    id: 'basics', title: 'Blocks and the outline', html: `
<p>Your project is a tree of blocks: <strong>Book → Parts → Chapters → Sections</strong>. Sections can hold sections too, if you want to go deeper. The left panel is the <strong>outline</strong> of the whole tree.</p>
<ul>
  <li><strong>Select</strong> a block by clicking it. The book title at the top selects the whole book (its overview and premise).</li>
  <li><strong>Add</strong>: hover a block and click <strong>+</strong> to add a block inside it, or use <em>Add part</em> at the bottom. The new block appears right there with its name ready to type, and you stay where you were, so you can sketch the big pieces without getting pulled into one.</li>
  <li><strong>Rename</strong>: double-click a selected block, or press ${k('F2')} or ${k('Enter')}.</li>
  <li><strong>More actions</strong>: right-click any block (or click its <strong>⋯</strong>) to rename, add, <em>Turn into</em> a part, chapter or section, <em>Move to</em> somewhere else, change its status, move it up or down, merge or delete. The same menu is on board cards, rows in the Outline view, and the ⋯ beside a block’s title.</li>
  <li><strong>Select several</strong>: ${k(mod)}-click to pick blocks one by one, or ${k('Shift')}-click for a range. Then drag them together, or use the bar at the bottom of the outline to act on them all.</li>
  <li><strong>Move</strong> by dragging. A line shows exactly where the block will land and what it will sit in. Drop in the middle of a block to put it inside. At the end of a branch, slide left or right to choose the level (after the section, or after the whole chapter). Hover over a closed block to open it.</li>
  <li><strong>Delete</strong>: select a block and press ${k('Delete')}, or use the menu. Deleted blocks go to the <strong>Trash</strong> (at the bottom of the outline, or <em>File → Trash</em>), so nothing is lost: restore them to where they were, or delete them for good. Trashed blocks don’t count toward word totals or exports.</li>
  <li><strong>Split</strong> a block in two at the cursor with <em>Split here</em> on the writing toolbar.</li>
  <li><strong>Find</strong> anything with the search box above the outline. It searches titles, synopses, notes, tags and text.</li>
  <li>The coloured dot is the block’s <strong>status</strong>: idea, outlined, drafting, revising, done. The number is its word count, including everything inside it.</li>
  <li>Want more room? Hide the right-hand panel with the panel button in the top bar (${k(mod, '\\')}).</li>
</ul>` },
  {
    id: 'views', title: 'The four views', html: `
<ul>
  <li><strong>Write</strong>: the editor for the selected block, with its direction, where it sits, and its neighbours above it. Select the book itself to see the overview: premise, word target, and progress by status.</li>
  <li><strong>Board</strong>: the pieces of a part or chapter as index cards. Drag to reorder; edit titles and synopses on the cards. <em>Up a level</em> zooms out.</li>
  <li><strong>Map</strong>: the whole book drawn as a tree, every part, chapter and section at once, sideways or top-down. Click a card to select it, double-click to write, drag a card onto another to move it, right-click for the block menu. Fold branches on the map (the outline isn’t affected), show synopses on the cards, zoom, and <em>Fit</em> it all on screen.</li>
  <li><strong>Read</strong>: the whole book (or one part or chapter) as continuous pages, the way a reader will meet it. Double-click any paragraph to jump straight to it in the editor. Turn on <em>Show gaps</em> to see what’s still unwritten.</li>
  <li><strong>Outline</strong>: the whole book as a table. Read down <em>What happens</em> to check the story holds together; read down <em>Why it’s here</em> to check every piece earns its place. Filter to parts or chapters only.</li>
  <li><strong>Notebook</strong>: ideas that don’t have a home yet, as a grid or a free-form canvas. See <em>Brainstorming</em>.</li>
</ul>` },
  {
    id: 'writing', title: 'Writing', html: `
<ul>
  <li><strong>Direction</strong>: above the draft, <em>What happens</em> and <em>Why it’s here</em> keep you pointed somewhere. <em>Before</em> and <em>After</em> show the neighbouring blocks. Collapse the panel when you want more room.</li>
  <li><strong>Formatting</strong>: bold, italic, headings, quotes, lists and scene breaks (✱) from the toolbar. Pasted text arrives as plain paragraphs.</li>
  <li><strong>Focus mode</strong> (${k(mod, '.')}) hides everything but the page. ${k('Esc')} to leave.</li>
  <li><strong>Word targets</strong>: set one per block in the right panel, and one for the whole book on its overview.</li>
</ul>
<h3>Spelling and repetition</h3>
<ul>
  <li><strong>Spell check</strong> uses your browser’s own dictionary: misspellings get a red underline, and right-click shows suggestions. It works offline. Turn it off in Settings.</li>
  <li><strong>Echoes</strong> (on the writing toolbar, and in the Read view) finds words repeated close together, words you lean on, repeated phrases and crutch words like <em>just</em>, <em>really</em> and <em>suddenly</em>. Click one to highlight every occurrence and step through them. It runs on your computer, no AI needed.</li>
</ul>
<h3>Writing aids</h3>
<p>Three buttons on the writing toolbar, next to the word count. Flip them any time; they’re also in Settings.</p>
<ul>
  <li><strong>Typing sounds</strong>: typewriter clacks, and a bell and carriage return when you press Enter. Volume is in Settings.</li>
  <li><strong>Typewriter scrolling</strong>: keeps the line you’re writing in the middle of the screen, so your eyes stay in one place.</li>
  <li><strong>Fade the rest</strong>: dims every paragraph except the one you’re in.</li>
</ul>` },
  {
    id: 'brainstorm', title: 'Brainstorming', html: `
<p>Tools for generating material, in the <strong>Brainstorm</strong> panel on the right. Everything they produce lands in the Notebook, tagged with where it came from.</p>
<ul>
  <li><strong>Deal a prompt</strong>: a card from a deck of about 50 prompts, phrased around the block you’re on.</li>
  <li><strong>Freewrite</strong>: a timed sprint (5 to 20 minutes), with an optional <em>no deleting</em> mode. What you write is saved to the Notebook.</li>
  <li><strong>Collide</strong>: two random ideas from your notebook side by side. Write how they connect.</li>
  <li><strong>Ideas for this block</strong>: jot ideas attached to a block; they appear beside its draft.</li>
</ul>
<h3>The Notebook</h3>
<ul>
  <li>Type in the box at the top and press ${k(mod, 'Enter')} to add an idea. Colour-code notes with the swatches.</li>
  <li>When an idea finds its place, drag it onto the outline or use <em>Make it a block</em>.</li>
  <li><strong>Canvas</strong>: double-click to add a note, drag it by its top edge, drag the link handle onto another note to connect them, click a line to remove it, drag empty space to pan, and ${k(mod)} + scroll to zoom. <em>Label</em> notes (the T swatch) name a cluster.</li>
</ul>` },
  {
    id: 'progress', title: 'Progress and celebrations', html: `
<ul>
  <li>The <strong>ring</strong> in the top bar fills toward the book’s word target. Click it for the book overview.</li>
  <li><strong>+N this session</strong> counts the words you’ve added since you opened the project. Click it for a summary of the session: words, time, what you worked on and finished.</li>
  <li>You’ll get a little <strong>confetti</strong> when a block reaches its word target, when you mark a block <em>Done</em>, when the book reaches its target, and at milestones along the way (5,000 words, novelette length, novel length and more).</li>
  <li>Closing the project shows the session summary. Turn celebrations off in Settings if you’d rather work in peace.</li>
</ul>` },
  {
    id: 'look', title: 'Skins, fonts and modes', html: `
<ul>
  <li><strong>Skins</strong> change the whole feel: Studio, Minimal, Typewriter, Nocturne and Meadow. Pick one from the palette button in the top bar or in Settings.</li>
  <li><strong>Mode</strong>: Auto follows your system’s light or dark setting; or choose Light or Dark. (Nocturne is always dark.)</li>
  <li><strong>Fonts</strong>: keep a skin but change its writing, heading or interface font, and your line spacing. Choices are remembered for each skin. Palette button → <em>Change fonts &amp; spacing…</em>.</li>
  <li><strong>Text size</strong> for the draft is in Settings.</li>
</ul>` },
  {
    id: 'files', title: 'Saving, files and offline', html: `
<p>Your project is a single <code>.wblocks.json</code> file that <strong>you</strong> choose where to keep: Documents, iCloud Drive, Dropbox, anywhere. Nothing is stored on a server.</p>
<ul>
  <li><strong>Chrome, Edge, Arc, Brave</strong>: choose the file once and every change saves to it automatically. The top bar shows the file name with a tick when it’s saved.</li>
  <li><strong>Safari, Firefox</strong>: these can’t write to your disk, so use <em>Download to save</em> (${k(mod, 'S')}) and open the file next time.</li>
  <li><strong>Your shelf</strong>: projects you’ve opened appear as books on the welcome screen (Chrome and friends). Click one to pick up where you left off; the browser asks permission first. Hover and click × to take one off the shelf; the file itself isn’t touched. The shelf only remembers where your files are and their titles and word counts, never what’s in them.</li>
  <li><strong>Two devices</strong>: if the file changes somewhere else while it’s open here, Writers Blocks won’t overwrite it. With nothing unsaved, it loads the new version. Otherwise it asks what you’d like to do.</li>
  <li><strong>Backups</strong>: <em>File → Download a backup copy</em> now and then, or keep the file in a synced or versioned folder.</li>
  <li><strong>Import</strong> a manuscript you’ve already started (<em>File → Import a manuscript…</em>, or on the welcome screen): Word (.docx), Markdown, plain text or a web page. Headings like “Part One” and “Chapter 3” become parts and chapters, and scene breaks (*** or #) become sections. Bring it in as a new project or add it to the end of this one.</li>
  <li><strong>Export</strong> a manuscript, working draft, outline or progress snapshot as PDF, Word, Markdown, text or a web page. See <em>Exporting, printing and sharing</em>.</li>
  <li><strong>Offline</strong>: after your first visit the app works with no connection, including autosave. In Chrome or Edge you can install it (the install icon in the address bar) to get its own window.</li>
</ul>` },
  {
    id: 'export', title: 'Exporting, printing and sharing', html: `
<p><em>File → Export or print…</em> (${k(mod, 'E')}) shows a live preview. Choose <strong>what</strong> you want, then <strong>how</strong> to save it.</p>
<ul>
  <li><strong>Manuscript</strong>: just the writing. A <em>reading copy</em> looks like a proof; <em>for marking up</em> is double-spaced with wide margins, for editing on paper.</li>
  <li><strong>Working draft</strong>: the writing with its skeleton. Each block’s direction, status and notes sit above its text, and blocks you haven’t written yet get lined space, so you can draft them by hand.</li>
  <li><strong>Outline</strong>: the structure alone, to the depth you choose.</li>
  <li><strong>Progress snapshot</strong>: the premise, your progress, the shape of the book and an excerpt. Made for sharing where you’re at. There’s a shortcut to it on the book’s overview: <em>Share your progress…</em></li>
</ul>
<p>Export the whole book, or just one part or chapter (<em>From</em>). Then save as:</p>
<ul>
  <li><strong>Print or save as PDF</strong>: opens your system’s print dialog; choose <em>Save as PDF</em> there for a file.</li>
  <li><strong>Word (.docx)</strong>: opens in Word, Pages, Google Docs or LibreOffice, ready for tracked changes.</li>
  <li><strong>Markdown</strong> or <strong>plain text</strong>: for other writing apps.</li>
  <li><strong>Web page</strong>: a single file anyone can open in a browser. Handy to email.</li>
</ul>` },
  {
    id: 'ai', title: 'The AI assistant (optional)', html: `
<p>Off unless you turn it on in Settings with your own Anthropic API key. It works like a developmental editor: it asks questions and suggests directions, but doesn’t write your prose.</p>
<ul>
  <li>On a block: <em>Where is this going?</em>, <em>Check the flow</em>, <em>Draft a synopsis &amp; purpose</em>, <em>Break it into smaller pieces</em>, or ask anything.</li>
  <li>On the book: <em>Review the structure</em> for pacing, gaps and loose threads.</li>
  <li>In Brainstorm: <em>What if…?</em>, <em>Interview me</em>, and <em>Riff</em> on any note.</li>
  <li><strong>Polish</strong> (writing toolbar): select a passage for four other ways to say it, or click with nothing selected to have the block line-edited, sentence by sentence. Each suggestion sits beside your original, and nothing changes until you click <em>Apply</em> (${k(mod, 'Z')} undoes it).</li>
  <li><strong>Story check</strong> (on the book, a part or a chapter, and in the Read view): reads the writing for plot holes, continuity slips, timeline problems, motivation gaps and threads that never pay off, with links to the blocks involved. Save any issue to your notebook.</li>
  <li><strong>Import</strong>: when bringing in a manuscript, it can find the chapters and scenes and write a synopsis for every block.</li>
  <li>Your text goes straight from your browser to Anthropic, only when you click an action. It needs an internet connection.</li>
</ul>` },
  {
    id: 'keys', title: 'Keyboard shortcuts', html: `
<table class="keys">
  <tr><td>${k(mod, 'S')}</td><td>Save (or download, in Safari and Firefox)</td></tr>
  <tr><td>${k(mod, '.')}</td><td>Focus mode on or off</td></tr>
  <tr><td>${k('Esc')}</td><td>Leave focus mode; clear a multi-selection</td></tr>
  <tr><td>${k(mod, '\\')}</td><td>Hide or show the side panel</td></tr>
  <tr><td>${k(mod, 'E')}</td><td>Export or print</td></tr>
  <tr><td>${k('F2')} or ${k('Enter')}</td><td>Rename the selected block (in the outline)</td></tr>
  <tr><td>${k('Delete')}</td><td>Delete the selected blocks (in the outline)</td></tr>
  <tr><td>${k('↑')} ${k('↓')} ${k('←')} ${k('→')}</td><td>Move through the outline; close or open a block</td></tr>
  <tr><td>${k(mod)}-click, ${k('Shift')}-click</td><td>Select several blocks</td></tr>
  <tr><td>Right-click</td><td>Block menu: rename, turn into, move to, status, delete</td></tr>
  <tr><td>${k(mod, 'B')} ${k(mod, 'I')}</td><td>Bold, italic</td></tr>
  <tr><td>${k(mod, 'Enter')}</td><td>Add a note to the Notebook; send a question to the assistant</td></tr>
  <tr><td>${k('?')}</td><td>Open this help (when you’re not typing)</td></tr>
</table>` },
];

// ---- help dialog ------------------------------------------------------------------

export function openHelp({ section = 'quickstart', onTour } = {}) {
  document.querySelector('dialog.help')?.remove();
  const dlg = document.createElement('dialog');
  dlg.className = 'help';
  dlg.innerHTML = `
    <div class="help-side">
      <div class="help-title">Help</div>
      <input type="search" class="help-search" placeholder="Search help…" aria-label="Search help">
      <nav class="help-nav"></nav>
      ${onTour ? '<button class="btn small help-tour">Take the tour</button>' : ''}
    </div>
    <div class="help-main">
      <button class="icon-btn help-close" title="Close" aria-label="Close">✕</button>
      <article class="help-body"></article>
    </div>`;
  const nav = dlg.querySelector('.help-nav');
  const body = dlg.querySelector('.help-body');
  const search = dlg.querySelector('.help-search');
  const text = (s) => (s.title + ' ' + s.html.replace(/<[^>]+>/g, ' ')).toLowerCase();

  const show = (id) => {
    const s = SECTIONS.find((x) => x.id === id) || SECTIONS[0];
    body.innerHTML = `<h2>${s.title}</h2>${s.html}`;
    body.scrollTop = 0;
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === s.id));
  };
  const list = (q = '') => {
    const hits = SECTIONS.filter((s) => !q || text(s).includes(q));
    nav.replaceChildren(...hits.map((s) => {
      const b = document.createElement('button');
      b.dataset.id = s.id;
      b.textContent = s.title;
      b.onclick = () => show(s.id);
      return b;
    }));
    if (!hits.length) nav.innerHTML = '<p class="muted small">Nothing matches.</p>';
    else if (q) show(hits[0].id);
  };

  search.addEventListener('input', () => list(search.value.trim().toLowerCase()));
  dlg.querySelector('.help-close').onclick = () => dlg.close();
  dlg.querySelector('.help-tour')?.addEventListener('click', () => { dlg.close(); onTour(); });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // click the backdrop to close
  document.body.append(dlg);
  list();
  show(section);
  dlg.showModal();
}

// ---- spotlight tour -------------------------------------------------------------------
// steps: [{ el: selector | null (centred card), title, text }]. Steps whose element
// isn't on screen are skipped, so the tour adapts to whatever layout is showing.

export function startTour(steps, { onEnd } = {}) {
  const live = steps.filter((s) => !s.el || document.querySelector(s.el)?.getClientRects().length);
  if (!live.length) return;
  let i = 0;
  const layer = document.createElement('div');
  layer.className = 'tour';
  layer.innerHTML = `<div class="tour-hole"></div>
    <div class="tour-card" role="dialog" aria-live="polite">
      <div class="tour-count"></div><h3></h3><p></p>
      <div class="tour-foot">
        <button class="link tour-skip">Skip tour</button><span class="spacer"></span>
        <button class="btn small tour-back">Back</button><button class="btn small primary tour-next">Next</button>
      </div>
    </div>`;
  const hole = layer.querySelector('.tour-hole');
  const card = layer.querySelector('.tour-card');
  document.body.append(layer);

  const place = () => {
    const s = live[i];
    const target = s.el && document.querySelector(s.el);
    card.style.visibility = 'hidden';
    if (!target) {
      hole.style.cssText = `left:50%;top:40%;width:0;height:0`;
      card.style.left = `${Math.max(16, (innerWidth - card.offsetWidth) / 2)}px`;
      card.style.top = `${Math.max(16, innerHeight * 0.32)}px`;
    } else {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = target.getBoundingClientRect();
      const pad = 6;
      hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      const gap = 14;
      // prefer below, then above, then beside (for tall panels), then centred
      let left = Math.min(Math.max(16, r.left), innerWidth - cw - 16);
      let top = r.bottom + gap;
      if (top + ch > innerHeight - 16) top = r.top - ch - gap;
      if (top < 16) {
        top = Math.min(Math.max(16, r.top), innerHeight - ch - 16);
        left = r.right + gap + cw < innerWidth - 16 ? r.right + gap : r.left - cw - gap;
        if (left < 16) left = (innerWidth - cw) / 2;
      }
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    }
    card.style.visibility = '';
  };
  const render = () => {
    const s = live[i];
    layer.querySelector('.tour-count').textContent = `${i + 1} of ${live.length}`;
    layer.querySelector('h3').textContent = s.title;
    layer.querySelector('p').innerHTML = s.text;
    layer.querySelector('.tour-back').hidden = i === 0;
    layer.querySelector('.tour-next').textContent = i === live.length - 1 ? 'Start writing' : 'Next';
    place();
    layer.querySelector('.tour-next').focus();
  };
  const end = () => {
    layer.remove();
    removeEventListener('resize', place);
    removeEventListener('keydown', keys, true);
    onEnd?.();
  };
  const go = (d) => { i += d; if (i >= live.length) end(); else if (i >= 0) render(); else i = 0; };
  const keys = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  layer.querySelector('.tour-next').onclick = () => go(1);
  layer.querySelector('.tour-back').onclick = () => go(-1);
  layer.querySelector('.tour-skip').onclick = end;
  addEventListener('resize', place);
  addEventListener('keydown', keys, true);
  render();
}
