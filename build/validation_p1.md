# Phase 1 validation

## Validation Score: 6/10

The ingest core is solid now. The scheduler, backoff, watchdog, health checks, save-error propagation, alert gating and label security all hold up on review. What's still wrong is mostly data quality, and it lands where the plan says it matters most: the "news ≤48 h" chip. Two classes of false flag were reproduced against the real code in `crypto-news-terminal/app` (the `build/` directory has no `ingest/`). There is also one path where a symbol-diff event is lost for good.

**Probe run (real `tagTickers` + `classify`, cached CoinGecko universe plus the live Binance futures bases):**
```
["BTC","SPX"] regulatory 70 | Bitcoin and SPX drop as Senate stalls market structure bill
["SOL","ARK"] etf 70        | ARK Invest files for new spot Solana ETF
["SOL"]  hack 85 bearish    | Hackers drain $5M from lending protocol on Solana
["ARB"]  hack 85 bearish    | Arbitrum-based DEX exploited for $12M
["ERC20"] listing 95        | Bybit Will List XYZ (ERC20) on Spot
["UTC","TRX"] maint 40      | Bitget will suspend deposits on the TRON network (UTC)
["XRP"] regulatory 70       | Ripple effect: SEC charges crypto lender
200 tag calls: 71 ms before 30 universe reloads → 1948 ms after
```
Checked live: ARKUSDT, SPXUSDT, ALTUSDT, BANKUSDT and HOMEUSDT are on Binance futures, so `addBases` puts them in `bySymbol`. SPX is also in the CoinGecko cache.

## Passed Checks
- **Scheduler** (`scheduler.js`):
  - The watchdog timer is cleared on both paths.
  - Backoff: 403/418 wait ≥10 min, 429 waits ≥60 s, other errors back off exponentially up to 10 min.
  - The sleep guard skips planned backoffs.
  - `warm` is only set after `onItems` succeeds and `warmRuns` is reached.
  - An `onItems` failure clears the ETag cache so failed items are re-fetched.
- **HTTP client** (`http.js`): the abort timer covers the body read, and `Retry-After` is parsed as seconds or as a date.
- **Store** (`store.js`):
  - Invalid dates and relative URLs are rejected.
  - Non-duplicate DB errors are rethrown, and the item is removed from `storyIndex`.
  - The Redis ZADD per ticker matches the plan.
  - `symbolSeenAt` is only set for venues of the same exchange.
- **Timestamps:** Bithumb `+09:00` is correct for the current format (verified live). Bybit, Bitget, KuCoin and Binance CMS use millisecond epochs. RSS uses `isoDate`/`pubDate`, and items without a date are skipped.
- **Price worker:**
  - Candle offsets are right: p0 is the close before first-seen; p1, p5 and p15 are closes at +1/+5/+15 min.
  - The 16-minute gate guarantees those candles are closed.
  - On 429/418 it pauses and stops the batch.
  - Only items first seen ≤30 min after publication are measured.
- **Symbol diff:**
  - Seeding happens only after `createMany` succeeds.
  - A size floor rejects partial lists.
  - A flood cap stops emission at >10 new bases.
  - Only a base that is new to the venue is emitted.
  - Symbol items are tagged only with their hint base.
- **Discord alerts:** fire only when warm, importance ≥70, publishedAt ≤48 h and the coin is in the portfolio. `SET NX EX 1800` per story gives the planned max of one alert per 30 min.
- **Label route:** JSON content type is required, which forces a CORS preflight, which fails, so cross-site POST is blocked. Foreign Origins get 403, the label is whitelisted, and the UUID is checked.
- **`news_chip.js`:** uses `textContent` and `title` only (no injection). A `data-key` prevents duplicate chips, and age is taken from `publishedAt`.
- **Rate limits:** every source is far below its published limit. Binance weight is about 30/min across the ticker lists and klines (limit 20 costs weight 1). Hyperliquid uses about 120/1200 weight per minute.
- **UI:** public votes are removed from the row, and the private catalyst/dismiss label, Exchange tab, age badge and 48 h fresh flag are present.

## Failed Checks
1. **False tickers from uppercase tokens, confirmed** (`tickers.js`, bare-token loop, `\b[A-Z0-9]{2,10}\b` checked against `bySymbol` with `addBases` merged in). SPX (the S&P 500), ARK (ARK Invest) and ALT are live futures bases or CoinGecko symbols, and none of them are blocked. "ARK Invest files for Solana ETF" puts an ETF 70 chip on **ARK**. "Bitcoin and SPX drop… bill" puts a regulatory 70 chip on **SPX6900**. Both are wrong flags on base-break rows.
2. **The "where it happened" chain gets tagged as the subject, confirmed.** The hack headlines above give a red HACK 85 chip on **SOL** and **ARB** for 48 h, although SOL and ARB weren't hacked. There's no "primary subject" rule, and `newsFile.tick` flags every instrument on the post.
3. **Parenthetical rule (c) accepts any uppercase token for exchange items, confirmed** (`resolveParenthetical`; `listingContext` is always true for exchange items). "(ERC20)" or "(UTC)" becomes a ticker. In "Bybit Will List XYZ (ERC20)", ERC20 is `tickers[0]`, so the real new coin gets **no chip** and the price binding goes to ERC20 (status 'na').
4. **The universe index grows on every reload, confirmed** (`tickers.js` `buildIndexes`). `names` is appended to and never reset, and `bySymbol`/`nameUpper` keep stale first entries. The daily timer duplicates about 500 phrases a day, so tagging cost grows linearly: ~27× slower after 30 reloads. On top of that, `readCache()` usually still holds a <24 h cache when the 24 h timer fires, so the refresh mostly re-reads stale data.
5. **Plan fidelity: poll latency** (`binanceCms.js`, `bybit.js`, `bitget.js`, `kucoin.js`). Each adapter alternates listing and delisting on one timer. Catalog 48 is therefore polled about every **24 s**, not the planned 10–15 s. Bybit, Bitget and KuCoin listings are polled about every 10 s, not 5 s. The listing feed is the latency-critical one.
6. **Plan fidelity: User-Agent** (`config.js` `BROWSER_UA`, `http.js`). The plan calls for a *declared* UA. The code sends a spoofed Chrome UA to everything except the SEC. On the unofficial Binance bapi, a spoofed UA with a Node TLS fingerprint is the kind of mismatch bot filters look for (unverified).

