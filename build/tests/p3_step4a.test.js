// Phase 3 step 4A: per-coin Google News (coinMatch gate, gnews adapter, store/classify/watchlist changes). Test DB only.
process.chdir('D:/claude projects/crypto-news-terminal/app');
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NONCOIN_CACHE_FILE = path.join(os.tmpdir(), 'noncoin_test_4a.json');
process.env.NEWS_PORTFOLIO = 'SOL';
process.env.BBW_LIVE_JSON = 'D:/nonexistent/base_break_live.json';
process.env.DISCORD_NEWS_WEBHOOK = 'https://discord.test/webhook';
const { check, eq, done } = require('./assert_lib');
require('dotenv').config();
const APP = 'D:/claude projects/crypto-news-terminal/app';
const T = require(APP + '/ingest/tickers.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  await T.loadUniverse();
  T.setNonCoinBases(['HUT']);

  console.log('— coinMatch v2 gate');
  const CM = require(APP + '/ingest/coinMatch.js');
  const src = require(APP + '/ingest/coinSources.json');
  const rec = (b) => CM.getRec(b);
  const m = (title, base) => CM.matchCoin(title, base, rec(base));
  const pos = [
    ['Ethena governance approves fee switch', 'ENA'], ['NEAR Protocol announces upgrade', 'NEAR'], ['Sui Network outage halts blocks', 'SUI'],
    ['$PEPE rallies as memecoins rebound', 'PEPE'], ['SUI Flashes a Key Macro Signal: Has the Bull Market Begun?', 'SUI'],
    ['Sui leads way as most big cryptocurrencies post gains', 'SUI'], ['Lighter (LIT) token drops 11.2% after Bitwise launches staking ETP', 'LIT'],
    ['Bitwise launches first Lighter ETP on Xetra', 'LIT'], ['XPL Surges 30% Despites 6% Plasma Unlock Scares', 'XPL'],
    ['Quant (QNT) token jumps nearly 14%', 'QNT'], ['OFFICIAL TRUMP (TRUMP) Drops 3.15% Amid Token Unlock', 'TRUMP'],
    ['Pump(dot)fun Caps Creator Fee Changes', 'PUMP'], ['DeepBook Launches on Sui', 'SUI'],
  ];
  for (const [t, b] of pos) eq(`+ ${b}: ${t}`, m(t, b), true);
  const neg = [
    ['Hurricane near Florida coast', 'NEAR'], ['Sun Communities (SUI) shares rise on earnings', 'SUI'], ['Pepe the Frog meme returns', 'PEPE'],
    ["Real estate, watches and guitars: Trump's 2025 $2.2B income wasn't all from cryptocurrency", 'TRUMP'],
    ["Hunter Biden's LAPTOP Memecoin Pops 13%, While Bitcoin and Dogecoin Trail", 'TRUMP'],
    ["Vacheron Constantin's $219K Overseas Perpetual Calendar", 'LIT'], ['DOGE cuts federal crypto oversight budget', 'DOGE'],
    ['DoorDash (DASH) stock price jumps on earnings', 'DASH'], ['xAI raises $10B for Grok crypto payments', 'XAI'],
    ['Cathie Wood ARK Invest buys more Coinbase stock', 'ARK'], ['Convert 1 CZK (Czech Koruna) to NEAR (NEAR Protocol)', 'NEAR'],
    ["ALIEN CRYPTO(@Amirsangi)'s insights", 'SUI'], ['Karate Cat Price | KCAT Price Today, Live Chart', 'PUMP'],
    ['Bitget lists NEARUSDT and TSLAUSDT stock perpetual', 'NEAR'], ['HUT 8 token surges 20%', 'HUT'],
  ];
  for (const [t, b] of neg) eq(`- ${b}: ${t}`, m(t, b), false);
  eq('internal " - " segment does not break matching', m('Bitwise ETP launch - Lighter (LIT) drops 11%', 'LIT'), true);
  eq('stripSourceSuffix generic', CM.stripSourceSuffix('X rallies - CoinDesk'), 'X rallies');
  eq('stripSourceSuffix exact publisher', CM.stripSourceSuffix('NEAR Protocol: Venice launches AI - 24 Sep 2026 - TradingView', 'TradingView'), 'NEAR Protocol: Venice launches AI - 24 Sep 2026');
  eq('unlisted base → default record ambiguous', rec('ZZZQ').ambiguous, true);
  check('_meta key ignored by getRec/listing', !CM.listBases || !CM.listBases().includes('_meta'));
  check('coinSources has ENA, NEAR, SUI, ONE (Harmony)', src.ENA && src.NEAR && src.SUI && src.ONE && /harmony/i.test(src.ONE.name));

  console.log('— watchlist');
  const W = require(APP + '/ingest/watchlist.js');
  const bbwFile = path.join(os.tmpdir(), 'bbw_4a.json');
  fs.writeFileSync(bbwFile, JSON.stringify({ setups: [{ symbol: '1000PEPEUSDT' }, { symbol: 'ONEUSDT' }, { symbol: '币安人生USDT' }, { symbol: 'HUTUSDT' }] }));
  eq('loadWatchBases: strip, dedupe, non-ASCII + non-coin removed, portfolio added', W.loadWatchBases({ bbwFile, wideFile: 'D:/nonexistent/wide.json', portfolio: ['BTC', 'ETH'] }), ['BTC', 'ETH', 'ONE', 'PEPE']);
  let threw = false; try { W.loadWatchBases({ bbwFile: 'D:/nonexistent/x.json', wideFile: 'D:/nonexistent/wide.json', portfolio: [] }); } catch { threw = true; }
  check('missing BBW file → throws', threw);

  console.log('— gnews adapter');
  const G = require(APP + '/ingest/adapters/gnews.js');
  const stateFile = path.join(os.tmpdir(), 'gnews_state_4a.json');
  const NOW0 = Date.parse('2026-09-25T12:00:00Z');
  let now = NOW0;
  const rfc = (t) => new Date(t).toUTCString();
  const item = (title, host, pub, name) => `<item><title>${title} - ${name}</title><link>https://news.google.com/rss/articles/CBMi${Math.random().toString(36).slice(2)}</link><pubDate>${rfc(pub)}</pubDate><source url="https://www.${host}">${name}</source></item>`;
  const rss = (items) => `<?xml version="1.0"?><rss><channel>${items.join('')}</channel></rss>`;
  const feedFor = () => rss([
    item('Ethena governance approves fee switch', 'coindesk.com', now - 3600e3, 'CoinDesk'),
    item('Ethena (ENA) token jumps as USDe supply grows', 'theblock.co', now - 7200e3, 'The Block'),
    item('Ethena Labs launches new stablecoin chain', 'decrypt.co', now - 9000e3, 'Decrypt'),
    item('Pepe the Frog meme returns', 'example.com', now - 3600e3, 'Example'),
    item('Ethena governance vote passes', 'coindesk.com', now - 9 * 86400e3, 'CoinDesk'),
    item('Ethena ENA price analysis on Binance Square', 'binance.com', now - 3600e3, 'Binance'),
  ]);
  const calls = []; let mode = 'ok';
  const request = async (url) => {
    calls.push(url);
    if (mode === '429' && calls.length === 2) { const e = new Error('HTTP 429'); e.name = 'HttpError'; e.status = 429; e.retryAfterMs = 0; throw e; }
    if (mode === 'html') return { status: 200, text: '<html><body>consent</body></html>', json: () => ({}) };
    return { status: 200, text: feedFor(), json: () => ({}) };
  };
  try { fs.unlinkSync(stateFile); } catch {}
  let tierA = ['ENA'];
  const mk = (o = {}) => G.make({ getTierA: () => tierA, request, now: () => now, stateFile, budget: 5000, tierAMin: 20, enabled: true, ...o });
  const a = mk();
  const r1 = await a.run();
  eq('3 matching, fresh, non-junk items returned', r1.length, 3);
  const it = r1[0] || {};
  eq('RawItem fields', [it.sourceTier, it.kind, it.exchange, it.hintCategory, it.alertable, JSON.stringify(it.hintTickers)], [4, 'news', null, null, false, '["ENA"]']);
  check('sourceName gnews:<publisher host>, sourceDomain = host', /^gnews:(coindesk\.com|theblock\.co|decrypt\.co)$/.test(it.sourceName) && it.sourceName === 'gnews:' + it.sourceDomain, [it.sourceName, it.sourceDomain]);
  check('title suffix stripped', r1.every((x) => !/ - (CoinDesk|The Block|Decrypt)$/.test(x.title)), r1.map((x) => x.title));
  check('first request uses when:7d', /when%3A7d/.test(calls[0]), calls[0]);
  let st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  eq('state: used=1, firstDone, nextDueAt = now + 20 min', [st.used, st.coins.ENA.firstDone, st.coins.ENA.nextDueAt], [1, true, NOW0 + 20 * 60e3]);
  eq('second run before due → no request', [(await a.run()).length, calls.length], [0, 1]);
  now = NOW0 + 21 * 60e3; await a.run();
  check('next request uses when:2d', /when%3A2d/.test(calls[1]), calls[1]);

  console.log('— ≤3 coins per tick, budget, 429, html, day change, disabled, adaptive interval, stats');
  tierA = ['AAVE', 'ADA', 'ARB', 'AVAX', 'BCH', 'BNB', 'DOGE', 'ENA', 'ETC', 'FIL'];
  try { fs.unlinkSync(stateFile); } catch {} calls.length = 0; now = NOW0;
  const b = mk(); await b.run();
  eq('10 due coins → 3 requests in one tick', calls.length, 3);
  try { fs.unlinkSync(stateFile); } catch {} calls.length = 0;
  fs.writeFileSync(stateFile, JSON.stringify({ day: '2026-09-25', used: 5000, coins: {} }));
  eq('budget exhausted → [] and no request', [(await mk().run()).length, calls.length], [0, 0]);
  try { fs.unlinkSync(stateFile); } catch {} calls.length = 0; mode = '429';
  const c = mk(); let err = null; try { await c.run(); } catch (e) { err = e; }
  check('429 on coin 2 rethrown (status 429)', err && err.status === 429, err);
  st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  eq('coin 1 nextDueAt NOT advanced; used=2 persisted', [((st.coins.AAVE || {}).nextDueAt || 0) <= NOW0, st.used], [true, 2]);
  calls.length = 0; let err2 = null; try { await c.run(); } catch (e) { err2 = e; }
  check('second consecutive 429 escalates retryAfterMs ≥ 120 s', err2 && err2.retryAfterMs >= 120000, err2 && err2.retryAfterMs);
  mode = 'html'; calls.length = 0; let err3 = null; try { await mk().run(); } catch (e) { err3 = e; }
  check('200 with HTML body → throws status 429', err3 && err3.status === 429, err3);
  mode = 'ok';
  fs.writeFileSync(stateFile, JSON.stringify({ day: '2026-09-24', used: 5000, coins: {} })); calls.length = 0;
  await mk().run();
  check('UTC day change resets used', JSON.parse(fs.readFileSync(stateFile, 'utf8')).used <= 3 && calls.length > 0);
  calls.length = 0; eq('disabled → [] and no request', [(await mk({ enabled: false }).run()).length, calls.length], [0, 0]);
  eq('adaptive interval N=49 budget 5000 → 20 min', G.tierAIntervalMin(49, 5000, 20), 20);
  check('adaptive interval N=200 → ≥ 64 min', G.tierAIntervalMin(200, 5000, 20) >= 64, G.tierAIntervalMin(200, 5000, 20));
  const logs = []; const ol = console.log; console.log = (...x) => { logs.push(x.join(' ')); };
  try { fs.unlinkSync(stateFile); } catch {} tierA = ['ENA']; now = NOW0; const d = mk();
  await d.run(); now = NOW0 + 5 * 60e3; await d.run(); const before = logs.filter((l) => /^\[gnews\] used=/.test(l)).length;
  now = NOW0 + 11 * 60e3; await d.run(); const after = logs.filter((l) => /^\[gnews\] used=/.test(l)).length;
  console.log = ol;
  check('stats line printed after ≥10 min, not before', after > before && before <= 1, { before, after });

  console.log('— store: alertable:false, sourceDomain, titleKey dedupe');
  const { Store } = require(APP + '/ingest/store.js'); const { StoryIndex } = require(APP + '/ingest/cluster.js');
  const { Alerts } = require(APP + '/ingest/discord.js'); const { MemoryRedis } = require(APP + '/ingest/redisOptional.js');
  const redis = new MemoryRedis(); const alerts = new Alerts({ prisma, redis });
  await prisma.post.deleteMany({ where: { url: { startsWith: 'https://test.local/4a/' } } });
  const old = await prisma.post.create({ data: { title: 'Solana validator upgrade ships six days ago', url: 'https://test.local/4a/old', sourceDomain: 'oldsite.io', publishedAt: new Date(Date.now() - 6 * 86400e3), kind: 'news', sentiment: 'neutral', category: 'other', importance: 20, sourceName: 'rss:old', sourceTier: 3, firstSeenAt: new Date(Date.now() - 6 * 86400e3) } });
  const st2 = new Store({ prisma, redis, storyIndex: new StoryIndex(), alerts }); await st2.init();
  const G1 = { sourceName: 'gnews:coindesk.com', sourceTier: 4, kind: 'news', exchange: null, title: 'Solana network hacked for $50M in bridge exploit', url: 'https://test.local/4a/g1', publishedAt: new Date(), hintCategory: null, hintTickers: ['SOL'], sourceDomain: 'coindesk.com', alertable: false };
  await st2.save(G1, { warm: true });
  const p1 = await prisma.post.findUnique({ where: { url: G1.url } });
  eq('gnews hack on portfolio coin: alertState null, sourceDomain from raw', p1 && [p1.alertState, p1.sourceDomain], [null, 'coindesk.com']);
  check('... and it is a high-importance hack (so alertable:false is what blocked it)', p1 && p1.importance >= 70, p1 && p1.importance);
  await st2.save({ ...G1, sourceName: 'rss:direct', sourceTier: 3, url: 'https://test.local/4a/direct', title: 'Aave launches v5 on mainnet', sourceDomain: undefined, alertable: undefined }, { warm: false });
  eq('gnews copy of an already-stored direct article (same title + domain) → skipped', await st2.save({ ...G1, url: 'https://test.local/4a/g2', title: 'Aave launches v5 on mainnet', sourceDomain: 'test.local' }), null);
  eq('... no row', await prisma.post.count({ where: { url: 'https://test.local/4a/g2' } }), 0);
  await st2.save({ ...G1, url: 'https://test.local/4a/g3', title: 'Aave launches v5 on mainnet', sourceDomain: 'otherpub.com' });
  eq('same title, different publisher → stored', await prisma.post.count({ where: { url: 'https://test.local/4a/g3' } }), 1);
  check('init loads titleKeys by 7-day firstSeenAt window', st2.titleKeys instanceof Set && st2.titleKeys.has(require(APP + '/ingest/cluster.js').normalize(old.title) + '|oldsite.io'));
  await prisma.post.deleteMany({ where: { url: { startsWith: 'https://test.local/4a/' } } });

  console.log('— classify tier-4 low value');
  const { classify } = require(APP + '/ingest/classify.js');
  const cl = (t, tier) => classify({ kind: 'news', title: t, sourceTier: tier, hintCategory: null }, ['NEAR']).importance;
  eq('tier 4 price prediction → 10', cl('NEAR price prediction 2026', 4), 10);
  eq('tier 4 "jumps 7.24% in one hour" → 10', cl('SUI token jumps 7.24% in one hour', 4), 10);
  eq('tier 4 "Quant (QNT) token jumps nearly 14%" → 10', cl('Quant (QNT) token jumps nearly 14%', 4), 10);
  eq('tier 3 same title unchanged (20)', cl('SUI token jumps 7.24% in one hour', 3), 20);
  check('tier 4 hack stays high', cl('NEAR bridge hacked for $10M', 4) >= 80);

  console.log('— Alerts.refreshPortfolio uses watchlist and keeps previous set on error');
  const al = new Alerts({ prisma, redis }); al.portfolio = new Set(['KEEP']); al.lastRead = 0; al.refreshPortfolio();
  check('missing BBW → previous portfolio kept', al.portfolio.has('KEEP'));

  await prisma.$disconnect();
  done('p3_step4a');
})().catch(async (e) => { console.error('TEST CRASH', e); try { await prisma.$disconnect(); } catch {} process.exit(2); });
