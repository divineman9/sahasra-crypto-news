// Step 3: recoverable processing — real Postgres (test rows cleaned up), fake Redis / fake webhook.
process.chdir('D:/claude projects/crypto-news-terminal/app');
process.env.DISCORD_NEWS_WEBHOOK = 'https://discord.test/webhook';
process.env.NEWS_PORTFOLIO = 'TSTA,TSTB';
require('dotenv').config();
const { check, eq, done } = require('./assert_lib');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APP = 'D:/claude projects/crypto-news-terminal/app';
const T = require(APP + '/ingest/tickers.js');
const { StoryIndex } = require(APP + '/ingest/cluster.js');
const { Store } = require(APP + '/ingest/store.js');
const { startRepublish } = require(APP + '/ingest/republish.js');
const { Alerts, startAlertWorker } = require(APP + '/ingest/discord.js');
const http = require(APP + '/ingest/http.js');

// fake redis: multi() can be made to fail; supports exists/set/publish/hset/eval
function fakeRedis() {
  const r = { failMulti: false, published: [], keys: new Map(), list: [] };
  r.multi = () => {
    const ops = [];
    const m = { lpush: (k, v) => (ops.push(['lpush', v]), m), ltrim: () => m, publish: (c, v) => (ops.push(['pub', c]), m),
      zadd: () => m, zremrangebyscore: () => m,
      exec: async () => { if (r.failMulti) throw new Error('redis down'); for (const [op, v] of ops) { if (op === 'lpush') r.list.unshift(v); if (op === 'pub') r.published.push(v); } return ops.map(() => [null, 1]); } };
    return m;
  };
  r.publish = async (c) => { r.published.push(c); return 1; };
  r.exists = async (k) => (r.keys.has(k) ? 1 : 0);
  r.set = async (k, v) => { r.keys.set(k, v); return 'OK'; };
  r.hset = async () => 1;
  r.eval = async (script, n, key, id, json) => { if (r.failMulti) throw new Error('redis down'); r.list = r.list.filter((j) => { try { return JSON.parse(j).id !== id; } catch { return true; } }); r.list.unshift(json); r.published.push('news:new'); return 1; };
  return r;
}
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const TEST = 'https://test.local/p2s3/';

