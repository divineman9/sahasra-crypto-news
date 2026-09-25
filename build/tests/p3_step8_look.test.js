// Phase 3 step 8: look parity — publisher favicons, Important/Saved predicates + saved-id cap
// (all pure, Node-testable), and the /api/posts range + keyset-pagination fix (the same cursor bug
// Fable found and fixed in /api/coin, now fixed here too). Unit tests need no server; the API
// section starts a real `next start` against the isolated test DB and drives it over HTTP, reusing
// the p3_step5_coin harness helpers (node:http instead of fetch — see the comment below —, detached
// spawn + Windows taskkill teardown, refuse-if-port-in-use, .next staleness check) verbatim.
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
const URL_PREFIX = 'https://test.local/p3s8/';

(async () => {
  console.log('— faviconUrl (pure)');
  const { faviconUrl } = require(APP + '/src/lib/faviconUrl.js');

  eq('normal domain', faviconUrl('coindesk.com'), 'https://www.google.com/s2/favicons?domain=coindesk.com&sz=32');
  eq(
    'gnews publisher host — same helper, just a bare hostname like any other sourceDomain',
    faviconUrl('cryptobriefing.com'),
    'https://www.google.com/s2/favicons?domain=cryptobriefing.com&sz=32'
  );
  eq(
    'uppercase / surrounding whitespace normalised before encoding',
    faviconUrl('  CoinDesk.COM  '),
    'https://www.google.com/s2/favicons?domain=coindesk.com&sz=32'
  );
  check('multi-label subdomain accepted', faviconUrl('news.google.com') === 'https://www.google.com/s2/favicons?domain=news.google.com&sz=32');
  check('empty string -> null', faviconUrl('') === null);
  check('whitespace-only -> null', faviconUrl('   ') === null);
  check('null -> null', faviconUrl(null) === null);
  check('undefined -> null', faviconUrl(undefined) === null);
  check('non-string (number) -> null', faviconUrl(42) === null);
  check('bare word, no dot -> null', faviconUrl('localhost') === null);
  check('scheme+host is not a bare hostname -> null', faviconUrl('https://coindesk.com') === null);
  check('host with a path -> null', faviconUrl('coindesk.com/path') === null);
  check('host containing whitespace -> null', faviconUrl('coin desk.com') === null);
  check('hyphen-leading label -> null', faviconUrl('-coindesk.com') === null);

  console.log('— Important / Saved predicates + saved-id cap (pure)');
  const {
    isImportantStory,
    isSavedStory,
    addSavedId,
    removeSavedId,
    toggleSavedMembers,
    IMPORTANT_MIN_IMPORTANCE,
    MAX_SAVED_IDS,
  } = require(APP + '/src/lib/storyFilters.js');

  eq('IMPORTANT_MIN_IMPORTANCE constant', IMPORTANT_MIN_IMPORTANCE, 50);
  eq('MAX_SAVED_IDS constant', MAX_SAVED_IDS, 500);

  check('maxImportance 50 -> important (boundary, inclusive)', isImportantStory({ maxImportance: 50 }) === true);
  check('maxImportance 49 -> not important (boundary)', isImportantStory({ maxImportance: 49 }) === false);
  check('maxImportance 90 -> important', isImportantStory({ maxImportance: 90 }) === true);
  check('missing maxImportance -> not important', isImportantStory({}) === false);
  check('null story -> not important', isImportantStory(null) === false);
  check('undefined story -> not important', isImportantStory(undefined) === false);

  const storyA = { post: { id: 'lead1' }, members: [{ id: 'lead1' }, { id: 'dup1' }] };
  check('saved via the story lead id', isSavedStory(storyA, new Set(['lead1'])) === true);
  check('saved via a non-lead clustered member id', isSavedStory(storyA, new Set(['dup1'])) === true);
  check('not saved when id absent from the set', isSavedStory(storyA, new Set(['other'])) === false);
  check('accepts a plain array, not just a Set', isSavedStory(storyA, ['lead1']) === true);
  check('null story -> not saved', isSavedStory(null, new Set(['x'])) === false);
  check(
    'story with an empty members array falls back to its post',
    isSavedStory({ post: { id: 'solo' }, members: [] }, ['solo']) === true
  );

  {
    let list = [];
    for (let i = 0; i < 500; i++) list = addSavedId(list, 'id' + i, 500);
    eq('list length capped at 500 after adding exactly 500', list.length, 500);
    eq('most-recently-added id is first', list[0], 'id499');
    check('oldest id (id0) still present at exactly 500 entries', list.includes('id0'));

    list = addSavedId(list, 'id500', 500);
    eq('length stays capped at 500 once the 501st id is added', list.length, 500);
    eq('newest id is now first', list[0], 'id500');
    check('oldest id (id0) was dropped once the cap was exceeded', !list.includes('id0'));
    check('second-oldest id (id1) survives (only the single oldest was dropped)', list.includes('id1'));

    const before = list.length;
    list = addSavedId(list, 'id500', 500); // re-adding an id already in the list
    eq('re-adding an existing id does not grow the list', list.length, before);
    eq('re-adding moves it back to the front (dedupe-and-reorder, not a duplicate)', list[0], 'id500');

    const beforeRemove = list.length;
    list = removeSavedId(list, 'id500');
    eq('removing an id shrinks the list by exactly one', list.length, beforeRemove - 1);
    check('removed id is gone', !list.includes('id500'));
    eq('removing an id not in the list is a no-op', removeSavedId(list, 'not-there').length, list.length);
  }
  check('addSavedId(empty, "", 500) with a falsy id is a no-op, not a bogus entry', addSavedId([], '', 500).length === 0);
  check('addSavedId defaults to MAX_SAVED_IDS when max is omitted', addSavedId([], 'x').length === 1);

  console.log('— toggleSavedMembers (F2: star must agree with isSavedStory, whichever member was actually saved)');
  {
    const story = { post: { id: 'lead' }, members: [{ id: 'lead' }, { id: 'dup1' }, { id: 'dup2' }] };

    // Not saved yet -> toggling adds just the lead id (not every member).
    let list = toggleSavedMembers([], story, 500);
    eq('unsaved -> toggling adds only the lead id', list, ['lead']);
    check('now reads as saved via isSavedStory', isSavedStory(story, list) === true);

    // Saved via the lead id -> toggling again removes every member id (of which only "lead" was
    // actually present, but the removal set is still every member — a no-op for the other two).
    list = toggleSavedMembers(list, story, 500);
    eq('saved (via lead) -> toggling removes it, list empty again', list, []);
    check('now reads as not saved', isSavedStory(story, list) === false);

    // The bug this fixes: only a NON-lead member id is in the saved list (e.g. left over from a
    // previous version, or a duplicate source saved on its own) — isSavedStory() already reads this
    // as saved; toggling must now remove ALL member ids (clearing dup1), not add the lead id on top.
    list = toggleSavedMembers(['dup1', 'unrelated-other-id'], story, 500);
    eq('non-lead member saved -> toggling clears every member id, leaves unrelated ids alone', list, ['unrelated-other-id']);
    check('reads as not saved after clearing the non-lead member', isSavedStory(story, list) === false);

    // Falls back to [story.post] when members is empty/absent, matching isSavedStory's own fallback.
    const soloStory = { post: { id: 'solo' }, members: [] };
    list = toggleSavedMembers([], soloStory, 500);
    eq('story with no members list toggles its own post id', list, ['solo']);

    // Respects the cap on the way in (adding), via the same addSavedId under the hood.
    let capped = [];
    for (let i = 0; i < 500; i++) capped = addSavedId(capped, 'cap' + i, 500);
    const grown = toggleSavedMembers(capped, { post: { id: 'new-id' }, members: [{ id: 'new-id' }] }, 500);
    eq('toggling a save onto a full (500) list still respects the cap', grown.length, 500);
    check('newest id present after capped add', grown.includes('new-id'));
    check('oldest id dropped after capped add', !grown.includes('cap0'));
  }

  console.log('— app is built');
  const nextDir = path.join(APP, '.next');
  const buildIdFile = path.join(nextDir, 'BUILD_ID');
  if (!fs.existsSync(buildIdFile)) {
    console.error('\n[p3_step8_look] app/.next is missing — run `npm run build` in app/ first, then re-run this test.\n');
    check('app is built (.next/BUILD_ID present)', false);
    done('p3_step8_look');
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
    console.error('\n[p3_step8_look] app/.next looks stale (source changed after the last build) — run `npm run build` in app/ first, then re-run this test.\n');
    check('app build is up to date (.next newer than src/**/*.{ts,tsx,js})', false, { buildMtime, newestSrcMtime });
    done('p3_step8_look');
    return;
  }
  check('app is built and up to date', true);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  let server = null;

  async function cleanupFixtures() {
    await prisma.post.deleteMany({ where: { url: { startsWith: URL_PREFIX } } });
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
      await httpGetJson(`${BASE}/api/posts?limit=1`);
    } catch {
      return; // nothing answered — port is free, proceed
    }
    throw new Error(
      `port ${PORT} already in use — stop the leftover server before running this suite ` +
      `(something answered ${BASE}/api/posts before we even started ours)`
    );
  }

  async function waitForReady(proc, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (proc.exitCode !== null) {
        throw new Error('next start exited early (code ' + proc.exitCode + '):\n' + proc.__output.slice(-4000));
      }
      try {
        const { status } = await httpGetJson(`${BASE}/api/posts?limit=1`);
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

    console.log('— seeding fixtures (0-8 days old)');
    const now = Date.now();
    const minutes = (n) => n * 60 * 1000;
    const hours = (n) => n * 3600 * 1000;
    const days = (n) => n * 24 * 3600 * 1000;

    let seq = 0;
    async function mkPost({ offsetMs, userLabel = null, importance = 20, sourceName = 'rss:p8' }) {
      seq += 1;
      const publishedAt = new Date(now + offsetMs);
      return prisma.post.create({
        data: {
          title: `P3S8 fixture ${seq}`,
          url: `${URL_PREFIX}${seq}`,
          sourceDomain: 'test.local',
          sourceName,
          sourceTier: 4,
          kind: 'news',
          sentiment: 'neutral',
          category: 'other',
          importance,
          publishedAt,
          firstSeenAt: publishedAt,
          userLabel,
        },
      });
    }

    const within48h1 = await mkPost({ offsetMs: -minutes(10) });
    const within48h2 = await mkPost({ offsetMs: -hours(30) });
    const dismissedWithin48h = await mkPost({ offsetMs: -minutes(20), userLabel: 'dismiss' });
    const sevenDay1 = await mkPost({ offsetMs: -days(3) });
    const sevenDay2 = await mkPost({ offsetMs: -days(6) });
    const beyond7d = await mkPost({ offsetMs: -days(8) });

    // Tie fixtures: four posts sharing the exact same firstSeenAt, inside the 48h window too, so
    // they exercise the keyset's tie-break (firstSeenAt desc, id desc) in both ranges.
    const tieAt = new Date(now - hours(20));
    const tieIds = [];
    for (let i = 0; i < 4; i++) {
      const p = await prisma.post.create({
        data: {
          title: `P3S8 tie fixture ${i}`,
          url: `${URL_PREFIX}tie-${i}`,
          sourceDomain: 'test.local',
          sourceName: 'rss:p8tie',
          sourceTier: 4,
          kind: 'news',
          sentiment: 'neutral',
          category: 'other',
          importance: 20,
          publishedAt: tieAt,
          firstSeenAt: tieAt,
        },
      });
      tieIds.push(p.id);
    }

    const ourIds48h = new Set([within48h1.id, within48h2.id, dismissedWithin48h.id, ...tieIds]);
    const ourIds7d = new Set([...ourIds48h, sevenDay1.id, sevenDay2.id]);

    await refuseIfPortInUse();

    console.log('— starting next start (port ' + PORT + ')');
    server = await startServer();
    await waitForReady(server, 60000);

    const getJson = (pathAndQuery) => httpGetJson(BASE + pathAndQuery);

    // Walks every page of /api/posts for a given range (limit 50/page), collecting every id it
    // sees. Not scoped to our own fixtures (/api/posts has no ticker/story filter to isolate them
    // with) — the isolated test DB should be empty of unrelated rows by the time this suite runs
    // (every earlier suite cleans its own fixtures up in a `finally` block), but this loop tolerates
    // leftovers anyway: presence/absence and no-duplicate checks below only assert about OUR known
    // ids, never an exact total count.
    async function collectIds(range) {
      let cursor = null;
      const ids = [];
      let pages = 0;
      do {
        const q = `/api/posts?range=${range}&limit=50${cursor ? `&cursor=${cursor}` : ''}`;
        const { body } = await getJson(q);
        for (const p of body.posts) ids.push(p.id);
        cursor = body.nextCursor;
        pages += 1;
        if (pages > 200) throw new Error('pagination did not terminate for range=' + range);
      } while (cursor);
      return ids;
    }

    console.log('— /api/posts: default range (no `range` param) behaves as 48h');
    {
      const { body } = await getJson('/api/posts?limit=100');
      eq('range field defaults to 48h', body.range, '48h');
      const ids = body.posts.map((p) => p.id);
      check('within48h1 present', ids.includes(within48h1.id));
      check('within48h2 present', ids.includes(within48h2.id));
      check('dismissed post is NOT filtered (unchanged semantics — route never excluded userLabel dismiss)', ids.includes(dismissedWithin48h.id));
      check('sevenDay1 (>48h) absent by default', !ids.includes(sevenDay1.id));
      check('sevenDay2 (>48h) absent by default', !ids.includes(sevenDay2.id));
      check('beyond7d absent by default', !ids.includes(beyond7d.id));
      check(
        'newest-first ordering (firstSeenAt desc)',
        body.posts.every((p, i, arr) => i === 0 || arr[i - 1].firstSeenAt >= p.firstSeenAt)
      );
    }

    console.log('— /api/posts: range=48h explicit, keyset pagination covers exactly our 48h fixtures once each');
    {
      const ids48 = await collectIds('48h');
      eq('no duplicate ids across 48h pagination', new Set(ids48).size, ids48.length);
      const set48 = new Set(ids48);
      for (const id of ourIds48h) check(`48h range includes our fixture ${id}`, set48.has(id));
      check('sevenDay1 excluded from 48h range', !set48.has(sevenDay1.id));
      check('sevenDay2 excluded from 48h range', !set48.has(sevenDay2.id));
      check('beyond7d excluded from 48h range', !set48.has(beyond7d.id));
      eq(
        'exactly our expected fixtures appear in the 48h range (no fewer, no extra dupes of ours)',
        ids48.filter((id) => ourIds48h.has(id)).length,
        ourIds48h.size
      );
    }

    console.log('— /api/posts: range=7d covers 7 days, excludes the 8d-old post, ties ordered id-desc');
    {
      const ids7 = await collectIds('7d');
      eq('no duplicate ids across 7d pagination', new Set(ids7).size, ids7.length);
      const set7 = new Set(ids7);
      for (const id of ourIds7d) check(`7d range includes our fixture ${id}`, set7.has(id));
      check('beyond7d (8d old) excluded from the 7d range', !set7.has(beyond7d.id));
      eq(
        'exactly our expected fixtures appear in the 7d range',
        ids7.filter((id) => ourIds7d.has(id)).length,
        ourIds7d.size
      );

      const tieIndices = ids7.map((id, i) => (tieIds.includes(id) ? i : -1)).filter((i) => i !== -1);
      eq('all 4 tie fixtures found', tieIndices.length, 4);
      const contiguous = tieIndices.every((idx, i) => i === 0 || idx === tieIndices[i - 1] + 1);
      check('tied (identical firstSeenAt) rows are contiguous in the ordering', contiguous, tieIndices);
      const orderedTieIds = tieIndices.map((i) => ids7[i]);
      const expectedTieOrder = [...tieIds].sort().reverse();
      eq('tied rows are ordered id-desc (the tie-break)', orderedTieIds, expectedTieOrder);
    }

    console.log('— /api/posts: F5 — cursor set to a mid-tie-group id (the OR-clause tie branch)');
    {
      // Descending id order within the tied firstSeenAt group — same tie-break the route uses.
      const tieIdsDesc = [...tieIds].sort().reverse();
      const cursorId = tieIdsDesc[1]; // the 2nd-highest id of the tied group
      const lowerTieIds = tieIdsDesc.slice(2); // the two lower-id ties: must be returned
      const higherOrEqualTieIds = tieIdsDesc.slice(0, 2); // cursor itself + the higher tie: must not

      const { status, body } = await getJson(`/api/posts?range=7d&limit=300&cursor=${cursorId}`);
      eq('cursor = mid-tie-group id -> 200', status, 200);
      const ids = body.posts.map((p) => p.id);
      for (const id of lowerTieIds) {
        check(`lower-id tie ${id} (firstSeenAt equal, id < cursor) is returned — the OR-clause's second branch (firstSeenAt: eq, id: {lt}) matches it`, ids.includes(id));
      }
      for (const id of higherOrEqualTieIds) {
        check(`tie ${id} at/above the cursor's id is NOT returned (cursor itself, and the higher tie whose id > cursor's)`, !ids.includes(id));
      }
    }

    console.log('— /api/posts: invalid cursor -> 400');
    {
      const { status, body } = await getJson('/api/posts?cursor=not-a-real-post-id-00000000');
      eq('invalid cursor status', status, 400);
      check('invalid cursor -> {error}', body && typeof body.error === 'string', body);
    }

    console.log('— /api/posts: keyset cursor fix — a cursor row pushed outside the range window mid-pagination still yields the next row');
    {
      // Baseline, before mutating anything: continuing from cursor=sevenDay1 reaches sevenDay2.
      const { body: before } = await getJson(`/api/posts?range=7d&limit=300&cursor=${sevenDay1.id}`);
      check('baseline: sevenDay2 reachable via cursor=sevenDay1', before.posts.some((p) => p.id === sevenDay2.id));

      // Push sevenDay1's publishedAt beyond the 7-day window (its firstSeenAt/id — what the keyset
      // itself is built on — are untouched). This reproduces exactly the scenario the old
      // `cursor: {id}, skip: 1` implementation got wrong: the cursor row itself no longer matches
      // `where` at the moment page2 is fetched. The old code would then silently drop the row right
      // after it (sevenDay2); the new keyset-OR implementation doesn't, because it only depends on
      // the cursor row's own (firstSeenAt, id), never on whether that row still matches `where`.
      await prisma.post.update({ where: { id: sevenDay1.id }, data: { publishedAt: new Date(now - days(10)) } });
      try {
        const { status, body: after } = await getJson(`/api/posts?range=7d&limit=300&cursor=${sevenDay1.id}`);
        eq('cursor lookup still succeeds (200) even though the row now fails the 7d window', status, 200);
        check(
          'sevenDay2 is NOT dropped — still returned right after the now-out-of-window cursor row',
          after.posts.some((p) => p.id === sevenDay2.id)
        );
        check(
          'the mutated cursor row itself is correctly excluded (it now fails the 7d window)',
          !after.posts.some((p) => p.id === sevenDay1.id)
        );
      } finally {
        await prisma.post.update({ where: { id: sevenDay1.id }, data: { publishedAt: new Date(now - days(3)) } });
      }
    }
  } finally {
    await stopServer(server);
    await cleanupFixtures();
    await prisma.$disconnect();
  }

  done('p3_step8_look');
})().catch((e) => {
  console.error('TEST CRASH', e);
  process.exit(2);
});
