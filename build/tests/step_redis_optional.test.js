// Redis-optional mode: MemoryRedis semantics + a real store.save through it (test rows cleaned up).
process.chdir('D:/claude projects/crypto-news-terminal/app');
process.env.NEWS_REDIS = 'off';
require('dotenv').config();
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const { createRedis, MemoryRedis } = require(APP + '/ingest/redisOptional.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const r = createRedis();
  check('NEWS_REDIS=off gives MemoryRedis', r instanceof MemoryRedis);
  eq('set NX first time → OK', await r.set('k', '1', 'EX', 1, 'NX'), 'OK');
  eq('set NX again → null', await r.set('k', '2', 'NX', 'EX', 1), null);
  eq('exists → 1', await r.exists('k'), 1);
  await wait(1200);
  eq('expired after EX → exists 0', await r.exists('k'), 0);
  eq('set NX after expiry → OK', await r.set('k', '3', 'NX'), 'OK');
  const res = await r.multi().lpush('L', 'a').lpush('L', 'b').ltrim('L', 0, 0).publish('c', 'x').zadd('z', 1, 'm').exec();
  check('multi exec returns [err,res] tuples with no errors', Array.isArray(res) && res.every((t) => Array.isArray(t) && t[0] === null), res);
  eq('lpush order + ltrim keeps newest', await r.lrange('L', 0, -1), ['b']);
  eq('hset/hgetall', (await r.hset('h', 'f', 'v'), await r.hgetall('h')), { f: 'v' });
  eq('publish → 0', await r.publish('ch', 'm'), 0);
  eq('quit resolves', await r.quit(), 'OK');

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const TEST = 'https://test.local/redisoff/';
  await prisma.post.deleteMany({ where: { url: { startsWith: TEST } } });
  const T = require(APP + '/ingest/tickers.js'); await T.loadUniverse();
  const { Store } = require(APP + '/ingest/store.js'); const { StoryIndex } = require(APP + '/ingest/cluster.js');
  const mem = createRedis(); const store = new Store({ prisma, redis: mem, storyIndex: new StoryIndex() }); await store.init();
  const dto = await store.save({ sourceName: 'test', sourceTier: 3, kind: 'news', exchange: null, title: 'Solana ETF sees record inflows', url: TEST + 'a', publishedAt: new Date(), hintCategory: null, hintTickers: [] });
  check('store.save works with Redis off', !!dto && dto.instruments.some((i) => i.ticker === 'SOL'), dto && dto.instruments);
  const row = await prisma.post.findUnique({ where: { url: TEST + 'a' } });
  check('hotPublishedAt set (no republish loop needed)', row && row.hotPublishedAt instanceof Date);
  eq('post in the in-memory hot list', (await mem.lrange('news:hot', 0, -1)).length, 1);
  await prisma.post.deleteMany({ where: { url: { startsWith: TEST } } }); await prisma.$disconnect();
  done('step_redis_optional');
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
