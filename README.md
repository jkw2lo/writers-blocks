# Writers Blocks

A writing workspace for long-form work (novels, memoir, long stories, essay collections). It sits between a blank document and a paper notebook: somewhere to map a book's structure, give every piece a direction, and rearrange freely while you draft.

## What it does

**A flow, not just features.** The app follows the stages of writing a book: **① Gather** (premise, notebook, brainstorming) → **② Plan** (Map, Outline, Board) → **③ Draft** (Write) → **④ Revise** (Read, Echoes, Polish, Story check) → **⑤ Share** (export). Each stage shows only its own views and tools, with a line on how far along it is. The **Desk** is home: it reads the project and suggests a next step (write the premise, keep writing the block you were on, read a finished part through). It suggests; you choose.

New to it? The app has a **quick start** on how to approach a project, a searchable **help guide** to every feature, and a one-minute **guided tour** (offered the first time you open a project). They're all behind the **?** button in the top bar, or press `?`. **Start a new project** lets you begin from a blank page or a starting shape: a novel in three acts, memoir, essay collection, nonfiction argument, or short story.

- **Blocks, not one long doc.** Your book is a tree: **Parts → Chapters → Sections**. Each block has its own draft text, plus:
  - **What happens**: a one- or two-line synopsis
  - **Why it's here**: what the block has to do for its chapter and the book
  - status (idea → outlined → drafting → revising → done), word target, tags and margin notes
- **Views**
  - **Write**: a distraction-light editor. Above it you see the block's direction, where it sits (breadcrumbs), and the blocks just before and after it, so you always know what you're writing *toward*.
  - **Board**: index cards for the pieces of a part or chapter. Drag to reorder, and edit synopses right on the card.
  - **Outline**: the whole book as a table. Read down "What happens" to check the story holds together; read down "Why it's here" to check every piece earns its place.
  - **Map**: the whole book as a visual tree (sideways or top-down), with status, word counts and optional synopses on each card. Drag cards to restructure, fold branches, zoom and fit.
  - **Read**: the book (or one part or chapter) as continuous pages. Double-click any paragraph to jump to it in the editor.
  - **Notebook**: loose fragments and ideas with no home yet, as a **Grid** or a spatial **Canvas** (see *Brainstorming*). Drag an idea onto the outline (or use *Make it a block*) and it becomes a block.
- **Restructure freely**: drag blocks anywhere in the left-hand outline; a line shows exactly where they'll land and what they'll sit in, and closed blocks open as you hover. Select several with ⌘/Ctrl- or Shift-click and move them together. Right-click (or ⋯) any block to rename it, turn it into a part/chapter/section, move it somewhere else, change its status or delete it. **Split** a block at the cursor, **merge** a block with the next one, and undo structural changes. New blocks appear in place with their name ready to type, without pulling you away from what you're looking at.
- **Break it down**: every part and chapter shows its pieces and word counts, so a book becomes a list of sections you can write one sitting at a time.
- **Skins for your vibe** (the palette icon in the top bar, or Settings), each with light and dark modes:
  - **Studio**: warm paper and a bookish serif (the original look)
  - **Minimal**: sleek, modern and quiet, all Geist
  - **Typewriter**: grainy paper, Courier, ribbon red, your draft typed onto a sheet with a margin rule
  - **Nocturne**: 2am and candlelit, Garamond with drop caps (always dark)
  - **Meadow**: soft and cosy, with Fraunces, Lora, sage and rose
- **Your own fonts**: keep a skin's look but swap its writing, heading or interface font (about 30 to choose from, including Atkinson Hyperlegible and Lexend for easier reading, and a couple of handwritten ones), and set your line spacing. Choices are remembered per skin: *Look → Change fonts & spacing…* or Settings.
- **Writing aids**, each a button on the writing toolbar (and in Settings) you can flip any time:
  - **Typing sounds**: typewriter clacks, and a bell and carriage return on Enter. Synthesized in the browser, so they work offline. Off by default.
  - **Typewriter scrolling**: keeps the line you're writing in the middle of the screen.
  - **Fade the rest**: dims every paragraph except the one you're in.
