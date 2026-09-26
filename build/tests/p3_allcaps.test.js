// All-caps wire headlines (Tree News, Walter Bloomberg, …) must not turn ordinary words into coin tags.
// Rule: when a title is ≥90% uppercase letters, bare uppercase tokens and case-sensitive weak words are NOT evidence;
// $SYM, SYMUSDT pairs, (SYM) parentheticals and full coin names/aliases still are. Mixed-case titles are unchanged.
const os = require('os'), path = require('path');
process.env.NONCOIN_CACHE_FILE = path.join(os.tmpdir(), 'noncoin_test_caps.json');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const T = require(APP + '/ingest/tickers.js');
const tag = (t, kind = 'news') => [...T.tagTickers(t, [], { kind })].sort();

(async () => {
  await T.loadUniverse();
  T.addBases(['NEAR', 'HIGH', 'FLOW', 'BOND', 'ORDER', 'BEAT', 'BANK', 'BAN', 'CASH']); // make the words real symbols, like production
  check('tickers exports isAllCapsTitle', typeof T.isAllCapsTitle === 'function');
  if (typeof T.isAllCapsTitle === 'function') {
    eq('isAllCapsTitle on a wire headline', T.isAllCapsTitle('BITGET HACK LOSSES NOW SEEN NEAR $350M'), true);
    eq('isAllCapsTitle on a normal headline', T.isAllCapsTitle('NEAR Protocol hits new high'), false);
    eq('isAllCapsTitle on a short title (too few letters) → false', T.isAllCapsTitle('BTC UP'), false);
  }

  console.log('— all-caps: ordinary words are not coins');
  eq('BITGET HACK LOSSES NOW SEEN NEAR $350M → []', tag('BITGET HACK LOSSES NOW SEEN NEAR $350M'), []);
  eq('CRYPTO MARKET RISKS REMAIN HIGH → []', tag('CRYPTO MARKET RISKS REMAIN HIGH, ANALYSTS SAY'), []);
  eq('FED HOLDS RATES, BANK STOCKS BEAT ESTIMATES → []', tag('FED HOLDS RATES, BANK STOCKS BEAT ESTIMATES'), []);
  eq('SEC ORDER TO BAN TOKEN SALES → []', tag('SEC ORDER TO BAN TOKEN SALES'), []);

  console.log('— all-caps: real evidence still tags');
  eq('BITCOIN CASH, UNISWAP FUTURES → BCH, UNI (no CASH)', tag('CME TO LAUNCH BITCOIN CASH, UNISWAP FUTURES'), ['BCH', 'UNI']);
  eq('BOND YIELDS SURGE AS BITCOIN DROPS → BTC only', tag('BOND YIELDS SURGE AS BITCOIN DROPS'), ['BTC']);
  eq('*SOLANA ETF INFLOWS HIT RECORD → SOL', tag('*SOLANA ETF INFLOWS HIT RECORD'), ['SOL']);
  eq('$PEPE and NEARUSDT → PEPE, NEAR', tag('BINANCE TO LIST $PEPE AND NEARUSDT PERPS'), ['NEAR', 'PEPE']);
  eq('ETHEREUM FOUNDATION SELLS 10K ETH → ETH', tag('ETHEREUM FOUNDATION SELLS 10K ETH'), ['ETH']);
  eq('exchange all-caps notice with (XYZ) parenthetical → XYZ', tag('BINANCE WILL LIST NEWTOKEN (XYZQ)', 'exchange'), ['XYZQ']);
  eq('exchange all-caps notice with a pair → ABCQ', tag('BINANCE WILL DELIST ABCQUSDT PERPETUAL', 'exchange'), ['ABCQ']);

  console.log('— relay-wrapped wire headlines (BWEnews: "Tree News: *HEADLINE: BBG Tree News:")');
  eq('Tree News relay NEAR hack → []', tag('Tree News: *BITGET HACK LOSSES NOW SEEN NEAR $350M: BBG Tree News:'), []);
  eq('Tree News relay CME BITCOIN CASH, UNISWAP → BCH, UNI', tag('Tree News: *CME GROUP TO LAUNCH BITCOIN CASH, UNISWAP FUTURES: BBG Tree News:'), ['BCH', 'UNI']);
  eq('Tree News relay RISKS REMAIN HIGH → []', tag("Tree News: *FED'S HAMMACK WARNS INFLATION RISKS REMAIN HIGH Tree News:"), []);
  eq('AggrNews relay ORDER/BAN/BANK/BEAT → []', tag('AggrNews: SEC ORDER TO BAN TOKEN SALES, BANK STOCKS BEAT AggrNews:'), []);
  eq('uppercase label not stripped: CARDANO FOUNDER: ADA WILL HIT $5 → ADA', tag('CARDANO FOUNDER: ADA WILL HIT $5'), ['ADA']);
  check('mixed relay stays mixed: Binance EN: … Hyperliquid (HYPE) → HYPE', tag('Binance EN: Binance Will List Hyperliquid (HYPE) with Seed Tag Applied').includes('HYPE'));

  console.log('— all-caps allow-list: unambiguous curated tickers still tag');
  check('SOL ETF INFLOWS HIT RECORD → SOL', tag('SOL ETF INFLOWS HIT RECORD TODAY').includes('SOL'));
  check('ARB FOUNDATION SELLS 50M ARB → ARB', tag('ARB FOUNDATION SELLS 50M ARB TOKENS').includes('ARB'));
  check('AVAX, LTC, ZEC LEAD GAINS → AVAX, LTC, ZEC', ['AVAX', 'LTC', 'ZEC'].every((t) => tag('AVAX, LTC, ZEC LEAD ALTCOIN GAINS').includes(t)));
  eq('DOGE (Dept. of Govt Efficiency) in caps → not tagged', tag('DOGE CUTS FEDERAL CRYPTO OVERSIGHT BUDGET').includes('DOGE'), false);
  eq('HYPE as a word in caps → not tagged', tag('AI HYPE DRIVES TECH STOCKS HIGHER AGAIN').includes('HYPE'), false);

  console.log('— mixed case unchanged');
  eq('NEAR Protocol hits new high → NEAR', tag('NEAR Protocol hits new high'), ['NEAR']);
  check('mixed-case list with caps tickers keeps HYPE', tag('Crypto Price Analysis Sep-24: ETH, XRP, ADA, BNB, and HYPE').includes('HYPE'));
  check('mixed-case "UNI Surges" keeps UNI', tag('Altcoins rally as BCH Jumps 28% and UNI Surges on CME Futures').includes('UNI'));
  eq('Bitcoin hack losses near $350M → BTC (lowercase "near" never a tag)', tag('Bitcoin hack losses near $350M'), ['BTC']);
  done('p3_allcaps');
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
