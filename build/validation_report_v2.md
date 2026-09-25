# Validation Report v2

## Validation Score: 8/10

The app meets user spec steps 1–5 and most of the build contract. Your live runs cover every part of the data flow. I found one crash bug in the WebSocket server and one setup problem that stops real-time updates for anyone who follows the README. Both are small fixes. (Note: there's no `node_modules` in the build directory here, so I checked the `ws` crash behavior against how `ws` v8 is known to work, not against the installed copy.)

## Passed Checks
- **Step 1 (frontend):** Next 15 App Router, Tailwind v3, dark mode (`className="dark"`, `bg-slate-900`) and a three-column layout (`grid-cols-[220px_minmax(0,1fr)_280px]`). Each column scrolls on its own.
- **Step 2 (store and mock data):** a Zustand v5 store with `persist` saving only `portfolio` under `cnt-portfolio`. There are exactly 20 `MOCK_POSTS` (`mock-1`..`mock-20`), with more than 3 scoring ≥ 8. The feed rows are dense (`h-7 text-xs`) with the contract's column grid.
- **Step 3 (database):** `schema.prisma` matches the contract exactly (`@@index([publishedAt])`, `onDelete: Cascade`). `GET /api/posts` uses Prisma cursor pagination (`take: limit+1`, `skip: 1`), limits 1..100, returns 400 for an invalid cursor, 500 for DB errors, and sends `Cache-Control: no-store`.
- **Step 4 (ingest):** `ingest.js` adds a post every `INGEST_INTERVAL_MS` using `setTimeout` chaining, so ticks can't overlap. One failed tick doesn't stop the loop, and SIGINT/SIGTERM shut it down cleanly.
- **Step 5 (WebSocket):** `ws-server.js` has its own subscriber connection plus a separate connection for `LRANGE`. It sends a snapshot on connect (or an empty one if Redis fails), a 30 s ping/terminate heartbeat, and broadcasts only to OPEN clients. The client hook reconnects with backoff (1s→10s cap) and stops reconnecting after unmount.
- **Redis contract:** `LPUSH` + `LTRIM 0 999` + `PUBLISH` in one `multi()`, `news:update` on votes, and `prices:coingecko EX 60`.
- **Vote API:** Next 15 async `params`, only the four vote types allowed, 400/404/500 handled, and a failed Redis publish is caught so it doesn't fail the request.
- **Prices API:** the 10 coins in contract order, Redis cache first, 8 s AbortController timeout, a module-level last-good value, and always HTTP 200 with `stale: true` on failure.
- **Serialization:** `lib/serialize.js` and `src/lib/serialize.ts` use the same logic (instruments sorted by ticker, zero votes when missing, ISO dates).
- **Filters:** score, hot, rising, bullish, bearish and portfolio match section 4, sorted by `publishedAt` desc then `id` desc.
- **Security:** React escapes titles, all links use `rel="noopener noreferrer"`, and no credentials are hardcoded (`.env` is gitignored and `.env.example` has placeholders).

## Failed Checks (contract deviations)
1. **`lib/mockNews.js` vote ranges:** the code uses `randInt(0,5)/(0,4)/(0,2)/(0,1)`. The contract says bullish 0–15, bearish 0–10, important 0–6, toxic 0–3. With the smaller ranges, far fewer new posts reach Hot (your ~31%). This may have been done on purpose, but it isn't what the contract says.
2. **`ingest.js` instrument names:** `prisma.instrument.upsert({ create: { ticker, name: ticker } })`. The contract says to create each instrument with its name from `INSTRUMENTS`. If ingest runs before seed, or on a fresh database, the instruments get `name: "BTC"` and so on, and those wrong names show up in the DTOs.
3. **`src/lib/redis.ts` and `ingest.js`:** these use `enableOfflineQueue: true` where the contract says `false`. This change is reasonable: with `false`, the first request after a cold start fails because the connection isn't ready yet. Keep it, but note it as a known deviation.
4. **`src/app/layout.tsx`:** adds `font-mono` to the whole `<body>`. The contract gives the body class without it and puts monospace only on numbers and tickers. This is cosmetic.
5. **`vote/route.ts`:** uses two `as any` casts. The contract says no `any` unless unavoidable. These can be typed with `Prisma.VoteDataUncheckedCreateInput` / `Prisma.VoteDataUpdateInput`.

## Critical Issues (must fix before shipping)
1. **`ws-server.js`: one bad client can crash the WebSocket server.** No `ws.on('error', …)` listener is attached inside `wss.on('connection')`. In `ws` v8, a protocol error (an invalid frame, bad UTF-8 or an oversized payload) emits `'error'` on that socket. With no listener, Node throws an unhandled `'error'` event and the whole process exits, which ends live delivery for every client. Any local client can trigger this.
   - **Fix:** add `ws.on('error', (e) => console.error('[ws] client error:', e.message));` in the connection handler.
   - **Also:** add `wss.on('error', …)` so a port clash (EADDRINUSE) gets a clear log message instead of a raw stack trace.
2. **Redis lifetime in WSL (README and `redis:start`).** `wsl -d Ubuntu -u root -- service redis-server start` starts Redis as a background service and then exits. WSL shuts the distro down when it's idle, which kills Redis, as you saw. Anyone following the README literally loses real-time updates within seconds or minutes: the WS snapshot comes back empty, new posts aren't broadcast, and the hot list isn't updated.
   - **Fix:** run Redis in the foreground as part of `npm run all`. For example, add a `"redis": "wsl -d Ubuntu -u root -- redis-server"` script and include it in the `concurrently` command, or at least document that a WSL session must stay open.
   - **Also:** add `sudo apt install redis-server` to the README prerequisites.

## Nice-to-have Improvements
- **REST and WebSocket race on first load:** `hydrate()` replaces the whole post list. If the WS snapshot or a live `post` frame arrives before the `/api/posts` response, and the REST query ran before that post was inserted, the post disappears from the UI. Merging by id instead of replacing (as `mergeSnapshot` already does) would fix this.
- **Performance:** `FeedRow`, `NewsFeed`, `LeftSidebar` and `TrendingCoins` call `useFeedStore()` with no selector. Every store change re-renders all rows (up to 1000), including a clock-free change like `wsStatus` or each 5 s post. Use narrow selectors, `useShallow`, and `React.memo(FeedRow)`.
- **`flashIds` is never pruned:** it grows by one entry every 5 s for the whole session. Prune entries older than 2.5 s inside `upsertPost`.
- **`useFeedSocket` status:** while disconnected it shows `connecting` and only shows `closed` on unmount, so the red "closed" dot never appears when the server is down. Set `closed` in `onclose` and `connecting` when a reconnect attempt starts.
- **Client frame validation:** the hook checks only that `msg.post` is an object. A `{type:"post", post:{}}` frame would crash rendering at `post.instruments.map`. Add a minimal shape check. The same goes for the `as never[]` cast in `useHydratePosts`.
- **`api/prices`:** if CoinGecko returns 200 with an empty object, `lastGood` is overwritten with `prices: []` and cached for 60 s. Only update `lastGood` and the cache when `prices.length > 0`.
- **Network exposure:** the WS server (no `host`) and `next dev` listen on all network interfaces, and the vote endpoint has no authentication or rate limit, so anyone on your network can inflate votes. For a local app, bind to `127.0.0.1` (`new WebSocketServer({ host: '127.0.0.1', port })`, `next dev -H 127.0.0.1`).
- **`prisma/seed.js`:** writes the votes twice (the nested `votes.upsert` and then `voteData.upsert`) and then re-fetches each post. Any one of these alone is enough. Also, `process.exit(1)` in `catch` skips `$disconnect()`, which is harmless.
- **`ws-server.js`:** logs "listening" twice (once on the `listening` event, once unconditionally at the end), so the last line can print even when binding failed.
- **Windows shutdown:** `concurrently -k` on Windows kills child processes with `taskkill /F`, so the SIGTERM handlers never run. Ctrl+C (SIGINT) still works. This is only worth knowing.

## Ship Decision: SHIP WITH FIXES
Fix the two critical issues first: the per-socket error handler in `ws-server.js` and keeping Redis running in the foreground (README plus the `all` script). Fixing the two contract deviations is also advisable: instrument names from `INSTRUMENTS` in `ingest.js` and the vote ranges in `mockNews.js`. Everything else can wait for a later pass.