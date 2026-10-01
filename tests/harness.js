// A tiny test harness: no installs, runs in the browser (open tests/index.html).

const suites = [];
let current = null;

export function describe(name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

export function it(name, fn) {
  current.tests.push({ name, fn });
}

export const assert = {
  ok(v, msg = 'expected a truthy value') { if (!v) throw new Error(msg); },
  equal(a, b, msg) { if (a !== b) throw new Error(msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
  deepEqual(a, b, msg) {
    const x = JSON.stringify(a);
    const y = JSON.stringify(b);
    if (x !== y) throw new Error(msg || `expected ${y}, got ${x}`);
  },
  throws(fn, msg = 'expected an error') { try { fn(); } catch { return; } throw new Error(msg); },
};

export async function run(root) {
  const results = [];
  for (const s of suites) {
    for (const t of s.tests) {
      try {
        await t.fn();
        results.push({ suite: s.name, name: t.name, ok: true });
      } catch (e) {
        results.push({ suite: s.name, name: t.name, ok: false, error: e.message });
      }
    }
  }
  const failed = results.filter((r) => !r.ok);
  document.title = failed.length ? `✗ ${failed.length} failed` : `✓ ${results.length} passed`;
  root.innerHTML = `<h1>${document.title}</h1>` + suites.map((s) => `<section><h2>${s.name}</h2><ul>${results
    .filter((r) => r.suite === s.name)
    .map((r) => `<li class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `<pre>${r.error}</pre>`}</li>`).join('')}</ul></section>`).join('');
  window.__results = { passed: results.length - failed.length, failed: failed.map((f) => `${f.suite} › ${f.name}: ${f.error}`) };
  return window.__results;
}
