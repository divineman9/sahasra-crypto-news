// F8: supervisor single-instance lock, stale-lock recovery, log rotation generations, STOP — on a temp copy.
const { check, eq, done } = require('./assert_lib');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const SRC = 'D:/claude projects/crypto-news-terminal/app/supervisor.js';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suptest-'));
fs.copyFileSync(SRC, path.join(dir, 'supervisor.js'));
// fake noisy collector: ~2 KB of output every 20 ms
fs.writeFileSync(path.join(dir, 'ingest.js'), "setInterval(() => console.log('x'.repeat(2000)), 20);");
const logs = path.join(dir, 'logs');
const env = { ...process.env, SUPERVISOR_MAX_LOG_BYTES: '20000' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const start = () => cp.spawn(process.execPath, ['supervisor.js'], { cwd: dir, env, windowsHide: true });
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

(async () => {
  // stale lock: a live PID that is NOT node.exe (this test's parent shell is fine; use the System idle-ish pid 4)
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(path.join(logs, 'supervisor.pid'), '4');
  const a = start(); let aOut = ''; a.stdout.on('data', (d) => (aOut += d));
  await wait(4000);
  check('stale lock (pid 4 is not node.exe) is recovered and supervisor starts', alive(a.pid) && /supervisor started/.test(aOut + fs.readFileSync(path.join(logs, 'supervisor.log'), 'utf8')), aOut);
  eq('lock now holds our supervisor pid', fs.readFileSync(path.join(logs, 'supervisor.pid'), 'utf8').trim(), String(a.pid));

  const b = start(); let bOut = ''; b.stdout.on('data', (d) => (bOut += d));
  const bExit = await new Promise((r) => b.on('exit', (c) => r(c)));
  check('second instance refuses and exits 0', bExit === 0 && /already running/.test(bOut), { bExit, bOut });

  await wait(6000); // let the noisy child push several rotations
  const files = fs.readdirSync(logs).filter((f) => f.startsWith('ingest'));
  const size = (f) => (fs.existsSync(path.join(logs, f)) ? fs.statSync(path.join(logs, f)).size : -1);
  check('rotation produced .1, .2 and .3 generations', ['ingest.1.log', 'ingest.2.log', 'ingest.3.log'].every((f) => files.includes(f)), files);
  check('no .4 generation (bounded to 3 backups)', !files.includes('ingest.4.log'), files);
  check('active log stays bounded (< 2 x limit)', size('ingest.log') < 40000, size('ingest.log'));
  check('backups are near the limit (really rotated, not truncated)', size('ingest.2.log') > 15000, size('ingest.2.log'));

  fs.writeFileSync(path.join(logs, 'STOP'), '');
  const t0 = Date.now(); while (alive(a.pid) && Date.now() - t0 < 15000) await wait(300);
  check('STOP file shuts the supervisor down within 15 s', !alive(a.pid));
  check('lock file removed on shutdown', !fs.existsSync(path.join(logs, 'supervisor.pid')));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  done('supervisor');
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
