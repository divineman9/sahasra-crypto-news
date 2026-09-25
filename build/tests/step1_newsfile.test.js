// Step 1: newsFile risk/catalyst separation, expiry, future quarantine, health.
const os = require('os'), path = require('path'), fs = require('fs');
const out = path.join(os.tmpdir(), 'news_live_test.json');
process.env.NEWS_LIVE_JSON = out;
const { check, eq, done } = require('./assert_lib');
const { startNewsFile } = require('D:/claude projects/crypto-news-terminal/app/ingest/newsFile.js');
const now = Date.now(), h = 3600e3;
const P = (id, story, ticker, category, importance, sentiment, pubAgoH, extra = {}) => ({
  id, storyId: story, title: `${category} ${ticker} ${id}`, url: `https://x/${id}`, category, importance, sentiment,
  sourceName: 'test', publishedAt: new Date(now - pubAgoH * h), firstSeenAt: new Date(now - Math.max(0, pubAgoH) * h + 1000),
  userLabel: null, instruments: [{ ticker }], ...extra });
const posts = [
  P('L1', 's1', 'AAA', 'listing', 95, 'bullish', 2),
  P('H1', 's2', 'AAA', 'hack', 85, 'bearish', 3),
  P('R1', 's3', 'BBB', 'regulatory', 70, 'neutral', 1),
  P('E1', 's4', 'BBB', 'etf', 70, 'bullish', 1),
];
// The fake prisma applies the same where-clause semantics the real query must use.
const prisma = { post: { findMany: async (q) => {
  const w = q.where;
  return posts.filter(p => p.publishedAt >= w.publishedAt.gte && p.publishedAt <= w.publishedAt.lte && p.firstSeenAt >= w.firstSeenAt.gte && (!w.importance || p.importance >= w.importance.gte));
} } };
const scheduler = { health: () => [
  { name: 'bybit', tier: 1, lastOkAt: now - 1000, consecutiveErrors: 0 },
  { name: 'kucoin', tier: 1, lastOkAt: now - 20 * 60e3, consecutiveErrors: 0 },
  { name: 'rss:x', tier: 3, lastOkAt: now - 5 * 60e3, consecutiveErrors: 0 } ] };
const stop = startNewsFile({ prisma, scheduler, intervalMs: 200 });
setTimeout(() => {
  stop && stop();
  const j = JSON.parse(fs.readFileSync(out, 'utf8'));
  eq('schema 2', j.schema, 2);
  check('asof_ms fresh', Math.abs(Date.now() - j.asof_ms) < 5000);
  const a = j.flags.AAA;
  check('AAA exists', !!a);
  eq('AAA risk is the hack (not hidden by the 95 listing)', a && a.risk && a.risk.id, 'H1');
  eq('AAA catalyst is the listing', a && a.catalyst && a.catalyst.id, 'L1');
  eq('AAA items: risk first', a && a.items && a.items[0].id, 'H1');
  eq('AAA count = distinct stories', a && a.count, 2);
  check('items carry publishedAt', a && a.risk && !!a.risk.publishedAt);
  const b = j.flags.BBB;
  eq('BBB catalyst = bullish ETF', b && b.catalyst && b.catalyst.id, 'E1');
  eq('BBB other = neutral regulatory', b && b.other && b.other.id, 'R1');
  eq('BBB no risk', b && b.risk, null);
  eq('health.ok false (kucoin silent 20m)', j.health && j.health.ok, false);
  check('health.stale lists kucoin only', j.health && JSON.stringify(j.health.stale) === '["kucoin"]', j.health);
  eq('tier1Ok/Total', j.health && [j.health.tier1Ok, j.health.tier1Total], [1, 2]);
  done('step1_newsfile');
}, 900);
