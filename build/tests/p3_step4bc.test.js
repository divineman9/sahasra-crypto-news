// Phase 3 step 4B/C: per-coin Google News tiers B (portfolio + top-100) and C (the rest, batched).
// No DB, no network: planner math, tier-B derivation, priority scheduling, runtime reservation,
// C batching, and state hygiene are all exercised through the adapter with injected request/now/
// stateFile (temp files).
process.chdir('D:/claude projects/crypto-news-terminal/app');
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NONCOIN_CACHE_FILE = path.join(os.tmpdir(), 'noncoin_test_4bc.json');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const T = require(APP + '/ingest/tickers.js');
const G = require(APP + '/ingest/adapters/gnews.js');
const CM = require(APP + '/ingest/coinMatch.js');

const tmp = (name) => path.join(os.tmpdir(), name);
const rm = (f) => { try { fs.unlinkSync(f); } catch (e) { /* ignore */ } };
const rfc = (t) => new Date(t).toUTCString();
const itemXml = (title, host, pub, name) =>
  `<item><title>${title} - ${name}</title><link>https://news.google.com/rss/articles/CBMi${Math.random().toString(36).slice(2)}</link><pubDate>${rfc(pub)}</pubDate><source url="https://www.${host}">${name}</source></item>`;
const rssXml = (items) => `<?xml version="1.0"?><rss><channel>${items.join('')}</channel></rss>`;
const emptyRss = rssXml([]);
const okText = () => ({ status: 200, text: emptyRss, json: () => ({}) });
function qOf(url) { return decodeURIComponent(new URL(url).searchParams.get('q')); }

