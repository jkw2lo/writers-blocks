// Optional AI assistant. Off by default; nothing is sent anywhere unless you
// enable it in Settings AND click one of the assistant actions.
//
// Your API key is held in memory for this tab only (unless you tick
// "remember on this device"). Calls go straight from your browser to
// Anthropic; there's no server in between.

import { flatten, ancestors, neighbors, stripHtml, nodeWords, TYPES } from './model.js';

export const MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 (best feedback)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (faster, cheaper)' },
];

let clientPromise = null;
let clientKey = null;

async function client(apiKey) {
  if (!clientPromise || clientKey !== apiKey) {
    clientKey = apiKey;
    // Loaded lazily so the SDK is only downloaded if you actually use AI.
    clientPromise = import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm').then(
      ({ default: Anthropic }) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true }),
    );
  }
  return clientPromise;
}

const SYSTEM = `You are a thoughtful developmental editor working alongside a writer on a long-form project (a book, long story, or essay collection). The writer is the author: you coach, question, and suggest; you do not take over their voice or rewrite their prose unless explicitly asked.

Be concrete and specific to their material: refer to their actual sections, characters, arguments, and lines. Prefer a few sharp observations over many generic ones. Keep responses compact and skimmable: short paragraphs or brief bullet lists, no preamble, no flattery. Use Markdown lightly (bold, bullets, short headings).`;

// ---- context building -------------------------------------------------------

function outline(p, currentId) {
  const lines = [];
  for (const { node, depth } of flatten(p)) {
    const pad = '  '.repeat(depth);
    let line = `${pad}- [${TYPES[node.type].label}] ${node.title}`;
    if (node.synopsis) line += ` — ${node.synopsis}`;
    if (node.purpose) line += ` (purpose: ${node.purpose})`;
    line += ` [${node.status}, ${nodeWords(node)} words]`;
    if (node.id === currentId) line += '  ← CURRENT';
    lines.push(line);
  }
  return lines.join('\n');
}

function bookHeader(p) {
  const root = p.nodes.root;
  return [
    `Title: ${root.title}`,
    root.synopsis && `Premise: ${root.synopsis}`,
    root.purpose && `What the book is ultimately about / wants to do: ${root.purpose}`,
  ].filter(Boolean).join('\n');
}

function describe(n, withText = true) {
  const parts = [
    `${TYPES[n.type].label}: "${n.title}"`,
    n.synopsis && `Synopsis: ${n.synopsis}`,
    n.purpose && `Purpose: ${n.purpose}`,
    n.notes && `Author's notes: ${n.notes}`,
  ];
  if (withText) {
    const text = stripHtml(n.content).trim();
    parts.push(text ? `Draft text:\n"""\n${text}\n"""` : '(No draft text yet.)');
  }
  return parts.filter(Boolean).join('\n');
}

function context(p, id) {
  const n = p.nodes[id];
  const path = ancestors(p, id).filter((a) => a.id !== 'root');
  return [
    bookHeader(p),
    `\nFull outline:\n${outline(p, id)}`,
    path.length ? `\nWhere the current block sits: ${path.map((a) => `${TYPES[a.type].label} "${a.title}"${a.synopsis ? ` (${a.synopsis})` : ''}`).join(' › ')}` : '',
    `\nCURRENT BLOCK\n${describe(n)}`,
  ].join('\n');
}

// ---- calls ----------------------------------------------------------------

// long: the prompt carries a lot of manuscript, so stream (no request timeouts) and allow a long answer.
async function call(settings, prompt, { schema, long = false, system = SYSTEM } = {}) {
  const c = await client(settings.apiKey);
  const isOpus = settings.model === 'claude-opus-5';
  const req = {
    model: settings.model,
    max_tokens: long ? 64000 : 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', ...(schema && { format: { type: 'json_schema', schema } }) },
    system,
    messages: [{ role: 'user', content: prompt }],
  };
  if (isOpus) {
    // If a request is declined by a safety classifier, retry it on
    // Anthropic's recommended fallback model instead of failing.
    req.betas = ['server-side-fallback-2026-07-01'];
    req.fallbacks = 'default';
  }
  const res = long ? await c.beta.messages.stream(req).finalMessage() : await c.beta.messages.create(req);
  if (res.stop_reason === 'refusal') {
    throw new Error("The assistant declined this request. Try rephrasing or narrowing what you're asking.");
  }
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (res.stop_reason === 'max_tokens') throw new Error('The response was cut off. Try a narrower request.');
  return schema ? JSON.parse(text) : text;
}

