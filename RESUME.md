# Sahasra — where we stopped (2026-09-25, ~2:10 PM ET)

> Sahasra — "the final path to the Oneness". A free, self-hosted CryptoPanic-style crypto news terminal whose main job is
> **per-coin altcoin news for the ~500 Binance perps watched by the ShivaShakthi base-break dashboard**.

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

## IN PROGRESS — resume here
**Phase 3 step 3: +43 RSS feeds** (49 total; regulators CFTC/Fed/DOJ/ECB crypto-filtered; blogs Kraken/Chainalysis/Ethereum/Solana).
- Code DONE by GLM: `app/ingest/config.js` (feeds + `CRYPTO_FILTER`), `app/ingest/adapters/rss.js` (per-feed tier/kind/intervalMs/maxItems/filter/titlePrefix). Backups `*.pre_f3`.
- Tests: `build/tests/p3_step3_feeds.test.js` 12/12 PASS; already added to `run_all_tests.sh`.
- **Next actions:**
  1. Run the full suite `bash build/tests/run_all_tests.sh` (was interrupted before finishing).
  2. Fable review of step 3 (config.js, rss.js vs `.pre_f3`; check load of 49 feeds, health alarms for tier-3 feeds, duplicate stories vs clustering).
  3. Deploy (restart collector), then `node build/tests/coverage_probe.js`.

## Remaining after step 3
5. `/coin/[ticker]` page + search + source tabs (+ "hide tier-4 importance<30" toggle / Important filter — gnews volume dominates the feed otherwise).
6. Step 4B/C: gnews for portfolio + top-100 (60 min) and the rest (12 h, batched OR queries).
7. Telegram wires via generalized t.me/s adapter (TreeNewsFeed, wublockchainenglish, WatcherGuru, whale_alert_io, Walter_Bloomberg, PeckShieldAlert, CertiKAlert) + official blogs/GitHub releases/governance forums via CoinGecko links.
8. YouTube Media tab (14 verified channel IDs in `build/review_fable_cryptopanic_gap.md`) + Reddit Social tab (**needs user's free Reddit "script" app keys**).
9. Look parity (favicons, Important/Saved filters, wider headlines, 7-day scroll).
Then: Step 8 Discord alerts (**needs DISCORD_NEWS_WEBHOOK from user**), Astra batched review of everything in `build/astra_pending_review.md`, 24 h soak, Opus ship-gate.

## Known non-blocking follow-ups (from Fable)
- coinMatch CONTEXT_RE lacks long/short/position/leverage/hacked/exploited; aliases ending "Chain/Network" hide chain context (BNB Chain); case-insensitive curated aliases (Pengu game, "World network").
- gnews state file written every tick; `titleKeys`/`urls` maps never pruned.
- `newsCount48h` includes importance-10 price-bot items — decide at step 5 whether the 📰 chip counts ≥20 only.
- newsFile.js 5000-row query every 5 s — revisit interval at higher volume.
- Uncovered setup coins at last probe: ARK BR BROCCOLI714 MUBARAK ONE SAGA TRUMP WLD XAI XMR XPL 龙虾 (several simply had no news).
