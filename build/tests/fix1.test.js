// Fix round 1 (Fable + Astra review of steps 1-3): executable assertions. Runs on cryptonews_test only.
process.chdir('D:/claude projects/crypto-news-terminal/app');
process.env.DISCORD_NEWS_WEBHOOK = 'https://discord.test/webhook';
process.env.NEWS_PORTFOLIO = 'TSTA,TSTB,SOL';
process.env.BBW_LIVE_JSON = 'D:/nonexistent/base_break_live.json'; // portfolio = only the test tickers
const { check, eq, done } = require('./assert_lib'); // forces DATABASE_URL = cryptonews_test
require('dotenv').config();
const fs = require('fs'), path = require('path');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const T = require(APP + '/ingest/tickers.js');
const { classify } = require(APP + '/ingest/classify.js');
const { MemoryRedis } = require(APP + '/ingest/redisOptional.js');
const http = require(APP + '/ingest/http.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = (t, kind = 'news', hint = []) => [...T.tagTickers(t, hint, { kind })].sort();
const sent = (t, kind = 'news', hc = null) => classify({ kind, title: t, sourceTier: kind === 'exchange' ? 1 : 3, hintCategory: hc }, []);

(async () => {
  await prisma.post.deleteMany({}); await prisma.instrument.deleteMany({}); await prisma.knownSymbol.deleteMany({});
  await T.loadUniverse();

  console.log('— F1 context on parentheticals / $ / subject override / chain words');
  eq('hacked on Solana (SOL) → chain', tag('Protocol hacked on Solana (SOL)'), []);
  eq('Hyperliquid (HYPE) lists XYZ → venue', tag('Hyperliquid (HYPE) lists XYZ perpetual futures'), []);
  eq('OP hacked → OP (subject override)', tag('OP hacked for $10M'), ['OP']);
  eq('drain from Arbitrum DEX → chain', tag('Hackers drain $12M from Arbitrum DEX'), []);
  eq('Ethereum L2 Arbitrum suffers outage → ARB only', tag('Ethereum L2 Arbitrum suffers outage'), ['ARB']);
  eq('$SOL on-chain mention "on $SOL" → chain', tag('New memecoin launches on $SOL'), []);
  const coins25 = 'BTC, ETH, SOL, XRP, ADA, LINK, DOT, AVAX, TRX, LTC, UNI, ATOM, XLM, NEAR, APT, ARB, INJ, FIL, AAVE, TIA, SUI, PEPE, SHIB, DOGE, BNB';
  eq('25-coin notice keeps all 25 (cap 50)', tag('Binance Will Delist ' + coins25, 'exchange').length, 25);

  console.log('— F1 failed refresh keeps the universe');
  const cache = path.join(APP, 'ingest/cache/coins.json'), bak = cache + '.testbak';
  fs.copyFileSync(cache, bak); fs.unlinkSync(cache);
  const realFetch = global.fetch; global.fetch = async () => { throw new Error('offline'); };
  try { await T.loadUniverse({ force: true }); } catch (e) { /* must not throw either, but tolerate */ }
  global.fetch = realFetch; fs.copyFileSync(bak, cache); fs.unlinkSync(bak);
  eq('after failed refresh, names still resolve (Ethereum → ETH)', tag('Ethereum rallies'), ['ETH']);

  console.log('— F2 action-scoped sentiment, charges, stock perps');
  eq('approves after delays → bullish', sent('SEC approves Solana ETF after delays').sentiment, 'bullish');
  eq('has not approved → neutral', sent('SEC has not approved Solana ETF').sentiment, 'neutral');
  eq('ETFs pull in $1B → bullish', sent('Bitcoin ETFs pull in $1B in a single day').sentiment, 'bullish');
  eq('delays approval → bearish', sent('SEC delays approval of Solana ETF').sentiment, 'bearish');
  eq('refuses to dismiss → bearish', sent('Judge refuses to dismiss SEC lawsuit against Coinbase').sentiment, 'bearish');
  eq('drops lawsuit → bullish', sent('SEC drops lawsuit against Ripple').sentiment, 'bullish');
  eq('charges zero fees → not regulatory', sent('Binance charges zero fees on BTC pairs').category === 'regulatory', false);
  eq('charged with fraud → regulatory', sent('Exchange founder charged with fraud').category, 'regulatory');
  eq('stock perp listing → other 30', [sent('Bitget listed URNMUSDT and WBDUSDT hot stock perps', 'exchange', 'listing').category, sent('Bitget listed URNMUSDT and WBDUSDT hot stock perps', 'exchange', 'listing').importance], ['other', 30]);
  eq('stock index perp delist → other 30', sent('KuCoin Futures Will Delist the KIOXIAUSDT Stock Index Perpetual', 'exchange', 'delisting').importance, 30);

  console.log('— F3 symbol flood cap + persistence order');
  const mem = []; let failCreateOnce = true;
  const fakePrisma = { knownSymbol: {
    findMany: async ({ where }) => mem.filter((r) => r.venue === where.venue && (where.pendingEmit === undefined || r.pendingEmit === where.pendingEmit)),
    create: async ({ data }) => { if (data.symbol === 'RETRYUSDT' && failCreateOnce) { failCreateOnce = false; throw new Error('db blip'); } mem.push({ firstSeenAt: new Date(), pendingEmit: false, ...data }); return data; },
    createMany: async ({ data }) => { for (const d of data) mem.push({ pendingEmit: false, ...d }); return {}; },
    updateMany: async ({ where, data }) => { let n = 0; for (const r of mem) if (r.venue === where.venue && where.symbol.in.includes(r.symbol)) { Object.assign(r, data); n++; } return { count: n }; },
    update: async ({ where, data }) => { const r = mem.find((x) => x.venue === where.venue_symbol.venue && x.symbol === where.venue_symbol.symbol); Object.assign(r, data); return r; } } };
  const base = Array.from({ length: 150 }, (_, i) => `C${i}USDT`); let feed = base.slice();
  const realRequest = http.request;
  http.request = async () => ({ status: 200, json: () => feed.map((symbol) => ({ symbol })) });
  delete require.cache[require.resolve(APP + '/ingest/adapters/symbols.js')];
  const symbols = require(APP + '/ingest/adapters/symbols.js');
  const spot = symbols.make({ prisma: fakePrisma }).find((a) => a.name === 'sym-binance-spot');
  await spot.run();
  feed = [...base, ...Array.from({ length: 15 }, (_, i) => `FLOOD${i}USDT`)];
  eq('15 new bases → 0 items this run', (await spot.run()).length, 0);
  eq('... and 0 on the next run', (await spot.run()).length, 0);
  eq('... and no pendingEmit rows', mem.filter((r) => r.pendingEmit).length, 0);
  feed = [...feed, 'RETRYUSDT'];
  eq('failed row create → nothing emitted yet', (await spot.run()).length, 0);
  const again = await spot.run();
  eq('... retried next cycle and emitted', again.map((i) => i.hintTickers[0]), ['RETRY']);

  http.request = realRequest; // restore the real HTTP client for the rest of the suite
  console.log('— F6 idempotent hot list');
  const { hotUpsert } = require(APP + '/ingest/hotListUpsert.js');
  const mr = new MemoryRedis();
  await hotUpsert(mr, 'id1', JSON.stringify({ id: 'id1', v: 1 }));
  await hotUpsert(mr, 'id1', JSON.stringify({ id: 'id1', v: 2 }));
  await hotUpsert(mr, 'id2', JSON.stringify({ id: 'id2' }));
  const hl = (await mr.lrange('news:hot', 0, -1)).map((s) => JSON.parse(s));
  eq('same id upserted twice → one entry, newest value', hl.filter((x) => x.id === 'id1').map((x) => x.v), [2]);
  eq('order: newest first', hl.map((x) => x.id), ['id2', 'id1']);

  console.log('— F4 store: eligibility atomic, symbol ack on duplicate, revisions');
  const { Store } = require(APP + '/ingest/store.js'); const { StoryIndex } = require(APP + '/ingest/cluster.js');
  const { Alerts, startAlertWorker } = require(APP + '/ingest/discord.js');
  const redis = new MemoryRedis(); const alerts = new Alerts({ prisma, redis });
  const store = new Store({ prisma, redis, storyIndex: new StoryIndex(), alerts }); await store.init();
  const d1 = await store.save({ sourceName: 'test', sourceTier: 3, kind: 'news', exchange: null, title: 'Solana network hacked for $20M', url: 'https://test.local/f/1', publishedAt: new Date(), hintCategory: null, hintTickers: [] }, { warm: true });
  const r1 = await prisma.post.findUnique({ where: { url: 'https://test.local/f/1' } });
  eq('eligible hack on portfolio coin → alertState pending at creation', r1 && r1.alertState, 'pending');
  const cold = await store.save({ sourceName: 'test', sourceTier: 3, kind: 'news', exchange: null, title: 'Solana outage halts blocks', url: 'https://test.local/f/2', publishedAt: new Date(), hintCategory: null, hintTickers: [] }, { warm: false });
  eq('not warm → alertState null', (await prisma.post.findUnique({ where: { url: 'https://test.local/f/2' } })).alertState, null);
  eq('normalized-same title revision ignored', await store.save({ sourceName: 'test', sourceTier: 3, kind: 'news', exchange: null, title: 'Solana network HACKED for $20M!', url: 'https://test.local/f/1', publishedAt: new Date(), hintCategory: null, hintTickers: [] }, { warm: true }), null);
  const rv = await store.save({ sourceName: 'test', sourceTier: 3, kind: 'news', exchange: null, title: 'Ethereum bridge hacked for $20M', url: 'https://test.local/f/2', publishedAt: new Date(), hintCategory: null, hintTickers: [] }, { warm: true });
  check('real revision returns dto with revised:true', !!rv && rv.revised === true, rv && Object.keys(rv));
  const r2 = await prisma.post.findUnique({ where: { url: 'https://test.local/f/2' } });
  eq('revision updates priceTicker when pending', [r2.priceTicker, r2.priceStatus], ['ETH', 'pending']);
  eq('quick second revision within 10 min ignored', await store.save({ sourceName: 'test', sourceTier: 3, kind: 'news', exchange: null, title: 'Arbitrum protocol drained of $5M', url: 'https://test.local/f/2', publishedAt: new Date(), hintCategory: null, hintTickers: [] }, { warm: true }), null);
  await prisma.knownSymbol.create({ data: { venue: 'binance-spot', symbol: 'ACKUSDT', pendingEmit: true } });
  const symRaw = { sourceName: 'sym-binance-spot', sourceTier: 1, kind: 'symbol', exchange: 'Binance', title: 'New Binance spot market live: ACKUSDT', url: 'https://www.binance.com/en/trade/ACKUSDT?type=spot', publishedAt: new Date(), hintCategory: 'listing', hintTickers: ['ACK'], symbolRef: { venue: 'binance-spot', symbol: 'ACKUSDT' } };
  await store.save(symRaw);
  await prisma.knownSymbol.update({ where: { venue_symbol: { venue: 'binance-spot', symbol: 'ACKUSDT' } }, data: { pendingEmit: true } }); // simulate a lost ack
  await store.save(symRaw); // duplicate path must re-ack
  eq('duplicate symbol save re-acknowledges', (await prisma.knownSymbol.findUnique({ where: { venue_symbol: { venue: 'binance-spot', symbol: 'ACKUSDT' } } })).pendingEmit, false);

  console.log('— F5 durable alerts: DB story dedupe, backoff, uncertain, health key after success');
  const story = r1.storyId || r1.id;
  const twin = await prisma.post.create({ data: { title: 'Solana hack follow-up', url: 'https://test.local/f/twin', sourceDomain: 'test.local', publishedAt: new Date(), kind: 'news', sentiment: 'bearish', category: 'hack', importance: 85, sourceName: 'test', sourceTier: 3, storyId: story, firstSeenAt: new Date(Date.now() + 1000), alertState: 'pending', instruments: { connectOrCreate: [{ where: { ticker: 'SOL' }, create: { ticker: 'SOL', name: 'Solana' } }] } } });
  const leftover = await prisma.post.create({ data: { title: 'Old sending', url: 'https://test.local/f/sending', sourceDomain: 'test.local', publishedAt: new Date(), kind: 'news', sentiment: 'bearish', category: 'hack', importance: 85, sourceName: 'test', sourceTier: 3, firstSeenAt: new Date(Date.now() - 60000), alertState: 'sending' } });
  let calls = 0; const rf = global.fetch;
  global.fetch = async () => { calls++; return calls === 1 ? new Response('down', { status: 503 }) : new Response(null, { status: 204 }); };
  let stop = startAlertWorker({ prisma, redis, alerts, intervalMs: 200 });
  await wait(900); stop && stop();
  const a1 = await prisma.post.findUnique({ where: { id: r1.id } });
  eq('after one 503: still pending with a future alertNextAt', [a1.alertState, a1.alertNextAt instanceof Date && a1.alertNextAt > new Date()], ['pending', true]);
  eq('leftover sending → uncertain (never resent)', (await prisma.post.findUnique({ where: { id: leftover.id } })).alertState, 'uncertain');
  await prisma.post.update({ where: { id: r1.id }, data: { alertNextAt: new Date(Date.now() - 1000) } });
  stop = startAlertWorker({ prisma, redis, alerts, intervalMs: 200 });
  await wait(1200); stop && stop(); global.fetch = rf;
  const st = [(await prisma.post.findUnique({ where: { id: r1.id } })).alertState, (await prisma.post.findUnique({ where: { id: twin.id } })).alertState].sort();
  eq('story alerted exactly once: one sent, the other skip (DB dedupe, no Redis)', st, ['sent', 'skip']);
  await wait(400); // let any in-flight tick of the stopped worker finish before counting calls
  eq('webhook called exactly twice (1 fail + 1 success)', calls, 2);
  let hc = 0; global.fetch = async () => { hc++; return hc === 1 ? new Response('x', { status: 500 }) : new Response(null, { status: 204 }); };
  const hr = new MemoryRedis(); const ha = new Alerts({ prisma, redis: hr });
  await ha.healthAlert('bybit', 'silent'); eq('health: failed POST leaves no dedupe key', await hr.exists('alert:health:bybit'), 0);
  await ha.healthAlert('bybit', 'silent'); eq('health: successful POST sets the key', await hr.exists('alert:health:bybit'), 1);
  await ha.healthAlert('bybit', 'silent'); eq('health: then deduped (no 3rd call)', hc, 2);
  global.fetch = rf;

  console.log('— F7 scheduler never overlaps saves; health counts save failures');
  const { Scheduler } = require(APP + '/ingest/scheduler.js');
  let conc = 0, maxConc = 0, starts = 0;
  const s = new Scheduler({ redis: null, onItems: () => { starts++; conc++; maxConc = Math.max(maxConc, conc); return new Promise(() => {}); } });
  s.add({ name: 'x', tier: 1, intervalMs: 100, run: async () => [{ a: 1 }] });
  s.start(); await wait(3000); s.stop();
  eq('hung save → onItems never runs concurrently', maxConc, 1);
  process.env.NEWS_LIVE_JSON = path.join(require('os').tmpdir(), 'nl_fix1.json');
  delete require.cache[require.resolve(APP + '/ingest/config.js')]; delete require.cache[require.resolve(APP + '/ingest/newsFile.js')];
  const { startNewsFile } = require(APP + '/ingest/newsFile.js');
  const stopNf = startNewsFile({ prisma: { post: { findMany: async () => [] } }, scheduler: { health: () => [{ name: 'bybit', tier: 1, lastOkAt: Date.now(), consecutiveErrors: 0, consecutiveSaveErrors: 5 }] }, intervalMs: 150 });
  await wait(600); stopNf && stopNf();
  const nf = JSON.parse(fs.readFileSync(process.env.NEWS_LIVE_JSON, 'utf8'));
  eq('fetching OK but 5 save failures → health not ok, bybit stale', [nf.health.ok, nf.health.stale], [false, ['bybit']]);

  await prisma.post.deleteMany({}); await prisma.instrument.deleteMany({}); await prisma.knownSymbol.deleteMany({});
  await prisma.$disconnect();
  done('fix1');
})().catch(async (e) => { console.error('TEST CRASH', e); process.exit(2); });
