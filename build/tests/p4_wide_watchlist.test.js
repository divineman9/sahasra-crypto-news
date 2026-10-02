// Phase 4: wide watchlist (extra high-vol setups file merged into watch bases). Test env only.
process.chdir('D:/claude projects/crypto-news-terminal/app');
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NONCOIN_CACHE_FILE = path.join(os.tmpdir(), 'noncoin_test_p4w.json');
process.env.NEWS_PORTFOLIO = 'SOL';
process.env.BBW_LIVE_JSON = 'D:/nonexistent/base_break_live.json';
process.env.DISCORD_NEWS_WEBHOOK = 'https://discord.test/webhook';
const { check, eq, done } = require('./assert_lib');
require('dotenv').config();
const APP = 'D:/claude projects/crypto-news-terminal/app';
const W = require(APP + '/ingest/watchlist.js');

(async () => {
  const tmp = os.tmpdir();
  const bbwFile = path.join(tmp, 'bbw_p4w.json');
  const wideFile = path.join(tmp, 'wide_p4w.json');

  console.log('— wide file merged with filters');
  fs.writeFileSync(bbwFile, JSON.stringify({ setups: [{ symbol: 'BTCUSDT' }, { symbol: '1000PEPEUSDT' }] }));
  fs.writeFileSync(wideFile, JSON.stringify({ setups: [
    { symbol: 'KAIAUSDT', tf: '4h', stage: 'BAR1_CONFIRMED', high_vol: true },
    { symbol: 'PLUMEUSDT', tf: '1h', stage: 'BAR2_CONFIRMED', high_vol: true },
    { symbol: 'ESPUSDT', tf: '4h', stage: 'BAR1_CONFIRMED', high_vol: false },
    { symbol: 'MOVEUSDT', tf: '4h', stage: 'INVALID', high_vol: true },
    { symbol: 'QNTUSDT', tf: '4h', stage: 'BASING', high_vol: true },
    { symbol: 'NIGHTUSDT', tf: '4h', stage: 'FOUR_SOLID_BARS', high_vol: true, done: true },
    { symbol: 'STXUSDT', tf: '4h', stage: 'FOUR_SOLID_BARS', high_vol: true },
  ] }));
  eq('bbw + wide + portfolio → sorted filtered bases',
    W.loadWatchBases({ bbwFile, wideFile, portfolio: ['ETH'] }),
    ['BTC', 'ETH', 'KAIA', 'PEPE', 'PLUME', 'STX']);

  console.log('— missing wide file tolerated');
  eq('nonexistent wideFile → bbw + portfolio only',
    W.loadWatchBases({ bbwFile, wideFile: path.join(tmp, 'no_such_wide_p4w.json'), portfolio: ['ETH'] }),
    ['BTC', 'ETH', 'PEPE']);

  console.log('— invalid JSON wide file tolerated');
  fs.writeFileSync(wideFile, '{not json at all');
  eq('invalid JSON wideFile → bbw + portfolio only',
    W.loadWatchBases({ bbwFile, wideFile, portfolio: ['ETH'] }),
    ['BTC', 'ETH', 'PEPE']);

  console.log('— missing bbw still throws');
  let threw = false;
  try { W.loadWatchBases({ bbwFile: 'D:/nonexistent/x_p4w.json', wideFile, portfolio: [] }); } catch { threw = true; }
  check('missing BBW file → throws even with valid wide file', threw);

  console.log('— wide entries cleaned like main file');
  fs.writeFileSync(wideFile, JSON.stringify({ setups: [
    { symbol: '1000BONKUSDT', tf: '4h', stage: 'BAR1_CONFIRMED', high_vol: true },
  ] }));
  eq('1000BONKUSDT strip → BONK',
    W.loadWatchBases({ bbwFile, wideFile, portfolio: [] }),
    ['BONK', 'BTC', 'PEPE']);

  done('p4_wide_watchlist');
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
