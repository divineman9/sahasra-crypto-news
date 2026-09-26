// Phase 3 step 7: YouTube Media tab (app/ingest/adapters/youtube.js) + Reddit Social tab
// (app/ingest/adapters/reddit.js), plus the pure mediaThumb() UI helper. No network; http.request
// is injected everywhere, and Reddit env credentials are set/cleared per section.
process.chdir('D:/claude projects/crypto-news-terminal/app');
process.env.DISCORD_NEWS_WEBHOOK = process.env.DISCORD_NEWS_WEBHOOK || 'https://discord.test/webhook';
const { check, eq, done } = require('./assert_lib');
const fs = require('fs'), path = require('path');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const FX = path.join(__dirname, 'fixtures');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function fillDates(text, subs) {
  let out = text;
  for (const [k, v] of Object.entries(subs)) out = out.split('{{' + k + '}}').join(String(v));
  return out;
}

const REDDIT_ENV_KEYS = ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USERNAME', 'REDDIT_PASSWORD', 'REDDIT_USER_AGENT'];
function clearRedditEnv() {
  for (const k of REDDIT_ENV_KEYS) delete process.env[k];
}
function setRedditEnv(over = {}) {
  clearRedditEnv();
  process.env.REDDIT_CLIENT_ID = over.clientId || 'test-client-id';
  process.env.REDDIT_CLIENT_SECRET = over.clientSecret || 'test-client-secret';
  process.env.REDDIT_USERNAME = over.username || 'test_user';
  process.env.REDDIT_PASSWORD = over.password || 'test-pass-1234';
  if (over.userAgent) process.env.REDDIT_USER_AGENT = over.userAgent;
}
// These OAuth-mode tests pre-date the keyless RSS mode (step 7b): keep RSS mode off here and make the shared
// 60 s reddit.com gap instant so OAuth tests don't wait in real time. RSS mode is covered by p3_step7b_reddit_rss.
process.env.REDDIT_RSS_ENABLED = '0';
function freshReddit() {
  delete require.cache[require.resolve(APP + '/ingest/adapters/reddit.js')];
  const r = require(APP + '/ingest/adapters/reddit.js');
  if (r._clock) r._clock.sleep = async () => {};
  return r;
}
function freshYoutube() {
  delete require.cache[require.resolve(APP + '/ingest/adapters/youtube.js')];
  return require(APP + '/ingest/adapters/youtube.js');
}

