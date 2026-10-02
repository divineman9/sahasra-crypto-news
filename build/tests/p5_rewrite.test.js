// P5 P2: optional GLM rewrite hook: unset -> template; bad JSON -> template; guard rejects; daily cap; cache hit skips the spawn.
const fs = require('fs'), os = require('os'), path = require('path');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const { createEngine } = require(APP + '/ingest/explain/events.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p5rw-'));
const slash = (p) => p.replace(/\\/g, '/');
const counter = path.join(tmp, 'calls.log');
// A tiny fake "GLM": logs each call, then prints what MODE says.
const fake = path.join(tmp, 'fake.js');
fs.writeFileSync(fake, `
const fs = require('fs');
let d = ''; process.stdin.on('data', (c) => d += c); process.stdin.on('end', () => {
  fs.appendFileSync(${JSON.stringify(counter)}, 'call\\n');
  const mode = process.env.FAKE_MODE || 'good';
  const j = JSON.parse(d);
  if (mode === 'sleep') { setTimeout(() => {}, 5000); return; }
  if (mode === 'bad') { process.stdout.write('{"why": "trunc'); return; }
  if (mode === 'invent') { process.stdout.write(JSON.stringify({ why: j.text.why + ' It is 12% worse.', tradeoffs: j.text.tradeoffs, scenarios: j.text.scenarios })); return; }
  process.stdout.write(JSON.stringify({ why: 'Rewritten: ' + j.text.why, tradeoffs: j.text.tradeoffs, scenarios: j.text.scenarios.map((s) => ({ title: s.title, condition: s.condition })) }));
});`);
const cmd = (mode) => `${process.env.FAKE_NODE || '"' + process.execPath + '"'} "${slash(fake)}"`;
const calls = () => (fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean).length : 0);

let n = 0;
const post = (t, extra) => Object.assign({ id: 'r' + ++n, title: t + ' unlocks 6% of circulating supply on Oct 2', url: 'https://x.test/' + n, category: 'unlock', importance: 80, sentiment: 'bearish', kind: 'news', sourceTier: 2, sourceDomain: 'theblock.co', sourceName: 'rss:x', exchange: null, tickers: [t], unlockPct: 6, unlockPctBasis: 'circulating', publishedAt: new Date(), storyId: null, userLabel: null }, extra);
const mkE = (extra) => createEngine(Object.assign({ dir: fs.mkdtempSync(path.join(tmp, 'e-')), calendarPath: '', log: () => {} }, extra));

(async () => {
  console.log('— unset command');
  const off = mkE({});
  const e0 = off.consider(post('AAA'));
  await off.settled();
  eq('unset -> source template, glm null', [e0.text.source, e0.text.glm], ['template', null]);
  eq('no spawn, no cache file', [calls(), fs.existsSync(path.join(off.file, '..', 'glm_cache.json'))], [0, false]);

  console.log('— good rewrite');
  const good = mkE({ rewriteCmd: cmd() });
  process.env.FAKE_MODE = 'good';
  const e1 = good.consider(post('BBB'));
  eq('before the command returns the template is shown', e1.text.source, 'template');
  await good.settled();
  check('accepted rewrite applied (source glm, why changed, what untouched)', e1.text.source === 'glm' && /^Rewritten: /.test(e1.text.why) && /^On Oct 2 about 6% more BBB/.test(e1.text.what) && e1.text.glm.accepted === true, e1.text);
  eq('one spawn', calls(), 1);
  const saved = JSON.parse(fs.readFileSync(good.file, 'utf8'))[0];
  eq('persisted event carries the rewrite', saved.text.source, 'glm');

  console.log('— cache hit skips the spawn');
  const before = calls();
  const dirG = path.dirname(good.file);
  fs.unlinkSync(good.file); // same cache dir, event store wiped: an identical event is re-created
  const sameFacts = createEngine({ dir: dirG, calendarPath: '', rewriteCmd: cmd(), log: () => {} });
  const again = sameFacts.consider(post('BBB', { id: 'again', url: e1.facts.url, publishedAt: new Date(e1.facts.published_at), title: e1.facts.headline }));
  eq('identical facts hash: glm applied at once from cache (cached:true), no new spawn', [again.text.source, again.text.glm && again.text.glm.cached, calls()], ['glm', true, before]);
  await sameFacts.settled();
  eq('still no spawn after settling', calls(), before);

  console.log('— bad / rejected output falls back to the template');
  const bad = mkE({ rewriteCmd: cmd() });
  process.env.FAKE_MODE = 'bad';
  const e2 = bad.consider(post('CCC'));
  await bad.settled();
  check('truncated JSON -> template + reason', e2.text.source === 'template' && e2.text.glm && e2.text.glm.accepted === false && /JSON/.test(e2.text.glm.reason), e2.text.glm);
  const c2 = calls();
  const dirB = path.dirname(bad.file);
  fs.unlinkSync(bad.file);
  process.env.FAKE_MODE = 'good';
  const bad2 = createEngine({ dir: dirB, calendarPath: '', rewriteCmd: cmd(), log: () => {} });
  const e2b = bad2.consider(post('CCC', { id: 'c2', url: e2.facts.url, publishedAt: new Date(e2.facts.published_at), title: e2.facts.headline }));
  await bad2.settled();
  check('failed hash is not retried within 24 h (no spawn, still template)', calls() === c2 && e2b.text.source === 'template' && e2b.text.glm.cached === true, [calls(), c2, e2b.text.glm]);
  const inv = mkE({ rewriteCmd: cmd() });
  process.env.FAKE_MODE = 'invent';
  const e3 = inv.consider(post('DDD'));
  await inv.settled();
  check('invented number rejected by the guard -> template', e3.text.source === 'template' && /number 12 not in input/.test(e3.text.glm.reason), e3.text.glm);

  console.log('— daily cap');
  process.env.FAKE_MODE = 'good';
  const cap = mkE({ rewriteCmd: cmd(), rewriteDailyMax: 2 });
  const c0 = calls();
  const evs = ['E1', 'E2', 'E3'].map((t) => cap.consider(post(t)));
  await cap.settled();
  // max 1 in flight: later ones may be skipped as busy; run the remaining ones sequentially to hit the cap
  for (const e of evs) { if (e.text.source !== 'glm') { cap.consider(post(e.coin.ticker, { id: 'x' + e.coin.ticker, url: 'https://x.test/x' + e.coin.ticker })); await cap.settled(); } }
  const glmCount = evs.filter((e) => e.text.source === 'glm').length;
  check('never more than the daily cap of spawns', calls() - c0 <= 2 && glmCount <= 2, [calls() - c0, glmCount]);

  console.log('— timeout');
  process.env.FAKE_MODE = 'sleep';
  const to = mkE({ rewriteCmd: cmd(), rewriteTimeoutMs: 400 });
  const e5 = to.consider(post('FFF'));
  await to.settled();
  check('timeout -> template, reason timeout', e5.text.source === 'template' && e5.text.glm && e5.text.glm.reason === 'timeout', e5.text.glm);
  done('p5_rewrite');
})();
