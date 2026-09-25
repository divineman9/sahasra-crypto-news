# Sahasra — Phase 3 handoff (cloud session, 2026-09-25)

Branch: `claude/laughing-cerf-6h5fd6`. Base before this session: `3295a7b`.
Every step below was written test-first by a Sonnet coder, reviewed by Fable until APPROVED, then committed.
A final whole-project Fable review (with a live collector boot) found one blocker and eight follow-ups. All were fixed and re-approved.
Astra (ChatGPT) has not reviewed any of this yet. See "Still owed" at the end.

## What was built

| Step | Commit | What it does |
|---|---|---|
| 3 fix | `1ba5d99` | Regulator feed filter no longer matches "deficit", "defined" and similar words. |
| 5 | `046746d` | `/coin/<TICKER>` page with 48 h / 7 d range, source tabs (News, Exchange, Official, Social, Media), search box, clickable ticker chips. |
| 4B/C | `14dd5f9` | Google News per coin for tier B (top 100 by 24 h volume) and tier C (every other coin, 4 per query) inside the 5000/day budget. Tier A is never starved. |
| 6 | `696d7b5`, `4c09e25` | 7 Telegram wire channels and 27 official sources (19 GitHub release feeds, 8 governance forums). Unverified sources never page Discord. |
| 7 | `2ccc760` | YouTube Media tab (14 channels) and Reddit Social tab (off until you add keys). Health window scales with each source's poll interval. |
| 8 | `f4dfa31` | Age-first feed rows, favicons, wider headlines, expandable rows, Important and Saved filters, infinite scroll back 7 days. |
| Final fixes | `bd5d671` | GitHub keeps only the real latest stable release, dashboard news file split so older chips can't drop out, Telegram wires slowed, tagger runs on video/Reddit/official items, outage alerts summarised, server-side hide filter, `.env.example` documents every setting. |

Test suites: 25 suites run by `build/tests/run_all_tests.sh`. In the cloud container, every suite passes except `supervisor` (needs Windows `tasklist`) and `details` (binance.com is blocked there). Both should pass on your machine as before.

## Deploy on Windows

1. **Pull.** In `D:\claude projects\crypto-news-terminal`, run `git pull`. The files `app/ingest/cache/*.json` may show as locally modified. That is expected. Never `git add` them.
2. **Nothing to install.** No `npm install`, no `prisma generate`, no migration. The database schema did not change.
3. **Optional `.env` settings.** Nothing new is required. Recommended for day one:
   ```
   GNEWS_TIERS="A,B"
   ```
   Switch to `"A,B,C"` after a day with no Google 429 errors. Every setting is documented in `app/.env.example`.
4. **Build the UI.**
   ```
   cd app
   npm run build
   ```
5. **Run the tests (optional).** The two UI suites need the fresh build and start a server on port 4190.
   ```
   bash build/tests/run_all_tests.sh
   ```
6. **Restart the collector.** Create `app\logs\STOP`, wait until no `node.exe` is left (`tasklist | findstr node`), delete `STOP`, then run `app\start-news-hidden.vbs`. Restart the web UI on port 4180.

## Check in the first 5 minutes

- `app\logs\ingest.log` shows `[ingest] started 111 adapters` (117 once Reddit keys are set).
- It shows `[gnews] intervals now A=20m B=… C=…` and, after about 20 seconds, the tier-B list is filled.
- `news_live.json` `asof` moves every ~15 seconds, `health.ok` is true and `stale` is empty.
- Dashboard 📰 chips still render.
- These open fine: `http://127.0.0.1:4180/coin/BTC`, `http://127.0.0.1:4180/api/search?q=sol`.

## Watch in the first hour

```
findstr /c:"tg:bwenews error" app\logs\ingest.log
findstr /c:"[gnews]" app\logs\ingest.log
findstr /c:"looks dead" app\logs\ingest.log
findstr /c:"[health]" app\logs\ingest.log
findstr /c:"[store] save error" app\logs\ingest.log
```

- **`tg:bwenews error`:** Telegram may throttle the extra channels. If BWEnews starts failing, set `TG_WIRES_ENABLED=0` and restart.
- **`[gnews]`:** expect a burst in the first ~25 minutes and maybe a few 429s that clear by themselves. Repeated 429s mean Google dislikes the rate. Stay on `GNEWS_TIERS="A,B"` or lower `GNEWS_DAILY_BUDGET`.
- **`looks dead`:** the 7 new Telegram channels and 27 official sources are all marked unverified. A dead one logs this line once and retries every 6 hours without paging Discord. Fix or remove each dead one. For each one that works, set `verified: true` in `TG_CHANNELS` (`app/ingest/config.js`) or in `app/ingest/officialSources.json`, so it gets normal health alerts.
- **`[health]` and `[store] save error`:** both should be empty.

