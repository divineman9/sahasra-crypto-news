process.chdir('D:/claude projects/crypto-news-terminal/app');
const T = require('D:/claude projects/crypto-news-terminal/app/ingest/tickers.js');
const { classify } = require('D:/claude projects/crypto-news-terminal/app/ingest/classify.js');
(async () => {
  await T.loadUniverse();
  console.log('symbol item ->', T.tagTickers('New Hyperliquid perp market live: XYZ', ['XYZ'], { kind: 'symbol' }), '(want [XYZ], no HYPE)');
  console.log('midnight ->', T.tagTickers('Binance to suspend deposits at midnight UTC', [], { kind: 'news' }), '(want [])');
  console.log('arkham/vision ->', T.tagTickers('Arkham data shows whales moving; Vision for 2027 explained', [], { kind: 'news' }), '(want [])');
  const promo = classify({ kind: 'exchange', title: '[Bithumb] 테스트코인(TST) 원화 마켓 신규 상장 기념 이벤트', sourceTier: 1, hintCategory: 'listing' }, ['TST']);
  const real = classify({ kind: 'exchange', title: '[Bithumb] 테스트코인(TST) 원화 마켓 추가', sourceTier: 1, hintCategory: 'listing' }, ['TST']);
  console.log('bithumb promo ->', promo.category, promo.importance, '(want other 30) | real listing ->', real.category, real.importance, '(want listing 95)');
  for (const name of ['bybit', 'bitget', 'kucoin', 'bithumb', 'binanceCms']) {
    const a = require(`D:/claude projects/crypto-news-terminal/app/ingest/adapters/${name}.js`).make();
    for (let i = 0; i < (a.warmRuns || 1); i++) {
      try { const items = await a.run(); console.log(`live ${a.name} run ${i + 1}: ${items.length} items OK`); }
      catch (e) { console.log(`live ${a.name} run ${i + 1}: ERROR ${e.message}`); }
    }
  }
})();
