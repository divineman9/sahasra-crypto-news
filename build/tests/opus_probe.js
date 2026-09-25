process.chdir('D:/claude projects/crypto-news-terminal/app');
const T = require('D:/claude projects/crypto-news-terminal/app/ingest/tickers.js');
const { classify } = require('D:/claude projects/crypto-news-terminal/app/ingest/classify.js');
const bh = require('D:/claude projects/crypto-news-terminal/app/ingest/adapters/bithumb.js');
(async () => {
  await T.loadUniverse();
  T.addBases(['PEOPLE', 'VIRTUAL', 'PROMPT', 'OPENAI', 'ANTHROPIC', 'SAMSUNG', 'TENCENT', 'COPPER', 'GENIUS', 'HYPE', 'OURA', 'PEPE', 'AI', 'ZK']);
  T.addBases(['PEOPLE', 'VIRTUAL']); T.addBases(['PEOPLE']); // repeat: must not grow anything
  const cases = [
    ['news', "People's Bank of China injects liquidity as bitcoin steadies", 'BTC only'],
    ['news', 'Hong Kong regulator tightens virtual asset rules', 'none'],
    ['news', 'OpenAI and Anthropic race; Samsung and Tencent invest in copper', 'none'],
    ['news', 'Securities and Exchange Commission (SEC) sues crypto firm', 'none'],
    ['news', 'Artificial intelligence (AI) tokens rally', 'none'],
    ["news", "DOGE cuts: Musk's Department of Government Efficiency trims budget", 'none'],
    ['news', 'ZK proofs adoption grows', 'none'],
    ['news', 'Analysts express optimism over Ethereum Classic upgrade', 'ETC only'],
    ['exchange', 'Binance Will List Artificial Superintelligence (AI) with Seed Tag', 'AI allowed (exchange listing)'],
    ['news', 'Dogecoin jumps 10% as $DOGE whales buy', 'DOGE'],
    ['news', 'Binance Will List Hyperliquid (HYPE) with Seed Tag Applied', 'HYPE'],
    ['news', 'Coinbase to list $PENGU and 1000PEPEUSDT perps next week', 'PENGU,PEPE'],
    ['exchange', 'World Premiere: Doppler Finance (XDP) Listed on KuCoin', 'XDP'],
    ['news', 'Near Protocol upgrade goes live as NEAR climbs', 'NEAR'],
    ['news', 'JUST IN: Solana ETF sees record inflows as SOL jumps', 'SOL'],
  ];
  for (const [kind, title, want] of cases) console.log(`[${T.tagTickers(title, [], { kind }).join(',')}]`.padEnd(14), 'want:', want.padEnd(28), '|', title.slice(0, 60));
  console.log('bithumb lifted ->', bh.hintCategory ? bh.hintCategory('[Bithumb] 인젝티브(INJ) 거래유의종목 지정 해제', []) : '(hintCategory not exported)');
})();
