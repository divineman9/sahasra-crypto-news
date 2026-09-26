// Phase 3 step 7b: keyless Reddit — one multireddit /hot/.rss request every 10 min (Reddit no longer issues script apps).
// Spec: build/reddit_alt_fable.md. No network: http.request is replaced.
const { check, eq, done } = require('./assert_lib');
const fs = require('fs'), path = require('path');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const FX = path.join(__dirname, 'fixtures', 'reddit_multi_hot.atom');
const http = require(APP + '/ingest/http.js');
const realReq = http.request;
for (const k of ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USERNAME', 'REDDIT_PASSWORD', 'REDDIT_RSS_ENABLED', 'REDDIT_ENABLED', 'REDDIT_USER_AGENT', 'REDDIT_RSS_INTERVAL_MS']) delete process.env[k];
const fresh = () => { delete require.cache[require.resolve(APP + '/ingest/adapters/reddit.js')]; return require(APP + '/ingest/adapters/reddit.js'); };
const { REDDIT_SUBS } = require(APP + '/ingest/config.js');
const now = Date.now();
const DAILY_RE = /\b(daily|weekly|monthly)\b.*\b(discussion|thread|megathread)\b|\bmegathread\b|\bgeneral discussion\b/i;

// Rewrite the captured feed so dates are relative to now: entry i published i*5 min ago;
// the 3rd solana entry → 49 h old (must drop), the 4th solana entry → 47 h old (must stay); append a foreign-sub entry.
function buildFeed() {
  const raw = fs.readFileSync(FX, 'utf8');
  const parts = raw.split('<entry>');
  let solana = 0;
  const out = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    let e = parts[i];
    const isSol = /reddit\.com\/r\/solana\//.test(e);
    let ageMs = i * 5 * 60e3;
    if (isSol) { solana++; if (solana === 3) ageMs = 49 * 3600e3; if (solana === 4) ageMs = 47 * 3600e3; }
    const iso = new Date(now - ageMs).toISOString();
    e = e.replace(/<published>[^<]*<\/published>/, `<published>${iso}</published>`).replace(/<updated>[^<]*<\/updated>/, `<updated>${iso}</updated>`);
    out.push(e);
  }
  let text = out.join('<entry>');
  const foreign = `<entry><author><name>/u/someone</name><uri>https://www.reddit.com/user/someone</uri></author><category term="SomeOtherSub" label="r/SomeOtherSub"/><id>t3_zzzzzz</id><link href="https://www.reddit.com/r/SomeOtherSub/comments/zzzzzz/unrelated_post/"/><updated>${new Date(now - 60e3).toISOString()}</updated><published>${new Date(now - 60e3).toISOString()}</published><title>Unrelated post from another sub</title></entry>`;
  return text.replace('</feed>', foreign + '</feed>');
}

