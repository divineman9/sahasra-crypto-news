VERDICT: CHANGES REQUIRED

**Blocking issues:**

1. **Context tagging remains inconsistent** — [tickers.js:238](<D:/claude projects/crypto-news-terminal/app/ingest/tickers.js:238>). Reproduced: “Protocol hacked on Solana (SOL)” tags SOL; “Hyperliquid (HYPE) lists XYZ…” tags HYPE; “OP hacked…” tags nothing. **Fix:** apply shared subject/chain/venue disambiguation to hints, dollar tickers, parentheticals and bare tokens; permit explicit subjects before applying ambiguity blocks.

2. **Sentiment still reverses material actions** — [classify.js:63](<D:/claude projects/crypto-news-terminal/app/ingest/classify.js:63>). Reproduced bullish results for “Judge refuses to dismiss SEC lawsuit…” and “SEC has not approved Solana ETF”; “SEC approves Solana ETF after delays” becomes bearish. **Fix:** account for negation and action scope; return neutral for unresolved ambiguity.

3. **Step 2’s detail extraction is unfinished** — [bybit.js:38](<D:/claude projects/crypto-news-terminal/app/ingest/adapters/bybit.js:38>), [store.js:81](<D:/claude projects/crypto-news-terminal/app/ingest/store.js:81>). Exchange adapters retain titles and empty hints; no selective detail-fetch path exists. **Fix:** fetch and extract affected assets from important incomplete notices, detect material detail revisions, and preserve original clocks.

4. **Symbol recovery has three confirmed failures** — [symbols.js:109](<D:/claude projects/crypto-news-terminal/app/ingest/adapters/symbols.js:109>), [store.js:44](<D:/claude projects/crypto-news-terminal/app/ingest/store.js:44>). Probes: 15 new bases emit **10** despite flood suppression; failed symbol-row insertion leaves no durable row and no subsequent retry; failed acknowledgement is never retried because duplicate posts return early. **Fix:** determine the complete flood batch before assigning pending flags, update in-memory known sets only after persistence, and reconcile acknowledgements against already-committed posts.

5. **Discord delivery is neither reliably queued nor duplicate-safe** — [discord.js:46](<D:/claude projects/crypto-news-terminal/app/ingest/discord.js:46>), [discord.js:97](<D:/claude projects/crypto-news-terminal/app/ingest/discord.js:97>). Enqueue database failures are swallowed. Successful delivery followed by Redis failure caused repeated sends; resetting MemoryRedis caused another send for the same story. Health-alert failure reserved the key and suppressed retry. Five failures also terminate retries before a ten-minute outage can recover. **Fix:** persist eligibility transactionally with the post; use a durable per-story delivery ledger independent of Redis, reconcile uncertain deliveries, retain recoverable pending work, and set health dedupe only after success.

6. **Republishing is not idempotent** — [republish.js:43](<D:/claude projects/crypto-news-terminal/app/ingest/republish.js:43>). A successful Redis write followed by failed database acknowledgement produced **two hot-list entries** for one post on retry. **Fix:** atomically upsert/deduplicate Redis entries by post ID and make replayed notifications idempotent.

7. **The watchdog permits overlapping saves and misleading health** — [scheduler.js:112](<D:/claude projects/crypto-news-terminal/app/ingest/scheduler.js:112>), [newsFile.js:65](<D:/claude projects/crypto-news-terminal/app/ingest/newsFile.js:65>). Accelerated watchdog probes produced two unresolved save batches concurrently. A fixture with 20 consecutive save failures still reported `health.ok: true`. The price worker also lacks an overlap guard. **Fix:** track unresolved processing through completion or cancellation, bound sink operations, base health on completed cycles/save failures, and guard the price worker.

8. **Failed universe refresh can erase working indexes** — [tickers.js:132](<D:/claude projects/crypto-news-terminal/app/ingest/tickers.js:132>). Reproduced with failed fetches and unavailable cache: an existing coin-name mapping disappeared. **Fix:** retain current indexes unless a valid replacement universe has been obtained.

9. **Supervisor single-instance and bounded-log claims fail** — [supervisor.js:90](<D:/claude projects/crypto-news-terminal/app/supervisor.js:90>), [supervisor.js:50](<D:/claude projects/crypto-news-terminal/app/supervisor.js:50>). In-memory interleaving of two stale-lock startups launched two collectors. Continuous logging exceeded 6 MiB without rotation; repeated rotations both targeted `.1.log`, never advancing it. **Fix:** use atomic, ownership-checked locking with safe stale-lock recovery; rotate active streams by size and correctly advance backup generations.

**Non-blocking notes:**

- Hold Step 4 pending fixes and both reviewers’ approvals.
- Schema 2 rendered separate red hack/green listing chips; a 61-second stale snapshot removed both in a DOM stub.
- The 20-ticker cap works. Successful title corrections preserve clocks in the inspected update. The label route covers existing story members, including a null-story root.
- Fresh verification: **71 assertions passed**—14 with file I/O held in memory, 53 using cached data with writes/network blocked, and four scheduler assertions unchanged. All 24 inspected JavaScript files parsed. I did **not** independently rerun 105/105.
- Live snapshot inspection confirmed schema 2 and reported 8/8 tier-1 health; the health defect above limits that evidence.

**Test gaps worth adding:**

- The suites contain real failing assertions, but Step 1 has no browser test or expired/future fixtures despite its description.
- Add the reproduced context, negation, symbol flood/write/ack, publication-ack and Redis-off restart failures.
- Test ten-minute outages, enqueue failure, overlapping saves, hung workers and unsuccessful universe refresh.
- Test concurrent supervisor startup, Windows restart/lock recovery, continuous rotation and whole-story labeling.
- Isolate integration tests in a dedicated database: current recovery workers query unrestricted pending rows and can acknowledge real posts using fake Redis/webhook delivery.

No files were modified.
