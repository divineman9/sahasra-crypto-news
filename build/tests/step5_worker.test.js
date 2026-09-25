// Step 5 (worker): signalSnap.js against cryptonews_test with fixture files — stores rows, Json nulls, late marking, frozen-ness.
const { check, eq, done } = require('./assert_lib');
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const { PrismaClient } = require(APP + '/node_modules/@prisma/client');
const prisma = new PrismaClient();

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigsnap-'));
const F = { bbw: path.join(dir, 'bbw.json'), news: path.join(dir, 'news.json'), events: path.join(dir, 'events.json') };
const now = Date.now(), iso = (t) => new Date(t).toISOString();
const item = (id, category, sentiment) => ({ id, title: 'T ' + id, url: 'u', category, importance: 85, sentiment, source: 's', storyId: id, publishedAt: iso(now - 3600e3), firstSeenAt: iso(now - 3600e3) });
const writeAll = (newsFlags) => {
  fs.writeFileSync(F.bbw, JSON.stringify({ asof: iso(Date.now()), asof_ms: Date.now(),
    setups: [
      { symbol: 'HYPEUSDT', tf: '1h', direction: 'UP', stage: 'BAR1_CONFIRMED', bar1_t: 1790300000000, high_vol: true },
      { symbol: 'ETHUSDT', tf: '15m', direction: 'DOWN', stage: 'BAR2_CONFIRMED', bar1_t: 1790300900000, high_vol: false },
      { symbol: 'SOLUSDT', tf: '5m', direction: 'UP', stage: 'BASING', bar1_t: 1790301000000 } ],
    events: [{ ts_ms: Date.now() - 20000, symbol: 'HYPEUSDT', tf: '1h', direction: 'UP', bar1_t: 1790300000000, stage: 'BAR1_CONFIRMED' }] }));
  fs.writeFileSync(F.news, JSON.stringify({ schema: 2, asof_ms: Date.now(), health: { known: true, ok: true }, flags: newsFlags }));
  fs.writeFileSync(F.events, JSON.stringify({ asof_ms: Date.now(), risk: {}, badges: {}, unlocks_upcoming: [] }));
};
const runWorker = (ms) => new Promise((resolve) => {
  const p = spawn(process.execPath, ['signalSnap.js'], { cwd: APP, env: { ...process.env, BBW_LIVE_JSON: F.bbw, NEWS_LIVE_JSON: F.news, EVENTS_LIVE_JSON: F.events }, windowsHide: true });
  let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
  setTimeout(() => { p.kill(); resolve(out); }, ms);
});

(async () => {
  await prisma.signalSnapshot.deleteMany({});
  writeAll({ HYPE: { count: 2, risk: item('h1', 'hack', 'bearish'), catalyst: item('l1', 'listing', 'bullish'), other: null, items: [item('h1', 'hack', 'bearish')] } });
  const out1 = await runWorker(22000);
  const rows = await prisma.signalSnapshot.findMany({ orderBy: { symbol: 'asc' } });
  check('worker ran without store errors', !/failed to store|fatal/.test(out1), out1.slice(-600));
  eq('2 signal rows stored (BASING skipped)', rows.map((r) => r.symbol), ['ETHUSDT', 'HYPEUSDT']);
  const hype = rows.find((r) => r.symbol === 'HYPEUSDT'), eth = rows.find((r) => r.symbol === 'ETHUSDT');
  eq('HYPE key includes direction', hype && hype.key, 'HYPEUSDT|1h|1790300000000|UP|BAR1_CONFIRMED');
  eq('HYPE seen by watcher 20 s earlier → not late, coverage news', hype && [hype.late, hype.coverage], [false, 'news']);
  eq('HYPE newsIds include the single-object catalyst pick', hype && [...hype.newsIds].sort(), ['h1', 'l1']);
  check('HYPE watcherSeenAt + lagMs stored', hype && hype.watcherSeenAt instanceof Date && hype.lagMs > 0);
  eq('HYPE newsCount', hype && hype.newsCount, 2);
  check('bar1T round-trips as BigInt', hype && typeof hype.bar1T === 'bigint' && hype.bar1T === 1790300000000n);
  eq('ETH has no watcher event → late, unknown', eth && [eth.late, eth.coverage, eth.watcherSeenAt], [true, 'unknown', null]);
  eq('Json nulls stored as DB null (eventReasons, scheduled)', eth && [eth.eventReasons, eth.scheduled], [null, null]);

  const before = JSON.stringify(hype, (k, v) => (typeof v === 'bigint' ? String(v) : v));
  writeAll({ HYPE: { count: 3, risk: item('h1', 'hack', 'bearish'), catalyst: item('l1', 'listing', 'bullish'), other: item('x9', 'other', 'neutral'), items: [item('x9', 'other', 'neutral')] } });
  await runWorker(22000); // restart with later news
  const after = await prisma.signalSnapshot.findUnique({ where: { key: hype.key } });
  eq('frozen: later news does not change the stored snapshot', JSON.stringify(after, (k, v) => (typeof v === 'bigint' ? String(v) : v)), before);
  eq('frozen: still exactly 2 rows', await prisma.signalSnapshot.count(), 2);

  await prisma.signalSnapshot.deleteMany({});
  await prisma.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
  done('step5_worker');
})().catch(async (e) => { console.error('TEST CRASH', e); try { await prisma.$disconnect(); } catch {} process.exit(2); });