(async () => {
  await prisma.post.deleteMany({ where: { url: { startsWith: TEST } } });
  await T.loadUniverse();

  console.log('— 3f forced universe refresh really fetches');
  const before = T._stats ? T._stats.fetches : -1;
  await T.loadUniverse({ force: true });
  check('loadUniverse({force:true}) performed a CoinGecko fetch', T._stats && T._stats.fetches > before, { before, after: T._stats && T._stats.fetches });

  console.log('— 3b Redis failure does not lose the post; republish recovers it');
  const redis = fakeRedis();
  const store = new Store({ prisma, redis, storyIndex: new StoryIndex() });
  await store.init();
  redis.failMulti = true;
  const raw = { sourceName: 'test', sourceTier: 3, kind: 'news', exchange: null, title: 'Bitcoin ETF sees record inflows', url: TEST + 'a', publishedAt: new Date(), hintCategory: null, hintTickers: [] };
  const dto = await store.save(raw);
  check('save returns a dto even though Redis failed', !!dto);
  let row = await prisma.post.findUnique({ where: { url: TEST + 'a' } });
  check('row exists', !!row);
  eq('hotPublishedAt is null after Redis failure', row && row.hotPublishedAt, null);
  eq('second save of same url+title → null (duplicate)', await store.save({ ...raw }), null);
  redis.failMulti = false;
  const stopRep = startRepublish({ prisma, redis, intervalMs: 300 });
  await wait(1500); stopRep && stopRep();
  row = await prisma.post.findUnique({ where: { url: TEST + 'a' } });
  check('republish worker set hotPublishedAt', row && row.hotPublishedAt instanceof Date);
  check('republish pushed it to news:hot', redis.list.some((j) => j.includes(TEST + 'a')));

  console.log('— 3b correction at the same URL updates the stored story, keeps clocks');
  const firstSeen = row.firstSeenAt.getTime(), pub = row.publishedAt.getTime();
  const res2 = await store.save({ ...raw, title: 'Bitcoin ETF approval delayed by SEC' });
  check('revision returns the revised dto (revised:true)', !!res2 && res2.revised === true);
  row = await prisma.post.findUnique({ where: { url: TEST + 'a' } });
  eq('title updated', row.title, 'Bitcoin ETF approval delayed by SEC');
  eq('sentiment re-classified', row.sentiment, 'bearish');
  eq('firstSeenAt unchanged', row.firstSeenAt.getTime(), firstSeen);
  eq('publishedAt unchanged', row.publishedAt.getTime(), pub);
  eq('only one row for the url', await prisma.post.count({ where: { url: TEST + 'a' } }), 1);

  console.log('— 3c durable Discord alerts: 503 then success, no lost alert, story dedupe');
  const post = await prisma.post.create({ data: { title: 'TSTA hacked for $10M', url: TEST + 'alert', sourceDomain: 'test.local', publishedAt: new Date(), kind: 'news', sentiment: 'bearish', category: 'hack', importance: 85, sourceName: 'test', sourceTier: 3, storyId: 'story-alert', firstSeenAt: new Date(), instruments: { connectOrCreate: [{ where: { ticker: 'TSTA' }, create: { ticker: 'TSTA', name: 'TSTA' } }] } }, include: { instruments: true, votes: true } });
  const alerts = new Alerts({ prisma, redis });
  const ser = require(APP + '/lib/serialize.js').serializePost(post);
  await alerts.enqueue(ser, { warm: true });
  eq('enqueue marks alertState pending', (await prisma.post.findUnique({ where: { id: post.id } })).alertState, 'pending');
  let calls = 0; const realFetch = global.fetch;
  global.fetch = async () => { calls++; return calls === 1 ? new Response('down', { status: 503 }) : new Response(null, { status: 204 }); };
  const stopAlerts = startAlertWorker({ prisma, redis, alerts, intervalMs: 300 });
  await wait(1800); stopAlerts && stopAlerts(); global.fetch = realFetch;
  const p2 = await prisma.post.findUnique({ where: { id: post.id } });
  eq('after a 503 → stays pending with a future alertNextAt (backoff; retry covered in fix1)', [p2.alertState, p2.alertNextAt instanceof Date && p2.alertNextAt > new Date()], ['pending', true]);
  check('webhook called once so far', calls === 1, { calls });

  console.log('— 3d symbol events survive a restart until acknowledged');
  const mem = [];
  const fakePrisma = { knownSymbol: {
    findMany: async ({ where }) => mem.filter((r) => r.venue === where.venue && (where.pendingEmit === undefined || r.pendingEmit === where.pendingEmit)),
    create: async ({ data }) => { mem.push({ firstSeenAt: new Date(), pendingEmit: false, ...data }); return data; },
    createMany: async ({ data }) => { for (const d of data) mem.push({ pendingEmit: false, ...d }); return {}; },
    updateMany: async ({ where, data }) => { let n = 0; for (const r of mem) if (r.venue === where.venue && where.symbol.in.includes(r.symbol)) { Object.assign(r, data); n++; } return { count: n }; },
    update: async ({ where, data }) => { const r = mem.find((x) => x.venue === where.venue_symbol.venue && x.symbol === where.venue_symbol.symbol); Object.assign(r, data); return r; } } };
  const base = Array.from({ length: 150 }, (_, i) => `C${i}USDT`);
  let feed = base.slice();
  http.request = async () => ({ status: 200, json: () => feed.map((symbol) => ({ symbol })) });
  delete require.cache[require.resolve(APP + '/ingest/adapters/symbols.js')];
  const symbols = require(APP + '/ingest/adapters/symbols.js'); // loaded after the fake request is installed
  let spot = symbols.make({ prisma: fakePrisma }).find((a) => a.name === 'sym-binance-spot');
  await spot.run(); // seeds
  feed = [...base, 'NEWONEUSDT'];
  const r1 = await spot.run();
  check('new base emitted with symbolRef', r1.some((i) => i.hintTickers[0] === 'NEWONE' && i.symbolRef && i.symbolRef.symbol === 'NEWONEUSDT'), r1.map((i) => i.title));
  spot = symbols.make({ prisma: fakePrisma }).find((a) => a.name === 'sym-binance-spot'); // "restart", save never acknowledged
  const r2 = await spot.run();
  check('after restart the unacknowledged event is re-emitted', r2.some((i) => i.hintTickers[0] === 'NEWONE'), r2.map((i) => i.title));
  await fakePrisma.knownSymbol.update({ where: { venue_symbol: { venue: 'binance-spot', symbol: 'NEWONEUSDT' } }, data: { pendingEmit: false, emittedAt: new Date() } });
  const r3 = await spot.run();
  check('after acknowledgement it is not re-emitted', !r3.some((i) => i.hintTickers[0] === 'NEWONE'), r3.map((i) => i.title));

  await prisma.post.deleteMany({ where: { url: { startsWith: TEST } } });
  await prisma.$disconnect();
  done('step3_recover');
})().catch(async (e) => { console.error('TEST CRASH', e); try { await prisma.post.deleteMany({ where: { url: { startsWith: TEST } } }); } catch {} process.exit(2); });
