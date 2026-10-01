import { h, icon, toast } from '../core/dom.js';
import { prefs, savePrefs, state } from '../core/state.js';
import { select } from '../project/commands.js';
import { MOD } from '../project/files.js';
import { openSettings } from './settings.js';
import { render } from './shell.js';
import { renderMapOnly } from '../views/map.js';

// ---- skins ---------------------------------------------------------------------------
// Tokens and signature touches live in css/themes.css; these swatches only draw the picker.

export const SKINS = [
  { id: 'studio', name: 'Studio', vibe: 'Warm paper, bookish serif', bg: '#f5f0e6', card: '#fffdf8', ink: '#2a2520', accent: '#b4532a', font: "'Literata', serif", type: { prose: 'Literata', display: 'Literata', ui: 'Inter', leading: 1.75 } },
  { id: 'minimal', name: 'Minimal', vibe: 'Sleek, modern, quiet', bg: '#fafafa', card: '#ffffff', ink: '#0a0a0b', accent: '#111113', font: "'Geist', sans-serif", type: { prose: 'Geist', display: 'Geist', ui: 'Geist', leading: 1.8 } },
  { id: 'typewriter', name: 'Typewriter', vibe: 'Inked paper, ribbon red', bg: '#e6dfcd', card: '#f7f2e4', ink: '#211f1b', accent: '#b0302a', font: "'Special Elite', monospace", type: { prose: 'Courier Prime', display: 'Special Elite', ui: 'IBM Plex Mono', leading: 1.85 } },
  { id: 'nocturne', name: 'Nocturne', vibe: '2am, candlelit. Always dark', bg: '#0d1019', card: '#141925', ink: '#ebe4d6', accent: '#e8ae5b', font: "'Cormorant Garamond', serif", dark: true, type: { prose: 'EB Garamond', display: 'Cormorant Garamond', ui: 'Inter', leading: 1.7 } },
  { id: 'meadow', name: 'Meadow', vibe: 'Soft, cosy, a little dreamy', bg: '#f4f2e8', card: '#fffdf7', ink: '#2c3327', accent: '#c25e68', font: "'Fraunces', serif", type: { prose: 'Lora', display: 'Fraunces', ui: 'Nunito Sans', leading: 1.8 } },
];
export const skinOf = () => SKINS.find((k) => k.id === prefs.skin) || SKINS[0];
export const darkQuery = matchMedia('(prefers-color-scheme: dark)');

export function applyTheme(animate = false) {
  const d = document.documentElement;
  const dark = skinOf().dark || prefs.theme === 'dark' || (prefs.theme === 'auto' && darkQuery.matches);
  if (animate) {
    d.classList.add('skin-switching');
    clearTimeout(applyTheme.t);
    applyTheme.t = setTimeout(() => d.classList.remove('skin-switching'), 400);
  }
  d.dataset.skin = skinOf().id;
  d.dataset.mode = dark ? 'dark' : 'light';
  applyType();
  requestAnimationFrame(refitTextareas);
  document.querySelectorAll('.skin-opt').forEach((b) => b.classList.toggle('on', b.dataset.skin === prefs.skin));
  document.querySelectorAll('.mode-control').forEach((c) => c.replaceWith(modeControl()));
  document.querySelectorAll('.type-controls').forEach((c) => c.replaceWith(typeControls()));
}
darkQuery.addEventListener('change', () => applyTheme(true));
// A new skin brings new fonts: re-measure auto-growing textareas when they arrive.
export const refitTextareas = () => document.querySelectorAll('textarea[data-autogrow]').forEach((t) => t.fit?.());
document.fonts?.addEventListener('loadingdone', refitTextareas);
document.fonts?.addEventListener('loadingdone', () => { if (state.project && state.view === 'map' && !document.querySelector('.map-rename')) renderMapOnly(); });

export function setSkin(id) { prefs.skin = id; savePrefs(); applyTheme(true); }

export function skinPicker({ compact = false } = {}) {
  return h('div', { class: `skin-picker ${compact ? 'compact' : ''}`, role: 'radiogroup', 'aria-label': 'Skin' },
    SKINS.map((k) => h('button', {
      class: `skin-opt ${prefs.skin === k.id ? 'on' : ''}`, 'data-skin': k.id, role: 'radio', title: k.vibe,
      'aria-checked': String(prefs.skin === k.id),
      onclick: () => setSkin(k.id),
    },
      h('span', { class: 'skin-swatch', style: `--sw-bg:${k.bg};--sw-card:${k.card};--sw-ink:${k.ink};--sw-accent:${k.accent};--sw-font:${k.font}` },
        h('span', { class: 'sw-card' }, h('b', null, 'Aa'), h('i'), h('i'))),
      h('span', { class: 'skin-name' }, k.name),
      !compact && h('span', { class: 'skin-vibe' }, k.vibe))));
}

