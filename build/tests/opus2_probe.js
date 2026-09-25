process.chdir('D:/claude projects/crypto-news-terminal/app');
const T = require('D:/claude projects/crypto-news-terminal/app/ingest/tickers.js');
const { classify } = require('D:/claude projects/crypto-news-terminal/app/ingest/classify.js');
(async () => {
  await T.loadUniverse();
  const cases = [
    ['news', 'Bitcoin breached $120K as ETF inflows hit record', 'etf, NOT hack'],
    ['news', 'Bitcoin settles above $110,000 after Fed decision', 'NOT regulatory (fed decision ok as other)'],
    ['news', 'Tokenized treasury bill fund crosses $1B on Ethereum', 'other'],
    ['news', 'Binance warns users of phishing scam targeting Solana wallets', 'other 40'],
    ['news', 'Nasdaq-listed Upexi (UPXI) buys another 100,000 SOL', 'NOT listing; no UPXI'],
    ['news', 'Grayscale files to list Solana exchange-traded fund (ETF)', 'no ETF ticker'],
    ['news', 'Stellar quarter for Coinbase as revenue jumps', 'no XLM'],
    ['news', 'Stacks of cash: whales buy the dip', 'no STX'],
    ['news', 'Compound interest products return to DeFi', 'no COMP'],
    ['news', 'DeFi protocol hacked for $40M; attacker drained ETH', 'hack'],
    ['news', 'Kelp DAO sues LayerZero over $292M rsETH exploit', 'hack or regulatory'],
    ['news', 'SEC sues crypto exchange over unregistered securities', 'regulatory'],
    ['news', 'US Senate passes stablecoin bill', 'regulatory'],
    ['exchange', 'Binance Will List Hyperliquid (HYPE) with Seed Tag Applied', 'listing 95 HYPE'],
    ['news', 'Coinbase to list $PENGU and 1000PEPEUSDT perps next week', 'listing PENGU,PEPE'],
  ];
  for (const [kind, title, want] of cases) {
    const t = T.tagTickers(title, [], { kind });
    const c = classify({ kind, title, sourceTier: kind === 'exchange' ? 1 : 3, hintCategory: kind === 'exchange' ? 'listing' : null }, t);
    console.log(`${(c.category + ' ' + c.importance).padEnd(15)} [${t.join(',')}]`.padEnd(32), 'want:', want.padEnd(40), '|', title.slice(0, 55));
  }
})();
