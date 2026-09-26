# Sahasra Phase 3 — pre-deploy LIVE check on the Windows PC (2026-09-25, ~23:20 ET)

Code under test: local `main` at `dc9ea4f` (cloud branch merged). Nothing in the project was edited.
Method: the real adapter objects (`make()` → `run()`) were called from a scratch script with the production
caches redirected to `%TEMP%` (GNEWS_STATE_FILE, NONCOIN_CACHE_FILE), no DB, no Discord. Then the NEW
`app/ingest.js` was booted once for 2 minutes against `cryptonews_test` only. Scratch scripts/logs are in the
session scratchpad (`p3_probe.js`, `p3_diag.js`, `p3_yt.js`, `p3_boot.ps1`, `boot_out.log`).

## Plain-language summary

**GO to deploy, after three one-line config fixes** (wrong YouTube channel, one dead blog feed, two dead Telegram
channels) and with `GNEWS_TIERS="A,B"` added to `app\.env`. Nothing crashes: the new collector booted with
111 adapters, saved 1,099 posts in 100 seconds into the test DB, had zero save/health errors, and settled at
~130–145 MB RAM. 47 of 49 RSS feeds, 5 of 7 Telegram wires, 15 of 27 official sources (the rest are quiet this
week, not broken — except 3 GitHub repos and the ENS forum), 12 of 14 YouTube channels, Google News, and the
Binance tier-B endpoint all work from this PC. Reddit stays silent without keys, as designed.

**Two things you did not expect:**
1. **The live collector is NOT running.** Supervisor PID 180132 in `app\logs\supervisor.pid` is dead, there is no
   STOP file, `ingest.log` stops at 18:13Z (14:13 ET), the live DB's newest post is 18:09Z, and the 4180 web UI
   is not listening either. The machine did not reboot (uptime since Sep 17); the process was simply killed
   around 14:21 ET and Sahasra is not in the Startup folder, so nothing restarted it. The news feed has been dark
   for ~9 hours. The deploy "STOP → wait → start" step is therefore trivial; the stale pid lock is handled by
   `supervisor.js` (dead PID → lock reclaimed).
2. **Discord alerts have been off the whole time** — `app\.env` has no `DISCORD_NEWS_WEBHOOK` and the live log has
   zero alert lines. The handoff's day-one check "a tier-1 listing alert still reaches Discord" cannot pass until
   you set it. Before you do, fix the ALL-CAPS tagging issue below (it can page the wrong coin).

## 1. Source-by-source live results (one fetch each; 2 Google News requests total)

### RSS (49) — 47 OK, 1 EMPTY (legit), 1 FAIL
- All 41 news feeds OK, 8–50 items each, newest item 3 min – 37 h old (bloomberg-crypto 1 item/29 h,
  99bitcoins 37 h, blockchainnews 31 h — low-volume feeds, fine).
- `reg:cftc` OK (1 item, 36 h), `reg:fed` OK (1, 33 h), `reg:ecb` OK (2, 4.7 d) — crypto filter working.
- `reg:doj` **EMPTY** — feed loads (25 items, newest 15 h) but none matched the crypto filter this week. Legit.
- `blog:kraken` **FAIL HTTP 403** — with browser UA, curl UA, `/feed/`, `?feed=rss2`: all 403 (Cloudflare bot
  block). Dead → remove from `RSS_FEEDS` in `app/ingest/config.js`. RSS adapters are not `quietHealth`, so
  left in it would log `[health] blog:kraken no successful poll…` every minute forever (and alert Discord).
