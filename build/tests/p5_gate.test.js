// P5 P1: big-news gate (gate.js), classify flags, rate limit / queue / one-per-coin-per-day (events.js).
const fs = require('fs'), os = require('os'), path = require('path');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const gate = require(APP + '/ingest/explain/gate.js');
const { createEngine } = require(APP + '/ingest/explain/events.js');
const { classify } = require(APP + '/ingest/classify.js');

const NOW = Date.parse('2026-10-02T13:00:00Z');
const P = (o) => Object.assign({ id: 'p' + Math.random().toString(36).slice(2, 8), title: 't', category: 'other', importance: 20, sentiment: 'neutral', kind: 'news', sourceTier: 2, sourceDomain: 'theblock.co', sourceName: 'rss:theblock', exchange: null, tickers: ['STO'], flags: null, publishedAt: new Date(NOW - 600e3), storyId: null, userLabel: null }, o);
const ev = (o) => gate.evaluate(P(o), { now: NOW, calendarPath: o && o.cal });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p5gate-'));
const mkEngine = (extra) => { const d = fs.mkdtempSync(path.join(tmp, 'e-')); const clock = { t: NOW }; const e = createEngine(Object.assign({ dir: d, now: () => clock.t, calendarPath: '', log: () => {} }, extra)); return { e, clock, d }; };

console.log('— gate: unlock');
eq('5.1% circulating passes', ev({ category: 'unlock', unlockPct: 5.1, unlockPctBasis: 'circulating' }).pass, true);
eq('unspecified basis passes', ev({ category: 'unlock', unlockPct: 6, unlockPctBasis: null }).subtype, 'supply_shock');
eq('4.9% fails', ev({ category: 'unlock', unlockPct: 4.9, unlockPctBasis: 'circulating' }).pass, false);
eq('total-basis pct >= 5 passes (implies >= 5% circulating)', ev({ category: 'unlock', unlockPct: 16.3, unlockPctBasis: 'total' }).pass, true);
const cal = path.join(tmp, 'events_live.json');
fs.writeFileSync(cal, JSON.stringify({ supply_shock: [{ symbol: 'STO', ts_ms: NOW + 86400e3, pct_circ: 5.146, tokens: 21351728, days: 1, date_et: 'Oct 2' }, { symbol: 'LOW', ts_ms: NOW + 3600e3, pct_circ: 4 }, { symbol: 'OLD', ts_ms: NOW - 200 * 3600e3, pct_circ: 9 }] }));
const c1 = gate.evaluate(P({ category: 'unlock', unlockPct: null, tickers: ['STO'] }), { now: NOW, calendarPath: cal });
check('calendar >=5% within 72h passes with a calendar row', c1.pass && c1.calendar && c1.calendar.symbol === 'STO', c1);
eq('calendar <5% fails', gate.evaluate(P({ category: 'unlock', tickers: ['LOW'] }), { now: NOW, calendarPath: cal }).pass, false);
eq('calendar outside 72h fails', gate.evaluate(P({ category: 'unlock', tickers: ['OLD'] }), { now: NOW, calendarPath: cal }).pass, false);
eq('empty calendar path = news only', gate.evaluate(P({ category: 'unlock', tickers: ['STO'] }), { now: NOW, calendarPath: '' }).pass, false);

console.log('— gate: hack / depeg / freeze');
eq('hack tier2 passes (theft)', [ev({ category: 'hack', title: 'Protocol X hacked, $5M drained' }).pass, ev({ category: 'hack', title: 'Protocol X hacked, $5M drained' }).subtype], [true, 'theft']);
eq('hack oracle exploit subtype', ev({ category: 'hack', title: 'Lending app oracle exploit hits pools' }).subtype, 'exploit');
eq('hack tier4 news fails', ev({ category: 'hack', sourceTier: 4, title: 'x hacked' }).pass, false);
eq('hack from exchange kind passes', ev({ category: 'hack', sourceTier: 4, kind: 'exchange', title: 'x hacked' }).pass, true);
const dp = ev({ category: 'other', flags: { depeg: true, freeze: false }, title: 'USDX loses its peg' });
eq('depeg flag passes even category other', [dp.pass, dp.subtype, dp.category], [true, 'depeg', 'hack']);
const fz = ev({ category: 'other', flags: { depeg: false, freeze: true }, title: 'Exchange halts withdrawals' });
eq('freeze flag passes even category other', [fz.pass, fz.subtype], [true, 'halt']);

console.log('— gate: listing / delisting');
eq('binance listing passes', ev({ category: 'listing', kind: 'exchange', exchange: 'Binance', sourceTier: 1 }).pass, true);
eq('delisting on upbit passes', ev({ category: 'delisting', kind: 'exchange', exchange: 'Upbit', sourceTier: 1 }).subtype, 'top_exchange');
eq('non-top exchange fails', ev({ category: 'listing', kind: 'exchange', exchange: 'Bitget', sourceTier: 1 }).pass, false);
eq('news kind listing fails', ev({ category: 'listing', kind: 'news', exchange: 'Binance' }).pass, false);
eq('listing with no coin fails', ev({ category: 'listing', kind: 'exchange', exchange: 'Binance', tickers: [] }).pass, false);

