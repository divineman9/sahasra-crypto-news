You are an independent step-gate reviewer for a crypto news system. Two reviewers (Fable and Astra) must BOTH approve before the next step starts. Be rigorous: verify claims by reading code and tests. Do not speculate, and do not modify any file.

## Project
A self-hosted real-time crypto news collector for a solo trader on Windows 11 with low RAM.
- The collector is `app/ingest.js` plus `app/ingest/**`, supervised by `app/supervisor.js`.
- It writes `D:\claude projects\crypto\screener\news_live.json`.
- `D:\claude projects\crypto\screener\news_chip.js` reads that file and puts news chips on the trader's ShivaShakthi base-break dashboard (`base_break.html` in the same folder).
- **Purpose:** show "news on this coin ≤48 h" as a filter/veto next to trading signals.

## What is under review: Phase 2 steps 1–3 (from Astra's earlier 5/10 review, `build/astra_review.md`)
- **Step 1, flag contract**
  - spec: `build/p2_step1_spec.md`
  - code: `app/ingest/newsFile.js`, `crypto/screener/news_chip.js`, and the future-date quarantine in `app/ingest/store.js`
  - test: `build/tests/step1_newsfile.test.js`
- **Step 2, extraction and sentiment**
  - code: `app/ingest/tickers.js`, `app/ingest/classify.js`
  - test: `build/tests/step2_extract.test.js`
- **Step 3, recoverable processing**
  - spec: `build/p2_step3_spec.md`
  - code: `app/ingest/store.js`, `republish.js`, `discord.js`, `adapters/symbols.js`, `scheduler.js`, `tickers.js` (the loadUniverse options), `app/ingest.js`, and `app/src/app/api/posts/[id]/label/route.ts`
  - tests: `build/tests/step3_recover.test.js`, `build/tests/step3_scheduler.test.js`
- **Also added**
  - `app/supervisor.js` and `app/start-news-hidden.vbs`: single instance, restart with backoff, rotating logs, STOP file
  - `app/ingest/redisOptional.js`: `NEWS_REDIS=off` in-memory stand-in (the supervisor's default mode, avoiding a ~1 GB WSL VM)
  - test: `build/tests/step_redis_optional.test.js`
- **Evidence log:** the bottom of `build/p1_evidence.md`. All suites run via `bash build/tests/run_all_tests.sh`; the reported result is 105/105 assertions passing.
- **Live state:** the supervisor has been running since ~11:45 UTC in collector-only mode. `news_live.json` is schema 2, and 8/8 tier-1 adapters are healthy.

## Review questions
1. Does each step actually satisfy its spec and Astra's original finding, as far as you can verify? Check especially:
   - a stale feed hides the chips;
   - a listing cannot hide a hack;
   - chain vs venue vs subject tagging;
   - the 20-ticker cap;
   - ETF / lawsuit sentiment;
   - corrections keep the clocks;
   - the republish worker;
   - durable Discord delivery without duplicates;
   - symbol re-emission until acknowledged;
   - the full-cycle watchdog and the overlap guard;
   - the forced universe refresh;
   - Redis-off mode.
2. Are the tests real assertions that would FAIL on a regression? Are there important untested paths?
3. Any NEW bug or regression introduced by these changes (cite file:line and evidence)? Consider especially:
   - the stand-in Redis;
   - supervisor restart / lock handling on Windows;
   - schema 2 compatibility with the chip;
   - the label route updating a whole story.
4. Is anything in steps 1–3 unfinished, such that the next step (4: a 24-hour soak/operational gate) should not start?

## Output (tight)
- `VERDICT: APPROVE` or `VERDICT: CHANGES REQUIRED` (first line)
- **Blocking issues:** a numbered list with file:line, evidence and the exact fix. Empty if you approve.
- **Non-blocking notes:** a short list.
- **Test gaps worth adding:** a short list.
