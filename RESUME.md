# Sahasra — where we stopped (2026-09-25, ~2:10 PM ET)

> Sahasra — "the final path to the Oneness". A free, self-hosted CryptoPanic-style crypto news terminal whose main job is
> **per-coin altcoin news for the ~500 Binance perps watched by the ShivaShakthi base-break dashboard**.


## DEPLOYED on Windows — 2026-09-25 11:27 PM ET (26 Sep 03:27 UTC)
- Merged cloud branch into main (dc9ea4f); all 25 suites PASS on Windows; Fable LIVE check = GO (report `build/p3_live_check.md`).
- Pre-deploy patch from the live check: removed dead `blog:kraken` (403) and dead TG `PeckShieldAlert`/`CertiKAlert`; fixed `yt:theblock` channelId → `UCqjFueYMJ78eF6G0lGLzzpQ`; all YouTube `verified:false` for day one (YouTube RSS ~79% success from this IP — otherwise it marks news health degraded); official.js timeouts 30 s (ENS forum is slow) + `DRC|delist(ing)?` in GOVERNANCE_RE. `.env`: `GNEWS_TIERS="A,B"`.
- Live after restart: 108 adapters, news_live.json health.ok=true (tier-1 12/12, stale none), UI 4180 up (/coin/BTC, /api/search OK). **Coverage 42/50 setup coins (84%)** (was 8/48 at 11:54 AM).
- Startup-folder shortcut "Sahasra News Collector.lnk" added 2026-09-26 (runs start-news-hidden.vbs at login). The web UI (port 4180) is NOT auto-started.

## NEXT (in order)
1. ✅ DONE 2026-09-26 00:01 ET — **All-caps tagger fix** (tickers.js `isAllCapsTitle` incl. relay-label stripping for BWEnews "Tree News: …: BBG Tree News:"; bare tokens in all-caps titles only for curated `ambiguous:false` coins). Fable APPROVED (0 new false tags over 2,776 DB titles). Tests `build/tests/p3_allcaps.test.js` 30/30. **Tagger is now safe for the Discord webhook** (still needs DISCORD_NEWS_WEBHOOK from the user).
2. Official GitHub: SUI / AVAX / OP releases never appear (CI/RC tags crowd the atom feed) → switch to api.github.com releases/latest or drop.
3. After 24 h clean: flip `verified:true` on working TG/GitHub/forum sources (and YouTube if its success rate improves); consider `GNEWS_TIERS="A,B,C"` if no Google 429s.
4. 24 h soak (`node build/tests/soak_check.js`), Astra batched review (`build/astra_pending_review.md`), Opus ship-gate, Discord webhook (needs user).
- Postgres session tz is Asia/Calcutta and firstSeenAt is naive UTC: in SQL use `(now() at time zone 'utc') - interval ...`.

## How it runs
- **Collector (always on):** `app/supervisor.js`, launched hidden by `app/start-news-hidden.vbs`. Services: `ingest` (all sources) + `signals` (frozen signal-time snapshots). Stop: create `app/logs/STOP`. Logs: `app/logs/*.log`, status `app/logs/status.json`.
- **Web UI:** `cd app && npm run build && node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 4180` (or `supervisor.js --with-ui`, which also starts WSL Redis + WS server). Default mode runs with `NEWS_REDIS=off` (in-memory stand-in).
- **Dashboard chips:** `D:\claude projects\crypto\screener\news_chip.js` reads `news_live.json` (schema 2). A copy is in `external/news_chip.js`.
- **DBs:** local PostgreSQL 18 — live `cryptonews`, tests `cryptonews_test` (URL in `build/tests/.test_db_url`, not in git). Credentials in `.pg_credentials` / `app/.env` (not in git; see `app/.env.example`).
- **Tests:** `bash build/tests/run_all_tests.sh` (all suites, isolated test DB). Coverage metric: `node build/tests/coverage_probe.js` (log in `build/coverage_log.txt`).

## Working rules (user's)
- Claude orchestrates only; **all code is written by GLM** (`python "D:\claude projects\glm_build.py" --model glm --file <abs> --task "<spec>"`). Send GLM edits **one at a time with ~20 s pauses** (rate limit code 1302 otherwise).
- **Cloud sessions (claude.ai/code):** GLM is unreachable there, so code is written by a **Sonnet** subagent (Agent model "sonnet"); Fable still reviews. Back on the local clone, switch code-writing back to GLM.
- Test-first: write/extend `build/tests/*.test.js`, then GLM, then run the suite.
- **Fable reviews every step** (Agent model "fable"); deploy only after Fable APPROVED. **Astra (ChatGPT) is for batched review passes only** — pending items are listed in `build/astra_pending_review.md`.
- Deploy = STOP file → wait for node procs to exit → remove STOP → run `start-news-hidden.vbs`.

