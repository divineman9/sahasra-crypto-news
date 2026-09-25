## 1. Done right

- **The product scope is right:** a news flag beside an existing trading signal, with the terminal as supporting evidence. This avoids building another dashboard the trader must constantly watch.
- **Publication time governs freshness.** The file writer checks both `publishedAt` and `firstSeenAt`; rediscovering an old article does not normally restart its 48-hour eligibility.
- **Official announcements plus market-list changes are complementary.** Announcements identify intent; symbol changes confirm availability. Keeping their timestamps separate is useful.
- **HTTP resilience is substantially improved:** body-read timeout, conditional requests, jitter, differentiated backoff, and API error-code checks.
- **Several safeguards are sensible:** silent initial symbol seeding, rejection of suspiciously small lists, no mock headlines, private labels, and loopback binding for Next and WebSocket.
- **Deferring embeddings, per-headline LLM calls, accounts, and public voting is correct for this machine.**
- **The required soak is appropriate.** However, the saved report covers only **one hour**, with **zero completed price measurements**.

I made no changes. I checked syntax for 36 JavaScript files, ran the existing scheduler/symbol probes, and reproduced the findings below using production modules with in-memory fixtures. Synthetic headlines below are test inputs, not claims about actual incidents.

## 2. Problems found (file + evidence + fix)

**1. Blocking: the dashboard can display expired news indefinitely.**

[news_chip.js:8](<D:/claude projects/crypto/screener/news_chip.js:8>) accepts any `j.flags`, ignores `asof_ms`, and swallows fetch failures. `apply()` never rechecks publication age. Its `data-key` shortcut also freezes displayed age until data or rows change.

**Reproduced:** a 49-hour-old snapshot rendered a NEWS chip; advancing the clock another hour left its text unchanged. The actual file I inspected was approximately 79 minutes behind the review clock.

**Fix:** enforce expiry in the browser, refresh age independently, and display **NEWS UNKNOWN / INGEST STALE** after a short heartbeat timeout. Include adapter health: a freshly rewritten file does not prove sources are working. Reject future publication timestamps too—`store.js` currently accepts them.

**2. Blocking: bullish news can conceal a fresh hack or delisting.**

[newsFile.js:62](<D:/claude projects/crypto-news-terminal/app/ingest/newsFile.js:62>) sorts by `b.importance - a.importance`; [news_chip.js:65](<D:/claude projects/crypto/screener/news_chip.js:65>) colors only `f.top[0]`.

**Reproduced:** listing **95** plus hack **85** produces a **green chip linking to the listing**. Several listings can push the hack outside the three-item tooltip.

**Fix:** calculate risk independently of importance ranking. Show separate catalyst/risk indicators or a conspicuous conflict state. Tie each indicator’s age and link to its own evidence.

**3. Blocking: round 7’s subject/context fix is incomplete and introduces false negatives.**

[tickers.js:263](<D:/claude projects/crypto-news-terminal/app/ingest/tickers.js:263>) applies chain-context filtering to names, but the bare-token loop at line 273 bypasses it. The name blocklist also suppresses genuine project subjects.

| Test headline | Actual result |
|---|---|
| `Hackers drain funds from protocol on SOL` | SOL, hack 85 |
| `Hackers drain funds from protocol on ARB` | ARB, hack 85 |
| `Solana network hacked` | No ticker |
| `Wormhole exploited for $100M` | No ticker |
| `Optimism hacked for $10M` | No ticker |
| `Hyperliquid lists XYZ perpetual futures` | HYPE, listing 60 |

The last case treats the venue’s token as the listed asset.

**Fix:** retain match evidence and distinguish affected asset, venue, chain, and incidental mention. Apply that distinction consistently across names, tickers, parentheses, and hints. Replace blanket name suppression with contextual disambiguation.

**4. High: bulk notices silently lose affected coins.**

[tickers.js:202](<D:/claude projects/crypto-news-terminal/app/ingest/tickers.js:202>): `out.length >= 5`.

**Reproduced:** `Binance Will Delist BTC, ETH, SOL, XRP, ADA and LINK` omits LINK. Separately, exchange adapters retain only titles; notices saying “multiple contracts” without naming assets cannot be mapped.

**Fix:** remove the storage-level five-asset cap; cap only rendering. Fetch announcement details selectively when an important notice lacks a complete asset list.

