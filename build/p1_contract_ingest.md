# PHASE 1 — INGEST CONTRACT (authoritative; follow literally)

Project root `D:\claude projects\crypto-news-terminal\app`. Node 24 (global `fetch`, `AbortController`). CommonJS (`require`) for everything under `ingest/`.
Every entry script calls `require('dotenv').config()` first.
Available packages: @prisma/client, ioredis, dotenv, rss-parser (added).
Prisma client: `const { PrismaClient } = require('@prisma/client')`.
Redis: `new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 2, enableOfflineQueue: true })`.

## 0. Prisma schema (already applied — use these fields)
Post has: `id, title, url @unique, sourceDomain, publishedAt, kind, sentiment, instruments Instrument[], votes VoteData?, createdAt`, plus:
- `firstSeenAt DateTime @default(now())`
- `sourceName String @default("mock")`
- `sourceTier Int @default(4)`
- `category String @default("other")`
- `importance Int @default(20)`
- `exchange String?`
- `storyId String?`
- `simhash String?`
- `announcementSeenAt DateTime?`
- `symbolSeenAt DateTime?`
- `userLabel String?`
- `priceTicker String?`
- `priceStatus String @default("na")`
- `p0 Float?`, `ret1m Float?`, `ret5m Float?`, `ret15m Float?`, `moved5m Boolean?`

Other models:
- `Instrument { id, ticker @unique, name, posts }`
- `KnownSymbol { id, venue String, symbol String, firstSeenAt DateTime @default(now()), @@unique([venue, symbol]) }`

Allowed values:
- kind: `"news" | "exchange" | "regulator" | "symbol"`
- category: `"listing" | "delisting" | "hack" | "etf" | "regulatory" | "maintenance" | "other"`
- sentiment: `"bullish" | "bearish" | "neutral"`

## 1. RawItem (what every adapter returns)
```js
{ sourceName: 'bybit', sourceTier: 1, kind: 'exchange', exchange: 'Bybit' /* or null */,
  title: string, url: string /* absolute, unique */, publishedAt: Date,
  hintCategory: 'listing'|'delisting'|'maintenance'|null, hintTickers: string[] /* uppercase, may be [] */ }
```

## 2. `ingest/config.js`
Exports:
- `BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'`
- `SEC_UA = process.env.SEC_USER_AGENT || ''` — the SEC adapter is disabled when this is empty.
- `DISCORD_WEBHOOK = process.env.DISCORD_NEWS_WEBHOOK || ''`
- `PORTFOLIO = (process.env.NEWS_PORTFOLIO || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)`
- `BBW_LIVE_JSON = process.env.BBW_LIVE_JSON || 'D:\\claude projects\\crypto\\screener\\base_break_live.json'`
- `NEWS_LIVE_JSON = process.env.NEWS_LIVE_JSON || 'D:\\claude projects\\crypto\\screener\\news_live.json'`
- `KEEP_DAYS = 7` — items published more than 7 days ago are skipped.
- `RSS_FEEDS`: an array of `{ name, url, domain }` for the 7 feeds below.
  - `rss:cointelegraph` https://cointelegraph.com/rss
  - `rss:theblock` https://www.theblock.co/rss.xml
  - `rss:decrypt` https://decrypt.co/feed
  - `rss:coindesk` https://www.coindesk.com/arc/outboundfeeds/rss/
  - `rss:cryptoslate` https://cryptoslate.com/feed/
  - `rss:beincrypto` https://beincrypto.com/feed/
  - `rss:kraken` https://blog.kraken.com/feed

## 3. `ingest/http.js`
`async function request(url, { method = 'GET', headers = {}, body, ua, timeoutMs = 10000, conditional = false } = {})`
- Uses fetch with an AbortController timeout and `redirect: 'follow'`.
- `User-Agent` = ua || BROWSER_UA.
- If `conditional`, sends `If-None-Match` / `If-Modified-Since` from a module-level Map keyed by url (populated from the response `etag` / `last-modified` headers).
- Returns `{ status, notModified: status === 304, headers, text }`. Add `json()`: a function that parses `text`.
- Throws `HttpError { status, retryAfterMs }` for status >= 400. `retryAfterMs` comes from the `Retry-After` seconds header, else null.
- Network errors are rethrown as `HttpError` with `status: 0`.

Exports `{ request, HttpError }`.

