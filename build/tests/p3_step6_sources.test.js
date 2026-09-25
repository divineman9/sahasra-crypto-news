// Phase 3 step 6: Telegram wire channels (generalized t.me/s adapter) + official project sources
// (GitHub releases / governance forums). No network; http.request is injected everywhere.
process.chdir('D:/claude projects/crypto-news-terminal/app');
process.env.DISCORD_NEWS_WEBHOOK = process.env.DISCORD_NEWS_WEBHOOK || 'https://discord.test/webhook';
const { check, eq, done } = require('./assert_lib');
const fs = require('fs'), path = require('path');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const FX = path.join(__dirname, 'fixtures');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Minimal, realistic t.me/s/<channel> widget markup — same class hooks bwenews.js's parser reads.
function tgPage(channel, msgs) {
  const body = msgs.map((m) => `
    <div class="tgme_widget_message_wrap js-widget_message_wrap">
      <div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="${channel}/${m.id}" data-view="x">
        <div class="tgme_widget_message_text js-message_text" dir="auto">${m.text}</div>
        <span class="tgme_widget_message_meta"><a class="tgme_widget_message_date" href="https://t.me/${channel}/${m.id}"><time datetime="${m.iso}" class="time">t</time></a></span>
      </div>
    </div>`).join('');
  return `<!DOCTYPE html><html><body><div class="tgme_channel_history">${body}</div></body></html>`;
}

function fillDates(text, subs) {
  let out = text;
  for (const [k, v] of Object.entries(subs)) out = out.split('{{' + k + '}}').join(v);
  return out;
}

