// Coinbase delisting debounce edge cases (from Fable's re-review probe). No DB.
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const http = require(APP + '/ingest/http.js');
let cb = [];
for (let i = 0; i < 320; i++) cb.push({ id: `B${i}-USD`, base_currency: `B${i}`, quote_currency: 'USD', status: 'online' });
http.request = async () => ({ status: 200, json: () => cb, text: '' });
const symbols = require(APP + '/ingest/adapters/symbols.js');
const mem = [];
const prisma = { knownSymbol: {
  findMany: async ({ where }) => mem.filter((r) => r.venue === where.venue && (where.pendingEmit === undefined || r.pendingEmit === where.pendingEmit)),
  create: async ({ data }) => { mem.push({ firstSeenAt: new Date(), pendingEmit: false, ...data }); return data; },
  createMany: async ({ data }) => { for (const d of data) mem.push({ pendingEmit: false, ...d }); return {}; },
  updateMany: async () => ({ count: 0 }) } };
const a = symbols.make({ prisma }).find((x) => x.name === 'sym-coinbase');
const full = cb.slice();
const dl = (r) => r.filter((i) => i.hintCategory === 'delisting').map((i) => i.hintTickers[0]);
let errs = 0; const oe = console.error; console.error = (...x) => { errs++;  };
(async () => {
  await a.run(); // baseline
  // Scenario A: B0 legit delisted; on its 3rd missing run a glitch drops 12 other bases
  cb = full.filter((p) => p.base_currency !== 'B0');
  eq('A run1 none', dl(await a.run()), []);
  eq('A run2 none', dl(await a.run()), []);
  cb = full.filter((p) => p.base_currency !== 'B0' && !/^B(1|2|3|4|5|6|7|8|9|10|11|12)$/.test(p.base_currency));
  eq('A: glitch on B0 3rd missing run → nothing that run', dl(await a.run()), []);
  cb = full.filter((p) => p.base_currency !== 'B0');
  const after = []; for (let i = 0; i < 5; i++) { after.push(dl(await a.run())); for (const r of mem) if (/^DELIST:/.test(r.symbol)) r.pendingEmit = false; } // Store ack after each run
  eq('A: B0 emitted once on the first clean run after the glitch', after, [['B0'], [], [], [], []]);
  // Scenario B: persistent disappearance of 11 bases (real mass delisting) -> glitch logs per run?
  errs = 0; cb = full.filter((p) => !/^B(2\d|30)$/.test(p.base_currency) && p.base_currency !== 'B0');
  for (let i = 0; i < 6; i++) await a.run();
  eq('B: persistent 11-base disappearance logs the glitch once, not every run', errs, 1);
  // Scenario C: base offline at startup never fires
  const mem2 = []; const p2 = { knownSymbol: { ...prisma.knownSymbol, findMany: async () => mem2, createMany: async ({ data }) => { mem2.push(...data); return {}; } } };
  cb = full.filter((p) => p.base_currency !== 'B100');
  const c = symbols.make({ prisma: p2 }).find((x) => x.name === 'sym-coinbase');
  let fired = []; for (let i = 0; i < 6; i++) fired = fired.concat(dl(await c.run()));
  eq('C: base offline since startup never fires', fired, []);
  console.error = oe;
  done('step67_debounce');
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
