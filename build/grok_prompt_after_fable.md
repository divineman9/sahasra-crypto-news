You are my research partner and critic. Use live web search. Today is 2026-09-25. I want your honest, specific opinion. For every claim give the source URL, and say "unverified" when you're not sure. Don't invent APIs or prices.

## What I've built
A self-hosted, CryptoPanic-style real-time crypto news terminal, running on my Windows PC. I'm a solo crypto trader.
- **Stack:** Next.js 15 + React 19 + Tailwind + Zustand, PostgreSQL (Prisma), Redis (hot list + pub/sub), and a Node WebSocket server that pushes new items to the browser in under 1 second.
- **Working:** dense 3-column terminal UI; filters All/Hot/Rising/Bullish/Bearish; portfolio ticker filter; trending coins; CoinGecko price widget; in-app article pages; community votes (one per type); "N new posts" bar; Load older (cursor pagination); reconnect + re-sync; CSRF protection; localhost only.
- **Not real yet:** the news is FAKE (a mock generator), sentiment is random, and ticker tagging is a 30-coin regex.
- **My other tools this should feed:**
  - A Binance-perp base-break signal dashboard.
  - A crypto catalyst desk (LLM analysis, 7 runs/day).
  - A token-unlock / exchange-announcement tracker.
  - Discord alert bots.
- **My rule:** news only counts as a catalyst or risk if it is ≤48 hours old.

## What my other AI researcher (Fable) found about CryptoPanic
- **Pricing:**
  - **PLUS:** $49/year, as seen on the /plus/ page today (third parties still quote $9/mo or $99/yr).
  - **What PLUS buys:** mainly speed. The feed refreshes every 10 min for visitors, 5 min for free accounts, and ~30 s for PLUS. PLUS also adds no ads, a "Panic Score" (0–100 buzz metric), 20 followed coins instead of 5, 5 bots instead of 1, custom RSS/Reddit/YouTube sources, and newsletters.
  - **Free API:** discontinued on 1 April 2026.
  - **Paid API:** Growth weekly $50/wk (600 requests/week); Growth $199/mo (3,000 requests/mo, 1 month history); Enterprise from $899/mo (push, search, similar news, 1 year history).
  - **Scraping:** robots.txt disallows `/api/` and `/web-api/`, and the public RSS returns 410.
- **How it works:**
  - Sentiment = community votes (like/dislike/bullish/bearish/important/lol/toxic), not a model.
  - The Hot/Rising formula is undocumented.
  - Ticker tagging looks dictionary-based with false positives (e.g. "IN" tagged on "JUST IN", "A").
  - Sources: RSS outlets, X accounts, Reddit, YouTube, Binance Square, Benzinga.
- **Free sources verified reachable today:**
  - **RSS:** cointelegraph.com/rss, theblock.co/rss.xml, decrypt.co/feed, coindesk.com/arc/outboundfeeds/rss/, cryptoslate.com/feed/, beincrypto.com/feed/, blog.kraken.com/feed.
  - **Other:** Google News RSS search; Reddit `.rss`; YouTube channel RSS.
- **Exchange announcements, free, polled every 2–5 s:**
  - Bybit `/v5/announcements/index` (documented).
  - Bitget `/api/v2/public/annoucements`.
  - Upbit `api-manager.upbit.com/api/v1/announcements`.
  - Binance CMS JSON `bapi/composite/v1/public/cms/article/list/query` (undocumented). Binance's official announcement WebSocket needs an API key + signature.
  - OKX: its endpoint failed to respond — unverified.
- **Telegram flash news:** public previews `t.me/s/BWEnews`, `t.me/s/wublockchainenglish`, and PhoenixNews channels (HTML, fragile).
- **X/Twitter:** reportedly pay-per-use (~$0.005 per post read) now. Unverified.
- **Paid competitors:**
  - Tree News / Tree of Alpha: $500–2,500/mo, 1,150+ sources, 0–5 s latency.
  - PhoenixNews: 1,500+ sources.
  - CoinGecko news API: $129/mo tier.
  - CoinDesk Data news (free tier possibly retired).
  - cryptonews-api.com, Messari, Santiment, The Tie.
  - CryptoListing.ws: sub-150 ms listing WebSocket.