## 4. `ingest/scheduler.js`
`class Scheduler { constructor({ redis, onItems }) ; add(adapter) ; start() ; stop() ; health() }`
Adapter shape: `{ name, tier, intervalMs, run: async () => RawItem[] }`.
- Each adapter has its own loop, chained with `setTimeout`; never runs overlapping.
- Delay = intervalMs × (0.8 + 0.4 × Math.random()) (jitter).
- Per-adapter state: `{ lastOkAt, lastErrAt, lastErr, consecutiveErrors, itemsTotal, warm: false, backoffUntil: 0, lastTickAt }`.
- Sleep-resume guard: before running, if `lastTickAt` exists and `Date.now() - lastTickAt > intervalMs * 1.2 + 60000`:
  - log `[sched] clock jump on <name>, skipping one cycle`;
  - set lastTickAt = now and reschedule without running.
- On success:
  - `lastOkAt = now`, `consecutiveErrors = 0`, `itemsTotal += items.length`.
  - Call `await onItems(items, { warm: state.warm, adapter })`.
  - Then set `state.warm = true`. The first successful run is the warm-up, and the caller must NOT alert on it.
- On error:
  - `consecutiveErrors++`, store `lastErr` (message + status).
  - Backoff: if status is 403 or 418 → wait max(retryAfterMs, 10 min). If 429 → wait max(retryAfterMs, 60 s). Otherwise → min(intervalMs × 2^consecutiveErrors, 10 min).
  - Log one line.
- After each run, `redis.hset('ingest:health', name, JSON.stringify({ ...state, tier, intervalMs }))`, catching errors.
- `health()` returns an array of `{ name, tier, intervalMs, ...state }`.

## 5. `ingest/tickers.js`
`async function loadUniverse(redisOrNull)` then `tagTickers(title, hintTickers)`.
- **Universe**: CoinGecko `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=N` for N=1,2.
  - Cache the combined list to `ingest/cache/coins.json` for 24 h (create the dir); on fetch failure use the cache if it exists.
  - Builds `bySymbol: Map<UPPER symbol, name>` (first wins = highest market cap) and a names list `[{ nameLower, ticker }]`.
  - Also merges Binance futures bases passed via `addBases(bases: string[])`, names defaulting to the ticker.
- **ALIASES** (lowercase phrase → ticker):
  - bitcoin, satoshi→BTC
  - ethereum, ether, vitalik→ETH
  - binance coin→BNB
  - ripple→XRP
  - dogecoin→DOGE
  - cardano→ADA
  - solana→SOL
  - chainlink→LINK
  - polkadot→DOT
  - avalanche→AVAX
  - toncoin→TON
  - tron→TRX
  - litecoin→LTC
  - shiba inu→SHIB
  - uniswap→UNI
  - near protocol→NEAR
  - polygon→POL
  - hyperliquid→HYPE
  - sui network→SUI
  - arbitrum→ARB
  - optimism→OP
  - celestia→TIA
  - injective→INJ
  - aptos→APT
  - pepe→PEPE
- **EXCLUDE** (never tagged): USDT, USDC, FDUSD, USD1, DAI, USDE, TUSD, BUSD, USD, EUR.
- **BARE_BLOCK** (blocked only in rule 5): ONE, OP, IN, A, ON, AI, GAS, OI, US, NOW, IT, BE, GO, UP, ME, MY, SO, OR, AT, NO, ALL, NEW, FOR, THE, TOP, CAT, DOG, ID, IP, OK, HOT, BIG, ACT, KEY, SUN, WIN, JOB, TRUMP, CEO, ETF, SEC, AND, ARE, HAS, WILL, CAN, NOT, BUT, OUT, ANY, ONLY, FREE, LIVE, BACK, NEXT, OPEN, REAL, SAFE.

`tagTickers(title, hint)` returns up to 5 unique uppercase tickers, in this order:
1. hint tickers (not in EXCLUDE);
2. `$TICKER` matches (case-insensitive, 2–15 alphanumerics) if in the universe;
3. parenthetical `\(([A-Z0-9]{2,15})\)` — accepted even if not in the universe;
4. pair patterns `\b(?:1000000|1000)?([A-Z0-9]{2,15}?)(?:USDT|USDC|FDUSD)\b` → the base;
5. coin names and ALIASES: case-insensitive whole-word matches, longest phrase first; only names with length ≥ 4;
6. bare uppercase tokens `\b[A-Z0-9]{2,10}\b` exactly as written, if in the universe AND (length ≥ 4 OR not in BARE_BLOCK).

Strip a leading `1000000` / `1000` from any ticker. Skip EXCLUDE everywhere. Names/ALIASES are matched on the lowercased title.

