// Phase 3 step 5: coin page API + search API + shared source-tab classifier + low-importance gnews
// toggle predicate. Unit tests need no server; the API section starts a real `next start` against the
// isolated test DB and drives it over HTTP (importing built Next.js route handlers directly isn't
// practical, so we exercise the real server like a client would).
const { check, eq, done } = require('./assert_lib');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// Node's global fetch() (undici) implements the WHATWG Fetch spec's "bad port" blocklist, which
// includes port 4190 (assigned to ManageSieve) — every fetch() to our test server would fail with
// "fetch failed: bad port" regardless of whether the server is up. That restriction is fetch-specific
// (not enforced by the OS or by node:http), so this suite talks to the server with node:http instead.
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('request timed out')));
  });
}

// Same "D:/claude projects/..." style as the other suites — this checkout maps it to the real path
// regardless of cwd (see build/tests/run_all_tests.sh / dpath.js), so it works for require(), fs and
// child_process alike.
const APP = 'D:/claude projects/crypto-news-terminal/app';
const PORT = 4190;
const BASE = `http://127.0.0.1:${PORT}`;
const URL_PREFIX = 'https://test.local/p3s5/';
// Every Instrument ticker this suite creates — used both to seed and to clean up (cleanupFixtures
// deletes these too, not just the URL_PREFIX posts, so re-runs never see leftover coin rows).
const TEST_TICKERS = ['P5COIN', 'P5A', 'P5AB', 'P5ABC', 'ZQNAME'];

