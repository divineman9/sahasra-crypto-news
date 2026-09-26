// Phase 3 step 7c: curated Bluesky accounts in the Social tab (keyless public AppView). Spec: build/bluesky_spec.md. No network.
const { check, eq, done } = require('./assert_lib');
const fs = require('fs'), path = require('path');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const http = require(APP + '/ingest/http.js');
const realReq = http.request;
delete process.env.BLUESKY_ENABLED; delete process.env.BLUESKY_INTERVAL_MS; delete process.env.BLUESKY_USER_AGENT;
const fresh = () => { delete require.cache[require.resolve(APP + '/ingest/adapters/bluesky.js')]; return require(APP + '/ingest/adapters/bluesky.js'); };
const { BSKY_ACCOUNTS, BSKY_FILTER } = require(APP + '/ingest/config.js');
const now = Date.now();
const iso = (h) => new Date(now - h * 3600e3).toISOString();
function fixture() {
  let t = fs.readFileSync(path.join(__dirname, 'fixtures', 'bsky_author_feed.json'), 'utf8');
  t = t.replace(/\{\{fresh_(\d+)h\}\}/g, (_, n) => iso(Number(n))).replace(/\{\{stale_(\d+)h\}\}/g, (_, n) => iso(Number(n)));
  return JSON.parse(t);
}
const CAS = { handle: 'cascoinfoundation.org', did: 'did:plc:gujnzolp2n4upahg3zb6u6zx', name: 'Cas Piancey' };
const rk = (items) => items.map((i) => i.url.split('/').pop());

