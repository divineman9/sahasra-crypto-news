// P5 P3 review round: creation-time baselines, timestamped horizons, 1000-contract identity, bounded retries,
// compaction + mtime cache + single-flight, pooled-median/validation/min-20, refresh after rebuild, completed history, light-theme CSS order.
const fs = require('fs'), os = require('os'), path = require('path');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const { createEngine } = require(APP + '/ingest/explain/events.js');
const outcomesLib = require(APP + '/ingest/explain/outcomes.js');
const baseRates = require(APP + '/ingest/explain/baseRates.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p5rev-'));
const H = 3600e3, D = 24 * H;
const T0 = Date.parse('2026-10-02T14:00:00Z');
const iso = (t) => new Date(t).toISOString();
let n = 0;
const post = (t, clock, extra) => Object.assign({ id: 'v' + ++n, title: `${t} unlocks 6% of circulating supply on Oct 2`, url: 'https://x.test/r' + n, category: 'unlock', importance: 80, sentiment: 'bearish', kind: 'news', sourceTier: 2, sourceDomain: 'theblock.co', sourceName: 'rss:x', exchange: null, tickers: [t], unlockPct: 6, unlockPctBasis: 'circulating', publishedAt: new Date(clock.t - 60e3), storyId: null, userLabel: null }, extra);
const fakeEv = (id, extra) => Object.assign({ id, category: 'unlock', subtype: 'supply_shock', coin: { ticker: 'AAA' }, facts: { headline: 'h ' + id }, created_at: iso(T0), live_at: iso(T0) }, extra);
function mkOut(o) {
  const clock = { t: T0 };
  const dir = fs.mkdtempSync(path.join(tmp, 'o-'));
  const out = outcomesLib.createOutcomes(Object.assign({ dir, now: () => clock.t, log: () => {} }, o));
  return { out, clock, dir };
}
function mkEngine(prices, extra) {
  const clock = { t: T0 };
  const dir = fs.mkdtempSync(path.join(tmp, 'e-'));
  const e = createEngine(Object.assign({ dir, now: () => clock.t, calendarPath: '', log: () => {}, maxPerHour: 100, priceFn: async (tk) => prices[tk] ?? null, priceAtFn: async (tk) => prices[tk] ?? null }, extra));
  return { e, clock, dir };
}
const lineCount = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length;

