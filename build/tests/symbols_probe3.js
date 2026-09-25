process.chdir('D:/claude projects/crypto-news-terminal/app');
const http = require('D:/claude projects/crypto-news-terminal/app/ingest/http.js');
const base = Array.from({ length: 150 }, (_, i) => `C${i}USDT`);
let feed = base.slice();
http.request = async () => ({ status: 200, json: () => feed.map(symbol => ({ symbol })) });
const symbols = require('D:/claude projects/crypto-news-terminal/app/ingest/adapters/symbols.js');
const prisma = { knownSymbol: { findMany: async () => base.map(symbol => ({ symbol })), create: async () => ({}), createMany: async () => ({}) } };
(async () => {
  const spot = symbols.make({ prisma }).find(a => a.name === 'sym-binance-spot');
  await spot.run();
  feed = [...base, 'NEWONEUSDT'];
  console.log('run A (new base):', (await spot.run()).map(i => i.hintTickers[0]).join(','));
  console.log('run B (no change, re-emit within 5 min):', (await spot.run()).map(i => i.hintTickers[0]).join(','), '(want NEWONE again — store dedups by url)');
})();
