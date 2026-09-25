# PHASE 3 — ALTCOIN COVERAGE + CRYPTOPANIC-LEVEL BREADTH (draft for Fable review)

Goal (user, 2026-09-25): "we need all our altcoins news — that is the main thing". Secondary: CryptoPanic-like breadth (more publishers, Reddit, blogs, YouTube) and look.
Sources: build/review_fable_cryptopanic_gap.md (live-verified), build/review_astra_cryptopanic_gap.md (static; DB-measured).

## Baseline (both reviewers, 2026-09-25 ~11:00 ET)
- Live-setup coins with ANY tagged post ≤48 h: Fable 12/49 (24%), Astra 8/46 (17%); with the importance ≥50 chip filter: 3/46.
- Causes (agreed): (1) only 6 editorial RSS publishers; (2) chip/API hide ordinary news (importance ≥50 default); (3) tagger recall misses project names ("Ethena", "Sei", "NEAR Protocol"), tokenized-stock false tickers (OURA, CORZ…) pollute Trending; (4) UI loads 50 posts, no coin page.
- Success metric for Phase 3 (Astra): `live-setup coins covered / live-setup coins` ≥ 90 % (target ≥45/49), tag precision on a 50-item audit ≥ 95 %, no source failure silent > 10 min, detection delay measured.

## Steps (each: spec → tests → GLM → Fable review; Astra batched later, review only)

### Step 1 — Show what we already have (S)
- `/api/news?ticker=X`: default `minImportance=0` when a ticker is given; response adds `importantCount` (≥50).
- `news_live.json`: per base add `newsCount48h` (any importance, fresh ≤48h) next to the existing risk/catalyst picks; dashboard chip shows a neutral `📰 N` chip when there is news but no risk/catalyst pick (risk/catalyst chips unchanged, alerts unchanged).
- Tokenized stocks: symbols matching the stock-perp set (Bitget/Binance stock perps, xStocks, pre-IPO) are never ticker-tagged and never count in Trending.

### Step 2 — Tagger recall (M)
- Explicit project-name aliases for the Binance-perp universe (CoinGecko name + curated overrides: "Ethena"→ENA, "Sei"→SEI, "NEAR Protocol"→NEAR, "Sui Network"→SUI, "Harmony"→ONE…), subject-vs-ecosystem context kept.
- Regression fixtures from both reviews (Ethena governance, Sei upgrade, NEAR Protocol upgrade → tagged; "Polygon veterans" → not POL).

### Step 3 — Breadth: +~40 verified RSS feeds (S)
- Fable's live-verified list (publishers + mainstream + regulators), per-feed tier and 120 s interval; cap huge feeds (Crypto Daily); price-prediction/sponsored guard in classify (importance ≤20).

### Step 4 — Per-coin news adapter (L) ← the main fix
- `coin_sources.json` map per traded base: name, aliases, ambiguity flag (reuse tickers.js BARE_BLOCK/NAME_BLOCK), Google query.
- Google News RSS (`news.google.com/rss/search?q=…+when:2d`), Bing News RSS fallback on 429/empty.
- Entity-evidence gate: attach the coin only if the title/description contains its name, `$SYM` or "SYM token/coin"; never tag solely because the search returned it; drop stock/company collisions.
- Tiers: A = live-setup coins (from base_break_live.json) every 10 min; B = portfolio + top-100 every 60 min; C = rest every 12 h (batched OR queries). Budget ≤ ~5,000 Google requests/day, jitter, Retry-After/backoff, per-host budget. Start with tier A only, measure, then enable B/C.
- sourceName `gnews:<domain>`, tier 4, importance 25 baseline, promoted by existing category regexes; dedupe against direct-RSS URLs/story clusters; count distinct publishers.
- Keep publishedAt/firstSeenAt separate; first run backfills `when:7d` for tier A as non-warm (no alerts).

### Step 5 — Coin page + search + source tabs (M)
- `/coin/[ticker]`: server-side 48 h / 7 d query (not the 50 loaded rows), source-type tabs News / Exchange / Official / Social / Media, clickable ticker chips everywhere, search box.

### Step 6 — Official & wire sources (M)
- Generalize the t.me/s adapter: TreeNewsFeed, wublockchainenglish, WatcherGuru, whale_alert_io, Walter_Bloomberg, PeckShieldAlert, CertiKAlert (X substitute).
- Project blogs (Ghost/paragraph/own-domain), GitHub releases.atom (stable releases only), governance forum latest.rss — from a CoinGecko links crawl (free Demo key, one-time + weekly).

### Step 7 — Media & Social tabs (S/M)
- YouTube channel RSS (14 verified IDs), kind `media`, importance 10, thumbnails, never alert.
- Reddit: needs the user's free Reddit "script" app (OAuth, 100 QPM) — 6–8 subs, score/flair gated, kind `social`, never alert. (Unauthenticated ≈ 1 req/min → not viable.)

### Step 8 — Look parity (M)
- Age-first column, publisher favicons, Important + Saved filters, wider headline, expandable details, infinite scroll to 7 days.