- **Watch it come together**: a progress ring for the book's word target, a "+N this session" count, and a little confetti when a block hits its word target, you mark something Done, or the book passes a milestone (5,000 words, novelette length, novel length…). Closing a project shows a summary of the session. Celebrations can be turned off in Settings.
- **Trash**: deleted blocks wait in the Trash (kept in your project file) until you restore them or delete them for good.
- **Echoes**: a repetition checker for close repeats, overused words, repeated phrases and crutch words, highlighted in place. Runs locally, no AI.
- **Spell check** via your browser's built-in dictionary (works offline; toggle in Settings).
- **Import** a manuscript from Word (.docx), Markdown, plain text or HTML. Headings become parts and chapters, scene breaks become sections.
- **Export, print and share** (*File → Export or print…*, `⌘/Ctrl + E`), with a live preview:
  - **Manuscript**: just the writing, as a reading copy or a double-spaced copy for marking up on paper
  - **Working draft**: the writing with its skeleton (direction, status, notes) and lined space for blocks not written yet
  - **Outline**: the structure alone
  - **Progress snapshot**: premise, progress, the shape of the book and an excerpt, to share where you're at
  
  Save any of them as PDF (via print), Word (.docx), Markdown, plain text, or a single-file web page. Export the whole book or one part or chapter.