console.log('— gate: regulatory / etf / macro');
eq('etf importance 70 tier2 passes (bullish)', [ev({ category: 'etf', importance: 70, sentiment: 'bullish', tickers: ['BTC'] }).pass, ev({ category: 'etf', importance: 70, sentiment: 'bullish', tickers: ['BTC'] }).subtype], [true, 'bullish']);
eq('etf tier3 fails', ev({ category: 'etf', importance: 70, sourceTier: 3 }).pass, false);
eq('etf importance 60 fails', ev({ category: 'etf', importance: 60 }).pass, false);
eq('regulator kind passes at tier 4', ev({ category: 'regulatory', importance: 80, kind: 'regulator', sourceTier: 4, title: 'SEC drops lawsuit', sentiment: 'bullish' }).subtype, 'bull');
const macro = ev({ category: 'regulatory', importance: 70, title: 'Fed chair signals rate cut path', tickers: [] });
eq('macro topic: coin null, topic fed_rate', [macro.pass, macro.coin, macro.topic, macro.subtype], [true, null, 'fed_rate', 'macro']);
eq('stablecoin bill topic', ev({ category: 'regulatory', importance: 70, title: 'Senate passes stablecoin bill', tickers: [] }).topic, 'stablecoin_bill');

console.log('— gate: review fixes (flags need trust; 2Z total-supply case)');
eq('probe: Binance pauses withdrawals on Solana network for wallet maintenance -> no card', gate.evaluate(P({ category: 'maintenance', kind: 'exchange', exchange: 'Binance', sourceTier: 1, tickers: ['SOL'], flags: { depeg: false, freeze: true }, title: 'Binance pauses withdrawals on Solana network for wallet maintenance' }), { now: NOW }).pass, false);
eq('probe: DOGE falls below $0.95 -> no card', gate.evaluate(P({ category: 'other', tickers: ['DOGE'], flags: { depeg: true, freeze: false }, title: 'DOGE falls below $0.95 as market slides' }), { now: NOW }).pass, false);
eq('stablecoin below $0.95 -> depeg card', gate.evaluate(P({ category: 'other', tickers: ['USDC'], flags: { depeg: true, freeze: false }, title: 'USDC trades below $0.95' }), { now: NOW }).subtype, 'depeg');
eq('depeg flag from tier-4 source fails', gate.evaluate(P({ category: 'other', sourceTier: 4, tickers: ['USDX'], flags: { depeg: true, freeze: false }, title: 'USDX loses its peg' }), { now: NOW }).pass, false);
eq('freeze flag from tier-4 news fails', gate.evaluate(P({ category: 'other', sourceTier: 4, flags: { depeg: false, freeze: true }, title: 'x halts withdrawals' }), { now: NOW }).pass, false);
{
  const h2z = 'DoubleZero (2Z) unlocks 1.66B tokens, 16.3% of total supply, on Oct 2';
  const c = classify({ title: h2z, kind: 'news' }, ['2Z']);
  const g2 = gate.evaluate(P({ title: h2z, category: c.category, unlockPct: c.unlockPct, unlockPctBasis: c.unlockPctBasis, unlockAmount: c.unlockAmount, tickers: ['2Z'], importance: c.importance }), { now: NOW });
  eq('real 2Z headline (16.3% of TOTAL supply) passes', [g2.pass, g2.subtype], [true, 'supply_shock']);
  const { e } = mkEngine();
  const card = e.consider(P({ id: 'z2z', title: h2z, category: c.category, unlockPct: c.unlockPct, unlockPctBasis: c.unlockPctBasis, unlockAmount: c.unlockAmount, tickers: ['2Z'], importance: c.importance, publishedAt: new Date(NOW - 60e3) }));
  check('2Z card created with total-basis wording', card && card.facts.unlock_pct === 16.3 && card.facts.unlock_pct_basis === 'total' && card.facts.unlock_pct_circ === null && /coins equal to about 16\.3% of all 2Z that will ever exist become free to trade/.test(card.text.what) && card.text.uncertain.includes('How many coins already trade is not stated.'), card && card.text);
  const m = e.consider(P({ id: 'z2z2', title: '2Z unlocks 6% of circulating supply', category: 'unlock', unlockPct: 6, unlockPctBasis: 'circulating', tickers: ['2Z'], importance: 80, publishedAt: new Date(NOW - 30e3) }));
  check('merge prefers a circulating pct over total', m.facts.unlock_pct_circ === 6 && m.facts.unlock_pct_basis === 'circulating' && /about 6% more 2Z coins/.test(m.text.what), m.facts);
}

