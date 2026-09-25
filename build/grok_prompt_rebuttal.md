You reviewed my crypto news terminal plan earlier. My other researcher (Fable) checked your answer with live tests (HTTP requests and docs pages, 2026-09-25). It confirmed most of what you said, but it corrected some facts and disagreed with some of your judgement calls. Please respond point by point. Use live web search, cite a source URL for every factual claim, and say "unverified" if you can't confirm something.

Be honest in both directions: if Fable is right, concede plainly. If Fable is wrong, say why, with evidence. Don't defend a position just because you said it first.

## Quick context (unchanged)
- Solo crypto trader. I have a self-hosted CryptoPanic-style terminal (Next.js + Postgres + Redis + WebSocket, <1 s push). The news is currently fake.
- The real goal: add a "news on this coin in the last ≤48 h" flag to my Binance-perp base-break signals.
- My other tools: a catalyst desk (LLM analysis, 7 runs/day), an unlock/announcement tracker, and Discord bots.

## Fable's factual corrections to your answer (please verify or rebut)
1. **"Pairs often appear in the trading API before the announcement"** — Fable calls this unproven and says the evidence points the other way today:
   - Binance spot exchangeInfo has no pre-trading status. Statuses seen: only TRADING/BREAK. The enum is TRADING, END_OF_DAY, HALT, BREAK, CANCEL_ONLY.
   - On futures, new perps were announced ~60–75 min BEFORE their `onboardDate`. Examples:
     - OURAUSDT: announced 09-23 07:15, onboard 08:30.
     - MOONSHOTUSDT: announced 07:31, onboard 08:30.
   - The only PENDING_TRADING symbols were quarterlies that had been announced a week earlier.
   - Fable's position: symbol-diff is a *second confirmation*, not the primary trigger, until our own logs prove otherwise.
   - Also, the full spot exchangeInfo is 17.6 MB per call. `/api/v3/ticker/price` (158 KB) and `/fapi/v1/ticker/price` (49 KB) are better for diffing.
   - **Question:** do you have evidence (any exchange, any time) of pairs appearing in public APIs before the announcement? Which exchanges do this?
2. **KuCoin endpoint:** your `/api/ua/v1/market/announcement` works but is undocumented. The documented one is `GET /api/v3/announcements` (annType new-listings, no auth, weight 20, one-month default window). Agree?
3. **SEC feed:** `sec.gov/rss/news/press.xml` 301-redirects to `https://www.sec.gov/news/pressreleases.rss`. SEC rate-blocks a normal browser User-Agent; it requires a declared `AppName (email)` UA. You missed this. Agree?
4. **Upbit private WS:** confirmed. `wss://api.upbit.com/websocket/v1/private`, type announcement, JWT from an API key, launched ~2026-08-31. Limits: 5 connections/s, 5 msg/s, 100 msg/min.
5. **Bithumb:** `GET https://api.bithumb.com/v1/notices` is official. The limit is **1 request/second per IP**. Korean titles.
6. **Minor:**
   - Whale Alert API is "from US$29.95/month" (confirmed); your $699 Enterprise figure is unverified.
   - CoinGecko news is on the $129/mo Analyst plan (confirmed); "added March 2026" is unverified.
   - The Bitget "one-month window" is unverified.
   - OKX's official announcement API status is unverified (the endpoint was unreachable).

## Where Fable DISAGREES with your judgement (please argue or concede each)
1. **"Keep CryptoPanic PLUS open as a second screen."** Fable says no:
   - Panic Score is the only PLUS-exclusive data, and it's undocumented.
   - Free CryptoPanic is 5–10 min delayed.
   - Our cluster source-count + Telegram flash channels give a comparable "heat" cue.
   - Fable's advice: don't buy PLUS unless our own hit-rate log shows stories we missed that CryptoPanic caught.
2. **"Don't fake a community / votes are useless."** Fable half-agrees:
   - Drop bullish/bearish/toxic votes.
   - But keep ONE private button, "mark as catalyst / dismiss", because my clicks become the labels for the news→price backtest.
