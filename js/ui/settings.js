import * as AI from '../lib/ai.js';
import { confetti } from '../lib/celebrate.js';
import * as Sound from '../lib/sound.js';
import { h, icon } from '../core/dom.js';
import { P, prefs, savePrefs, sessionKey, setSessionKey, state } from '../core/state.js';
import * as S from '../lib/storage.js';
import { KEEP, backupNow, chooseBackupDir, currentBackups, turnOffBackups } from '../project/backups.js';
import { serialize } from '../project/files.js';
import { select } from '../project/commands.js';
import { suggestions } from '../project/flow.js';
import { render } from './shell.js';
import { modeControl, skinPicker, typeControls } from './theme.js';
import { setWritingPref } from './writing-aids.js';

// ---- settings ------------------------------------------------------------------------

export function openSettings({ scrollTo } = {}) {
  const dlg = h('dialog', { class: 'settings' });
  const keyInput = h('input', { type: 'password', value: sessionKey, placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: false });
  const close = () => { dlg.close(); dlg.remove(); render(); };
  dlg.append(
    h('div', { class: 'dlg-head' }, h('h2', null, 'Settings'), h('button', { class: 'icon-btn', onclick: close, title: 'Close' }, icon('close'))),
    h('h3', null, 'Appearance'),
    skinPicker(),
    h('div', { class: 'kv' },
      h('label', null, 'Mode'), modeControl(),
      h('label', null, 'Text size'),
      h('input', { type: 'range', min: 15, max: 24, value: prefs.fontSize, oninput: (e) => { prefs.fontSize = +e.target.value; savePrefs(); document.documentElement.style.setProperty('--editor-size', `${prefs.fontSize}px`); } })),
    typeControls(),
    h('h3', null, 'Daily backups'),
    backupSettings(),
    h('h3', null, 'Writing'),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.spellcheck, onchange: (e) => { prefs.spellcheck = e.target.checked; savePrefs(); document.querySelectorAll('.editor').forEach((x) => (x.spellcheck = prefs.spellcheck)); } }),
      h('span', null, h('strong', null, 'Check spelling as I type'), h('br'), h('span', { class: 'muted small' }, 'Uses your browser’s own dictionary: misspellings get a red underline, and right-click shows suggestions. Works offline.'))),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.sounds, onchange: (e) => setWritingPref('sounds', e.target.checked) }),
      h('span', null, h('strong', null, 'Typing sounds'), h('br'), h('span', { class: 'muted small' }, 'Typewriter clacks as you type, and a bell with the carriage return on Enter.'))),
    h('div', { class: 'kv indent' },
      h('label', null, 'Volume'),
      h('div', { class: 'range-row' },
        h('input', { type: 'range', min: 0.05, max: 1, step: 0.05, value: prefs.soundVolume, oninput: (e) => { prefs.soundVolume = +e.target.value; savePrefs(); }, onchange: () => Sound.play('key', prefs.soundVolume) }),
        h('button', { class: 'btn small', onclick: () => { Sound.play('key', prefs.soundVolume); setTimeout(() => Sound.play('key', prefs.soundVolume), 120); setTimeout(() => Sound.play('enter', prefs.soundVolume), 300); } }, 'Try it'))),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.typewriterScroll, onchange: (e) => setWritingPref('typewriterScroll', e.target.checked) }),
      h('span', null, h('strong', null, 'Typewriter scrolling'), h('br'), h('span', { class: 'muted small' }, 'Keeps the line you’re writing in the middle of the screen.'))),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.fadeRest, onchange: (e) => setWritingPref('fadeRest', e.target.checked) }),
      h('span', null, h('strong', null, 'Fade the rest'), h('br'), h('span', { class: 'muted small' }, 'Dims every paragraph except the one you’re writing.'))),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.celebrate, onchange: (e) => { prefs.celebrate = e.target.checked; savePrefs(); } }),
      h('span', null, h('strong', null, 'Celebrations & milestones'), h('br'), h('span', { class: 'muted small' }, 'A little confetti when you hit a word target, finish a block, or pass a milestone.'))),
    h('p', { class: 'muted small' }, 'The first three are also buttons on the writing toolbar, so you can flip them any time.'),
    h('h3', null, 'AI assistant ', h('span', { class: 'muted small' }, '(optional)')),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.aiEnabled, onchange: (e) => { prefs.aiEnabled = e.target.checked; savePrefs(); } }),
      'Turn on the assistant'),
    h('p', { class: 'muted small' },
      'The assistant acts as a developmental editor: it asks questions and suggests directions, but doesn’t write for you. It uses your own ',
      h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener' }, 'Anthropic API key'),
      '. Your text goes straight from this browser to Anthropic, and only when you click an assistant action.'),
    h('div', { class: 'kv' },
      h('label', null, 'API key'), keyInput,
      h('label', null, 'Model'),
      h('select', { onchange: (e) => { prefs.model = e.target.value; savePrefs(); } },
        AI.MODELS.map((m) => h('option', { value: m.id, selected: prefs.model === m.id }, m.label)))),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: prefs.rememberKey, onchange: (e) => { prefs.rememberKey = e.target.checked; savePrefs(); } }),
      'Remember the key on this device (otherwise it’s forgotten when you close the tab)'),
    h('div', { class: 'dlg-foot' }, h('button', { class: 'btn primary', onclick: close }, 'Done')),
  );
  keyInput.addEventListener('input', () => { setSessionKey(keyInput.value.trim()); prefs.apiKey = sessionKey; savePrefs(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  if (scrollTo) dlg.querySelector(`#${scrollTo}`)?.scrollIntoView({ block: 'start' });
}

// ---- daily backups ---------------------------------------------------------------------

function backupSettings() {
  const box = h('div', { class: 'backup-settings' });
  const paint = async () => {
    if (!S.canBackup) {
      box.replaceChildren(h('p', { class: 'muted small' }, 'Daily backups need Chrome, Edge, Arc or Brave, which can write files to your disk. In this browser, use File → Download a backup copy now and then.'));
      return;
    }
    if (!state.backupDir) {
      box.replaceChildren(
        h('p', { class: 'muted small' }, `Choose a folder, and at the start of each day you write, a copy of your project as it stood at the end of your last writing day is saved there. The ${KEEP} most recent days are kept for each project; older copies are removed. A backup is an ordinary project file: to restore one, use File → Open….`),
        h('button', { class: 'btn small', onclick: async () => { if (await chooseBackupDir()) paint(); } }, 'Choose a backups folder…'));
      return;
    }
    const copies = await currentBackups();
    box.replaceChildren(
      h('p', { class: 'small' }, `Backing up to “${state.backupDir.name}”. The ${KEEP} most recent days are kept for each project.`),
      copies === null
        ? h('p', { class: 'muted small' }, 'The browser will ask to use the folder again the next time a backup is due.')
        : copies.length
          ? h('ul', { class: 'backup-list' }, copies.map((c) => h('li', null, icon('check'), c.name)))
          : P() && h('p', { class: 'muted small' }, 'No copies of this project yet. The first one is made at the start of your next writing day.'),
      h('div', { class: 'actions' },
        P() && h('button', { class: 'btn small', onclick: async () => { await backupNow(serialize()); paint(); } }, 'Back up now'),
        h('button', { class: 'btn small ghost', onclick: async () => { if (await chooseBackupDir()) paint(); } }, 'Change folder…'),
        h('button', { class: 'btn small danger-ghost', onclick: async () => { await turnOffBackups(); paint(); } }, 'Turn off')));
  };
  paint();
  return box;
}
