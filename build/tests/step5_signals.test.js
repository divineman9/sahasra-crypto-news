// Step 5 (pure part): buildSnapshot — frozen signal-time news + events snapshot. No DB needed.
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const { buildSnapshot } = require(APP + '/ingest/signalSnapshot.js');
const now = Date.parse('2026-09-25T12:00:00Z'), h = 3600e3, iso = (t) => new Date(t).toISOString();
const it = (id, category, sentiment, agoH) => ({ id, title: 'T ' + id, url: 'u', category, importance: 85, sentiment, source: 's', storyId: id, publishedAt: iso(now - agoH * h), firstSeenAt: iso(now - agoH * h) });
const hack = it('h1', 'hack', 'bearish', 2), list = it('l1', 'listing', 'bullish', 1), old = it('o1', 'listing', 'bullish', 50);
const news = { schema: 2, asof_ms: now - 5000, health: { known: true, ok: true }, flags: {
  HYPE: { risk: hack, catalyst: list, other: null, items: [hack, list] },
  PEPE: { risk: null, catalyst: old, other: null, items: [old] } } };
const events = { asof_ms: now - 60000,
  risk: { HYPEUSDT: { LONG: { level: 'red', reasons: ['🔴 insider unlock 2.6% in 1d'] }, SHORT: { level: 'amber', reasons: ['🟢 tailwind'] } } },
  badges: { HYPEUSDT: ['UNLOCK 2.6% in 1d'] },
  unlocks_upcoming: [{ symbol: 'HYPE', name: 'Hyperliquid', ts_ms: now + 86400e3, pct_circ: 0.026 }, { symbol: 'TIA', ts_ms: now + 1 }] };
const setup = (o) => ({ symbol: 'HYPEUSDT', tf: '1h', direction: 'UP', stage: 'BAR1_CONFIRMED', bar1_t: 1790300000000, high_vol: true, ...o });
const snap = (o, n = news, e = events, seen = now - 30000) => buildSnapshot({ setup: setup(o), bbwAsof: iso(now - 2000), bbwAsofMs: now - 2000, news: n, events: e, now, watcherSeenAt: seen });

const s = snap({});
check('BAR1 signal produces a snapshot', !!s);
eq('key = symbol|tf|bar1_t|direction|stage', s.key, 'HYPEUSDT|1h|1790300000000|UP|BAR1_CONFIRMED');
eq('base stripped', s.base, 'HYPE');
eq('coverage news', s.coverage, 'news');
eq('newsIds frozen (risk + catalyst)', [...s.newsIds].sort(), ['h1', 'l1']);
eq('riskClass = risk (hack beats listing)', s.riskClass, 'risk');
check('items carry class + publishedAt', s.newsItems.every((x) => x.class && x.publishedAt));
eq('LONG signal gets the LONG event level', s.eventLevel, 'red');
eq('SHORT signal gets the SHORT event level', snap({ direction: 'DOWN' }).eventLevel, 'amber');
eq('badges copied', s.eventBadges, ['UNLOCK 2.6% in 1d']);
eq('scheduled unlocks kept separately (HYPE only)', (s.scheduled || []).map((x) => x.symbol), ['HYPE']);
eq('bar1T is BigInt', typeof s.bar1T, 'bigint');
eq('1000-prefixed symbol base', snap({ symbol: '1000PEPEUSDT' }).base, 'PEPE');
eq('only a 50 h-old item → coverage none', snap({ symbol: '1000PEPEUSDT' }).coverage, 'none');
eq('coin without flags → none', snap({ symbol: 'ETHUSDT' }).coverage, 'none');
eq('stale news file (>60 s) → unknown', snap({}, { ...news, asof_ms: now - 120000 }).coverage, 'unknown');
eq('degraded health → unknown', snap({}, { ...news, health: { known: true, ok: false } }).coverage, 'unknown');
eq('no news file → unknown', snap({}, null).coverage, 'unknown');
eq('old schema → unknown', snap({}, { ...news, schema: 1 }).coverage, 'unknown');
eq('unknown coverage still records visible items', [...snap({}, { ...news, asof_ms: now - 120000 }).newsIds].sort(), ['h1', 'l1']);
eq('BASING is not a signal', snap({ stage: 'BASING' }), null);
eq('1m is not a signal', snap({ tf: '1m' }), null);
eq('no events file → nulls, empty badges', [snap({}, news, null).eventLevel, snap({}, news, null).eventBadges], [null, []]);

