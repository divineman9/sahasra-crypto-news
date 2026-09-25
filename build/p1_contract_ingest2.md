# PHASE 1 — INGEST CONTRACT PART 2: adapters, store, workers (authoritative; follow literally)

Same project and conventions as Part 1 (CommonJS, dotenv, Node 24). Existing modules you MUST use (they already exist — do not re-create them):
- `ingest/config.js` exports `BROWSER_UA, SEC_UA, DISCORD_WEBHOOK, PORTFOLIO, BBW_LIVE_JSON, NEWS_LIVE_JSON, KEEP_DAYS, RSS_FEEDS[{name,url,domain}]`.
- `ingest/http.js` exports `request(url, {method, headers, body, ua, timeoutMs, conditional})` → `{status, notModified, headers, text, json()}`. It throws `HttpError {status, retryAfterMs}`.
- `ingest/scheduler.js` exports `Scheduler`. Adapter shape: `{name, tier, intervalMs, run}`. It calls `onItems(items, {warm, adapter})`.
- `ingest/tickers.js` exports `loadUniverse(), addBases(bases), tagTickers(title, hint), nameOf(ticker)`.
- `ingest/classify.js` exports `classify(raw, tickers)` → `{category, importance, sentiment}`.
- `ingest/cluster.js` exports `normalize, simhash64, hamming, StoryIndex, detectExchange`.
- `lib/serialize.js` exports `serializePost(post)`. The post must be loaded with `include: {instruments: true, votes: true}`. It returns the DTO.

RawItem = `{sourceName, sourceTier, kind, exchange, title, url, publishedAt: Date, hintCategory, hintTickers: []}`.
Every adapter module exports a function `make()` that returns ONE adapter object (or an array of them, for rss/symbols). Every adapter trims titles and skips items with an empty title or url.

## A. Exchange announcement adapters (`ingest/adapters/*.js`, tier 1, kind 'exchange')
Where a table row says "alternates", each `run()` polls the next entry in that row's list, cycling through it.

| File | name | intervalMs | exchange | Endpoint (GET) | Item mapping |
|---|---|---|---|---|---|
| bybit.js | bybit | 5000 | Bybit | alternates type `new_crypto` → hint listing, `delistings` → hint delisting: `https://api.bybit.com/v5/announcements/index?locale=en-US&type=${type}&limit=20` | `result.list[]`: title, url, publishedAt `new Date(publishTime)` |
| bitget.js | bitget | 5000 | Bitget | alternates annType `coin_listings` → listing, `symbol_delisting` → delisting: `https://api.bitget.com/api/v2/public/annoucements?annType=${t}&language=en_US` | `data[]`: title annTitle, url annUrl, publishedAt `new Date(Number(cTime))` |
| kucoin.js | kucoin | 5000 | KuCoin | alternates annType `new-listings` → listing, `delistings` → delisting: `https://api.kucoin.com/api/v3/announcements?annType=${t}&lang=en_US&pageSize=20` | `data.items[]`: title annTitle, url annUrl, publishedAt `new Date(cTime)` |
| bithumb.js | bithumb | 2000 | Bithumb | `https://api.bithumb.com/v1/notices?count=20` (redirects are followed) | see below |
| binanceCms.js | binance-cms | 7000 | Binance | alternates catalogId 48 → listing, 161 → delisting: `https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=20&catalogId=${id}` with `conditional: true` | `data.catalogs[0].articles[]`: title, url `https://www.binance.com/en/support/announcement/detail/${code}`, publishedAt `new Date(releaseDate)` |

**Bithumb mapping.** The response is an array of `{categories[], title, pc_url, published_at "YYYY-MM-DD HH:mm:ss" (KST)}`.
- publishedAt = `new Date(published_at.replace(' ', 'T') + '+09:00')`.
- title = `'[Bithumb] ' + title`. url = pc_url.
- hintCategory:
  - listing if the title matches `/마켓 추가|신규 상장|원화 마켓/`
  - delisting if it matches `/거래지원 종료|상장 폐지|유의 종목/`
  - maintenance if categories include '입출금' or the title matches `/입출금|점검/`
  - else null.