(async () => {
  console.log('— config');
  eq('21 curated accounts', BSKY_ACCOUNTS.length, 21);
  check('every account has handle, name, did:plc (24 chars)', BSKY_ACCOUNTS.every((a) => a.handle && a.name && /^did:plc:[a-z2-7]{24}$/.test(a.did)), BSKY_ACCOUNTS.filter((a) => !/^did:plc:[a-z2-7]{24}$/.test(a.did)));
  eq('unique DIDs and handles', [new Set(BSKY_ACCOUNTS.map((a) => a.did)).size, new Set(BSKY_ACCOUNTS.map((a) => a.handle)).size], [21, 21]);
  eq('exactly the 4 pure-crypto accounts have filter:false', BSKY_ACCOUNTS.filter((a) => a.filter === false).map((a) => a.handle).sort(), ['btcbreakdown.com', 'lukedashjr.bsky.social', 'web3isgoinggreat.com', 'zfnd.org']);
  const re = new RegExp(BSKY_FILTER, 'i');
  check('BSKY_FILTER matches crypto posts', ['Tether froze $318k USDT', 'Zcash Zebra 6.4.0 security fixes', 'Bitcoin Knots 29.4.2 released', 'the Clarity Act was a bill for the crypto industry'].every((s) => re.test(s)));
  eq('BSKY_FILTER does not match an off-topic post', re.test('I had no idea Isabel Perón is still alive.'), false);

  console.log('— make()');
  let B = fresh();
  let ads = B.make();
  eq('default: one adapter bsky:all, tier 4, 10 min, quietHealth', ads.map((a) => [a.name, a.tier, a.intervalMs, a.quietHealth, typeof a.run]), [['bsky:all', 4, 600000, true, 'function']]);
  process.env.BLUESKY_ENABLED = '0'; B = fresh();
  const logs = []; const ol = console.log; console.log = (...a) => logs.push(a.join(' '));
  const off1 = B.make(), off2 = B.make(); console.log = ol;
  eq('BLUESKY_ENABLED=0 → no adapters, disabled line printed once', [off1.length, off2.length, logs.filter((l) => /\[bsky\] disabled/.test(l)).length], [0, 0, 1]);
  delete process.env.BLUESKY_ENABLED; B = fresh();

  console.log('— parseFeed, filter ON');
  const on = B.parseFeed(fixture(), CAS, now);
  const onR = rk(on);
  check('repost, both replies, 49 h, 9-char "Excellent" and off-topic iced-coffee post absent', ['3mgajtkhn422v', '3mwfgi5e67s2m', '3mwfg43yd3c2m', '3mwessqjnac2m', '3mwf2ntaj3k2m', '3mwf46gicgc2m', '3mwew55tkds2m'].every((r) => !onR.includes(r)), onR);
  check('crypto posts present (Tether/crypto Twitter, Tether response, a16z crypto)', ['3mwffxvjfps2m', '3mweyhss7cs2m', '3mwewenh3oc2m'].every((r) => onR.includes(r)), onR);
  check('item shape', on.length > 0 && on.every((i) => i.sourceName === 'bsky:cascoinfoundation.org' && i.sourceTier === 4 && i.kind === 'social' && i.alertable === false && i.maxImportance === 10 && Array.isArray(i.hintTickers) && i.hintTickers.length === 0 && i.sourceDomain === 'bsky.app' && i.exchange === null && i.hintCategory === null), on[0]);
  check('url = bsky.app/profile/<handle>/post/<rkey>; title single line ≤200; publishedAt Date', on.every((i) => /^https:\/\/bsky\.app\/profile\/cascoinfoundation\.org\/post\/[a-z0-9]+$/.test(i.url) && !/\n/.test(i.title) && i.title.length <= 200 && i.publishedAt instanceof Date));

  console.log('— parseFeed, filter OFF');
  const off = B.parseFeed(fixture(), { ...CAS, filter: false }, now);
  const offR = rk(off);
  check('47 h and iced-coffee posts now present; stale/repost/replies/short still absent', offR.includes('3mwew55tkds2m') && offR.includes('3mwf46gicgc2m') && ['3mgajtkhn422v', '3mwfgi5e67s2m', '3mwfg43yd3c2m', '3mwessqjnac2m', '3mwf2ntaj3k2m'].every((r) => !offR.includes(r)), offR);
  eq('filter off → exactly 5 items', off.length, 5);
  check('newest first', off.every((i, k) => k === 0 || off[k - 1].publishedAt >= i.publishedAt));

  console.log('— timestamp fallback');
  const base = fixture().feed.find((f) => f.post && f.post.uri.endsWith('3mwffxvjfps2m'));
  const variant = (created, indexed) => { const c = JSON.parse(JSON.stringify(base)); c.post.record.createdAt = created; c.post.indexedAt = indexed; return { feed: [c] }; };
  const fut = B.parseFeed(variant(new Date(now + 2 * 3600e3).toISOString(), iso(1)), { ...CAS, filter: false }, now);
  eq('createdAt 2 h in the future → indexedAt used', fut[0] && fut[0].publishedAt.toISOString(), iso(1));
  const bad = B.parseFeed(variant('garbage', iso(1)), { ...CAS, filter: false }, now);
  eq('invalid createdAt → indexedAt used', bad[0] && bad[0].publishedAt.toISOString(), iso(1));
  eq('both invalid → skipped', B.parseFeed(variant('garbage', 'nope'), { ...CAS, filter: false }, now).length, 0);

  console.log('— handle.invalid falls back to the configured handle (Fable N2)');
  const inv = JSON.parse(JSON.stringify(base)); inv.post.author = { ...(inv.post.author || {}), handle: 'handle.invalid' };
  const invItems = B.parseFeed({ feed: [inv] }, { ...CAS, filter: false }, now);
  check('url uses configured handle when AppView says handle.invalid', invItems[0] && /^https:\/\/bsky\.app\/profile\/cascoinfoundation\.org\/post\//.test(invItems[0].url), invItems[0] && invItems[0].url);
  process.env.BLUESKY_INTERVAL_MS = '120000'; const Bf = fresh();
  check('interval floor is 6 min (watchdog-safe for 21 sequential requests)', Bf.INTERVAL_MS >= 360000, Bf.INTERVAL_MS);
  delete process.env.BLUESKY_INTERVAL_MS; B = fresh();

  console.log('— run() with injected http');
  const calls = [];
  const uniq = (j, tag) => { for (const f of j.feed) if (f.post && f.post.uri) f.post.uri = f.post.uri + tag; return j; };
  http.request = async (url, opts) => { calls.push({ url, opts }); const j = uniq(fixture(), 'a' + calls.length); return { status: 200, text: JSON.stringify(j), headers: { get: () => null }, json: () => j }; };
  const sleeps = []; B._setSleep(async (ms) => { sleeps.push(ms); });
  const items = await B.make()[0].run();
  eq('one request per account', calls.length, BSKY_ACCOUNTS.length);
  check('urls use the DID, posts_no_replies, limit=30', calls.every((c) => c.url.startsWith(B.API + '?actor=did%3Aplc%3A') && /filter=posts_no_replies/.test(c.url) && /limit=30/.test(c.url)), calls[0] && calls[0].url);
  check('default UA, no Authorization header', calls.every((c) => c.opts && c.opts.ua === 'SahasraNews/1.0 (self-hosted news reader)' && !(c.opts.headers && (c.opts.headers.Authorization || c.opts.headers.authorization))));
  check('no uri field leaks to store', items.every((i) => !('uri' in i)));
  check('sorted newest first', items.every((i, k) => k === 0 || items[k - 1].publishedAt >= i.publishedAt));
  check('zfnd call items carry sourceName bsky:zfnd.org (config), url handle from response author', items.some((i) => i.sourceName === 'bsky:zfnd.org' && /profile\/cascoinfoundation\.org\//.test(i.url)));
  const dupeReq = async () => { const j = fixture(); return { status: 200, text: '', headers: { get: () => null }, json: () => j }; };
  http.request = dupeReq; const B2 = fresh(); B2._setSleep(async () => {});
  const dd = await B2.make()[0].run();
  eq('same post surfaced by several accounts is kept once (AT URI dedupe)', dd.length, new Set(dd.map((i) => i.url)).size);
  eq('20 gaps of 250 ms between 21 accounts', [sleeps.length, sleeps.every((s) => s === 250)], [20, true]);

  console.log('— partial failure isolation + throttled logging');
  let n = 0;
  http.request = async (url) => { n++; if (n === 3) throw Object.assign(new Error('HTTP 400'), { status: 400 }); if (n === 7) throw Object.assign(new Error('HTTP 503'), { status: 503 }); const j = uniq(fixture(), 'b' + n); return { status: 200, text: '', headers: { get: () => null }, json: () => j }; };
  const errLogs = []; const oe = console.error, ol2 = console.log; console.error = (...a) => errLogs.push(a.join(' ')); console.log = (...a) => errLogs.push(a.join(' '));
  B = fresh(); B._setSleep(async () => {});
  const part = await B.make()[0].run();
  const firstErrs = errLogs.filter((l) => /^\[bsky\]/.test(l) && /HTTP/.test(l)).length;
  n = 0; errLogs.length = 0; await B.make()[0].run();
  const secondErrs = errLogs.filter((l) => /^\[bsky\]/.test(l) && /HTTP/.test(l)).length;
  console.error = oe; console.log = ol2;
  check('run resolves with items from the other 19 accounts', part.length > 0 && new Set(part.map((i) => i.sourceName)).size === 19, new Set(part.map((i) => i.sourceName)).size);
  eq('2 error lines, then 0 on an immediate re-run (1 h throttle)', [firstErrs, secondErrs], [2, 0]);

  console.log('— total failure propagates');
  const e429 = Object.assign(new Error('HTTP 429'), { status: 429, retryAfterMs: 42000 });
  http.request = async () => { throw e429; };
  B = fresh(); B._setSleep(async () => {});
  let got = null; const oe2 = console.error, ol3 = console.log; console.error = () => {}; console.log = () => {};
  try { await B.make()[0].run(); } catch (e) { got = e; }
  console.error = oe2; console.log = ol3;
  check('all accounts fail → run rejects with the same error object', got === e429, got && got.status);

  console.log('— per-account cap');
  const one = fixture().feed.find((f) => f.post && f.post.uri.endsWith('3mwffxvjfps2m'));
  const many = { feed: Array.from({ length: 30 }, (_, k) => { const c = JSON.parse(JSON.stringify(one)); c.post.uri = c.post.uri.replace(/[^/]+$/, 'rk' + String(k).padStart(2, '0')); c.post.record.createdAt = new Date(now - (k + 1) * 60e3).toISOString(); return c; }) };
  const capped = B.parseFeed(many, { ...CAS, filter: false }, now);
  eq('30 fresh posts → first 10 in feed order', rk(capped), Array.from({ length: 10 }, (_, k) => 'rk' + String(k).padStart(2, '0')));
  http.request = realReq;

  console.log('— wiring');
  check('ingest.js spreads bluesky.make()', /bluesky\.make\(\)/.test(fs.readFileSync(APP + '/ingest.js', 'utf8')));
  done('p3_step7c_bluesky');
})().catch((e) => { http.request = realReq; console.error('TEST CRASH', e); process.exit(2); });
