'use strict';
// One-off, idempotent backfill: re-run classify() over stored posts from the last N days and update
// category / importance / sentiment, only for posts whose category changed (same fields the ingest store writes).
// unlock fields (amount/pct) and flags are derived values that ingest never persists, so there is
// nothing to store for them. Skips kinds whose category came from adapter hints (exchange/symbol/
// regulator/social) because hintCategory / maxImportance are not stored.
//   node ingest/reclassify.js --days 14 [--dry]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const { loadUniverse, tagTickers } = require('./tickers');
const { classify } = require('./classify');

const KINDS = ['news', 'media', 'official'];

async function main() {
  const argv = process.argv.slice(2);
  const di = argv.indexOf('--days');
  const days = di >= 0 ? parseInt(argv[di + 1], 10) || 14 : 14;
  const dry = argv.includes('--dry');
  const prisma = new PrismaClient();
  await loadUniverse();
  const since = new Date(Date.now() - days * 86400000);
  const posts = await prisma.post.findMany({
    where: { publishedAt: { gte: since }, kind: { in: KINDS } },
    include: { instruments: { select: { ticker: true } } },
  });
  let changed = 0;
  const rows = [];
  for (const p of posts) {
    const stored = p.instruments.map((i) => i.ticker);
    const tickers = Array.from(new Set([...stored, ...tagTickers(p.title, [], { kind: p.kind })]));
    const capped = /^(tg:whale_alert_io|bsky:|reddit:)/.test(String(p.sourceName || '')); // ingest forced importance<=10
    const cls = classify({ title: p.title, ...(capped ? { maxImportance: 10 } : {}), kind: p.kind, sourceName: p.sourceName, sourceTier: p.sourceTier, exchange: p.exchange }, tickers);
    // Only rows whose CATEGORY changes are touched: importance caps set at ingest (maxImportance,
    // per-channel) are not stored, so importance-only diffs would wrongly lift capped posts.
    if (cls.category === p.category) continue;
    const data = { category: cls.category };
    if (cls.importance !== p.importance) data.importance = cls.importance;
    if (cls.sentiment !== p.sentiment) data.sentiment = cls.sentiment;
    if (Object.keys(data).length === 0) continue;
    changed++;
    rows.push({ title: p.title, before: [p.category, p.importance, p.sentiment], after: [cls.category, cls.importance, cls.sentiment] });
    if (!dry) await prisma.post.update({ where: { id: p.id }, data });
  }
  console.log(`[reclassify] ${dry ? 'DRY ' : ''}scanned ${posts.length} posts (${days}d, kinds ${KINDS.join('/')}), changed ${changed}`);
  const byTrans = {};
  for (const r of rows) { const k = r.before.slice(0, 2).join('/') + ' -> ' + r.after.slice(0, 2).join('/'); byTrans[k] = (byTrans[k] || 0) + 1; }
  console.log('[reclassify] transitions:', JSON.stringify(byTrans));
  for (const r of rows) console.log('  ' + r.before.join('/') + ' -> ' + r.after.join('/') + '  ' + r.title.slice(0, 110));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