## Critical Issues (must fix before the 24 h soak)
- **C1. Symbol-diff events can be lost permanently** (`symbols.js`, new-symbol loop; `store.js` catch `e.code === 'P2002'`).
  - In `symbols.js`, the symbol is added to `known` and a `knownSymbol` row is written *before* the item is saved. If the save then fails (DB blip), the event is never re-emitted.
  - A `knownSymbol.create` that throws mid-loop drops every base already collected in that cycle.
  - In `store.js`, every P2002 is treated as a duplicate URL. Prisma's nested `connectOrCreate` is not atomic. If two adapters save a new coin concurrently (spot and futures symbol items, or CMS plus Bybit), `Instrument.ticker` raises P2002. The post is silently dropped and a phantom entry stays in `storyIndex`.
  - This is plausible but not reproduced; it needs concurrent inserts.
  - Fix: treat P2002 as a duplicate only when `e.meta?.target` includes `url`, and otherwise retry once. Mark symbols known only after the save succeeds, or keep a retry queue. Call `storyIndex.remove(id)` on the duplicate path too.
- **C2. Macro acronyms colliding with coin tickers.**
  - Add SPX, ARK, ALT, NFP (not listed today), DXY, VIX, PCE, PMI, G7, TGE, ICO, KYC, AML, OFAC, UTC, VIP and AMA to `BARE_BLOCK`.
  - Add ARK and SPX to `NEEDS_GATE`, so that `$SPX` and "(SPX)" in a listing still work.
  - Better: for `kind:'news'`, only accept bare tokens that are in the CoinGecko universe, not in the `addBases`-only set.
- **C3. Chain-context tags on hack/delisting chips.** For news of category hack or delisting, only flag a ticker that is the subject. For example, drop an alias or name match followed by `-based`, or preceded by `on`, `across` or `ecosystem`. Or keep chain tags on the post but exclude them from `newsFile` flags. Otherwise every DeFi exploit paints SOL, ETH or ARB red for 48 h.
- **C4. Network and timezone tokens in parentheses.** Add ERC20, BEP20, TRC20, SPL, UTC and KRW to `EXCLUDE` (they can never be tickers). Also apply that list to Bithumb `hintTickers`, which currently bypass all gating.
- **C5. `buildIndexes` must rebuild into fresh structures and then swap.** The daily refresh must also force a fetch rather than re-read a cache that is under 24 h old.

## Nice-to-have Improvements
- Split `binance-cms` into catalog 48 every 12 s and catalog 161 every 30–60 s. Do the same for Bybit, Bitget and KuCoin (listing every 5 s, delisting slower). Switch to a declared UA except where a browser UA is proven necessary.
- **Unverified:** Bithumb titles of the form "…(XYZ) 비트코인(BTC) 마켓 추가" would give **BTC** a bullish listing-95 chip through `RE_TICKER`. Drop quote tokens (BTC, KRW, USDT) from Bithumb hints when the title says "마켓 추가".
- **Clustering** (`cluster.js` `assign`): the exact-title and simhash rules don't check tickers. Two templated listing titles for different coins within 6 h could merge (low probability, not reproduced). The second coin would then be hidden behind "+1" in the feed, and its Discord alert suppressed by the storyId key. Require overlapping tickers (or both empty) for a simhash match.
- **Silent skips:** items rejected as invalid (`store.js` "skip invalid item") are only logged. If the Bithumb date format changed, that adapter would go silent while still reporting healthy. Count skips per adapter and include them in health.
- **SEC:** every SEC release is scored `regulator` → 80, crypto or not. Gate it on crypto keywords before `SEC_USER_AGENT` is set.
- **Backlog timestamps:** `announcementSeenAt = now` is set for backlog exchange items too, which corrupts the announcement-vs-symbol timing log. Only set it when `now - publishedAt` is ≤ ~10 min.
- **API:**
  - `/api/news` echoes the raw `since` (`999d` is echoed but clamped to 30 d).
  - `/api/news/flags?tickers=,,,` returns *all* tickers instead of none.
  - `Access-Control-Allow-Origin: *` exposes `userLabel` to any site the user visits (low sensitivity).
  - The label route has no auth. That's fine only if Next binds to 127.0.0.1 (not verified).
- **Startup:** it fails fatally if CoinGecko fails *and* no cache file exists (`loadUniverse` rethrows). Degrade to futures bases instead.
- **Chip:** color and tooltip use the highest-importance item, but the age uses the latest item, so a fresh minor item can show next to an old red hack.
- **Dead code:** `futuresHook` in `ingest.js`.
- **Aliases:** "ripple" → XRP and "avalanche" → AVAX also fire on common English phrases (confirmed for "Ripple effect").

**Not verifiable here:** price binding (needs a live item plus 16 min), Discord alerts, the SEC adapter, the weekly report, the 24 h soak, the Next bind address, and the exact wording of Binance Alpha and HODLer titles.

## Ship Decision: SHIP WITH FIXES
Fix C1–C5, run the probe again, then start the 24 h soak. The plan says Phase 1 is done only after that soak. For the manual audit of 50 items, deliberately include exploit headlines and macro/ETF headlines.