- `blog:solana` OK (37 h), `blog:chainalysis` OK (2.6 d), `blog:ethereum` OK (newest 17 d — that's the blog).

### Telegram wires (7) — 5 OK, 2 EMPTY (dead channels)
| adapter | result | detail |
|---|---|---|
| tg:watcherguru | OK 20 items, newest 1.8 h | |
| tg:wublockchainenglish | OK 20, newest 30 m | |
| tg:whale_alert_io | OK 20, newest 3 m | capped importance 10, `$XRP`/`$BTC` tagging correct |
| tg:treenewsfeed | OK 3, newest 29.6 h | page has 20 msgs but channel is low-volume; content is already relayed by `tg:bwenews` ("Tree News: *…") → near-duplicates |
| tg:walter_bloomberg | OK 1, newest 8.7 h | 19/20 messages filtered out by CRYPTO+MACRO filter (Hormuz/oil/China headlines) — filter works as designed |
| tg:peckshieldalert | **EMPTY** | t.me/s page has **1 message, 3.9 years old** → dead channel, remove from `TG_CHANNELS` |
| tg:certikalert | **EMPTY** | **9 messages, newest 4.9 years old** → dead channel, remove from `TG_CHANNELS` |
No t.me throttling seen (7 channels + bwenews polled within seconds, all 200).

### Official sources (27) — 15 produce or legitimately empty; 3 structurally dead; 1 timeout
GitHub releases (19), adapter emits only GitHub's own `/releases/latest` tag if it is in the atom feed and <7 d:
- **Produced 1 item each (5):** gh:anza-xyz/agave (SOL, 4.6 d), gh:ethereum/go-ethereum (ETH, 3 d),
  gh:OffchainLabs/nitro (ARB, 4 h), gh:aptos-labs/aptos-core (APT, 3 d), gh:celestiaorg/celestia-node (TIA, 2.7 d).
- **Legitimately empty — feed loads, no stable release inside 7 days (11):** bitcoin (latest v31.1 is 7.5 d),
  nearcore (2.13.4, 8.6 d), gaia (31 d), litecoin (13.6 d), polkadot-sdk (stable2606-2 >7 d; only weekly RCs new),
  rippled (8.2 d), cardano-node (latest 11.1.2 >7 d; 11.1.3 is a pre-release), dogecoin (663 d), ton (39.6 d),
  lotus (v1.36.3 >7 d; only rc1 new), sei-chain (v6.6.3 >7 d; only rc's new).
- **Structurally dead — the `/releases/latest` tag is never in the 10-entry atom feed (3):**
  gh:MystenLabs/sui (latest `mainnet-v1.80.1`; feed is all `sui_v1.82.0_<epoch>_ci` tags),
  gh:ava-labs/avalanchego (latest `v1.15.0`; feed is all `-rc.N` + `graft/…`), gh:ethereum-optimism/optimism
  (latest `op-batcher/v1.17.0`; feed is 10 other component releases). Matches handoff follow-up #1; fix = use
  `api.github.com/repos/<org>/<repo>/releases/latest`, or drop the three from `officialSources.json`.
Forums (8):
- OK: forum:governance.aave.com (6 items, 15 h), forum:gov.optimism.io (1, 3.3 d), forum:research.lido.fi (1, 5.7 d),
  forum:forum.arbitrum.foundation (1, 4.3 d), forum:comp.xyz (1, 7.5 h).
- forum:gov.uniswap.org **EMPTY** — 30 topics load, newest *created* 7.5 d ago (Discourse `latest.rss` pubDate =
  topic creation, so active older topics never pass the 7-day cutoff). Legit, will fill when a new topic appears.
- forum:dydx.forum **EMPTY** — 1 topic <7 d: "DRC Wind‑Down: 5 Markets Identified for Delisting…" not matched by
  `GOVERNANCE_RE` (dYdX calls proposals "DRC"). Add `DRC` and `delist(ing)?` to `GOVERNANCE_RE` in `official.js`.
- forum:discuss.ens.domains **FAIL "This operation was aborted"** — the server answers 200 but takes **18–25 s**
  (measured twice); `official.js` calls `request(entry.url, { conditional: true })` with the default 10 s timeout, so
  it will fail every poll, hit the quiet 6-fail threshold and retry every 6 h forever. Fix: `timeoutMs: 30000` in
  the three `request()` calls in `app/ingest/adapters/official.js` (lines ~176, ~228, ~262), or drop ENS.

### YouTube (14) — endpoint flaky; 1 wrong channel; 2 chronically failing
- The feed endpoint returned 500/404 **intermittently for valid channels**: 33/42 = 79% success across 3 rounds.
  A failing channel backs off 10 min and usually succeeds next time, so day-to-day this is fine.
- Channel identity verified via `<link rel=canonical>` on the channel pages: coinbureau, bankless, thedefiant,
  altcoindaily, investanswers, pomp, coindesk, bitcoinmagazine, realvision, cryptobanter (@CryptoBanterGroup),
  datadash, paulbarron, unchained are the right channels (newest titles are on-brand).
- **yt:theblock is the WRONG channel**: `UC5sL8J5z4PLXjpUce0pnhPg` = @theblock = the Australian renovation TV show
  ("Courtney and Sev's Kitchen REVEALED!") — 10 junk items per poll into the Media tab. The Block (crypto) is
  `UCqjFueYMJ78eF6G0lGLzzpQ` (@TheBlockCrypto). Fix `channelId` in `YT_CHANNELS`, `app/ingest/config.js`.
- **yt:coindesk** (500/404/404, later 200 once) and **yt:paulbarron** (404 ×6) failed nearly every try tonight.
  Both are `verified:true` → not quiet → after 60 min they print a `[health]` line every minute and would alert
  Discord. Suggest `verified:false` on all `YT_CHANNELS` for day one (or at least these two), revisit after 24 h.

### Google News (gnews) and its tier sources
- `https://fapi.binance.com/fapi/v1/ticker/24hr` (tier-B source): OK, 777 rows in 200 ms → `deriveTierB` gives
  100 bases (BTC ETH SOL ZEC XRP NEAR SUI DOGE HYPE ENA …), 52 of them outside tier A.
- `fapi/v1/exchangeInfo`: OK, 651 coin bases / 202 non-coin.
- Tier A from `base_break_live.json`: 151 setups → 48 unique bases.
- `planIntervals` with the real counts and default budget 5000: **A = 20 m, B = 96 m, C = 753 m**
  (~140 tier-C requests/day). No starvation.
- Live `run()` with the budget capped at 2: Google answered both requests (60 items, newest 3 h), state file
  written correctly (day/used/coins). No 429.

### Reddit — OFF and silent as designed
`reddit.make()` → 0 adapters, one log line `[reddit] disabled — set REDDIT_CLIENT_ID/…`. No requests made.

## 2. Tag / classify quality on the live items (1,000 items; 485 got ≥1 ticker)

Good: `$XRP`/`$BTC` whale alerts tagged and capped at 10; Bitget breach → `hack 85`; SEC/CFTC/Fed items →
`regulatory 70/80`; BTC ETF inflows → `etf 70 bullish`; GitHub releases tagged from hint (SOL/ETH/ARB/APT/TIA) at
importance 40; forum items 30; YouTube/Reddit capped at 10; regulator feeds 80.

Wrong / to fix:
1. **ALL-CAPS wire headlines get false tickers (the real defect).** Tree News and Walter Bloomberg post in caps,
   and Binance perp bases are matched as bare uppercase words:
   `*CME GROUP TO LAUNCH BITCOIN CASH, UNISWAP FUTURES…` → `BCH, UNI, CASH`;
   `FED'S HAMMACK WARNS INFLATION RISKS REMAIN HIGH` → `HIGH`.
   On 36 synthetic all-caps macro/crypto headlines with the production universe loaded, **11 got a false ticker**
   (HIGH, NEAR, CASH, FLOW, BOND, ORDER, BEAT, BANK, BAN); the same headlines title-cased → 0 false, BTC/ETH/SOL kept.
   Scenario that pages Discord wrongly: Tree posts `BITGET HACK LOSSES NOW SEEN NEAR $350M` → `hack 85` + `NEAR`
   (a live setup) → alert for NEAR. Fix (GLM directive): in `app/ingest/tickers.js` `tagTickersInner`, when the title
   is "shouting" (≥12 letters and ≥90% uppercase) skip the bare-uppercase-symbol pass (keep `$SYM`, `SYMUSDT`,
   curated aliases/names); or in `telegram.js` give the tagger a title-cased copy for channels flagged all-caps.
   Not a crash risk; **must land before `DISCORD_NEWS_WEBHOOK` is set.**
2. `yt:theblock` — 10 reality-TV items (see above).
3. `forum:governance.aave.com` "[Direct-to-AIP] Asset Listing - USDe X Layer" → `listing 60 bullish` (an Aave market
   onboarding, not an exchange listing). Harmless (`alertable:false`), shows under Important.
4. Non-crypto items from the general feeds score high with no ticker: "Pentagon Wins Major Court Battle Against
   Anthropic" → regulatory 70; "AI Agents Hacked Their Own Test Environment…" → hack 85; "Humans Are Reading Your
   ChatGPT Chats, New Lawsuit Claims" → regulatory 70. No alert (no ticker) but they clutter Important. Pre-existing
   classifier behaviour, more exposed by the 43 new feeds (decrypt/cnbc/beincrypto AI coverage).
5. Recall miss, pre-existing (step-2 alias gate): "Aave Adds New Collateral on Base", "Aave launches V4",
   "Uniswap Adds Fee Switch", "Solana Adds New Feature" → no ticker, while "Aave token rallies 5%" → AAVE. Product
   verbs (adds/launches/integrates/upgrades/partners) are not in `CONTEXT_RE`. Same family as the RESUME follow-up.
6. `tg:treenewsfeed` duplicates headlines already ingested via `tg:bwenews` ("Tree News: *…"); the `*` prefix and
   "Tree News:" wrapper make titles differ, so clustering may not merge them.

## 3. Windows-specific checks
- **Collector/web UI down** (see summary). Also: the handoff's "wait until no `node.exe` is left" is impossible on
  this PC — 5 unrelated node.exe (TradingView MCP, PDF MCP, etc.) always run. Check the PIDs in
  `app\logs\status.json` / `supervisor.pid` instead. Sahasra has **no Startup-folder entry** (all sibling projects
  do) — add one if you want it to survive reboots.
- `tasklist` usage is only in `supervisor.js`, unchanged since `3295a7b`; the supervisor suite passes here.
- Line endings: every changed `.js/.ts` is CRLF on disk (core.autocrlf=true), `officialSources.json` is LF — harmless.
  `run_all_tests.sh` is CRLF and still runs under Git Bash (your passing run proves it).
- Tracked caches: `git ls-files -v` shows `S` (skip-worktree) on all three. Working-tree `gnews_state.json` equals
  HEAD (day 2026-09-25, used 196) — nothing was clobbered by the merge; the counter resets on the UTC date change.
  `coins.json` was rewritten at 22:54 by the test run (`fix1.test.js`), expected. The new tier cache
  `app/ingest/cache/gnews_tiers.json` is covered by `.gitignore` (`ingest/cache/`) → no git noise. **My 2-minute
  boot created that file** (B=100, C=651, identical to what the collector writes ~20 s after start); deleting it
  was denied by the permission sandbox, so it is still there — harmless, remove it if you want a pristine dir.
- `.env` today has only the 5 legacy lines. With it unchanged the defaults are **safe** (nothing fails) but not the
  recommended ones: `GNEWS_TIERS` defaults to `A,B,C`, all new sources ON, Reddit silently off, alerts off.
  `dotenv` finds `app\.env` because the VBS sets `CurrentDirectory` to `app` — verified in `start-news-hidden.vbs`.
- Postgres session timezone is `Asia/Calcutta` and Prisma stores `firstSeenAt` as naive UTC `timestamp(3)`, so the
  handoff's SQL windows (`"firstSeenAt" > now() - interval '24 hours'`) are shifted by 5.5 h. Use
  `> (now() at time zone 'utc') - interval '24 hours'`.

## 4. Isolated boot of the NEW ingest (test DB, 2 min)
Env: `DATABASE_URL`=cryptonews_test, `NEWS_REDIS=off`, caches/news file → scratch, `DISCORD_NEWS_WEBHOOK=""`,
`GNEWS_TIERS=A,B`, `GNEWS_DAILY_BUDGET=6` (to cap Google requests), cwd outside `app` so `app\.env` was not read.
- Startup lines in order: `[redis] NEWS_REDIS=off…`, `[reddit] disabled…`, **`[ingest] started 111 adapters`**,
  `[gnews] intervals now …`, later `[ingest] bases: 651 coin, 202 non-coin`.
- **1,099 posts saved into `cryptonews_test`** in ~100 s (rss 761, gnews 101, tg 73, yt 66, exchanges 79, forum 10,
  blog 6, gh 5, reg 4). Live DB `cryptonews`: **0 rows** in that window (verified).
- Errors in 2 min: 5 `[sched]` lines only — 4 YouTube 404 (thedefiant, investanswers, coindesk, paulbarron — the
  flaky endpoint) and `blog:kraken` 403. **0 `[health]`, 0 `[store] save error`, 0 unhandled rejections, 0 t.me
  errors, 0 Google 429, 0 GitHub errors.**
- Memory: RSS 278 MB / heapUsed 93 MB at t+15 s (6-h DB backfill + first 1,000 saves), then **RSS 110→145 MB,
  heapUsed 28–40 MB** steady. CPU 11 s during startup, then ~0.5 s per 15 s. Working set at kill: 145 MB.
- Cosmetic only: with an absurd budget the planner printed `B=354294400m` instead of `paused` because `remainB` was
  a tiny positive float (`remainB <= 0` check in `gnews.js planIntervals`). Not reachable at budget 5000.

## Decision: GO (with the pre-restart config patch)

Blocking issues (crash/data loss): **none.**

Fix before restart (all in config, GLM one-liners):
1. `app/ingest/config.js` `YT_CHANNELS`: theblock `channelId` → `UCqjFueYMJ78eF6G0lGLzzpQ`.
2. `app/ingest/config.js` `RSS_FEEDS`: remove `blog:kraken` (403, dead).
3. `app/ingest/config.js` `TG_CHANNELS`: remove `PeckShieldAlert` and `CertiKAlert` (channels dead for years).

Fix before setting `DISCORD_NEWS_WEBHOOK` (alert integrity):
4. `app/ingest/tickers.js`: skip bare-uppercase-symbol matching on all-caps titles (see §2.1).

Day-one follow-ups:
5. `app/ingest/adapters/official.js`: `timeoutMs: 30000` on the three `request()` calls (ENS forum takes 18–25 s);
   add `DRC|delist(ing)?` to `GOVERNANCE_RE`.
6. `officialSources.json`: SUI / AVAX / OP GitHub entries never emit (handoff follow-up #1) — switch to the API or drop.
7. `YT_CHANNELS`: `verified:false` for day one (flaky endpoint; coindesk/paulbarron failing).
8. Flip `verified:true` on the sources that loaded fine: TG watcherguru, wublockchainenglish, whale_alert_io,
   treenewsfeed, walter_bloomberg; all 16 loading GitHub repos; forums aave, optimism, lido, arbitrum, comp, uniswap, dydx.
9. Add a Startup-folder shortcut for `app\start-news-hidden.vbs`, and start the 4180 web UI again.

Recommended `app\.env` additions for day one:
```
GNEWS_TIERS="A,B"
TG_WIRES_ENABLED="1"
OFFICIAL_ENABLED="1"
YOUTUBE_ENABLED="1"
REDDIT_ENABLED="1"
DISCORD_NEWS_WEBHOOK=""   # leave empty until the all-caps tagger fix (item 4) is in
```
(The four `*_ENABLED` lines only make the defaults explicit; `GNEWS_TIERS` is the one that changes behaviour.)