## Check on day one

- A tier-1 exchange listing alert still reaches Discord.
- Volume by source:
  ```sql
  select "sourceName", count(*) from "Post" where "firstSeenAt" > now() - interval '24 hours' group by 1 order by 2 desc;
  ```
- 48-hour total. If it is above ~15,000, raise `NEWSFILE_COUNTS_TAKE`.
  ```sql
  select count(*) from "Post" where "firstSeenAt" > now() - interval '48 hours';
  ```
- `node build/tests/coverage_probe.js`, and `node build/tests/soak_check.js` after 24 hours.

## Rollback

1. Create the STOP file and wait for `node.exe` to exit.
2. Back up the live caches first, because they are tracked in git and a reset would overwrite them with old copies (the Google News day counter and the coin list live there):
   ```
   xcopy /E /I app\ingest\cache app\ingest\cache.keep
   ```
3. Run `git reset --hard 3295a7b`, then copy `app\ingest\cache.keep\*` back over `app\ingest\cache\`.
4. Run `npm run build` in `app`, delete STOP and start the VBS.
The database needs nothing. Optionally remove the new rows:
```sql
delete from "Post" where kind in ('media','social','official');
```

## Needs from you

- **Reddit (optional):** create a free "script" app at https://www.reddit.com/prefs/apps using a dedicated Reddit account with 2FA turned off. Fill `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD` in `app\.env`.
- **CoinGecko key (optional):** set `COINGECKO_DEMO_KEY` and run `node build/tools/coingecko_links.js` to propose more official sources. It writes `app/ingest/officialSources.proposed.json` for you to review and never edits the live list.
- **Discord webhook:** `DISCORD_NEWS_WEBHOOK` is still needed for alerts, as before.

## Behaviour changes to know

- The "Hide low-importance" toggle (default on) now hides every tier-4 item under importance 30: Google News filler, YouTube, Reddit and Whale Alert. They stay visible on each coin page's tabs.
- Adding a coin to your portfolio moved from clicking the ticker chip to the small `+` button or the sidebar box. Ticker chips now open the coin page.
- Below 1280 px wide, the Prices/Trending column is hidden.
- The dashboard news file is now written every 15 seconds instead of 5. The chip's 60-second staleness check is unaffected.
- YouTube and Reddit posts don't count toward the dashboard 📰 N chip.

## Not done on purpose

- **Cache and backup files stay tracked in git.** `app/ingest/cache/*.json` and the `*.bak` / `*.pre_*` files are committed. Untracking them with `git rm --cached` would delete them from your Windows folder on the next pull. To stop git showing the cache files as modified, run this on Windows:
  ```
  git update-index --skip-worktree app/ingest/cache/coins.json app/ingest/cache/gnews_state.json app/ingest/cache/noncoin.json
  ```
- **Live verification.** The cloud container could reach only github.com. The 43 new RSS feeds (the 6 original ones were already live), 7 Telegram channels, 8 forums, 14 YouTube channels, Google News and Reddit were tested against fixtures only.

## Open follow-ups (non-blocking)

1. SUI, AVAX and OP GitHub releases get crowded out of the atom feed by CI and release-candidate tags, so they show nothing. Switching to `api.github.com/repos/<org>/<repo>/releases/latest` (60 requests/hour unauthenticated, we use ~38) would fix it.
2. Curate OP, W, KCS, ARKM and VSN in `coinSources.json` so "Optimism hacked"-style Google News headlines get tagged.
3. New listings whose name is a short common word need `NAME_BLOCK` entries over time.
4. With 60 or more live setups, Google News tiers B and C effectively pause. Raise `GNEWS_DAILY_BUDGET` or `GNEWS_TIER_A_MIN`.
5. Regulator filter misses releases that only name an entity ("Binance and CEO plead guilty", "digital euro").
6. YouTube Shorts will appear in the Media tab (the feed can't tell them apart without an extra request).
7. Same story from several outlets still shows as separate rows unless the titles are near-identical.
8. If the shared Reddit login fails, the six Reddit sources report through the single "multiple-sources" health summary rather than six alerts. Check `ingest.log` for `reddit: token request failed (…)` to see the reason.
9. The main feed is not virtualised. At the 3000-post cap, scrolling may feel heavy on a slow laptop.

## Still owed

- **Astra batched review** of everything in this handoff, per your rule. Add it to `build/astra_pending_review.md` when ChatGPT is available.
- **24 h soak** after deploy (`soak_check.js`).
- **Opus ship-gate.**