export const actions = {
  direction: {
    label: 'Where is this going?',
    hint: 'How this block fits its chapter and the book, and what it could accomplish.',
    run: (s, p, id) =>
      call(s, `${context(p, id)}

Help me with the direction of the CURRENT block. Briefly:
1. What job does it seem to be doing in its chapter/part and in the book as a whole? Is that job clear?
2. What should it accomplish or set up, given what comes before and after it in the outline?
3. Two or three concrete options for where it could go next (not prose, just directions).
4. Anything in the outline that suggests it's in the wrong place, redundant, or missing a beat.`),
  },
  flow: {
    label: 'Check the flow',
    hint: 'Transitions in and out of this block, compared with its neighbours.',
    run: (s, p, id) => {
      const { prev, next } = neighbors(p, id);
      return call(s, `${context(p, id)}

PREVIOUS BLOCK
${prev ? describe(prev) : '(none — this is the first)'}

NEXT BLOCK
${next ? describe(next) : '(none — this is the last)'}

Look at how the CURRENT block flows from the previous one and into the next. Point out jarring jumps, repeated information, dropped threads, or shifts in tone/pace. Suggest specific transition fixes or reorderings. Quote brief phrases from the text where helpful.`);
    },
  },
  summarize: {
    label: 'Draft a synopsis & purpose',
    hint: 'Reads the draft text and proposes a one-line synopsis and purpose.',
    schema: {
      type: 'object',
      properties: {
        synopsis: { type: 'string', description: 'One or two sentences: what happens / what is said.' },
        purpose: { type: 'string', description: 'One sentence: why this block exists in the book.' },
      },
      required: ['synopsis', 'purpose'],
      additionalProperties: false,
    },
    run(s, p, id) {
      return call(s, `${context(p, id)}

Write a concise synopsis (what happens / what is argued) and a purpose (why this block matters to its chapter and the book) for the CURRENT block, based on its draft text. Match the author's vocabulary. Return JSON.`, { schema: this.schema });
    },
  },
  breakdown: {
    label: 'Break it into smaller pieces',
    hint: 'Proposes manageable sub-sections you can add with one click.',
    schema: {
      type: 'object',
      properties: {
        pieces: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              synopsis: { type: 'string' },
              purpose: { type: 'string' },
            },
            required: ['title', 'synopsis', 'purpose'],
            additionalProperties: false,
          },
        },
        note: { type: 'string', description: 'One or two sentences on the logic of this breakdown.' },
      },
      required: ['pieces', 'note'],
      additionalProperties: false,
    },
    run(s, p, id) {
      const n = p.nodes[id];
      const childType = TYPES[n.type].child;
      return call(s, `${context(p, id)}

The CURRENT ${TYPES[n.type].label.toLowerCase()} feels too big to tackle in one go. Break it into 3–8 smaller ${TYPES[childType].label.toLowerCase()}s that could each be written in a single sitting. Base them on the synopsis, purpose, notes, any draft text, and existing children. Each piece gets a short working title, a one-sentence synopsis, and a one-sentence purpose. Don't repeat blocks that already exist as children. Return JSON.`, { schema: this.schema });
    },
  },
  structure: {
    label: 'Review the structure',
    hint: 'A look at the whole outline: pacing, gaps, redundancy, order.',
    run: (s, p) =>
      call(s, `${bookHeader(p)}

Full outline:
${outline(p, null)}

Review the overall structure of this book from the outline. Point out: pacing or proportion problems (parts/chapters much heavier or thinner than others), gaps or missing beats, redundancy, blocks that might work better elsewhere, and threads that start but don't resolve. Suggest at most five concrete structural moves, most important first.`),
  },
};

export async function ask(settings, p, id, question) {
  return call(settings, `${context(p, id)}

The writer asks: ${question}`);
}