- hintTickers = all `\(([A-Z0-9]{2,15})\)` captures.

On a 304 response (notModified) the adapter returns `[]`. Every adapter sets `hintTickers: []` unless stated otherwise.

## B. Symbol-diff adapters (`ingest/adapters/symbols.js`, tier 1, kind 'symbol')
`make({ prisma })` returns 3 adapters with intervalMs 10000:

| name | venue | Request | Symbol list |
|---|---|---|---|
| sym-binance-spot | binance-spot | GET https://api.binance.com/api/v3/ticker/price | array of `{symbol}` |
| sym-binance-futures | binance-futures | GET https://fapi.binance.com/fapi/v1/ticker/price | array of `{symbol}` — skip symbols containing '_' |
| sym-hyperliquid | hyperliquid | POST https://api.hyperliquid.xyz/info, body `{"type":"meta"}`, header content-type application/json | `universe[]` names where `!isDelisted` |

Logic per venue:
- Keep an in-memory `Set` of known symbols. On the first run, load it from `prisma.knownSymbol.findMany({where:{venue}})`.
- If the DB has zero rows for the venue: insert all current symbols (`createMany`, `skipDuplicates`) and return `[]` (seeding — never emit).
- Otherwise, for each new symbol: `knownSymbol.create`, then emit a RawItem:
  - title `New ${label} market live: ${symbol}` (label = 'Binance spot' / 'Binance futures' / 'Hyperliquid perp');
  - url: spot `https://www.binance.com/en/trade/${symbol}?type=spot`, futures `https://www.binance.com/en/futures/${symbol}`, HL `https://app.hyperliquid.xyz/trade/${symbol}`;
  - exchange: 'Binance' or 'Hyperliquid';
  - hintCategory 'listing';
  - hintTickers [base].
- Base: strip the quote suffix `/(USDT|USDC|FDUSD|TUSD|BUSD|BTC|ETH|BNB|TRY|EUR|BRL|JPY|USD1)$/` (spot/futures), then strip a leading `1000000` / `1000`. HL: base = name.
- Export also `binanceFuturesBases()`: returns the current futures base list (from the in-memory set) — used by the tickers universe and the price worker.

## C. RSS adapters (`ingest/adapters/rss.js`)
`make()` returns one adapter per `RSS_FEEDS` entry:
- name = feed.name, tier 3, kind 'news', intervalMs 90000, exchange null.
- Uses `rss-parser` (`new Parser({ timeout: 15000 })`) on the text from `request(url, {conditional: true})`. A 304 returns `[]`.
- Items: title, url = link, publishedAt = isoDate || pubDate || now.

Plus, only if `SEC_UA` is set, an adapter named `sec`:
- tier 2, kind 'regulator', intervalMs 120000.
- Fetches `https://www.sec.gov/news/pressreleases.rss` with `ua: SEC_UA`.
- title = `'[SEC] ' + title`.

## D. `ingest/store.js`
`class Store { constructor({ prisma, redis, storyIndex }) ; async save(raw) → dto | null ; async setSymbolSeen(base, at) }`

`save(raw)`:
1. Skip (return null) if `raw.publishedAt` is older than KEEP_DAYS, or if the url is already known. Keep an in-memory Set of urls, loaded at start from the last 5000 posts. Also catch a Prisma P2002 → null.
2. `tickers = tagTickers(raw.title, raw.hintTickers)`; `cls = classify(raw, tickers)`; `norm = normalize(raw.title)`; `sh = simhash64(raw.title)`; `now = new Date()`.
3. Create the post with a pre-generated `id = crypto.randomUUID()`:
   - `storyId = storyIndex.assign({ id, simhash: sh, normTitle: norm, category: cls.category, tickers, exchange: raw.exchange || detectExchange(raw.title), firstSeenAt: now })`.
   - `prisma.post.create({ data: { id, title, url, sourceDomain: new URL(url).hostname.replace(/^www\./,''), publishedAt, kind, sentiment, sourceName, sourceTier, category, importance, exchange, storyId, simhash: sh, firstSeenAt: now, announcementSeenAt: (kind === 'exchange' ? now : null), priceTicker: tickers[0] || null, priceStatus: tickers.length ? 'pending' : 'na', instruments: { connectOrCreate: tickers.map(t => ({ where: {ticker: t}, create: {ticker: t, name: nameOf(t)} })) } }, include: { instruments: true, votes: true } })`.
