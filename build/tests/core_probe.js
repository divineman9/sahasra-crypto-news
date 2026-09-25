// Probe ingest core modules against real headlines (run from app dir).
process.chdir('D:/claude projects/crypto-news-terminal/app');
const { loadUniverse, tagTickers, addBases } = require('D:/claude projects/crypto-news-terminal/app/ingest/tickers.js');
const { classify } = require('D:/claude projects/crypto-news-terminal/app/ingest/classify.js');
const { simhash64, hamming, StoryIndex } = require('D:/claude projects/crypto-news-terminal/app/ingest/cluster.js');
const cases = [
  ['exchange', 'Binance Will List Hyperliquid (HYPE) with Seed Tag Applied', [], null],
  ['exchange', 'Binance Futures Will Launch OURAUSDT USDⓈ-Margined Perpetual Contract Pre-IPO Trading (2026-09-23)', [], null],
  ['exchange', 'World Premiere: Doppler Finance (XDP) Listed on KuCoin', [], 'listing'],
  ['exchange', 'Bitget listed URNMUSDT and WBDUSDT hot stock perps', [], 'listing'],
  ['exchange', '[Bithumb] 인젝티브(INJ) 입출금 일시 중지 안내 (09/25 재개)', ['INJ'], 'maintenance'],
  ['exchange', 'Notice of Removal of Spot Trading Pairs - 2026-09-25', [], 'delisting'],
  ['news', 'JUST IN: Solana ETF sees record $200M inflows as SOL jumps 8%', [], null],
  ['news', 'Hackers drain $12M from DeFi protocol on Arbitrum', [], null],
  ['news', 'SEC sues crypto exchange over unregistered securities', [], null],
  ['news', 'Bitcoin price prediction: could BTC hit $100K this week?', [], null],
  ['news', 'Chainlink partners with SWIFT; LINK rallies', [], null],
  ['news', 'This new AI tool is ON the rise, OP says it is IN demand', [], null],
  ['news', 'Near Protocol upgrade goes live as NEAR climbs', [], null],
  ['news', 'Ethereum co-founder Vitalik Buterin proposes new gas limits', [], null],
  ['news', 'US Senate passes stablecoin bill; USDT and USDC issuers react', [], null],
  ['news', 'Coinbase to list $PENGU and 1000PEPEUSDT perps next week', [], null],
];
(async () => {
  await loadUniverse();
  addBases(['OURA', 'HYPE', 'PEPE']);
  for (const [kind, title, hint, hintCat] of cases) {
    const t = tagTickers(title, hint);
    const c = classify({ kind, title, hintCategory: hintCat, hintTickers: hint, sourceTier: kind === 'exchange' ? 1 : 3 }, t);
    console.log(`${c.category.padEnd(11)} ${String(c.importance).padStart(3)} ${c.sentiment.padEnd(8)} [${t.join(',')}]  ${title.slice(0, 80)}`);
  }
  const a = 'Binance Will List Hyperliquid (HYPE) with Seed Tag Applied';
  const b = 'Binance will list Hyperliquid (HYPE) with seed tag applied!';
  const c2 = 'Binance to list HYPE token after strong demand';
  const d = 'SEC sues crypto exchange over unregistered securities';
  console.log('hamming same-ish:', hamming(simhash64(a), simhash64(b)), ' rewrite:', hamming(simhash64(a), simhash64(c2)), ' unrelated:', hamming(simhash64(a), simhash64(d)));
  const idx = new StoryIndex();
  const now = new Date();
  const s1 = idx.assign({ id: 'p1', simhash: simhash64(a), normTitle: 'x1', category: 'listing', tickers: ['HYPE'], exchange: 'Binance', firstSeenAt: now });
  const s2 = idx.assign({ id: 'p2', simhash: simhash64(c2), normTitle: 'x2', category: 'listing', tickers: ['HYPE'], exchange: 'Binance', firstSeenAt: now });
  const s3 = idx.assign({ id: 'p3', simhash: simhash64(d), normTitle: 'x3', category: 'regulatory', tickers: [], exchange: null, firstSeenAt: now });
  const s4 = idx.assign({ id: 'p4', simhash: simhash64('Bybit Will List Hyperliquid (HYPE)'), normTitle: 'x4', category: 'listing', tickers: ['HYPE'], exchange: 'Bybit', firstSeenAt: now });
  console.log('story: binance listing', s1, '| RSS rewrite same exchange+ticker ->', s2, '| unrelated ->', s3, '| bybit same coin ->', s4);
})().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
