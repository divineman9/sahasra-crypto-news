// P5 P1 look test: built app on :4190 with a fixture explain-events dir. API shape + heat.private stripping +
// /about/devis (SSR) + the post page rendering the card in headless Edge over CDP (port 9333 only).
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const PORT = 4190, BASE = `http://127.0.0.1:${PORT}`, CDP_PORT = 9333;
const URL_PREFIX = 'https://test.local/p5ui/';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function httpGet(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; });
      res.on('end', () => { let body = null; try { body = JSON.parse(data); } catch {} resolve({ status: res.statusCode, body, text: data }); });
    });
    req.on('error', reject); req.setTimeout(20000, () => req.destroy(new Error('timeout'))); req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const buildId = path.join(APP, '.next', 'BUILD_ID');
  if (!fs.existsSync(buildId)) { check('app is built', false); return done('p5_ui_look'); }
  let newest = 0;
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx|js|json|css)$/.test(e.name)) newest = Math.max(newest, fs.statSync(p).mtimeMs); } })(path.join(APP, 'src'));
  if (newest > fs.statSync(buildId).mtimeMs) { console.error('[p5_ui_look] app/.next is stale: run `npm run build` in app/ first'); check('app build is up to date', false); return done('p5_ui_look'); }
  check('app is built and up to date', true);

  const { createEngine } = require(APP + '/ingest/explain/events.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p5ui-'));
  const engine = createEngine({ dir, calendarPath: '', log: () => {}, fetchHeat: async () => ({ range_24h_pct: 11.2 }) });
  const now = new Date();
  const mk = (o) => Object.assign({ id: crypto.randomUUID(), title: 't', url: URL_PREFIX + crypto.randomUUID(), category: 'other', importance: 80, sentiment: 'bearish', kind: 'news', sourceTier: 2, sourceDomain: 'theblock.co', sourceName: 'rss:theblock', exchange: null, tickers: ['STO'], flags: null, publishedAt: new Date(now.getTime() - 120e3), storyId: null, userLabel: null }, o);
  const uPost = mk({ title: 'StakeStone (STO) unlocks 21,351,728 tokens, 5.1% of circulating supply, on Oct 2', category: 'unlock', unlockPct: 5.1, unlockPctBasis: 'circulating', unlockAmount: 21351728 });
  const hPost = mk({ title: 'Exchange halts withdrawals after incident', category: 'other', flags: { depeg: false, freeze: true }, tickers: ['HLT'], exchange: 'Bybit', sourceTier: 2 });
  const eU = engine.consider(uPost);
  const eH = engine.consider(hPost);
  await engine.settled();
  const uPost2 = mk({ title: 'StakeStone STO unlock now 5.4% of circulating supply', category: 'unlock', unlockPct: 5.4, unlockPctBasis: 'circulating', sourceDomain: 'coindesk.com' });
  engine.consider(uPost2); // merges into the unlock card -> rev 2 + what-changed line
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'events.json'), 'utf8'));
  raw[0].heat.private = { funding_1h: 0.08, oi_chg_24h: 31 }; // must be stripped by default
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(raw));
  check('fixture events created live', eU && eU.state === 'live' && eH && eH.state === 'live', [eU && eU.state, eH && eH.state]);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const cleanup = () => prisma.post.deleteMany({ where: { url: { startsWith: URL_PREFIX } } });
  let server = null, edge = null;
  const stopEdge = () => { spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '--remote-debugging-port=${CDP_PORT}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' }); };
  try {
    await cleanup();
    for (const [p, e] of [[uPost, eU], [uPost2, eU], [hPost, eH]]) {
      await prisma.post.create({ data: { id: p.id, title: p.title, url: p.url, sourceDomain: 'theblock.co', sourceName: 'rss:theblock', sourceTier: 2, kind: 'news', sentiment: 'bearish', category: p.category, importance: 80, publishedAt: p.publishedAt, firstSeenAt: p.publishedAt } });
    }
    try { await httpGet(`${BASE}/api/explain?limit=1`); throw new Error(`port ${PORT} already in use: stop the leftover server first`); } catch (e) { if (/already in use/.test(e.message)) throw e; }
    const bin = path.join(APP, 'node_modules', 'next', 'dist', 'bin', 'next');
    server = spawn(process.execPath, [bin, 'start', '-H', '127.0.0.1', '-p', String(PORT)], { cwd: APP, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL, NEWS_REDIS: 'off', PORT: String(PORT), EXPLAIN_DIR: dir, EXPLAIN_PRIVATE: '' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let out = ''; server.stdout.on('data', (d) => { out += d; }); server.stderr.on('data', (d) => { out += d; });
    const deadline = Date.now() + 60000;
    for (;;) { if (Date.now() > deadline) throw new Error('next did not start: ' + out.slice(-2000)); try { const r = await httpGet(`${BASE}/api/explain?limit=1`); if (r.status) break; } catch {} await sleep(300); }

    console.log('— API');
    const list = await httpGet(`${BASE}/api/explain?limit=20`);
    eq('GET /api/explain 200 with 2 events', [list.status, list.body.events.length], [200, 2]);
    check('heat.private stripped by default', list.body.events.every((e) => e.heat && e.heat.private === null), list.body.events.map((e) => e.heat));
    check('internal fields not exposed', list.body.events.every((e) => !('story_ids' in e) && !('live_at' in e)));
    eq('coin filter', (await httpGet(`${BASE}/api/explain?coin=STO`)).body.events.map((e) => e.id), [eU.id]);
    const one = await httpGet(`${BASE}/api/explain/${eU.id}`);
    eq('GET /api/explain/[id]', [one.status, one.body.event.id, one.body.event.text.scenarios.length], [200, eU.id, 3]);
    eq('unknown id 404', (await httpGet(`${BASE}/api/explain/evt_nope`)).status, 404);
    const post = await httpGet(`${BASE}/api/posts/${uPost.id}`);
    eq('/api/posts/[id] carries explainEventId', post.body.post.explainEventId, eU.id);
    const feed = await httpGet(`${BASE}/api/posts?limit=100`);
    eq('/api/posts rows carry explainEventId', (feed.body.posts.find((p) => p.id === uPost.id) || {}).explainEventId, eU.id);

    console.log('— /about/devis (SSR)');
    const legend = await httpGet(`${BASE}/about/devis`);
    eq('legend 200', legend.status, 200);
    eq('lists 10 symbols', (legend.text.match(/data-devi="/g) || []).length, 10);
    check('legend has the sensitivity note', /not devotional images, not ritual yantras/.test(legend.text));
    check('legend marks are aria-hidden svgs', (legend.text.match(/aria-hidden="true"/g) || []).length >= 10);

    console.log('— post page in headless Edge (CDP ' + CDP_PORT + ')');
    if (!fs.existsSync(EDGE)) { console.log('  SKIP: Edge not installed'); } else {
      const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'p5edge-'));
      edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${udd}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore', detached: true });
      for (let i = 0; i < 60; i++) { try { if ((await httpGet(`http://127.0.0.1:${CDP_PORT}/json/version`)).status === 200) break; } catch {} await sleep(500); }
      const WebSocket = require('ws');
      async function pageText(url) {
        const t = await httpGet(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, 'PUT');
        const ws = new WebSocket(t.body.webSocketDebuggerUrl);
        await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
        let id = 0; const pend = new Map(); const errors = [];
        ws.on('message', (m) => { const j = JSON.parse(m); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } else if (j.method === 'Runtime.exceptionThrown') errors.push(j.params.exceptionDetails.text + ' ' + ((j.params.exceptionDetails.exception || {}).description || '')); else if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') errors.push('console.error ' + j.params.args.map((a) => a.value || a.description).join(' ')); });
        const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
        await send('Runtime.enable'); await send('Page.enable'); await send('Page.navigate', { url });
        let res = null;
        for (let i = 0; i < 60; i++) {
          await sleep(500);
          const r = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const c = document.querySelector('.explain-card'); if (!c) return null; const q = (s) => [...c.querySelectorAll(s)]; return JSON.stringify({ title: c.querySelector('.ex-title')?.textContent, lens: q('h3[data-lens]').map((h) => h.dataset.lens), headings: q('h3').map((h) => h.textContent.trim()), svgs: q('svg').length, hiddenSvgs: q('svg[aria-hidden="true"]').length, text: c.innerText, footer: c.querySelector('.ex-footer')?.textContent, scen: q('details').length, tags: q('.ex-tag').map((t) => t.textContent), clipped: q('svg').filter((s) => s.getBoundingClientRect().width < 15).length, gloss: q('.ex-gloss').length, glossDef: q('.ex-gloss').every((g) => (g.getAttribute('data-def') || '').length > 10 && g.tabIndex === 0) }); })()` });
          if (r.result && r.result.result && r.result.result.value) { res = JSON.parse(r.result.result.value); break; }
        }
        if (!res) { const r = await send('Runtime.evaluate', { returnByValue: true, expression: 'document.body.innerText.slice(0,500)' }); errors.push('BODY: ' + JSON.stringify(r.result && r.result.result && r.result.result.value)); }
        ws.close(); await httpGet(`http://127.0.0.1:${CDP_PORT}/json/close/${t.body.id}`).catch(() => {});
        return { res, errors };
      }
      async function probe(url, reduced, expr, waitMs) {
        const t = await httpGet(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, 'PUT');
        const ws = new WebSocket(t.body.webSocketDebuggerUrl);
        await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
        let id = 0; const pend = new Map();
        ws.on('message', (m) => { const j = JSON.parse(m); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } });
        const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
        await send('Runtime.enable'); await send('Page.enable');
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }, { name: 'prefers-color-scheme', value: 'light' }] });
        await send('Page.navigate', { url });
        await sleep(waitMs);
        const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: expr });
        ws.close(); await httpGet(`http://127.0.0.1:${CDP_PORT}/json/close/${t.body.id}`).catch(() => {});
        return r.result && r.result.result && r.result.result.value;
      }
      const MOTION = "(() => { const c = document.querySelector('.explain-card'); const hdr = c && c.querySelector('.ex-header-mark svg'); return JSON.stringify({ playing: document.querySelectorAll('.explain-card .devi.is-playing').length, headerPlaying: !!(hdr && hdr.classList.contains('is-playing')), anims: hdr ? hdr.getAnimations({ subtree: true }).length : -1, running: hdr ? hdr.getAnimations({ subtree: true }).filter((x) => x.playState === 'running').length : -1 }); })()";
      const m1 = JSON.parse(await probe(`${BASE}/post/${uPost.id}`, false, MOTION, 4500) || '{}');
      check('motion: header mark plays once when visible (is-playing + animations created)', m1.headerPlaying === true && m1.anims >= 1, m1);
      check('motion: every animation has finished after 4.5 s (final frame held, no idle loop)', m1.running === 0, m1);
      const m2 = JSON.parse(await probe(`${BASE}/post/${uPost.id}`, true, MOTION, 3000) || '{}');
      check('reduced motion: no is-playing class and no animations (static frames)', m2.playing === 0 && m2.anims === 0, m2);
      const side = JSON.parse(await probe(`${BASE}/`, false, "new Promise((r) => { let n = 0; const iv = setInterval(() => { const rows = document.querySelectorAll('[data-testid=big-news] .big-news-row'); if (rows.length >= 2 || ++n > 40) { clearInterval(iv); r(JSON.stringify({ rows: rows.length, text: document.querySelector('[data-testid=big-news]')?.innerText || '', svgs: document.querySelectorAll('[data-testid=big-news] svg[aria-hidden=true]').length })); } }, 500); })", 1500) || '{}');
      check('sidebar: Big news lists today\'s events (max 5) with Tara marks, tags and ET times', side.rows === 2 && side.svgs >= 2 && /Unlock/i.test(side.text) && / (AM|PM) ET/.test(side.text), side);
      // theme: Sahasra is dark neon only; a light OS setting must not turn the card or the legend white
      const th = JSON.parse(await probe(`${BASE}/post/${uPost.id}`, false, "(() => { const c = document.querySelector('.explain-card'); const rgb = getComputedStyle(c).backgroundColor.match(/[0-9]+/g).slice(0, 3).map(Number); const links = [...c.querySelectorAll('a')].filter((a) => (a.getAttribute('href') || '').startsWith('/about/devis')).length; return JSON.stringify({ rgb, links, mono: /mono|Consolas|Menlo|Courier/i.test(getComputedStyle(c).fontFamily) }); })()", 2500) || '{}');
      check('card is dark neon even when the OS prefers light', th.rgb && Math.max(...th.rgb) < 90, th);
      check('card links to /about/devis (header mark, about link, footer, heading marks)', th.links >= 3, th);
      check('card uses the app mono font', th.mono === true, th);
      const lg = JSON.parse(await probe(`${BASE}/about/devis`, false, "(() => { const li = document.querySelector('.devi-legend-item'); const rgb = getComputedStyle(li).backgroundColor.match(/[0-9]+/g).slice(0, 3).map(Number); return JSON.stringify({ rgb, header: !!document.querySelector('header.sahasra-header'), anchors: document.querySelectorAll('.devi-legend-item[id]').length, bodyRgb: getComputedStyle(document.querySelector('main')).backgroundColor }); })()", 2500) || '{}');
      check('legend: Sahasra header + dark panels (not white) under a light OS setting', lg.header === true && Math.max(...lg.rgb) < 90 && lg.bodyRgb === 'rgba(0, 0, 0, 0)', lg);
      eq('legend: ten anchors (#tara ... #matangi)', lg.anchors, 10);
      const home = JSON.parse(await probe(`${BASE}/`, false, "JSON.stringify({ side: [...document.querySelectorAll('nav a')].filter((a) => a.getAttribute('href') === '/about/devis').length, head: [...document.querySelectorAll('header a')].filter((a) => a.getAttribute('href') === '/about/devis').length })", 2500) || '{}');
      eq('home: Ten lenses link in the left nav and in the header', [home.side, home.head], [1, 1]);
      const a = await pageText(`${BASE}/post/${uPost.id}`);
      check('unlock card rendered on /post/<id>', !!a.res, a.errors);
      if (a.res) {
        eq('header title', a.res.title, 'Understand this');
        eq('8 lens headings without restrictions (no Bagalamukhi)', a.res.lens, ['kali', 'bhuvaneshwari', 'tripurasundari', 'chhinnamasta', 'kamala', 'bhairavi', 'dhumavati', 'matangi']);
        check('evidence + history blocks present', a.res.headings.includes('Evidence') && a.res.headings.includes('Has this happened before?'), a.res.headings);
        check('all marks are aria-hidden svgs', a.res.svgs >= 9 && a.res.svgs === a.res.hiddenSvgs, [a.res.svgs, a.res.hiddenSvgs]);
        check('footer disclaimer', /Not advice\. Nothing here says buy or sell\./.test(a.res.footer || ''), a.res.footer);
        check('times in ET', /\b(AM|PM) ET\b/.test(a.res.text) && !/\bUTC\b/.test(a.res.text), a.res.text.slice(0, 300));
        check('what-text from facts', /about 5\.4% more STO coins/.test(a.res.text), a.res.text.slice(0, 400));
        eq('3 scenarios', a.res.scen, 3);
        check('glossary terms rendered with definitions (hover/focus)', a.res.gloss >= 2 && a.res.glossDef, [a.res.gloss, a.res.glossDef]);
        check('heat badge: Volatility: high', /Volatility: high/.test(a.res.text), a.res.text.slice(0, 300));
        check('private funding/OI line hidden by default', !/Funding rate|Open interest/.test(a.res.text));
        check('what-changed line after a merge', /What changed: Rev 2: unlock size now 5\.4% \(was 5\.1%\)/.test(a.res.text), a.res.text.slice(0, 400));
        eq('Unlock tag', a.res.tags, ['Unlock']);
      }
      check('no JS errors on the post page', a.errors.length === 0, a.errors);
      const b = await pageText(`${BASE}/post/${hPost.id}`);
      check('halt card rendered', !!b.res, b.errors);
      if (b.res) {
        eq('9 lens headings incl. Bagalamukhi when restrictions exist', b.res.lens.length, 9);
        check('restrictions section visible', b.res.lens.includes('bagalamukhi') && /Withdrawals paused/.test(b.res.text), b.res.text.slice(0, 200));
        eq('Halt tag', b.res.tags, ['Halt']);
      }
      check('no JS errors (halt page)', b.errors.length === 0, b.errors);
    }
  } finally {
    try { stopEdge(); } catch {}
    if (server && server.exitCode === null) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    try { await cleanup(); } catch {}
    await prisma.$disconnect();
  }
  done('p5_ui_look');
})().catch((e) => { console.error('p5_ui_look crashed:', e); try { spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '--remote-debugging-port=${CDP_PORT}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' }); } catch {} process.exit(1); });
