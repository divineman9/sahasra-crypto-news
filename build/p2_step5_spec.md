# PHASE 2 · STEP 5 — FROZEN SIGNAL-TIME SNAPSHOTS + CRYPTO EVENTS JOIN (authoritative)
Astra's acceptance criteria:
- Every new signal stores news IDs, publication/observation times, coverage state, direction, and an event-risk snapshot.
- Later news cannot retroactively make a signal "news-driven".
- Upcoming unlocks remain explicitly *scheduled* events.

It must NOT modify ShivaShakthi code (another session owns it) or the running collector. It is a separate process.

## Prisma model (add to `app/prisma/schema.prisma`)
```prisma
model SignalSnapshot {
  id            String   @id @default(uuid())
  key           String   @unique        // symbol|tf|bar1_t|stage
  symbol        String                   // e.g. HYPEUSDT
  base          String                   // e.g. HYPE (USDT stripped, 1000/1000000 stripped)
  tf            String
  direction     String                   // UP | DOWN
  stage         String
  bar1T         BigInt?
  highVol       Boolean?
  firstSeenAt   DateTime @default(now())  // when this snapshotter first saw the signal
  signalAsof    DateTime?                // base_break_live.json asof at that moment
  coverage      String                   // "news" | "none" | "unknown"
  newsAgeMs     Int?                     // age of news_live.json when snapshotted
  newsHealthOk  Boolean?
  newsIds       String[]                 // ids of fresh items at snapshot time (risk/catalyst/other)
  newsItems     Json                     // frozen copy: [{id,title,category,importance,sentiment,source,publishedAt,firstSeenAt,class}]
  riskClass     String?                  // "risk" | "catalyst" | "other" | null (best class present, risk first)
  eventLevel    String?                  // red | amber | green | null — events_live.risk[symbol][LONG|SHORT] for this direction
  eventReasons  Json?                    // frozen reasons array for that direction
  eventBadges   String[]                 // events_live.badges[symbol] at snapshot time
  scheduled     Json?                    // upcoming unlocks for this coin from events_live.unlocks_upcoming (explicitly scheduled, not news)
  eventsAgeMs   Int?
  @@index([base])
  @@index([firstSeenAt])
}
```

## `app/ingest/signalSnapshot.js` (pure, CommonJS)
`function buildSnapshot({ setup, bbwAsof, news, events, now })` returns the data object for `prisma.signalSnapshot.create` (without id), or null.
- Returns null for setups whose `stage` is not one of BAR1_CONFIRMED, BAR2_CONFIRMED, HOLDING, FOUR_SOLID_BARS, FOUR_BAR_PULLBACK_SETUP (BASING / BREAK_FORMING / INVALID / LTF_BREAK are not signals). Also null for `tf === '1m'`.
- `key = [setup.symbol, setup.tf, setup.bar1_t, setup.stage].join('|')`.
- `base`: strip a trailing USDT/USDC, then a leading 1000000 / 1000.
- **Coverage:**
  - `unknown` if news is null, or `now - news.asof_ms > 60000`, or `news.schema !== 2`, or `news.health && news.health.known && !news.health.ok`.
  - Otherwise `news` if `news.flags[base]` has at least one FRESH item: publishedAt within the last 48 h of `now` and not more than 5 min in the future.
  - Otherwise `none`.
- **Fresh items:** from `flags[base].items` plus `risk` / `catalyst` / `other`, deduplicated by id. Each carries `class` (risk / catalyst / other: risk if category hack/delisting or sentiment bearish, catalyst if sentiment bullish, else other). Store them all in `newsItems` and their ids in `newsIds`. When coverage is `unknown`, still store the fresh items if the file is readable, so the record shows what was visible.
- `riskClass`: 'risk' if any item is risk, else 'catalyst' if any, else 'other' if any, else null.
- **Events:**
  - `ev = events && events.risk && events.risk[setup.symbol]`;
  - `side = setup.direction === 'DOWN' ? 'SHORT' : 'LONG'`;
  - `eventLevel = ev && ev[side] ? ev[side].level : null`;
  - `eventReasons = ev && ev[side] ? ev[side].reasons : null`;
  - `eventBadges = (events && events.badges && events.badges[setup.symbol]) || []`;
  - `eventsAgeMs = events && events.asof_ms ? now - events.asof_ms : null`.
