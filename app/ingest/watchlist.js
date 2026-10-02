'use strict';

const fs = require('fs');
const { BBW_LIVE_JSON, BBW_WIDE_JSON, PORTFOLIO } = require('./config');
const { isNonCoin } = require('./tickers');

// Coins we care about right now: ShivaShakthi live setups + wide watcher (high_vol only) + NEWS_PORTFOLIO.
function loadWatchBases({ bbwFile = BBW_LIVE_JSON, wideFile = BBW_WIDE_JSON, portfolio = PORTFOLIO } = {}) {
  const data = JSON.parse(fs.readFileSync(bbwFile, 'utf8'));   // THROWS on read/parse error (callers keep their previous list)
  const set = new Set();
  for (const p of portfolio || []) set.add(String(p).trim().toUpperCase());
  for (const s of (data && Array.isArray(data.setups)) ? data.setups : []) {
    const base = String(s.symbol || '').toUpperCase().replace(/(USDT|USDC)$/, '').replace(/^1000000/, '').replace(/^1000/, '');
    if (base) set.add(base);
  }
  try {
    const wide = JSON.parse(fs.readFileSync(wideFile, 'utf8'));
    for (const s of (wide && Array.isArray(wide.setups)) ? wide.setups : []) {
      if (!s || s.high_vol !== true || s.stage === 'BASING' || s.stage === 'INVALID' || s.done === true) continue;
      const base = String(s.symbol || '').toUpperCase().replace(/(USDT|USDC)$/, '').replace(/^1000000/, '').replace(/^1000/, '');
      if (base) set.add(base);
    }
  } catch (_) {
    // Missing or invalid wide file: ignore silently.
  }
  return [...set].filter((b) => /^[A-Z0-9]+$/.test(b) && !isNonCoin(b)).sort();
}

module.exports = { loadWatchBases };
