// Fix round 3 (Astra catch-up blockers, verified by Fable): alert path + classifier + BWEnews. Test DB only.
process.chdir('D:/claude projects/crypto-news-terminal/app');
process.env.DISCORD_NEWS_WEBHOOK = 'https://discord.test/webhook';
process.env.NEWS_PORTFOLIO = 'TSTA,TSTB,SOL';
process.env.BBW_LIVE_JSON = 'D:/nonexistent/base_break_live.json';
const { check, eq, done } = require('./assert_lib');
require('dotenv').config();
const fs = require('fs'), path = require('path');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { classify } = require(APP + '/ingest/classify.js');
const { MemoryRedis } = require(APP + '/ingest/redisOptional.js');
const http = require(APP + '/ingest/http.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cls = (t, kind = 'news', hc = null) => classify({ kind, title: t, sourceTier: kind === 'exchange' ? 1 : 3, hintCategory: hc }, []);
const mkPost = (url, extra = {}) => prisma.post.create({ data: { title: 'Solana hacked ' + url, url, sourceDomain: 'test.local', publishedAt: new Date(), kind: 'news', sentiment: 'bearish', category: 'hack', importance: 85, sourceName: 'test', sourceTier: 3, firstSeenAt: new Date(), instruments: { connectOrCreate: [{ where: { ticker: 'SOL' }, create: { ticker: 'SOL', name: 'Solana' } }] }, ...extra } });

(async () => {
  await prisma.post.updateMany({ where: { alertState: { in: ['pending', 'sending'] } }, data: { alertState: 'skip' } });
  await prisma.post.deleteMany({ where: { url: { startsWith: 'https://test.local/f3/' } } });
  const { Alerts, startAlertWorker } = require(APP + '/ingest/discord.js');
  const redis = new MemoryRedis(); const alerts = new Alerts({ prisma, redis });

  console.log('— B1a: enqueue never downgrades a sent/uncertain post (dto from serialize has no alertState)');
  const sentP = await mkPost('https://test.local/f3/sent', { alertState: 'sent', alertSentAt: new Date() });
  const dto = { id: sentP.id, instruments: [{ ticker: 'SOL' }], importance: 85, publishedAt: new Date() };
  await alerts.enqueue(dto, { warm: true });
  eq('sent post stays sent after revision enqueue', (await prisma.post.findUnique({ where: { id: sentP.id } })).alertState, 'sent');
  const uncP = await mkPost('https://test.local/f3/unc', { alertState: 'uncertain' });
  await alerts.enqueue({ ...dto, id: uncP.id }, { warm: true });
  eq('uncertain post stays uncertain', (await prisma.post.findUnique({ where: { id: uncP.id } })).alertState, 'uncertain');
  const newP = await mkPost('https://test.local/f3/new');
  await alerts.enqueue({ ...dto, id: newP.id }, { warm: true });
  eq('null-state eligible post → pending', (await prisma.post.findUnique({ where: { id: newP.id } })).alertState, 'pending');
  check('ingest.js no longer re-enqueues revisions through alerts.enqueue', !/revised\)\s*await alerts\.enqueue/.test(fs.readFileSync(APP + '/ingest.js', 'utf8')));
  await prisma.post.updateMany({ where: { url: { startsWith: 'https://test.local/f3/' } }, data: { alertState: 'skip' } });

  console.log('— B1b: POST ok but the "sent" write fails → never resent');
  const p = await mkPost('https://test.local/f3/ack', { alertState: 'pending' });
  let thrown = false, calls = 0;
  const postProxy = new Proxy(prisma.post, { get(t, k) {
    if (k === 'update') return async (args) => { if (!thrown && args && args.data && args.data.alertState === 'sent') { thrown = true; throw new Error('db ack failed'); } return t.update(args); };
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  const wrapped = new Proxy(prisma, { get(t, k) { if (k === 'post') return postProxy; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  const rf = global.fetch; global.fetch = async () => { calls++; return new Response(null, { status: 204 }); };
  let stop = startAlertWorker({ prisma: wrapped, redis, alerts, intervalMs: 200 });
  await wait(1500); stop && stop(); await wait(400);
  eq('webhook called exactly once', calls, 1);
  eq('final state uncertain (not pending)', (await prisma.post.findUnique({ where: { id: p.id } })).alertState, 'uncertain');

  console.log('— B1c: an uncertain/sending post reserves its story (no second send)');
  const a = await mkPost('https://test.local/f3/storyA', { alertState: 'uncertain' });
  const b = await mkPost('https://test.local/f3/storyB', { alertState: 'pending', storyId: a.id });
  calls = 0; stop = startAlertWorker({ prisma, redis, alerts, intervalMs: 200 });
  await wait(1200); stop && stop(); await wait(400); global.fetch = rf;
  eq('story twin of an uncertain alert → skip, no webhook call', [(await prisma.post.findUnique({ where: { id: b.id } })).alertState, calls], ['skip', 0]);

  console.log('— B2: passive negation of regulatory resolution');
  eq('"SEC lawsuit was not dismissed" → bearish', cls('SEC lawsuit was not dismissed').sentiment, 'bearish');
  eq('"SEC case against Ripple dismissed" → bullish', cls('SEC case against Ripple dismissed').sentiment, 'bullish');
  eq('"Judge dismisses SEC case" → bullish', cls('Judge dismisses SEC case').sentiment, 'bullish');
  eq('"charges were never dropped" → not bullish', cls('Fraud charges against founder were never dropped').sentiment === 'bullish', false);

  console.log('— B9: Alpha / stock-perp downgrades never hide a hack');
  const h1 = cls('Token hacked after Binance Alpha listing');
  eq('news: hacked after Alpha listing → hack, bearish', [h1.category, h1.sentiment], ['hack', 'bearish']);
  check('... importance ≥ 80', h1.importance >= 80, h1.importance);
  eq('exchange: exploited after Alpha listing → hack', cls('XYZ exploited hours after Binance Alpha listing', 'exchange').category, 'hack');
  eq('pure Alpha announcement still other/30', (({ category, importance }) => [category, importance])(cls("Binance Alpha Listing(Doesn't mean official listing): Binance Alpha lists new tokens: Gstock (GSTOCK)", 'news')), ['other', 30]);
  eq('"Bybit xStocks exploited" → hack', cls('Bybit xStocks exploited for $3M').category, 'hack');
  eq('plain stock perp listing still other/30', (({ category, importance }) => [category, importance])(cls('Bitget will list OURA stock perpetual', 'exchange', 'listing')), ['other', 30]);

  console.log('— B7: BWEnews returns parsed items every poll (Store dedupes by URL)');
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'bwenews.html'), 'utf8');
  const realReq = http.request; http.request = async () => ({ status: 200, text: html, json: () => ({}) });
  delete require.cache[require.resolve(APP + '/ingest/adapters/bwenews.js')];
  const bw = require(APP + '/ingest/adapters/bwenews.js').make();
  const i1 = await bw.run(), i2 = await bw.run();
  check('same page twice → same non-empty list', i1.length > 0 && JSON.stringify(i1.map((x) => x.url)) === JSON.stringify(i2.map((x) => x.url)), [i1.length, i2.length]);
  http.request = realReq;

  await prisma.post.deleteMany({ where: { url: { startsWith: 'https://test.local/f3/' } } });
  await prisma.$disconnect();
  done('fix3');
})().catch(async (e) => { console.error('TEST CRASH', e); try { await prisma.$disconnect(); } catch {} process.exit(2); });