(async () => {
  const T = require(APP + '/ingest/tickers.js');
  await T.loadUniverse();

  console.log('— TG_CHANNELS config sanity (incl. F1: unverified by default)');
  const { TG_CHANNELS, CRYPTO_FILTER, MACRO_FILTER } = require(APP + '/ingest/config.js');
  eq('7 wire channels configured', TG_CHANNELS.length, 7);
  const tgNames = TG_CHANNELS.map((c) => 'tg:' + c.channel.toLowerCase());
  eq('adapter names unique', new Set(tgNames).size, tgNames.length);
  const byChan = Object.fromEntries(TG_CHANNELS.map((c) => [c.channel, c]));
  check('TreeNewsFeed/WatcherGuru/wublockchainenglish/Walter_Bloomberg: tier 2, 60s', ['TreeNewsFeed', 'WatcherGuru', 'wublockchainenglish', 'Walter_Bloomberg'].every((c) => byChan[c] && byChan[c].tier === 2 && byChan[c].intervalMs === 60000));
  check('PeckShieldAlert/CertiKAlert: tier 3, 120s', ['PeckShieldAlert', 'CertiKAlert'].every((c) => byChan[c] && byChan[c].tier === 3 && byChan[c].intervalMs === 120000));
  check('whale_alert_io: tier 4, 120s, alertable false, maxImportance 10', byChan.whale_alert_io && byChan.whale_alert_io.tier === 4 && byChan.whale_alert_io.intervalMs === 120000 && byChan.whale_alert_io.alertable === false && byChan.whale_alert_io.maxImportance === 10);
  check('Walter_Bloomberg has a filter combining CRYPTO_FILTER + macro terms', byChan.Walter_Bloomberg.filter && byChan.Walter_Bloomberg.filter.indexOf(CRYPTO_FILTER) !== -1 && /Fed|FOMC|CPI|Powell|Treasury|tariff/.test(byChan.Walter_Bloomberg.filter));
  check('BWEnews is not in TG_CHANNELS (kept as its own dedicated adapter)', !TG_CHANNELS.some((c) => /bwenews/i.test(c.channel)));
  check('F1: all 7 wire channels default to verified:false (unverified)', TG_CHANNELS.every((c) => c.verified === false), TG_CHANNELS.map((c) => [c.channel, c.verified]));

  console.log('— F2: MACRO_FILTER recall (widened terms, still \\b-bounded)');
  const wbRe = new RegExp(CRYPTO_FILTER + '|' + MACRO_FILTER, 'i');
  const macroPos = [
    'TARIFFS ON CHINA RAISED TO 60%',
    'US 10-YEAR TREASURY YIELD HITS 5%',
    'NONFARM PAYROLLS +250K',
    '*FED HOLDS RATES STEADY',
    '*FEDERAL RESERVE RAISES RATES 25BPS',
    '*U.S. CPI RISES 0.3% M/M',
    "*POWELL: WE ARE NOT IN A HURRY",
    '*RATE CUT EXPECTED IN DECEMBER',
    '*JOBLESS CLAIMS 220K',
    '*GDP GROWS 2.8%',
    '*PCE PRICE INDEX RISES 0.2%',
    '*TREASURY YIELDS FALL',
  ];
  eq('MACRO_FILTER (+ CRYPTO_FILTER) matches all required macro positives (>=10)', macroPos.filter((t) => wbRe.test(t)), macroPos);
  const macroNeg = ['Apple beats earnings', 'Taylor Swift tour', '*FEDEX BEATS ESTIMATES', '*STOCKS OPEN HIGHER'];
  eq('...and none of the non-macro negatives', macroNeg.filter((t) => wbRe.test(t)), []);

  console.log('— telegram adapter: per-channel options, filters, url shape, dedupe, 7-day cutoff');
  const http = require(APP + '/ingest/http.js');
  const realReq = http.request;
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const pages = {
    'https://t.me/s/TreeNewsFeed': tgPage('TreeNewsFeed', [{ id: 1, text: 'Binance lists new spot pair', iso: iso(60000) }]),
    'https://t.me/s/Walter_Bloomberg': tgPage('Walter_Bloomberg', [
      { id: 1, text: 'Fed cuts rates by 25bp', iso: iso(60000) },
      { id: 2, text: 'SEC approves spot ETH ETF', iso: iso(120000) },
      { id: 3, text: 'Apple beats earnings', iso: iso(180000) },
    ]),
    'https://t.me/s/WatcherGuru': tgPage('WatcherGuru', [{ id: 1, text: 'Bitcoin ETF sees record inflows', iso: iso(60000) }]),
    'https://t.me/s/wublockchainenglish': tgPage('wublockchainenglish', [{ id: 1, text: 'Chinese exchange resumes withdrawals', iso: iso(60000) }]),
    'https://t.me/s/PeckShieldAlert': tgPage('PeckShieldAlert', [{ id: 1, text: 'ProtocolX hacked and exploited for $2M', iso: iso(60000) }]),
    'https://t.me/s/CertiKAlert': tgPage('CertiKAlert', [{ id: 1, text: 'Security alert: contract drained via reentrancy exploit', iso: iso(60000) }]),
    'https://t.me/s/whale_alert_io': tgPage('whale_alert_io', [{ id: 1, text: '500,000,000 XRP (250,000,000 USD) transferred from unknown wallet to Binance', iso: iso(60000) }]),
  };
  http.request = async (url) => ({ status: 200, text: pages[url] || '', json: () => ({}) });
  delete require.cache[require.resolve(APP + '/ingest/adapters/telegram.js')];
  const telegram = require(APP + '/ingest/adapters/telegram.js');
  const ads = telegram.make();
  const by = Object.fromEntries(ads.map((a) => [a.name, a]));
  check('one adapter per configured channel', ads.length === TG_CHANNELS.length, ads.map((a) => a.name));

  const tn = await by['tg:treenewsfeed'].run();
  eq('title/url/tier/kind shape', [tn[0].title, tn[0].url, tn[0].sourceTier, tn[0].kind, tn[0].sourceDomain], ['Binance lists new spot pair', 'https://t.me/TreeNewsFeed/1', 2, 'news', 't.me']);

  const wb = await by['tg:walter_bloomberg'].run();
  eq('Walter_Bloomberg filter keeps macro + crypto items, drops off-topic', wb.map((i) => i.title), ['Fed cuts rates by 25bp', 'SEC approves spot ETH ETF']);

  const wh = await by['tg:whale_alert_io'].run();
  check('whale_alert_io: alertable:false, maxImportance:10, tier 4', wh.length === 1 && wh[0].alertable === false && wh[0].maxImportance === 10 && wh[0].sourceTier === 4, wh);

  check('PeckShieldAlert/CertiKAlert adapters at tier 3 / 120s', by['tg:peckshieldalert'].tier === 3 && by['tg:peckshieldalert'].intervalMs === 120000 && by['tg:certikalert'].tier === 3 && by['tg:certikalert'].intervalMs === 120000);

  const { classify } = require(APP + '/ingest/classify.js');
  const pk = await by['tg:peckshieldalert'].run();
  const ck = await by['tg:certikalert'].run();
  eq('PeckShieldAlert "hacked and exploited" -> category hack', classify(pk[0], []).category, 'hack');
  eq('CertiKAlert "drained via reentrancy exploit" -> category hack', classify(ck[0], []).category, 'hack');

  http.request = async (url) => ({
    status: 200,
    text: url === 'https://t.me/s/TreeNewsFeed'
      ? tgPage('TreeNewsFeed', [
        { id: 10, text: 'Week-old story, outside the 7-day window', iso: iso(8 * 86400000) },
        { id: 11, text: 'Fresh story inside the window', iso: iso(60000) },
      ])
      : '',
    json: () => ({}),
  });
  delete require.cache[require.resolve(APP + '/ingest/adapters/telegram.js')];
  const telegram2 = require(APP + '/ingest/adapters/telegram.js');
  const cutoffItems = await telegram2.make().find((a) => a.name === 'tg:treenewsfeed').run();
  eq('7-day cutoff drops the old message', cutoffItems.map((i) => i.title), ['Fresh story inside the window']);

  http.request = async (url) => ({
    status: 200,
    text: url === 'https://t.me/s/TreeNewsFeed'
      ? tgPage('TreeNewsFeed', [{ id: 20, text: 'Duplicate story', iso: iso(60000) }, { id: 20, text: 'Duplicate story', iso: iso(60000) }])
      : '',
    json: () => ({}),
  });
  delete require.cache[require.resolve(APP + '/ingest/adapters/telegram.js')];
  const telegram3 = require(APP + '/ingest/adapters/telegram.js');
  const dupItems = await telegram3.make().find((a) => a.name === 'tg:treenewsfeed').run();
  eq('dedupe within a page (same channel/id twice -> one item)', dupItems.length, 1);
  http.request = realReq;

  console.log('— F1: quietHealth on the telegram adapter itself (default unverified, override verified)');
  check('every configured wire channel adapter is quietHealth:true (unverified default)', ads.every((a) => a.quietHealth === true), ads.map((a) => [a.name, a.quietHealth]));
  const verifiedAdapter = telegram.makeChannelAdapter({ channel: 'SomeVerifiedWire', tier: 2, intervalMs: 60000, verified: true });
  eq('an entry explicitly marked verified:true gets quietHealth:false', verifiedAdapter.quietHealth, false);

  console.log('— F5: wire title cleanup (first line, or the WHOLE text when there is no line break — B2: no more sentence-splitting), strip wire prefix + leading/trailing emoji, strip trailing Source:/url, skip link-only');
  const wireMsgs = [
    { id: 100, text: '🚨 JUST IN: Binance halts XRP withdrawals for maintenance.<br/>Source: twitter.com/whale_alert', iso: iso(60000) },
    { id: 101, text: '⚡️ BREAKING: SEC delays spot ETF decision to next quarter<br/>https://example.com/article', iso: iso(90000) },
    { id: 102, text: 'https://t.me/s/somechannel/12345', iso: iso(120000) },
    { id: 103, text: 'Ethereum gas fees spike after network congestion. More detail continues here without a natural line break at all in this message.', iso: iso(150000) },
  ];
  http.request = async (url) => ({ status: 200, text: url === 'https://t.me/s/TestWire' ? tgPage('TestWire', wireMsgs) : '', json: () => ({}) });
  const testWireAdapter = telegram.makeChannelAdapter({ channel: 'TestWire', tier: 2, intervalMs: 60000 });
  const wireItems = await testWireAdapter.run();
  eq('link-only post (id 102) is skipped -> 3 of 4 messages become items', wireItems.length, 3);
  eq('leading emoji + "JUST IN:" stripped; trailing "Source: ..." line excluded (real <br> line break)', wireItems[0].title, 'Binance halts XRP withdrawals for maintenance.');
  eq('leading emoji + "BREAKING:" stripped; trailing bare-url line excluded (real <br> line break)', wireItems[1].title, 'SEC delays spot ETF decision to next quarter');
  eq('B2: no line break at all -> the WHOLE text is kept (no first-sentence truncation)', wireItems[2].title, 'Ethereum gas fees spike after network congestion. More detail continues here without a natural line break at all in this message.');
  eq('cleanTitle: emoji + wire prefix stripped regardless of which comes first', telegram.cleanTitle('BREAKING: 🔥 Something happened'), 'Something happened');
  eq('firstLineOrFull: a real newline wins (only the first line is kept)', telegram.firstLineOrFull('First line has two. Sentences here.\nSecond line'), 'First line has two. Sentences here.');
  eq('firstLineOrFull: no newline at all -> the whole text (B2 — used to be cut to the first sentence)', telegram.firstLineOrFull('One. Two. Three.'), 'One. Two. Three.');

  console.log('— B2: single-line headlines with ordinary abbreviations must survive cleanTitle intact (was truncated at "U.S."/"vs."/"Inc."/"approx."/"v.")');
  const b2Cases = [
    ['JUST IN: U.S. Senate passes stablecoin bill 68-30', 'U.S. Senate passes stablecoin bill 68-30'],
    ['*POWELL: U.S. ECONOMY IS STRONG, INFLATION EASING', '*POWELL: U.S. ECONOMY IS STRONG, INFLATION EASING'],
    ['JUST IN: SEC vs. Coinbase hearing set for Oct. 2', 'SEC vs. Coinbase hearing set for Oct. 2'],
    ['Binance Inc. to list XYZ on Sept. 30 at 10:00 UTC', 'Binance Inc. to list XYZ on Sept. 30 at 10:00 UTC'],
    ['MicroStrategy buys 5,000 BTC for approx. $500M', 'MicroStrategy buys 5,000 BTC for approx. $500M'],
    ['The SEC v. Ripple case is over.', 'The SEC v. Ripple case is over.'],
  ];
  for (const [raw, expected] of b2Cases) eq(`B2 survives intact: "${raw}"`, telegram.cleanTitle(raw), expected);

  console.log('— B2: the Walter_Bloomberg filter sees the FULL cleaned title, so a keyword after an abbreviation is not lost');
  const wbFilterRe = new RegExp(CRYPTO_FILTER + '|' + MACRO_FILTER, 'i');
  check('KEEP "JUST IN: U.S. SEC approves spot SOL ETF" (SEC keyword survives)', wbFilterRe.test(telegram.cleanTitle('JUST IN: U.S. SEC approves spot SOL ETF')));
  check('KEEP "*POWELL: U.S. ECONOMY IS STRONG, INFLATION EASING" (Powell/inflation keywords survive)', wbFilterRe.test(telegram.cleanTitle('*POWELL: U.S. ECONOMY IS STRONG, INFLATION EASING')));
  const walterPage = tgPage('Walter_Bloomberg', [
    { id: 900, text: 'JUST IN: U.S. Senate passes stablecoin bill 68-30', iso: iso(60000) },
  ]);
  http.request = async (url) => ({ status: 200, text: url === 'https://t.me/s/Walter_Bloomberg' ? walterPage : '', json: () => ({}) });
  delete require.cache[require.resolve(APP + '/ingest/adapters/telegram.js')];
  const telegramWB = require(APP + '/ingest/adapters/telegram.js');
  const wbItems = await telegramWB.make().find((a) => a.name === 'tg:walter_bloomberg').run();
  eq('end-to-end through the adapter: the stablecoin-bill headline is kept, untruncated', wbItems.map((i) => i.title), ['U.S. Senate passes stablecoin bill 68-30']);

  console.log('— MINOR 1: leading/trailing emoji stripped, but a symbol INSIDE the title (e.g. an arrow) survives');
  eq('mid-title arrow is kept', telegram.cleanTitle('BTC → $100k'), 'BTC → $100k');
  eq('leading rocket + trailing fire both stripped, arrow in the middle kept', telegram.cleanTitle('\u{1F680} ETH → $5k \u{1F525}'), 'ETH → $5k');

  console.log('— B2: a long single-line post is cut to <=240 chars at a word boundary, never mid-word');
  const longWord = 'Ethereum gas fees spike as network activity surges across DeFi protocols and NFT marketplaces worldwide following the latest mainnet upgrade which developers say improves throughput and lowers costs for everyday users across the ecosystem significantly this quarter';
  check('fixture is actually >240 chars (a meaningful test)', longWord.length > 240, longWord.length);
  const longPage = tgPage('TestWire', [{ id: 200, text: longWord, iso: iso(60000) }]);
  http.request = async (url) => ({ status: 200, text: url === 'https://t.me/s/TestWire' ? longPage : '', json: () => ({}) });
  delete require.cache[require.resolve(APP + '/ingest/adapters/telegram.js')];
  const telegramLong = require(APP + '/ingest/adapters/telegram.js');
  const longItems = await telegramLong.makeChannelAdapter({ channel: 'TestWire', tier: 2, intervalMs: 60000 }).run();
  check('title length <= 240', longItems[0].title.length <= 240, longItems[0].title.length);
  check('cut at a word boundary (ends "…" and the char right before it is not mid-word of the source)', /…$/.test(longItems[0].title) && longWord.startsWith(longItems[0].title.slice(0, -1).trimEnd()), longItems[0].title);
  eq('truncateAtWord: short strings pass through untouched', telegram.truncateAtWord('short title', 240), 'short title');
  http.request = realReq;

  console.log('— bwenews.js untouched (public behaviour/exports unchanged)');
  delete require.cache[require.resolve(APP + '/ingest/adapters/bwenews.js')];
  const bwenews = require(APP + '/ingest/adapters/bwenews.js');
  const bwAdapter = bwenews.make();
  check('tg:bwenews keeps its own name/tier/interval', bwAdapter.name === 'tg:bwenews' && bwAdapter.tier === 2 && bwAdapter.intervalMs === 30000, bwAdapter);
  check('parseBwenews still exported (reused by telegram.js)', typeof bwenews.parseBwenews === 'function');

  console.log('— official adapter: pure helpers');
  const official = require(APP + '/ingest/adapters/official.js');
  eq('tagOf extracts the version from a /releases/tag/ url', official.tagOf('https://github.com/org/repo/releases/tag/v1.3.0-rc1'), 'v1.3.0-rc1');
  check('isUnstableRelease: v1.2.0 is stable', !official.isUnstableRelease('v1.2.0', 'v1.2.0'));
  check('isUnstableRelease: -rc1 tag is unstable', official.isUnstableRelease('v1.3.0-rc1', 'v1.3.0-rc1'));
  check('isUnstableRelease: nightly build is unstable', official.isUnstableRelease('nightly-build', 'nightly-build'));
  eq('releaseTitle prefixes the project name when absent', official.releaseTitle('Bitcoin Core', 'v1.2.0'), 'Bitcoin Core v1.2.0');
  eq('releaseTitle leaves the title alone when the name is already present', official.releaseTitle('Bitcoin Core', 'Bitcoin Core 27.0'), 'Bitcoin Core 27.0');

  console.log('— F4: TAG_UNSTABLE_RE / TITLE_UNSTABLE_RE anchored (no false positives on plain version strings)');
  const tagKeep = ['latest', 'arch-v1.2', 'source-1.0', 'v1.2.0', 'mainnet-v1.35.1', 'op-node/v1.9.3', 'polkadot-stable2409'];
  eq('plain/unrelated tags are NOT dropped', tagKeep.filter((t) => official.TAG_UNSTABLE_RE.test(t)), []);
  const tagDrop = ['v1.3.0-rc1', '2.0.0-beta.1', 'testnet-v1.40.1', 'devnet-v1.2', 'nightly-2026-09-20', 'v1.31.0-rc1', 'v1.2.3-beta'];
  eq('rc/beta/testnet/devnet/nightly tags ARE dropped', tagDrop.filter((t) => official.TAG_UNSTABLE_RE.test(t)), tagDrop);
  check('TITLE_UNSTABLE_RE also catches the spelled-out "Release Candidate 2"', official.TITLE_UNSTABLE_RE.test('Release Candidate 2 of v3.0'));
  check('TITLE_UNSTABLE_RE does not false-positive on "Predictive routing v2"', !official.TITLE_UNSTABLE_RE.test('Predictive routing v2'));

  console.log('— F3: GOVERNANCE_RE word-bounded, leading-bracket-only');
  const govNeg = ['Devoted community call recap', 'Immigrant founders meetup', 'Taipei meetup', 'Fragrant tea AMA', 'Introduce yourself [new members]'];
  eq('non-governance chatter (incl. AIP/vote/grant as mid-word substrings) is dropped', govNeg.filter((t) => official.GOVERNANCE_RE.test(t)), []);
  const govPos = ['[RFC] Deploy Uniswap v4 on a new chain', 'ARFC: Add wstETH', 'Growth grants Q3 report', 'Snapshot: choose a mascot', 'Request for comment: new chain deployment', '[Solved] wallet issue'];
  eq('real governance topics (incl. a LEADING bracketed tag) are kept', govPos.filter((t) => official.GOVERNANCE_RE.test(t)), govPos);

  console.log('— official adapter: GitHub releases (stable-only) + Discourse governance filter, via fixtures');
  const ghAtom = fillDates(fs.readFileSync(path.join(FX, 'gh_releases.atom'), 'utf8'), {
    RECENT_1: iso(2 * 3600000),
    RECENT_2: iso(3 * 3600000),
    RECENT_3: iso(4 * 3600000),
    OLD: iso(10 * 86400000),
  });
  const forumRss = fillDates(fs.readFileSync(path.join(FX, 'gov_forum.rss'), 'utf8'), {
    RECENT_1: new Date(now - 1 * 3600000).toUTCString(),
    RECENT_2: new Date(now - 2 * 3600000).toUTCString(),
    RECENT_3: new Date(now - 3 * 3600000).toUTCString(),
    RECENT_4: new Date(now - 4 * 3600000).toUTCString(),
    RECENT_5: new Date(now - 5 * 3600000).toUTCString(),
    OLD: new Date(now - 10 * 86400000).toUTCString(),
  });
  const officialPages = {
    'https://github.com/bitcoin/bitcoin/releases.atom': ghAtom,
    'https://gov.uniswap.org/latest.rss': forumRss,
  };
  http.request = realReq;
  const realReq2 = http.request;
  http.request = async (url) => ({ status: 200, text: officialPages[url] || '', notModified: false, headers: {}, json: () => ({}) });
  delete require.cache[require.resolve(APP + '/ingest/adapters/official.js')];
  const official2 = require(APP + '/ingest/adapters/official.js');
  const sources = official2.loadSources();
  check('officialSources.json has both github and forum entries, all verified:false, https urls', sources.length >= 27 && sources.every((s) => s.verified === false && /^https:\/\//.test(s.url)) && sources.some((s) => s.type === 'github') && sources.some((s) => s.type === 'forum'), sources.length);
  const ads2 = official2.make({ sources });
  const byName2 = Object.fromEntries(ads2.map((a) => [a.name, a]));
  check('gh:bitcoin/bitcoin adapter: tier 3, 30 min, quietHealth (unverified)', byName2['gh:bitcoin/bitcoin'] && byName2['gh:bitcoin/bitcoin'].tier === 3 && byName2['gh:bitcoin/bitcoin'].intervalMs === 1800000 && byName2['gh:bitcoin/bitcoin'].quietHealth === true, byName2['gh:bitcoin/bitcoin']);
  const ghItems = await byName2['gh:bitcoin/bitcoin'].run();
  eq('stable-only filter: v1.2.0 kept; rc1/nightly/>7d dropped', ghItems.map((i) => i.title), ['Bitcoin Core v1.2.0']);
  check('github item: kind official, tier 3, hintTickers [BTC], sourceDomain github.com', ghItems[0].kind === 'official' && ghItems[0].sourceTier === 3 && JSON.stringify(ghItems[0].hintTickers) === JSON.stringify(['BTC']) && ghItems[0].sourceDomain === 'github.com', ghItems[0]);

  check('forum:gov.uniswap.org adapter: tier 3, 30 min, quietHealth', byName2['forum:gov.uniswap.org'] && byName2['forum:gov.uniswap.org'].tier === 3 && byName2['forum:gov.uniswap.org'].intervalMs === 1800000 && byName2['forum:gov.uniswap.org'].quietHealth === true);
  const forumItems = await byName2['forum:gov.uniswap.org'].run();
  eq('governance filter keeps RFC/Temp Check/Snapshot, drops chatter + old', forumItems.map((i) => i.title), [
    '[RFC] Deploy Uniswap v4 on a new chain',
    'Temp Check: Reduce protocol fee parameter',
    'Snapshot vote live: treasury grant allocation',
  ]);
  check('forum items: kind official, tier 3, alertable false, hintTickers [UNI]', forumItems.every((i) => i.kind === 'official' && i.sourceTier === 3 && i.alertable === false && JSON.stringify(i.hintTickers) === JSON.stringify(['UNI'])), forumItems);
  http.request = realReq;

  console.log('— config sanity: adapter names unique across telegram + official, urls https');
  const officialNames = sources.map((s) => official2.adapterName(s));
  eq('official adapter names unique', new Set(officialNames).size, officialNames.length);
  const allNames = [...tgNames, ...officialNames];
  eq('telegram + official adapter names unique together', new Set(allNames).size, allNames.length);

  console.log('— classify: official baseline importance, still promoted by category regexes, maxImportance cap');
  eq('github baseline importance 40 (no stronger category detected)', classify({ kind: 'official', sourceName: 'gh:org/repo', title: 'v2.0.0 stable release', hintCategory: null }, ['BTC']).importance, 40);
  eq('forum baseline importance 30', classify({ kind: 'official', sourceName: 'forum:host', title: 'Temp Check: adjust a parameter', hintCategory: null }, ['UNI']).importance, 30);
  eq('blog baseline importance 35', classify({ kind: 'official', sourceName: 'blog:host', title: 'Project update', hintCategory: null }, ['ETH']).importance, 35);
  const clsHack = classify({ kind: 'official', sourceName: 'gh:org/repo', title: 'Repository hacked, funds stolen from CI pipeline', hintCategory: null }, ['BTC']);
  eq('official item still promoted by the hack regex (85, not the 40 baseline)', [clsHack.category, clsHack.importance], ['hack', 85]);
  const clsReg = classify({ kind: 'official', sourceName: 'forum:host', title: 'SEC scrutiny follows a new governance proposal', hintCategory: null }, ['UNI']);
  eq('official item promoted by the regulatory regex (70)', clsReg.importance, 70);
  const clsCap = classify({ kind: 'news', sourceName: 'tg:whale_alert_io', title: 'Wallet hacked, funds stolen', hintCategory: null, maxImportance: 10 }, []);
  eq('maxImportance caps a would-be-85 hack down to 10', clsCap.importance, 10);
  const clsCapLow = classify({ kind: 'news', sourceName: 'tg:whale_alert_io', title: '500,000,000 XRP moved', hintCategory: null, maxImportance: 10 }, []);
  check('maxImportance is a ceiling, not a floor', clsCapLow.importance <= 10, clsCapLow);

  console.log('— F6: maxImportance also caps classify\'s two early-return paths');
  const ALPHA_TITLE = "Binance Alpha Listing(Doesn't mean official listing): Binance Alpha lists new tokens";
  eq('alpha-listing early return: uncapped stays 30 (baseline, unaffected by the fix)', classify({ kind: 'news', title: ALPHA_TITLE, sourceTier: 2, hintCategory: null }, []).importance, 30);
  eq('alpha-listing early return: capped by maxImportance', classify({ kind: 'news', title: ALPHA_TITLE, sourceTier: 2, hintCategory: null, maxImportance: 5 }, []).importance, 5);
  const STOCK_TITLE = 'Bitget lists new tokenized stocks for pre-market perpetual trading';
  eq('stock-perp early return: uncapped stays 30 (baseline, unaffected by the fix)', classify({ kind: 'news', title: STOCK_TITLE, sourceTier: 2, hintCategory: null }, []).importance, 30);
  eq('stock-perp early return: capped by maxImportance', classify({ kind: 'news', title: STOCK_TITLE, sourceTier: 2, hintCategory: null, maxImportance: 3 }, []).importance, 3);

  console.log('— store: whale_alert maxImportance end-to-end, official kind persisted (test DB)');
  const { Store } = require(APP + '/ingest/store.js');
  const { StoryIndex } = require(APP + '/ingest/cluster.js');
  const { Alerts } = require(APP + '/ingest/discord.js');
  const { MemoryRedis } = require(APP + '/ingest/redisOptional.js');
  const redis2 = new MemoryRedis();
  const alerts2 = new Alerts({ prisma, redis: redis2 });
  const URL_PREFIX = 'https://test.local/p3s6/';
  await prisma.post.deleteMany({ where: { url: { startsWith: URL_PREFIX } } });
  const store2 = new Store({ prisma, redis: redis2, storyIndex: new StoryIndex(), alerts: alerts2 });
  await store2.init();
  const whaleItem = { sourceName: 'tg:whale_alert_io', sourceTier: 4, kind: 'news', exchange: null, title: '500,000,000 XRP (250,000,000 USD) transferred from unknown wallet to Binance', url: URL_PREFIX + 'whale1', publishedAt: new Date(), hintCategory: null, hintTickers: ['XRP'], sourceDomain: 't.me', alertable: false, maxImportance: 10 };
  await store2.save(whaleItem, { warm: true });
  const wp = await prisma.post.findUnique({ where: { url: whaleItem.url } });
  eq('whale item stored with importance capped to 10', wp && wp.importance, 10);
  eq('... and alertState null (alertable:false blocked it)', wp && wp.alertState, null);
  const ghItem2 = { sourceName: 'gh:bitcoin/bitcoin', sourceTier: 3, kind: 'official', exchange: null, title: 'Bitcoin Core v9.9.9', url: URL_PREFIX + 'gh1', publishedAt: new Date(), hintCategory: null, hintTickers: ['BTC'], sourceDomain: 'github.com' };
  await store2.save(ghItem2, { warm: true });
  const gp = await prisma.post.findUnique({ where: { url: ghItem2.url } });
  eq('official github item stored with kind official', gp && gp.kind, 'official');
  eq('... and baseline importance 40', gp && gp.importance, 40);
  await prisma.post.deleteMany({ where: { url: { startsWith: URL_PREFIX } } });

  console.log('— CoinGecko links mapping (pure function, fixture only — the CLI cannot run here, no internet)');
  const { mapCoinGeckoLinks } = require(path.join(__dirname, '..', 'tools', 'coingecko_links.js'));
  const cg = JSON.parse(fs.readFileSync(path.join(FX, 'coingecko_coin.json'), 'utf8'));
  const proposals = mapCoinGeckoLinks('BTC', cg);
  check('both github repos proposed as releases.atom candidates', proposals.some((p) => p.type === 'github' && p.url === 'https://github.com/bitcoin/bitcoin/releases.atom' && p.base === 'BTC' && p.verified === false) && proposals.some((p) => p.type === 'github' && p.url === 'https://github.com/bitcoin/bips/releases.atom'), proposals);
  check('homepage proposed as a blog candidate', proposals.some((p) => p.type === 'blog' && p.url === 'https://bitcoin.org/'));
  check('announcement_url proposed as a blog candidate', proposals.some((p) => p.type === 'blog' && p.url === 'https://bitcointalk.org/index.php?topic=1.0'));
  check('official_forum_url proposed as a forum candidate (latest.rss appended)', proposals.some((p) => p.type === 'forum' && p.url === 'https://bitcointalk.org/latest.rss'));
  eq('missing links object -> no throw, empty array', mapCoinGeckoLinks('XYZ', {}), []);
  eq('null coinJson -> no throw, empty array', mapCoinGeckoLinks('XYZ', null), []);

  console.log('— B1 fix: the once-per-6h quietHealth policy lives in scheduler._backoffUntil (not a health.js side-channel that can race it)');
  const { Scheduler } = require(APP + '/ingest/scheduler.js');
  const sched = new Scheduler({ redis: null, onItems: async () => {} });
  const quietAdapterDef = { name: 'gh:test/repo', intervalMs: 1800000, quietHealth: true };
  const plainAdapterDef = { name: 'rss:normal', intervalMs: 1800000, quietHealth: false };
  const errPlain = new Error('HTTP 404');
  const tRef = Date.now();
  const b5 = sched._backoffUntil(quietAdapterDef, { consecutiveErrors: 5 }, errPlain);
  check('quiet adapter, 5 consecutive errors -> still under the normal <=10min ceiling', b5 - tRef <= 10 * 60000 + 2000, b5 - tRef);
  const b6 = sched._backoffUntil(quietAdapterDef, { consecutiveErrors: 6 }, errPlain);
  check('quiet adapter, 6 consecutive errors -> ~6h backoff', Math.abs(b6 - (tRef + 6 * 3600000)) < 5000, b6 - tRef);
  const b7 = sched._backoffUntil(quietAdapterDef, { consecutiveErrors: 7 }, errPlain);
  check('quiet adapter, 7 consecutive errors -> still ~6h (not escalating further)', Math.abs(b7 - (tRef + 6 * 3600000)) < 5000, b7 - tRef);
  const bNormal6 = sched._backoffUntil(plainAdapterDef, { consecutiveErrors: 6 }, errPlain);
  check('non-quiet adapter, 6 consecutive errors -> still under the normal <=10min ceiling (unaffected)', bNormal6 - tRef <= 10 * 60000 + 2000, bNormal6 - tRef);

  sched.add({ name: 'gh:qh/repo', tier: 3, intervalMs: 1800000, quietHealth: true, run: async () => [] });
  sched.add({ name: 'rss:normal2', tier: 3, intervalMs: 90000, run: async () => [] });
  const h = Object.fromEntries(sched.health().map((e) => [e.name, e]));
  eq('scheduler.health() reports quietHealth per adapter (true for an unverified one)', h['gh:qh/repo'].quietHealth, true);
  eq('...(false/default for a normal adapter)', h['rss:normal2'].quietHealth, false);
  eq('scheduler.forceBackoff was removed (B1 fix: the policy now lives only in _backoffUntil)', typeof sched.forceBackoff, 'undefined');

  console.log('— B1 fix: virtual-clock integration — a permanently-failing quietHealth adapter, 30 virtual hours, real Scheduler + real startHealth, with drift + a slow (mid-tick) failing run (the exact race the bug needed)');
  {
    const realDateNow = Date.now;
    const realSetTimeout = global.setTimeout, realClearTimeout = global.clearTimeout;
    const realSetInterval = global.setInterval, realClearInterval = global.clearInterval;
    let vnow = 1_800_000_000_000;
    let seq = 0;
    const q = [];
    const DRIFT_MS = 5000; // each health-check tick fires a bit late (setInterval drift >= 0)
    const FAIL_DELAY = 70000; // the failing run itself takes >1 health-check interval to reject
    try {
      Date.now = () => vnow;
      global.setTimeout = (fn, ms) => { const t = { id: ++seq, due: vnow + Math.max(0, ms || 0), fn, cleared: false }; q.push(t); return t; };
      global.clearTimeout = (t) => { if (t) t.cleared = true; };
      global.setInterval = (fn, ms) => {
        const hnd = { cleared: false };
        const arm = (due) => { const t = { id: ++seq, due, fn: () => { fn(); if (!hnd.cleared) arm(t.due + ms + DRIFT_MS); }, cleared: false }; hnd.cur = t; q.push(t); };
        arm(vnow + ms);
        return hnd;
      };
      global.clearInterval = (hnd) => { if (hnd) { hnd.cleared = true; if (hnd.cur) hnd.cur.cleared = true; } };
      const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

      delete require.cache[require.resolve(APP + '/ingest/scheduler.js')];
      delete require.cache[require.resolve(APP + '/ingest/health.js')];
      const { Scheduler: VScheduler } = require(APP + '/ingest/scheduler.js');
      const { startHealth: vStartHealth } = require(APP + '/ingest/health.js');
      const vlogs = [];
      const oLog = console.log, oErr = console.error;
      console.log = (...a) => vlogs.push(a.join(' '));
      console.error = () => {};
      const attempts = [];
      const vs = new VScheduler({ redis: null, onItems: async () => {} });
      vs.add({
        name: 'gh:dead/repo', tier: 3, intervalMs: 1800000, quietHealth: true,
        run: () => new Promise((_, rej) => { attempts.push(vnow); setTimeout(() => rej(Object.assign(new Error('timeout'), { status: 0 })), FAIL_DELAY); }),
      });
      vs.start();
      vStartHealth({ scheduler: vs, alerts: null });
      const end = vnow + 30 * 3600000;
      while (q.length) {
        q.sort((a, b) => a.due - b.due || a.id - b.id);
        const t = q.shift();
        if (t.cleared) continue;
        if (t.due > end) break;
        vnow = Math.max(vnow, t.due);
        t.fn();
        await flush();
      }
      console.log = oLog; console.error = oErr;
      check('~10 attempts over 30 virtual hours (the B1 bug reproduced 72-78 here)', attempts.length >= 9 && attempts.length <= 12, attempts.length);
      const deadCount = vlogs.filter((l) => /^\[official\] gh:dead\/repo looks dead/.test(l)).length;
      eq('single "looks dead" line over the whole 30h window', deadCount, 1);
    } finally {
      Date.now = realDateNow;
      global.setTimeout = realSetTimeout;
      global.clearTimeout = realClearTimeout;
      global.setInterval = realSetInterval;
      global.clearInterval = realClearInterval;
      delete require.cache[require.resolve(APP + '/ingest/scheduler.js')];
      delete require.cache[require.resolve(APP + '/ingest/health.js')];
    }
  }

  console.log('— health.js: unverified (quietHealth) source never alerts Discord; verified source alerts as before');
  const staleOkAt = Date.now() - 3600000; // well past any tier's health-alert age threshold
  const healthAlertCalls = [];
  const fakeAlerts = { healthAlert: async (name, text) => { healthAlertCalls.push({ name, text }); } };
  const fakeScheduler = {
    health: () => [
      { name: 'gh:dead/repo', tier: 3, intervalMs: 1800000, quietHealth: true, consecutiveErrors: 7, consecutiveSaveErrors: 0, lastErr: 'HTTP 404', lastOkAt: staleOkAt },
      { name: 'rss:verified-source', tier: 3, intervalMs: 90000, quietHealth: false, consecutiveErrors: 3, consecutiveSaveErrors: 0, lastErr: 'HTTP 500', lastOkAt: staleOkAt },
      { name: 'tg:dead_wire', tier: 2, intervalMs: 60000, quietHealth: true, consecutiveErrors: 7, consecutiveSaveErrors: 0, lastErr: 'HTTP 404', lastOkAt: staleOkAt },
    ],
  };
  const { startHealth } = require(APP + '/ingest/health.js');
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); origLog.apply(console, args); };
  const stopHealth = startHealth({ scheduler: fakeScheduler, alerts: fakeAlerts, intervalMs: 15 });
  await sleep(40);
  stopHealth();
  console.log = origLog;
  eq('unverified source never triggers a Discord health alert', healthAlertCalls.filter((c) => c.name === 'gh:dead/repo').length, 0);
  check('verified source (quietHealth:false) alerts normally despite the same staleness', healthAlertCalls.some((c) => c.name === 'rss:verified-source'), healthAlertCalls);
  const deadLines = logs.filter((l) => /^\[official\] gh:dead\/repo looks dead/.test(l));
  check('official-source "looks dead" line names officialSources.json', deadLines.length >= 1 && /set verified:true or remove it from officialSources\.json/.test(deadLines[0]), deadLines[0]);
  const wireDeadLines = logs.filter((l) => /^\[official\] tg:dead_wire looks dead/.test(l));
  check('MINOR 2: a tg:* adapter\'s "looks dead" line points at TG_CHANNELS (config.js), not officialSources.json', wireDeadLines.length >= 1 && /set verified:true in TG_CHANNELS \(config\.js\) or remove it/.test(wireDeadLines[0]) && !/officialSources\.json/.test(wireDeadLines[0]), wireDeadLines[0]);

  console.log('— F7: "no successful poll" line throttled to once/hour for quietHealth adapters (non-quiet adapters unchanged, log every tick)');
  const f7Stale = Date.now() - 3600000;
  const f7Errors = [];
  const origErr2 = console.error;
  console.error = (...a) => { f7Errors.push(a.join(' ')); };
  const f7Scheduler = {
    health: () => [
      { name: 'gh:f7-quiet', tier: 3, intervalMs: 1800000, quietHealth: true, consecutiveErrors: 1, consecutiveSaveErrors: 0, lastErr: 'HTTP 500', lastOkAt: f7Stale },
      { name: 'rss:f7-normal', tier: 3, intervalMs: 90000, quietHealth: false, consecutiveErrors: 1, consecutiveSaveErrors: 0, lastErr: 'HTTP 500', lastOkAt: f7Stale },
    ],
  };
  const stopF7 = startHealth({ scheduler: f7Scheduler, alerts: null, intervalMs: 15 });
  await sleep(70); // several ticks, well under the 1h throttle window
  stopF7();
  console.error = origErr2;
  const quietPollLines = f7Errors.filter((l) => l.includes('gh:f7-quiet') && l.includes('no successful poll'));
  const normalPollLines = f7Errors.filter((l) => l.includes('rss:f7-normal') && l.includes('no successful poll'));
  eq('quietHealth adapter: "no successful poll" logged once (throttled to 1/hour), not once per tick', quietPollLines.length, 1);
  check('non-quiet adapter: still logs every tick (unthrottled)', normalPollLines.length >= 3, normalPollLines.length);

  console.log('— ingest.js wiring');
  const ingestSrc = fs.readFileSync(APP + '/ingest.js', 'utf8');
  check('telegram + official adapters registered', /telegram\.make\(\)/.test(ingestSrc) && /official\.make\(\)/.test(ingestSrc));
  check('env switches TG_WIRES_ENABLED / OFFICIAL_ENABLED default enabled (!== \'0\')', /TG_WIRES_ENABLED.*!==\s*'0'/.test(ingestSrc) && /OFFICIAL_ENABLED.*!==\s*'0'/.test(ingestSrc));

  await prisma.$disconnect();
  done('p3_step6_sources');
})().catch(async (e) => { console.error('TEST CRASH', e); try { await prisma.$disconnect(); } catch (_) {} process.exit(2); });
