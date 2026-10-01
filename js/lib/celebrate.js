// A small burst of confetti in the current skin's colours. Skipped entirely for
// people who've asked their system for reduced motion.

const reduced = matchMedia('(prefers-reduced-motion: reduce)');

export function confetti({ x = innerWidth / 2, y = innerHeight / 3, count = 90, spread = 1 } = {}) {
  if (reduced.matches) return;
  const css = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--s-done', '--s-drafting', '--s-outlined', '--s-revising', '--t-part']
    .map((v) => css.getPropertyValue(v).trim()).filter(Boolean);

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  document.body.append(canvas);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);

  const bits = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9 * spread;
    const v = 6 + Math.random() * 7;
    return {
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      w: 5 + Math.random() * 5, h: 8 + Math.random() * 6,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      c: colors[(Math.random() * colors.length) | 0],
      round: Math.random() < 0.3,
    };
  });

  const start = performance.now();
  const frame = (now) => {
    const t = (now - start) / 1000;
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1.6) / 0.8);
    for (const b of bits) {
      b.vy += 0.28; b.vx *= 0.985; b.vy *= 0.985;
      b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.r);
      g.fillStyle = b.c;
      if (b.round) { g.beginPath(); g.arc(0, 0, b.w / 2, 0, Math.PI * 2); g.fill(); }
      else g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)));
      g.restore();
    }
    if (t < 2.4) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
