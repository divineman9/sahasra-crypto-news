// P5 P1: the ten Devi marks (static frames), devi.json mapping, CSS colour tokens (dark + light).
const fs = require('fs'), path = require('path');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const reg = (ext) => { require.extensions[ext] = (m, filename) => { const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2019, esModuleInterop: true, resolveJsonModule: true } }); m._compile(out.outputText, filename); }; };
reg('.tsx'); reg('.ts');
const { DEVI, DEVI_BY_KEY } = require(APP + '/src/components/devi/index.ts');
const { DeviMark } = require(APP + '/src/components/devi/DeviMark.tsx');
const data = JSON.parse(fs.readFileSync(APP + '/ingest/explain/devi.json', 'utf8'));

console.log('— devi.json mapping');
eq('10 entries', data.devis.length, 10);
eq('registry has the same 10', DEVI.map((d) => d.key), data.devis.map((d) => d.key));
eq('spec lenses in order', data.devis.map((d) => d.lens), ['Understand this', 'What changes?', 'Wider context', 'Putting it together', 'Trade-offs', 'Who is affected?', 'What deserves attention?', 'Pauses and restrictions', 'What remains uncertain?', 'Terms and voices']);
eq('spec Devi names in order', data.devis.map((d) => d.name), ['Tara', 'Kali', 'Bhuvaneshwari', 'Tripura Sundari', 'Chhinnamasta', 'Kamala', 'Bhairavi', 'Bagalamukhi', 'Dhumavati', 'Matangi']);
const BAD = /\b(hack|hacks|crash|failure|loss|gain|gains|bull|bear|buy|sell)\b/i;
for (const d of data.devis) {
  check(d.key + ' has lens/tooltip/meaning/iast/colours', d.lens && d.tooltip && d.meaning && d.iast && d.colours && d.colours.dark && d.colours.light && d.colours.accentDark && d.colours.accentLight, d);
  check(d.key + ' tooltip starts "Inspired by"', /^Inspired by /.test(d.tooltip) && /a contemporary editorial interpretation\.$/.test(d.tooltip), d.tooltip);
  check(d.key + ' text has no market/loaded words', ![d.lens, d.tooltip, d.meaning, d.emblem, d.name].some((x) => BAD.test(x)), d);
}
eq('spec example tooltip (Dhumavati) verbatim', data.devis[8].tooltip, "Inspired by Dhumavati's association with endurance through uncertainty; a contemporary editorial interpretation.");
eq('spec colours: Tara', [data.devis[0].colours.dark, data.devis[0].colours.light, data.devis[0].colours.accentDark], ['#2f6bff', '#1d4ed8', '#c9d1e0']);
eq('spec colours: Kali', [data.devis[1].colours.dark, data.devis[1].colours.light, data.devis[1].colours.accentDark], ['#5b6ad0', '#2a3a8c', '#c81e45']);
eq('spec colours: Matangi', [data.devis[9].colours.dark, data.devis[9].colours.light], ['#19c37d', '#0f8a58']);

console.log('— rendering');
const html = (el) => renderToStaticMarkup(el);
for (const d of DEVI) {
  const key = d.key;
  const svg = html(React.createElement(d.Component, { size: 64 }));
  check(key + ' is an inline <svg>', svg.startsWith('<svg') && svg.endsWith('</svg>'), svg.slice(0, 40));
  check(key + ' aria-hidden="true"', svg.includes('aria-hidden="true"'));
  check(key + ' viewBox 0 0 64 64', svg.includes('viewBox="0 0 64 64"'));
  check(key + ' no href / image / text / use / script', !/href=|<image|<text|<use|<script|<foreignObject/i.test(svg), svg.match(/href=|<image|<text|<use|<script/i));
  check(key + ' no Devanagari, no NaN/undefined', !/[\u0900-\u097F]/.test(svg) && !/NaN|undefined/.test(svg));
  const ids = [...svg.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
  check(key + ' ids prefixed devi-' + key + '-', ids.every((i) => i.startsWith('devi-' + key + '-')), ids);
  check(key + ' class devi devi-' + key, new RegExp('class="devi devi-' + key + '[" ]').test(svg));
  check(key + ' no <title> child (would mask the tooltip), has data-name', !/<title/.test(svg) && /data-name="[^"]+"/.test(svg));
  check(key + ' parts use the devi-' + key + '- class prefix', (svg.match(new RegExp('devi-' + key + '-', 'g')) || []).length >= 2);
  check(key + ' stroke-only default (fill none) + currentColor', svg.includes('fill="none"') && svg.includes('stroke="currentColor"'));
  // crude clipping check: absolute-coordinate paths (no arcs, no transform) stay inside the 64 box
  const bad = [];
  for (const m of svg.matchAll(/<path ([^>]*?)\/?>/g)) {
    const attrs = m[1];
    const dm = /\sd="([^"]+)"/.exec(' ' + attrs);
    if (!dm || /transform=/.test(attrs) || /[AaMLCSQmlcsq]/.test(dm[1].replace(/[MLCSQHVZ]/g, '')) || /A/.test(dm[1])) continue;
    for (const n of dm[1].match(/-?\d+(\.\d+)?/g) || []) if (+n < 0 || +n > 64) bad.push(n);
  }
  check(key + ' absolute coordinates inside viewBox', bad.length === 0, bad);
  for (const s of [16, 18, 40]) {
    const sv = html(React.createElement(d.Component, { size: s }));
    check(key + ' renders at ' + s + ' px', sv.includes(`width="${s}"`) && sv.includes(`height="${s}"`));
  }
  check(key + ' stroke thicker at small sizes (stays ~1px)', html(React.createElement(d.Component, { size: 16 })).includes('stroke-width="3.2"') && svg.includes('stroke-width="1.5"'));
  check(key + ' play adds is-playing only when asked', html(React.createElement(d.Component, { play: true })).includes('is-playing') && !svg.includes('is-playing'));
}
const mark = html(React.createElement(DeviMark, { devi: 'dhumavati', size: 18 }));
check('DeviMark tooltip = "Inspired by" line + meaning line', mark.includes('Inspired by Dhumavati') && mark.includes('Endurance when things are unclear.'), mark.slice(0, 200));
eq('DEVI_BY_KEY lookup', DEVI_BY_KEY.kali.name, 'Kali');

console.log('— CSS tokens');
const css = fs.readFileSync(APP + '/src/app/globals.css', 'utf8');
const idx = (s) => css.indexOf(s);
check('light overrides exist (data-theme + prefers-color-scheme)', idx('[data-theme="light"]') > 0 && idx('prefers-color-scheme: light') > 0);
for (const d of data.devis) {
  const hexes = [d.colours.dark, d.colours.light, d.colours.accentDark, d.colours.accentLight];
  check(d.key + ' tokens in globals.css (both themes)', css.includes(`--devi-${d.key}:`) && css.includes(`--devi-${d.key}-2:`) && hexes.every((h) => css.toLowerCase().includes(h.toLowerCase())), hexes);
  check(d.key + ' .devi-' + d.key + ' colour rule', css.includes(`.devi-${d.key}`));
}
done('p5_devi');
