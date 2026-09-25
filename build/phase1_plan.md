# Phase 1 — FINAL (agreed by Fable + Grok after 3 rounds, verified live 2026-09-25)

**The product:** a "news on this coin ≤48 h" chip on the base-break signal dashboard. The feed UI is secondary.

## Build list (in order)
1. **Schema + signal API first**
   - Add to Post: `firstSeenAt`, `publishedAt`, `storyId`, `sourceTier`, `importance`, `category`, `exchange`, `announcementSeenAt`, `symbolSeenAt`, `userLabel` (private catalyst/dismiss), `ret1m`, `ret5m`, `ret15m`, `moved5m`.
   - `GET /api/news?ticker=&since=48h&minImportance=`, backed by Redis `ZADD news:ticker:{T} firstSeenAt postId`.
   - Add the "news ≤48 h" chip on the base-break dashboard.
2. **Adapter framework**
   - Adapters of the form `{name, tier, intervalMs, fetch()}` replace `lib/mockNews.js`.
   - One shared HTTP client: declared User-Agent, ETag/If-None-Match, ±20 % jitter, exponential backoff on 403/429.
   - Sleep-resume guard: on a clock jump, skip one cycle.
   - Track `lastOkAt` per adapter.
3. **Documented exchange adapters**

   | Source | Endpoint | Interval |
   |---|---|---|
   | Bybit | `https://api.bybit.com/v5/announcements/index?locale=en-US&type=new_crypto` | 5 s |
   | Bitget | `https://api.bitget.com/api/v2/public/annoucements?annType=coin_listings&language=en_US` | 5 s |
   | KuCoin | `https://api.kucoin.com/api/v3/announcements?annType=new-listings&lang=en_US` (successor, also documented: `/api/ua/v1/market/announcement`) | 5 s |
   | Bithumb | `https://api.bithumb.com/v1/notices?count=20` (follow the 302; Korean titles) | 2 s |
4. **Binance CMS adapter**, tier "1-unofficial"
   - `https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=20&catalogId=48` (catalog 161 = delisting).
   - Every 10–15 s, with ETag.
   - Health-flagged. It never blocks the signal API.
5. **Symbol-diff confirmation**
   - Binance `/api/v3/ticker/price` and `/fapi/v1/ticker/price`, every 10 s. Sets `symbolSeenAt`.
   - Log both timestamps (announcement vs symbol).
   - Hyperliquid `meta` goes into the same PR once this is stable.
6. **RSS**
   - Feeds: cointelegraph.com/rss, theblock.co/rss.xml, decrypt.co/feed, coindesk.com/arc/outboundfeeds/rss/, cryptoslate.com/feed/, beincrypto.com/feed/, blog.kraken.com/feed.
   - SEC: `https://www.sec.gov/news/pressreleases.rss`, with UA `CryptoNewsTerminal/1.0 (email)`. SEC allows max 10 req/s.
   - Every 60–120 s.
7. **Ticker tagging v2**
   - CoinGecko `/coins/list` (daily cache), an alias table, and `$TICKER` / "will list X (T)" grammar.
   - The blocklist applies ONLY to bare, un-gated 2–3-letter tokens: ONE, OP, IN, A, ON, AI, GAS, OI, US, NOW.
   - Never block SOL/LINK/NEAR globally.
8. **SimHash clustering**
   - 64-bit hash, Hamming ≤3, 6 h window, giving a `storyId`.
   - Show a first-source badge and a source count.
9. **Importance + Discord + health**
   - Scores: listing/delisting/hack/SEC/ETF = 70–100 by tier; maintenance = 40; recap = 20.
   - Discord alert when all hold: coin is in the portfolio, importance ≥70, age ≤48 h. Max 1 alert per story per 30 min.
   - Discord ping if a tier-1 adapter is silent >15 min, or RSS is silent >30 min.
10. **Price binding + soak gate**
    - Async `/fapi/v1/klines` snapshots at +1/5/15 min. `moved5m` = |ret5m| ≥1 %.
    - Weekly hit-rate report by source/category, posted to Discord.
    - **Done only after a 24 h soak:** per-adapter counts, duplicate rate, and a manual false-tag audit of 50 items.

## UI
- Remove the public bullish/bearish/important/toxic votes.
- Add a private catalyst/dismiss label, an Exchange tab, an age badge, and a 48 h fresh flag.

## Resolved disputes (round 4, Grok conceded both)
- **Hyperliquid `meta`:** goes in the SAME PR as the Binance ticker-diff, once the diff worker is generic, i.e. `diff(source, key)`.
  - `POST https://api.hyperliquid.xyz/info {"type":"meta"}` costs weight 20; the cap is 1200 weight/min/IP. Polling every 10 s uses ~120/min.
  - It is NOT a leading indicator for Binance listings, so don't trade it as one.
  - Discord alert only if the coin is in the portfolio.
- **Telegram BWEnews:** the FIRST Phase 2 item, starting after the 24 h soak. Never Phase 1, and never MTProto.

## Phase 2 (next)
1. **Telegram BWEnews.** Safeguards:
   - Only `https://t.me/s/BWEnews` at first, polled every 30 s with a browser UA and an ETag / length hash.
   - Parse `tgme_widget_message` and fail closed. Health-flag after 3 empty or non-200 responses.
   - Store title + source URL only.
   - Keyword gate: hack | exploit | drain | SEC | CFTC | pause.
   - Ignore "BWENEWS AI (No Accuracy Guaranteed)" posts unless the source URL is a first-party domain.
   - Caveats: BWEnews mostly reposts other sources, and its speed vs the original source is unverified. Measure it with firstSeenAt.
   - Hack alternatives checked, none a free fast wire: PeckShield / SlowMist / CertiK are X-only; DefiLlama hacks is $300/mo and archival; Rekt takes hours.
2. Hyperliquid meta — now part of Phase 1 (see above).
3. Upbit private WebSocket (needs a free Upbit API key).
4. Coverage Score (source-count × velocity). Do not call it Panic Score.
5. Rising = cluster gained ≥2 sources in 60 min.

## Deferred / dropped
- **Deferred:** Fed/CFTC feeds, Binance announcement WS (needs a key + HMAC), X pay-per-use (~$0.005 per read), Whale Alert (from $29.95/mo), search, per-coin pages.
- **Dropped:** public product/PWA/accounts, community votes, per-headline LLM (only clusters with importance ≥70 go to the existing catalyst desk), FinBERT, embeddings, CryptoPanic API ($199/mo) and PLUS ($49/yr), OKX/Gate/MEXC scraping.

## Verified rate limits
| Source | Published limit | Our usage |
|---|---|---|
| Bybit | 600 req / 5 s per IP; a breach = 403 and ≥10 min wait | 1 req / 5 s (0.2 %) |
| Bitget | 20/s | trivial |
| KuCoin | weight 20 per call, pool of 2000 per 30 s | ~6 % |
| Bithumb | 1 req/s | 1 req / 2 s |
| SEC | 10 req/s | well under |