(async () => {
  const T = require(APP + '/ingest/tickers.js');
  await T.loadUniverse();

  const http = require(APP + '/ingest/http.js');
  const realReq = http.request;
  const { classify } = require(APP + '/ingest/classify.js');

  console.log('— config sanity: YT_CHANNELS / REDDIT_SUBS');
  const { YT_CHANNELS, REDDIT_SUBS } = require(APP + '/ingest/config.js');
  eq('14 YouTube channels configured', YT_CHANNELS.length, 14);
  const ytSlugs = YT_CHANNELS.map((c) => c.slug);
  eq('YT_CHANNELS slugs unique', new Set(ytSlugs).size, ytSlugs.length);
  check('every YT_CHANNELS entry has a UC... channelId', YT_CHANNELS.every((c) => /^UC[\w-]{20,}$/.test(c.channelId)), YT_CHANNELS.map((c) => c.channelId));
  check('all YouTube channels verified:false for day one (endpoint flaky from this network, Fable live check)', YT_CHANNELS.every((c) => c.verified === false), YT_CHANNELS.map((c) => [c.slug, c.verified]));
  const byChannelId = new Set(YT_CHANNELS.map((c) => c.channelId));
  check('all 14 channel ids unique', byChannelId.size === 14, byChannelId.size);
  const EXPECTED_IDS = {
    coinbureau: 'UCqK_GSMbpiV8spgD3ZGloSw', bankless: 'UCAl9Ld79qaZxp9JzEOwd3aA', thedefiant: 'UCL0J4MLEdLP0-UyLu0hCktg',
    altcoindaily: 'UCbLhGKVY-bJPcawebgtNfbw', investanswers: 'UClgJyzwGs-GyaNxUHcLZrkg', pomp: 'UCevXpeL8cNyAnww-NqJ4m2w',
    coindesk: 'UC7TghOL755nBk7HelHoi9LQ', bitcoinmagazine: 'UCtOV5M-T3GcsJAq8QKaf0lg', realvision: 'UCGXWKlq1Oxr3ddEtmKhAkPg',
    cryptobanter: 'UCN9Nj4tjXbVTLYWN0EKly_Q', datadash: 'UCCatR7nWbYrkVXdxXb4cGXw', theblock: 'UCqjFueYMJ78eF6G0lGLzzpQ',
    paulbarron: 'UC4VPa7EOvObpyCRI4YKRQRw', unchained: 'UCWiiMnsnw5Isc2PP1to9nNw',
  };
  const byYtSlug = Object.fromEntries(YT_CHANNELS.map((c) => [c.slug, c]));
  eq('every expected channel id matches the Fable-verified list', Object.entries(EXPECTED_IDS).filter(([slug, id]) => !byYtSlug[slug] || byYtSlug[slug].channelId !== id), []);

  eq('6 Reddit subreddits configured', REDDIT_SUBS.length, 6);
  const redditByName = Object.fromEntries(REDDIT_SUBS.map((s) => [s.sub, s.minScore]));
  eq('subreddit minScore gates', redditByName, { CryptoCurrency: 150, CryptoMarkets: 50, Bitcoin: 100, ethereum: 50, solana: 50, defi: 30 });

  console.log('— mediaThumb(): pure YouTube thumbnail helper (app/src/lib/mediaThumb.js)');
  const { mediaThumb, extractYouTubeId } = require(APP + '/src/lib/mediaThumb.js');
  eq('watch?v= url -> mqdefault thumbnail', mediaThumb('https://www.youtube.com/watch?v=abcDEF12345'), 'https://i.ytimg.com/vi/abcDEF12345/mqdefault.jpg');
  eq('watch url with extra query params -> still resolved', mediaThumb('https://www.youtube.com/watch?v=xyz98765432&t=30s&feature=share'), 'https://i.ytimg.com/vi/xyz98765432/mqdefault.jpg');
  eq('youtu.be short url -> mqdefault thumbnail', mediaThumb('https://youtu.be/qwe45678901'), 'https://i.ytimg.com/vi/qwe45678901/mqdefault.jpg');
  eq('youtu.be with trailing query -> id still extracted', mediaThumb('https://youtu.be/qwe45678901?t=5'), 'https://i.ytimg.com/vi/qwe45678901/mqdefault.jpg');
  eq('www./m. host variants normalise the same way', mediaThumb('https://m.youtube.com/watch?v=abcDEF12345'), 'https://i.ytimg.com/vi/abcDEF12345/mqdefault.jpg');
  eq('non-YouTube url -> null', mediaThumb('https://cointelegraph.com/news/some-article'), null);
  eq('YouTube channel url (no video id) -> null', mediaThumb('https://www.youtube.com/channel/UCqK_GSMbpiV8spgD3ZGloSw'), null);
  eq('reddit permalink -> null', mediaThumb('https://www.reddit.com/r/CryptoCurrency/comments/q1/etf_inflows/'), null);
  eq('malformed url -> null, no throw', mediaThumb('not a url at all'), null);
  eq('empty/undefined -> null, no throw', mediaThumb(''), null);
  eq('undefined -> null, no throw', mediaThumb(undefined), null);
  eq('extractYouTubeId matches mediaThumb\'s own extraction', extractYouTubeId('https://www.youtube.com/watch?v=abcDEF12345'), 'abcDEF12345');

  console.log('— youtube adapter: Atom parsing, url canonicalisation, 7-day cutoff, Shorts skipped, raw title kept');
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const ytAtom = fillDates(fs.readFileSync(path.join(FX, 'yt_coinbureau.atom'), 'utf8'), {
    RECENT_1: iso(2 * 3600000),
    RECENT_2: iso(3 * 3600000),
    OLD: iso(10 * 86400000),
  });
  http.request = async (url) => (
    url === 'https://www.youtube.com/feeds/videos.xml?channel_id=UCqK_GSMbpiV8spgD3ZGloSw'
      ? { status: 200, notModified: false, headers: {}, text: ytAtom, json: () => ({}) }
      : { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) }
  );
  const youtube = freshYoutube();
  const ytAdapters = youtube.make();
  eq('one adapter per configured channel', ytAdapters.length, YT_CHANNELS.length);
  const ytNames = ytAdapters.map((a) => a.name);
  eq('adapter names unique, yt:<slug> shape', new Set(ytNames).size, ytNames.length);
  check('yt:coinbureau adapter present', ytNames.includes('yt:coinbureau'), ytNames);
  const cbAdapter = ytAdapters.find((a) => a.name === 'yt:coinbureau');
  eq('tier 4, interval 30 min, quietHealth true (day one: verified:false)', [cbAdapter.tier, cbAdapter.intervalMs, cbAdapter.quietHealth], [4, 1800000, true]);

  const cbItems = await cbAdapter.run();
  eq('Shorts + >7d entries dropped -> only the one qualifying video remains', cbItems.length, 1);
  const cbItem = cbItems[0];
  eq('title kept exactly as YouTube has it (no channel titlePrefix)', cbItem.title, 'Bitcoin Just Did WHAT?! (Full Breakdown)');
  eq('url canonicalised to https://www.youtube.com/watch?v=<id>', cbItem.url, 'https://www.youtube.com/watch?v=abcDEF12345');
  eq('kind/tier/alertable/maxImportance/sourceName/sourceDomain', [cbItem.kind, cbItem.sourceTier, cbItem.alertable, cbItem.maxImportance, cbItem.sourceName, cbItem.sourceDomain], ['media', 4, false, 10, 'yt:coinbureau', 'youtube.com']);
  check('publishedAt is a Date within the last 7 days', cbItem.publishedAt instanceof Date && now - cbItem.publishedAt.getTime() < 7 * 86400000, cbItem.publishedAt);

  check('isShorts() detects /shorts/ links', youtube.isShorts('https://www.youtube.com/shorts/abc123') && !youtube.isShorts('https://www.youtube.com/watch?v=abc123'));
  eq('canonicalUrl() shape', youtube.canonicalUrl('abc123'), 'https://www.youtube.com/watch?v=abc123');
  eq('videoIdFromLink() fallback extraction', youtube.videoIdFromLink('https://www.youtube.com/watch?v=abc123&t=10s'), 'abc123');

  console.log('— youtube: classify caps importance to <=10 (never a news_live.json chip, which needs importance>=50)');
  const ytCls = classify(cbItem, []);
  check('classify() honours maxImportance:10', ytCls.importance <= 10, ytCls);
  check('10 < 50 -> can never qualify as a chip (newsFile.js chipPosts = importance>=50)', ytCls.importance < 50);

  console.log('— F7: YouTube notModified/304 -> [] (no parse attempted)');
  let notModifiedParseAttempted = false;
  http.request = async (url) => {
    if (url === 'https://www.youtube.com/feeds/videos.xml?channel_id=UCqK_GSMbpiV8spgD3ZGloSw') {
      return { status: 304, notModified: true, headers: {}, text: '', json: () => ({}) };
    }
    notModifiedParseAttempted = true; // any other feed fetched would be unexpected in this test
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  const nmItems = await freshYoutube().makeChannelAdapter(byYtSlug.coinbureau).run();
  eq('notModified -> empty array', nmItems, []);
  check('no unexpected extra fetch happened', !notModifiedParseAttempted);

  console.log('— F7: the same videoId from two different channels canonicalises to the identical url (pure function of the id, not the channel)');
  const banklessAtom = ytAtom
    .split('UCqK_GSMbpiV8spgD3ZGloSw').join('UCAl9Ld79qaZxp9JzEOwd3aA')
    .replace('Bitcoin Just Did WHAT?! (Full Breakdown)', 'Bankless: The Same Video Id, A Different Channel');
  http.request = async (url) => {
    if (url === 'https://www.youtube.com/feeds/videos.xml?channel_id=UCqK_GSMbpiV8spgD3ZGloSw') return { status: 200, notModified: false, headers: {}, text: ytAtom, json: () => ({}) };
    if (url === 'https://www.youtube.com/feeds/videos.xml?channel_id=UCAl9Ld79qaZxp9JzEOwd3aA') return { status: 200, notModified: false, headers: {}, text: banklessAtom, json: () => ({}) };
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  const bothChannels = freshYoutube().make();
  const [coinbureauItems, banklessItems] = await Promise.all([
    bothChannels.find((a) => a.name === 'yt:coinbureau').run(),
    bothChannels.find((a) => a.name === 'yt:bankless').run(),
  ]);
  eq('same videoId (abcDEF12345) from two channels -> identical canonical url', coinbureauItems[0].url, banklessItems[0].url);
  eq('...both equal the expected canonical form', coinbureauItems[0].url, 'https://www.youtube.com/watch?v=abcDEF12345');
  check('...but titles/sourceName still differ per channel (not accidentally merged)', coinbureauItems[0].title !== banklessItems[0].title && coinbureauItems[0].sourceName !== banklessItems[0].sourceName, [coinbureauItems[0], banklessItems[0]]);

  http.request = realReq;

  console.log('— reddit: disabled without credentials (no adapters, exactly one log line, no secret printed)');
  clearRedditEnv();
  process.env.REDDIT_CLIENT_ID = 'leaked-if-buggy-client-id';
  process.env.REDDIT_PASSWORD = 'super-secret-password-should-never-print';
  // only 2 of 4 required vars set -> still disabled
  let reddit = freshReddit();
  const disabledLogs = [];
  const origLog1 = console.log;
  console.log = (...a) => { disabledLogs.push(a.join(' ')); };
  const disabledAdapters1 = reddit.make();
  const disabledAdapters2 = reddit.make(); // calling make() again must not log a second line
  console.log = origLog1;
  eq('no adapters when credentials are incomplete', disabledAdapters1.length, 0);
  eq('...(same on a second make() call)', disabledAdapters2.length, 0);
  eq('exactly one disabled-startup log line', disabledLogs.length, 1);
  eq('log line matches the exact required wording (RSS off + no keys)', disabledLogs[0], '[reddit] disabled — REDDIT_RSS_ENABLED=0 and no REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD keys');
  check('the log line never prints the configured secret values', !disabledLogs[0].includes('leaked-if-buggy-client-id') && !disabledLogs[0].includes('super-secret-password-should-never-print'), disabledLogs[0]);
  clearRedditEnv();

  console.log('— reddit: fully unconfigured also disables (0 of 4 vars)');
  reddit = freshReddit();
  eq('no adapters with zero credentials set', reddit.make().length, 0);

  console.log('— reddit: enabled once all 4 required vars are set (REDDIT_USER_AGENT optional)');
  setRedditEnv();
  reddit = freshReddit();
  const redditAdapters = reddit.make();
  eq('one adapter per configured subreddit', redditAdapters.length, REDDIT_SUBS.length);
  const redditNames = redditAdapters.map((a) => a.name);
  eq('reddit:<sub> adapter names, unique', redditNames, REDDIT_SUBS.map((s) => 'reddit:' + s.sub));
  const cryptoAdapter = redditAdapters.find((a) => a.name === 'reddit:CryptoCurrency');
  eq('tier 4, interval 5 min', [cryptoAdapter.tier, cryptoAdapter.intervalMs], [4, 300000]);

  console.log('— reddit: token request shape (basic auth, body, default User-Agent)');
  const tokenFixtureText = fs.readFileSync(path.join(FX, 'reddit_token.json'), 'utf8');
  const tokenCalls = [];
  http.request = async (url, opts) => {
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      tokenCalls.push({ url, opts });
      return { status: 200, notModified: false, headers: {}, text: tokenFixtureText, json: () => JSON.parse(tokenFixtureText) };
    }
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  reddit = freshReddit();
  const token1 = await reddit.getToken();
  eq('token returned from the fixture', token1, 'TESTTOKEN_ABC123');
  eq('exactly one token request made', tokenCalls.length, 1);
  const call1 = tokenCalls[0];
  eq('POST to the access_token endpoint', call1.opts.method, 'POST');
  const expectedAuth = 'Basic ' + Buffer.from('test-client-id:test-client-secret').toString('base64');
  eq('Basic auth header = base64(client_id:client_secret)', call1.opts.headers.Authorization, expectedAuth);
  eq('body: grant_type=password + username + password, url-encoded', call1.opts.body, 'grant_type=password&username=test_user&password=test-pass-1234');
  eq('form content-type header set', call1.opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
  eq('default User-Agent: SahasraNews/1.0 (by u/<username>) when REDDIT_USER_AGENT unset', call1.opts.ua, 'SahasraNews/1.0 (by u/test_user)');

  console.log('— reddit: custom REDDIT_USER_AGENT is honoured');
  setRedditEnv({ userAgent: 'MyCustomAgent/2.0' });
  reddit = freshReddit();
  tokenCalls.length = 0;
  await reddit.getToken();
  eq('custom UA used instead of the default', tokenCalls[0].opts.ua, 'MyCustomAgent/2.0');
  setRedditEnv();

  console.log('— reddit: token caching (a second getToken() before expiry reuses the cached token, no new request)');
  reddit = freshReddit();
  tokenCalls.length = 0;
  const tA = await reddit.getToken();
  const tB = await reddit.getToken();
  eq('same token both times', [tA, tB], [tA, tA]);
  eq('only one token request across two getToken() calls', tokenCalls.length, 1);

  console.log('— reddit: token refresh once it is within 60s of expiry');
  reddit = freshReddit();
  tokenCalls.length = 0;
  let tokenSeq = 0;
  http.request = async (url, opts) => {
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      tokenSeq += 1;
      tokenCalls.push({ url, opts });
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ access_token: 'TOKEN_' + tokenSeq, expires_in: 70 }) };
    }
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  const realDateNow = Date.now;
  let vnow = Date.now();
  Date.now = () => vnow;
  try {
    const first = await reddit.getToken();
    eq('first token fetched', first, 'TOKEN_1');
    eq('one request so far', tokenCalls.length, 1);
    vnow += 5000; // still >60s from the 70s expiry -> cached token reused
    const still = await reddit.getToken();
    eq('well before the 60s-before-expiry skew -> still cached', still, 'TOKEN_1');
    eq('still only one request', tokenCalls.length, 1);
    vnow += 10000; // now 15s in, 55s left -> inside the 60s refresh skew -> must refresh
    const refreshed = await reddit.getToken();
    eq('inside the refresh skew -> a fresh token is fetched', refreshed, 'TOKEN_2');
    eq('a second token request was made', tokenCalls.length, 2);
  } finally {
    Date.now = realDateNow;
  }

  console.log('— reddit: 401 from the listing API -> refresh once + retry once; a second 401 throws');
  reddit = freshReddit();
  let listingCalls = 0;
  let tokFetches = 0;
  http.request = async (url, opts) => {
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      tokFetches += 1;
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ access_token: 'TOK_' + tokFetches, expires_in: 3600 }) };
    }
    if (url === 'https://oauth.reddit.com/r/CryptoCurrency/hot?limit=50&raw_json=1') {
      listingCalls += 1;
      if (listingCalls === 1) {
        check('first attempt uses the just-fetched token', opts.headers.Authorization === 'Bearer TOK_1');
        throw Object.assign(new Error('HTTP 401 for ' + url), { status: 401 });
      }
      check('second attempt (after refresh) uses a NEW token', opts.headers.Authorization === 'Bearer TOK_2', opts.headers.Authorization);
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ data: { children: [] } }) };
    }
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  const okAfterRefresh = await reddit.fetchHot('CryptoCurrency', { userAgent: '', username: 'test_user' });
  check('succeeds after exactly one refresh + one retry', okAfterRefresh && Array.isArray(okAfterRefresh.data.children));
  eq('exactly 2 listing attempts (original + 1 retry)', listingCalls, 2);
  eq('exactly 2 token fetches (initial + 1 forced refresh)', tokFetches, 2);

  // A second listing call that 401s on both the original AND the post-refresh retry must throw.
  http.request = async (url, opts) => {
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ access_token: 'TOK_ALWAYS', expires_in: 3600 }) };
    }
    if (url === 'https://oauth.reddit.com/r/CryptoCurrency/hot?limit=50&raw_json=1') {
      throw Object.assign(new Error('HTTP 401 for ' + url), { status: 401 });
    }
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  let threw = false;
  let thrownStatus = null;
  try {
    await reddit.fetchHot('CryptoCurrency', { userAgent: '', username: 'test_user' });
  } catch (e) {
    threw = true;
    thrownStatus = e.status;
  }
  check('a second consecutive 401 (post-refresh) propagates as a thrown error', threw && thrownStatus === 401, { threw, thrownStatus });

  console.log('— F5: 6 concurrent adapters all hitting a 401 on the same stale token -> exactly one forced-refresh token POST (collapsed), not 6');
  reddit = freshReddit();
  let f5TokFetches = 0;
  let f5ListingHits = 0;
  http.request = async (url, opts) => {
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      f5TokFetches += 1;
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ access_token: 'F5_TOK_' + f5TokFetches, expires_in: 3600 }) };
    }
    // every subreddit's /hot 401s on the very first attempt (whatever token it was given), then
    // succeeds once retried with whatever token is current at that point.
    const m = /\/r\/([^/]+)\/hot/.exec(url);
    if (m) {
      f5ListingHits += 1;
      if (opts.headers.Authorization === 'Bearer F5_TOK_1') {
        throw Object.assign(new Error('HTTP 401 for ' + url), { status: 401 });
      }
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ data: { children: [] } }) };
    }
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  await reddit.getToken(); // pre-warm the cache with F5_TOK_1 so all 6 concurrent calls share one stale token
  eq('one token fetch to pre-warm the shared cache', f5TokFetches, 1);
  const f5Subs = REDDIT_SUBS.map((s) => s.sub);
  const f5Results = await Promise.all(f5Subs.map((sub) => reddit.fetchHot(sub, { userAgent: '', username: 'test_user' })));
  check('all 6 concurrent fetchHot() calls eventually succeed', f5Results.every((r) => r && Array.isArray(r.data.children)), f5Results);
  eq('exactly ONE additional (forced-refresh) token POST across all 6 concurrent 401s, not 6', f5TokFetches, 2);
  eq('12 total listing attempts (6 originals + 6 retries)', f5ListingHits, 12);

  console.log('— F6: token error text includes the non-secret error code, never the password');
  http.request = async (url, opts) => {
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      check('F6: the failing request body still carries the real password (this is what must NOT leak into the error)', typeof opts.body === 'string' && opts.body.includes('hunter2-should-not-leak'));
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ error: 'invalid_grant' }) };
    }
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  setRedditEnv({ password: 'hunter2-should-not-leak' });
  reddit = freshReddit();
  let f6Err = null;
  try {
    await reddit.getToken();
  } catch (e) {
    f6Err = e;
  }
  check('getToken() throws when the response has no access_token', !!f6Err, f6Err);
  check('error message contains the non-secret error code', !!f6Err && f6Err.message.includes('invalid_grant'), f6Err && f6Err.message);
  check('error message never contains the password', !!f6Err && !f6Err.message.includes('hunter2-should-not-leak'), f6Err && f6Err.message);
  setRedditEnv();

  console.log('— F7: a password with &, %, +, and a space url-encodes correctly in the token request body');
  const trickyPassword = 'p@ss w+rd&100%done';
  setRedditEnv({ password: trickyPassword });
  reddit = freshReddit();
  let f7Body = null;
  http.request = async (url, opts) => {
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      f7Body = opts.body;
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ access_token: 'F7_TOK', expires_in: 3600 }) };
    }
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  await reddit.getToken();
  eq('body password segment = encodeURIComponent(password) exactly', f7Body, 'grant_type=password&username=test_user&password=' + encodeURIComponent(trickyPassword));
  check('the raw special characters are actually escaped in the body (not passed through literally)', !f7Body.includes('p@ss w+rd&100%done'), f7Body);
  setRedditEnv();

  console.log('— F7: concurrent getToken() calls with no cache yet collapse into exactly one request');
  reddit = freshReddit();
  let f7ConcurrentFetches = 0;
  http.request = async (url) => {
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      f7ConcurrentFetches += 1;
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ access_token: 'F7_CONCURRENT_TOK', expires_in: 3600 }) };
    }
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  const f7Tokens = await Promise.all([reddit.getToken(), reddit.getToken(), reddit.getToken(), reddit.getToken(), reddit.getToken()]);
  eq('all 5 concurrent calls resolve to the same token', new Set(f7Tokens).size, 1);
  eq('exactly one request for 5 concurrent, cache-empty getToken() calls', f7ConcurrentFetches, 1);

  console.log('— F7: a rejected token fetch is never cached — the next call retries cleanly');
  reddit = freshReddit();
  let f7RejectAttempt = 0;
  http.request = async (url) => {
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      f7RejectAttempt += 1;
      if (f7RejectAttempt === 1) throw Object.assign(new Error('HTTP 500 for ' + url), { status: 500 });
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ access_token: 'F7_RETRY_TOK', expires_in: 3600 }) };
    }
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  let f7FirstThrew = false;
  try { await reddit.getToken(); } catch (e) { f7FirstThrew = true; }
  check('first (failing) getToken() call throws', f7FirstThrew);
  const f7RetryToken = await reddit.getToken();
  eq('the retry succeeds with a fresh fetch (the failed attempt was never cached)', f7RetryToken, 'F7_RETRY_TOK');
  eq('exactly 2 attempts (1 failed + 1 retry)', f7RejectAttempt, 2);

  console.log('— F7: a non-401 error (e.g. 429) propagates through fetchHot with its status/retryAfterMs untouched, no token refresh attempted');
  reddit = freshReddit();
  let f7TokFetchesFor429 = 0;
  http.request = async (url) => {
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      f7TokFetchesFor429 += 1;
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ access_token: 'F7_429_TOK', expires_in: 3600 }) };
    }
    if (url === 'https://oauth.reddit.com/r/CryptoCurrency/hot?limit=50&raw_json=1') {
      throw Object.assign(new Error('HTTP 429 for ' + url), { status: 429, retryAfterMs: 42000 });
    }
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  let f7_429_threw = false;
  let f7_429_err = null;
  try {
    await reddit.fetchHot('CryptoCurrency', { userAgent: '', username: 'test_user' });
  } catch (e) {
    f7_429_threw = true;
    f7_429_err = e;
  }
  check('429 propagates as a thrown error', f7_429_threw);
  eq('status preserved unchanged (429)', f7_429_err && f7_429_err.status, 429);
  eq('retryAfterMs preserved unchanged', f7_429_err && f7_429_err.retryAfterMs, 42000);
  eq('no forced token refresh was attempted for a non-401 error', f7TokFetchesFor429, 1);
  http.request = realReq;

  console.log('— B1 fix: health.js\'s window is interval-aware (a 30-min-interval adapter is not flagged at 35 min, only past 2x its interval), and quietHealth is unaffected here (health.js already skips Discord alerts for it — this only re-confirms the window math)');
  {
    const { startHealth } = require(APP + '/ingest/health.js');
    const b1Now = Date.now();
    const mk = (o) => Object.assign({ name: 'x', tier: 4, intervalMs: 0, quietHealth: false, consecutiveErrors: 0, consecutiveSaveErrors: 0, lastErr: null }, o);

    const run = async (entries) => {
      const calls = [];
      const errs = [];
      const origErr = console.error;
      console.error = (...a) => { errs.push(a.join(' ')); };
      const stopFn = startHealth({ scheduler: { health: () => entries }, alerts: { healthAlert: async (name) => { calls.push(name); } }, intervalMs: 15 });
      await sleep(45);
      stopFn();
      console.error = origErr;
      return { calls, errs };
    };

    const r35 = await run([mk({ name: 'yt:x', tier: 4, intervalMs: 1800000, lastOkAt: b1Now - 35 * 60000 })]);
    eq('35 min silent, 30-min-interval adapter (< 2x interval = 60min) -> no Discord healthAlert', r35.calls.length, 0);
    check('...and no "[health] ... no successful poll" line', !r35.errs.some((l) => l.includes('yt:x') && l.includes('no successful poll')), r35.errs);

    const r65 = await run([mk({ name: 'yt:x', tier: 4, intervalMs: 1800000, lastOkAt: b1Now - 65 * 60000 })]);
    check('65 min silent, 30-min-interval adapter (> 2x interval = 60min) -> healthAlert fires', r65.calls.length >= 1, r65.calls);
    check('...and the "[health] ... no successful poll" line is logged', r65.errs.some((l) => l.includes('yt:x') && l.includes('no successful poll')), r65.errs);

    const r5h = await run([mk({ name: 'gh:quiet', tier: 3, intervalMs: 1800000, quietHealth: true, lastOkAt: b1Now - 5 * 3600000 })]);
    eq('quietHealth adapter, 5h silent -> still never alerts Discord (unchanged)', r5h.calls.length, 0);

    const r31 = await run([mk({ name: 'rss:fast', tier: 3, intervalMs: 90000, lastOkAt: b1Now - 31 * 60000 })]);
    check('90s-interval RSS adapter still alarms at 31 min (30-min floor unchanged, not weakened)', r31.calls.length >= 1, r31.calls);
  }

  console.log('— reddit: gating rules per sub (stickied / nsfw / low-score / flair-news / old / qualifying / F4 removed-or-deleted), via fixture');
  reddit = freshReddit();
  const redditHotText = fillDates(fs.readFileSync(path.join(FX, 'reddit_hot.json'), 'utf8'), {
    RECENT_EPOCH: Math.floor((now - 3600000) / 1000),
    OLD_EPOCH: Math.floor((now - 50 * 3600000) / 1000),
  });
  const redditHotJson = JSON.parse(redditHotText);
  const gatingCalls = [];
  http.request = async (url, opts) => {
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ access_token: 'GATE_TOKEN', expires_in: 3600 }) };
    }
    if (url === 'https://oauth.reddit.com/r/CryptoCurrency/hot?limit=50&raw_json=1') {
      gatingCalls.push({ url, opts });
      return { status: 200, notModified: false, headers: {}, text: redditHotText, json: () => redditHotJson };
    }
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  const gatingAdapters = reddit.make();
  const cryptoRun = gatingAdapters.find((a) => a.name === 'reddit:CryptoCurrency');
  const gatingItems = await cryptoRun.run();
  eq('request url shape: /r/<sub>/hot?limit=50&raw_json=1', gatingCalls[0].url, 'https://oauth.reddit.com/r/CryptoCurrency/hot?limit=50&raw_json=1');
  eq('Bearer token attached', gatingCalls[0].opts.headers.Authorization, 'Bearer GATE_TOKEN');
  eq('only flair-news (below minScore) + qualifying (>=minScore) survive; stickied/nsfw/low-score/old/F4-removed-or-deleted (all high-score) dropped', gatingItems.map((i) => i.title).sort(), [
    'Bitcoin ETF sees record inflows as institutions pile in',
    'SEC delays decision on spot XRP ETF',
  ]);
  check('F4: removed_by_category / author [deleted] / selftext [removed]|[deleted] posts excluded despite high scores', !gatingItems.some((i) => ['rm1', 'da1', 'rs1', 'ds1'].some((id) => i.url.includes('/' + id + '/'))), gatingItems.map((i) => i.url));
  const q1 = gatingItems.find((i) => i.title.startsWith('Bitcoin ETF'));
  eq('item shape: url = reddit.com + permalink', q1.url, 'https://www.reddit.com/r/CryptoCurrency/comments/q1/etf_inflows/');
  eq('kind/tier/alertable/maxImportance/sourceName/sourceDomain', [q1.kind, q1.sourceTier, q1.alertable, q1.maxImportance, q1.sourceName, q1.sourceDomain], ['social', 4, false, 10, 'reddit:CryptoCurrency', 'reddit.com']);
  eq('hintTickers always empty (title tagger does the work)', q1.hintTickers, []);
  check('publishedAt derived from created_utc (a Date)', q1.publishedAt instanceof Date && !isNaN(q1.publishedAt.getTime()));

  console.log('— reddit: a post that starts below threshold can be ingested later once it crosses it (adapter is stateless per poll)');
  const belowThenAbove = JSON.parse(JSON.stringify(redditHotJson));
  belowThenAbove.data.children = [{
    kind: 't3',
    data: {
      id: 'x1', stickied: false, over_18: false, score: 40, link_flair_text: null,
      title: 'A post that will later cross the score threshold',
      permalink: '/r/CryptoCurrency/comments/x1/rising_post/',
      created_utc: Math.floor((now - 600000) / 1000),
    },
  }];
  let pollScore = 40;
  http.request = async (url, opts) => {
    if (url === 'https://www.reddit.com/api/v1/access_token') {
      return { status: 200, notModified: false, headers: {}, text: '', json: () => ({ access_token: 'POLL_TOKEN', expires_in: 3600 }) };
    }
    if (url === 'https://oauth.reddit.com/r/CryptoCurrency/hot?limit=50&raw_json=1') {
      belowThenAbove.data.children[0].data.score = pollScore;
      return { status: 200, notModified: false, headers: {}, text: '', json: () => belowThenAbove };
    }
    return { status: 200, notModified: false, headers: {}, text: '', json: () => ({}) };
  };
  const pollAdapter = reddit.make().find((a) => a.name === 'reddit:CryptoCurrency');
  const pollBelow = await pollAdapter.run();
  eq('below minScore (150), no news flair -> not ingested on this poll', pollBelow.length, 0);
  pollScore = 200;
  const pollAbove = await pollAdapter.run();
  eq('same post, later poll, now above minScore -> ingested (adapter re-evaluates every tick)', pollAbove.length, 1);
  eq('same url both times -> store.js url-based dedupe is what would keep it a single post', pollAbove[0].url, 'https://www.reddit.com/r/CryptoCurrency/comments/x1/rising_post/');
  http.request = realReq;
  clearRedditEnv();

  console.log('— store: youtube + reddit items saved end-to-end (test DB) with importance <=10 and alertState null (not pending)');
  const { Store } = require(APP + '/ingest/store.js');
  const { StoryIndex } = require(APP + '/ingest/cluster.js');
  const { Alerts } = require(APP + '/ingest/discord.js');
  const { MemoryRedis } = require(APP + '/ingest/redisOptional.js');
  const redis2 = new MemoryRedis();
  const alerts2 = new Alerts({ prisma, redis: redis2 });
  const URL_PREFIX = 'https://test.local/p3s7/';
  await prisma.post.deleteMany({ where: { url: { startsWith: URL_PREFIX } } });
  const store2 = new Store({ prisma, redis: redis2, storyIndex: new StoryIndex(), alerts: alerts2 });
  await store2.init();

  const mediaItem = {
    sourceName: 'yt:coinbureau', sourceTier: 4, kind: 'media', exchange: null,
    title: 'Bitcoin ETF inflows surge to a new record this week', url: URL_PREFIX + 'yt1',
    publishedAt: new Date(), hintCategory: null, hintTickers: [], sourceDomain: 'youtube.com',
    alertable: false, maxImportance: 10,
  };
  await store2.save(mediaItem, { warm: true });
  const mp = await prisma.post.findUnique({ where: { url: mediaItem.url } });
  eq('media item stored with kind media', mp && mp.kind, 'media');
  check('media item importance <=10', mp && mp.importance <= 10, mp && mp.importance);
  eq('media item alertState null (never pending)', mp && mp.alertState, null);

  const socialItem = {
    sourceName: 'reddit:CryptoCurrency', sourceTier: 4, kind: 'social', exchange: null,
    title: 'Ethereum hacked, funds stolen from a bridge contract', url: URL_PREFIX + 'reddit1',
    publishedAt: new Date(), hintCategory: null, hintTickers: ['ETH'], sourceDomain: 'reddit.com',
    alertable: false, maxImportance: 10,
  };
  await store2.save(socialItem, { warm: true });
  const sp = await prisma.post.findUnique({ where: { url: socialItem.url } });
  eq('social item stored with kind social', sp && sp.kind, 'social');
  check('social item importance <=10 even though the title would classify as a hack (85 uncapped)', sp && sp.importance <= 10, sp && sp.importance);
  eq('social item alertState null (alertable:false blocked it, not pending)', sp && sp.alertState, null);
  await prisma.post.deleteMany({ where: { url: { startsWith: URL_PREFIX } } });

  console.log('— sourceTab(): media/social still route to their own tabs (unchanged; app/src/lib/sourceTab.js not modified)');
  const { sourceTab } = require(APP + '/src/lib/sourceTab.js');
  eq('media kind -> media tab', sourceTab({ kind: 'media', sourceName: 'yt:coinbureau' }), 'media');
  eq('social kind -> social tab', sourceTab({ kind: 'social', sourceName: 'reddit:CryptoCurrency' }), 'social');

  console.log('— ingest.js wiring: youtube + reddit registered, default-on env switches');
  const ingestSrc = fs.readFileSync(APP + '/ingest.js', 'utf8');
  check('youtube.make() and reddit.make() referenced', /youtube\.make\(\)/.test(ingestSrc) && /reddit\.make\(\)/.test(ingestSrc), ingestSrc.includes('youtube.make()'));
  check('YOUTUBE_ENABLED / REDDIT_ENABLED default enabled (!== \'0\')', /YOUTUBE_ENABLED.*!==\s*'0'/.test(ingestSrc) && /REDDIT_ENABLED.*!==\s*'0'/.test(ingestSrc));

  console.log('— app/.env.example documents the 4 required + 1 optional REDDIT_* vars');
  const envExample = fs.readFileSync(APP + '/.env.example', 'utf8');
  check('all REDDIT_* vars present (empty) with script-app guidance', ['REDDIT_CLIENT_ID=""', 'REDDIT_CLIENT_SECRET=""', 'REDDIT_USERNAME=""', 'REDDIT_PASSWORD=""', 'REDDIT_USER_AGENT=""'].every((k) => envExample.includes(k)) && /reddit\.com\/prefs\/apps/.test(envExample), envExample);

  console.log('— F4 (fix round): Reddit 2FA advice corrected (password:otp only works for the first token; the password grant re-runs hourly)');
  check('no longer advises "password:otp" as a working option', !/password:otp|password.*:.*123456.*otp requires|yourpassword:123456/i.test(envExample), envExample);
  check('advises a dedicated script-app account with 2FA disabled instead', /2FA/.test(envExample) && /disabled/i.test(envExample) && /dedicated/i.test(envExample), envExample);

  console.log('— F5 (fix round): app/.env.example documents every ingest knob (commented, with its real default)');
  const f5Vars = ['GNEWS_ENABLED', 'GNEWS_TIERS', 'GNEWS_DAILY_BUDGET', 'GNEWS_TIER_A_MIN', 'GNEWS_STATE_FILE', 'TG_WIRES_ENABLED', 'OFFICIAL_ENABLED', 'YOUTUBE_ENABLED', 'REDDIT_ENABLED', 'NEWS_REDIS', 'COINGECKO_DEMO_KEY', 'NONCOIN_CACHE_FILE', 'EVENTS_LIVE_JSON', 'NEWSFILE_CHIPS_TAKE', 'NEWSFILE_COUNTS_TAKE'];
  eq('every F5 knob is present in app/.env.example', f5Vars.filter((v) => !new RegExp('^' + v + '=', 'm').test(envExample)), []);
  check('GNEWS_ENABLED documented default matches the code (1)', /GNEWS_ENABLED="1"/.test(envExample) && /process\.env\.GNEWS_ENABLED !== '0'/.test(fs.readFileSync(APP + '/ingest/adapters/gnews.js', 'utf8')));
  check('GNEWS_DAILY_BUDGET documented default matches the code (5000)', /GNEWS_DAILY_BUDGET="5000"/.test(envExample) && /GNEWS_DAILY_BUDGET \|\| 5000/.test(fs.readFileSync(APP + '/ingest/adapters/gnews.js', 'utf8')));
  check('GNEWS_TIER_A_MIN documented default matches the code (20)', /GNEWS_TIER_A_MIN="20"/.test(envExample) && /GNEWS_TIER_A_MIN \|\| 20/.test(fs.readFileSync(APP + '/ingest/adapters/gnews.js', 'utf8')));
  check('GNEWS_TIERS documented default matches the code (A,B,C) and recommends A,B for the first day', /GNEWS_TIERS="A,B,C"/.test(envExample) && /A,B/.test(envExample) && /first day/i.test(envExample));
  check('TG_WIRES_ENABLED / OFFICIAL_ENABLED / YOUTUBE_ENABLED / REDDIT_ENABLED all documented default "1" and match ingest.js gating', ['TG_WIRES_ENABLED', 'OFFICIAL_ENABLED', 'YOUTUBE_ENABLED', 'REDDIT_ENABLED'].every((v) => new RegExp(v + '="1"').test(envExample) && new RegExp(v + `.*!==\\s*'0'`).test(ingestSrc)));

  console.log('— Fable follow-up (3): reworded .env.example comments verified against the actual code, not just re-asserted');
  const gnewsSrc = fs.readFileSync(APP + '/ingest/adapters/gnews.js', 'utf8');
  check('GNEWS_TIER_A_MIN comment states the real floor formula (max(this, ceil(1440*nA/(0.9*budget))))', /max\(this, ceil\(1440 \* nA \/ \(0\.9 \* GNEWS_DAILY_BUDGET\)\)\)/.test(envExample) && /Math\.max\(minMin, Math\.ceil\(\(1440 \* n\) \/ \(0\.9 \* budget\)\)\)/.test(gnewsSrc));
  check('GNEWS_DAILY_BUDGET comment states UTC-calendar-day reset (matches the code\'s own day key: toISOString().slice(0,10))', /UTC calendar day/.test(envExample) && /toISOString\(\)\.slice\(0, 10\)/.test(gnewsSrc) && /st\.day !== day/.test(gnewsSrc));
  check('GNEWS_STATE_FILE comment lists the actual per-coin fields the code writes (nextDueAt, lastOkAt, firstDone, tier, lastListedAt)', ['nextDueAt', 'lastOkAt', 'firstDone', 'tier', 'lastListedAt'].every((f) => envExample.includes(f)) && ['nextDueAt', 'lastOkAt', 'firstDone', 'lastListedAt'].every((f) => gnewsSrc.includes(f)));
  const supervisorSrc = fs.readFileSync(APP + '/supervisor.js', 'utf8');
  check('supervisor.js really does inject NEWS_REDIS:\'off\' for the default (non---with-ui) ingest child, confirming the .env.example claim', /NEWS_REDIS:\s*'off'/.test(supervisorSrc));
  check('.env.example\'s NEWS_REDIS comment names supervisor.js, its default-mode override, and --with-ui\'s exception', /supervisor\.js/.test(envExample) && /NEWS_REDIS=off/i.test(envExample) && /--with-ui/.test(envExample));
  check('NONCOIN_CACHE_FILE comment matches the code\'s actual source (Binance exchangeInfo underlyingType, non-coin perp bases)', /underlyingType/.test(envExample) && /underlyingType/.test(fs.readFileSync(APP + '/ingest/tickers.js', 'utf8')));
  const newsFileSrc = fs.readFileSync(APP + '/ingest/newsFile.js', 'utf8');
  check('NEWSFILE_CHIPS_TAKE / NEWSFILE_COUNTS_TAKE documented defaults (5000 / 20000) match the code', /5000/.test(envExample) && /20000/.test(envExample) && /NEWSFILE_CHIPS_TAKE \|\| 5000/.test(newsFileSrc) && /NEWSFILE_COUNTS_TAKE \|\| 20000/.test(newsFileSrc));

  http.request = realReq;
  await prisma.$disconnect();
  done('p3_step7_media_social');
})().catch(async (e) => { console.error('TEST CRASH', e); try { await prisma.$disconnect(); } catch (_) {} process.exit(2); });
