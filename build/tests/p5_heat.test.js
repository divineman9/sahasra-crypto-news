// P5 P2: heat badge data (heat.js) and the private funding / OI gating.
const fs = require('fs'), os = require('os'), path = require('path');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const heat = require(APP + '/ingest/explain/heat.js');
const { createEngine } = require(APP + '/ingest/explain/events.js');

const N = '2026-10-02T13:00:00.000Z';
eq('range >= 8 -> high', heat.toHeat({ range_24h_pct: 8 }, false, N).level, 'high');
eq('range 7.9 -> normal', heat.toHeat({ range_24h_pct: 7.9 }, false, N).level, 'normal');
eq('unknown range -> null level', heat.toHeat({ range_24h_pct: null }, false, N).level, null);
eq('funding ignored when not private', heat.toHeat({ range_24h_pct: 2, funding: 0.2, oi_chg_24h: 90 }, false, N), { level: 'normal', range_24h_pct: 2, private: null, checked_at: N });
eq('private: |funding| >= 0.05 -> high', heat.toHeat({ range_24h_pct: 2, funding: -0.06, oi_chg_24h: 1 }, true, N).level, 'high');
eq('private: OI change >= 25 -> high', heat.toHeat({ range_24h_pct: 2, funding: 0.01, oi_chg_24h: 25 }, true, N).level, 'high');
eq('private line carries funding + OI', heat.toHeat({ range_24h_pct: 2, funding: 0.01, oi_chg_24h: 5 }, true, N).private, { funding_1h: 0.01, oi_chg_24h: 5 });

(async () => {
  const calls = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p5heat-'));
  let t = Date.parse('2026-10-02T13:00:00Z');
  const e = createEngine({ dir, now: () => t, calendarPath: '', log: () => {}, privateHeat: false, fetchHeat: async (tk) => { calls.push(tk); return { range_24h_pct: 11.2 }; } });
  const ev = e.consider({ id: 'h1', title: 'AAA unlocks 6% of circulating supply on Oct 2', url: 'https://x.test/h1', category: 'unlock', importance: 80, sentiment: 'bearish', kind: 'news', sourceTier: 2, sourceDomain: 'theblock.co', sourceName: 'rss:x', tickers: ['AAA'], unlockPct: 6, unlockPctBasis: 'circulating', publishedAt: new Date(t - 60e3), storyId: null });
  await e.settled();
  eq('heat filled on creation (one lookup)', [calls, ev.heat.level, ev.heat.range_24h_pct, ev.heat.private], [['AAA'], 'high', 11.2, null]);
  e.tick(); await e.settled();
  eq('tick within 10 min does not look up again', calls.length, 1);
  t += 11 * 60e3; e.tick(); await e.settled();
  eq('tick after 10 min refreshes once', calls.length, 2);
  const mac = e.consider({ id: 'm1', title: 'Fed chair signals rate cut path', url: 'https://x.test/m1', category: 'regulatory', importance: 75, sentiment: 'neutral', kind: 'news', sourceTier: 2, sourceDomain: 'x', sourceName: 'x', tickers: [], publishedAt: new Date(t - 60e3) });
  await e.settled();
  eq('macro events (no coin) are never looked up', calls.length, 2);
  const none = createEngine({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'p5heat2-')), now: () => t, calendarPath: '', log: () => {} });
  const n1 = none.consider({ id: 'z', title: 'BBB unlocks 6% of circulating supply on Oct 2', url: 'https://x.test/z', category: 'unlock', importance: 80, sentiment: 'bearish', kind: 'news', sourceTier: 2, sourceDomain: 'x', sourceName: 'x', tickers: ['BBB'], unlockPct: 6, unlockPctBasis: 'circulating', publishedAt: new Date(t - 60e3) });
  eq('no fetcher configured: heat stays empty (no network in tests)', n1.heat.level, null);
  done('p5_heat');
})();