// Minimal, safe Markdown → HTML for assistant replies.
export function renderMarkdown(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  const out = [];
  let list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^#{1,6}\s+(.*)/))) { closeList(); out.push(`<h4>${inline(m[1])}</h4>`); }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (!line.trim()) closeList();
    else { closeList(); out.push(`<p>${inline(line)}</p>`); }
  }
  closeList();
  return out.join('');
}

// ---- brainstorming ----------------------------------------------------------------

function scopeContext(p, id) {
  return id === 'root' ? `${bookHeader(p)}\n\nFull outline:\n${outline(p, null)}` : context(p, id);
}

function scopeName(p, id) {
  const n = p.nodes[id];
  return id === 'root' ? 'the book as a whole' : `the CURRENT ${TYPES[n.type].label.toLowerCase()} ("${n.title}")`;
}

function notebookDigest(p) {
  const notes = p.notebook.filter((n) => n.text.trim());
  if (!notes.length) return '(The notebook is empty.)';
  return notes.map((n) => {
    const about = n.nodeId && p.nodes[n.nodeId] ? ` (about "${p.nodes[n.nodeId].title}")` : '';
    return `- ${n.text.trim().replace(/\s+/g, ' ')}${about}`;
  }).join('\n');
}

export const IDEA_KINDS = ['twist', 'character', 'image', 'stakes', 'structure', 'theme', 'question'];

export const brainstorm = {
  whatIf: {
    schema: {
      type: 'object',
      properties: {
        ideas: {
          type: 'array',
          items: {
            type: 'object',
            properties: { idea: { type: 'string' }, kind: { type: 'string', enum: IDEA_KINDS } },
            required: ['idea', 'kind'],
            additionalProperties: false,
          },
        },
      },
      required: ['ideas'],
      additionalProperties: false,
    },
    run(s, p, id) {
      return call(s, `${scopeContext(p, id)}

Ideas already in the writer's notebook (build on them if useful, but don't repeat them):
${notebookDigest(p)}

Brainstorm 8 divergent "what if…" possibilities for ${scopeName(p, id)}. Spread them from grounded and quietly useful to strange and risky. Each is a seed of one or two sentences, specific to this material (use the names, places, objects and arguments already in play). They are not prose for the book and not generic writing advice. Tag each with the kind of idea it is. Return JSON.`, { schema: this.schema });
    },
  },
  interview: {
    schema: {
      type: 'object',
      properties: { questions: { type: 'array', items: { type: 'string' } } },
      required: ['questions'],
      additionalProperties: false,
    },
    run(s, p, id) {
      return call(s, `${scopeContext(p, id)}

Ideas in the writer's notebook:
${notebookDigest(p)}

Interview me to help me discover what should happen in ${scopeName(p, id)} and what it's really about. Ask 5 short questions that only the author can answer, specific to this material, and not answerable by looking at the outline. Mix practical ones (what happens, who, where) with deeper ones (why it matters, what it costs). Return JSON.`, { schema: this.schema });
    },
  },
  riff: {
    schema: {
      type: 'object',
      properties: { riffs: { type: 'array', items: { type: 'string' } } },
      required: ['riffs'],
      additionalProperties: false,
    },
    run(s, p, note) {
      const about = note.nodeId && p.nodes[note.nodeId] ? `\n\nThis note is attached to:\n${describe(p.nodes[note.nodeId], false)}` : '';
      return call(s, `${bookHeader(p)}

Full outline:
${outline(p, note.nodeId)}${about}

A note from my notebook:
"""
${note.text}
"""

Riff on this note. Give 5 distinct variations that push it somewhere new: for example invert it, raise the stakes, zoom into one concrete detail, connect it to something already in the outline, or move it to a different point in the book. Each is one or two sentences, specific and concrete, not prose for the book. Return JSON.`, { schema: this.schema });
    },
  },
};

// ---- line editing ----------------------------------------------------------------
// The writer asks for these explicitly, on text they choose. Suggestions are always
// offered side by side with the original, and nothing changes until they click Apply.

