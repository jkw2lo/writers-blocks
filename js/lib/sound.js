// Typewriter sounds, synthesized with the Web Audio API: no audio files, so they
// work offline and cost nothing to load. Every strike is slightly randomized so
// fast typing doesn't sound like a machine gun.

let ctx = null;
let noise = null;
let out = null;

function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  out = ctx.createGain();
  out.connect(ctx.destination);
  // one second of white noise, reused for every strike
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

const jitter = (v, amt) => v * (1 + (Math.random() * 2 - 1) * amt);

// A filtered noise burst: the "clack" of a typebar hitting the platen.
function burst(t, { freq, q = 1.2, gain, dur }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(out);
  src.start(t, Math.random() * 0.9, dur + 0.02);
}

// A short decaying tone: the body "thunk" underneath the clack.
function tone(t, { freq, gain, dur, type = 'sine', endFreq }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function key(t) {
  burst(t, { freq: jitter(3200, 0.25), gain: jitter(0.55, 0.2), dur: 0.035 });
  burst(t + 0.006, { freq: jitter(900, 0.2), q: 0.8, gain: jitter(0.25, 0.2), dur: 0.05 });
  tone(t, { freq: jitter(150, 0.15), endFreq: 70, gain: 0.35, dur: 0.06 });
}

function space(t) {
  burst(t, { freq: jitter(1400, 0.15), q: 0.7, gain: 0.45, dur: 0.06 });
  tone(t, { freq: jitter(95, 0.1), endFreq: 55, gain: 0.45, dur: 0.09 });
}

function backspace(t) {
  burst(t, { freq: jitter(4200, 0.2), gain: 0.3, dur: 0.025 });
  burst(t + 0.05, { freq: jitter(2600, 0.2), gain: 0.2, dur: 0.025 });
}

function bell(t, gain = 0.28) {
  tone(t, { freq: 2093, gain, dur: 1.4, type: 'sine' });
  tone(t, { freq: 5280, gain: gain * 0.35, dur: 0.7, type: 'sine' });
  tone(t, { freq: 3136, gain: gain * 0.2, dur: 0.9, type: 'sine' });
}

// Enter: the bell, then the carriage ratcheting back.
function carriageReturn(t) {
  bell(t);
  for (let i = 0; i < 9; i++) burst(t + 0.12 + i * 0.028, { freq: jitter(2400, 0.2), gain: 0.18 + i * 0.012, dur: 0.018 });
  burst(t + 0.39, { freq: 700, q: 0.6, gain: 0.5, dur: 0.09 });
  tone(t + 0.39, { freq: 110, endFreq: 60, gain: 0.4, dur: 0.12 });
}

const SOUNDS = { key, space, backspace, enter: carriageReturn, bell: (t) => bell(t, 0.35) };

let lastAt = 0;
export function play(kind, volume = 0.5) {
  if (!audio()) return;
  if (ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime;
  if (kind === 'key' && t - lastAt < 0.018) return; // key repeat: don't pile up
  lastAt = t;
  out.gain.value = Math.max(0, Math.min(1, volume)) * 0.9;
  SOUNDS[kind]?.(t + 0.001);
}

// Which sound a keydown should make, or null.
export function soundForKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === 'Enter') return 'enter';
  if (e.key === ' ') return 'space';
  if (e.key === 'Backspace' || e.key === 'Delete') return 'backspace';
  if (e.key.length === 1) return 'key';
  return null;
}
