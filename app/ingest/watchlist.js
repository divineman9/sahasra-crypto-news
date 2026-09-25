'use strict';

const fs = require('fs');
const { BBW_LIVE_JSON, PORTFOLIO } = require('./config');
const { isNonCoin } = require('./tickers');

// Coins we care about right now: ShivaShakthi live setups + NEWS_PORTFOLIO.
function loadWatchBases({ bbwFile = BBW_LIVE_JSON, portfolio = PORTFOLIO } = {}) {
  const data = JSON.parse(fs.readFileSync(bbwFile, 'utf8'));   // THROWS on read/parse error (callers keep their previous list)
  const set = new Set();
  for (const p of portfolio || []) set.add(String(p).trim().toUpperCase());
  for (const s of (data && Array.isArray(data.setups)) ? data.setups : []) {
    const base = String(s.symbol || '').toUpperCase().replace(/(USDT|USDC)$/, '').replace(/^1000000/, '').replace(/^1000/, '');
    if (base) set.add(base);
  }
  return [...set].filter((b) => /^[A-Z0-9]+$/.test(b) && !isNonCoin(b)).sort();
}

module.exports = { loadWatchBases };