const LINE_EDITOR = `You are a sharp, sympathetic line editor working with a writer on their own manuscript. You suggest wording; the writer decides. Preserve their voice, point of view, tense, register and meaning. Prefer precise, concrete, surprising-but-earned language over ornate language. Never pad. When the original is already good, say so rather than inventing changes.`;

export const polish = {
  alternatives: {
    schema: {
      type: 'object',
      properties: {
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'The replacement wording, ready to drop in.' },
              note: { type: 'string', description: 'A few words on what this version does differently.' },
            },
            required: ['text', 'note'],
            additionalProperties: false,
          },
        },
      },
      required: ['options'],
      additionalProperties: false,
    },
    run(s, p, id, passage, before, after) {
      const n = p.nodes[id];
      return call(s, `${bookHeader(p)}

From the ${TYPES[n.type].label.toLowerCase()} "${n.title}"${n.synopsis ? ` (${n.synopsis})` : ''}.

Text just before the passage:
"""${before}"""

THE PASSAGE:
"""${passage}"""

Text just after:
"""${after}"""

Offer 4 alternative wordings for THE PASSAGE only, so it fits seamlessly between the surrounding text. Range from a light tightening, to a more vivid or concrete version, to a bolder, more surprising one. Keep roughly the same length unless cutting improves it. Return JSON.`, { schema: this.schema, system: LINE_EDITOR });
    },
  },
  lineEdit: {
    schema: {
      type: 'object',
      properties: {
        overall: { type: 'string', description: 'One or two sentences on the prose as a whole.' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              original: { type: 'string', description: 'An exact, verbatim excerpt from the draft (a phrase or sentence) to replace.' },
              suggestion: { type: 'string', description: 'The replacement text.' },
              why: { type: 'string', description: 'A brief reason.' },
              kind: { type: 'string', enum: ['clarity', 'vividness', 'rhythm', 'cliché', 'redundancy', 'word choice', 'dialogue', 'other'] },
            },
            required: ['original', 'suggestion', 'why', 'kind'],
            additionalProperties: false,
          },
        },
      },
      required: ['overall', 'edits'],
      additionalProperties: false,
    },
    run(s, p, id) {
      const n = p.nodes[id];
      return call(s, `${bookHeader(p)}

${describe(n)}

Line-edit this draft. Pick the 6–12 phrases or sentences where a change would make the biggest difference: flat or vague wording, clichés, tangled sentences, repetition, weak verbs, rhythm problems, stiff dialogue. For each, quote the original EXACTLY as it appears in the draft (verbatim, so it can be found and replaced), give your suggested replacement, and a brief reason. Don't touch what already works. Return JSON.`, { schema: this.schema, system: LINE_EDITOR, long: stripHtml(n.content).length > 30000 });
    },
  },
};

// ---- story check ----------------------------------------------------------------------

export const STORY_ISSUES = ['plot hole', 'continuity', 'dropped thread', 'motivation', 'timeline', 'setup without payoff', 'pacing', 'other'];

// The manuscript for a scope, each block labelled with a short ref (B1, B2…) that the
// model can cite and the app can turn back into links.
function manuscript(p, scopeId) {
  const refs = {};
  const list = scopeId === 'root' ? flatten(p) : [{ node: p.nodes[scopeId], depth: 0 }, ...flatten(p, scopeId, 1)];
  const parts = list.map(({ node, depth }, i) => {
    const ref = `B${i + 1}`;
    refs[ref] = node.id;
    const text = stripHtml(node.content).trim();
    return [
      `${'#'.repeat(Math.min(depth + 1, 4))} [${ref}] ${TYPES[node.type].label}: ${node.title} (status: ${node.status})`,
      node.synopsis && `What happens: ${node.synopsis}`,
      node.purpose && `Why it's here: ${node.purpose}`,
      text || '(not written yet)',
    ].filter(Boolean).join('\n');
  });
  return { text: parts.join('\n\n'), refs };
}

// Roughly how many words a story check would send.
export function storyCheckSize(p, scopeId) {
  return (manuscript(p, scopeId).text.match(/\S+/g) || []).length;
}