(async () => {
  console.log('— sourceTab classifier');
  const { sourceTab, hideLowImportanceGnews } = require(APP + '/src/lib/sourceTab.js');

  eq('media kind -> media', sourceTab({ kind: 'media', sourceName: 'yt:x' }), 'media');
  eq('social kind -> social', sourceTab({ kind: 'social', sourceName: 'reddit:x' }), 'social');
  eq('official kind -> official', sourceTab({ kind: 'official', sourceName: 'gov:x' }), 'official');
  eq('blog kind -> official', sourceTab({ kind: 'blog', sourceName: 'blog:ethereum' }), 'official');
  eq('blog: sourceName prefix with kind news -> official', sourceTab({ kind: 'news', sourceName: 'blog:kraken' }), 'official');
  eq('exchange kind -> exchange', sourceTab({ kind: 'exchange', sourceName: 'exchange:binance' }), 'exchange');
  eq('symbol kind -> exchange', sourceTab({ kind: 'symbol', sourceName: 'exchange:binance' }), 'exchange');
  eq('news kind -> news', sourceTab({ kind: 'news', sourceName: 'rss:coindesk' }), 'news');
  eq('regulator kind -> news', sourceTab({ kind: 'regulator', sourceName: 'reg:sec' }), 'news');
  eq('gnews item (kind news) -> news', sourceTab({ kind: 'news', sourceName: 'gnews:coindesk.com' }), 'news');
  eq('unknown kind -> news', sourceTab({ kind: 'something-new', sourceName: 'rss:x' }), 'news');
  eq('missing kind -> news', sourceTab({ sourceName: 'rss:x' }), 'news');

  console.log('— hide-low-importance-gnews predicate');
  check('gnews imp 25 hidden', hideLowImportanceGnews({ sourceName: 'gnews:example.com', importance: 25 }) === true);
  check('gnews imp 30 shown', hideLowImportanceGnews({ sourceName: 'gnews:example.com', importance: 30 }) === false);
  check('gnews imp 29 hidden (boundary)', hideLowImportanceGnews({ sourceName: 'gnews:example.com', importance: 29 }) === true);
  check('non-gnews imp 10 shown', hideLowImportanceGnews({ sourceName: 'rss:coindesk', importance: 10 }) === false);
  check('missing importance treated as 0 -> hidden for gnews', hideLowImportanceGnews({ sourceName: 'gnews:x.com' }) === true);

  console.log('— app is built');
  const nextDir = path.join(APP, '.next');
  const buildIdFile = path.join(nextDir, 'BUILD_ID');
  if (!fs.existsSync(buildIdFile)) {
    console.error('\n[p3_step5_coin] app/.next is missing — run `npm run build` in app/ first, then re-run this test.\n');
    check('app is built (.next/BUILD_ID present)', false);
    done('p3_step5_coin');
    return;
  }
  const buildMtime = fs.statSync(buildIdFile).mtimeMs;
  const srcDir = path.join(APP, 'src');
  let newestSrcMtime = 0;
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js)$/.test(entry.name)) {
        const m = fs.statSync(p).mtimeMs;
        if (m > newestSrcMtime) newestSrcMtime = m;
      }
    }
  })(srcDir);
  if (newestSrcMtime > buildMtime) {
    console.error('\n[p3_step5_coin] app/.next looks stale (source changed after the last build) — run `npm run build` in app/ first, then re-run this test.\n');
    check('app build is up to date (.next newer than src/**/*.{ts,tsx,js})', false, { buildMtime, newestSrcMtime });
    done('p3_step5_coin');
    return;
  }
  check('app is built and up to date', true);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  let server = null;

  async function cleanupFixtures() {
    await prisma.post.deleteMany({ where: { url: { startsWith: URL_PREFIX } } });
    // Posts must go first (Instrument<->Post is a relation) — deleteMany on Instrument alone would
    // be a no-op error-free disconnect anyway, but ordering it after posts keeps intent obvious.
    await prisma.instrument.deleteMany({ where: { ticker: { in: TEST_TICKERS } } });
  }

  function startServer() {
    const bin = path.join(APP, 'node_modules', 'next', 'dist', 'bin', 'next');
    // detached: true puts `next start` (and whatever worker process it forks) in its own process
    // group, so it can be torn down reliably with a single signal to the group in stopServer().
    const proc = spawn(process.execPath, [bin, 'start', '-H', '127.0.0.1', '-p', String(PORT)], {
      cwd: APP,
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL, NEWS_REDIS: 'off', PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    proc.__output = '';
    proc.stdout.on('data', (d) => { proc.__output += d.toString(); });
    proc.stderr.on('data', (d) => { proc.__output += d.toString(); });
    return proc;
  }

  // POSIX-only `process.kill(-pid, ...)` (negative pid = whole process group) throws ESRCH on
  // Windows, where process groups work differently — on the operator's machine (Git Bash,
  // run_all_tests.sh) that throw used to be silently swallowed, leaving `next start` (and the
  // `next-server` worker it forks) running on port 4190 forever, so the *next* run's waitForReady()
  // could hit that orphan and silently test a stale build instead of starting a fresh one. `taskkill
  // /T /F` kills the whole tree by pid on Windows; the POSIX process-group signal handles the rest.
  async function stopServer(proc) {
    if (!proc || proc.exitCode !== null) return;
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    if (process.platform === 'win32') {
      require('child_process').spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try { process.kill(-proc.pid, 'SIGTERM'); } catch {}
    }
    const timedOut = await Promise.race([exited.then(() => false), new Promise((r) => setTimeout(() => r(true), 5000))]);
    if (timedOut && proc.exitCode === null && process.platform !== 'win32') {
      try { process.kill(-proc.pid, 'SIGKILL'); } catch {}
    }
  }

  // Run before spawning: if a server (ours or a leftover orphan from a previous run) already answers
  // on this port, spawning a second one would either fail confusingly (EADDRINUSE) or — worse — leave
  // waitForReady() satisfied by the OLD process while this run tests a stale build. Fail loudly instead.
  async function refuseIfPortInUse() {
    try {
      await httpGetJson(`${BASE}/api/search?q=ready`);
    } catch {
      return; // nothing answered — port is free, proceed
    }
    throw new Error(
      `port ${PORT} already in use — stop the leftover server before running this suite ` +
      `(something answered ${BASE}/api/search before we even started ours)`
    );
  }

  async function waitForReady(proc, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (proc.exitCode !== null) {
        throw new Error('next start exited early (code ' + proc.exitCode + '):\n' + proc.__output.slice(-4000));
      }
      try {
        const { status } = await httpGetJson(`${BASE}/api/search?q=ready`);
        if (status) return;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error('next start did not become ready within ' + timeoutMs + 'ms:\n' + proc.__output.slice(-4000));
  }

  try {
    await cleanupFixtures();

    console.log('— seeding fixtures');
    const COIN = 'P5COIN';
    await prisma.instrument.upsert({ where: { ticker: COIN }, create: { ticker: COIN, name: 'P3S5 Coin One' }, update: { name: 'P3S5 Coin One' } });
    for (const [ticker, name] of [
      ['P5A', 'P3S5 Alpha'],
      ['P5AB', 'P3S5 Alpha Beta'],
      ['P5ABC', 'P3S5 Alpha Beta Charlie'],
      ['ZQNAME', 'P3S5 Zeta Quantum Coin'],
    ]) {
      await prisma.instrument.upsert({ where: { ticker }, create: { ticker, name }, update: { name } });
    }

    const now = Date.now();
    const minutes = (n) => n * 60 * 1000;
    const hours = (n) => n * 3600 * 1000;
    const days = (n) => n * 24 * 3600 * 1000;

    let seq = 0;
    async function mkPost({ kind, sourceName, importance, offsetMs, userLabel = null, tickers = [COIN], sourceTier = 4, sentiment = 'neutral' }) {
      seq += 1;
      const publishedAt = new Date(now + offsetMs);
      return prisma.post.create({
        data: {
          title: `P3S5 fixture ${seq} (${kind}/${sourceName})`,
          url: `${URL_PREFIX}${seq}`,
          sourceDomain: 'test.local',
          sourceName,
          sourceTier,
          kind,
          sentiment,
          category: 'other',
          importance,
          publishedAt,
          firstSeenAt: publishedAt,
          userLabel,
          instruments: { connect: tickers.map((t) => ({ ticker: t })) },
        },
      });
    }

    // --- within 48h (also within 7d) ---
    const news1 = await mkPost({ kind: 'news', sourceName: 'rss:test', importance: 20, offsetMs: -minutes(10) });
    const news2 = await mkPost({ kind: 'news', sourceName: 'rss:test2', importance: 60, offsetMs: -minutes(30) });
    const exchange1 = await mkPost({ kind: 'exchange', sourceName: 'exchange:test', importance: 40, offsetMs: -hours(1) });
    const symbol1 = await mkPost({ kind: 'symbol', sourceName: 'exchange:test2', importance: 55, offsetMs: -hours(2) });
    const official1 = await mkPost({ kind: 'official', sourceName: 'official:test', importance: 30, offsetMs: -hours(3) });
    const blog1 = await mkPost({ kind: 'blog', sourceName: 'blog:testsite', importance: 25, offsetMs: -hours(4) });
    const blogPrefix1 = await mkPost({ kind: 'news', sourceName: 'blog:otherhost', importance: 45, offsetMs: -hours(5) });
    const social1 = await mkPost({ kind: 'social', sourceName: 'social:test', importance: 15, offsetMs: -hours(6) });
    const media1 = await mkPost({ kind: 'media', sourceName: 'media:test', importance: 10, offsetMs: -hours(7) });
    const unknownKind1 = await mkPost({ kind: 'regulator', sourceName: 'reg:test', importance: 70, offsetMs: -hours(8) });
    // F1 precedence fixtures: sourceTab() checks kind==='media' and kind==='social' *before* it ever
    // looks at a "blog:" sourceName, so these must land in exchange-blog -> official and media-blog
    // -> media respectively, NOT in exchange/media's plain-kind buckets. tabWhere() must agree.
    const exchangeBlogPrefix1 = await mkPost({ kind: 'exchange', sourceName: 'blog:weirdexchange', importance: 35, offsetMs: -hours(9) });
    const mediaBlogPrefix1 = await mkPost({ kind: 'media', sourceName: 'blog:weirdmedia', importance: 12, offsetMs: -hours(9) - minutes(30) });
    const futureOk = await mkPost({ kind: 'news', sourceName: 'rss:future', importance: 20, offsetMs: minutes(2) });

    // --- 7d-only (beyond 48h, within 7d) ---
    const sevenDayNews = await mkPost({ kind: 'news', sourceName: 'rss:sevenday', importance: 20, offsetMs: -days(4) });
    const sevenDayImportant = await mkPost({ kind: 'news', sourceName: 'rss:sevenday2', importance: 80, offsetMs: -days(5) });

    // --- excluded from both ranges / always ---
    const oldPost = await mkPost({ kind: 'news', sourceName: 'rss:old', importance: 90, offsetMs: -days(10) }); // older than 7d
    const dismissedPost = await mkPost({ kind: 'news', sourceName: 'rss:dismissed', importance: 90, offsetMs: -minutes(20), userLabel: 'dismiss' }); // dismissed
    const futureBad = await mkPost({ kind: 'news', sourceName: 'rss:future-bad', importance: 20, offsetMs: minutes(10) }); // >5min future

    // --- search fixtures ---
    for (let i = 0; i < 3; i++) await mkPost({ kind: 'news', sourceName: 'rss:p5ab', importance: 20, offsetMs: -hours(1) - minutes(i), tickers: ['P5AB'] });
    for (let i = 0; i < 2; i++) await mkPost({ kind: 'news', sourceName: 'rss:p5abc', importance: 20, offsetMs: -hours(1) - minutes(i), tickers: ['P5ABC'] });
    await mkPost({ kind: 'news', sourceName: 'rss:p5a', importance: 20, offsetMs: -hours(1), tickers: ['P5A'] });

    const searchToken = 'P3S5SEARCHTOKEN';
    const searchPost1 = await mkPost({ kind: 'news', sourceName: 'rss:search', importance: 20, offsetMs: -minutes(5), tickers: [], sentiment: 'neutral' });
    await prisma.post.update({ where: { id: searchPost1.id }, data: { title: `${searchToken} launches new feature` } });
    const searchPost2 = await mkPost({ kind: 'news', sourceName: 'rss:search2', importance: 20, offsetMs: -minutes(15), tickers: [] });
    await prisma.post.update({ where: { id: searchPost2.id }, data: { title: `${searchToken} follow-up coverage` } });
    const searchDismissed = await mkPost({ kind: 'news', sourceName: 'rss:search-dismissed', importance: 20, offsetMs: -minutes(3), userLabel: 'dismiss', tickers: [] });
    await prisma.post.update({ where: { id: searchDismissed.id }, data: { title: `${searchToken} dismissed post` } });
    const searchOld = await mkPost({ kind: 'news', sourceName: 'rss:search-old', importance: 20, offsetMs: -days(9), tickers: [] });
    await prisma.post.update({ where: { id: searchOld.id }, data: { title: `${searchToken} old post` } });

    // F2 fixtures: a title with a literal underscore, and a lookalike with an arbitrary character
    // (X) in its place — if "_" reached Postgres LIKE unescaped, "%P3S5_LITERAL%" would match BOTH
    // (LIKE "_" = "any one character"), not just the literal one.
    const underscoreToken = 'P3S5_LITERAL_TOKEN';
    const underscoreMatch = await mkPost({ kind: 'news', sourceName: 'rss:underscore', importance: 20, offsetMs: -minutes(2), tickers: [] });
    await prisma.post.update({ where: { id: underscoreMatch.id }, data: { title: `${underscoreToken} exact item` } });
    const underscoreLookalike = await mkPost({ kind: 'news', sourceName: 'rss:underscore2', importance: 20, offsetMs: -minutes(2), tickers: [] });
    await prisma.post.update({ where: { id: underscoreLookalike.id }, data: { title: 'P3S5XLITERALXTOKEN exact item' } });

    await refuseIfPortInUse();

    console.log('— starting next start (port ' + PORT + ')');
    server = await startServer();
    await waitForReady(server, 60000);

    const getJson = (pathAndQuery) => httpGetJson(BASE + pathAndQuery);

    console.log('— coin API: 404 for unknown ticker');
    {
      const { status, body } = await getJson('/api/coin/P5NOPE?range=48h');
      eq('unknown ticker -> 404', status, 404);
      check('unknown ticker -> {error}', body && typeof body.error === 'string', body);
    }

    console.log('— coin API: 48h range, tab=all');
    {
      const { status, body } = await getJson(`/api/coin/${COIN}?range=48h&tab=all`);
      eq('status 200', status, 200);
      eq('ticker echoed', body.ticker, COIN);
      eq('name from Instrument', body.name, 'P3S5 Coin One');
      eq('range echoed', body.range, '48h');
      eq('all count (48h)', body.counts.all, 13);
      eq('news count (48h)', body.counts.news, 4);
      eq('exchange count (48h)', body.counts.exchange, 2);
      eq('official count (48h)', body.counts.official, 4);
      eq('social count (48h)', body.counts.social, 1);
      eq('media count (48h)', body.counts.media, 2);
      eq('important count (48h, >=50)', body.counts.important, 3);
      eq('tab counts sum to all (48h)', body.counts.news + body.counts.exchange + body.counts.official + body.counts.social + body.counts.media, body.counts.all);
      const ids = body.items.map((p) => p.id);
      check('dismissed post excluded', !ids.includes(dismissedPost.id));
      check('>7d old post excluded from 48h', !ids.includes(sevenDayNews.id) && !ids.includes(sevenDayImportant.id));
      check('>5min future post excluded', !ids.includes(futureBad.id));
      check('<=5min future post included', ids.includes(futureOk.id));
      check('newest-first ordering (publishedAt desc)', body.items.every((p, i, arr) => i === 0 || Date.parse(arr[i - 1].publishedAt) >= Date.parse(p.publishedAt)));
    }

    console.log('— coin API: 7d range, tab=all');
    {
      const { body } = await getJson(`/api/coin/${COIN}?range=7d&tab=all`);
      eq('all count (7d)', body.counts.all, 15);
      eq('news count (7d)', body.counts.news, 6);
      eq('exchange count (7d)', body.counts.exchange, 2);
      eq('official count (7d)', body.counts.official, 4);
      eq('social count (7d)', body.counts.social, 1);
      eq('media count (7d)', body.counts.media, 2);
      eq('important count (7d)', body.counts.important, 4);
      eq('tab counts sum to all (7d)', body.counts.news + body.counts.exchange + body.counts.official + body.counts.social + body.counts.media, body.counts.all);
      const ids = body.items.map((p) => p.id);
      check('7d includes the 4d/5d-old posts', ids.includes(sevenDayNews.id) && ids.includes(sevenDayImportant.id));
      check('7d still excludes the 10d-old post', !ids.includes(oldPost.id));
      check('7d still excludes dismissed/future-bad posts', !ids.includes(dismissedPost.id) && !ids.includes(futureBad.id));
    }

    console.log('— coin API: SQL tab classification matches sourceTab() exactly (F1)');
    {
      for (const t of ['news', 'exchange', 'official', 'social', 'media']) {
        const { body } = await getJson(`/api/coin/${COIN}?range=7d&tab=${t}&limit=300`);
        check(
          `every item under tab=${t} classifies as ${t} per sourceTab()`,
          body.items.length > 0 && body.items.every((p) => sourceTab(p) === t),
          body.items.map((p) => [p.sourceName, p.kind, sourceTab(p)])
        );
      }
    }

    console.log('— coin API: tab filter (exchange)');
    {
      const { body } = await getJson(`/api/coin/${COIN}?range=48h&tab=exchange`);
      eq('tab echoed', body.tab, 'exchange');
      eq('items.length matches exchange count', body.items.length, 2);
      const ids = body.items.map((p) => p.id).sort();
      eq('exchange tab returns exactly exchange1 + symbol1', ids, [exchange1.id, symbol1.id].sort());
      // counts stay whole-range regardless of the active tab
      eq('counts.all unaffected by active tab', body.counts.all, 13);
    }

    console.log('— coin API: minImportance interacts with counts');
    {
      const { body } = await getJson(`/api/coin/${COIN}?range=48h&tab=all&minImportance=50`);
      eq('all count with minImportance=50', body.counts.all, 3);
      eq('news count with minImportance=50', body.counts.news, 2);
      eq('exchange count with minImportance=50', body.counts.exchange, 1);
      eq('official count with minImportance=50', body.counts.official, 0);
      eq('important == all once floor already >=50', body.counts.important, 3);
      const ids = body.items.map((p) => p.id).sort();
      eq('items are exactly the >=50 posts', ids, [news2.id, symbol1.id, unknownKind1.id].sort());
    }

    console.log('— coin API: cursor pagination (disjoint, covers all items)');
    {
      let cursor = null;
      const seen = [];
      let pages = 0;
      do {
        const { body } = await getJson(`/api/coin/${COIN}?range=7d&tab=all&limit=5${cursor ? `&cursor=${cursor}` : ''}`);
        for (const p of body.items) seen.push(p.id);
        cursor = body.nextCursor;
        pages += 1;
        if (pages > 20) throw new Error('pagination did not terminate');
      } while (cursor);
      eq('paginated through >1 page', pages > 1, true);
      eq('total items collected == 7d all count', seen.length, 15);
      eq('no duplicate ids across pages', new Set(seen).size, seen.length);
    }

    console.log('— coin API: B2 — cursor row excluded (dismissed) between pages loses nothing');
    {
      const { body: fullBody } = await getJson(`/api/coin/${COIN}?range=7d&tab=all&limit=300`);
      const fullOrder = fullBody.items.map((p) => p.id);
      eq('sanity: full ordering has all 15 items', fullOrder.length, 15);

      const { body: page1 } = await getJson(`/api/coin/${COIN}?range=7d&tab=all&limit=2`);
      eq('page1 == first two of the full ordering', page1.items.map((p) => p.id), fullOrder.slice(0, 2));
      const cursorId = page1.items[1].id;

      // Dismiss the last post page1 returned — the *cursor* for page2 — after page1 was fetched but
      // before page2 is. The old `cursor:{id}, skip:1` implementation assumed the cursor row still
      // matched `where`; it no longer does (dismissed posts are excluded), which used to drop the
      // next legitimate row.
      await prisma.post.update({ where: { id: cursorId }, data: { userLabel: 'dismiss' } });
      try {
        const { body: page2 } = await getJson(`/api/coin/${COIN}?range=7d&tab=all&limit=300&cursor=${cursorId}`);
        eq(
          'page2 (cursor row now dismissed) == full ordering minus the first 2, nothing else skipped',
          page2.items.map((p) => p.id),
          fullOrder.slice(2)
        );
      } finally {
        await prisma.post.update({ where: { id: cursorId }, data: { userLabel: null } });
      }
    }

    console.log('— coin API: B2 — cursor pagination with ties on publishedAt covers every row exactly once');
    {
      const tieAt = new Date(now - hours(20));
      const tieIds = [];
      for (let i = 0; i < 4; i++) {
        const p = await prisma.post.create({
          data: {
            title: `P3S5 tie fixture ${i}`,
            url: `${URL_PREFIX}tie-${i}`,
            sourceDomain: 'test.local',
            sourceName: 'rss:tie',
            sourceTier: 4,
            kind: 'news',
            sentiment: 'neutral',
            category: 'other',
            importance: 20,
            publishedAt: tieAt,
            firstSeenAt: tieAt,
            instruments: { connect: [{ ticker: COIN }] },
          },
        });
        tieIds.push(p.id);
      }
      // The route breaks (publishedAt desc) ties with (id desc) — same comparison the route's keyset
      // OR-clause and orderBy both use, so the expected order is just the ids sorted descending.
      const expectedTieOrder = [...tieIds].sort().reverse();

      try {
        let cursor = null;
        const seen = [];
        let pages = 0;
        do {
          const q = `/api/coin/${COIN}?range=7d&tab=all&limit=1` + (cursor ? `&cursor=${cursor}` : '');
          const { body } = await getJson(q);
          for (const p of body.items) seen.push(p.id);
          cursor = body.nextCursor;
          pages += 1;
          if (pages > 40) throw new Error('tie pagination did not terminate');
        } while (cursor);

        eq('every row seen exactly once (15 originals + 4 tied)', seen.length, 15 + 4);
        eq('no duplicates', new Set(seen).size, seen.length);
        const tieRunInSeen = seen.filter((id) => tieIds.includes(id));
        eq('tied rows all present, ordered id-desc (the tie-break)', tieRunInSeen, expectedTieOrder);
      } finally {
        await prisma.post.deleteMany({ where: { id: { in: tieIds } } });
      }
    }

    console.log('— search API: validation');
    {
      const { status: s1, body: b1 } = await getJson('/api/search?q=');
      eq('empty q -> 400', s1, 400);
      check('empty q -> {error}', b1 && typeof b1.error === 'string', b1);
      const { status: s2, body: b2 } = await getJson('/api/search?q=' + 'x'.repeat(65));
      eq('q too long -> 400', s2, 400);
      check('too-long q -> {error}', b2 && typeof b2.error === 'string', b2);
      const { status: s3 } = await getJson('/api/search?q=' + 'x'.repeat(64));
      eq('q at max length (64) -> 200', s3, 200);
    }

    console.log('— search API: coin matches, exact ticker first, then count7d desc');
    {
      const { body } = await getJson('/api/search?q=P5A');
      const tickers = body.coins.map((c) => c.ticker);
      eq('exact ticker match (P5A) is first', tickers[0], 'P5A');
      const rest = tickers.slice(1);
      check('P5AB (count 3) before P5ABC (count 2)', rest.indexOf('P5AB') < rest.indexOf('P5ABC'), rest);
      const byTicker = Object.fromEntries(body.coins.map((c) => [c.ticker, c]));
      eq('P5AB count7d', byTicker.P5AB.count7d, 3);
      eq('P5ABC count7d', byTicker.P5ABC.count7d, 2);
      eq('P5A count7d', byTicker.P5A.count7d, 1);
    }

    console.log('— search API: F2 LIKE wildcard escaping');
    {
      const { status: pctStatus, body: pctBody } = await getJson('/api/search?q=' + encodeURIComponent('%'));
      eq('q="%" -> 200', pctStatus, 200);
      eq('q="%" does not match every post (wildcard escaped, not one of our titles contains a literal %)', pctBody.posts.length, 0);

      const { status: underStatus, body: underBody } = await getJson('/api/search?q=' + encodeURIComponent(underscoreToken));
      eq('q with "_" -> 200', underStatus, 200);
      const titles = underBody.posts.map((p) => p.title);
      check('q with a literal "_" matches the literal-underscore title', titles.some((t) => t.startsWith(underscoreToken)));
      check(
        'q with a literal "_" does NOT match an X-substituted lookalike (it would if "_" were left as a LIKE wildcard)',
        !titles.some((t) => t.startsWith('P3S5XLITERALXTOKEN'))
      );
    }

    console.log('— search API: name-contains match');
    {
      const { body } = await getJson('/api/search?q=Quantum');
      const tickers = body.coins.map((c) => c.ticker);
      check('name-contains match returns ZQNAME even with 0 posts', tickers.includes('ZQNAME'), tickers);
    }

    console.log('— search API: post title match, dismissed/old excluded, newest first');
    {
      const { body } = await getJson(`/api/search?q=${searchToken}`);
      const titles = body.posts.map((p) => p.title);
      check('matches non-dismissed, in-range posts', titles.some((t) => t.includes('launches new feature')) && titles.some((t) => t.includes('follow-up coverage')));
      check('dismissed post excluded', !titles.some((t) => t.includes('dismissed post')));
      check('>7d old post excluded', !titles.some((t) => t.includes('old post')));
      check('newest first', Date.parse(body.posts[0].publishedAt) >= Date.parse(body.posts[body.posts.length - 1].publishedAt));
    }
    {
      const { body } = await getJson(`/api/search?q=${searchToken}&limit=1`);
      eq('limit respected', body.posts.length, 1);
    }
  } finally {
    await stopServer(server);
    await cleanupFixtures();
    await prisma.$disconnect();
  }

  done('p3_step5_coin');
})().catch((e) => {
  console.error('TEST CRASH', e);
  process.exit(2);
});
