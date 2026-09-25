// Phase 3 step 1: news_live.json also reports ORDINARY news per coin (newsCount48h / newsLatest), chip fields unchanged.
const os = require('os'), path = require('path'), fs = require('fs');
const out = path.join(os.tmpdir(), 'news_live_test2.json');
process.env.NEWS_LIVE_JSON = out;
const { check, eq, done } = require('./assert_lib');
const { startNewsFile, tick } = require('D:/claude projects/crypto-news-terminal/app/ingest/newsFile.js');
const now = Date.now(), h = 3600e3;
const P = (id, story, ticker, category, importance, sentiment, pubAgoH, kind = 'news') => ({
  id, storyId: story, title: `${category} ${ticker} ${id}`, url: `https://x/${id}`, category, importance, sentiment, kind,
  sourceName: 'test', publishedAt: new Date(now - pubAgoH * h), firstSeenAt: new Date(now - Math.max(0, pubAgoH) * h + 1000),
  userLabel: null, instruments: [{ ticker }] });
const posts = [
  P('H1', 's1', 'AAA', 'hack', 85, 'bearish', 3),
  P('O1', 's2', 'AAA', 'other', 20, 'neutral', 1),
  P('B1', 's3', 'BBB', 'other', 20, 'neutral', 5),
  P('B2', 's3', 'BBB', 'other', 30, 'neutral', 4), // same story as B1
  P('B3', 's4', 'BBB', 'other', 20, 'neutral', 1),
  P('B4', 's5', 'BBB', 'other', 20, 'neutral', 49), // too old
  // F3 (step 7 fix round): media/social must never feed newsCount48h/newsLatest.
  P('M1', 's6', 'CCC', 'other', 10, 'neutral', 1, 'media'),
  P('S1', 's7', 'CCC', 'other', 10, 'neutral', 1, 'social'),
];
let capturedWhere = null;
const prisma = { post: { findMany: async (q) => {
  const w = q.where; capturedWhere = w;
  return posts.filter((p) => p.publishedAt >= w.publishedAt.gte && p.publishedAt <= w.publishedAt.lte && p.firstSeenAt >= w.firstSeenAt.gte && (!w.importance || p.importance >= w.importance.gte));
} } };
const stop = startNewsFile({ prisma, scheduler: null, intervalMs: 200 });
setTimeout(async () => {
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
  eq('F3: media/social excluded from newsCount48h/newsLatest -> CCC (media+social only) has no flags entry at all', j.flags.CCC, undefined);

  console.log('— F1 (fix round): chips/counts split queries with injectable take limits avoid the flood-truncation bug');
  {
    // A wide flood of very recent low-importance posts (would rank first under firstSeenAt-desc
    // sorting) and one much older (but chip-worthy, importance>=50) post that a single shared
    // small `take` would have crowded out entirely.
    const floodPosts = [];
    for (let i = 0; i < 6; i++) {
      floodPosts.push(P(`FLOOD${i}`, `sflood${i}`, 'FLD', 'other', 10, 'neutral', 0.001 * (i + 1)));
    }
    const chipPost = P('CHIP1', 'schip', 'CHP', 'hack', 90, 'bearish', 10);
    const rows = [...floodPosts, chipPost];
    const calls = [];
    const fakePrisma = { post: { findMany: async (q) => {
      calls.push(q);
      const w = q.where;
      let rs = rows.filter((p) =>
        p.publishedAt >= w.publishedAt.gte && p.publishedAt <= w.publishedAt.lte && p.firstSeenAt >= w.firstSeenAt.gte);
      if (w.importance) rs = rs.filter((p) => p.importance >= w.importance.gte);
      if (w.kind && w.kind.notIn) rs = rs.filter((p) => !w.kind.notIn.includes(p.kind));
      rs = rs.slice().sort((x, y) => y.firstSeenAt - x.firstSeenAt);
      if (q.take) rs = rs.slice(0, q.take);
      return rs;
    } } };
    const CHIPS_TAKE = 3, COUNTS_TAKE = 4;
    const f1out = await tick(fakePrisma, null, { chipsTake: CHIPS_TAKE, countsTake: COUNTS_TAKE });
    check('exactly 2 findMany calls (one chips query, one counts query)', calls.length === 2, calls.length);
    const takes = calls.map((c) => c.take).sort((x, y) => x - y);
    eq('the two calls used the two distinct injected take values', takes, [CHIPS_TAKE, COUNTS_TAKE]);
    check('chips query filtered importance>=50 in SQL', calls.some((c) => c.where.importance && c.where.importance.gte === 50));
    check('counts query excluded media/social in SQL (kind notIn)', calls.some((c) => c.where.kind && Array.isArray(c.where.kind.notIn) && c.where.kind.notIn.includes('media') && c.where.kind.notIn.includes('social')));
    check('the >=50 chip (10h old) still appears despite chipsTake=3 and 6 newer low-importance flood posts crowding the same window (would have been dropped by a single shared small take)', !!f1out.flags.CHP && !!f1out.flags.CHP.risk && f1out.flags.CHP.risk.id === 'CHIP1', f1out.flags.CHP);
    eq('counts use the counts query\'s own take (4), independent of chipsTake (3): FLD newsCount48h truncates at 4 of the 6 flood stories', f1out.flags.FLD && f1out.flags.FLD.newsCount48h, 4);
  }

  try { fs.unlinkSync(out); } catch {}
  done('step1_newsfile2');
}, 900);
