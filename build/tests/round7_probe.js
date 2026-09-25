process.chdir('D:/claude projects/crypto-news-terminal/app');
const T = require('D:/claude projects/crypto-news-terminal/app/ingest/tickers.js');
(async () => {
  await T.loadUniverse();
  T.addBases(['HYPE', 'OURA']);
  const cases = [
    ['news', 'Hackers drain $12M from DeFi protocol on Arbitrum', 'none (chain context)'],
    ['news', 'Solana-based lending protocol exploited for $5M', 'none (chain context)'],
    ['news', 'Arbitrum surges 12% after governance vote', 'ARB'],
    ['news', 'SPX hits record as DXY slides; VIX low ahead of PCE', 'none'],
    ['news', 'ARK Invest buys more COIN shares', 'none'],
    ['exchange', '[Bithumb] 테더(USDT) ERC20 입금 일시 중지 (KRW)', 'none'],
    ['news', 'Bitcoin rallies as BTC reclaims $90K', 'BTC'],
    ['exchange', 'Binance Will List Hyperliquid (HYPE) with Seed Tag Applied', 'HYPE'],
    ['news', 'Coinbase to list $PENGU and 1000PEPEUSDT perps next week', 'PENGU,PEPE'],
  ];
  for (const [kind, title, want] of cases) console.log(`[${T.tagTickers(title, kind === 'exchange' ? ['USDT', 'ERC20', 'KRW'].filter(x => title.includes(x)) : [], { kind }).join(',')}]`.padEnd(14), 'want:', want.padEnd(22), '|', title.slice(0, 60));
  await T.loadUniverse(true);
  console.log('after forced refresh, HYPE still known via replayed addBases:', T.tagTickers('$HYPE pumps', [], { kind: 'news' }));
})();
