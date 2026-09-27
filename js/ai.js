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

async function call(settings, prompt, { schema } = {}) {
  const c = await client(settings.apiKey);
  const isOpus = settings.model === 'claude-opus-5';
  const req = {
    model: settings.model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', ...(schema && { format: { type: 'json_schema', schema } }) },
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  };
  if (isOpus) {
    // If a request is declined by a safety classifier, retry it on
    // Anthropic's recommended fallback model instead of failing.
    req.betas = ['server-side-fallback-2026-07-01'];
    req.fallbacks = 'default';
  }
  const res = await c.beta.messages.create(req);
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
