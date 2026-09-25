// Fix round 2 (Fable re-review of fix round 1): regressions + non-blocking notes. Test DB only.
process.chdir('D:/claude projects/crypto-news-terminal/app');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const T = require(APP + '/ingest/tickers.js');
const { classify } = require(APP + '/ingest/classify.js');
const { MemoryRedis } = require(APP + '/ingest/redisOptional.js');
const tag = (t, kind = 'news') => [...T.tagTickers(t, [], { kind })].sort();
const sent = (t) => classify({ kind: 'news', title: t, sourceTier: 3, hintCategory: null }, []).sentiment;

(async () => {
  await T.loadUniverse();
  console.log('— blocking #1: title-case ETF headlines');
  eq('SEC Approves Spot Solana ETF → bullish', sent('SEC Approves Spot Solana ETF'), 'bullish');
  eq('Bitcoin ETFs See Record Inflows → bullish', sent('Bitcoin ETFs See Record Inflows'), 'bullish');
  eq('Ether ETFs Pull In $300M → bullish', sent('Ether ETFs Pull In $300M'), 'bullish');
  eq('Spot XRP ETF Launches On Nasdaq → bullish', sent('Spot XRP ETF Launches On Nasdaq'), 'bullish');
  eq('Rebound With Inflows After Outflows Week → bullish', sent('Bitcoin ETFs Rebound With $500M Inflows After Outflows Week'), 'bullish');
  eq('SEC Delays Solana ETF Decision → bearish', sent('SEC Delays Solana ETF Decision'), 'bearish');

  console.log('— blocking #2: ETF-flow headlines keep the asset');
  eq('pull $500M from Bitcoin ETFs → BTC', tag('Investors pull $500M from Bitcoin ETFs'), ['BTC']);
  eq('Record outflows from Ether ETFs → ETH', tag('Record outflows from Ether ETFs as market slides'), ['ETH']);
  eq('Outflows from Solana ETFs → SOL', tag('Outflows from Solana ETFs hit record'), ['SOL']);
  eq('(still) drain $12M from Arbitrum DEX → none', tag('Hackers drain $12M from Arbitrum DEX'), []);

  console.log('— note A: subject after a parenthetical wins over the chain lookback');
  eq('Bug in Aave (AAVE) exploited → AAVE (BAL is outside the top-500 universe)', tag('Bug in Aave (AAVE) exploited for $100M'), ['AAVE']);
  eq('Exploit in Curve Finance (CRV) drains $50M → CRV', tag('Exploit in Curve Finance (CRV) drains $50M'), ['CRV']);
  eq('(still) hacked on Solana (SOL) → none', tag('Protocol hacked on Solana (SOL)'), []);

  console.log('— note B: MemoryRedis hot-list upsert keeps other entries');
  const { hotUpsert } = require(APP + '/ingest/hotListUpsert.js');
  const r = new MemoryRedis();
  for (const id of ['a', 'b', 'c', 'd']) await hotUpsert(r, id, JSON.stringify({ id }));
  await hotUpsert(r, 'c', JSON.stringify({ id: 'c', v: 2 }));
  eq('re-upsert of c in [d,c,b,a] → [c,d,b,a]', (await r.lrange('news:hot', 0, -1)).map((s) => JSON.parse(s).id), ['c', 'd', 'b', 'a']);

  console.log('— note C: detail fetch bounded and Binance-only');
  const D = require(APP + '/ingest/details.js');
  const t0 = Date.now();
  const other = await D.detailTickers({ sourceName: 'bybit', kind: 'exchange', url: 'https://example.com/slow' });
  eq('non-Binance source → [] without any fetch', other, []);
  check('... and returns immediately (<300 ms)', Date.now() - t0 < 300, Date.now() - t0);
  eq('stripBase 1000000MOG/USDT → MOG', D.extractFromText('Delist 1000000MOG/USDT and 1000PEPE/USDT', { parentheticals: false }).sort(), ['MOG', 'PEPE']);
  check('details exposes a per-batch budget helper', typeof D.makeBudget === 'function');
  if (typeof D.makeBudget === 'function') { const b = D.makeBudget(5); let n = 0; for (let i = 0; i < 8; i++) if (b.take()) n++; eq('budget allows 5 fetches per batch', n, 5); }

  done('fix2');
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
