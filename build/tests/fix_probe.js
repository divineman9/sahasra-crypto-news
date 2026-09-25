process.chdir('D:/claude projects/crypto-news-terminal/app');
const { loadUniverse, tagTickers } = require('D:/claude projects/crypto-news-terminal/app/ingest/tickers.js');
const { classify } = require('D:/claude projects/crypto-news-terminal/app/ingest/classify.js');
const { normalize, simhash64, hamming } = require('D:/claude projects/crypto-news-terminal/app/ingest/cluster.js');
(async () => {
  await loadUniverse();
  const t = (title, hint = []) => tagTickers(title, hint).join(',');
  console.log('MANTRA name->', t('[Bithumb] 만트라(MANTRA) 출금 일시 중지 안내'), '| INJ ->', t('[Bithumb] 인젝티브(INJ) 입출금 일시 중지'), '| Bitget mixed ->', t('[Bithumb] 비트겟(Bitget) 거래소 대상 출금 주의 안내'), '| new coin ->', t('World Premiere: Doppler Finance (XDP) Listed on KuCoin'));
  const k1 = '[Bithumb] 고객 자산 보호 체계 안내', k2 = '[Bithumb] 가상자산 정기실사를 위한 가상자산 입출금 일시 중지 안내';
  console.log('korean normalize:', JSON.stringify(normalize(k1)), '| hamming unrelated korean:', hamming(simhash64(k1), simhash64(k2)));
  for (const [title, hc] of [['USDC Token Splash— Grab a share of the 100000 USDC prize pool .', 'listing'], ['New listing: Listing of POLYMARKETUSDT on Bybit Pre-IPO Tradfi Perpetual', 'listing'], ['Binance Will List Hyperliquid (HYPE) with Seed Tag Applied', 'listing']]) {
    const c = classify({ kind: 'exchange', title, hintCategory: hc, sourceTier: 1 }, []);
    console.log(`${c.category} ${c.importance} ${c.sentiment} | ${title.slice(0, 60)}`);
  }
})();