4. Symbol cross-link:
   - If kind 'exchange' and category 'listing': for each ticker, if a `knownSymbol` whose symbol starts with that ticker (or `1000`+ticker) has `firstSeenAt` within 7 days, set `symbolSeenAt` = the earliest such firstSeenAt on the new post.
   - If kind 'symbol': call `setSymbolSeen(tickers[0], now)`. It updates posts from the last 7 days with category 'listing', kind 'exchange', `symbolSeenAt` null and an instrument ticker = base (`updateMany` via the relation filter `instruments: { some: { ticker: base } }`).
5. `dto = serializePost(post)`; `json = JSON.stringify(dto)`. Then `redis.multi()` with:
   - `lpush('news:hot', json)`, `ltrim('news:hot', 0, 999)`, `publish('news:new', json)`;
   - for each ticker: `zadd('news:ticker:'+t, now.getTime(), post.id)` and `zremrangebyscore('news:ticker:'+t, 0, now.getTime() - 7*86400000)`;
   - then `exec()`, and log any per-command errors.
6. Log `[ingest] HH:MM:SS <sourceName> [category imp] <TICKERS> title` (title truncated to 90 chars). Return dto.

## E. `ingest/newsFile.js`
`startNewsFile({ prisma, intervalMs = 5000 })`:
- Every intervalMs, query posts with `firstSeenAt >= now - 48h` and `importance >= 50` (and `userLabel` not 'dismiss'), with instruments.
- Build `flags[ticker] = { count, maxImportance, latestSeenAt, top: [up to 3, highest importance first then newest: {id, title, url, category, importance, sentiment, source: sourceName, firstSeenAt}] }`.
- Write `{ asof: ISO, asof_ms, window_h: 48, min_importance: 50, flags }` to NEWS_LIVE_JSON atomically: write `<file>.tmp`, then `fs.renameSync`, retrying up to 5 times with a 50 ms wait on EPERM/EBUSY.
- Skip silently if the directory doesn't exist. Log write errors at most once per minute.

## F. `ingest/discord.js`
`class Alerts { constructor({ redis }) ; async maybeNewsAlert(dto, { warm }) ; async healthAlert(name, text) }`
- Disabled (no-op) if `DISCORD_WEBHOOK` is empty.
- Portfolio = PORTFOLIO ∪ bases from `BBW_LIVE_JSON` (`setups[].symbol` with USDT stripped and 1000/1000000 stripped). Re-read the file every 5 min; ignore read errors.
- `maybeNewsAlert` alerts only if ALL of these hold:
  - warm is true;
  - `dto.importance >= 70`;
  - publishedAt is within 48 h;
  - dto.instruments tickers ∩ portfolio is non-empty;
  - `redis.set('alert:story:'+dto.storyId, '1', 'EX', 1800, 'NX')` returns 'OK'.
- POST JSON `{ content }` to the webhook, where content = `**[${category.toUpperCase()} ${importance}] ${tickers.join(' ')}** ${title}\n${sourceName} · ${exchange||''} · <${url}>`, truncated to 1900 chars.
- `healthAlert`: at most one per name per 30 min (`redis.set('alert:health:'+name, …, 'EX', 1800, 'NX')`); content `⚠️ news source silent: ${name} — ${text}`.
- Catch all errors.

