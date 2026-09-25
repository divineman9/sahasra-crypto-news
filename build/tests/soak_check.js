// Phase 1 soak gate: per-adapter counts, missed-merge (duplicate) rate, price-binding stats,
// source health, and a random sample of 50 tagged posts for a manual false-tag audit.
// Run from the app dir:  NODE_PATH=node_modules node ../build/tests/soak_check.js [hours=24]
process.chdir('D:/claude projects/crypto-news-terminal/app');
require('dotenv').config();
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { normalize } = require('D:/claude projects/crypto-news-terminal/app/ingest/cluster.js');

const hours = Number(process.argv[2] || 24);

(async () => {
  const prisma = new PrismaClient();
  const since = new Date(Date.now() - hours * 3600e3);
  const posts = await prisma.post.findMany({
    where: { firstSeenAt: { gte: since } },
    include: { instruments: true },
    orderBy: { firstSeenAt: 'asc' },
  });
  const out = [];
  const log = (s = '') => { console.log(s); out.push(s); };

  log(`# Soak check — last ${hours} h (${new Date().toISOString()})`);
  log(`posts first seen in window: ${posts.length}`);

  // 1. per-adapter counts
  const byAdapter = {};
  for (const p of posts) byAdapter[p.sourceName] = (byAdapter[p.sourceName] || 0) + 1;
  log('\n## Posts per adapter');
  for (const [k, v] of Object.entries(byAdapter).sort((a, b) => b[1] - a[1])) log(`- ${k}: ${v}`);

  // 2. missed merges: same normalized title but different storyId
  const byNorm = new Map();
  for (const p of posts) {
    const n = normalize(p.title);
    if (!byNorm.has(n)) byNorm.set(n, new Set());
    byNorm.get(n).add(p.storyId || p.id);
  }
  const missed = [...byNorm.entries()].filter(([, s]) => s.size > 1);
  const stories = new Set(posts.map(p => p.storyId || p.id));
  log('\n## Clustering');
  log(`stories: ${stories.size} | multi-source stories: ${[...stories].filter(s => posts.filter(p => (p.storyId || p.id) === s).length > 1).length}`);
  log(`identical normalized titles split across stories (missed merges): ${missed.length} (${(100 * missed.length / Math.max(1, stories.size)).toFixed(1)}% of stories)`);
  for (const [n] of missed.slice(0, 10)) log(`  - "${n.slice(0, 90)}"`);

  // 3. price binding
  const ps = {};
  for (const p of posts) ps[p.priceStatus] = (ps[p.priceStatus] || 0) + 1;
  const done = posts.filter(p => p.priceStatus === 'done');
  log('\n## Price binding');
  log(`status counts: ${JSON.stringify(ps)}`);
  log(`done: ${done.length} | moved5m (|ret5m|>=1%): ${done.filter(p => p.moved5m).length}`);
  for (const p of done.slice(-10)) log(`  - ${p.priceTicker} 1m ${p.ret1m} 5m ${p.ret5m} 15m ${p.ret15m} | ${p.title.slice(0, 70)}`);

  // 4. categories / importance
  const cats = {};
  for (const p of posts) cats[p.category] = (cats[p.category] || 0) + 1;
  log('\n## Categories');
  log(JSON.stringify(cats));

  // 5. health — production runs with NEWS_REDIS=off, so read the news file and the supervisor status
  log('\n## Adapter health (news_live.json) and supervisor (logs/status.json)');
  try {
    const nl = JSON.parse(fs.readFileSync('D:/claude projects/crypto/screener/news_live.json', 'utf8'));
    log(`news file age: ${Math.round((Date.now() - nl.asof_ms) / 1000)} s | schema ${nl.schema} | health ok: ${nl.health && nl.health.ok} | tier-1 ${nl.health && nl.health.tier1Ok}/${nl.health && nl.health.tier1Total} | stale: ${(nl.health && nl.health.stale || []).join(', ') || 'none'}`);
  } catch (e) { log('news_live.json unreadable: ' + e.message); }
  try {
    const st = JSON.parse(fs.readFileSync('D:/claude projects/crypto-news-terminal/app/logs/status.json', 'utf8'));
    for (const [name, v] of Object.entries(st.services || {})) log(`- ${name}: pid ${v.pid}, restarts ${v.restarts}, last exit ${v.lastExitCode ?? '-'} at ${v.lastExitAt ?? '-'}`);
  } catch (e) { log('status.json unreadable: ' + e.message); }
  try {
    const lg = fs.readdirSync('D:/claude projects/crypto-news-terminal/app/logs').filter((f) => f.endsWith('.log'));
    log('log files: ' + lg.map((f) => f + ' ' + Math.round(fs.statSync('D:/claude projects/crypto-news-terminal/app/logs/' + f).size / 1024) + ' KB').join(', '));
  } catch (e) {}

  // 6. false-tag audit sample
  const tagged = posts.filter(p => p.instruments.length > 0);
  const sample = [];
  const pool = tagged.slice();
  while (sample.length < 50 && pool.length) sample.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  log(`\n## False-tag audit sample (${sample.length} of ${tagged.length} tagged posts) — mark each tag right/wrong`);
  sample.forEach((p, i) => log(`${i + 1}. [${p.instruments.map(x => x.ticker).join(',')}] (${p.category} ${p.importance}) ${p.title}`));

  // 7. missed-ticker audit (Astra #11): important or exchange posts that got NO ticker
  const untagged = posts.filter(p => p.instruments.length === 0 && (p.importance >= 50 || p.kind === 'exchange'));
  log(`
## Missed-ticker audit — ${untagged.length} important/exchange posts with NO ticker (check if a coin was missed)`);
  untagged.slice(0, 30).forEach((p, i) => log(`${i + 1}. (${p.sourceName} ${p.category} ${p.importance}) ${p.title}`));

  const file = `D:/claude projects/crypto-news-terminal/build/soak_report_${new Date().toISOString().slice(0, 13).replace(/[:T]/g, '-')}.md`;
  fs.writeFileSync(file, out.join('\n'));
  console.log(`\nreport written: ${file}`);
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