export function modeControl() {
  const forced = skinOf().dark;
  return h('div', { class: 'seg-control mode-control', title: forced ? `${skinOf().name} is always dark` : '' },
    [['auto', 'Auto'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']].map(([v, l, ic]) => h('button', {
      class: prefs.theme === v && !forced ? 'active' : '', disabled: forced,
      onclick: () => { prefs.theme = v; savePrefs(); applyTheme(true); },
    }, ic && icon(ic), l)));
}

export function lookMenu() {
  return h('details', { class: 'menu look' },
    h('summary', { class: 'icon-btn', title: 'Look & feel' }, icon('palette')),
    h('div', { class: 'menu-pop right look-pop' },
      h('div', { class: 'eyebrow' }, 'Skin'),
      skinPicker(),
      h('div', { class: 'look-foot' }, h('span', { class: 'eyebrow' }, 'Mode'), modeControl()),
      h('button', { class: 'link look-fonts', onclick: (e) => { e.target.closest('details').open = false; openSettings({ scrollTo: 'type' }); } }, 'Change fonts & spacing…')));
}
// ---- type ------------------------------------------------------------------------------
// Each skin has its own fonts, but writers can swap any of the three (writing, headings,
// interface) and the line spacing, per skin. Overrides are set as inline custom properties
// on <html>, which beat the skin's tokens. Fonts not already in index.html load on demand
// (and the service worker keeps them for offline use).

