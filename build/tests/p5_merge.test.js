// P5 P1: evolving-event merge (§4.3): storyId attach, timeline kinds, rev bump, facts recompute, >24h -> new event.
const fs = require('fs'), os = require('os'), path = require('path');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const { createEngine } = require(APP + '/ingest/explain/events.js');

const T0 = Date.parse('2026-10-02T13:00:00Z');
const clock = { t: T0 };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p5merge-'));
const e = createEngine({ dir, now: () => clock.t, calendarPath: '', log: () => {} });
let n = 0;
const P = (o) => Object.assign({ id: 'm' + ++n, title: 't', category: 'unlock', importance: 80, sentiment: 'bearish', kind: 'news', sourceTier: 3, sourceDomain: 'blog.example.com', sourceName: 'rss:x', exchange: null, tickers: ['STO'], flags: null, unlockPct: 5.1, unlockPctBasis: 'circulating', publishedAt: new Date(clock.t - 60e3), storyId: 's-1', userLabel: null }, o);

console.log('— attach by storyId / same key');
const a = e.consider(P({ title: 'STO unlocks 5.1% of circulating supply Oct 2', sourceTier: 3 }));
eq('created rev 1 with one timeline row', [a.rev, a.timeline.length, a.timeline[0].kind], [1, 1, 'first']);
eq('first event has no what-changed line', a.last_change, null);
clock.t += 3600e3;
const b = e.consider(P({ title: 'StakeStone STO unlock: 5.4% of circulating supply on Oct 2', unlockPct: 5.4, sourceTier: 2, sourceDomain: 'theblock.co', storyId: 's-1', publishedAt: new Date(clock.t - 1000) }));
check('same event attached, no 2nd card', b.id === a.id && e._events().length === 1, e._events().length);
eq('rev bumped', b.rev, 2);
eq('timeline kind update', b.timeline[1].kind, 'update');
eq('max pct across sources', b.facts.unlock_pct_circ, 5.4);
eq('headline from highest-tier source', [b.facts.source, b.facts.source_tier], ['theblock.co', 2]);
check('updated_at moved', Date.parse(b.updated_at) > Date.parse(b.created_at), b.updated_at);
eq('duplicate post id is a no-op', e.consider(Object.assign({}, P({ title: 'STO unlock again' }), { id: b.post_ids[1] })).rev, 2);

eq('what-changed line on merge (rev, numbers from facts only)', [b.last_change.rev, b.last_change.text], [2, 'Rev 2: unlock size now 5.4% (was 5.1%).']);
console.log('— attach by storyId when the ticker differs');
const viaStory = e.consider(P({ title: 'Unlock coverage without ticker', tickers: ['STO'], storyId: 's-1', unlockPct: 5.2 }));
eq('merged (still one event)', [viaStory.id === a.id, e._events().length], [true, 1]);

console.log('— confirmation kind + evidence recompute');
clock.t += 3600e3;
const c = e.consider(P({ title: 'Binance: StakeStone unlock notice', kind: 'exchange', exchange: 'Binance', sourceTier: 1, sourceDomain: 'binance.com', publishedAt: new Date(clock.t - 1000) }));
eq('official/exchange source -> confirmation', c.timeline[c.timeline.length - 1].kind, 'confirmation');
eq('evidence now Strong', c.evidence.level, 'Strong');
check('evidence reason has ET timestamp', / ET$/.test(c.evidence.reason), c.evidence.reason);

console.log('— hack: denial kind, restrictions union');
const h1 = e.consider(P({ id: 'h1', title: 'Protocol Q hacked, $5M drained', category: 'hack', unlockPct: null, tickers: ['QQQ'], storyId: 'h-1', sourceTier: 2, sourceDomain: 'theblock.co', sentiment: 'bearish' }));
eq('theft subtype with amount', [h1.subtype, h1.facts.amount_usd], ['theft', 5e6]);
const h2 = e.consider(P({ id: 'h2', title: 'Exchange pauses all withdrawals after Protocol Q hack', category: 'hack', unlockPct: null, tickers: ['QQQ'], storyId: 'h-1', flags: { depeg: false, freeze: true }, sourceTier: 2, sourceDomain: 'coindesk.com' }));
check('freeze restriction unioned in', h2.facts.restrictions.some((r) => r.kind === 'withdrawals_paused'), h2.facts.restrictions);
const h3 = e.consider(P({ id: 'h3', title: 'Protocol Q says it was not hacked, denies exploit', category: 'hack', unlockPct: null, tickers: ['QQQ'], storyId: 'h-1', sourceTier: 2, sourceDomain: 'x.com' }));
eq('denial kind', h3.timeline[h3.timeline.length - 1].kind, 'denial');
eq('denial -> evidence Limited', h3.evidence.level, 'Limited');
const h4 = e.consider(P({ id: 'h4', title: 'Protocol Q hacked, $7M drained', category: 'hack', unlockPct: null, tickers: ['QQQ'], storyId: 'h-1', sourceTier: 2, sourceDomain: 'cnbc.com' }));
eq('max amount_usd across sources', h4.facts.amount_usd, 7e6);
check('text re-rendered with merged amount', /\$7 million/.test(h4.text.what), h4.text.what);

console.log('— >24h -> new event, earlier first in history');
clock.t += 30 * 3600e3; // next ET day
const d = e.consider(P({ id: 'late', title: 'STO unlocks 6% of circulating supply Oct 3', unlockPct: 6, storyId: 's-1', publishedAt: new Date(clock.t - 1000) }));
check('new event id (new day), not a merge', d.id !== a.id && d.rev === 1, d.id);
eq('history lists the earlier STO unlock', [d.history.cases.length, d.history.cases[0].coin, d.history.note], [1, 'STO', null]);
eq('first event untouched', e.get(a.id).rev >= 3, true);
done('p5_merge');
