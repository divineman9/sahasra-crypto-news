process.chdir('D:/claude projects/crypto-news-terminal/app');
const http = require('D:/claude projects/crypto-news-terminal/app/ingest/http.js');
const base = Array.from({ length: 150 }, (_, i) => `C${i}USDT`);
let feed = base.slice();
http.request = async () => ({ status: 200, json: () => feed.map(symbol => ({ symbol })) });
const symbols = require('D:/claude projects/crypto-news-terminal/app/ingest/adapters/symbols.js');
const db = base.map(symbol => ({ symbol }));
const prisma = { knownSymbol: { findMany: async () => db, create: async () => ({}), createMany: async () => ({}) } };
(async () => {
  const spot = symbols.make({ prisma }).find(a => a.name === 'sym-binance-spot');
  console.log('normal run:', (await spot.run()).length, '(want 0)');
  feed = [...base, 'NEWONEUSDT', 'C5USD1'];
  console.log('1 new base + 1 new quote pair:', (await spot.run()).map(i => i.hintTickers[0]).join(','), '(want NEWONE)');
  feed = [...feed, ...Array.from({ length: 15 }, (_, i) => `FLOOD${i}USDT`)];
  console.log('15 new bases in one cycle:', (await spot.run()).length, '(want 0 — capped)');
  feed = ['BTCUSDT'];
  try { await spot.run(); console.log('partial list: NOT rejected (BAD)'); } catch (e) { console.log('partial list rejected:', e.message); }
})().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