(async () => {
  console.log('— 1. baseline captured at creation, also for queued cards');
  {
    const P = { BTC: 100, AAA: 10, BBB: 20 };
    const M = mkEngine(P, { maxPerHour: 1 });
    M.e.consider(post('AAA', M.clock));
    const q = M.e.consider(post('BBB', M.clock));
    await M.e.settled();
    const qrow = M.e.outcomes.all().find((r) => r.event_id === q.id);
    eq('queued card is queued and already has a creation baseline row', [q.state, qrow.p0, qrow.live], ['queued', 20, false]);
    P.BBB = 30; P.BTC = 150; M.clock.t = T0 + 2 * H; // prices move before promotion
    M.e.tick();
    await M.e.settled();
    const row = M.e.outcomes.all().find((r) => r.event_id === q.id);
    eq('after promotion the row keeps creation prices and creation t0', [M.e.get(q.id).state, row.p0, row.btc0, row.t0, row.live], ['live', 20, 100, q.created_at, true]);
    // a baseline read long after creation is not a creation price
    const L = mkOut({ priceFn: async () => { L.clock.t += 11 * 60e3; return 100; } });
    const r = await L.out.record(fakeEv('late1'));
    eq('baseline read > 10 min after creation -> no_price, no prices kept', [r.status, r.p0, r.btc0, r.reason], ['no_price', null, null, 'baseline_not_at_creation']);
    // promoted event with no baseline row (pre-fix event): explicit no_price, never a promotion-time price
    const N = mkOut({ priceFn: async () => 100 });
    await N.out.markLive(fakeEv('legacy1'));
    eq('promotion without a creation baseline -> no_price row', [N.out.all()[0].status, N.out.all()[0].p0, N.out.all()[0].reason], ['no_price', null, 'no_creation_baseline']);
  }

  console.log('— 2. horizons use their own timestamp; downtime never relabels');
  {
    const seen = [];
    const at = async (instr, ts) => { seen.push([instr, ts]); return (instr === 'BTC' ? 100 : 10) + (ts - T0) / D; };
    const A = mkOut({ priceFn: async (tk) => (tk === 'BTC' ? 100 : 10), priceAtFn: at });
    await A.out.record(fakeEv('dt1'));
    A.clock.t = T0 + 31 * D; // 31 days of downtime: d1 d7 d30 all overdue
    eq('three horizons resolved in one run', await A.out.run(), 3);
    const row = A.out.all()[0];
    eq('each cell is measured at its own target time', [row.d1.t, row.d7.t, row.d30.t], [iso(T0 + D), iso(T0 + 7 * D), iso(T0 + 30 * D)]);
    let aligned = true;
    for (let i = 0; i < seen.length; i += 2) if (seen[i][1] !== seen[i + 1][1] || seen[i][0] !== 'BTC' || seen[i + 1][0] !== 'AAA') aligned = false;
    eq('BTC and the coin are read at the SAME timestamp for every horizon', [aligned, seen.length], [true, 6]);
    eq("d1 / d30 prices are the historical ones, not today's", [row.d1.p, row.d30.p, row.d1.btc, row.d30.btc], [11, 40, 101, 130]);
    eq('status done', row.status, 'done');
    // no historical source -> missed horizons are marked missing; only a horizon inside the grace window uses the current price
    let px = 10;
    const B = mkOut({ priceFn: async (tk) => (tk === 'BTC' ? 100 : px) });
    await B.out.record(fakeEv('dt2'));
    px = 12;
    B.clock.t = T0 + 30 * D + 30 * 60e3;
    await B.out.run();
    const b = B.out.all()[0];
    eq('without klines: d1/d7 missing(missed_horizon), d30 (30 min late) measured now', [b.d1.missing, b.d1.reason, b.d7.reason, b.d30.ret, b.status], [true, 'missed_horizon', 'missed_horizon', 20, 'done']);
    eq('missing cells carry no ret_vs_btc, so they never enter base rates', [b.d1.ret_vs_btc, baseRates.rebuild({ rows: [Object.assign({}, b, { d30: b.d1 })], seed: null, now: T0 })['unlock:supply_shock']], [undefined, undefined]);
    // rounding only on the final difference
    const R = mkOut({ priceFn: async () => 100, priceAtFn: async (i) => (i === 'BTC' ? 105.04 : 110.06) });
    await R.out.record(fakeEv('rd1'));
    R.clock.t = T0 + D + 5 * H;
    await R.out.run();
    const d1 = R.out.all()[0].d1;
    eq('ret 10.06 / btc 5.04 -> ret 10.1, vs btc 5.0 (raw 5.02), not 10.1-5.0=5.1', [d1.ret, d1.ret_vs_btc], [10.1, 5]);
  }

  console.log('— 3. 1000-prefixed contracts, instrument identity, bounded retries');
  {
    const urls = [];
    const req = (u) => {
      urls.push(u);
      const m = /symbol=([A-Z0-9]+)/.exec(u)[1];
      if (/klines/.test(u)) { const st = Number(/startTime=(\d+)/.exec(u)[1]); return { json: () => (m === '1000PEPEUSDT' ? [[st, '0.0123', '', '', '', '']] : []) }; }
      if (m === '1000PEPEUSDT') return { json: () => ({ price: '0.0100' }) };
      if (m === 'BTCUSDT') return { json: () => ({ price: '100000' }) };
      throw new Error('400 invalid symbol');
    };
    const pf = outcomesLib.makePriceFn(req, { gapMs: 0 });
    const q1 = await pf('PEPE'), q2 = await pf('1000PEPE');
    eq('PEPE and 1000PEPE resolve to the 1000PEPEUSDT contract, price per single token', [q1.instrument, q1.price, q2.instrument, q2.price], ['1000PEPEUSDT', 0.00001, '1000PEPEUSDT', 0.00001]);
    eq('baseTicker / multOf', [outcomesLib.baseTicker('1000PEPE'), outcomesLib.baseTicker('1MBABYDOGE'), outcomesLib.baseTicker('1INCH'), outcomesLib.multOf('1000PEPEUSDT'), outcomesLib.multOf('PEPEUSDT')], ['PEPE', 'BABYDOGE', '1INCH', 1000, 1]);
    eq('with an instrument only that contract is asked', await pf('PEPE', 'PEPEUSDT'), null);
    eq('klines read at the exact minute, per token', await pf.at('1000PEPEUSDT', T0), 0.0000123);
    check('klines request is read-only public data (GET klines, startTime, limit=1)', urls.some((u) => /fapi\/v1\/klines\?symbol=1000PEPEUSDT&interval=1m&startTime=\d+&limit=1/.test(u)));
    // a fallback to a different contract is a missing outcome, not a 1000x return
    const C = mkOut({ priceFn: async (tk, instr) => (tk === 'BTC' ? { price: 100, instrument: 'BTCUSDT' } : { price: instr ? 0.01 : 10, instrument: instr === '1000PEPEUSDT' ? 'PEPEUSDT' : '1000PEPEUSDT' }) });
    const base = await C.out.record(fakeEv('pe1', { coin: { ticker: 'PEPE' } }));
    eq('instrument persisted at baseline', [base.instr, base.btc_instr], ['1000PEPEUSDT', 'BTCUSDT']);
    C.clock.t = T0 + D + H;
    await C.out.run();
    eq('different contract at measurement -> d1 missing (instrument_mismatch), no return computed', [C.out.all()[0].d1.reason, C.out.all()[0].d1.ret], ['instrument_mismatch', undefined]);
    // legacy row (no instrument) with an absurd ratio is not trusted
    const G = mkOut({ priceFn: async (tk) => (tk === 'BTC' ? 100 : 10000), priceAtFn: null });
    fs.writeFileSync(G.out.file, JSON.stringify({ event_id: 'old1', category: 'unlock', subtype: 'supply_shock', coin: 'AAA', t0: iso(T0), p0: 10, btc0: 100, d1: null, d7: null, d30: null, status: 'open' }) + '\n');
    G.clock.t = T0 + D + H;
    await G.out.run();
    eq('legacy row with 1000x ratio -> missing(instrument_unverified)', G.out.all()[0].d1.reason, 'instrument_unverified');
    // delisted / unavailable: bounded retries, then explicit missing
    const U = mkOut({ priceFn: async (tk) => (tk === 'BTC' ? 100 : 10), priceAtFn: async () => null });
    await U.out.record(fakeEv('del1'));
    U.clock.t = T0 + 31 * D;
    const counts = [];
    for (let i = 0; i < 6; i++) { counts.push(await U.out.run()); U.clock.t += H; }
    eq('5 hourly retries resolve nothing, the 6th marks every overdue horizon unavailable', counts, [0, 0, 0, 0, 0, 3]);
    const u = U.out.all()[0];
    eq('explicit unavailable outcomes and row done; no further retries', [u.d1.reason, u.d7.missing, u.d30.reason, u.status, await U.out.run()], ['unavailable', true, 'unavailable', 'done', 0]);
  }

  console.log('— 4. compaction, mtime cache, single-flight');
  {
    const A = mkOut({ priceFn: async (tk) => (tk === 'BTC' ? 100 : 10), priceAtFn: async () => 100 });
    const mkRow = (id, t0, status) => ({ event_id: id, category: 'unlock', subtype: 'supply_shock', coin: 'AAA', t0, date: t0.slice(0, 10), p0: 10, btc0: 100, d1: null, d7: null, d30: status === 'done' ? { ret: 1, ret_vs_btc: -1 } : null, status });
    const lines = [mkRow('a1', '2026-06-10T00:00:00.000Z', 'done'), mkRow('a2', '2026-06-20T00:00:00.000Z', 'done'), mkRow('a3', '2026-07-05T00:00:00.000Z', 'no_price'), mkRow('o1', '2026-09-20T00:00:00.000Z', 'open'), mkRow('o1', '2026-09-20T00:00:00.000Z', 'open'), mkRow('d1', '2026-09-25T00:00:00.000Z', 'done')];
    fs.writeFileSync(A.out.file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    eq('before: 5 distinct events', A.out.all().length, 5);
    eq('compaction archives completed rows older than 60 days (3 rows)', A.out.compact({ force: true }), 3);
    eq('live file keeps the open + recent rows, one line each', [lineCount(A.out.file), A.out.all().map((r) => r.event_id).sort()], [2, ['d1', 'o1']]);
    const arch = fs.readdirSync(A.dir).filter((f) => /^forward_log\.archive\.\d{4}-\d{2}\.jsonl$/.test(f)).sort();
    eq('monthly archive files by t0 month', arch, ['forward_log.archive.2026-06.jsonl', 'forward_log.archive.2026-07.jsonl']);
    eq('allWithArchive still sees every row (base rates / history)', A.out.allWithArchive().map((r) => r.event_id).sort(), ['a1', 'a2', 'a3', 'd1', 'o1']);
    eq('compaction is idempotent (nothing to move, archives not duplicated)', [A.out.compact({ force: true }), lineCount(path.join(A.dir, arch[0]))], [0, 2]);
    // mtime cache
    A.out.all();
    const p0 = A.out._parses();
    for (let i = 0; i < 20; i++) A.out.all();
    eq('20 reads of an unchanged file parse it 0 more times', A.out._parses() - p0, 0);
    await A.out.record(fakeEv('c1'));
    A.out.all();
    eq('our own append keeps the cache valid (no re-parse)', A.out._parses() - p0, 0);
    fs.appendFileSync(A.out.file, JSON.stringify(mkRow('ext1', '2026-09-30T00:00:00.000Z', 'open')) + '\n');
    check('an external change is picked up (one re-parse)', A.out.all().some((r) => r.event_id === 'ext1') && A.out._parses() - p0 === 1);
    // single flight
    const S = mkOut({ priceFn: async (tk) => { await new Promise((r) => setTimeout(r, 15)); return tk === 'BTC' ? 100 : 10; }, priceAtFn: async () => 100 });
    const ev = fakeEv('sf1');
    const [r1, r2] = await Promise.all([S.out.record(ev), S.out.record(ev)]);
    eq('concurrent record() of one event writes one row', [S.out.all().length, lineCount(S.out.file), r1 === r2], [1, 1, true]);
    S.clock.t = T0 + 31 * D;
    const [x, y] = await Promise.all([S.out.run(), S.out.run()]);
    eq('concurrent run() is single-flight: same result for both, every cell filled once', [x, y, S.out.all()[0].status], [3, 3, 'done']);
    eq('and the log has exactly 1 baseline line + 1 fill line', lineCount(S.out.file), 2);
  }

  console.log('— 5. base rates: pooled median, validation, minimum of 20');
  {
    const row = (r, extra) => Object.assign({ event_id: 'b' + ++n, category: 'unlock', subtype: 'supply_shock', status: 'done', t0: '2026-09-01T00:00:00.000Z', d30: { ret_vs_btc: r } }, extra);
    const seed = { 'unlock:supply_shock': { n: 100, lower_vs_btc_d30: 70, median_vs_btc_d30: -10, source: 's' } };
    const both = baseRates.rebuild({ rows: [row(5), row(6)], seed, now: T0 })['unlock:supply_shock'];
    eq('seed + log: counts pooled, combined median omitted', [both.n, both.lower_vs_btc_d30, 'median_vs_btc_d30' in both], [102, 70, false]);
    eq('log only: median from the observations', baseRates.rebuild({ rows: [row(1), row(2), row(9)], seed: null, now: T0 })['unlock:supply_shock'].median_vs_btc_d30, 2);
    const bad = baseRates.rebuild({ rows: [row(NaN), row(Infinity), row('3'), row(2, { t0: 'nope' }), row(-1)], seed: null, now: T0 })['unlock:supply_shock'];
    eq('non-finite / string returns and bad dates are dropped', [bad.n, bad.lower_vs_btc_d30], [1, 1]);
    for (const [name, s] of [['lower > n', { n: 10, lower_vs_btc_d30: 11, median_vs_btc_d30: -1 }], ['negative lower', { n: 10, lower_vs_btc_d30: -1, median_vs_btc_d30: -1 }], ['fractional n', { n: 10.5, lower_vs_btc_d30: 5, median_vs_btc_d30: -1 }], ['NaN median', { n: 30, lower_vs_btc_d30: 5, median_vs_btc_d30: NaN }], ['string n', { n: '30', lower_vs_btc_d30: 5, median_vs_btc_d30: -1 }]]) {
      eq('invalid seed ignored: ' + name, baseRates.rebuild({ rows: [], seed: { 'unlock:supply_shock': s }, now: T0 })['unlock:supply_shock'], undefined);
    }
    const dir = fs.mkdtempSync(path.join(tmp, 'br-'));
    fs.writeFileSync(path.join(dir, 'base_rates.json'), JSON.stringify({ built_at: iso(T0), min_n: 1, 'unlock:supply_shock': { n: 5, lower_vs_btc_d30: 3 }, 'unlock:big': { n: 20, lower_vs_btc_d30: 21 }, 'unlock:frac': { n: 25.5, lower_vs_btc_d30: 3 }, 'unlock:ok': { n: 20, lower_vs_btc_d30: 20 } }));
    const st = baseRates.createStore({ dir, now: () => T0, outcomes: null, log: () => {}, minN: 1 });
    eq('min_n 1 in the file and minN 1 in code still need n >= 20', st.get('unlock:supply_shock'), null);
    eq('lower > n / fractional n rejected; lower == n at n = 20 accepted', [st.get('unlock:big'), st.get('unlock:frac'), st.get('unlock:ok') && st.get('unlock:ok').n], [null, null, 20]);
    eq('rebuild never writes a min_n below 20', baseRates.rebuild({ rows: [], seed: null, now: T0, minN: 3 }).min_n, 20);
    const tsx = fs.readFileSync(APP + '/src/components/explain/Scenarios.tsx', 'utf8');
    check('rendering (card UI) also enforces n >= 20, integers, 0 <= x <= n', /MIN_CASES = 20/.test(tsx) && /b\.x <= b\.n/.test(tsx) && /validBaseRate\(s\.base_rate\)/.test(tsx));
  }

  console.log('— 6. refresh after a monthly rebuild (no new fills); stale rates cleared; history = completed cases');
  {
    const P = { BTC: 100, AAA: 10 };
    const dir = fs.mkdtempSync(path.join(tmp, 'rf-'));
    const clock = { t: Date.parse('2026-10-31T12:00:00Z') };
    const e = createEngine({ dir, now: () => clock.t, calendarPath: '', log: () => {}, maxPerHour: 100, priceFn: async (tk) => P[tk] ?? null, priceAtFn: async (tk) => P[tk] ?? null });
    e.rates.rebuildNow(); // October build, no seed
    const ev = e.consider(post('AAA', clock));
    await e.settled();
    const down = (x) => x.text.scenarios.find((s) => s.dir === 'down');
    check('card starts with the literal and no rate', down(e.get(ev.id)).base_rate === null && e.get(ev.id).text.uncertain.includes('Not enough comparable cases'));
    fs.writeFileSync(e.rates.seedFile, JSON.stringify({ 'unlock:supply_shock': { n: 236, lower_vs_btc_d30: 171, median_vs_btc_d30: -16.3, source: 'seed' } }));
    clock.t = Date.parse('2026-11-01T08:05:00Z'); // Nov 1, 03:05 ET: monthly rebuild; no outcome fill happens
    e.tick(); await e.settled();
    const g = e.get(ev.id);
    eq('after the monthly rebuild the live card shows Historically 171 of 236, literal gone', [down(g).base_rate && down(g).base_rate.x, down(g).base_rate && down(g).base_rate.n, g.text.uncertain.includes('Not enough comparable cases')], [171, 236, false]);
    check('and it was saved to disk', JSON.parse(fs.readFileSync(e.file, 'utf8')).find((x) => x.id === ev.id).text.scenarios.find((s) => s.dir === 'down').base_rate.n === 236);
  }
  {
    // stale-clearing proven on a card that stays live: rebuild drops the seed inside the 72 h window
    const dir = fs.mkdtempSync(path.join(tmp, 'rf2-'));
    const clock = { t: Date.parse('2026-11-30T20:00:00Z') };
    const e = createEngine({ dir, now: () => clock.t, calendarPath: '', log: () => {}, maxPerHour: 100, priceFn: async (tk) => ({ BTC: 100, AAA: 10 })[tk] ?? null, priceAtFn: async () => null });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(e.rates.seedFile, JSON.stringify({ 'unlock:supply_shock': { n: 236, lower_vs_btc_d30: 171, median_vs_btc_d30: -16.3, source: 'seed' } }));
    e.rates.rebuildNow();
    const ev = e.consider(post('AAA', clock));
    await e.settled();
    const down = (x) => x.text.scenarios.find((s) => s.dir === 'down');
    check('card created with the seeded rate', down(e.get(ev.id)).base_rate && down(e.get(ev.id)).base_rate.n === 236);
    fs.unlinkSync(e.rates.seedFile);
    clock.t = Date.parse('2026-12-01T08:05:00Z'); // Dec 1 03:05 ET, card is ~11 h old
    e.tick(); await e.settled();
    const g = e.get(ev.id);
    eq('seed gone + monthly rebuild: stale rate cleared, literal restored once, state still live', [down(g).base_rate, g.text.uncertain.filter((u) => u === 'Not enough comparable cases').length, g.state], [null, 1, 'live']);
  }
  {
    // history = completed cases only, same coin first
    const H1 = mkEngine({ BTC: 100, AAA: 10, BBB: 10, CCC: 10 });
    const logf = path.join(H1.dir, 'forward_log.jsonl');
    const r = (id, coin, status, t0, d30) => JSON.stringify({ event_id: id, category: 'unlock', subtype: 'supply_shock', coin, headline: 'h' + id, date: t0.slice(0, 10), t0, p0: 1, btc0: 1, d1: null, d7: null, d30, status });
    fs.mkdirSync(H1.dir, { recursive: true });
    fs.writeFileSync(logf, [r('open1', 'AAA', 'open', '2026-10-01T10:00:00.000Z', null), r('open2', 'AAA', 'open', '2026-10-01T11:00:00.000Z', null), r('np1', 'AAA', 'no_price', '2026-10-01T12:00:00.000Z', null), r('done1', 'BBB', 'done', '2026-09-01T10:00:00.000Z', { ret: -5, ret_vs_btc: -4 }), r('done2', 'AAA', 'done', '2026-08-01T10:00:00.000Z', { ret: 3, ret_vs_btc: 2 })].join('\n') + '\n');
    const hev = H1.e.consider(post('AAA', H1.clock));
    await H1.e.settled();
    eq('history lists only completed rows (open and no_price excluded), same coin first', hev.history.cases.map((c) => c.headline), ['hdone2', 'hdone1']);
  }

  console.log('— 7. CSS: light overrides come last; theme tokens instead of hard-coded dark colours; dark stays the default');
  {
    const css = fs.readFileSync(APP + '/src/app/globals.css', 'utf8');
    const lightAt = css.indexOf('[data-theme="light"] {');
    const lastRoot = css.lastIndexOf(':root {');
    check('the [data-theme="light"] token block comes after the last :root block', lightAt > lastRoot && lastRoot > 0, [lightAt, lastRoot]);
    check('one light-token block; the trailing :root (dark) still carries the defaults', css.split('[data-theme="light"] {').length === 2 && /--ex-bg: rgba\(15, 23, 42, 0\.55\)/.test(css.slice(lastRoot, lightAt)));
    const ruleOf = (sel) => { const i = css.lastIndexOf(sel); /* last = winning rule */ return css.slice(i, css.indexOf('}', i)); };
    check('title / heading / hover / legend rules use theme tokens', /var\(--ex-title\)/.test(ruleOf('.explain-card .ex-title')) && /var\(--ex-heading\)/.test(ruleOf('.explain-card .ex-heading')) && /var\(--ex-strong\)/.test(ruleOf('.explain-card .ex-scenario-sum:hover')) && /var\(--ex-legend-bg\)/.test(ruleOf('.devi-legend-item {')) && /var\(--ex-legend-hover\)/.test(ruleOf('.devi-legend-item:hover')));
    check('light block defines every new token', ['--ex-title', '--ex-heading', '--ex-strong', '--ex-legend-bg', '--ex-legend-hover', '--ex-legend-glow'].every((t) => css.slice(lightAt).includes(t + ':')));
  }
  done('p5_outcomes_review');
})();
