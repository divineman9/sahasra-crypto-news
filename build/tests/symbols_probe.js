// Unit-test symbolAdapter with a stub prisma + a replaced fetch: restart path must know existing bases.
process.chdir('D:/claude projects/crypto-news-terminal/app');
const http = require('D:/claude projects/crypto-news-terminal/app/ingest/http.js');
let feed = ['BTCUSDT', 'XRPUSDT', 'ETHUSDT'];
http.request = async () => ({ status: 200, json: () => feed.map(symbol => ({ symbol })) });
const symbols = require('D:/claude projects/crypto-news-terminal/app/ingest/adapters/symbols.js');
const db = [{ symbol: 'BTCUSDT' }, { symbol: 'XRPUSDT' }, { symbol: 'ETHUSDT' }]; // restart: DB already has rows
const prisma = { knownSymbol: { findMany: async () => db, create: async () => ({}), createMany: async () => ({}) } };
(async () => {
  const spot = symbols.make({ prisma }).find(a => a.name === 'sym-binance-spot');
  console.log('run1 (same symbols):', (await spot.run()).length, 'items (want 0)');
  feed = [...feed, 'XRPUSD1', 'SOLPLN', 'NEWCOINUSDT'];
  const r2 = await spot.run();
  console.log('run2 new XRPUSD1 + SOLPLN + NEWCOINUSDT ->', r2.map(i => i.hintTickers[0] + ' ' + i.url).join(' | '), '(want only NEWCOIN, binance spot url)');
})().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
