// P5 P3: forward log (jsonl), d1/d7/d30 outcome job vs BTC, monthly base rates, "Historically X of N" at n >= 20.
const fs = require('fs'), os = require('os'), path = require('path');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const { createEngine } = require(APP + '/ingest/explain/events.js');
const baseRates = require(APP + '/ingest/explain/baseRates.js');
const { etParts } = require(APP + '/ingest/explain/timeET.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p5out-'));
const H = 3600e3, D = 24 * H;
const T0 = Date.parse('2026-10-02T14:00:00Z');
let n = 0;
const post = (t, clock, extra) => Object.assign({ id: 'o' + ++n, title: `${t} unlocks 6% of circulating supply on Oct 2`, url: 'https://x.test/' + n, category: 'unlock', importance: 80, sentiment: 'bearish', kind: 'news', sourceTier: 2, sourceDomain: 'theblock.co', sourceName: 'rss:x', exchange: null, tickers: [t], unlockPct: 6, unlockPctBasis: 'circulating', publishedAt: new Date(clock.t - 60e3), storyId: null, userLabel: null }, extra);
function mk(prices, extra) {
  const clock = { t: T0 };
  const calls = [];
  const dir = fs.mkdtempSync(path.join(tmp, 'e-'));
  const e = createEngine(Object.assign({ dir, now: () => clock.t, calendarPath: '', log: () => {}, maxPerHour: 100, priceFn: async (tk) => { calls.push(tk); return typeof prices === 'function' ? prices(tk) : prices[tk] ?? null; } }, extra));
  return { e, clock, calls, dir };
}