**5. High: sentiment rules reverse material events.**

[classify.js:64](<D:/claude projects/crypto-news-terminal/app/ingest/classify.js:64>) checks `/approv|launch|inflow/` before bearish ETF terms. Regulatory sentiment matches `lawsuit` without considering dismissal.

**Reproduced:**

- `SEC delays approval of Solana ETF` → **bullish**
- `SEC drops lawsuit against Ripple` → **bearish**

**Fix:** classify the actual action—approval, delay, rejection, filing, dismissal—and return unknown/neutral when ambiguous. Keyword presence alone should not determine trading color.

**6. High: corrections at the same URL are permanently ignored.**

[store.js:37](<D:/claude projects/crypto-news-terminal/app/ingest/store.js:37>): `if (this.urls.has(raw.url)) return null`.

A changed title, cancelled listing, corrected asset list, or revised notice at an existing URL cannot update the stored evidence.

**Fix:** identify notices by source ID, track content revisions, and update material changes while preserving original publication/first-seen times. Do not refresh the 48-hour clock merely because an article was edited.

**7. High: the watchdog does not cover the complete ingestion cycle.**

[scheduler.js:99](<D:/claude projects/crypto-news-terminal/app/ingest/scheduler.js:99>) races only `adapter.run()`, clears the watchdog, then awaits `onItems`; line 134 awaits Redis health persistence before rescheduling.

**Reproduced:** a non-settling save callback or `hset` leaves the adapter at one run, zero errors, and a populated `lastOkAt`. Also, timing out `Promise.race` does not cancel the original adapter operation.

**Fix:** bound database/Redis operations, make health persistence non-blocking, track completed-cycle progress, and prevent timed-out work overlapping replacement runs. Add non-overlap guards to the interval-driven price and JSON workers too.

**8. High: retry guarantees still lose events and alerts.**

Three confirmed paths:

- [store.js:109](<D:/claude projects/crypto-news-terminal/app/ingest/store.js:109>) adds the URL before Redis publication. **Reproduced:** database insert succeeds, Redis fails, retry returns `null`; publication and the subsequent Discord call never happen.
- [symbols.js:150](<D:/claude projects/crypto-news-terminal/app/ingest/adapters/symbols.js:150>) keeps retries only in memory for five minutes. **Reproduced:** an unsaved event disappears after expiry and after restart because its symbol is already recorded as known.
- [discord.js:54](<D:/claude projects/crypto-news-terminal/app/ingest/discord.js:54>) reserves the deduplication key before sending and swallows delivery errors. **Reproduced:** two attempts following a simulated 503 make only one delivery request.

**Fix:** use a small durable pending-event/delivery table with acknowledgements and bounded retries. A committed post must remain publishable. Distinguish “reserved,” “delivered,” and “failed.”

**9. Medium: the claimed forced universe refresh is not wired correctly.**

[ingest.js:29](<D:/claude projects/crypto-news-terminal/app/ingest.js:29>) calls `loadUniverse(true)`, but [tickers.js:113](<D:/claude projects/crypto-news-terminal/app/ingest/tickers.js:113>) declares `loadUniverse(redisOrNull, force = false)`.

**Reproduced:** `loadUniverse(true)` with a fresh cache performs **zero fetches**. The round-7 probe repeats the same incorrect call.

**Fix:** replace the ambiguous signature with an options object and assert that forcing refresh actually invokes fetching. Retain a working universe when refresh fails.

**10. Medium: displayed returns can name the wrong coin, and the “hit rate” is not strategy performance.**

[store.js:71](<D:/claude projects/crypto-news-terminal/app/ingest/store.js:71>) selects `priceTicker = tickers[0]`. Both serializers alphabetize instruments and omit `priceTicker`; [PostDetail.tsx:55](<D:/claude projects/crypto-news-terminal/app/src/components/PostDetail.tsx:55>) labels returns using `post.instruments[0]`.

Furthermore, [price.js:37](<D:/claude projects/crypto-news-terminal/app/ingest/price.js:37>) anchors returns to the preceding minute boundary, potentially including almost a minute **before observation**. [report.js:20](<D:/claude projects/crypto-news-terminal/app/ingest/report.js:20>) counts articles, including repeated coverage, rather than trading signals.