3. **"Phase 2 duplicates the catalyst desk."** Fable says only the per-headline LLM part does:
   - Clustering, importance scoring, firstSeen→price binding and 48 h freshness flags are real-time and are NOT in the catalyst desk (which runs 7 times a day in batch).
   - So keep those and cut only the per-item LLM.
4. **"Poll everything at 15–30 s."** Fable says that's too slow where latency is the whole point. Its cadences:

   | Source | Cadence |
   |---|---|
   | Bybit / Bitget / KuCoin (documented) | 5 s |
   | Bithumb | 2 s (official 1 req/s) |
   | Binance CMS | 10–15 s with If-None-Match (it returns ETags) |
   | Upbit REST | 10 s with ETag (`max-age=1`), until the Upbit WS replaces it |
   | Symbol-diff (Binance / Hyperliquid) | 10 s |
   | RSS | 60–120 s |
   | t.me/s | 30 s |

   Back off on any 403/429. **Question:** is 5 s on documented public endpoints really risky from a home IP, and what published limits say so?
5. **"Coverage Score ≠ Panic Score" → implying don't build it.** Fable agrees on the naming but not on dropping it. Cluster source-count × velocity is cheap and is our best free proxy for "is this spreading". Just don't call it Panic Score.

## Fable's merged Phase 1 build list (critique the order and the scope)
1. **Schema:** firstSeenAt, storyId, sourceTier (1 exchange / 2 TG flash / 3 major RSS / 4 other), importance, category (listing/delisting/hack/regulatory/etf/maintenance/other), exchange, rawKind. Adapter interface.
2. **Exchange announcement adapters:** Bybit, Bitget, KuCoin (documented), Bithumb, Binance CMS, Upbit REST.
3. **Symbol-diff:** Binance spot/futures `ticker/price`, Bybit `instruments-info`, Hyperliquid `meta`. Store both announcementSeenAt and symbolSeenAt.
4. **RSS + gov feeds:** 7 crypto outlets + SEC (with declared UA) + Fed `press_all.xml` + CFTC `rss.xml`.
5. **Telegram previews:** BWEnews, Wu English, PhoenixNewsEN, PhoenixNewsImportant, with a health flag after 3 failures.
6. **Tickers:** CoinGecko coins/list + aliases + blocklist (ONE, OP, IN, A, NEAR, LINK, SOL, ON, GAS, CORE, AI, NOW, OI, US) + `$TICKER` and "will list X (TICKER)" grammar.
7. **Clustering:** SimHash-64, Hamming ≤3 within 6 h, with a "first source" badge.
8. **Importance rules:** listing/delisting/hack/regulator/ETF = 70–100, maintenance 40, recap 20. Hot = importance ≥70 and ≤48 h; Rising = cluster gained ≥2 sources in 60 min.
9. **Discord gate:** portfolio coin, importance ≥70, ≤48 h, 1 alert per story per 30 min.
10. **Price binding:** Binance perp klines at +1/5/15 min; moved_5m = |ret5m| ≥1%; weekly hit-rate by source/category.
11. **Signal API:** `GET /api/news?ticker=SOL&since=48h&minImportance=50` + Redis ZADD per ticker, used by the base-break dashboard.
12. **Health monitor:** Discord ping if a tier-1/2 source is silent >30 min.

- **Deferred:** Upbit WS (needs a free key), Binance announcement WS (key + HMAC), X pay-per-use, Whale Alert, search, per-coin pages.
- **Dropped:** public product/PWA/accounts, community votes, per-headline LLM, FinBERT, embeddings, CryptoPanic API and PLUS, OKX/Gate/MEXC scraping.

## Output format
1. **Fact check:** for each of the 6 correction points: concede / rebut, with evidence URL.
2. **Judgement disputes:** for each of the 5: concede / hold your position, one short paragraph of reasoning each.
3. **Build list review:** anything to reorder, add, cut, or that is a trap. Highlight the top 3 risks.
4. **Final answer:** the Phase 1 you'd actually ship this week, max 10 bullets.

Keep it tight and concrete. No general explanations.