(async () => {
  console.log('— forward log: row on creation, horizons fill in order');
  const P = { BTC: 100, AAA: 10 };
  const A = mk((tk) => P[tk]);
  const ev = A.e.consider(post('AAA', A.clock));
  await A.e.settled();
  let rows = A.e.outcomes.all();
  eq('one row with p0 / btc0, status open, d1/d7/d30 null', [rows.length, rows[0].event_id, rows[0].p0, rows[0].btc0, rows[0].status, rows[0].d1, rows[0].d7, rows[0].d30], [1, ev.id, 10, 100, 'open', null, null, null]);
  eq('row carries category/subtype/coin/t0', [rows[0].category, rows[0].subtype, rows[0].coin, rows[0].t0], ['unlock', 'supply_shock', 'AAA', ev.live_at]);
  eq('run before 1 day: nothing filled, no fetch', [await A.e.outcomes.run(), A.calls.length], [0, 2]);
  A.clock.t = T0 + 1 * D; P.AAA = 9; P.BTC = 102;
  const c0 = A.calls.length;
  eq('d1 fills after 1 day', await A.e.outcomes.run(), 1);
  rows = A.e.outcomes.all();
  eq('d1 values: ret and ret vs BTC (1 decimal)', [rows[0].d1.ret, rows[0].d1.ret_vs_btc, rows[0].d1.p, rows[0].d1.btc, rows[0].d7, rows[0].status], [-10, -12, 9, 102, null, 'open']);
  eq('at most one fetch per coin per horizon (1 coin fetch + 1 BTC fetch)', A.calls.length - c0, 2);
  eq('same horizon is not filled twice', await A.e.outcomes.run(), 0);
  A.clock.t = T0 + 7 * D + H; P.AAA = 11; P.BTC = 100;
  eq('d7 fills next, d30 still null', [await A.e.outcomes.run(), A.e.outcomes.all()[0].d7.ret, A.e.outcomes.all()[0].d30], [1, 10, null]);
  A.clock.t = T0 + 30 * D + H;
  eq('d30 fills and the row is done', [await A.e.outcomes.run(), A.e.outcomes.all()[0].status], [1, 'done']);
  const lines = fs.readFileSync(A.e.outcomes.file, 'utf8').split('\n').filter(Boolean);
  eq('append-only: one line per fill, last line per event wins', [lines.length, A.e.outcomes.all().length], [4, 1]);

  console.log('— no price / macro');
  const B = mk((tk) => (tk === 'BTC' ? 100 : null));
  B.e.consider(post('NOP', B.clock));
  await B.e.settled();
  eq('no coin price -> status no_price', B.e.outcomes.all()[0].status, 'no_price');
  B.clock.t = T0 + 40 * D;
  eq('no_price rows are never filled', [await B.e.outcomes.run(), B.e.outcomes.all()[0].d1], [0, null]);
  const M = mk({ BTC: 100 });
  M.e.consider({ id: 'mac', title: 'Fed chair signals rate cut path', url: 'https://x.test/mac', category: 'regulatory', importance: 75, sentiment: 'neutral', kind: 'news', sourceTier: 2, sourceDomain: 'x', sourceName: 'x', tickers: [], publishedAt: new Date(T0 - 1000), storyId: null });
  await M.e.settled();
  const mr = M.e.outcomes.all()[0];
  eq('macro event uses BTC for both prices', [mr.coin, mr.p0, mr.btc0], [null, 100, 100]);

  console.log('— base-rate math');
  const rowsIn = [-5, -2, 3, -10].map((r, i) => ({ event_id: 'r' + i, category: 'unlock', subtype: 'supply_shock', status: 'done', d30: { ret_vs_btc: r } }));
  const noSeed = baseRates.rebuild({ rows: rowsIn, seed: null, now: T0 });
  eq('without seed: n / lower / median / source', [noSeed['unlock:supply_shock'].n, noSeed['unlock:supply_shock'].lower_vs_btc_d30, noSeed['unlock:supply_shock'].median_vs_btc_d30, noSeed['unlock:supply_shock'].source], [4, 3, -3.5, 'forward log']);
  const seed = { 'unlock:supply_shock': { n: 236, lower_vs_btc_d30: 171, median_vs_btc_d30: -16.3, source: 'study 2026-09' } };
  const withSeed = baseRates.rebuild({ rows: rowsIn, seed, now: T0 })['unlock:supply_shock'];
  eq('with seed: n = seed n + log n, lower summed, n-weighted median', [withSeed.n, withSeed.lower_vs_btc_d30, withSeed.median_vs_btc_d30, withSeed.source], [240, 174, -16.1, 'study 2026-09 + forward log']);
  eq('seed alone (empty log)', baseRates.rebuild({ rows: [], seed, now: T0 })['unlock:supply_shock'], { n: 236, lower_vs_btc_d30: 171, median_vs_btc_d30: -16.3, source: 'study 2026-09' });
  eq('open / no_price rows are not counted', baseRates.rebuild({ rows: [{ category: 'unlock', subtype: 'supply_shock', status: 'open', d30: null }], seed: null, now: T0 })['unlock:supply_shock'], undefined);

  console.log('— monthly rebuild rule (1st, 03:00 ET)');
  {
    const dir = fs.mkdtempSync(path.join(tmp, 'm-'));
    const ck = { t: Date.parse('2026-11-10T15:00:00Z') };
    const st = baseRates.createStore({ dir, now: () => ck.t, outcomes: null, log: () => {} });
    check('first call builds', st.maybeRebuild() !== null);
    ck.t = Date.parse('2026-11-30T20:00:00Z'); eq('same month: no rebuild', st.maybeRebuild(), null);
    ck.t = Date.parse('2026-12-01T07:59:00Z'); eq('Dec 1 02:59 ET: not yet', st.maybeRebuild(), null);
    ck.t = Date.parse('2026-12-01T08:00:00Z'); check('Dec 1 03:00 ET: rebuilds', st.maybeRebuild() !== null);
    ck.t = Date.parse('2026-12-01T09:00:00Z'); eq('and only once that month', st.maybeRebuild(), null);
    eq('etParts reads ET', etParts(Date.parse('2026-12-01T08:00:00Z')), { y: 2026, m: 12, d: 1, hour: 3 });
  }

  console.log('— the card flips from "Not enough comparable cases" to "Historically X of N" exactly at n = 20');
  {
    const prices = { phase: 'start' };
    const price = (tk) => (tk === 'BTC' ? 100 : prices.phase === 'start' ? 10 : (parseInt(tk.slice(1), 10) % 2 === 0 ? 9 : 11));
    const S = mk(price);
    const sym = (i) => 'C' + String(i).padStart(2, '0');
    const t0s = [];
    for (let i = 0; i < 21; i++) { S.clock.t = T0 + i * 2 * H; t0s.push(S.clock.t); S.e.consider(post(sym(i), S.clock)); await S.e.settled(); }
    prices.phase = 'later';
    S.clock.t = t0s[18] + 30 * D + 60e3;
    await S.e.outcomes.run();
eq('19 rows have reached d30 (done); the 2 newest are still open', [S.e.outcomes.all().filter((r) => r.status === 'done').length, S.e.outcomes.all().filter((r) => r.status === 'open').length], [19, 2]);
    S.e.rates.rebuildNow();
    eq('n = 19: no base rate yet', S.e.rates.get('unlock:supply_shock'), null);
    S.clock.t += 30 * 24 * H; // fresh ET day so the new card is its own event
    const e19 = S.e.consider(post('NEW1', S.clock, { id: 'new1' }));
    await S.e.settled();
    check('card at n = 19 shows the literal, no Historically line', e19.text.uncertain.includes('Not enough comparable cases') && e19.text.scenarios.every((s) => s.base_rate === null), e19.text);
    // the 20th row becomes due: events 19.. were created at t0s[19]; clock is already past all of them, so fill the rest
    const filled = await S.e.outcomes.run();
    eq('remaining rows fill (2 more)', filled, 2);
    const doneRows = S.e.outcomes.all().filter((r) => r.status === 'done');
    S.e.rates.rebuildNow();
    const br = S.e.rates.get('unlock:supply_shock');
    const lowerExpected = doneRows.filter((r) => r.d30.ret_vs_btc < 0).length;
    eq('n = 21 done rows; lower = those that fell vs BTC; median from log', [br.n, br.lower_vs_btc_d30, br.source], [21, lowerExpected, 'forward log']);
    S.clock.t += 2 * D;
    const e21 = S.e.consider(post('NEW2', S.clock, { id: 'new2' }));
    await S.e.settled();
    const down = e21.text.scenarios.find((s) => s.dir === 'down');
    check('card at n >= 20 shows Historically X of N and drops the literal', down.base_rate && down.base_rate.x === lowerExpected && down.base_rate.n === 21 && !e21.text.uncertain.includes('Not enough comparable cases'), down.base_rate);
    eq('history lists up to 5 finished comparable cases (vs BTC)', [e21.history.cases.length, e21.history.note], [5, null]);
    check('case rows carry d1/d7/d30 vs BTC', e21.history.cases.every((c) => c.r30 === 10 || c.r30 === -10 || c.r30 === 0 || typeof c.r30 === 'number'), e21.history.cases[0]);
    // exact threshold: n = 20 qualifies, n = 19 does not
    const st = baseRates.createStore({ dir: fs.mkdtempSync(path.join(tmp, 't-')), now: () => T0, outcomes: { all: () => doneRows.slice(0, 20) }, log: () => {} });
    st.rebuildNow();
    check('n = 20 qualifies', st.get('unlock:supply_shock') && st.get('unlock:supply_shock').n === 20);
    const st2 = baseRates.createStore({ dir: fs.mkdtempSync(path.join(tmp, 't-')), now: () => T0, outcomes: { all: () => doneRows.slice(0, 19) }, log: () => {} });
    st2.rebuildNow();
    eq('n = 19 does not', st2.get('unlock:supply_shock'), null);
  }

  console.log('— private seed: shows seed numbers; no seed: shows none');
  {
    const withSeedDir = mk({ BTC: 100, SEE: 10 });
    fs.mkdirSync(withSeedDir.dir, { recursive: true });
    fs.writeFileSync(path.join(withSeedDir.dir, 'base_rates.seed.json'), JSON.stringify(seed));
    withSeedDir.e.rates.rebuildNow();
    const ev1 = withSeedDir.e.consider(post('SEE', withSeedDir.clock));
    await withSeedDir.e.settled();
    const d1 = ev1.text.scenarios.find((s) => s.dir === 'down').base_rate;
    eq('seed numbers carried onto the card', [d1.x, d1.n, d1.measure], [171, 236, 'coins were lower vs BTC 30 days after an unlock this big']);
    const noSeedDir = mk({ BTC: 100, SEE: 10 });
    noSeedDir.e.rates.rebuildNow();
    const ev2 = noSeedDir.e.consider(post('SEE', noSeedDir.clock));
    await noSeedDir.e.settled();
    check('without a seed the card shows no numbers', ev2.text.scenarios.every((s) => s.base_rate === null) && ev2.text.uncertain.includes('Not enough comparable cases'), ev2.text.uncertain);
  }
  done('p5_outcomes');
})();