Export `{ loadUniverse, addBases, tagTickers, nameOf(ticker) }`.

## 6. `ingest/classify.js`
`classify(raw, tickers)` returns `{ category, importance, sentiment }`.
- **Category**: `raw.hintCategory` if set. Otherwise the FIRST regex that matches the title:
  - hack: `/\b(hack(ed|s)?|exploit(ed|s)?|drain(ed|s)?|stolen|breach|attacker|rug ?pull|compromised)\b/i`
  - delisting: `/\b(delist(s|ed|ing)?|removal of .*pairs?|will cease|cease trading|trading termination)\b/i`
  - listing: `/\b(will list|lists|listed|listing|will launch .*perpetual|new listing|adds? .* (spot|futures|margin|perpetual))\b/i`
  - etf: `/\bETFs?\b/`
  - regulatory: `/\b(SEC|CFTC|DOJ|lawsuit|sued|sues|charges?|charged|indict(ed|ment)?|regulat(or|ors|ion|ory)|sanction(s|ed)?|court|settle(s|d|ment)?|fined?)\b/i`
  - maintenance: `/\b(maintenance|suspend(s|ed)?|paus(e|es|ed)|deposits?|withdrawals?|network upgrade|hard fork)\b/i`
  - else `other`.
- **Opinion/recap guard** (only when kind is `news`): if the title matches `/\b(price (analysis|prediction)|prediction|recap|here's why|what to expect|could|might|analyst(s)? (say|says|think)|opinion|explained|guide)\b/i` and the category is not `hack`, then category = `other`.
- **Importance table** by kind:
  - kind `exchange`: listing 95, delisting 90, maintenance 40, other 30. Hack/etf/regulatory use the news values.
  - kind `symbol`: 80.
  - kind `regulator` (SEC): 80, category forced to `regulatory`.
  - kind `news`: listing 60, delisting 60, hack 85, etf 70, regulatory 70, maintenance 30, other 20.
- **Sentiment**:
  - listing → bullish; delisting → bearish; hack → bearish.
  - etf: `/approv|launch|inflow/i` → bullish, `/reject|delay|outflow/i` → bearish.
  - regulatory: `/lawsuit|sued|sues|charge|indict|ban|fine/i` → bearish.
  - Otherwise, a bullish regex `/\b(surge[sd]?|soar(s|ed)?|rall(y|ies|ied)|jump(s|ed)?|record high|breakout|inflows?|approv(ed|al))\b/i` versus a bearish regex `/\b(plunge[sd]?|crash(es|ed)?|slump(s|ed)?|drop(s|ped)?|fall(s)?|fell|outflows?|liquidat(ed|ions?)|sell-?off)\b/i`. Pick whichever matches; if both or neither → neutral.

## 7. `ingest/cluster.js`
- **normalize(title)**: lowercase; replace non-alphanumerics with space; drop stopwords (the, a, an, to, of, in, on, for, and, or, with, at, by, from, as, is, are, will, be, has, have, its, it, this, that, after, amid, over, new, says); collapse spaces.
- **simhash64(title)**: features = normalized words + adjacent word bigrams. Hash each feature with FNV-1a 64-bit using BigInt (offset `0xcbf29ce484222325n`, prime `0x100000001b3n`, mask 64 bits). For each of the 64 bits: +1 if the bit is set, −1 if not. The result bit = sum > 0. Return a 16-char lowercase hex string.
- **hamming(hexA, hexB)**: popcount of the BigInt XOR.
- `class StoryIndex { constructor(windowMs = 6*3600*1000) ; load(rows) ; assign({ id, simhash, normTitle, category, tickers, exchange, firstSeenAt }) → storyId }`
  - `assign` compares against entries younger than the window.
  - It matches an existing entry if:
    - (a) the same normTitle, OR
    - (b) hamming ≤ 3, OR
    - (c) category is listing/delisting AND both have the same category AND share tickers[0] AND share the exchange (the exchange is detected in the title for news via `/binance|bybit|bitget|kucoin|bithumb|upbit|coinbase|okx|kraken|robinhood|hyperliquid/i` if raw.exchange is null).
  - On a match → return that entry's storyId. Otherwise storyId = id.
  - Always push the new entry and prune entries older than the window.
- `load(rows)` accepts DB rows `{ id, storyId, simhash, title, category, exchange, firstSeenAt, instruments: [{ ticker }] }`.

Exports `{ normalize, simhash64, hamming, StoryIndex, detectExchange }`.