- **Scheduled:** `events.unlocks_upcoming` entries whose symbol/coin matches base or setup.symbol. Match on any field named `symbol`, `coin`, `ticker` or `base`, case-insensitive; also strip USDT. Copy the matching entries as-is, or null if none.
- `signalAsof = bbwAsof ? new Date(bbwAsof) : null`; `bar1T = setup.bar1_t != null ? BigInt(setup.bar1_t) : null`; `highVol = setup.high_vol ?? null`.

## `app/signalSnap.js` (worker process)
- dotenv; PrismaClient.
- Every 15 s (non-overlapping), read three JSON files, each in try/catch:
  - BBW_LIVE_JSON (config default `D:\claude projects\crypto\screener\base_break_live.json`);
  - NEWS_LIVE_JSON;
  - `EVENTS_LIVE_JSON` (env, default `D:\claude projects\crypto\screener\events_live.json`).
- If the bbw file is unreadable, skip the tick. Keep an in-memory Set of keys already stored (loaded at start from the DB, last 7 days).
- For each setup: `data = buildSnapshot(...)`. If data exists and its key is not in the Set → `prisma.signalSnapshot.create({ data })`. On P2002 (already stored) just add the key to the Set; otherwise log the error and continue.
- Log `[signals] <symbol> <tf> <stage> <dir> coverage=<c> risk=<riskClass> events=<eventLevel>`.
- NEVER update existing rows (frozen).
- SIGINT/SIGTERM → disconnect, exit 0.
- Export nothing; the file just runs.

## Supervisor
Add a service `signals` (`node signalSnap.js`) that starts with ingest in default mode (same env).

## Tests (orchestrator-owned): `build/tests/step5_signals.test.js`
- pure buildSnapshot cases;
- the worker against `cryptonews_test` with fixture files;
- frozen-ness: later news does not change a stored snapshot.

## STEP 5 · FIX ROUND (Fable review) — authoritative additions
1. `buildSnapshot({ setup, bbwAsof, bbwAsofMs, news, events, now, watcherSeenAt })`:
   - Add `watcherSeenAt` (ms or null) = when ShivaShakthi's own event log first recorded this stage.
   - `lagMs = watcherSeenAt != null ? now - watcherSeenAt : null`; `late = watcherSeenAt == null || lagMs > 300000`.
   - When `late`, `coverage = 'unknown'`, but the visible items are STILL recorded.
   - Return `watcherSeenAt` (a Date or null), `lagMs` (clamped Int) and `late` (boolean) in the data.
2. Picks: `flags[base].risk`, `.catalyst` and `.other` are SINGLE objects (or null), not arrays. Include each non-null pick in the fresh-item set (dedup by id), plus `items[]`.
3. `newsCount = flags[base] ? (flags[base].count ?? null) : null`.
4. `key = [symbol, tf, bar1_t, direction, stage].join('|')`.
5. `newsHealthOk = news && news.health && news.health.known ? !!news.health.ok : null`.
6. Clamp `newsAgeMs`, `eventsAgeMs` and `lagMs` to [0, 2147483647].
7. `signalAsof` prefers `bbwAsofMs` (number) over the `bbwAsof` string.
8. Worker (`signalSnap.js`):
   - Build `seenAt` from `bbw.events[]` (fields `ts_ms, symbol, tf, direction, bar1_t, stage`): the EARLIEST `ts_ms` per `symbol|tf|bar1_t|direction|stage`. Pass it as `watcherSeenAt`.
   - Keep `pending: Map<key, data>`. On a non-P2002 create error, keep the ORIGINAL data and retry exactly that object on later ticks (never rebuild it with newer news). On success or P2002, remove it from pending and add the key to the Set.
   - Before create, map `eventReasons` and `scheduled` null → `Prisma.DbNull` (`const { Prisma } = require('@prisma/client')`).
9. Model additions: `watcherSeenAt DateTime?`, `lagMs Int?`, `late Boolean @default(false)`, `newsCount Int?`.
