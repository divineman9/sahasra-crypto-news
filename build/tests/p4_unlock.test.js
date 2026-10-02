// Unlock category (classify.js) + supply-shock reasons (signalSnapshot.js).
const os = require('os'), path = require('path');
process.env.NONCOIN_CACHE_FILE = path.join(os.tmpdir(), 'noncoin_test_unlock.json');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const T = require(APP + '/ingest/tickers.js');
const { classify } = require(APP + '/ingest/classify.js');
const { buildSnapshot } = require(APP + '/ingest/signalSnapshot.js');
const cls = (title, kind = 'news') => classify({ title, kind }, [...T.tagTickers(title, [], { kind })]);

(async () => {
  await T.loadUniverse();
  console.log('— classify: unlock');
  const h = 'DoubleZero (2Z) unlocks 1.66B tokens, 16.3% of total supply, on Oct 2';
  const c = cls(h);
  eq('headline tagged 2Z', [...T.tagTickers(h, [], { kind: 'news' })], ['2Z']);
  eq('category unlock', c.category, 'unlock');
  eq('amount 1.66e9', c.unlockAmount, 1.66e9);
  eq('pct 16.3', c.unlockPct, 16.3);
  eq('importance 80', c.importance, 80);
  eq('bearish', c.sentiment, 'bearish');
  eq('project name alone maps to 2Z', [...T.tagTickers('DoubleZero token supply grows', [], { kind: 'news' })], ['2Z']);
  const mid = cls('ARB unlocks 113M tokens worth $50M');
  eq('113M, no pct → importance 60', [mid.category, mid.unlockAmount, mid.unlockPct, mid.importance], ['unlock', 113e6, null, 60]);
  eq('>=5% → 80', cls('ARB unlocks 5.5% of circulating supply').importance, 80);
  eq('1.655 billion parsed', cls('Token unlocks of 1.655 billion tokens ahead').unlockAmount, 1.655e9);
  eq('generic unlock headline stays unlock/60', [cls('Solana ecosystem faces major token unlocks in October 2026').category, cls('Solana ecosystem faces major token unlocks in October 2026').importance], ['unlock', 60]);
  eq('exchange-kind unlock keeps unlock importance', cls('Foo vesting cliff releases 2B tokens', 'exchange').importance, 80);

  console.log('— classify: non-unlock unchanged');
  eq('BTC rally unchanged', cls('Bitcoin surges to record high'), { category: 'other', importance: 20, sentiment: 'bullish' });
  eq('listing unchanged', cls('Binance will list FOO'), { category: 'listing', importance: 60, sentiment: 'bullish' });

  console.log('— signalSnapshot: supply shock');
  const now = Date.parse('2026-10-01T12:00:00Z');
  const setup = { symbol: '2ZUSDT', tf: '1h', direction: 'UP', stage: 'BAR1_CONFIRMED', bar1_t: 1790300000000 };
  const snap = (events) => buildSnapshot({ setup, bbwAsof: new Date(now - 2000).toISOString(), bbwAsofMs: now - 2000, news: null, events, now, watcherSeenAt: now - 30000 });
  const ev = { asof_ms: now - 60000,
    unlocks_upcoming: [{ symbol: '2Z', ts_ms: now + 86400e3, pct_circ: 16.3, n_parts: 2, sources: ['tokenomist', 'defillama'], max_pct: 16.3, supply_shock: true }],
    supply_shock: [{ symbol: '2Z', max_pct: 16.3 }], unlock_disagreements: [{ symbol: '2Z' }] };
  const s = snap(ev);
  check('SUPPLY SHOCK reason with pct + sources', (s.eventReasons || []).some((r) => /SUPPLY SHOCK 16\.3% \(tokenomist\+defillama\)/.test(r)), s.eventReasons);
  check('sources-disagree reason', (s.eventReasons || []).some((r) => /sources disagree/.test(r)), s.eventReasons);
  eq('scheduled rows keep new fields', s.scheduled[0].n_parts, 2);
  const legacy = snap({ asof_ms: now - 60000, unlocks_upcoming: [{ symbol: '2Z', ts_ms: now + 1, pct_circ: 1 }] });
  eq('absent fields → no reasons (backward compatible)', legacy.eventReasons, null);
  const other = snap({ ...ev, supply_shock: [{ symbol: 'ETH' }], unlock_disagreements: [{ symbol: 'ETH' }], unlocks_upcoming: [{ symbol: '2Z', ts_ms: now + 1, supply_shock: false, max_pct: 1 }] });
  eq('other coin flags / shock=false → none', other.eventReasons, null);
  done('p4_unlock');
})();