## G. `ingest/health.js`
`startHealth({ scheduler, alerts, intervalMs = 60000 })`:
- For each adapter in `scheduler.health()`: limit = tier 1 → 15 min, otherwise 30 min.
- If `(lastOkAt || startedAt)` is older than the limit, call `alerts.healthAlert(name, 'no successful poll for N min, last error: ' + (lastErr || 'none'))` and log it.

## H. `ingest/price.js`
`startPriceWorker({ prisma, redis, futuresBases: () => string[], intervalMs = 30000 })`. Every intervalMs:
1. Find up to 20 posts with `priceStatus: 'pending'` and `firstSeenAt <= now - 16 min`.
2. For each post: T = priceTicker. The symbol is the first of `[T+'USDT', '1000'+T+'USDT', '1000000'+T+'USDT']` whose base is in `futuresBases()`. If none → update `priceStatus 'na'`.
3. Otherwise:
   - m0 = floor(firstSeenAt / 60000) × 60000.
   - GET `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1m&startTime=${m0 - 60000}&limit=20`. Each row is `[openTime, open, high, low, close, ...]`.
   - p0 = close of the row with openTime m0 − 60000. pN = close of the row with openTime m0 + (N−1)×60000, for N in 1, 5, 15.
   - If any is missing → `priceStatus 'na'`.
   - Else ret = round((pN/p0 − 1) × 100, 3 decimals). Update `p0, ret1m, ret5m, ret15m, moved5m: Math.abs(ret5m) >= 1, priceStatus 'done'`.
   - Publish the updated serialized DTO on `news:update`.
4. Posts older than 24 h that are still pending → 'na'.
5. Space the kline calls at least 250 ms apart. Catch errors per post.

## I. `ingest/report.js` (also runnable: `node ingest/report.js [--days 7] [--discord]`)
`async function hitRate(prisma, days)`:
- Over posts with `priceStatus 'done'` and `firstSeenAt >= now - days`, group by sourceName and by category.
- Per group: `n`, `moved5mPct`, `avgAbsRet5m`, `avgSignedRet5m` (ret5m × (+1 bullish, −1 bearish, 0 neutral)).
- Return rows sorted by n desc. Print them as a text table.
- `--discord` posts the table to the webhook in a code block (≤1900 chars).
- Export `{ hitRate, formatTable, startWeeklyReport({ prisma, redis, alerts }) }`. startWeeklyReport runs hourly; on Monday UTC, if `redis.set('report:week:'+isoWeek, '1', 'EX', 8*86400, 'NX')` is 'OK', it posts the 7-day table.

## J. `ingest.js` (project root — full rewrite; replaces the mock generator)
1. dotenv. Create prisma and redis (as in Part 1).
2. `await loadUniverse()`.
3. `storyIndex = new StoryIndex()`, loaded from posts of the last 6 h (select id, storyId, simhash, title, category, exchange, firstSeenAt, instruments).
4. `store = new Store(...)`; `await store.init()` (loads the url Set). `alerts = new Alerts({redis})`.
5. Scheduler with `onItems = async (items, {warm}) => { for (const raw of items) { const dto = await store.save(raw); if (dto) await alerts.maybeNewsAlert(dto, {warm}); } }`.
6. Add the adapters: bybit, bitget, kucoin, bithumb, binanceCms, `...symbols.make({prisma})`, `...rss.make()`.
7. After the first futures run, and then every 10 min: `addBases(binanceFuturesBases())`.
8. Start: the scheduler, `startNewsFile({prisma})`, `startHealth({scheduler, alerts})`, `startPriceWorker({prisma, redis, futuresBases: binanceFuturesBases})`, `startWeeklyReport(...)`.
9. Log `[ingest] started N adapters`.
10. SIGINT/SIGTERM: stop the scheduler, clear timers, `prisma.$disconnect()`, `redis.quit()`, exit 0.
11. Unhandled rejections are logged, not fatal.
