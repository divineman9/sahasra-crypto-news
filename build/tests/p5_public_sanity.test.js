// P5 P3 (private only): the public tree must not contain private data, keys or private-only references.
// Run against PUBLIC_TREE (default: D:/claude projects/sahasra-public). Skips cleanly if the tree is absent.
const fs = require('fs'), path = require('path');
const { check, eq, done } = require('./assert_lib');
const PUB = process.env.PUBLIC_TREE || 'D:/claude projects/sahasra-public';
if (!fs.existsSync(PUB)) { console.log('  SKIP: public tree not found'); done('p5_public_sanity'); }

// What would be published: tracked + untracked-but-not-ignored files only.
const files = require('child_process').execSync('git ls-files -co --exclude-standard', { cwd: PUB, encoding: 'utf8', maxBuffer: 64e6 })
  .split(/\r?\n/).filter(Boolean).map((r) => path.join(PUB, r)).filter((p) => fs.existsSync(p));
const rel = (p) => path.relative(PUB, p).replace(/\\/g, '/');

console.log('— forbidden files are absent');
const FORBID = [/(^|\/)base_rates\.seed\.json$/, /(^|\/)forward_log\.jsonl?$/, /glm_rewrite/i, /(^|\/)(glm_|rewrite_)cache\.json$/, /(^|\/)build\//, /\.bak/, /(^|\/)(RESUME|HANDOFF)[^/]*\.md$/i, /(^|\/)agents\.py$/, /events_live/i];
const bad = files.map(rel).filter((r) => FORBID.some((re) => re.test(r)) && !/(^|\/)ingest\/cache\//.test(r));
eq('no seed / forward log / rewrite worker / build / bak / handoff files', bad, []);
check('no real .env committed', !files.map(rel).some((r) => /(^|\/)\.env$/.test(r)), null);

const TEXT = /\.(ts|tsx|js|mjs|json|md|css|svg|html|py|vbs|example)$|(^|\/)\.env\.example$/;
const SCAN = files.filter((p) => TEXT.test(p) && !/(^|\/)(package-lock\.json|news_live\.json|tsconfig\.tsbuildinfo)$/.test(rel(p)) && !/(^|\/)ingest\/cache\//.test(rel(p)));
const text = new Map(SCAN.map((p) => [rel(p), fs.readFileSync(p, 'utf8')]));
const hits = (re, only) => [...text].filter(([r, s]) => (!only || only(r)) && re.test(s)).map(([r]) => r);
const isCode = (r) => /\.(ts|tsx|js|mjs|json|md|css)$/.test(r);

console.log('— whole-tree references');
eq('no events_live path', hits(/events_live/i), []);
eq('no ask_glm / agents.py / glm_rewrite', hits(/ask_glm|agents\.py|glm_rewrite/i), []);
eq('no unlock-study numbers (171 / 236 / 16.3%)', hits(/(?<![0-9.])171(?![0-9])|(?<![0-9.])236(?![0-9.])|16\.3\s*%|-16\.3/, isCode), []);
eq('no private calendar / private heat switches', hits(/EXPLAIN_UNLOCK_CALENDAR|EXPLAIN_PRIVATE|heat\.private|funding_1h|oi_chg_24h/), []);

console.log('— P5 files: full private-reference sweep');
const P5 = (r) => /^app\/(ingest\/explain\/|src\/components\/(devi|explain)\/|src\/lib\/(explain|glossary|timeET)|src\/app\/(about|api\/explain)|ingest\/classify\.js|ingest\/store\.js)|^docs\/DEVIS\.md$/.test(r);
const SWEEP = /shivashakthi|shiva|shakthi|base_break|22b2b|muladhara|swadhisthana|bhairava(?!i)|soldiers3|signalsnap|news_chip|D:\\|claude projects|fable|astra|fix round|phase |\bglm\b|private|funding|open interest|(?<![0-9.#a-f])171|(?<![0-9.])236(?![0-9.])|16\.3/i;
const p5hits = hits(SWEEP, P5);
eq('zero hits in the P5 files', p5hits, []);
check('P5 files are present in the public tree', ['app/ingest/explain/gate.js', 'app/ingest/explain/templates.js', 'app/ingest/explain/outcomes.js', 'app/ingest/explain/baseRates.js', 'app/ingest/explain/devi.json', 'app/src/components/explain/ExplainCard.tsx', 'app/src/app/about/devis/page.tsx', 'docs/DEVIS.md'].every((f) => files.map(rel).includes(f)));

console.log('— public build defaults');
const cfg = text.get('app/ingest/config.js') || '';
check('rewrite command defaults to empty (templates only)', /EXPLAIN_REWRITE_CMD = process\.env\.EXPLAIN_REWRITE_CMD \|\| ''/.test(cfg));
const envEx = text.get('app/.env.example') || '';
check('.env.example documents the explain switches with the rewrite command empty', /EXPLAIN_REWRITE_CMD=\n/.test(envEx));
check('cache/explain data is git-ignored in the public tree', /ingest\/cache\//.test(fs.readFileSync(path.join(PUB, '.gitignore'), 'utf8')));
done('p5_public_sanity');