Not doing (agreed): X/Twitter scraping, Binance Square (bot-walled), CryptoPanic votes/Panic Score.

Needs from user: Reddit script-app credentials (Step 7, optional); CoinGecko free Demo key (Step 6, optional).


## FABLE PLAN REVIEW (2026-09-25) — authoritative changes
ORDER: 1 → 4A → 2 → 3 → 5 → 4B/C → 6 → 7 → 8 (Google tier A before tagger + feeds; coin page right after 4A).

### STEP 1 SPEC (authoritative)
(a) app/src/app/api/news/route.ts: minImportance default 0 (explicit param honoured); add totalCount (importance ≥ minImportance) and importantCount (≥ max(50,minImportance)) via prisma.post.count with same where, Promise.all with findMany; response {ticker, since, minImportance, count, totalCount, importantCount, items}. /api/news/flags unchanged.
(b) app/ingest/newsFile.js: query drops importance≥50 (keep publishedAt window + ≤5 min future, firstSeenAt window, dismiss filter, take 5000, order firstSeenAt desc). chipPosts = importance≥50 → flags built EXACTLY as today (risk/catalyst/other/items/count/latestPublishedAt). From ALL posts per instrument ticker (create entry with risk/catalyst/other null, items [], count 0, latestPublishedAt null if absent): newsCount48h = distinct storyId??id; newsLatestPublishedAt = ISO max publishedAt; newsLatest = up to 3 items (same item shape), one per storyId, publishedAt desc. Top level: schema 2, min_importance 50, add news_min_importance 0.
(c) crypto/screener/news_chip.js (ES5): when no risk/catalyst/other chip is shown and typeof f.newsCount48h==='number' && f.newsCount48h>0 && f.newsLatest && fresh(f.newsLatest[0]) → one neutral chip `📰 N`, class "badge news-chip news-chip-neutral", href to newsLatest[0].id, color/border var(--muted,#8a93a6), bg rgba(138,147,166,.08), weight 500, no glow/animation; tooltip "N news items ≤48h (no risk/catalyst flag)" + each newsLatest line "[CAT IMP] title — source · age ago" + "Click to open in the news terminal"; data-key "news:"+N+":"+id+"|"+minute. Precedence risk>catalyst>other>neutral; never together. Removed when stale.
(d) Tokenized stocks — in tickers.js: NON_COIN_SEED set (OURA CORZ SDGR TLT STONK JEPQ KIOXIA URNM HUT GSTOCK TSLA NVDA AAPL MSTR COIN HOOD CRCL SPY QQQ META MSFT AMZN GOOGL XAU XAG NATGAS COPPER BTCDOM DEFI); nonCoin = seed ∪ list; export setNonCoinBases(list), isNonCoin(sym); ok(t) returns null for nonCoin; persist to ingest/cache/noncoin.json, load at init. Export STOCK_PERP_TITLE_RE (classify imports it instead of its own STOCK_PERP_RE); when title matches: skip pair rule for bases not in bySymbol, skip brand-new-listing parenthetical branch, drop hints not in bySymbol. ingest.js refreshBases(): fetch fapi.binance.com/fapi/v1/exchangeInfo (10 min timer, 15 s timeout, failures logged): coinBases = underlyingType COIN; nonCoin = others minus coinBases (base = strip quote USDT|USDC|USD1|BTC|ETH|BNB then 1000000|1000); addBases(coinBases) only; setNonCoinBases(nonCoin). Helper computing coin/nonCoin must be exported & testable.
Tests: step1_stocks.test.js, step1_newsfile2.test.js, chip checks, route checks, build/tests/coverage_probe.js (setup coins with ≥1 post ≤48h at ≥0 and ≥50).

### STEP 4A corrections
One gnews adapter (20 s tick) with priority queue + token bucket ≤5,000/day, per-coin nextDueAt in ingest/cache/gnews_state.json; A every 15 min, B 60 min, C 12 h batched OR of 4; ≤3 coins per tick; 429/403 pause adapter; GNEWS_ENABLED / GNEWS_TIERS env; tier A = exported refreshPortfolio() logic. Title-only entity gate in ingest/coinMatch.js matchCoin(title, rec) shared with Step 2; ambiguous coins need multiword alias or $SYM/pair; drop non-coin/stock titles; failing items DROPPED; strip trailing " - <source>". RawItem: sourceName 'gnews:'+publisher host, tier 4, kind news, hintTickers [SYM], sourceDomain publisher host, alertable:false; store.js: sourceDomain = raw.sourceDomain || hostname(url); honour raw.alertable===false. Keep Google redirect URL; dedupe via titleKey normalize(title)+'|'+sourceDomain (direct copy wins). OPINION on tier 4 → importance 10. Backfill when:7d non-warm; skip non-ASCII bases. coin_sources.json tier A hand-curated (~50). Add gnews stats log every 10 min.
Risks: KCS tagged from "KuCoin Futures" (ASSET_AFTER), Polygon veterans → POL, TRUMP/ONE/ARK need aliases overriding NAME_BLOCK; low-importance flood → add "hide tier-4 other <30" toggle with Step 5.
