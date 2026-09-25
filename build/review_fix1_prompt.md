You are re-reviewing Phase 2 steps 1–3 of the crypto news collector after "fix round 1". Two reviewers (Fable and Astra) must BOTH approve before step 4 (the 24 h soak) starts. Verify by reading code and tests; do not speculate; do not modify files.

## Inputs
- Earlier reviews:
  - Astra: `build/review_steps1-3_astra.md` (9 blocking findings)
  - Fable: summarised below
- The fix spec written from the union of both reviews: `build/p2_fix1_spec.md`, sections F1–F10.
- Tests (all against an ISOLATED database `cryptonews_test`; `build/tests/assert_lib.js` refuses any other DB): `bash build/tests/run_all_tests.sh` runs 8 suites. The orchestrator's last run: 158/158 pass.
  - `step1_newsfile` 14
  - `step2_extract` 53
  - `step3_recover` 19
  - `step3_scheduler` 4
  - `step_redis_optional` 14
  - `fix1` 41 — new, covering every finding
  - `supervisor` 9 — new, on a temp copy
  - `details` 4 — new, includes one live Binance call
  - Tests edited because the reviewed semantics changed:
    - revisions now return the dto with `revised: true`;
    - alert retries use backoff (`alertNextAt`) instead of instant retries;
    - scheduler: no new fetch while a save is stuck;
    - the fake Redis `eval` implements the hot-list upsert.
- Fable's earlier blocking findings:
  1. The symbol flood cap was defeated by the pending loader.
  2. `healthAlert` reserved its key before the POST.
  - Plus non-blocking items: priceTicker on revision; revisions not re-alerted; revision churn; failed refresh emptying the universe; ETF "pull in" / ambiguity; "Arbitrum DEX" chain words; stock-index perps as crypto listings; symbol duplicate-path ack; supervisor rotation only at restart, the no-op status interval and the PID-reuse lock; `soak_check` needing ioredis.
- Code changed in this round:
  - `app/ingest/tickers.js`, `classify.js`, `adapters/symbols.js`, `store.js`, `discord.js`, `republish.js`, `scheduler.js`, `newsFile.js`, `price.js`, `redisOptional.js`, `ingest.js`
  - `app/supervisor.js`
  - new: `app/ingest/hotListUpsert.js`, `app/ingest/details.js`
  - Prisma: `Post.alertSentAt`, `Post.alertNextAt`
  - test tooling: `build/tests/soak_check.js` (no ioredis)
- Live: the supervisor was restarted at 12:43 UTC on this code in collector-only mode (`NEWS_REDIS=off`).

## Questions
1. For EACH blocking finding in both earlier reviews: is it fixed? Answer FIXED / NOT FIXED / PARTIAL, with evidence (file:line and test name).
2. Did fix round 1 introduce any NEW bug or regression? Cite file:line plus a concrete scenario. Look especially at:
   - `store.js` new-post and revision paths plus the `details.js` fetch (latency / timeouts inside save);
   - the atomic alert claim;
   - the `hotUpsert` Lua script;
   - scheduler `itemsInflight`;
   - the supervisor exclusive lock and rotation;
   - `redisOptional` eval.
3. Are the changed tests still meaningful? Did any edit weaken a check that should have stayed strict?
4. Is anything still blocking step 4?

## Output
- First line: `VERDICT: APPROVE` or `VERDICT: CHANGES REQUIRED`
- Finding-by-finding table (both reviews)
- Blocking issues (numbered; file:line, evidence, exact fix) — empty if you approve
- Non-blocking notes (short)
