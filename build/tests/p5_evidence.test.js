// P5 P1: evidence meter rules (§4.7).
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const ev = require(APP + '/ingest/explain/evidence.js');

const post = (o) => Object.assign({ kind: 'news', sourceTier: 2, sourceDomain: 'theblock.co', sourceName: 'rss:theblock' }, o);
const row = (p, kind, ts) => Object.assign({ ts: ts || '2026-10-02T18:40:00Z', kind: kind || 'first' }, ev.sourceInfo(p));
const facts = { exchange: 'Binance', per_source_pct: null };

eq('Strong: exchange announcement + 2 news domains', ev.compute([row(post({ kind: 'exchange', sourceTier: 1, sourceDomain: 'binance.com' })), row(post({}), 'update'), row(post({ sourceDomain: 'coindesk.com' }), 'update')], facts).level, 'Strong');
const s = ev.compute([row(post({ kind: 'exchange', sourceTier: 1, sourceDomain: 'binance.com' })), row(post({}), 'update'), row(post({ sourceDomain: 'coindesk.com' }), 'update'), row(post({ sourceDomain: 'decrypt.co' }), 'update')], facts);
eq('Strong reason literal (with ET)', s.reason, 'Strong — Binance announcement + 3 news sources, last confirmed 2:40 PM ET');
eq('sources / primary / latest_ts', [s.sources, s.primary, s.latest_ts], [4, true, '2026-10-02T18:40:00.000Z']);
eq('Moderate: one tier-2 publisher', ev.compute([row(post({}))], facts).level, 'Moderate');
check('Moderate reason says no official confirmation', /no official confirmation yet/.test(ev.compute([row(post({}))], facts).reason));
eq('Moderate: exchange only', ev.compute([row(post({ kind: 'exchange', sourceTier: 1, sourceDomain: 'binance.com' }))], facts).level, 'Moderate');
eq('Moderate: primary single domain (official)', ev.compute([row(post({ kind: 'official', sourceDomain: 'github.com' }))], facts).level, 'Moderate');
eq('Limited: single tier-4 source', ev.compute([row(post({ sourceTier: 4, sourceDomain: 'blog.xyz' }))], facts).level, 'Limited');
eq('Limited: social only', ev.compute([row(post({ kind: 'social', sourceTier: 3, sourceDomain: 'bsky.app' }))], facts).level, 'Limited');
eq('Limited: google-news only', ev.compute([row(post({ sourceTier: 2, sourceName: 'gnews:A:STO', sourceDomain: 'cryptobriefing.com' }))], facts).level, 'Limited');
const tg = ev.compute([row(post({ kind: 'social', sourceTier: 3, sourceDomain: 't.me', sourceName: 'tg:bwenews' }))], facts);
check('Limited reason literal-ish', /^Limited — /.test(tg.reason) && / ET$/.test(tg.reason), tg.reason);
eq('Limited: denial present even with primary', ev.compute([row(post({ kind: 'exchange', sourceTier: 1, sourceDomain: 'binance.com' })), row(post({}), 'denial')], facts).level, 'Limited');
eq('Limited: sources disagree (spread > 1 pt)', ev.compute([row(post({ kind: 'exchange', sourceTier: 1, sourceDomain: 'binance.com' })), row(post({}), 'update')], { exchange: 'Binance', per_source_pct: { defillama: 5.1, tokenomics: 7.0 } }).level, 'Limited');
eq('Not Limited when spread <= 1 pt', ev.compute([row(post({}))], { per_source_pct: { a: 5.1, b: 5.9 } }).level, 'Moderate');
check('disagree reason mentions the number', /disagree/.test(ev.compute([row(post({}))], { per_source_pct: { a: 5.1, b: 7 } }).reason));
eq('empty timeline is Limited, no crash', ev.compute([], facts).level, 'Limited');
const two = ev.compute([row(post({ kind: 'exchange', sourceTier: 1, sourceDomain: 'binance.com' })), row(post({ kind: 'official', sourceDomain: 'github.com' }), 'update')], facts);
check('two primary domains: no plus-0-news-sources', two.level === 'Strong' && !/[+] 0 /.test(two.reason) && /1 more primary source/.test(two.reason), two.reason);
done('p5_evidence');
