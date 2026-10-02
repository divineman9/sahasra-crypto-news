# Sahasra — where we stopped (2026-09-25, ~2:10 PM ET)

> Sahasra — "the final path to the Oneness". A free, self-hosted CryptoPanic-style crypto news terminal whose main job is
> **per-coin altcoin news for the ~500 Binance perps watched by the ShivaShakthi base-break dashboard**.


## DEPLOYED on Windows — 2026-09-25 11:27 PM ET (26 Sep 03:27 UTC)
- Merged cloud branch into main (dc9ea4f); all 25 suites PASS on Windows; Fable LIVE check = GO (report `build/p3_live_check.md`).
- Pre-deploy patch from the live check: removed dead `blog:kraken` (403) and dead TG `PeckShieldAlert`/`CertiKAlert`; fixed `yt:theblock` channelId → `UCqjFueYMJ78eF6G0lGLzzpQ`; all YouTube `verified:false` for day one (YouTube RSS ~79% success from this IP — otherwise it marks news health degraded); official.js timeouts 30 s (ENS forum is slow) + `DRC|delist(ing)?` in GOVERNANCE_RE. `.env`: `GNEWS_TIERS="A,B"`.
- Live after restart: 108 adapters, news_live.json health.ok=true (tier-1 12/12, stale none), UI 4180 up (/coin/BTC, /api/search OK). **Coverage 42/50 setup coins (84%)** (was 8/48 at 11:54 AM).
- Startup-folder shortcut "Sahasra News Collector.lnk" added 2026-09-26 (runs start-news-hidden.vbs at login). The web UI (port 4180) is NOT auto-started.

