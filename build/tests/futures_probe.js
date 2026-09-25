// Verify the restart bug is fixed: futures lists must be filled after a DB-loaded (non-seeding) run.
process.chdir('D:/claude projects/crypto-news-terminal/app');
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const symbols = require('D:/claude projects/crypto-news-terminal/app/ingest/adapters/symbols.js');
(async () => {
  const prisma = new PrismaClient();
  const fut = symbols.make({ prisma }).find(a => a.name === 'sym-binance-futures');
  const items = await fut.run(); // DB already has rows -> normal (non-seeding) path
  const syms = symbols.binanceFuturesSymbols(), bases = symbols.binanceFuturesBases();
  console.log('run emitted', items.length, '| futuresSymbols', syms.length, '| bases', bases.length,
    '| has BTCUSDT', syms.includes('BTCUSDT'), '| 1000PEPEUSDT', syms.includes('1000PEPEUSDT'), '| base PEPE', bases.includes('PEPE'));
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
