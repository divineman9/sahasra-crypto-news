// Steps 6-7: BWEnews parser/gating, Upbit mapping, OKX + Coinbase symbol diff (fixtures from live data; no DB).
const { check, eq, done } = require('./assert_lib');
const fs = require('fs'), path = require('path');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const FX = path.join(__dirname, 'fixtures');
const http = require(APP + '/ingest/http.js');

(async () => {
  console.log('— step 6 BWEnews');
  const bw = require(APP + '/ingest/adapters/bwenews.js');
  const html = fs.readFileSync(path.join(FX, 'bwenews.html'), 'utf8');
  const msgs = bw.parseBwenews(html);
  eq('parses all 20 messages', msgs.length, 20);
  check('every message has t.me url + valid date', msgs.every((m) => /^https:\/\/t\.me\/BWEnews\/\d+$/.test(m.url) && m.publishedAt instanceof Date && !isNaN(m.publishedAt)));
  const bitget = msgs.find((m) => m.url.endsWith('/16490'));
  check('entities decoded (Bitget\'s not &#39;)', bitget && /Bitget's/.test(bitget.text) && !/&#39;/.test(bitget.text), bitget && bitget.text.slice(0, 80));
  const reply = msgs.find((m) => m.url.endsWith('/16491'));
  check('reply message uses its OWN text, not the quoted post', reply && !/Bitget's representitive/.test(reply.text) && /x\.com/.test(reply.text), reply && reply.text.slice(0, 120));
  check('external source link captured (x.com)', reply && reply.links.some((l) => /x\.com\//.test(l)), reply && reply.links);
  let threw = false; try { bw.parseBwenews('<html><body>' + 'x'.repeat(5000) + '</body></html>'); } catch { threw = true; }
  check('non-empty page with 0 messages → throws (layout change visible)', threw);
  const realReq = http.request;
  http.request = async () => ({ status: 200, text: html, json: () => ({}) });
  delete require.cache[require.resolve(APP + '/ingest/adapters/bwenews.js')];
  const bw2 = require(APP + '/ingest/adapters/bwenews.js');
  const a = bw2.make(); const items = await a.run();
  check('gated: only important items emitted (fewer than parsed)', items.length > 0 && items.length < 20, items.length);
  check('stolen-funds item emitted as tier-2 news', items.some((i) => /stolen/i.test(i.title) && i.sourceTier === 2 && i.kind === 'news'), items.map((i) => i.title.slice(0, 60)));
  check('titles are English only (no CJK) and no BWENEWS: prefix', items.every((i) => !/[\u3400-\u9FFF]/.test(i.title) && !/^BWENEWS:/i.test(i.title)), items.map((i) => i.title.slice(0, 60)));
  check('no imported ticker hints', items.every((i) => Array.isArray(i.hintTickers) && i.hintTickers.length === 0));
  eq('same page again → same items (Store dedupes by URL)', (await a.run()).length, items.length);
  http.request = realReq;

  console.log('— step 7a Upbit');
  const up = require(APP + '/ingest/adapters/upbit.js');
  const uj = JSON.parse(fs.readFileSync(path.join(FX, 'upbit.json'), 'utf8'));
  const ui = up.mapUpbit(uj);
  eq('maps 5 notices', ui.length, 5);
  check('upbit items: tier 1 exchange, [Upbit] title, notice url', ui.every((i) => i.sourceTier === 1 && i.kind === 'exchange' && i.exchange === 'Upbit' && /^\[Upbit\] /.test(i.title) && /notice\?id=\d+/.test(i.url)));
  const mantra = ui.find((i) => /MANTRA/.test(i.title));
  eq('publishedAt uses first_listed_at (not the edit time)', mantra && mantra.publishedAt.toISOString(), new Date(uj.data.notices.find((n) => /MANTRA/.test(n.title)).first_listed_at).toISOString());
  eq('deposit/withdrawal notice → maintenance, hint MANTRA', [mantra && mantra.hintCategory, mantra && mantra.hintTickers], ['maintenance', ['MANTRA']]);
  const cat = (t, c = '거래') => up.mapUpbit({ success: true, data: { notices: [{ id: 1, title: t, category: c, listed_at: '2026-09-25T10:00:00+09:00', first_listed_at: '2026-09-25T10:00:00+09:00' }] } })[0].hintCategory;
  eq('KRW market addition → listing', cat('테스트(TST) 원화 마켓 디지털 자산 추가'), 'listing');
  eq('trading support end → delisting', cat('테스트(TST) 거래지원 종료 안내'), 'delisting');
  eq('warning designation lifted → not delisting', cat('테스트(TST) 유의 종목 지정 해제'), null);
  let upThrew = false; try { up.mapUpbit({ success: true, data: { notices: [] } }); } catch { upThrew = true; }
  check('empty notices → throws', upThrew);

  console.log('— step 7b/7c OKX + Coinbase symbol diff');
  const fixtures = { SPOT: JSON.parse(fs.readFileSync(path.join(FX, 'okx_spot.json'), 'utf8')), SWAP: JSON.parse(fs.readFileSync(path.join(FX, 'okx_swap.json'), 'utf8')) };
  let cb = JSON.parse(fs.readFileSync(path.join(FX, 'coinbase_products.json'), 'utf8'));
  http.request = async (url) => {
    if (/okx\.com/.test(url)) { const t = /instType=SWAP/.test(url) ? 'SWAP' : 'SPOT'; return { status: 200, json: () => fixtures[t], text: '' }; }
    if (/coinbase\.com/.test(url)) return { status: 200, json: () => cb, text: '' };
    throw new Error('unexpected url ' + url);
  };
  delete require.cache[require.resolve(APP + '/ingest/adapters/symbols.js')];
  const symbols = require(APP + '/ingest/adapters/symbols.js');
  const mem = [];
  const fakePrisma = { knownSymbol: {
    findMany: async ({ where }) => mem.filter((r) => r.venue === where.venue && (where.pendingEmit === undefined || r.pendingEmit === where.pendingEmit)),
    create: async ({ data }) => { mem.push({ firstSeenAt: new Date(), pendingEmit: false, ...data }); return data; },
    createMany: async ({ data }) => { for (const d of data) mem.push({ pendingEmit: false, ...d }); return {}; },
    updateMany: async ({ where, data }) => { let n = 0; for (const r of mem) if (r.venue === where.venue && where.symbol.in.includes(r.symbol)) { Object.assign(r, data); n++; } return { count: n }; },
    update: async ({ where, data }) => { const r = mem.find((x) => x.venue === where.venue_symbol.venue && x.symbol === where.venue_symbol.symbol); Object.assign(r, data); return r; } } };
  const ads = symbols.make({ prisma: fakePrisma });
  const byName = Object.fromEntries(ads.map((x) => [x.name, x]));
  check('okx-spot, okx-swap and coinbase adapters exist', ['okx-spot', 'okx-swap', 'coinbase'].every((n) => Object.values(byName).some((a) => a.name.includes(n))), Object.keys(byName));
  const find = (frag) => Object.values(byName).find((a) => a.name.includes(frag));
  for (const f of ['okx-spot', 'okx-swap', 'coinbase']) eq(`${f}: first run seeds silently`, (await find(f).run()).length, 0);
  fixtures.SPOT = { code: '0', data: [...fixtures.SPOT.data, { instId: 'NEWX-USDT', baseCcy: 'NEWX', quoteCcy: 'USDT', state: 'preopen', listTime: String(Date.now() + 3600e3) }] };
  const sp = await find('okx-spot').run();
  check('OKX preopen spot → pre-listing item with open time', sp.length === 1 && /OKX pre-listing: NEWX-USDT opens \d{4}-\d{2}-\d{2}T/.test(sp[0].title) && sp[0].hintTickers[0] === 'NEWX' && sp[0].exchange === 'OKX', sp.map((i) => i.title));
  fixtures.SWAP = { code: '0', data: [...fixtures.SWAP.data, { instId: 'NEWY-USDT-SWAP', uly: 'NEWY-USDT', instFamily: 'NEWY-USDT', state: 'live', listTime: String(Date.now()) }] };
  const sw = await find('okx-swap').run();
  check('OKX new perp → item with base NEWY', sw.length === 1 && /NEWY-USDT-SWAP/.test(sw[0].title) && sw[0].hintTickers[0] === 'NEWY', sw.map((i) => i.title));
  cb = [...cb, { id: 'NEWZ-USD', base_currency: 'NEWZ', quote_currency: 'USD', status: 'online' }];
  const c1 = await find('coinbase').run();
  check('Coinbase new online product → item', c1.some((i) => i.hintTickers[0] === 'NEWZ' && i.exchange === 'Coinbase'), c1.map((i) => i.title));
  const victim = cb.find((p) => p.status === 'online' && cb.filter((q) => q.base_currency === p.base_currency && q.status === 'online').length === 1 && p.base_currency !== 'NEWZ');
  cb = cb.map((p) => (p.id === victim.id ? { ...p, status: 'delisted' } : p));
  const dl = (arr) => arr.filter((i) => i.hintCategory === 'delisting' && i.hintTickers[0] === victim.base_currency).length;
  eq('Coinbase missing 1 run → no delisting yet (debounce)', dl(await find('coinbase').run()), 0);
  eq('... missing 2 runs → still none', dl(await find('coinbase').run()), 0);
  eq(`... missing 3 consecutive runs → one delisting item (${victim.base_currency})`, dl(await find('coinbase').run()), 1);
  for (const r of mem) if (r.symbol === 'DELIST:' + victim.base_currency.toUpperCase()) r.pendingEmit = false; // Store ack
  eq('... not emitted twice once acknowledged', dl(await find('coinbase').run()), 0);
  const cbOrig = cb;
  const flap = cb.find((p) => p.status === 'online' && cb.filter((q) => q.base_currency === p.base_currency && q.status === 'online').length === 1 && p.base_currency !== 'NEWZ' && p.base_currency !== victim.base_currency);
  const flapOff = cbOrig.map((p) => (p.id === flap.id ? { ...p, status: 'offline' } : p));
  cb = flapOff; await find('coinbase').run(); await find('coinbase').run();
  cb = cbOrig; await find('coinbase').run();
  cb = flapOff;
  eq(`flapping base (${flap.base_currency}) resets the counter → no delisting`, (await find('coinbase').run()).filter((i) => i.hintCategory === 'delisting' && i.hintTickers[0] === flap.base_currency).length, 0);
  cb = cbOrig;

  console.log('— restart path: known bases rebuilt from DB rows for dash-style symbols');
  const mem2 = [];
  const fp2 = { knownSymbol: {
    findMany: async ({ where }) => mem2.filter((r) => r.venue === where.venue && (where.pendingEmit === undefined || r.pendingEmit === where.pendingEmit)),
    create: async ({ data }) => { mem2.push({ firstSeenAt: new Date(), pendingEmit: false, ...data }); return data; },
    createMany: async ({ data }) => { for (const d of data) mem2.push({ pendingEmit: false, ...d }); return {}; },
    updateMany: async ({ where, data }) => { for (const r of mem2) if (r.venue === where.venue && where.symbol.in.includes(r.symbol)) Object.assign(r, data); return { count: 0 }; },
    update: async () => ({}) } };
  const seedAds = symbols.make({ prisma: fp2 });
  for (const f of ['okx-spot', 'okx-swap', 'coinbase']) await seedAds.find((a) => a.name.includes(f)).run(); // seed DB rows
  check('seed rows written for all 3 venues', ['okx-spot', 'okx-swap', 'coinbase'].every((v) => mem2.some((r) => r.venue === v)));
  const ads2 = symbols.make({ prisma: fp2 }); const f2 = (frag) => ads2.find((a) => a.name.includes(frag)); // = process restart
  cb = [...cbOrig.filter((p) => p.id !== 'BTC-USDC'), { id: 'BTC-USDC', base_currency: 'BTC', quote_currency: 'USDC', status: 'online' }];
  const r1 = await f2('coinbase').run();
  eq('after restart: Coinbase BTC-USDC for already-known BTC-USD → no BTC item', r1.filter((i) => i.hintTickers[0] === 'BTC').length, 0);
  fixtures.SPOT = { code: '0', data: [...fixtures.SPOT.data.filter((e) => e.instId !== 'ETH-USDC'), { instId: 'ETH-USDC', baseCcy: 'ETH', quoteCcy: 'USDC', state: 'live', listTime: '0' }] };
  eq('after restart: OKX ETH-USDC for already-known ETH-USDT → no ETH item', (await f2('okx-spot').run()).filter((i) => i.hintTickers[0] === 'ETH').length, 0);
  fixtures.SWAP = { code: '0', data: [...fixtures.SWAP.data.filter((e) => e.instId !== 'SOL-USDC-SWAP'), { instId: 'SOL-USDC-SWAP', uly: 'SOL-USDC', instFamily: 'SOL-USDC', state: 'live', listTime: '0' }] };
  eq('after restart: OKX SOL-USDC-SWAP for already-known SOL-USDT-SWAP → no SOL item', (await f2('okx-swap').run()).filter((i) => i.hintTickers[0] === 'SOL').length, 0);
  http.request = realReq;

  console.log('— ingest.js unhandledRejection handler');
  const line = (fs.readFileSync(APP + '/ingest.js', 'utf8').match(/unhandled rejection:[^\n]*/) || [''])[0];
  check('handler references only err (no undefined e)', line && !/\be &&/.test(line), line);

  console.log('— classifier: Binance Alpha is not a spot listing');
  const { classify } = require(APP + '/ingest/classify.js');
  const c = classify({ kind: 'news', title: "Binance Alpha Listing(Doesn't mean official listing): Binance Alpha lists new tokens: Gstock (GSTOCK)", sourceTier: 2, hintCategory: null }, []);
  eq('alpha listing → other 30', [c.category, c.importance], ['other', 30]);
  done('step67_sources');
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