## 2026-10-02 - P5 Phase P3 (forward log, outcomes, base rates, history) + UI theme fixes + public sync
- Forward log: `ingest/explain/outcomes.js` -> `cache/explain/forward_log.jsonl` (append-only, last line per event_id wins). Row on a live event (p0/btc0 via Binance perp ticker; macro uses BTC; no price -> status no_price). Hourly job (inside the 10-min explain tick) fills d1/d7/d30 = coin move and move vs BTC once t0+horizon passed; done when d30 filled.
- Base rates: `baseRates.js` -> `cache/explain/base_rates.json`; rebuilt monthly (1st, 03:00 ET, idempotent per ET month) and once on first run; merges the PRIVATE seed `cache/explain/base_rates.seed.json` (unlock:supply_shock n 236 / lower 171 / median -16.3, source "study 2026-09"; n-weighted median when the log also has rows). "Historically X of N ..." appears on the down scenario only when n >= 20, otherwise the literal "Not enough comparable cases" stays (also in the uncertain list). History = same category:subtype rows from the log (same coin first, finished rows first, max 5).
- IMPORTANT: `app/ingest/cache/explain/` was NOT git-ignored before today (the parent .gitignore only listed gnews_tiers.json); now ignored. Never commit it (events, forward log, seed, rates, rewrite cache).
- GLM rewrite ENABLED: app/.env has EXPLAIN_REWRITE_CMD (gitignored). EXPLAIN_UNLOCK_CALENDAR and EXPLAIN_PRIVATE are still unset (news-parsed unlocks only; no funding/OI line) - set them in app/.env if wanted.
- Number guard now knows eleven..twenty, dozen, hundred, thousand and catches "dot com" / bare domains.
- UI (user report): the app is dark neon only - the card/legend had followed the OS light scheme and rendered white. Removed the prefers-color-scheme switch (light tokens only under [data-theme="light"]); card, legend and Big news use the app's slate/cyan/violet shell, mono labels and chips. Added "Ten lenses" to the left nav, a link under the header tagline, and "About the ten lenses" links (header mark, card header, footer, heading marks -> /about/devis#<devi>). Legend uses the same shell as the post page (TopBar + bordered scroll area). Screenshots: build/p5_screens/ui_*.png.
- Tests: p5_outcomes added (35), p5_numguard 27, p5_ui_look 44 (theme under a light OS, links, home nav). Full suite PASS.
- PUBLIC SYNC done to sahasra-public (see that repo's commit): templates, gate/outcome code, devi art, legend, glossary, card UI, animations; NOT: seed, forward log data, rewrite worker, calendar path, funding/OI, build/. Private-only test: build/tests/p5_public_sanity.test.js.

## 2026-10-01 - P5 Phase P2 (motion, GLM rewrite, number guard, glossary, heat, sidebar) - built + tested, NOT restarted
- Motion: CSS keyframes in globals.css (`.devi.is-playing .devi-<name>-<part>`, only opacity/transform/stroke-dashoffset, 1 iteration, <= 4 s incl. stagger, no loop); `devi/playGate.ts` + client `DeviMark` (IntersectionObserver >= 50%, single play, cancel to static if it leaves mid-play, never with prefers-reduced-motion; legend marks replay on hover/tap/focus). Static frame = resolved final state. Deviations from the keyframe table: Tara waves rest at scaleY .35 and the dot's resting spot moved to the wave end; Bagalamukhi zigzag settles scaleY 1.8 -> 1 (not -> .05, which would erase the symbol); Kamala showering arcs animate dashoffset of their dotted pattern (slide in) rather than draw.
- GLM rewrite: `ingest/explain/{rewrite,numberGuard}.js`; private `build/tools/glm_rewrite.py` (ask_glm turbo). Off unless EXPLAIN_REWRITE_CMD (set it to `python "D:/claude projects/crypto-news-terminal/build/tools/glm_rewrite.py"` in app/.env). One call per facts-hash (sha1 category|subtype|facts), 1 in flight, EXPLAIN_REWRITE_DAILY_MAX (20), cache `ingest/cache/explain/glm_cache.json`, failures not retried for 24 h, 20 s timeout. Only why/tradeoffs/scenario title+condition are rewritten. Live forced run of 5 events: 5/5 accepted (an earlier run was correctly rejected for the word "sell"; prompt now steers to "trade/cash out").
- Glossary hovers (`lib/glossary.ts`, 27 terms, funding rate / open interest only with the private heat line), `HeatBadge` ("Volatility: high" at 24h range >= 8 %; private funding/OI line only with EXPLAIN_PRIVATE=1; heat.js looks up Binance perp 24h ticker, max 1 lookup per coin per 10 min; EXPLAIN_HEAT=0 disables), "What changed" line on merges (event.last_change), sidebar "Big news - today" (max 5) in RightSidebar.
- classify.js: freeze/halt headline with hack-like context (suspicious/outflow/exploit/drained/stolen/hack/breach/compromised/attacker) -> category hack; gate gives hack+freeze (no theft words) the halt subtype. Genuine maintenance stays maintenance.
- Tests added to run_all_tests.sh: p5_motion, p5_numguard, p5_rewrite, p5_heat; p5_gate/p5_merge/p5_ui_look extended. Full suite PASS. Screenshots: build/p5_screens/motion_{mid,final}_{dark,light}.png, motion_reduced_dark.png.
- NEXT: orchestrator restarts collector + web UI, add EXPLAIN_REWRITE_CMD to app/.env if GLM rewrite is wanted, then P3 (forward log, base rates, public sync).

## 2026-10-01 - P5 "Understand this" explain cards, Phase P1 (built + tested, NOT restarted)
- Spec: `build/p5_explain_cards_spec.md`. P1 = gate + templates + evidence + event store + card + 10 static Devi SVGs + legend page + APIs. GLM off. P2 (motion, rewrite, number guard, glossary, sidebar, heat) and P3 (forward log, base rates, public sync) NOT started.
- Ingest: `app/ingest/explain/{gate,facts,templates,evidence,events,timeET}.js` + `devi.json` (single source of the ten lenses). `classify.js` adds `flags {depeg,freeze}` (only when true) and exports parseUnlock/NEG_RE. `store.js` calls `explain.consider()` after each new post (try/catch; sets dto.explainEventId); `ingest.js` ticks queue promote/close every 10 min. Events live in `app/ingest/cache/explain/events.json` (git-ignored). Env: EXPLAIN_ENABLED (default on, 0 disables), EXPLAIN_UNLOCK_CALENDAR (private events_live.json path), EXPLAIN_PRIVATE, EXPLAIN_DIR (tests).
- UI: `app/src/components/devi/*` (10 marks + DeviMark + registry), `components/explain/*` (ExplainCard etc.), feed chip + expanded card in FeedRow, card in PostDetail, `/about/devis`, `/api/explain`, `/api/explain/[id]`, `explainEventId` on /api/posts, /api/posts/[id], /api/news. CSS tokens + `.explain-card` in globals.css (dark + light).
- Also fixed: /post/<id> opened directly stayed on "loading article..." (effect cleanup after the store upsert skipped setFetching(false)); now `fetching && !post`.
- Tests added to run_all_tests.sh: p5_gate, p5_merge, p5_templates, p5_evidence, p5_devi, p5_ui_look (headless Edge CDP on 9333). Full suite PASS. Screenshots in `build/p5_screens/`.
- Deviations flagged for Fable: (1) one card per coin+category+ET day (spec text says per coin, but 4.3 keys on category too); (2) news-parsed unlocks pass only when the pct basis is circulating/unspecified (total-supply pct needs the private calendar); (3) gate also drops posts older than 48 h; (4) freeze regex also accepts pauses/halting; (5) pale Devi accents (silver/ivory/pearl) darkened in the light theme only; (6) Kali's midnight blue is dim on the dark theme as specified (arc and dots use crimson).
- P1 REVISE round (Fable) applied: total/max-basis unlock pct >= 5 now passes (facts unlock_pct + unlock_pct_basis, own wording, circulating wins on merge); freeze/depeg need tier<=2 or exchange/official, freeze never on category maintenance, bare "below $0.9x" depeg only for stablecoin tickers; SVG <title> removed (data-name); legend page uses --ex tokens; evidence "+ 0 news sources" guard; non-http timeline URLs not linked. SPEC AMENDMENT: Kali dark colour #1b2559 -> #5b6ad0 (invisible on #0a0d1c). Deviation (2) from the list above is superseded.
- NEXT: orchestrator restarts collector + web UI (needs the new build), 1 h soak (<=3 events/h, 0 duplicates per coin/day), then P2.

## 2026-10-01 — Unlock category + supply-shock signal (built, NOT yet restarted/rebuilt)
- DONE: classify.js `unlock` category (regex unlock/vesting cliff/token release/emission, parses `unlockAmount` + `unlockPct`, bearish, importance 60 or 80 when pct >= 5 or amount >= 1e9); coinSources.json 2Z/DoubleZero alias; UI badge "Big unlock" (src/lib/ui.ts, types.ts); signalSnapshot.js adds "SUPPLY SHOCK x%" and "unlock sources disagree" reasons to eventReasons from events_live.json `supply_shock` / `max_pct` / `sources` / `unlock_disagreements` (absent fields = no change). Tests: build/tests/p4_unlock.test.js (19/19). Public copy got the classify/alias/UI parts only.
- REVISED (Fable review): unlock regex now context-anchored POS+NEG (no more 'Apple unlocks new feature'); importance 80 only when pct >= 5; `unlockPctBasis`; unit-less amounts; symbol-kind keeps importance; snapshot folds shock-row pct_circ and prefers disagreement badge text. p4_unlock 39/39.
- NEXT: `cd app && npm run build` (the two suites p3_step8_look / p3_step5_coin fail only on the stale-build guard until then), restart collector (picks up classify + signalSnapshot) and web UI (badge). Add p4_unlock to run_all_tests.sh is done locally (commit alongside p4_wide_watchlist).

## NEXT (in order)
1. ✅ DONE 2026-09-26 00:01 ET — **All-caps tagger fix** (tickers.js `isAllCapsTitle` incl. relay-label stripping for BWEnews "Tree News: …: BBG Tree News:"; bare tokens in all-caps titles only for curated `ambiguous:false` coins). Fable APPROVED (0 new false tags over 2,776 DB titles). Tests `build/tests/p3_allcaps.test.js` 30/30. **Tagger is now safe for the Discord webhook** (still needs DISCORD_NEWS_WEBHOOK from the user).
2. ✅ DEPLOYED 2026-09-26 01:19 ET — Official GitHub: when /releases/latest names a tag missing from the atom feed, official.js asks api.github.com/repos/<o>/<r>/releases/latest (SUI mainnet-v1.80.1 now shows; AVAX/OP latest are >7 d old). Tests in p3_step6_sources (147/147).
2b. ✅ DEPLOYED 2026-09-26 01:19 ET — Reddit KEYLESS mode (user: Reddit no longer issues API keys; user chose option 3 = Reddit RSS + Bluesky). reddit.js: mode() oauth|rss|off; one `reddit:multi` adapter requesting https://www.reddit.com/r/CryptoCurrency+CryptoMarkets+Bitcoin+ethereum+solana+defi/hot/.rss?limit=100 every 10 min, shared 60 s reddit.com gap, per-sub rssTake caps, AutoModerator/daily-thread filter, quietHealth. UA MUST be `SahasraNews/1.0 (self-hosted RSS reader)` — Reddit 403s the `web:...` form (verified live). Live smoke: 40 items. Tests p3_step7b_reddit_rss 24/24. Specs: build/reddit_alt_fable.md, build/reddit_alt_astra.md. If the user gets Reddit API keys, setting REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD switches to OAuth mode automatically.
2c. ✅ DEPLOYED 2026-09-26 01:19 ET — Bluesky: adapters/bluesky.js, one `bsky:all` adapter, 21 curated accounts (config.js BSKY_ACCOUNTS, DIDs), BSKY_FILTER on 17 mixed accounts, 10-min poll (floor 6 min for the watchdog), quietHealth. Spec build/bluesky_spec.md; tests p3_step7c_bluesky 33/33. Expect ~8–12 relevant items/day (Bluesky crypto community is thin, skews to fraud researchers/journalists).
   Fable review of 2+2b+2c APPROVED after fixes: GitHub API fallback only when the latest tag is missing from the atom FEED (not just >7 d old), Bluesky handle.invalid fallback, interval floor. Live after deploy: 110 adapters, health ok, Reddit 40 + Bluesky 22 items on first pull.
   Reddit Data API access REQUESTED 2026-09-26 (u/shashra-999, reply to the user's email). If approved: create a "script" app, put REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD in app/.env → OAuth mode switches on automatically (then consider serialising awaitRedditGap — Fable N5).
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