(async () => {
  console.log('— config');
  eq('6 subreddits configured', REDDIT_SUBS.length, 6);
  check('every sub has integer rssTake ≥ 1 and keeps minScore', REDDIT_SUBS.every((s) => Number.isInteger(s.rssTake) && s.rssTake >= 1 && typeof s.minScore === 'number'), REDDIT_SUBS);

  console.log('— mode selection');
  let R = fresh();
  eq('no keys → rss mode', R.mode(), 'rss');
  const logs = []; const ol = console.log; console.log = (...a) => logs.push(a.join(' '));
  let ads = R.make();
  console.log = ol;
  eq('no keys → exactly 1 adapter reddit:multi, tier 4, 10 min, quietHealth', ads.map((a) => [a.name, a.tier, a.intervalMs, a.quietHealth]), [['reddit:multi', 4, 600000, true]]);
  check('rss-mode startup line printed, no "disabled" line', logs.some((l) => /unauthenticated RSS mode/.test(l)) && !logs.some((l) => /disabled/i.test(l)), logs);
  process.env.REDDIT_RSS_ENABLED = '0'; R = fresh();
  eq('REDDIT_RSS_ENABLED=0 and no keys → off, 0 adapters', [R.mode(), R.make().length], ['off', 0]);
  delete process.env.REDDIT_RSS_ENABLED;
  Object.assign(process.env, { REDDIT_CLIENT_ID: 'id', REDDIT_CLIENT_SECRET: 'sec', REDDIT_USERNAME: 'u', REDDIT_PASSWORD: 'p' }); R = fresh();
  eq('keys set → oauth mode, one adapter per sub (existing behaviour)', [R.mode(), R.make().length], ['oauth', 6]);
  for (const k of ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USERNAME', 'REDDIT_PASSWORD']) delete process.env[k];

  console.log('— request shape');
  R = fresh();
  eq('rssUrl is the single multireddit hot feed', R.rssUrl(REDDIT_SUBS), 'https://www.reddit.com/r/CryptoCurrency+CryptoMarkets+Bitcoin+ethereum+solana+defi/hot/.rss?limit=100');
  const feed = buildFeed();
  const calls = [];
  http.request = async (url, opts = {}) => { calls.push({ url, opts }); return { status: 200, text: feed, headers: { get: () => null }, json: () => ({}) }; };
  let t = 1_000_000; const sleeps = [];
  R._clock.now = () => t; R._clock.sleep = async (ms) => { sleeps.push(ms); t += ms; };
  const items = await R.make()[0].run();
  eq('one request, to the multireddit URL', calls.map((c) => c.url), [R.rssUrl(REDDIT_SUBS)]);
  const o = calls[0].opts;
  eq('default descriptive UA, no Authorization, not conditional', [o.ua, !!(o.headers && (o.headers.Authorization || o.headers.authorization)), !!o.conditional], ['SahasraNews/1.0 (self-hosted RSS reader)', false, false]);

  console.log('— parsing');
  const by = {}; for (const it of items) by[it.sourceName] = (by[it.sourceName] || 0) + 1;
  eq('Bitcoin capped at rssTake 10 (fixture has 12)', by['reddit:Bitcoin'], 10);
  eq('defi has 1 entry → 1 item (cap 5 not an error)', by['reddit:defi'], 1);
  check('sourceName uses configured casing (reddit:ethereum, reddit:CryptoCurrency)', 'reddit:ethereum' in by && Object.keys(by).every((k) => REDDIT_SUBS.some((s) => 'reddit:' + s.sub === k)), by);
  check('item shape: social, tier 4, alertable false, maxImportance 10, no tickers, reddit.com', items.length > 0 && items.every((i) => i.kind === 'social' && i.sourceTier === 4 && i.alertable === false && i.maxImportance === 10 && Array.isArray(i.hintTickers) && i.hintTickers.length === 0 && i.sourceDomain === 'reddit.com'), items[0]);
  check('no AutoModerator / daily-thread titles', items.every((i) => !DAILY_RE.test(i.title)));
  check('foreign-sub entry dropped', items.every((i) => !/SomeOtherSub/.test(i.url)));
  check('urls have no query string and point at reddit.com/r/', items.every((i) => !/\?/.test(i.url) && /^https:\/\/www\.reddit\.com\/r\//.test(i.url)));
  eq('49 h-old solana entry dropped, 47 h-old kept → solana 6 (7 in fixture, 1 too old; cap 6)', by['reddit:solana'], 6);
  const bitcoinFeedOrder = [...feed.matchAll(/<link href="(https:\/\/www\.reddit\.com\/r\/Bitcoin\/[^"?]+)/g)].map((m) => m[1]);
  eq('Bitcoin items are the FIRST 10 Bitcoin entries in hot order', items.filter((i) => i.sourceName === 'reddit:Bitcoin').map((i) => i.url), bitcoinFeedOrder.filter((u) => !DAILY_RE.test('')).slice(0, 10));

  console.log('— 60 s shared gap');
  sleeps.length = 0; calls.length = 0;
  t += 5000; await R.make()[0].run();
  eq('second run 5 s later sleeps 55 s before requesting', sleeps, [55000]);
  sleeps.length = 0; t += 120000; await R.make()[0].run();
  eq('a run ≥60 s later does not sleep', sleeps, []);
  check('OAuth fetchHot also waits on the shared gap (source uses awaitRedditGap)', /async function fetchHot[\s\S]{0,400}awaitRedditGap\(/.test(fs.readFileSync(APP + '/ingest/adapters/reddit.js', 'utf8')));

  console.log('— errors propagate');
  const e429 = Object.assign(new Error('HTTP 429'), { status: 429, retryAfterMs: 42000 });
  let n = 0; http.request = async () => { n++; throw e429; };
  t += 120000; let got = null; try { await R.make()[0].run(); } catch (e) { got = e; }
  check('429 rejects with the same error object, one request, no retry', got === e429 && n === 1, { got: got && got.status, n });
  http.request = realReq;

  console.log('— wiring');
  check('ingest.js still spreads reddit.make()', /reddit\.make\(\)/.test(fs.readFileSync(APP + '/ingest.js', 'utf8')));
  done('p3_step7b_reddit_rss');
})().catch((e) => { http.request = realReq; console.error('TEST CRASH', e); process.exit(2); });