export const GF = 'https://fonts.googleapis.com/css2?display=swap&family=';
export const FONTS = [
  // name, group, Google Fonts spec (null: already loaded by index.html), size scale for prose, heading weight
  { name: 'Literata', group: 'Serif', w: 600 },
  { name: 'Lora', group: 'Serif', w: 600 },
  { name: 'EB Garamond', group: 'Serif', scale: 1.1, w: 600 },
  { name: 'Crimson Pro', group: 'Serif', spec: 'Crimson+Pro:ital,wght@0,400;0,600;1,400', scale: 1.1, w: 600 },
  { name: 'Source Serif 4', group: 'Serif', spec: 'Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400', w: 600 },
  { name: 'Newsreader', group: 'Serif', spec: 'Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400', scale: 1.04, w: 600 },
  { name: 'Spectral', group: 'Serif', spec: 'Spectral:ital,wght@0,400;0,600;1,400', w: 600 },
  { name: 'Libre Baskerville', group: 'Serif', spec: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400', scale: .92, w: 700 },
  { name: 'Merriweather', group: 'Serif', spec: 'Merriweather:ital,wght@0,400;0,700;1,400', scale: .92, w: 700 },
  { name: 'Inter', group: 'Sans', scale: .95, w: 600 },
  { name: 'Geist', group: 'Sans', scale: .95, w: 600 },
  { name: 'Nunito Sans', group: 'Sans', w: 700 },
  { name: 'DM Sans', group: 'Sans', spec: 'DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;1,9..40,400', scale: .97, w: 600 },
  { name: 'Atkinson Hyperlegible', group: 'Sans', spec: 'Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400', note: 'designed for legibility', w: 700 },
  { name: 'Lexend', group: 'Sans', spec: 'Lexend:wght@400;600', note: 'designed for easier reading', scale: .93, w: 600 },
  { name: 'Space Grotesk', group: 'Sans', spec: 'Space+Grotesk:wght@400;600', scale: .95, w: 600 },
  { name: 'Courier Prime', group: 'Mono', scale: .9, w: 700 },
  { name: 'IBM Plex Mono', group: 'Mono', scale: .88, w: 600 },
  { name: 'JetBrains Mono', group: 'Mono', spec: 'JetBrains+Mono:ital,wght@0,400;0,600;1,400', scale: .88, w: 600 },
  { name: 'Space Mono', group: 'Mono', spec: 'Space+Mono:ital,wght@0,400;0,700;1,400', scale: .88, w: 700 },
  { name: 'Fraunces', group: 'Display', w: 500 },
  { name: 'Cormorant Garamond', group: 'Display', scale: 1.15, w: 600 },
  { name: 'Playfair Display', group: 'Display', spec: 'Playfair+Display:ital,wght@0,400;0,600;1,400', w: 600 },
  { name: 'DM Serif Display', group: 'Display', spec: 'DM+Serif+Display:ital@0;1', w: 400 },
  { name: 'Instrument Serif', group: 'Display', spec: 'Instrument+Serif:ital@0;1', scale: 1.1, w: 400 },
  { name: 'Special Elite', group: 'Display', scale: .9, w: 400 },
  { name: 'Caveat', group: 'Handwritten', spec: 'Caveat:wght@400;600', scale: 1.3, w: 600 },
  { name: 'Patrick Hand', group: 'Handwritten', spec: 'Patrick+Hand', scale: 1.1, w: 400 },
];
export const GENERIC = { Serif: 'Georgia, serif', Sans: 'system-ui, sans-serif', Mono: 'ui-monospace, Menlo, monospace', Display: 'Georgia, serif', Handwritten: 'cursive' };
export const fontOf = (name) => FONTS.find((f) => f.name === name);
export const stack = (f) => `'${f.name}', ${GENERIC[f.group]}`;
export const TYPE_SLOTS = [
  ['prose', 'Writing', 'Your draft, synopses and notes'],
  ['display', 'Headings', 'Titles and headings'],
  ['ui', 'Interface', 'Buttons, labels and menus'],
];

// The CSS for the current skin's overrides. Kept in prefs so index.html can apply it before first paint.
export function typeCss() {
  const t = prefs.type[prefs.skin] || {};
  const vars = {};
  const hrefs = [];
  const use = (name) => { const f = fontOf(name); if (f?.spec) hrefs.push(GF + f.spec); return f; };
  const prose = t.prose && use(t.prose);
  if (prose) Object.assign(vars, { '--serif': stack(prose), '--prose-scale': String(prose.scale || 1) });
  const display = t.display && use(t.display);
  if (display) Object.assign(vars, { '--display': stack(display), '--display-w': String(display.w) });
  const ui = t.ui && use(t.ui);
  if (ui) Object.assign(vars, { '--ui': stack(ui), '--ui-size': ui.group === 'Mono' ? '13px' : '14px' });
  if (t.leading) vars['--prose-leading'] = String(t.leading);
  return { vars, hrefs };
}

export const TYPE_VARS = ['--serif', '--prose-scale', '--display', '--display-w', '--ui', '--ui-size', '--prose-leading'];
export function applyType() {
  const css = typeCss();
  const st = document.documentElement.style;
  TYPE_VARS.forEach((v) => st.removeProperty(v));
  Object.entries(css.vars).forEach(([k, v]) => st.setProperty(k, v));
  css.hrefs.forEach(loadFontCss);
  if (JSON.stringify(css) !== JSON.stringify(prefs.typeCss)) { prefs.typeCss = css; savePrefs(); }
  requestAnimationFrame(refitTextareas);
}

export function loadFontCss(href) {
  if ([...document.querySelectorAll('link[data-font]')].some((l) => l.href === href)) return;
  document.head.append(h('link', { rel: 'stylesheet', href, 'data-font': '' }));
}

export function setType(slot, value) {
  const t = { ...(prefs.type[prefs.skin] || {}) };
  if (value == null || value === '') delete t[slot]; else t[slot] = value;
  prefs.type = { ...prefs.type, [prefs.skin]: t };
  savePrefs();
  applyType();
  document.querySelectorAll('.type-controls').forEach((c) => c.replaceWith(typeControls()));
}

export function typeControls() {
  const k = skinOf();
  const t = prefs.type[k.id] || {};
  const groups = [...new Set(FONTS.map((f) => f.group))];
  const select = (slot) => h('select', { onchange: (e) => setType(slot, e.target.value) },
    h('option', { value: '' }, `${k.name} default (${k.type[slot]})`),
    groups.map((g) => h('optgroup', { label: g },
      FONTS.filter((f) => f.group === g).map((f) => h('option', { value: f.name, selected: t[slot] === f.name }, f.note ? `${f.name}, ${f.note}` : f.name)))));
  const leading = t.leading || k.type.leading;
  const custom = Object.keys(t).length > 0;
  return h('div', { class: 'type-controls', id: 'type' },
    h('div', { class: 'type-head' },
      h('span', { class: 'eyebrow' }, `Fonts for ${k.name}`),
      custom && h('button', { class: 'link', onclick: () => { prefs.type = { ...prefs.type, [k.id]: {} }; setType('prose', null); } }, 'Reset to skin defaults')),
    h('div', { class: 'type-sample' },
      h('strong', null, 'Chapter One: The Crossing'),
      h('p', null, 'The ferry left before the light did, which suited her. She stood at the rail, rehearsing the sentence she would say on Monday.')),
    h('div', { class: 'kv' },
      TYPE_SLOTS.map(([slot, label, hint]) => [h('label', { title: hint }, label), select(slot)]),
      h('label', null, 'Line spacing'),
      h('div', { class: 'range-row' },
        h('input', { type: 'range', min: 1.3, max: 2.3, step: 0.05, value: leading, oninput: (e) => {
          const v = +e.target.value;
          const t2 = { ...(prefs.type[k.id] || {}) };
          if (Math.abs(v - k.type.leading) < 0.001) delete t2.leading; else t2.leading = v;
          prefs.type = { ...prefs.type, [k.id]: t2 };
          savePrefs(); applyType();
          e.target.nextSibling.textContent = v.toFixed(2);
        } }),
        h('span', { class: 'range-val' }, leading.toFixed(2)))));
}

export function toggleBinder() {
  prefs.binder = !prefs.binder;
  savePrefs();
  render();
  if (!prefs.binder) toast(`Outline tucked away. Click the tab on the left (or ${MOD}⇧\\) to bring it back.`);
}

export function toggleInspector() {
  prefs.inspector = !prefs.inspector;
  savePrefs();
  render();
  toast(prefs.inspector ? 'Side panel is back.' : `Side panel hidden. ${MOD}\\ or the panel button brings it back.`);
}

export function toggleFocus() {
  state.focus = !state.focus;
  if (state.focus && state.view !== 'write') state.view = 'write';
  render();
  if (state.focus) toast('Focus mode. Press Esc to exit.');
}
