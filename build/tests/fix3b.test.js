// Fix round 3b (Astra B3/B4/B5/B8, Fable-minimal fixes): durability of detail tags, symbol discovery, delistings, supervisor lock.
process.chdir('D:/claude projects/crypto-news-terminal/app');
process.env.BBW_LIVE_JSON = 'D:/nonexistent/base_break_live.json';
const { check, eq, done } = require('./assert_lib');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const FX = path.join(__dirname, 'fixtures');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { MemoryRedis } = require(APP + '/ingest/redisOptional.js');
const http = require(APP + '/ingest/http.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fakePrisma(mem, hooks = {}) {
  return { knownSymbol: {
    findMany: async ({ where }) => mem.filter((r) => r.venue === where.venue && (where.pendingEmit === undefined || r.pendingEmit === where.pendingEmit)),
    create: async ({ data }) => { if (hooks.create) hooks.create(data); if (mem.some((r) => r.venue === data.venue && r.symbol === data.symbol)) { const e = new Error('dup'); e.code = 'P2002'; throw e; } mem.push({ firstSeenAt: new Date(), pendingEmit: false, ...data }); return data; },
    createMany: async ({ data }) => { for (const d of data) mem.push({ pendingEmit: false, ...d }); return {}; },
    updateMany: async ({ where, data }) => { if (hooks.updateMany) hooks.updateMany(); let n = 0; for (const r of mem) if (r.venue === where.venue && where.symbol.in.includes(r.symbol)) { Object.assign(r, data); n++; } return { count: n }; },
    update: async ({ where, data }) => { const r = mem.find((x) => x.venue === where.venue_symbol.venue && x.symbol === where.venue_symbol.symbol); if (r) Object.assign(r, data); return r; } } };
}

