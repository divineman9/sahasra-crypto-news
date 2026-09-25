// Phase 3 step 2: tagger recall via curated coinSources aliases + precision fixes (people context, exchange names, BSC).
const os = require('os'), path = require('path');
process.env.NONCOIN_CACHE_FILE = path.join(os.tmpdir(), 'noncoin_test_s2.json');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const T = require(APP + '/ingest/tickers.js');
const tag = (t, kind = 'news') => [...T.tagTickers(t, [], { kind })].sort();

(async () => {
  await T.loadUniverse();
  console.log('— recall: curated project names');
  eq('Ethena governance approves fee switch → ENA', tag('Ethena governance approves fee switch'), ['ENA']);
  eq('Sei introduces a new network upgrade → SEI', tag('Sei introduces a new network upgrade'), ['SEI']);
  eq('NEAR Protocol announces a major upgrade → NEAR', tag('NEAR Protocol announces a major upgrade'), ['NEAR']);
  eq('Harmony ONE bridge relaunches → ONE', tag('Harmony ONE bridge relaunches'), ['ONE']);
  eq('Lighter DEX volume surges → LIT', tag('Lighter DEX volume surges'), ['LIT']);
  eq('Plasma XPL mainnet goes live → XPL', tag('Plasma XPL mainnet goes live'), ['XPL']);
  eq('Official Trump memecoin jumps → TRUMP', tag('Official Trump memecoin jumps after unlock'), ['TRUMP']);
  eq('Sui Network outage → SUI', tag('Sui Network outage halts blocks'), ['SUI']);

  console.log('— precision: curated aliases do not over-tag');
  eq('Hurricane near Florida → []', tag('Hurricane near Florida coast'), []);
  eq("Trump's income from crypto → no TRUMP", tag("Trump's 2025 income wasn't all from cryptocurrency").includes('TRUMP'), false);
  eq('Pepe the Frog meme → []', tag('Pepe the Frog meme returns to social media'), []);
  eq('DoorDash (DASH) stock earnings → []', tag('DoorDash (DASH) stock price jumps on earnings'), []);
  eq('Cathie Wood ARK Invest → no ARK', tag('Cathie Wood ARK Invest buys more Coinbase stock').includes('ARK'), false);

  console.log('— precision: people context, exchange names, BSC');
  eq('Polygon veterans launch new L2 startup → no POL', tag('Polygon veterans launch new L2 startup').includes('POL'), false);
  eq('ex-Polygon co-founders raise $10M → no POL', tag('Polygon co-founders raise $10M for new chain').includes('POL'), false);
  eq('Polygon upgrade still → POL', tag('Polygon upgrade cuts fees by 90%'), ['POL']);
  eq('KuCoin Futures delist notice → no KCS', tag('KuCoin Futures Will Delist the XYZUSDT Perpetual Contract', 'exchange'), ['XYZ']);
  eq('KuCoin hacked → KCS', tag('KuCoin hacked for $20M').includes('KCS'), true);
  eq('Binance lists XYZ → no BNB', tag('Binance lists XYZ token').includes('BNB'), false);
  eq('BSC chain mention → no BSC tag', tag('Binance Alpha lists new tokens on BSC chain').includes('BSC'), false);

  console.log('— Fable real-title regressions (1450-title A/B)');
  check('HYPE in a price-analysis list kept', tag('Crypto Price Analysis Sep-24: ETH, XRP, ADA, BNB, and HYPE').includes('HYPE'));
  check('LINK in "Schwab to add SOL, AVAX, and LINK" kept', tag('Charles Schwab To Add SOL, AVAX, and LINK').includes('LINK'));
  check('UNI surges kept', tag('Altcoins rally as BCH Jumps 28% and UNI Surges on CME Futures').includes('UNI'));
  check('DOGE ETF approved → DOGE', tag('DOGE ETF approved by SEC').includes('DOGE'));
  check('NEAR partners with Ondo Finance → NEAR', tag('NEAR partners with Ondo Finance').includes('NEAR'));
  check('Bitcoin falls as Bitcoin Cash gains → BTC and BCH', ['BTC', 'BCH'].every((t) => tag('Bitcoin Falls Below $86,000 as Bitcoin Cash Gains 28%').includes(t)));
  check('Ethereum Classic outperforms Ethereum → ETH and ETC', ['ETH', 'ETC'].every((t) => tag('Ethereum Classic outperforms Ethereum').includes(t)));
  check('Bitcoin SV rallies → no BTC', !tag('Bitcoin SV Rallies 16%').includes('BTC'));
  check('Ethereum Name Service → no ETH', !tag('Ethereum Name Service to Participate in Governance Summit').includes('ETH'));
  check('Baby Doge Coin → no DOGE', !tag('Baby Doge Coin and Official Trump Rally').includes('DOGE'));
  check('Phala Phala scandal → no PHA', !tag('Ramaphosa faces new questions over Phala Phala farm scandal').includes('PHA'));
  check('Phala Network upgrade → PHA', tag('Phala Network ships confidential AI upgrade').includes('PHA'));
  check('singular founder: Aave Founder criticizes Morpho → AAVE kept', tag('Aave Founder Criticizes Morpho Vault Design').includes('AAVE'));

  console.log('— regressions');
  eq('Bitcoin Cash upgrade → BCH only', tag('Bitcoin Cash network upgrade activates'), ['BCH']);
  eq('Ethereum Classic hard fork → ETC only', tag('Ethereum Classic hard fork scheduled'), ['ETC']);
  eq('exchange notice: Binance will list PEPE → PEPE (exchange kind not filtered)', tag('Binance Will List PEPE', 'exchange'), ['PEPE']);
  eq('hint kept even if title is vague', [...T.tagTickers('New token listed', ['PEPE'], { kind: 'news' })], ['PEPE']);
  eq('Hyperliquid → HYPE', tag('Hyperliquid volume hits record'), ['HYPE']);
  eq('Bitcoin ETF → BTC', tag('Bitcoin ETF inflows top $1B'), ['BTC']);
  eq('Chainlink partners with SWIFT → LINK', tag('Chainlink partners with SWIFT'), ['LINK']);
  eq('Pudgy Penguins token PENGU rallies → PENGU', tag('Pudgy Penguins token PENGU rallies'), ['PENGU']);
  eq('Worldcoin rebrands → WLD', tag('Worldcoin rebrands to World Network'), ['WLD']);
  eq('drain $12M from Arbitrum DEX → none (chain context)', tag('Hackers drain $12M from Arbitrum DEX'), []);

  console.log('— F3 (fix round): finalizeCurated no longer bypasses media/social/official kinds — curated alias recall now applies to them too');
  eq('kind social: Reddit thread title, curated alias "Ethena" → ENA', tag('r/CryptoCurrency: Ethena governance vote passes', 'social'), ['ENA']);
  eq('kind media == kind news for the same title (curated finalizer runs identically for both)', tag('Is Sui the next Solana?', 'media'), tag('Is Sui the next Solana?', 'news'));
  eq('kind official: hint ticker still survives the curated finalizer', [...T.tagTickers('Bitcoin Core ships a routine point release', ['BTC'], { kind: 'official' })], ['BTC']);

  done('p3_step2_tagger');
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