## Done today (all deployed, Fable-approved)
- Phase 2 steps 1–7 + fix rounds 1–3 (Astra's 9 blockers B1–B9). Signal snapshots (`SignalSnapshot` table). Sources: Binance CMS, Bybit, Bitget, KuCoin, Bithumb, Upbit, OKX spot/swap, Coinbase (+delisting debounce), Hyperliquid, BWEnews Telegram, RSS.
- Neon theme + Sahasra header/lotus/tab icon.
- **Phase 3 (plan: `build/phase3_plan.md`, Fable order 1 → 4A → 2 → 3 → 5 → 4B/C → 6 → 7 → 8):**
  - Step 1 ✅ `newsCount48h`/`newsLatest` in news_live.json, neutral 📰 N chip, stocks/TradFi perps never tagged (Binance exchangeInfo `underlyingType`), `/api/news` default minImportance 0.
  - Step 4A ✅ per-coin Google News (`app/ingest/adapters/gnews.js`, `coinMatch.js`, `coinSources.json` (Fable-curated, 50 coins), `watchlist.js`). Tier A = live setups + portfolio, every 20 min, budget 5000/day, `alertable:false`. **Coverage 8/48 → 38/50 setup coins.**
  - Date-display bug ✅ feed column = Published time (not collected time); main feed = last 48 h published; Rising/Trending by publishedAt.
  - Step 2 ✅ tagger recall (curated aliases gate, freeOccurrence spans, people/exchange-name rules, BSC excluded) — Fable A/B on 1470 titles: +148 tags ≈95% precision.

## Phase 3 COMPLETE in cloud session (2026-09-25 evening) — NOT YET DEPLOYED
Steps 3 (fix), 5, 4B/C, 6, 7, 8 + final whole-project fix round are all written (Sonnet in cloud), Fable-APPROVED and pushed on branch `claude/laughing-cerf-6h5fd6`.
**Read `build/HANDOFF_phase3.md` first** — deploy steps, what to watch in the first hour/day, rollback, keys needed, open follow-ups.

### Next actions (local)
1. `git pull` the branch, `cd app && npm run build`, restart collector (STOP file → wait → remove → start-news-hidden.vbs) and web UI. Recommended day one: `GNEWS_TIERS="A,B"` in app/.env.
2. First hour: check ingest.log for `tg:bwenews error`, `[gnews]` 429s, `looks dead` (flip `verified:true` on working TG channels / official sources), `[health]`.
3. Run `node build/tests/coverage_probe.js`; after 24 h `soak_check.js`.
4. Astra batched review of Phase 3 (listed in `build/astra_pending_review.md`), then Opus ship-gate.
5. Optional from user: Reddit script-app keys (2FA off account), COINGECKO_DEMO_KEY, DISCORD_NEWS_WEBHOOK.

### Test harness notes
- `run_all_tests.sh` now needs `cd app && npm run build` first (p3_step5_coin and p3_step8_look start `next start` on port 4190 and refuse a stale `.next`).
- New suites: p3_step4bc, p3_step6_sources, p3_step7_media_social, p3_step8_look, p3_step5_coin.

## Known non-blocking follow-ups (from Fable)
- Phase 3 follow-ups: see "Open follow-ups" in build/HANDOFF_phase3.md.
- coinMatch CONTEXT_RE lacks long/short/position/leverage/hacked/exploited; aliases ending "Chain/Network" hide chain context (BNB Chain); case-insensitive curated aliases (Pengu game, "World network").
- ~~gnews state file written every tick~~ fixed in 4B/C (write on change, prune >7 d unlisted).
- `newsCount48h` includes importance-10 price-bot items (media/social now excluded) — still open: count ≥20 only?
- ~~newsFile.js 5000-row query every 5 s~~ fixed in the final round (chips/counts split, 15 s interval).
- Uncovered setup coins at last probe: ARK BR BROCCOLI714 MUBARAK ONE SAGA TRUMP WLD XAI XMR XPL 龙虾 (several simply had no news).