console.log('— gate: never pass');
for (const cat of ['maintenance', 'other']) eq(cat + ' never passes', ev({ category: cat, importance: 90 }).pass, false);
eq('dismiss never passes', ev({ category: 'unlock', unlockPct: 9, unlockPctBasis: 'circulating', userLabel: 'dismiss' }).pass, false);
eq('stale >48h never passes', ev({ category: 'unlock', unlockPct: 9, unlockPctBasis: 'circulating', publishedAt: new Date(NOW - 49 * 3600e3) }).pass, false);

console.log('— classify flags');
const k = (title) => classify({ title, kind: 'news' }, []);
eq('peg flag', k('USDC loses its peg after bank news').flags, { depeg: true, freeze: false });
eq('below 0.9x flag', k('USDX trades below $0.95').flags && k('USDX trades below $0.95').flags.depeg, true);
eq('freeze flag', k('Exchange halts withdrawals after incident').flags, { depeg: false, freeze: true });
eq('no flags property on normal headline', 'flags' in k('Bitcoin surges to record high'), false);
eq('BTC rally shape unchanged', k('Bitcoin surges to record high'), { category: 'other', importance: 20, sentiment: 'bullish' });

console.log('— engine: 3/hour, queue, promotion, expiry, 1 per coin per ET day, macro key');
{
  const { e, clock } = mkEngine();
  const unlockPost = (t, i) => P({ id: 'u' + i, title: t + ' unlocks 6% of circulating supply', category: 'unlock', unlockPct: 6, unlockPctBasis: 'circulating', tickers: [t], importance: 80 - i, publishedAt: new Date(clock.t - 60e3) });
  const evs = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'].map((t, i) => e.consider(unlockPost(t, i)));
  eq('first three live', evs.slice(0, 3).map((x) => x.state), ['live', 'live', 'live']);
  eq('4th and 5th queued', evs.slice(3).map((x) => x.state), ['queued', 'queued']);
  eq('queued events hidden from list()', e.list().length, 3);
  eq('promoteQueue with no free slot does nothing', e.promoteQueue(), 0);
  clock.t += 61 * 60e3;
  eq('after an hour 2 queued promoted (<=3 per hour)', e.promoteQueue(), 2);
  eq('higher importance promoted first', e._events().find((x) => x.coin.ticker === 'DDD').live_at <= e._events().find((x) => x.coin.ticker === 'EEE').live_at, true);
  const again = e.consider(unlockPost('AAA', 9));
  check('same coin same ET day merges, never a second card', again.id === evs[0].id && again.rev === 2 && e._events().filter((x) => x.coin.ticker === 'AAA').length === 1, again.rev);
  const macroPost = (n) => P({ id: 'm' + n, title: 'Fed chair signals rate cut path ' + n, category: 'regulatory', importance: 75, tickers: [], publishedAt: new Date(clock.t - 60e3) });
  const m1 = e.consider(macroPost(1));
  const m2 = e.consider(macroPost(2));
  check('macro keyed by topic, second merges', m1.id === m2.id && /_fed_rate_regulatory$/.test(m1.id) && m1.coin === null && m1.topic === 'fed_rate', m1.id);
  check('id format evt_<ET day>_<coin>_<category>', /^evt_2026-10-02_AAA_unlock$/.test(evs[0].id), evs[0].id);
}
{
  const { e, clock } = mkEngine({ maxPerHour: 1 });
  const p1 = P({ id: 'q1', title: 'AAA unlocks 6% of circulating supply', category: 'unlock', unlockPct: 6, unlockPctBasis: 'circulating', tickers: ['AAA'], publishedAt: new Date(clock.t) });
  const p2 = P({ id: 'q2', title: 'BBB unlocks 6% of circulating supply', category: 'unlock', unlockPct: 6, unlockPctBasis: 'circulating', tickers: ['BBB'], publishedAt: new Date(clock.t) });
  e.consider(p1); const q = e.consider(p2);
  eq('queued', q.state, 'queued');
  clock.t += 7 * 3600e3;
  const r = e.closeOld();
  eq('queue entry dropped after 6 h unpromoted', [r.expired, e._events().some((x) => x.id === q.id)], [1, false]);
  clock.t += 70 * 3600e3;
  eq('live event closed after 72 h', [e.closeOld().closed, e._events()[0].state], [1, 'closed']);
}
{
  const { e, d } = mkEngine();
  e.consider(P({ id: 'z1', title: 'ZZZ unlocks 6% of circulating supply', category: 'unlock', unlockPct: 6, unlockPctBasis: 'circulating', tickers: ['ZZZ'] }));
  const e2 = createEngine({ dir: d, now: () => NOW, calendarPath: '', log: () => {} });
  eq('persisted atomically and reloaded', e2.list().length, 1);
  eq('no .tmp left behind', fs.readdirSync(d).filter((f) => f.endsWith('.tmp')).length, 0);
}
done('p5_gate');
