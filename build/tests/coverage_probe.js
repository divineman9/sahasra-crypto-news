// Coverage probe (read-only, LIVE db): of the coins with a live ShivaShakthi setup, how many have ≥1 tagged post published ≤48 h?
// Usage: node build/tests/coverage_probe.js   (prints a summary line + uncovered list)
process.chdir('D:/claude projects/crypto-news-terminal/app');
require('dotenv').config();
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const BBW = process.env.BBW_LIVE_JSON || 'D:/claude projects/crypto/screener/base_break_live.json';
const baseOf = (s) => String(s).toUpperCase().replace(/(USDT|USDC)$/, '').replace(/^1000000/, '').replace(/^1000/, '');

(async () => {
  const bbw = JSON.parse(fs.readFileSync(BBW, 'utf8'));
  const bases = [...new Set((bbw.setups || []).map((s) => baseOf(s.symbol)))].sort();
  const since = new Date(Date.now() - 48 * 3600e3);
  const rows = await prisma.post.findMany({
    where: { publishedAt: { gte: since, lte: new Date(Date.now() + 5 * 60e3) }, instruments: { some: { ticker: { in: bases } } } },
    select: { importance: true, instruments: { select: { ticker: true } } },
  });
  const any = new Map(), imp = new Map();
  for (const r of rows) for (const i of r.instruments) if (bases.includes(i.ticker)) {
    any.set(i.ticker, (any.get(i.ticker) || 0) + 1);
    if (r.importance >= 50) imp.set(i.ticker, (imp.get(i.ticker) || 0) + 1);
  }
  const alts = bases.filter((b) => b !== 'BTC');
  console.log(`[coverage] ${new Date().toISOString()} setup coins=${bases.length} anyNews=${any.size} (${Math.round(100 * any.size / bases.length)}%) importance>=50=${imp.size} altsAny=${alts.filter((b) => any.has(b)).length}/${alts.length}`);
  console.log('covered:', [...any.entries()].map(([k, v]) => `${k}(${v})`).join(' '));
  console.log('uncovered:', bases.filter((b) => !any.has(b)).join(' '));
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
