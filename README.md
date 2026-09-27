# Writers Blocks

A writing workspace for long-form work (novels, memoir, long stories, essay collections). It sits between a blank document and a paper notebook: somewhere to map a book's structure, give every piece a direction, and rearrange freely while you draft.

## What it does

- **Blocks, not one long doc.** Your book is a tree: **Parts → Chapters → Sections**. Each block has its own draft text, plus:
  - **What happens**: a one- or two-line synopsis
  - **Why it's here**: what the block has to do for its chapter and the book
  - status (idea → outlined → drafting → revising → done), word target, tags and margin notes
- **Four views**
  - **Write**: a distraction-light editor. Above it you see the block's direction, where it sits (breadcrumbs), and the blocks just before and after it, so you always know what you're writing *toward*.
  - **Board**: index cards for the pieces of a part or chapter. Drag to reorder, and edit synopses right on the card.
  - **Outline**: the whole book as a table. Read down "What happens" to check the story holds together; read down "Why it's here" to check every piece earns its place.
  - **Notebook**: loose fragments and ideas with no home yet, as a **Grid** or a spatial **Canvas** (see *Brainstorming*). Drag an idea onto the outline (or use *Make it a block*) and it becomes a block.
- **Restructure freely**: drag blocks anywhere in the left-hand outline (before, after, or *into* another block), **split** a block at the cursor, **merge** a block with the next one, and undo structural changes.
- **Break it down**: every part and chapter shows its pieces and word counts, so a book becomes a list of sections you can write one sitting at a time.
- **Focus mode** (`⌘/Ctrl + .`), light/dark themes, and Markdown export of the manuscript (with or without synopses).

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
- **Safari, Firefox**: these browsers can't write to your disk directly, so use *Download to save* and *Open…* the file next time.

The browser keeps only small conveniences: your theme, text size, and on Chromium a *handle* pointing to your last file, so "Reopen" works. That handle holds no text, and the browser asks your permission before the app can read the file again. Use **File → Download a backup copy** now and then, or keep the project file in a synced or versioned folder.

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
css/styles.css          all styles (light/dark tokens at the top)
js/app.js               UI: views, drag & drop, commands, settings
js/model.js             the book data model (tree ops, word counts, export)
js/storage.js           saving/opening files on your disk
js/ai.js                optional assistant (prompts + Claude API calls)
examples/               a sample project to explore
```

## Ideas for later

- Save as a folder of Markdown files (one per block) for easier diffing and editing elsewhere
- Snapshots / revision history per block
- Character & place cards linked to blocks; tag filters on the board
- Timeline view; per-day writing goals and streaks
- Compile to .docx / EPUB
