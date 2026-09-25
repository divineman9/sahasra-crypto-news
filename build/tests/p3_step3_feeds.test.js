// Phase 3 step 3: ~43 more RSS feeds via per-feed options (tier/kind/interval/maxItems/filter/prefix). No network, no DB.
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const http = require(APP + '/ingest/http.js');
const { RSS_FEEDS } = require(APP + '/ingest/config.js');

const rss = (items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.map(([t, l, d]) => `<item><title>${t}</title><link>${l}</link><pubDate>${new Date(d).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;

(async () => {
  console.log('— config');
  check('at least 45 RSS feeds configured', RSS_FEEDS.length >= 45, RSS_FEEDS.length);
  const names = RSS_FEEDS.map((f) => f.name);
  eq('feed names unique', new Set(names).size, names.length);
  check('every feed has name rss:*|reg:*|blog:* and an https url', RSS_FEEDS.every((f) => /^(rss|reg|blog):[a-z0-9-]+$/.test(f.name) && /^https:\/\//.test(f.url)));
  check('stale/undated feeds not included (blockworks, dlnews, yahoo, fca, esma, investing)', !RSS_FEEDS.some((f) => /blockworks|dlnews|yahoo|fca\.org|esma|investing\.com/.test(f.url)));
  const regs = RSS_FEEDS.filter((f) => f.name.startsWith('reg:'));
  check('4 regulator feeds with a crypto filter, tier 2, kind regulator', regs.length === 4 && regs.every((f) => f.filter && f.tier === 2 && f.kind === 'regulator'), regs.map((f) => f.name));
  check('ef blog capped (maxItems ≤ 20)', RSS_FEEDS.some((f) => /ethereum\.org/.test(f.url) && f.maxItems && f.maxItems <= 20));
  check('blogs polled ≤ every 10 min (intervalMs ≥ 600000)', RSS_FEEDS.filter((f) => f.name.startsWith('blog:')).every((f) => f.intervalMs >= 600000));

  console.log('— adapter honours per-feed options');
  const now = Date.now();
  const bodies = {
    'https://x.test/reg': rss([['Man charged in $20M crypto fraud scheme', 'https://x.test/r1', now - 3600e3], ['Agency announces new farm subsidy', 'https://x.test/r2', now - 3600e3], ['Bitcoin mixer operator sentenced', 'https://x.test/r3', now - 3600e3]]),
    'https://x.test/big': rss(Array.from({ length: 30 }, (_, i) => [`Post ${i}`, `https://x.test/b${i}`, now - i * 60e3])),
    'https://x.test/plain': rss([['Solana hits new high', 'https://x.test/p1', now - 60e3]]),
  };
  const realReq = http.request;
  http.request = async (url) => ({ status: 200, text: bodies[url] || '', notModified: false, headers: {}, json: () => ({}) });
  const cfg = require(APP + '/ingest/config.js');
  const saved = cfg.RSS_FEEDS.slice();
  cfg.RSS_FEEDS.length = 0;
  cfg.RSS_FEEDS.push(
    { name: 'reg:test', url: 'https://x.test/reg', domain: 'x.test', tier: 2, kind: 'regulator', titlePrefix: '[TEST] ', filter: '\\b(crypto|bitcoin|digital asset|stablecoin|blockchain|token|ether)', intervalMs: 300000 },
    { name: 'blog:big', url: 'https://x.test/big', domain: 'x.test', maxItems: 5, intervalMs: 600000 },
    { name: 'rss:plain', url: 'https://x.test/plain', domain: 'x.test' },
  );
  delete require.cache[require.resolve(APP + '/ingest/adapters/rss.js')];
  const ads = require(APP + '/ingest/adapters/rss.js').make();
  const by = Object.fromEntries(ads.map((a) => [a.name, a]));
  const reg = await by['reg:test'].run();
  eq('regulator filter keeps only crypto titles', reg.map((i) => i.url), ['https://x.test/r1', 'https://x.test/r3']);
  check('regulator items: prefix, tier 2, kind regulator', reg.every((i) => i.title.startsWith('[TEST] ') && i.sourceTier === 2 && i.kind === 'regulator'), reg);
  eq('adapter tier/interval from config', [by['reg:test'].tier, by['reg:test'].intervalMs, by['blog:big'].intervalMs], [2, 300000, 600000]);
  eq('maxItems caps newest-first', (await by['blog:big'].run()).map((i) => i.url), ['https://x.test/b0', 'https://x.test/b1', 'https://x.test/b2', 'https://x.test/b3', 'https://x.test/b4']);
  const pl = await by['rss:plain'].run();
  eq('defaults: tier 3, kind news, 90 s, no prefix', [pl[0].sourceTier, pl[0].kind, by['rss:plain'].tier, by['rss:plain'].intervalMs, pl[0].title], [3, 'news', 3, 90000, 'Solana hits new high']);
  cfg.RSS_FEEDS.length = 0; for (const f of saved) cfg.RSS_FEEDS.push(f);
  http.request = realReq;
  done('p3_step3_feeds');
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