- **Speed ranking for trading headlines:** exchange endpoints (seconds) > Telegram flash channels > paid terminals > publisher RSS (minutes) > CryptoPanic free (5–10 min).

## The plan we came up with
- **Phase 1 ($0, this week):**
  - Replace the fake generator with adapters: 7 RSS feeds, 4 exchange announcement feeds, 3 Telegram previews, and Reddit.
  - Categories via keyword rules: listing / delisting / hack / regulatory / other.
  - Ticker tagging from the CoinGecko coin list, plus aliases and a stopword blocklist.
  - Age badge and a 48h "fresh" flag; an "Exchange" filter tab.
  - Discord push for new listings on my portfolio coins.
- **Phase 2:**
  - Story clustering (SimHash on titles, 6h window) and a free "Coverage Score" (source count + spread velocity) instead of their paid Panic Score.
  - GLM LLM sentiment + a one-line "why it matters" per story cluster.
  - Per-coin pages, Postgres full-text search, alert rules UI.
- **Phase 3 (optional):** accounts, hosting, PWA + web push, public product.
- **Where we think we beat CryptoPanic:**
  - Exchange listing speed (seconds).
  - A 48h news flag attached to my trading signals.
  - A free Coverage Score.
  - LLM "why it matters".
  - Unlimited rule-based Discord alerts.
  - Archive/search beyond 1 month.

## What I want from you
1. **Critique the plan.** What's wrong, missing, over-engineered, or risky? Is anything in Fable's findings outdated or incorrect as of today?
2. **Improvements:** what specific additions would make this *meaningfully better for a trader* than CryptoPanic PLUS and closer to Tree News / PhoenixNews, while staying free or cheap? Rank by trading value vs effort.
3. **Missing sources:** fast, free, legal sources we missed, with exact endpoints. Consider:
   - Exchanges: OKX, Coinbase, Kraken, KuCoin, Gate, MEXC, Hyperliquid, Bithumb.
   - Regulators: SEC/CFTC RSS.
   - Hack/exploit feeds.
   - Token unlock data.
   - On-chain whale alerts.
   - Funding / open-interest spikes.
   - Truth Social / White House / Fed for macro headlines.
   - Chinese / Korean flash sources.
4. **Speed:** a realistic target latency for each source type, and how to get closer to Tree News speed for free: polling cadence, ETag/If-Modified-Since, WebSockets, hosting in Tokyo/Singapore, etc.
5. **Quality:** the best practical method for each of the following, with reasoning and cost per 1,000 headlines:
   - Deduplication / story clustering.
   - Ticker disambiguation (e.g. LINK, OP, NEAR, ONE, SOL used as normal words).
   - Sentiment/importance: keyword rules vs FinBERT/CryptoBERT vs an LLM.
6. **Trading edge:** how would you connect news to price action? For example:
   - Auto-mark price move ±X% within N minutes after a headline.
   - A "news-driven vs no-news move" label on signals.
   - Backtesting which sources and categories actually move price.
7. **Legal/ToS risks** of each source: RSS headlines, exchange endpoints, Telegram previews, X, and a public version.
8. **Verdict:** is it worth building this vs just paying $49/yr for CryptoPanic PLUS? Answer honestly, for a solo trader.

## Output format
- Bullet points and tables, no fluff.
- **Sections:** 1. Plan critique · 2. Top 10 improvements, ranked (value/effort) · 3. Missing sources table (name, endpoint, speed, cost, legal note) · 4. Speed plan · 5. Quality methods · 6. News→price edge ideas · 7. Legal risks · 8. Verdict.