(async () => {
  await T.loadUniverse(); // cached coins.json, no network — needed for real CoinGecko names below

  console.log('— planner (planIntervals) math');
  {
    const ivA = G.planIntervals({ nA: 49, nB: 0, nCRequests: 0, budget: 5000, tierAMin: 20 });
    eq('A only: A interval matches the unchanged 4A formula', ivA.A, G.tierAIntervalMin(49, 5000, 20));

    const ivAB = G.planIntervals({ nA: 50, nB: 100, nCRequests: 0, budget: 5000, tierAMin: 20 });
    eq('A+B: A interval unchanged by adding B', ivAB.A, G.tierAIntervalMin(50, 5000, 20));
    check('A+B: B interval finite and >= 60', Number.isFinite(ivAB.B) && ivAB.B >= 60, ivAB);

    const ivABC = G.planIntervals({ nA: 50, nB: 100, nCRequests: 125, budget: 5000, tierAMin: 20 });
    eq('A+B+C realistic case (nA=50,nB=100,nCReq=125,budget=5000): A=20 B=214 C=793', [ivABC.A, ivABC.B, ivABC.C], [20, 214, 793]);

    const ivSmall = G.planIntervals({ nA: 4000, nB: 100, nCRequests: 100, budget: 5000, tierAMin: 20 });
    eq('budget too small (tier A alone exhausts usable budget) -> B paused', ivSmall.B, Infinity);
    eq('budget too small -> C also paused', ivSmall.C, Infinity);
    check('budget too small -> A itself still finite (never starved/paused)', Number.isFinite(ivSmall.A), ivSmall.A);
  }

  console.log('— tier-B derivation (deriveTierB, pure)');
  {
    const rows = [
      { symbol: 'BTCUSDT', quoteVolume: '500000000' },
      { symbol: 'ETHUSDT', quoteVolume: '300000000' },
      { symbol: '1000PEPEUSDT', quoteVolume: '50000000' },
      { symbol: 'HUTUSDT', quoteVolume: '999999999' }, // isNonCoin (seeded) -> excluded
      { symbol: '币安人生USDT', quoteVolume: '1' }, // non-ASCII base after stripping quote -> excluded
      { symbol: 'ADAUSDT_250926', quoteVolume: '100000000' }, // dated/quarterly contract -> excluded
      { symbol: 'SOLUSDC', quoteVolume: '20000000' },
      { symbol: 'XRPUSDT', quoteVolume: '10000000' },
    ];
    eq('sorts by quoteVolume desc, strips quote+prefix, drops nonCoin/non-ASCII/dated, top N', G.deriveTierB(rows, { n: 3 }), ['BTC', 'ETH', 'PEPE']);
    eq('top N=100 default keeps the rest in volume order', G.deriveTierB(rows), ['BTC', 'ETH', 'PEPE', 'SOL', 'XRP']);
    const dupe = [{ symbol: 'DOGEUSDT', quoteVolume: '5' }, { symbol: 'DOGEUSDC', quoteVolume: '8' }];
    eq('duplicate base across quotes keeps the max volume (still counted once)', G.deriveTierB(dupe), ['DOGE']);
    eq('garbage/empty input never throws', [G.deriveTierB([]), G.deriveTierB(null), G.deriveTierB(undefined)], [[], [], []]);
  }

  console.log('— priority within a tick: A -> B -> C (most overdue first within a tier)');
  {
    const stateFile = tmp('gnews_4bc_priority.json'); rm(stateFile);
    const calls = [];
    const request = async (url) => { calls.push(url); return okText(); };
    const NOW = Date.parse('2026-09-25T12:00:00Z');
    const a = G.make({ getTierA: () => ['ZPA1'], getTierB: () => ['ZPB1'], getTierC: () => ['ZPC1'], request, now: () => NOW, stateFile, budget: 5000, tierAMin: 20 });
    await a.run();
    eq('one due coin per tier -> exactly 3 requests', calls.length, 3);
    check('request order is A, then B, then C', qOf(calls[0]).includes('ZPA1') && qOf(calls[1]).includes('ZPB1') && qOf(calls[2]).includes('ZPC1'), calls.map(qOf));
  }

  console.log('— F1 fix: runtime reservation (`used + aRemainingToday + 1 <= budget`), NOT the planner pause');
  {
    // budget=1000, nA=6, tierAMin=20 -> A interval = max(20, ceil(1440*6/(0.9*1000))) = 20m (both
    // tiers stay FINITE — this is deliberately not the "planner pause" case covered above).
    // 10 minutes left in the UTC day -> aRemainingToday = ceil(6*10/20) = 3.
    // reservation check before a B/C request: used + 3 + 1 <= 1000.
    const NOW = Date.UTC(2026, 8, 25, 23, 50, 0, 0);
    const far = NOW + 999999999;
    const ivA = G.planIntervals({ nA: 6, nB: 1, nCRequests: 0, budget: 1000, tierAMin: 20 });
    eq('sanity: both A and B intervals are finite here (not a planner pause)', [ivA.A, Number.isFinite(ivA.B)], [20, true]);

    function run(used) {
      const stateFile = tmp('gnews_4bc_reserve_' + used + '.json');
      fs.writeFileSync(stateFile, JSON.stringify({
        day: '2026-09-25',
        used,
        coins: {
          ZR1: { nextDueAt: NOW - 1, lastOkAt: 0, firstDone: true, tier: 'A', lastListedAt: NOW },
          ZR2: { nextDueAt: far, lastOkAt: 0, firstDone: true, tier: 'A', lastListedAt: NOW },
          ZR3: { nextDueAt: far, lastOkAt: 0, firstDone: true, tier: 'A', lastListedAt: NOW },
          ZR4: { nextDueAt: far, lastOkAt: 0, firstDone: true, tier: 'A', lastListedAt: NOW },
          ZR5: { nextDueAt: far, lastOkAt: 0, firstDone: true, tier: 'A', lastListedAt: NOW },
          ZR6: { nextDueAt: far, lastOkAt: 0, firstDone: true, tier: 'A', lastListedAt: NOW },
          ZRB1: { nextDueAt: NOW - 1, lastOkAt: 0, firstDone: true, tier: 'B', lastListedAt: NOW },
        },
      }));
      const calls = [];
      const request = async (url) => { calls.push(url); return okText(); };
      const a = G.make({ getTierA: () => ['ZR1', 'ZR2', 'ZR3', 'ZR4', 'ZR5', 'ZR6'], getTierB: () => ['ZRB1'], getTierC: () => [], request, now: () => NOW, stateFile, budget: 1000, tierAMin: 20 });
      return a.run().then(() => calls);
    }

    const calls995 = await run(995);
    eq('used=995: 995+3+1<=1000 -> A AND B both issued', calls995.length, 2);
    check('...A first, then B', qOf(calls995[0]).includes('ZR1') && qOf(calls995[1]).includes('ZRB1'), calls995.map(qOf));

    const calls996 = await run(996);
    eq('used=996: after A (->997), 997+3+1=1001>1000 -> B reserved away, A only', calls996.length, 1);
    check('...the one request was tier A', qOf(calls996[0]).includes('ZR1'));

    const calls997 = await run(997);
    eq('used=997: after A (->998), 998+3+1=1002>1000 -> B reserved away, A only', calls997.length, 1);
  }

  console.log('— C batching: default-record coins batched 4/request, curated coins get their own query');
  {
    const NOW = Date.parse('2026-09-25T12:00:00Z');
    const zc = Array.from({ length: 9 }, (_, i) => 'ZC' + (i + 1));

    const stateFile1 = tmp('gnews_4bc_c9.json'); rm(stateFile1);
    const calls1 = [];
    const request1 = async (url) => {
      calls1.push(url);
      const q = qOf(url);
      if (q.includes('"ZC1"')) {
        return {
          status: 200,
          text: rssXml([
            itemXml('ZC1 ZC2 collab rally', 'coindesk.com', NOW - 3600e3, 'CoinDesk'),
            itemXml('totally unrelated headline about the weather', 'coindesk.com', NOW - 3600e3, 'CoinDesk'),
          ]),
          json: () => ({}),
        };
      }
      return okText();
    };
    const a1 = G.make({ getTierA: () => [], getTierB: () => [], getTierC: () => zc, request: request1, now: () => NOW, stateFile: stateFile1, budget: 5000, tierAMin: 20 });
    const out1 = await a1.run();
    eq('9 default-record C coins -> 3 requests', calls1.length, 3);
    const namesPerCall = calls1.map((u) => (qOf(u).match(/"/g) || []).length / 2);
    eq('batches of <=4 names: 4, 4, 1', namesPerCall, [4, 4, 1]);
    eq('exact query shape for the first batch', qOf(calls1[0]), '("ZC1" OR "ZC2" OR "ZC3" OR "ZC4") crypto when:2d');
    const collab = out1.find((x) => x.title === 'ZC1 ZC2 collab rally');
    check('item mentioning two batch coins gets both hintTickers', collab && JSON.stringify([...collab.hintTickers].sort()) === JSON.stringify(['ZC1', 'ZC2']), collab);
    check('item matching none of the batch is dropped', !out1.some((x) => /unrelated headline/.test(x.title)));

    const stateFile2 = tmp('gnews_4bc_ccurated.json'); rm(stateFile2);
    const calls2 = [];
    const request2 = async (url) => { calls2.push(url); return okText(); };
    const a2 = G.make({ getTierA: () => [], getTierB: () => [], getTierC: () => ['QNT'], request: request2, now: () => NOW, stateFile: stateFile2, budget: 5000, tierAMin: 20 });
    await a2.run();
    eq('curated C coin gets its own query, not the OR-batch wrapper', qOf(calls2[0]), CM.getRec('QNT').query + ' when:2d');
  }

  console.log('— GNEWS_TIERS="A" behaves exactly like 4A (tier A only)');
  {
    const stateFile = tmp('gnews_4bc_tiersA.json'); rm(stateFile);
    let bCalled = false, cCalled = false;
    const calls = [];
    const request = async (url) => { calls.push(url); return okText(); };
    const NOW = Date.parse('2026-09-25T12:00:00Z');
    const a = G.make({
      getTierA: () => ['ENA'],
      getTierB: () => { bCalled = true; return ['SHOULD_NOT_APPEAR']; },
      getTierC: () => { cCalled = true; return ['ALSO_NOT_APPEAR']; },
      request, now: () => NOW, stateFile, budget: 5000, tierAMin: 20, tiers: 'A',
    });
    await a.run();
    eq('only the tier-A request is issued', calls.length, 1);
    check('tier-A query + when:7d backfill (same as 4A)', /when%3A7d/.test(calls[0]) && qOf(calls[0]) === CM.getRec('ENA').query + ' when:7d', calls[0]);
    check('getTierB/getTierC are never even invoked when GNEWS_TIERS=A', !bCalled && !cCalled);
  }

  console.log('— state hygiene: 4A backward compat, tier recorded, 7-day pruning, no write when unchanged');
  {
    const stateFile = tmp('gnews_4bc_hygiene.json');
    const NOW = Date.parse('2026-09-25T12:00:00Z');
    const day = new Date(NOW).toISOString().slice(0, 10);
    const initial = {
      day,
      used: 10,
      coins: {
        LEGACY: { nextDueAt: NOW + 999999999, lastOkAt: NOW - 1000, firstDone: true }, // 4A-format: no tier/lastListedAt
        STALE: { nextDueAt: 0, lastOkAt: 0, firstDone: false, tier: 'C', lastListedAt: NOW - 8 * 86400000 }, // inactive 8d
        RECENT: { nextDueAt: 0, lastOkAt: 0, firstDone: false, tier: 'C', lastListedAt: NOW - 3 * 86400000 }, // inactive 3d
        NOMARK: { nextDueAt: 0, lastOkAt: 0, firstDone: false }, // legacy, inactive, no marker at all
      },
    };
    fs.writeFileSync(stateFile, JSON.stringify(initial));
    const a = G.make({ getTierA: () => ['LEGACY'], getTierB: () => [], getTierC: () => [], request: async () => okText(), now: () => NOW, stateFile, budget: 5000, tierAMin: 20 });
    await a.run();
    let st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    check('4A-format entry loads fine and gains tier + lastListedAt', st.coins.LEGACY && st.coins.LEGACY.tier === 'A' && typeof st.coins.LEGACY.lastListedAt === 'number', st.coins.LEGACY);
    eq('its existing nextDueAt/firstDone/lastOkAt are preserved', [st.coins.LEGACY.nextDueAt, st.coins.LEGACY.firstDone, st.coins.LEGACY.lastOkAt], [initial.coins.LEGACY.nextDueAt, true, NOW - 1000]);
    check('inactive coin, unseen for > 7 days -> pruned', !st.coins.STALE);
    check('inactive coin, unseen for < 7 days -> kept', !!st.coins.RECENT);
    check('legacy inactive entry with no marker at all -> grace period, kept + gains a marker', st.coins.NOMARK && typeof st.coins.NOMARK.lastListedAt === 'number');

    // second run, nothing due and nothing changed since -> must NOT write the state file
    const origWrite = fs.writeFileSync;
    let writeCount = 0;
    fs.writeFileSync = function (...args) { writeCount += 1; return origWrite.apply(fs, args); };
    await a.run();
    fs.writeFileSync = origWrite;
    eq('no write when nothing changed (steady-state tick)', writeCount, 0);
  }

  console.log('— 429 rethrown unchanged, nextDueAt not advanced for anyone this tick, `used` persisted');
  {
    const stateFile = tmp('gnews_4bc_429.json'); rm(stateFile);
    let n = 0;
    const request = async () => {
      n += 1;
      if (n === 2) { const e = new Error('HTTP 429'); e.name = 'HttpError'; e.status = 429; e.retryAfterMs = 5000; throw e; }
      return okText();
    };
    const NOW = Date.parse('2026-09-25T12:00:00Z');
    const a = G.make({ getTierA: () => ['ZE1', 'ZE2'], getTierB: () => [], getTierC: () => [], request, now: () => NOW, stateFile, budget: 5000, tierAMin: 20 });
    let err = null;
    try { await a.run(); } catch (e) { err = e; }
    check('the SAME HttpError propagates with status + retryAfterMs', err && err.status === 429 && err.retryAfterMs >= 5000, err);
    const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    eq('used=2 persisted; neither coin advanced past its initial nextDueAt', [st.used, st.coins.ZE1.nextDueAt, st.coins.ZE2.nextDueAt], [2, 0, 0]);
  }

  console.log('— B1 fix: promotion to a higher-priority tier resets nextDueAt to due-immediately');
  {
    const stateFile = tmp('gnews_4bc_promo_ca.json'); rm(stateFile);
    const calls = [];
    const request = async (u) => { calls.push(u); return okText(); };
    let NOW = Date.parse('2026-09-25T12:00:00Z');
    let tierAList = [], tierCList = ['ZP1'];
    const a = G.make({ getTierA: () => tierAList, getTierB: () => [], getTierC: () => tierCList, request, now: () => NOW, stateFile, budget: 5000, tierAMin: 20 });
    await a.run(); // fetched as C; nextDueAt pushed out to the (hours-away) C interval
    eq('fetched once, as tier C', calls.length, 1);
    let st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    check('ZP1 nextDueAt pushed far out (C interval, not due again soon)', st.coins.ZP1.nextDueAt > NOW + 60 * 60000, st.coins.ZP1);
    eq('firstDone set after the C fetch (some recent coverage now exists)', st.coins.ZP1.firstDone, true);

    // promote: it becomes a live setup (tier A) a minute later
    tierAList = ['ZP1']; tierCList = [];
    NOW += 61000;
    await a.run();
    eq('promoted C -> A: refetched on the very next tick (not stuck on the old C nextDueAt)', calls.length, 2);
    check('...and the request was for ZP1, at when:2d (firstDone stays true across the promotion, see B1 note)', qOf(calls[1]).includes('ZP1') && qOf(calls[1]).includes('when:2d'), calls[1]);
    st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    eq('tier recorded as A after promotion', st.coins.ZP1.tier, 'A');
  }
  {
    // B -> A promotion behaves the same way
    const stateFile = tmp('gnews_4bc_promo_ba.json'); rm(stateFile);
    const calls = [];
    const request = async (u) => { calls.push(u); return okText(); };
    let NOW = Date.parse('2026-09-25T12:00:00Z');
    let tierAList = [], tierBList = ['ZP2'];
    const a = G.make({ getTierA: () => tierAList, getTierB: () => tierBList, getTierC: () => [], request, now: () => NOW, stateFile, budget: 5000, tierAMin: 20 });
    await a.run();
    let st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    check('ZP2 nextDueAt pushed out to the B interval', st.coins.ZP2.nextDueAt > NOW + 30 * 60000, st.coins.ZP2);
    tierAList = ['ZP2']; tierBList = [];
    NOW += 61000;
    await a.run();
    eq('promoted B -> A: refetched on the very next tick', calls.length, 2);
    check('...request was for ZP2', qOf(calls[1]).includes('ZP2'));
  }
  {
    // demotion needs nothing: nextDueAt stays put, no extra (wasted) request fires
    const stateFile = tmp('gnews_4bc_demote.json'); rm(stateFile);
    const calls = [];
    const request = async (u) => { calls.push(u); return okText(); };
    let NOW = Date.parse('2026-09-25T12:00:00Z');
    let tierAList = ['ZP3'], tierCList = [];
    const a = G.make({ getTierA: () => tierAList, getTierB: () => [], getTierC: () => tierCList, request, now: () => NOW, stateFile, budget: 5000, tierAMin: 20 });
    await a.run();
    let st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const dueAfterA = st.coins.ZP3.nextDueAt;
    check('due date pushed out after the A fetch', dueAfterA > NOW);
    tierAList = []; tierCList = ['ZP3']; // demoted A -> C
    NOW += 61000;
    await a.run();
    eq('demotion: no extra request fired (not due yet, per its existing schedule)', calls.length, 1);
    st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    eq('nextDueAt unchanged by the demotion itself', st.coins.ZP3.nextDueAt, dueAfterA);
    eq('tier recorded as C after demotion', st.coins.ZP3.tier, 'C');
  }

  console.log('— B2/F3 fix: default-record getRec/matchCoin no longer tags on generic English words');
  {
    const negatives = [
      ['GAS', 'Ethereum gas fees drop to record low as network activity cools'],
      ['SAFE', 'Is it safe to keep crypto on Binance? Experts weigh in'],
      ['SIGN', 'Trump to sign crypto market structure bill next week'],
      ['SPACE', 'Crypto space braces for volatility after CPI print'],
      ['CAP', 'Bitcoin market cap tops $2 trillion'],
      ['GENIUS', 'GENIUS Act stablecoin bill passes Senate'],
      ['AB', 'AB InBev to accept crypto payments'],
      ['MAGIC', 'No magic bullet for crypto tax, says IRS official'],
      ['FLOW', 'Bitcoin ETF flow turns negative for third day'],
      ['FLOW', 'Flow of stablecoins onto exchanges hits monthly high'],
    ];
    for (const [b, t] of negatives) {
      eq(`default-record ${b} no longer matches a generic headline`, CM.matchCoin(t, b, CM.getRec(b)), false);
    }
    eq('batch GAS+SAFE+FLOW+SPARK on a garbage title now matches nothing (was all 4 before the fix)',
      ['GAS', 'SAFE', 'FLOW', 'SPARK'].filter((b) => CM.matchCoin('Is it safe to pay high gas fees? Stablecoin flow could spark a rally', b, CM.getRec(b))), []);

    // Round-2 fix: `name.toUpperCase() !== b` dropped the name weak-entry entirely whenever it
    // equalled the ticker ignoring case ("Bonk"/BONK, "Pendle"/PENDLE, "Morpho"/MORPHO, ...) —
    // the ticker-form weak entry is uppercase-only, so it never matched the headline's natural
    // mixed-case spelling, collapsing recall to $SYM/pair only for ~56 top-500 coins. Fixed to an
    // exact (case-sensitive) compare, so "Bonk" !== "BONK" is still pushed as its own weak word.
    const recallPositives = [
      ['BONK', 'Bonk rallies 20% as Solana memecoins surge'],
      ['PENDLE', 'Pendle TVL hits record high'],
      ['MORPHO', 'Morpho launches v2 lending protocol'],
    ];
    for (const [b, t] of recallPositives) {
      check(`round-2 recall fix: default-record ${b} matches its real (mixed-case) CoinGecko name in context`, CM.matchCoin(t, b, CM.getRec(b)), { name: CM.getRec(b).name, weak: CM.getRec(b).weak });
    }
    // These names were newly added to tickers.js NAME_BLOCK for round 2 (they are also ordinary
    // English words) specifically so the exact-compare fix above doesn't reopen the round-1 hole.
    const recallNegatives = [
      ['RAIN', 'Rain of liquidations hits crypto perps'],
      ['SUSHI', 'Sushi restaurant accepts crypto payments'],
      ['ORCA', 'Orca whales spotted near crypto conference'],
    ];
    for (const [b, t] of recallNegatives) {
      eq(`round-2 NAME_BLOCK addition: default-record ${b} still does NOT match a generic headline`, CM.matchCoin(t, b, CM.getRec(b)), false);
    }
    eq('a coin whose CoinGecko name literally IS the ticker (KAITO) stays ticker-only, no duplicate weak entry', CM.getRec('KAITO').weak, ['KAITO']);
    check('$GAS still matches via the hard $SYM rule (unaffected by the fix)', CM.matchCoin('$GAS surges 20% in an hour', 'GAS', CM.getRec('GAS')));
    check('multiword default name still matches case-insensitively (Shiba Inu, real CoinGecko name)',
      CM.matchCoin('Shiba Inu rallies as meme season returns', 'SHIB', CM.getRec('SHIB')) && !CM.listBases().includes('SHIB'));
    check('uppercase-ticker + crypto-context style still works for a non-blocked default ticker',
      CM.matchCoin('ZQPOS token listed on Upbit', 'ZQPOS', CM.getRec('ZQPOS')));
    eq('regression: existing "ZC1 ZC2 collab rally" batch fixture still matches', CM.matchCoin('ZC1 ZC2 collab rally', 'ZC1', CM.getRec('ZC1')), true);

    eq('F3: cleanName strips a trailing CoinGecko disambiguation parenthetical', CM.cleanName('POL (ex-MATIC)'), 'POL');
    check('F3: getRec("POL").name is the cleaned ticker (no stray parenthetical/quotes; query wraps it in exactly one pair of quotes)',
      CM.getRec('POL').name === 'POL' && CM.getRec('POL').query === '"POL" crypto', CM.getRec('POL'));
  }

  console.log('— F2 fix: validBase excludes tickers.js EXCLUDE (stablecoin/quote) bases from tiers B/C');
  {
    const stateFile = tmp('gnews_4bc_exclude.json'); rm(stateFile);
    const calls = [];
    const request = async (u) => { calls.push(u); return okText(); };
    const NOW = Date.parse('2026-09-25T12:00:00Z');
    const a = G.make({ getTierA: () => [], getTierB: () => ['USDC', 'DAI', 'ZOK1'], getTierC: () => ['USD1', 'FDUSD', 'ZOK2'], request, now: () => NOW, stateFile, budget: 5000, tierAMin: 20 });
    await a.run();
    eq('only the two non-EXCLUDE bases were fetched (USDC/DAI/USD1/FDUSD dropped)', calls.length, 2);
    check('...ZOK1 (tier B) and ZOK2 (tier C) are the ones that went through', calls.some((u) => qOf(u).includes('ZOK1')) && calls.some((u) => qOf(u).includes('ZOK2')), calls.map(qOf));
  }

  console.log('— F4 fix: multi-coin batch hintTickers ordered by match strength (strong evidence first)');
  {
    const stateFile = tmp('gnews_4bc_strength.json'); rm(stateFile);
    const NOW = Date.parse('2026-09-25T12:00:00Z');
    const calls = [];
    // ZW1 is listed FIRST in the batch but only matches WEAKLY (bare ticker + crypto context);
    // ZS1 is listed SECOND but matches STRONGLY ($SYM). Strength ordering must put ZS1 first.
    const request = async (u) => {
      calls.push(u);
      return { status: 200, text: rssXml([itemXml('ZW1 news: something mentions $ZS1 directly and ZW1 token trades', 'coindesk.com', NOW - 3600e3, 'CoinDesk')]), json: () => ({}) };
    };
    const a = G.make({ getTierA: () => [], getTierB: () => [], getTierC: () => ['ZW1', 'ZS1'], request, now: () => NOW, stateFile, budget: 5000, tierAMin: 20 });
    const out = await a.run();
    eq('one batch request covering both', calls.length, 1);
    check('item present', out.length === 1, out);
    eq('hintTickers has the strong ($SYM) match first, weak (bare+context) match second, despite batch order [ZW1,ZS1]', out[0] && out[0].hintTickers, ['ZS1', 'ZW1']);
  }

  done('p3_step4bc');
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
