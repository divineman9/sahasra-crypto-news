// Step 2: ticker extraction + classification/sentiment — executable assertions (exit 1 on any failure).
process.chdir('D:/claude projects/crypto-news-terminal/app');
const { eq, check, done } = require('./assert_lib');
const T = require('D:/claude projects/crypto-news-terminal/app/ingest/tickers.js');
const { classify } = require('D:/claude projects/crypto-news-terminal/app/ingest/classify.js');

const tag = (title, kind = 'news', hint = []) => T.tagTickers(title, hint, { kind });
const cls = (title, kind = 'news', hintCategory = null, tickers = []) =>
  classify({ kind, title, sourceTier: kind === 'exchange' ? 1 : 3, hintCategory }, tickers);
const sameSet = (name, actual, expected) => eq(name, [...actual].sort(), [...expected].sort());

(async () => {
  await T.loadUniverse();
  T.addBases(['HYPE', 'OURA', 'PEPE', 'AI', 'ZK', 'PEOPLE', 'VIRTUAL', 'OPENAI']);

  console.log('— Astra: chain context / venue / subject');
  sameSet('on SOL is chain context', tag('Hackers drain funds from protocol on SOL'), []);
  sameSet('on ARB is chain context', tag('Hackers drain funds from protocol on ARB'), []);
  sameSet('on Arbitrum is chain context', tag('Hackers drain $12M from DeFi protocol on Arbitrum'), []);
  sameSet('Solana-based is chain context', tag('Solana-based lending protocol exploited for $5M'), []);
  sameSet('Solana network hacked → SOL (subject)', tag('Solana network hacked'), ['SOL']);
  sameSet('Wormhole exploited → W (subject overrides name block)', tag('Wormhole exploited for $100M'), ['W']);
  sameSet('Optimism hacked → OP (subject overrides name block)', tag('Optimism hacked for $10M'), ['OP']);
  sameSet('Hyperliquid lists XYZ → no HYPE (venue)', tag('Hyperliquid lists XYZ perpetual futures'), []);
  sameSet('Arbitrum surges → ARB', tag('Arbitrum surges 12% after governance vote'), ['ARB']);

  console.log('— Astra: bulk notices keep every coin');
  sameSet('6-coin delisting keeps LINK', tag('Binance Will Delist BTC, ETH, SOL, XRP, ADA and LINK', 'exchange'), ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'LINK']);

  console.log('— earlier false positives stay fixed');
  sameSet("People's Bank → BTC only", tag("People's Bank of China injects liquidity as bitcoin steadies"), ['BTC']);
  sameSet('virtual asset rules → none', tag('Hong Kong regulator tightens virtual asset rules'), []);
  sameSet('OpenAI/Samsung/copper → none', tag('OpenAI and Anthropic race; Samsung and Tencent invest in copper'), []);
  sameSet('(SEC) → none', tag('Securities and Exchange Commission (SEC) sues crypto firm'), []);
  sameSet('(AI) news → none', tag('Artificial intelligence (AI) tokens rally'), []);
  sameSet('DOGE the department → none', tag("DOGE cuts: Musk's Department of Government Efficiency trims budget"), []);
  sameSet('ZK proofs → none', tag('ZK proofs adoption grows'), []);
  sameSet('optimism (word) → ETC only', tag('Analysts express optimism over Ethereum Classic upgrade'), ['ETC']);
  sameSet('GENIUS Act → none', tag('U.S. Federal Reserve moves on proposals to implement GENIUS Act for stablecoins'), []);
  sameSet('midnight UTC → none', tag('Binance to suspend deposits at midnight UTC'), []);
  sameSet('Arkham / Vision → none', tag('Arkham data shows whales moving; Vision for 2027 explained'), []);
  sameSet('Stellar quarter → none', tag('Stellar quarter for Coinbase as revenue jumps'), []);
  sameSet('SPX/DXY/VIX/PCE → none', tag('SPX hits record as DXY slides; VIX low ahead of PCE'), []);
  sameSet('Nasdaq-listed Upexi → SOL only', tag('Nasdaq-listed Upexi (UPXI) buys another 100,000 SOL'), ['SOL']);
  sameSet('Bithumb ERC20/KRW labels → none', tag('[Bithumb] 테더(USDT) ERC20 입금 일시 중지 (KRW)', 'exchange', ['USDT', 'ERC20', 'KRW']), []);
  sameSet('symbol item → hint only', tag('New Hyperliquid perp market live: XYZ', 'symbol', ['XYZ']), ['XYZ']);

  console.log('— earlier true positives stay found');
  sameSet('AI in an exchange listing', tag('Binance Will List Artificial Superintelligence (AI) with Seed Tag', 'exchange'), ['AI']);
  sameSet('$DOGE + Dogecoin', tag('Dogecoin jumps 10% as $DOGE whales buy'), ['DOGE']);
  sameSet('HYPE listing', tag('Binance Will List Hyperliquid (HYPE) with Seed Tag Applied', 'exchange'), ['HYPE']);
  sameSet('$PENGU + 1000PEPEUSDT', tag('Coinbase to list $PENGU and 1000PEPEUSDT perps next week'), ['PENGU', 'PEPE']);
  sameSet('XDP new coin', tag('World Premiere: Doppler Finance (XDP) Listed on KuCoin', 'exchange'), ['XDP']);
  sameSet('NEAR', tag('Near Protocol upgrade goes live as NEAR climbs'), ['NEAR']);
  sameSet('JUST IN: Solana ETF → SOL', tag('JUST IN: Solana ETF sees record inflows as SOL jumps'), ['SOL']);
  sameSet('OURAUSDT (pre-IPO stock perp) → no coin tag', tag('Binance Futures Will Launch OURAUSDT USDⓈ-Margined Perpetual Contract', 'exchange'), []);

  console.log('— Astra: sentiment reflects the action');
  eq('SEC delays approval of Solana ETF → etf bearish', [cls('SEC delays approval of Solana ETF').category, cls('SEC delays approval of Solana ETF').sentiment], ['etf', 'bearish']);
  eq('SEC rejects ETF → bearish', cls('SEC rejects spot XRP ETF application').sentiment, 'bearish');
  eq('SEC approves ETF → bullish', cls('SEC approves spot Solana ETF').sentiment, 'bullish');
  eq('SEC drops lawsuit → regulatory bullish', [cls('SEC drops lawsuit against Ripple').category, cls('SEC drops lawsuit against Ripple').sentiment], ['regulatory', 'bullish']);
  eq('judge dismisses case → bullish', cls('Judge dismisses SEC case against Coinbase').sentiment, 'bullish');
  eq('SEC sues exchange → bearish', cls('SEC sues crypto exchange over unregistered securities').sentiment, 'bearish');
  eq('senate stablecoin bill → neutral', cls('US Senate passes stablecoin bill').sentiment, 'neutral');

  console.log('— earlier classification behaviour stays');
  eq('breached $120K → etf', cls('Bitcoin breached $120K as ETF inflows hit record').category, 'etf');
  eq('settles above → other', cls('Bitcoin settles above $110,000 after Fed decision').category, 'other');
  eq('phishing warning → other 40', [cls('Binance warns users of phishing scam targeting Solana wallets').category, cls('Binance warns users of phishing scam targeting Solana wallets').importance], ['other', 40]);
  eq('Nasdaq-listed → not listing', cls('Nasdaq-listed Upexi (UPXI) buys another 100,000 SOL').category, 'other');
  eq('hacked → hack 85', [cls('DeFi protocol hacked for $40M').category, cls('DeFi protocol hacked for $40M').importance], ['hack', 85]);
  eq('exchange Will List → listing 95', [cls('Binance Will List Hyperliquid (HYPE) with Seed Tag Applied', 'exchange', 'listing').category, cls('Binance Will List Hyperliquid (HYPE) with Seed Tag Applied', 'exchange', 'listing').importance], ['listing', 95]);
  eq('margin delist → maintenance 40', [cls('Binance Margin And Loan Will Delist BTTC & POWR', 'exchange', 'delisting').category, cls('Binance Margin And Loan Will Delist BTTC & POWR', 'exchange', 'delisting').importance], ['maintenance', 40]);
  eq('real Will Delist → delisting 90', [cls('Binance Will Delist COMBO, DAR on 2026-10-01', 'exchange', 'delisting').category, cls('Binance Will Delist COMBO, DAR on 2026-10-01', 'exchange', 'delisting').importance], ['delisting', 90]);
  eq('USDC perp launch → listing 50', cls('Binance Futures Will Launch USDⓈ-Margined BTCUSDC Perpetual Contract', 'exchange', 'listing').importance, 50);
  eq('promo → other 30', cls('USDC Token Splash— Grab a share of the 100000 USDC prize pool .', 'exchange', 'listing').category, 'other');
  eq('Bithumb KRW listing → 95', cls('[Bithumb] 테스트코인(TST) 원화 마켓 추가', 'exchange', 'listing').importance, 95);
  eq('Bithumb promo → other', cls('[Bithumb] 테스트코인(TST) 원화 마켓 신규 상장 기념 이벤트', 'exchange', 'listing').category, 'other');

  done('step2_extract');
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
