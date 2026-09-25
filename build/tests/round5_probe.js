process.chdir('D:/claude projects/crypto-news-terminal/app');
const T = require('D:/claude projects/crypto-news-terminal/app/ingest/tickers.js');
const { classify } = require('D:/claude projects/crypto-news-terminal/app/ingest/classify.js');
(async () => {
  await T.loadUniverse();
  const ex = [
    ['delisting', 'Binance Margin And Loan Will Delist BTTC & POWR', 'maintenance 40'],
    ['delisting', 'Binance Alpha Will Remove MTP, PENGUIN and 3 other tokens', 'maintenance 40'],
    ['delisting', 'Notice of Removal of Spot Trading Pairs - 2026-09-25', 'maintenance 40'],
    ['delisting', 'Binance Futures Will Delist USDⓈ-M BTCUSDC Perpetual Contract', 'maintenance 40'],
    ['delisting', 'Binance Will Delist COMBO, DAR on 2026-10-01', 'delisting 90'],
    ['listing', 'Binance Will Add Hyperliquid (HYPE) on Earn, Buy Crypto, Convert, VIP Loan & Margin', 'maintenance 40'],
    ['listing', 'Binance Futures Will Launch USDⓈ-Margined BTCUSDC Perpetual Contract', 'listing 50'],
    ['listing', 'Binance Will List Hyperliquid (HYPE) with Seed Tag Applied', 'listing 95'],
    ['listing', 'Binance Futures Will Launch OURAUSDT USDⓈ-Margined Perpetual Contract', 'listing 95'],
    ['listing', 'World Premiere: Doppler Finance (XDP) Listed on KuCoin', 'listing 95'],
    ['listing', 'USDC Token Splash— Grab a share of the 100000 USDC prize pool .', 'other 30 (promo)'],
  ];
  for (const [hc, title, want] of ex) {
    const t = T.tagTickers(title, [], { kind: 'exchange' });
    const c = classify({ kind: 'exchange', title, sourceTier: 1, hintCategory: hc }, t);
    console.log(`${(c.category + ' ' + c.importance).padEnd(16)} ${c.sentiment.padEnd(8)} want: ${want.padEnd(16)} | ${title.slice(0, 70)}`);
  }
})();
