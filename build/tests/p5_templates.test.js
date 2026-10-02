// P5 P1: templates for every subtype — structure, banned words, number discipline, base-rate literal.
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const templates = require(APP + '/ingest/explain/templates.js');
const { extractFacts } = require(APP + '/ingest/explain/facts.js');

const PUB = new Date('2026-10-02T13:05:00Z');
const base = { sourceDomain: 'theblock.co', sourceName: 'rss:theblock', sourceTier: 2, kind: 'news', url: 'https://x.test/a', publishedAt: PUB, exchange: null };
const CASES = [
  ['unlock', 'supply_shock', { title: 'StakeStone (STO) unlocks 21,351,728 tokens, 5.1% of circulating supply, on Oct 2', unlockPct: 5.1, unlockPctBasis: 'circulating', unlockAmount: 21351728 }, 'STO'],
  ['hack', 'theft', { title: 'Protocol Q hacked, $2.3M drained on Oct 2' }, 'QQQ'],
  ['hack', 'exploit', { title: 'Lending app oracle exploit hits pools' }, 'LND'],
  ['hack', 'depeg', { title: 'USDX loses its peg' }, 'USDX'],
  ['hack', 'halt', { title: 'Exchange halts withdrawals after incident', exchange: 'Bybit' }, 'BIT'],
  ['listing', 'top_exchange', { title: 'Binance will list FOO perpetual contract on Oct 3', kind: 'exchange', exchange: 'Binance', sourceTier: 1 }, 'FOO'],
  ['delisting', 'top_exchange', { title: 'Upbit will delist BAR, last trading Oct 9', kind: 'exchange', exchange: 'Upbit', sourceTier: 1 }, 'BAR'],
  ['etf', 'bullish', { title: 'SEC approves spot SOL ETF' }, 'SOL'],
  ['etf', 'bearish', { title: 'SEC delays decision on ETH ETF to Oct 20' }, 'ETH'],
  ['etf', 'neutral', { title: 'Issuer files ETF amendment' }, 'BTC'],
  ['regulatory', 'bull', { title: 'SEC drops lawsuit against Foo Labs' }, 'FOO'],
  ['regulatory', 'bear', { title: 'CFTC charges exchange operator' }, null],
  ['regulatory', 'macro', { title: 'Fed chair signals rate cut path' }, null],
];
const BANNED = /\b(buy|sell|long|short|target|entry|stop loss|take profit|guaranteed|will go|moon|dump)\b/i;
const MULT = { thousand: 1e3, million: 1e6, billion: 1e9 };
const numsOf = (s) => { const out = []; const re = /(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion)?/gi; let m; while ((m = re.exec(s))) out.push(parseFloat(m[1].replace(/,/g, '')) * (m[2] ? MULT[m[2].toLowerCase()] : 1)); return out; };
const allowedOf = (facts) => { const set = new Set(); const walk = (v) => { if (typeof v === 'number') set.add(v); else if (typeof v === 'string') (v.match(/\d+(?:\.\d+)?/g) || []).forEach((x) => set.add(parseFloat(x))); else if (v && typeof v === 'object') Object.values(v).forEach(walk); }; walk(facts); return set; };
const texts = (t) => [t.what, t.why, t.tradeoffs, ...t.affected.flatMap((a) => [a.who, a.how]), ...t.watch.flatMap((w) => [w.label, w.detail]), ...t.uncertain, ...t.scenarios.flatMap((s) => [s.title, s.condition, s.evidence])];

for (const [cat, sub, post, ticker] of CASES) {
  const name = `${cat}:${sub}`;
  const facts = extractFacts(Object.assign({}, base, post), { category: cat, subtype: sub, ticker, name: ticker, cal: null });
  const t = templates.render(cat, sub, facts);
  check(name + ' what/why/tradeoffs non-empty', t.what && t.why && t.tradeoffs, t);
  eq(name + ' 3 scenarios, one each direction', t.scenarios.map((s) => s.dir).sort(), ['chop', 'down', 'up']);
  check(name + ' scenario fields', t.scenarios.every((s) => s.timeframe && s.condition && s.evidence && s.title && s.base_rate === null), t.scenarios);
  check(name + ' >=2 affected', t.affected.length >= 2 && t.affected.every((a) => a.who && a.how), t.affected);
  check(name + ' >=2 watch', t.watch.length >= 2 && t.watch.every((w) => w.label && w.detail), t.watch);
  check(name + ' >=1 uncertain', t.uncertain.length >= 1, t.uncertain);
  check(name + ' no banned words', texts(t).every((x) => !BANNED.test(x)), texts(t).filter((x) => BANNED.test(x)));
  const allowed = allowedOf(facts);
  const bad = [];
  for (const x of texts(t)) for (const n of numsOf(x)) if (!allowed.has(n)) bad.push([n, x]);
  check(name + ' every number is in facts', bad.length === 0, bad);
  eq(name + ' source template, glm null', [t.source, t.glm], ['template', null]);
  check(name + ' no markdown/URLs', texts(t).every((x) => !/[*_`#]|https?:/.test(x)), null);
  check(name + ' no base-rate line without n>=20; literal present', t.uncertain.includes('Not enough comparable cases') && !texts(t).some((x) => /Historically/.test(x)), t.uncertain);
}

console.log('— specifics');
const uf = extractFacts(Object.assign({}, base, CASES[0][2]), { category: 'unlock', subtype: 'supply_shock', ticker: 'STO', name: 'StakeStone', cal: null });
const ut = templates.render('unlock', 'supply_shock', uf);
eq('unlock what', ut.what, 'On Oct 2 about 5.1% more STO coins become free to trade. That is 21,351,728 coins.');
eq('unlock S1 down 1–7 days', [ut.scenarios[0].dir, ut.scenarios[0].timeframe], ['down', '1–7 days']);
const dp = templates.render('hack', 'depeg', extractFacts(Object.assign({}, base, CASES[3][2]), { category: 'hack', subtype: 'depeg', ticker: 'USDX', name: 'USDX', cal: null }));
check('depeg quotes the peg from facts', /meant to stay at \$1\./.test(dp.what), dp.what);
const theft = templates.render('hack', 'theft', extractFacts(Object.assign({}, base, { title: 'Protocol hacked' }), { category: 'hack', subtype: 'theft', ticker: null, name: 'Protocol', cal: null }));
check('theft with no amount says not yet confirmed (no invented number)', /not yet confirmed/.test(theft.what) && !/\d/.test(theft.what.replace(/Oct 2/, '')), theft.what);
const dl = templates.render('delisting', 'top_exchange', extractFacts(Object.assign({}, base, CASES[6][2]), { category: 'delisting', subtype: 'top_exchange', ticker: 'BAR', name: 'BAR', cal: null }));
check('delisting carries last trading date from restrictions', /after Oct 9/.test(dl.what), dl.what);
eq('fmtCount exact only', [templates.fmtCount(1660000000), templates.fmtCount(21351728), templates.fmtUsd(2300000)], ['1.66 billion', '21,351,728', '$2.3 million']);
done('p5_templates');