export const storyCheck = {
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Two or three sentences: the overall state of the story logic.' },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: STORY_ISSUES },
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            title: { type: 'string', description: 'A short headline for the issue.' },
            detail: { type: 'string', description: 'What the problem is, citing specifics from the text.' },
            suggestion: { type: 'string', description: 'One concrete way to fix it.' },
            refs: { type: 'array', items: { type: 'string' }, description: 'Block refs like "B3" where the issue shows up.' },
          },
          required: ['kind', 'severity', 'title', 'detail', 'suggestion', 'refs'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'issues'],
    additionalProperties: false,
  },
  async run(s, p, scopeId) {
    const { text, refs } = manuscript(p, scopeId);
    const out = await call(s, `${bookHeader(p)}

The manuscript${scopeId === 'root' ? '' : ` (just "${p.nodes[scopeId].title}")`}, block by block. Each block has a ref in [brackets]. Unwritten blocks show only their plan.

${text}

Read this as a story editor checking the logic of the story. Find real problems a careful reader would notice: plot holes, continuity errors (names, ages, places, objects, who knows what), timeline contradictions, characters acting without believable motivation, threads or setups that are dropped or never paid off, and serious pacing problems. Consider the planned (unwritten) blocks too: say when a plan doesn't resolve something. Be specific and cite blocks by ref. Order by importance. Leave out matters of taste. If the story logic is sound, say so and return few or no issues. Return JSON.`, { schema: this.schema, long: true });
    out.issues = out.issues.map((it) => ({ ...it, ids: it.refs.map((r) => refs[r.replace(/[^\w]/g, '')]).filter(Boolean) }));
    return out;
  },
};

// ---- import ---------------------------------------------------------------------------

export const importAI = {
  // Find parts, chapters and scenes in text that has no headings to go by.
  structure: {
    schema: {
      type: 'object',
      properties: {
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['part', 'chapter', 'section'] },
              title: { type: 'string' },
              start: { type: 'integer', description: 'Number of the paragraph this block starts at.' },
            },
            required: ['type', 'title', 'start'],
            additionalProperties: false,
          },
        },
      },
      required: ['blocks'],
      additionalProperties: false,
    },
    run(s, paragraphs) {
      const listing = paragraphs.map((t, i) => {
        const words = t.split(/\s+/);
        return `${i + 1}. ${words.slice(0, 14).join(' ')}${words.length > 14 ? ` … (${words.length} words)` : ''}`;
      }).join('\n');
      return call(s, `Here is a manuscript as a numbered list of paragraphs (each shows its opening words and length):

${listing}

Divide it into parts (only if the manuscript clearly has them), chapters and sections (scenes). Start a new chapter where the text shifts to a new chapter-sized movement (a new time, place, or thread), and sections at scene changes within chapters. Give each block a short working title drawn from its content. The first block must start at paragraph 1, and starts must increase. Return JSON.`, { schema: this.schema, long: true });
    },
  },
  // Titles, synopses and purposes for imported blocks, a batch at a time.
  describe: {
    schema: {
      type: 'object',
      properties: {
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ref: { type: 'string' },
              title: { type: 'string', description: 'A short working title (keep the existing one if it is meaningful).' },
              synopsis: { type: 'string', description: 'One or two sentences: what happens.' },
              purpose: { type: 'string', description: 'One sentence: why this block matters to the whole.' },
            },
            required: ['ref', 'title', 'synopsis', 'purpose'],
            additionalProperties: false,
          },
        },
      },
      required: ['blocks'],
      additionalProperties: false,
    },
    run(s, bookTitle, batch) {
      const body = batch.map((b) => {
        const words = b.text.split(/\s+/);
        const excerpt = words.length > 700 ? `${words.slice(0, 550).join(' ')}\n[…]\n${words.slice(-150).join(' ')}` : b.text;
        return `[${b.ref}] ${b.type}: ${b.title}\n"""\n${excerpt || '(no text)'}\n"""`;
      }).join('\n\n');
      return call(s, `These blocks were just imported from the manuscript "${bookTitle}". For each, write a short working title (keep the existing title if it's meaningful, such as a real chapter name), a one- or two-sentence synopsis, and a one-sentence purpose. Match the author's vocabulary.

${body}

Return JSON with one entry per ref.`, { schema: this.schema, long: true });
    },
  },
};