**Fix:** expose the measured instrument explicitly; label candle-based returns accurately. For strategy evaluation, snapshot information available at signal time and measure actual signal outcomes, costs, direction, and deduplicated events.

**11. Verification is weaker than the “67 correct” wording suggests.**

[round7_probe.js:17](<D:/claude projects/crypto-news-terminal/build/tests/round7_probe.js:17>) prints actual and expected descriptions without assertions. The existing symbol probe printed `NEWONE,NEWONE (want NEWONE)` and still exited successfully.

[soak_check.js:73](<D:/claude projects/crypto-news-terminal/build/tests/soak_check.js:73>) samples only already-tagged posts, so it cannot discover missed tickers. The [saved soak report](<D:/claude projects/crypto-news-terminal/build/soak_report_2026-09-25-08.md>) contains an unaudited sample, one hour of observations, and zero completed returns.

**Fix:** executable assertions, positive and negative extraction cases, missed-event audits, and an actual continuous 24-hour operational gate.

Earlier-review issues also remain: alternating feeds double per-category polling intervals; dismissal affects one post rather than the whole story; and story/source counts are not necessarily counts of independent sources.

## 3. Additions ranked

Ranking reflects expected **trading value ÷ implementation effort**, not demonstrated profitability. S/M/L are relative effort estimates.

