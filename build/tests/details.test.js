// F10: detail extraction for notices whose title names no coin.
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
(async () => {
  const D = require(APP + '/ingest/details.js');
  const binanceBody = 'Binance will remove AIXBT/USDC, DOLO/USDC and ENJ/USDC spot pairs. Futures: 1000PEPEUSDT and HUMAUSDT. Token Tensor (TNSR). Fees paid in BNB.';
  eq('binance text: pairs + concatenated + parentheticals, quotes excluded', D.extractFromText(binanceBody, { parentheticals: true }).sort(), ['AIXBT', 'DOLO', 'ENJ', 'HUMA', 'PEPE', 'TNSR'].sort());
  const html = '<nav>(BTC) (ETH) (KCS) menu</nav><script>var x="SHOULDNOTUSDT"</script><p>Listing of ABCUSDT and XYZ/USDT perpetuals</p>';
  eq('html: only pairs, no nav parentheticals, scripts stripped', D.extractFromText(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '), { parentheticals: false }).sort(), ['ABC', 'XYZ']);
  const list = await (await fetch('https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=20&catalogId=161', { headers: { 'user-agent': 'Mozilla/5.0' } })).json();
  const art = list.data.catalogs[0].articles.find((a) => /Removal of|Will Delist/i.test(a.title));
  const live = await D.detailTickers({ sourceName: 'binance-cms', kind: 'exchange', url: 'https://www.binance.com/en/support/announcement/detail/' + art.code });
  check('LIVE binance detail for a pair-removal notice yields coins', live.length > 0, live);
  eq('unreachable url → [] (no throw)', await D.detailTickers({ sourceName: 'bybit', kind: 'exchange', url: 'https://127.0.0.1:9/none' }, { timeoutMs: 1500 }), []);
  done('details');
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
