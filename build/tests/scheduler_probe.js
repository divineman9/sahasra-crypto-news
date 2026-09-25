// Error path must back off and keep rescheduling (validator issue 1).
process.chdir('D:/claude projects/crypto-news-terminal/app');
const { Scheduler } = require('D:/claude projects/crypto-news-terminal/app/ingest/scheduler.js');
process.on('unhandledRejection', e => { console.log('UNHANDLED:', e && e.message); });
const calls = { bad: 0, flaky: 0 }; let onItemsCalls = 0;
const s = new Scheduler({ redis: null, onItems: async (items) => { onItemsCalls++; } });
s.add({ name: 'always500', tier: 1, intervalMs: 50, run: async () => { calls.bad++; const e = new Error('HTTP 500'); e.status = 500; throw e; } });
s.add({ name: 'flaky', tier: 1, intervalMs: 50, run: async () => { calls.flaky++; if (calls.flaky === 1) { const e = new Error('HTTP 502'); e.status = 502; throw e; } return [{ x: 1 }]; } });
s.start();
setTimeout(() => {
  s.stop();
  const h = Object.fromEntries(s.health().map(a => [a.name, a]));
  console.log('always500: run calls', calls.bad, '| consecutiveErrors', h.always500.consecutiveErrors, '| lastErr', h.always500.lastErr, '(want: several calls with growing backoff, errors counted)');
  console.log('flaky: run calls', calls.flaky, '| consecutiveErrors now', h.flaky.consecutiveErrors, '| lastOkAt set', !!h.flaky.lastOkAt, '| lastNonEmptyAt set', !!h.flaky.lastNonEmptyAt, '| onItems calls', onItemsCalls, '(want: recovered after 1 error)');
  process.exit(0);
}, 2500);