| # | Addition | Trading value | Source | Effort | Risk |
|---|---|---|---|---|---|
| 1 | Freshness, coverage health, and risk precedence | Prevents stale or misleading trading flags | Existing JSON, adapter state, database; free | S–M | Must distinguish unknown coverage from no news |
| 2 | Connect existing unlock/event risks | Avoids overlooking scheduled supply and venue risks | Existing `events_live.json`: unlocks, announcements, direction-specific `risk`; no new subscription | S | Scheduled-event time differs from news-publication time |
| 3 | Freeze news association at signal creation | Enables “news present / none detected / coverage unknown” labels and honest evaluation | Existing signal feed plus local news store; free | M | Later-arriving news must not rewrite historical signal knowledge |
| 4 | Reliable Discord delivery | Brings relevant news and ingestion failures to the trader | Existing webhook integration; free | S–M | Retry duplicates; browser portfolio currently differs from backend watchlist |
| 5 | BWEnews flash adapter | Adds incident coverage beyond exchange/RSS feeds | Public [BWEnews page](https://t.me/s/BWEnews), 30-second polling; free | M | Reposts, AI summaries, edits, fragile HTML, unverified speed advantage |
| 6 | Upbit announcement WebSocket | Direct listing, caution, delisting, and wallet notices | `wss://api.upbit.com/websocket/v1/private`, `type: announcement`; API key/JWT, no additional scope required. [Official specification](https://docs.upbit.com/kr/reference/websocket-announcement) | M | Account/key availability; live-only stream needs gap handling; delivery need not precede website |
| 7 | OKX instrument lifecycle | Structured listing/delisting coverage without scraping | Public `GET /api/v5/public/instruments?instType=SPOT` and `SWAP`; free. [API](https://app.okx.com/docs-v5/en/), [announcement-time updates](https://www.okx.com/docs-v5/log_en/#2025-05-06) | S–M | Differentiate announcement, preopen, live, and expiry; some early fields are blank |
| 8 | Funding/OI context on watched signals | Helps distinguish leveraged moves from broader demand | Reuse existing events data; supplement Binance `/fapi/v1/premiumIndex` and `/futures/data/openInterestHist`. [Official endpoints](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data) | S–M | Correlation is not causation; normalize funding intervals and OI units |
| 9 | Coinbase product-state adapter | Adds venue confirmation and trading-status changes | Free `GET https://api.exchange.coinbase.com/products`. [Official documentation](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-all-known-trading-pairs) | S–M | Product appearance is not advance announcement; new quote pair is not new asset |
| 10 | Signal-level outcome report | Tests whether this filter actually improves base-break trading | Existing journal/signal outcomes plus frozen news snapshots; free | M | Small samples, duplicate events, regime effects, selection bias |
| 11 | LLM “why it matters,” importance ≥70 | Reduces reading time for ambiguous important events | Existing catalyst desk/model endpoint; metered | M | Explain grounded evidence only; never let generated prose create tickers or vetoes |
| 12 | Hyperliquid lead/lag study | Tests a hypothesis without assuming predictive value | Existing observations plus `POST /info {"type":"meta"}`. [Official API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals) | M | Restart/backfill timing bias, asset identity collisions, survivorship bias |

For BWEnews, retain the agreed AI/source safeguards and **discard its automatic ticker annotations**: the public page explicitly warns that matching can be wrong. Measure detection latency locally.

## 4. Remove / simplify

- **Stop using the development server operationally.** [package.json:15](<D:/claude projects/crypto-news-terminal/app/package.json:15>) launches `npm:dev`. Use a prebuilt production server, or keep the terminal closed while the ingest-to-JSON path runs.
- **Hidden launchers are useful for window management, not memory savings.** Prefer one supervised startup path, direct Node processes, single-instance protection, rotating logs, and restart handling. Avoid accumulating background shells.
- **Remove unused infrastructure before migrating databases:** `news:ticker:*` is written, but both news APIs query PostgreSQL. Remove that redundant index unless a measured need justifies it. Redis/WebSocket can become optional for the secondary terminal.
- **Remove remaining vote plumbing**—route, model, DTO fields, persistence, and actions.
- **Defer Coverage Score, Rising refinements, and decorative price widgets.** Correct affected-asset mapping and visible ingestion health have much greater value.
- **Do not build another unlock/funding collector.** The existing events file already contains unlocks, funding changes, OI observations, liquidations, and venue comparisons.
- Bound URL caches and retained detail data. `KEEP_DAYS` rejects old incoming articles; it is not a database-retention policy.

## 5. Phase 2 plan (≤8 ordered items with acceptance criteria)

1. **Repair the flag contract.**  
   Acceptance: a stopped writer produces UNKNOWN within 60 seconds; >48-hour items expire locally; future dates are quarantined; listing plus hack remains visibly risky; age, evidence, and link agree.

2. **Repair extraction and classification.**  
   Acceptance: every reproduced headline above has an asserted result; six-plus-asset delistings retain all assets; chain/venue mentions do not become affected assets; important incomplete notices trigger detail extraction; corrections update existing notices.

3. **Make processing and delivery recoverable.**  
   Acceptance: database/Redis/Discord failures, a ten-minute outage, and process restart lose no eligible queued event; retries are idempotent; hung sinks cannot stop polling silently; symbol replay survives restart; force-refresh test observes fetch calls.

4. **Complete the operational gate on the low-RAM machine.**  
   Acceptance: production launch, single instance, automatic restart, bounded logs, and sleep/resume recovery; 24 continuous hours with recorded memory and latency; zero unexplained ingestion gaps; completed price fixtures; manual audit includes tagged **and untagged** important notices.

5. **Join existing events and freeze signal-time evidence.**  
   Acceptance: every new signal stores news IDs, publication/observation times, coverage state, direction, and event-risk snapshot. Later news cannot retroactively make a signal “news-driven.” Upcoming unlocks remain explicitly scheduled events.

6. **Add BWEnews as the first new source after the soak.**  
   Acceptance: stable message IDs, edit handling, UTC timestamps, original-source links, AI gating, no imported automatic ticker tags; parser failures become visible; measure incremental coverage and latency for seven days.

7. **Add Upbit, OKX, then Coinbase adapters.**  
   Acceptance: silent initial seed; reconnect/gap detection; correct listing versus pair-addition versus delisting states; Upbit UPDATED events handled; no claims that market appearance equals advance notice.

8. **Deliver the useful report and alerts.**  
   Acceptance: Discord failure/retry tested with stubs plus an authorized delivery test; one consistent watchlist; report signal outcomes by news state/category/source, with sample sizes, costs, and uncertainty. Keep LLM explanations and the Hyperliquid study optional until this works.

## 6. Verdict

**5/10. Phase 1 is useful for manual investigation, but not yet fit as a trusted live trading filter/veto.** The architecture and scope are sensible, and the seven fix rounds improved it materially. However, expired chips can persist, bullish listings can mask hacks, affected-asset extraction still produces both false positives and misses, and delivery failures can lose events permanently. The saved evidence also does not satisfy the agreed 24-hour gate. Fix those failures before treating a chip—or its absence—as a trading decision input.
