// P5 P2: Devi motion. CSS keyframes (<= 4 s, single play, only opacity/transform/stroke-dashoffset), reduced-motion
// guard, and the visibility gate (IntersectionObserver stub, no DOM needed).
const fs = require('fs');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const ts = require('typescript');
const reg = (ext) => { require.extensions[ext] = (m, filename) => { const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2019, esModuleInterop: true, resolveJsonModule: true } }); m._compile(out.outputText, filename); }; };
reg('.tsx'); reg('.ts');
const { attachPlayGate, PLAY_MS } = require(APP + '/src/components/devi/playGate.ts');
const data = JSON.parse(fs.readFileSync(APP + '/ingest/explain/devi.json', 'utf8')).devis;
const css = fs.readFileSync(APP + '/src/app/globals.css', 'utf8');
const ALLOWED = new Set(['opacity', 'transform', 'stroke-dashoffset']);

// ---- parse keyframes
const kf = {};
for (const m of css.matchAll(/@keyframes\s+(devi-[a-z0-9-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) kf[m[1]] = m[2];
const secs = (t) => (t.endsWith('ms') ? parseFloat(t) / 1000 : parseFloat(t));
const DUR = (() => { const m = /--devi-dur:\s*([\d.]+s)/.exec(css); return m ? secs(m[1]) : NaN; })();
eq('--devi-dur is 3s', DUR, 3);
check('--devi-ease defined', /--devi-ease:\s*cubic-bezier/.test(css));

// ---- animation rules: `.devi.is-playing .devi-<key>-... { animation: ... }` and animation-delay rules
const rules = [...css.matchAll(/(\.devi\.is-playing[^{]*)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
for (const d of data) {
  const key = d.key;
  const mine = rules.filter((r) => r.sel.includes('.devi-' + key + '-'));
  const anim = mine.filter((r) => /animation:/.test(r.body));
  check(key + ' has animation rules under .devi.is-playing', anim.length >= 1, mine.length);
  check(key + ' <= 6 animated parts', anim.length <= 6, anim.length);
  const names = new Set();
  let maxEnd = 0;
  for (const r of anim) {
    const a = /animation:\s*([^;]+);/.exec(r.body)[1].replace(/var\(--devi-dur\)/g, DUR + 's').replace(/var\(--devi-ease\)/g, 'EASE');
    const nm = /(devi-[a-z0-9-]+)/.exec(a)[1];
    names.add(nm);
    const times = [...a.matchAll(/(?<![\w-])([\d.]+m?s)(?![\w-])/g)].map((x) => secs(x[1]));
    const dur = times[0], delay = times[1] || 0;
    // staggered siblings add their own animation-delay
    const extra = mine.filter((q) => q !== r && !/animation:/.test(q.body) && /animation-delay/.test(q.body)).map((q) => secs(/animation-delay:\s*([\d.]+m?s)/.exec(q.body)[1]));
    maxEnd = Math.max(maxEnd, dur + Math.max(delay, 0, ...extra));
    check(key + ' ' + nm + ': iteration count 1, fill both, no infinite', /\s1\s+both/.test(a) && !/infinite/.test(a), a);
    check(key + ' ' + nm + ': keyframes exist', !!kf[nm], nm);
    if (kf[nm]) {
      const props = [...kf[nm].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]);
      check(key + ' ' + nm + ': animates only opacity/transform/stroke-dashoffset', props.length > 0 && props.every((p) => ALLOWED.has(p)), props.filter((p) => !ALLOWED.has(p)));
    }
  }
  check(key + ' total duration (incl. stagger) <= 4 s', maxEnd > 0 && maxEnd <= 4, maxEnd);
  check(key + ' keyframes prefixed devi-' + key + '-', [...names].every((n) => n.startsWith('devi-' + key + '-')), [...names]);
  check(key + ' no filter / will-change in playing rules', mine.every((r) => !/filter:|will-change/.test(r.body)));
}
check('no infinite animations anywhere in the Devi CSS', !/devi[^{]*\{[^}]*infinite/.test(css));
check('no SMIL in the marks', !/<animate/.test(['Tara', 'Kali', 'Bhuvaneshwari', 'TripuraSundari', 'Chhinnamasta', 'Kamala', 'Bhairavi', 'Bagalamukhi', 'Dhumavati', 'Matangi'].map((n) => fs.readFileSync(APP + `/src/components/devi/${n}.tsx`, 'utf8')).join('')));

console.log('— reduced motion');
const rm = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.devi,\s*\.devi \*\s*\{\s*animation:\s*none\s*!important/.test(css);
check('reduced-motion block disables every .devi animation', rm);
check('dasharray is applied only while playing (static frame is the full drawing)', !/^\.devi-[a-z-]+\s*\{[^}]*stroke-dasharray/m.test(css));

console.log('— play gate');
function harness({ reduced = false, noIO = false } = {}) {
  const log = []; let cb = null; let t = 0;
  class IO { constructor(f) { cb = f; } observe() {} disconnect() { log.push('disconnect'); } }
  const dispose = attachPlayGate({}, { IntersectionObserver: noIO ? undefined : IO, matchMedia: () => ({ matches: reduced }), setPlaying: (v) => log.push(v), now: () => t });
  const fire = (ratio, atMs) => { if (atMs != null) t = atMs; cb([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]); };
  return { log, fire, dispose, hasObserver: () => cb !== null };
}
let h = harness();
h.fire(0.2, 0); eq('under 50% visible: does not start', h.log, []);
h.fire(0.6, 10); eq('>= 50% visible: starts', h.log, [true]);
h.fire(1, 20); h.fire(0.6, 30); eq('further visible events do not restart', h.log, [true]);
h.fire(0, 1000); eq('leaves mid-play (<4 s): cancelled to the static frame', h.log, [true, false]);
h.fire(1, 2000); eq('and never replays', h.log, [true, false]);
h = harness();
h.fire(0.7, 0); h.fire(0, PLAY_MS + 100);
eq('leaves after the animation finished: nothing changes (final frame stays)', h.log, [true]);
h = harness();
h.fire(0, 0); h.fire(0.3, 10); eq('offscreen before start: never starts', h.log, []);
h = harness({ reduced: true });
check('prefers-reduced-motion: no observer, never plays', !h.hasObserver() && h.log.length === 0);
h = harness({ noIO: true });
check('no IntersectionObserver: static, never plays', !h.hasObserver() && h.log.length === 0);
h = harness(); h.dispose(); eq('dispose disconnects the observer', h.log, ['disconnect']);
eq('PLAY_MS covers the longest animation', PLAY_MS, 4000);
done('p5_motion');
