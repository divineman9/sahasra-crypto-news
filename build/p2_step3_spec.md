# PHASE 2 · STEP 3 — RECOVERABLE PROCESSING (authoritative)
Source: Astra findings 6, 7, 8, 9 plus simplifications. CommonJS, Node 24. The Prisma fields already exist:
- `Post.hotPublishedAt DateTime?`, `Post.alertState String?`, `Post.alertAttempts Int`
- `KnownSymbol.pendingEmit Boolean`, `KnownSymbol.emittedAt DateTime?`

## 3b. `ingest/store.js`
1. **Known-URL index with corrections.**
   - Replace the url Set with a Map `url → { id, title }`, loaded at init from the last 5000 posts (select `id, url, title`).
   - In `save(raw)`, if the url is known:
     - Same title → return null (duplicate).
     - Title changed (a correction or revision at the same URL) → re-run tagging and classification on the new title, then `prisma.post.update({ where: { id }, data: { title, category, importance, sentiment, instruments: { set: [], connectOrCreate: [...] } }, include: { instruments: true } })`.
     - Keep `publishedAt`, `firstSeenAt`, `storyId` and `priceStatus` UNCHANGED (an edit must not restart the 48 h clock).
     - Update the Map, log `[store] revised <url>`, then publish the new DTO: `updateHotList` semantics — LSET the matching entry in `news:hot` via the same Lua approach used in the vote/label routes if convenient, else just `redis.publish('news:update', json)`.
     - Return null (it is not a new post).
2. **Durable Redis publication.**
   - After `prisma.post.create` succeeds, add the url to the Map immediately (the row exists).
   - Then try the Redis multi (`lpush` / `ltrim` / `publish`).
   - REMOVE the per-ticker `zadd` / `zremrangebyscore` lines (the `news:ticker:*` index is unused).
   - If exec succeeds with no per-command errors → `prisma.post.update({ where: { id }, data: { hotPublishedAt: new Date() } })`.
   - If Redis fails → log it and leave `hotPublishedAt` null; the republish worker retries.
   - `save` still returns the dto.
3. **Symbol acknowledgement.** When `raw.kind === 'symbol'` and the post was created, and `raw.symbolRef = { venue, symbol }` is present → `prisma.knownSymbol.update({ where: { venue_symbol: { venue, symbol } }, data: { pendingEmit: false, emittedAt: new Date() } })`, with errors caught and logged.

## 3b2. New `ingest/republish.js`
`startRepublish({ prisma, redis, intervalMs = 30000 })` returns a stop function. Non-overlapping.
- Each tick: find up to 50 posts with `hotPublishedAt: null` and `firstSeenAt >= now - 2h`, ordered by firstSeenAt asc, including `instruments` and `votes`.
- For each, in order: serialize (`../lib/serialize`), multi `lpush` / `ltrim 0 999` / `publish news:new`. On success, set `hotPublishedAt`. On failure, stop this tick.
- Log counts only when > 0.

## 3c. `ingest/discord.js` — durable alerts
Replace immediate sending with a queue kept in Postgres.
- `class Alerts { constructor({ prisma, redis }) ; async enqueue(dto, { warm }) ; async healthAlert(name, text) }`
- `enqueue` uses the same eligibility rules as now: webhook configured, warm, importance ≥ 70, published ≤ 48 h, ticker ∩ portfolio non-empty.
  - If eligible → `prisma.post.update({ where: { id: dto.id }, data: { alertState: 'pending' } })`.
  - Do NOT touch Redis dedupe keys here.
- `startAlertWorker({ prisma, redis, alerts, intervalMs = 15000 })` returns a stop function. Non-overlapping. Each tick, for up to 10 posts with `alertState: 'pending'`, ordered by firstSeenAt asc, including instruments:
  1. If `await redis.exists('alert:story:' + (storyId || id))` → set `alertState 'skip'` (another source of the same story was already sent within 30 min).
  2. Else POST to the webhook (content format unchanged).
     - HTTP 2xx → `redis.set('alert:story:' + key, '1', 'EX', 1800)`, then `alertState 'sent'`.
     - Otherwise, or on a network error → `alertAttempts += 1`; if it reaches 5 → `alertState 'failed'`; else stay `'pending'` (retried next tick).
     - On HTTP 429, stop the tick and respect `retry_after` if present.
- `healthAlert` is unchanged in behaviour, but it must set its Redis dedupe key only AFTER a successful POST.
- Export `{ Alerts, startAlertWorker }`.

## 3d. `ingest/adapters/symbols.js` — durable pending events
- REMOVE the in-memory `recentEmits` 5-minute re-emit logic.
- When a new BASE is detected, create the KnownSymbol row with `pendingEmit: true`. Existing-base / new-quote rows are created with `pendingEmit: false`.
- Each run, after the size checks, load pending rows: `prisma.knownSymbol.findMany({ where: { venue, pendingEmit: true, firstSeenAt: { gte: new Date(Date.now() - 24*3600e3) } } })`.
- Emit an item for EVERY pending row (new ones and older unacknowledged ones). Same fields as now plus `symbolRef: { venue, symbol }`.
- The per-cycle flood cap still applies to NEW bases detected in this cycle: more than 10 → create them with `pendingEmit: false` and emit nothing for them.

## 3e. `ingest/scheduler.js` — the watchdog covers the full cycle
1. Wrap `onItems` in its own watchdog: `onItemsWd = Math.max(60000, items.length * 2000)`. On timeout, throw `Error('onItems watchdog timeout')` → handled like any other onItems failure (`consecutiveSaveErrors`, `lastSaveErr`).
2. **Non-overlap guard.** Keep `state.inflight` (the promise of the current `adapter.run()`). If a previous run timed out but its promise has not settled, do NOT start a new run: log once `[sched] <name> previous run still pending, skipping`, then reschedule after `intervalMs`. Clear `state.inflight` when the promise settles (`.finally`).
3. Health persistence must never block the loop: call `this._persist(...)` WITHOUT awaiting it (`.catch(() => {})`) and schedule the next run immediately.

## 3f. `ingest/tickers.js` + `ingest.js` — a forced refresh that really refreshes
- Change the signature to `async function loadUniverse(opts = {})` with `opts.force === true` meaning skip the cache TTL and fetch from CoinGecko (fall back to the cache on fetch failure).
- Accept the legacy call `loadUniverse(true)` as `force: true` for safety: `if (opts === true) opts = { force: true }`.
- Export an internal counter `_stats = { fetches: 0 }`, incremented per CoinGecko HTTP call, so tests can assert a forced refresh fetched.
- In `ingest.js` the daily refresh calls `loadUniverse({ force: true })`.

## 3g. Wiring and simplifications
- `ingest.js`:
  - `new Alerts({ prisma, redis })`;
  - `onItems` calls `alerts.enqueue(dto, { warm })` instead of `maybeNewsAlert`;
  - start `startAlertWorker({ prisma, redis, alerts })` and `startRepublish({ prisma, redis })`, stopping both on shutdown.
- `ingest/adapters/bybit.js`, `bitget.js`, `kucoin.js`: `intervalMs: 2500` (they alternate two feeds, so each feed is still polled every ~5 s as planned).
- `src/app/api/posts/[id]/label/route.ts`: apply the label to the whole story.
  - After finding the post, `prisma.post.updateMany({ where: { storyId: post.storyId ?? post.id }, data: { userLabel: label } })` (plus the post itself if its storyId is null).
  - Then reload and publish each updated post (`updateHotList` for each).
  - Respond with the clicked post's DTO.
