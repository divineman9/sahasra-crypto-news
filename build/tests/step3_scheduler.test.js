// Step 3e: a hung onItems (save) must time out and the adapter must keep polling; a hung run() must not overlap.
process.chdir('D:/claude projects/crypto-news-terminal/app');
const { check, done } = require('./assert_lib');
const { Scheduler } = require('D:/claude projects/crypto-news-terminal/app/ingest/scheduler.js');
let runs = 0, hungRuns = 0, concurrent = 0, maxConcurrent = 0;
const s = new Scheduler({ redis: { hset: () => new Promise(() => {}) }, // a hung Redis must not block the loop either
  onItems: async (items, { adapter }) => { if (adapter.name === 'hungSave') return new Promise(() => {}); } });
s.add({ name: 'hungSave', tier: 1, intervalMs: 200, run: async () => { runs++; return [{ x: 1 }]; } });
s.add({ name: 'hungRun', tier: 1, intervalMs: 200, run: () => { hungRuns++; concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent); return new Promise(() => {}); } });
s.start();
setTimeout(() => {
  s.stop();
  const h = Object.fromEntries(s.health().map((a) => [a.name, a]));
  check('hung save timed out and was recorded', (h.hungSave.consecutiveSaveErrors || 0) >= 1, h.hungSave);
  check('no new fetch starts while its save is still stuck (no overlapping saves — reviewer requirement)', runs === 1, { runs });
  check('hung run() never overlapped (max concurrent 1)', maxConcurrent === 1, { maxConcurrent, hungRuns });
  check('hung run() recorded as an error by the watchdog', (h.hungRun.consecutiveErrors || 0) >= 1, h.hungRun);
  done('step3_scheduler');
}, 100000);