// --- Fable step-5 review additions
eq('seen 30 s ago → not late, coverage news', [s.late, s.coverage], [false, 'news']);
check('lagMs recorded', s.lagMs >= 29000 && s.lagMs <= 31000, s.lagMs);
const lateSnap = snap({}, news, events, now - 2 * h);
eq('seen 2 h ago → late, coverage unknown', [lateSnap.late, lateSnap.coverage], [true, 'unknown']);
eq('late still records the visible items (newsItems)', lateSnap.newsItems.map((x) => x.id).sort(), ['h1', 'l1']);
eq('never seen by the watcher → late/unknown', [snap({}, news, events, null).late, snap({}, news, events, null).coverage], [true, 'unknown']);
const r = (i) => it('r' + i, 'hack', 'bearish', 1 + i / 10);
const five = { ...news, flags: { HYPE: { count: 6, risk: r(1), catalyst: it('c1', 'listing', 'bullish', 1), other: null, items: [r(1), r(2), r(3), r(4), r(5)] } } };
const s5 = snap({}, five);
check('single-object catalyst pick included even when items[] is full of risk', s5.newsIds.includes('c1'), s5.newsIds);
eq('newsCount = total distinct stories', s5.newsCount, 6);
eq('health unknown → newsHealthOk null', snap({}, { ...news, health: { known: false } }).newsHealthOk, null);
eq('health known ok → true', s.newsHealthOk, true);
const ancient = snap({}, { ...news, asof_ms: now - 40 * 86400e3 });
check('ages clamped to Int32', ancient.newsAgeMs <= 2147483647, ancient.newsAgeMs);
eq('signalAsof from bbwAsofMs', s.signalAsof.getTime(), now - 2000);
eq('future item (>5 min) excluded', snap({}, { ...news, flags: { HYPE: { risk: null, catalyst: null, other: null, items: [{ ...list, id: 'fut', publishedAt: iso(now + 20 * 60e3) }] } } }).coverage, 'none');
// --- Astra B6: only news observed by the signal time counts
const seen = now - 120000;
const after = { ...list, id: 'a1', publishedAt: iso(seen + 60000), firstSeenAt: iso(seen + 60000) };
const sAfter = snap({}, { ...news, flags: { HYPE: { risk: null, catalyst: after, other: null, items: [after] } } }, events, seen);
eq('news first seen AFTER the signal → coverage none, riskClass null', [sAfter.coverage, sAfter.riskClass], ['none', null]);
eq('... not in newsIds', sAfter.newsIds, []);
eq('... but kept in newsItems with atSignal=false', sAfter.newsItems.map((x) => [x.id, x.atSignal]), [['a1', false]]);
const before = { ...list, id: 'b1', publishedAt: iso(seen - 60000), firstSeenAt: iso(seen - 60000) };
const sBefore = snap({}, { ...news, flags: { HYPE: { risk: null, catalyst: before, other: null, items: [before] } } }, events, seen);
eq('news first seen BEFORE the signal → coverage news, atSignal=true', [sBefore.coverage, sBefore.newsIds, sBefore.newsItems[0].atSignal], ['news', ['b1'], true]);
const noSeen = { ...list, id: 'n1', firstSeenAt: undefined };
eq('item without firstSeenAt cannot establish availability → none', snap({}, { ...news, flags: { HYPE: { risk: null, catalyst: noSeen, other: null, items: [noSeen] } } }).coverage, 'none');
check('snapshot carries firstSeenAt = build time (stable across retries)', s.firstSeenAt instanceof Date && s.firstSeenAt.getTime() === now, s.firstSeenAt);
done('step5_signals');
