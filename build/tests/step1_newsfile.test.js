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
  { name: 'rss:x', tier: 3, lastOkAt: now - 5 * 60e3, consecutiveErrors: 0 },
  // B1 (step 7 fix round): buildHealth's window must be interval-aware (>= 2x intervalMs), and a
  // quietHealth (unverified) adapter must never raise the dashboard's stale/degraded banner.
  { name: 'yt:x', tier: 4, intervalMs: 1800000, lastOkAt: now - 35 * 60e3, consecutiveErrors: 0 }, // 35m < 2x30m=60m -> ok
  { name: 'yt:y', tier: 4, intervalMs: 1800000, lastOkAt: now - 65 * 60e3, consecutiveErrors: 0 }, // 65m > 60m -> stale
  { name: 'gh:quiet', tier: 3, intervalMs: 1800000, quietHealth: true, lastOkAt: now - 5 * 3600e3, consecutiveErrors: 0 }, // 5h silent, but quietHealth -> never in `stale`
  { name: 'rss:fast', tier: 3, intervalMs: 90000, lastOkAt: now - 31 * 60e3, consecutiveErrors: 0 } ] }; // 31m > 30m floor -> stale (unchanged: the 30-min floor still dominates for a fast-interval adapter)
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
  eq('tier1Ok/Total', j.health && [j.health.tier1Ok, j.health.tier1Total], [1, 2]);
  const stale = j.health && j.health.stale.slice().sort();
  eq('B1: health.stale = kucoin + yt:y (65m, past 2x30min interval) + rss:fast (31m, past the 30min floor) — yt:x (35m, within 60min) and gh:quiet (5h but quietHealth) excluded', stale, ['kucoin', 'rss:fast', 'yt:y']);
  done('step1_newsfile');
}, 900);
