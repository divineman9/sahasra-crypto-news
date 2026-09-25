// Phase 3 step 1: news_live.json also reports ORDINARY news per coin (newsCount48h / newsLatest), chip fields unchanged.
const os = require('os'), path = require('path'), fs = require('fs');
const out = path.join(os.tmpdir(), 'news_live_test2.json');
process.env.NEWS_LIVE_JSON = out;
const { check, eq, done } = require('./assert_lib');
const { startNewsFile } = require('D:/claude projects/crypto-news-terminal/app/ingest/newsFile.js');
const now = Date.now(), h = 3600e3;
const P = (id, story, ticker, category, importance, sentiment, pubAgoH) => ({
  id, storyId: story, title: `${category} ${ticker} ${id}`, url: `https://x/${id}`, category, importance, sentiment,
  sourceName: 'test', publishedAt: new Date(now - pubAgoH * h), firstSeenAt: new Date(now - Math.max(0, pubAgoH) * h + 1000),
  userLabel: null, instruments: [{ ticker }] });
const posts = [
  P('H1', 's1', 'AAA', 'hack', 85, 'bearish', 3),
  P('O1', 's2', 'AAA', 'other', 20, 'neutral', 1),
  P('B1', 's3', 'BBB', 'other', 20, 'neutral', 5),
  P('B2', 's3', 'BBB', 'other', 30, 'neutral', 4), // same story as B1
  P('B3', 's4', 'BBB', 'other', 20, 'neutral', 1),
  P('B4', 's5', 'BBB', 'other', 20, 'neutral', 49), // too old
];
let capturedWhere = null;
const prisma = { post: { findMany: async (q) => {
  const w = q.where; capturedWhere = w;
  return posts.filter((p) => p.publishedAt >= w.publishedAt.gte && p.publishedAt <= w.publishedAt.lte && p.firstSeenAt >= w.firstSeenAt.gte && (!w.importance || p.importance >= w.importance.gte));
} } };
const stop = startNewsFile({ prisma, scheduler: null, intervalMs: 200 });
setTimeout(() => {
  stop && stop();
  const j = JSON.parse(fs.readFileSync(out, 'utf8'));
  eq('query no longer filters importance', capturedWhere && capturedWhere.importance, undefined);
  eq('schema 2, min_importance 50, news_min_importance 0', [j.schema, j.min_importance, j.news_min_importance], [2, 50, 0]);
  const a = j.flags.AAA;
  eq('AAA risk still the hack', a && a.risk && a.risk.id, 'H1');
  eq('AAA count still counts only importance ≥50 stories', a && a.count, 1);
  eq('AAA newsCount48h counts all stories', a && a.newsCount48h, 2);
  eq('AAA chip items unchanged (only ≥50)', a && a.items.map((x) => x.id), ['H1']);
  const b = j.flags.BBB;
  check('BBB (only low-importance news) now has an entry', !!b);
  eq('BBB risk/catalyst/other null, items [], count 0', b && [b.risk, b.catalyst, b.other, b.items, b.count], [null, null, null, [], 0]);
  eq('BBB newsCount48h = 2 distinct stories (49 h-old excluded)', b && b.newsCount48h, 2);
  eq('BBB newsLatest newest first, one per story', b && b.newsLatest.map((x) => x.id), ['B3', 'B2']);
  check('newsLatest items carry title/source/publishedAt/importance', b && b.newsLatest.every((x) => x.title && x.source && x.publishedAt && typeof x.importance === 'number'));
  check('BBB newsLatestPublishedAt is ISO of newest', b && b.newsLatestPublishedAt === posts[4].publishedAt.toISOString(), b && b.newsLatestPublishedAt);
  try { fs.unlinkSync(out); } catch {}
  done('step1_newsfile2');
}, 900);
