// Phase 3 step 1: tokenized stocks / TradFi perps are never tagged as coins.
const { check, eq, done } = require('./assert_lib');
const fs = require('fs'), path = require('path'), os = require('os');
process.env.NONCOIN_CACHE_FILE = path.join(os.tmpdir(), 'noncoin_test.json'); // never touch the production cache
const APP = 'D:/claude projects/crypto-news-terminal/app';
const T = require(APP + '/ingest/tickers.js');
const tag = (t, kind = 'exchange', hint = []) => [...T.tagTickers(t, hint, { kind })].sort();

(async () => {
  await T.loadUniverse();
  check('tickers exports setNonCoinBases / isNonCoin / splitBinanceBases / STOCK_PERP_TITLE_RE',
    typeof T.setNonCoinBases === 'function' && typeof T.isNonCoin === 'function' && typeof T.splitBinanceBases === 'function' && T.STOCK_PERP_TITLE_RE instanceof RegExp);

  console.log('— Binance exchangeInfo split (underlyingType)');
  const info = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'binance_exchangeinfo.json'), 'utf8'));
  const sp = T.splitBinanceBases(info);
  check('coinBases include BTC, ENA, NEAR, CAT (from 1000CATUSDT)', ['BTC', 'ENA', 'NEAR', 'CAT'].every((b) => sp.coinBases.includes(b)), sp.coinBases);
  eq('nonCoin = OURA, HUT, DEFI (CAT equity collides with CAT coin → coin wins)', [...sp.nonCoinBases].sort(), ['DEFI', 'HUT', 'OURA']);

  console.log('— stock tickers blocked even if a stale futures list added them');
  T.addBases(['ENA', 'NEAR', 'CAT', 'HUT', 'CORZ', 'OURA', 'KIOXIA', 'SDGR', 'TLT', 'JEPQ', 'STONK', 'GSTOCK', 'URNM']);
  T.setNonCoinBases(sp.nonCoinBases);
  check('isNonCoin(HUT) and isNonCoin(GSTOCK) (seed)', T.isNonCoin('HUT') && T.isNonCoin('GSTOCK'));
  check('KuCoin KIOXIAUSDT stock index perp → no KIOXIA', !tag('KuCoin Futures Will Delist the KIOXIAUSDT Stock Index Perpetual Contract').includes('KIOXIA'));
  eq('Bitget OURAUSDT pre-market perp → []', tag('Bitget Futures: Launch of OURAUSDT Pre-Market Perpetual'), []);
  eq('Bybit SDGR/TLT/JEPQ stock perps → []', tag('Bybit: New Listings SDGRUSDT, TLTUSDT, JEPQUSDT Stock Perpetual Contracts'), []);
  eq('Core Scientific (CORZ) → []', tag('Core Scientific (CORZ) shares jump on AI deal', 'news'), []);
  eq('HUT 8 expands mining → []', tag('HUT 8 expands mining', 'news'), []);
  eq('URNM ETF → []', tag('URNM ETF sees inflows', 'news'), []);
  eq('STONKUSDT → []', tag('Bitget will list STONKUSDT perpetual'), []);
  eq('Gstock (GSTOCK) Alpha → []', tag('Binance Alpha lists new tokens: Gstock (GSTOCK)', 'news'), []);
  eq('hint of a stock ticker dropped', tag('New perpetual listed', 'exchange', ['HUT']), []);

  console.log('— controls: real coins still tag');
  eq('1000CATUSDT coin → CAT', tag('Binance Futures Will Launch 1000CATUSDT Perpetual Contract'), ['CAT']);
  eq('Ethena (ENA) → ENA', tag('Binance Will List Ethena (ENA)'), ['ENA']);
  eq('brand-new NEWCOINUSDT listing → NEWCOIN', tag('Bybit lists NEWCOINUSDT perpetual'), ['NEWCOIN']);
  eq('coin in a stock-perp title still tags (existing universe)', tag('Bitget lists NEARUSDT and TSLAUSDT stock perpetual'), ['NEAR']);

  console.log('— macro "US stocks" headlines are NOT stock-perp notices (Fable blocker 1)');
  const { classify } = require(APP + '/ingest/classify.js');
  const etfT = 'Spot Bitcoin ETF inflows hit $1B while US stocks slide';
  const ce = classify({ kind: 'news', title: etfT, sourceTier: 3, hintCategory: null }, tag(etfT, 'news'));
  check('ETF inflows + US stocks → still etf ≥50', ce.category === 'etf' && ce.importance >= 50, ce);
  eq('... and still tags BTC', tag(etfT, 'news'), ['BTC']);
  eq('"Bitcoin drops as US stocks tumble" keeps bearish sentiment', classify({ kind: 'news', title: 'Bitcoin drops as US stocks tumble on tariff fears', sourceTier: 3, hintCategory: null }, ['BTC']).sentiment, 'bearish');
  eq('Bybit TradFi perpetual listing still demoted', classify({ kind: 'exchange', title: 'New Listing: PLTRUSDT TradFi Perpetual Contract', sourceTier: 1, hintCategory: 'listing' }, []).importance, 30);

  console.log('— splitBinanceBases hygiene');
  const sp2 = T.splitBinanceBases({ symbols: [{ symbol: 'BTCUSDT_261225', underlyingType: 'COIN', contractType: 'CURRENT_QUARTER' }, { symbol: '币安人生USDT', underlyingType: 'COIN', contractType: 'PERPETUAL' }, { symbol: 'ETHUSDT', underlyingType: 'COIN', contractType: 'PERPETUAL' }] });
  eq('quarterly and non-ASCII symbols skipped', sp2.coinBases, ['ETH']);
  check('production cache untouched by tests', !fs.existsSync(APP + '/ingest/cache/noncoin.json') || JSON.parse(fs.readFileSync(APP + '/ingest/cache/noncoin.json', 'utf8')).length !== 32);

  console.log('— classify uses the shared stock-perp regex');
  const src = fs.readFileSync(APP + '/ingest/classify.js', 'utf8');
  check('classify imports STOCK_PERP_TITLE_RE from tickers', /STOCK_PERP_TITLE_RE/.test(src));
  done('step1_stocks');
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