(async () => {
  let cb = JSON.parse(fs.readFileSync(path.join(FX, 'coinbase_products.json'), 'utf8'));
  const realReq = http.request;
  http.request = async (url) => { if (/coinbase\.com/.test(url)) return { status: 200, json: () => cb, text: '' }; throw new Error('unexpected ' + url); };
  delete require.cache[require.resolve(APP + '/ingest/adapters/symbols.js')];
  const symbols = require(APP + '/ingest/adapters/symbols.js');
  const coinbase = (p) => symbols.make({ prisma: p }).find((a) => a.name.includes('coinbase'));
  const cbOrig = cb;

  console.log('— B4a: a new base is durable (pendingEmit:true) even if the separate flag update would fail');
  const memA = []; const fa = fakePrisma(memA, { updateMany: () => { throw new Error('db down'); } });
  const adA = coinbase(fa); await adA.run(); // seed
  cb = [...cbOrig, { id: 'NEWA-USD', base_currency: 'NEWA', quote_currency: 'USD', status: 'online' }];
  const ra = await adA.run();
  check('item emitted for NEWA', ra.some((i) => i.hintTickers[0] === 'NEWA'), ra.map((i) => i.title));
  eq('NEWA row already pendingEmit:true (single atomic write)', (memA.find((r) => r.symbol === 'NEWA-USD') || {}).pendingEmit, true);

  console.log('— B4b: flood decision made before persistence; partial failures do not leak later');
  const memB = []; let failSet = new Set();
  const fb = fakePrisma(memB, { create: (d) => { if (failSet.has(d.symbol)) throw new Error('write failed'); } });
  cb = cbOrig; const adB = coinbase(fb); await adB.run();
  const fifteen = Array.from({ length: 15 }, (_, i) => ({ id: `FL${i}X-USD`, base_currency: `FL${i}X`, quote_currency: 'USD', status: 'online' }));
  failSet = new Set(fifteen.slice(0, 5).map((p) => p.id));
  cb = [...cbOrig, ...fifteen];
  eq('15 new bases (5 writes fail) → 0 items this cycle', (await adB.run()).filter((i) => /^FL/.test(i.hintTickers[0] || '')).length, 0);
  failSet = new Set();
  eq('retry of the 5 failed writes next cycle → still 0 items (flood-suppressed)', (await adB.run()).filter((i) => /^FL/.test(i.hintTickers[0] || '')).length, 0);
  eq('no flooded row is pendingEmit', memB.filter((r) => /^FL/.test(r.symbol) && r.pendingEmit).length, 0);

  console.log('— B8: Coinbase delisting is durable until the Store acknowledges it');
  const memC = []; const fc = fakePrisma(memC);
  cb = cbOrig; const adC = coinbase(fc); await adC.run(); await adC.run();
  const victim = cbOrig.find((p) => p.status === 'online' && cbOrig.filter((q) => q.base_currency === p.base_currency && q.status === 'online').length === 1);
  const V = victim.base_currency;
  cb = cbOrig.map((p) => (p.id === victim.id ? { ...p, status: 'delisted' } : p));
  const dl = (arr) => arr.filter((i) => i.hintCategory === 'delisting' && i.hintTickers[0] === V);
  await adC.run(); await adC.run();
  const d3 = dl(await adC.run());
  eq(`3rd missing run → one delisting (${V})`, d3.length, 1);
  check('delisting item carries a durable symbolRef', d3[0] && d3[0].symbolRef && d3[0].symbolRef.venue === 'coinbase' && /^DELIST:/.test(d3[0].symbolRef.symbol), d3[0] && d3[0].symbolRef);
  eq('not acknowledged → returned again next run', dl(await adC.run()).length, 1);
  const adC2 = coinbase(fc); // restart over the same DB
  eq('after restart, still-pending delisting is re-emitted once', dl(await adC2.run()).length, 1);
  check('restart does not treat DELIST rows as known symbols (no bogus listing)', !(await adC2.run()).some((i) => i.hintCategory === 'listing'));
  const row = memC.find((r) => r.symbol === 'DELIST:' + V); if (row) row.pendingEmit = false; // Store ack
  eq('after ack → not returned', dl(await adC2.run()).length, 0);
  cb = cbOrig; http.request = realReq;

  console.log('— B4c: Store acknowledges a symbol even when the URL duplicate is not in its memory cache');
  const { Store } = require(APP + '/ingest/store.js'); const { StoryIndex } = require(APP + '/ingest/cluster.js');
  const U = 'https://www.binance.com/en/trade/F3BUSDT?type=spot';
  await prisma.post.deleteMany({ where: { url: U } }); await prisma.knownSymbol.deleteMany({ where: { symbol: 'F3BUSDT' } });
  await prisma.post.create({ data: { title: 'New Binance spot market live: F3BUSDT', url: U, sourceDomain: 'binance.com', publishedAt: new Date(), kind: 'symbol', sentiment: 'neutral', category: 'listing', importance: 80, sourceName: 'sym-binance-spot', sourceTier: 1, firstSeenAt: new Date() } });
  await prisma.knownSymbol.create({ data: { venue: 'binance-spot', symbol: 'F3BUSDT', pendingEmit: true } });
  const coldStore = new Store({ prisma, redis: new MemoryRedis(), storyIndex: new StoryIndex() }); // no init → empty url cache
  await coldStore.save({ sourceName: 'sym-binance-spot', sourceTier: 1, kind: 'symbol', exchange: 'Binance', title: 'New Binance spot market live: F3BUSDT', url: U, publishedAt: new Date(), hintCategory: 'listing', hintTickers: ['F3B'], symbolRef: { venue: 'binance-spot', symbol: 'F3BUSDT' } });
  eq('pendingEmit cleared on the P2002-url path', (await prisma.knownSymbol.findUnique({ where: { venue_symbol: { venue: 'binance-spot', symbol: 'F3BUSDT' } } })).pendingEmit, false);
  await prisma.post.deleteMany({ where: { url: U } }); await prisma.knownSymbol.deleteMany({ where: { symbol: 'F3BUSDT' } });

  console.log('— B3: failed detail extraction is retried; revisions keep detail-derived tickers');
  const D = require(APP + '/ingest/details.js');
  let detailResult = [];
  D.detailTickers = async () => detailResult;
  delete require.cache[require.resolve(APP + '/ingest/store.js')];
  const Store2 = require(APP + '/ingest/store.js').Store;
  const st = new Store2({ prisma, redis: new MemoryRedis(), storyIndex: new StoryIndex() }); st.beginBatch();
  const DU = 'https://www.binance.com/en/support/announcement/detail/f3b-' + Date.now();
  const raw = { sourceName: 'binance-cms', sourceTier: 1, kind: 'exchange', exchange: 'Binance', title: 'Binance Will Delist Several Spot Trading Pairs on 2026-10-02', url: DU, publishedAt: new Date(), hintCategory: 'delisting', hintTickers: [] };
  await st.save(raw);
  const inst = async () => (await prisma.post.findUnique({ where: { url: DU }, include: { instruments: true } })).instruments.map((i) => i.ticker).sort();
  eq('detail fetch failed → 0 instruments', await inst(), []);
  detailResult = ['ENJ', 'DOLO']; st.beginBatch();
  await st.save(raw);
  eq('same notice seen again, detail now OK → instruments filled', await inst(), ['DOLO', 'ENJ']);
  st.beginBatch();
  await st.save({ ...raw, title: 'Binance Will Delist Several Spot Trading Pairs on 2026-10-03 (updated)' });
  eq('title revision with no title tickers keeps detail instruments', await inst(), ['DOLO', 'ENJ']);
  await prisma.post.deleteMany({ where: { url: DU } });

  console.log('— B5: a supervisor that loses its lock shuts down and leaves the new owner\'s lock alone');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suplock-'));
  fs.copyFileSync(APP + '/supervisor.js', path.join(dir, 'supervisor.js'));
  for (const f of ['ingest.js', 'signalSnap.js']) fs.writeFileSync(path.join(dir, f), 'setInterval(() => {}, 1000);');
  const logs = path.join(dir, 'logs');
  const sup = cp.spawn(process.execPath, ['supervisor.js'], { cwd: dir, env: process.env, windowsHide: true });
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  await wait(3000);
  check('supervisor running with the lock', alive(sup.pid) && fs.readFileSync(path.join(logs, 'supervisor.pid'), 'utf8').trim() === String(sup.pid));
  fs.writeFileSync(path.join(logs, 'supervisor.pid'), '4\n'); // another starter took the lock
  const t0 = Date.now(); while (alive(sup.pid) && Date.now() - t0 < 12000) await wait(300);
  check('supervisor exits within ~12 s after losing the lock', !alive(sup.pid));
  check('logged the lock loss', /lock lost/i.test(fs.readFileSync(path.join(logs, 'supervisor.log'), 'utf8')));
  eq('the other owner\'s lock file is left intact', fs.existsSync(path.join(logs, 'supervisor.pid')) && fs.readFileSync(path.join(logs, 'supervisor.pid'), 'utf8').trim(), '4');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

  await prisma.$disconnect();
  done('fix3b');
})().catch(async (e) => { console.error('TEST CRASH', e); try { await prisma.$disconnect(); } catch {} process.exit(2); });