- **Hide the side panel** (`⌘/Ctrl + \`) when you want more room.
- **Focus mode** (`⌘/Ctrl + .`) and Markdown export of the manuscript (with or without synopses).

## Brainstorming

Tools for generating material, not just organizing it. They all live in the **Brainstorm** panel on the right, and everything they produce lands in the Notebook, tagged with where it came from.

- **Canvas**: spread ideas out like sticky notes on a wall. Double-click to add, drag to arrange, colour-code, make *label* notes to name clusters, and drag the link handle from one note to another to connect them.
- **Deal a prompt**: a deck of about 50 prompts (what ifs, character, stakes, senses & place, structure, play & constraint, argument), phrased around whichever block you're on.
- **Freewrite**: a timed sprint (5–20 min) with an optional "no deleting" mode. Whatever you write is saved to the notebook, attached to the block you started from.
- **Collide**: two random ideas from your notebook side by side. Write how they connect and the connection is saved, linked to both.
- **Ideas for this block**: ideas can be attached to a block. They show up beside the draft in the Write view, and you can jot new ones there.
- With the AI assistant on:
  - **What if…?**: eight possibilities for the block or book, from grounded to wild. Keep the ones you like.
  - **Interview me**: five questions only you can answer. Your answers become ideas.
  - **Riff** (✦ on any note): spins off five variations of an idea, linked to it on the canvas.

## Where your writing lives

**In a file on your computer, not in the browser.** A project is a single `*.wblocks.json` file that you choose where to save (a Documents folder, iCloud Drive, Dropbox, a git repo…).

- **Chrome, Edge, Arc, Brave**: pick the file once and the app **autosaves to it** as you type (via the File System Access API). Writes are atomic, so a crash mid-save can't corrupt the file.
- **Editing on more than one device**: if the file changes on disk while it's open (say it syncs in from your laptop via iCloud or Dropbox), Writers Blocks never silently overwrites it. With nothing unsaved it quietly loads the new version when you come back to the window. If you have unsaved changes too, autosave pauses and you choose: save yours as a copy, use the file's version, or overwrite.
- **Safari, Firefox**: these browsers can't write to your disk directly, so use *Download to save* and *Open…* the file next time.

The browser keeps only small conveniences: your skin, fonts and light/dark choice, text size, and on Chromium a **shelf** of recent projects on the welcome screen. For each, the shelf keeps a *handle* pointing to the file plus its title and word count, never its text, and the browser asks your permission before the app can read the file again. Use **File → Download a backup copy** now and then, or keep the project file in a synced or versioned folder.

**Daily backups** (Chromium): choose a folder in *Settings → Daily backups*. On the first save of each new day you write, the project file as it stood at the end of your last writing day is copied there as `<title>-YYYY-MM-DD.wblocks.json`. Only the five most recent copies per project are kept, and days without edits make none. The app never pops a permission prompt mid-typing: if the browser has forgotten the folder's permission (a new browser session), the copy is held and an **Allow backup** button appears in the top bar. To restore a copy, open it like any project.

## Works offline

After your first visit, Writers Blocks works with no internet connection. A service worker (`sw.js`) caches the app and every skin's fonts (never your writing, which stays in your file). Saving to your file is local, so autosave keeps working offline too. Only the optional AI assistant needs a connection.

In Chrome or Edge you can also **install** it (the install icon in the address bar) so it opens in its own window like a desktop app.

## Optional AI assistant

Off by default. Turn it on in **Settings** and add your own [Anthropic API key](https://console.anthropic.com/settings/keys). It works like a developmental editor: it asks questions and suggests directions, but doesn't write your prose.

| Action | What it does |
|---|---|
| Where is this going? | How a block fits its chapter and the book, what it should set up, options for where it could go |
| Check the flow | Looks at transitions with the previous and next blocks |
| Draft a synopsis & purpose | Reads your draft and proposes the two direction lines (you choose whether to use them) |
| Break it into smaller pieces | Proposes 3–8 sub-sections you can add with one click |
| Review the structure | (Book level) pacing, gaps, redundancy, and threads that don't resolve |
| Ask | A free-form question, with the outline and current block as context |
| Polish | Select a passage for alternative wordings, or line-edit a whole block; suggestions apply with one click |
| Story check | Reads the manuscript for plot holes, continuity slips, dropped threads and motivation gaps |
| Import (AI) | Finds chapters and scenes in an imported manuscript and writes a synopsis for each block |

Privacy: your key is kept in memory for the current tab only, unless you tick "remember on this device". Text is sent straight from your browser to Anthropic, and only when you click an action. It sends the outline (titles, synopses, purposes) and the current block's text, not the whole manuscript. Uses Claude Opus 5 by default (Sonnet 5 is available as a faster, cheaper option).

## Run locally

No build step. Serve the folder with any static server:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. (Opening `index.html` directly as a `file://` URL won't work, because ES modules need a server.)

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Deploy from a branch**, choose `main` and `/ (root)`.
3. Your app will be at `https://<you>.github.io/<repo>/`.

## Project layout

```
index.html              app shell
css/styles.css          all styles (design tokens for the default skin at the top)
css/themes.css          the other skins: token overrides + signature touches
js/app.js               entry: wires the modules together, global shortcuts, service worker
js/core/                state and preferences, DOM helpers, undo
js/project/             what you do to a project: files & saving, daily backups, two-device sync,
                        commands (add, move, split, merge…), the stage flow, progress & milestones
js/ui/                  the shell around the views: top bar, outline panel, inspector, menus,
                        drag & drop, settings, skins, tools drawer, help & tour, export/import dialogs
js/views/               one file per view: welcome, desk, write, board, outline, map, read,
                        notebook, share, trash
js/lib/                 framework-free logic: data model, file storage, AI, import, export,
                        Echoes, prompts, sounds, confetti, help text
tests/                  in-browser tests: serve the folder and open /tests/
sw.js                   service worker: offline cache for the app and fonts
manifest.webmanifest    makes the app installable
examples/               a sample project to explore
```

## Tests

Serve the folder (see *Run locally*) and open http://localhost:5173/tests/. The tests cover the data model, import, export (every Word file is checked for valid XML), Echoes, the Map layout (no overlapping cards), and the Desk's suggestions. The page title shows the result, e.g. "✓ 44 passed".

## Ideas for later

- Save as a folder of Markdown files (one per block) for easier diffing and editing elsewhere
- Revision history per block
- Character & place cards linked to blocks; tag filters on the board
- Timeline view; per-day writing goals and streaks
- Compile to .docx / EPUB
