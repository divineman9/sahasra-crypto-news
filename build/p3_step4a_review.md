# STEP 4A SPEC REVIEW (Fable, 2026-09-25) — against real code

Reviewed: build/p3_step4a_spec.md vs app/ingest/{store,scheduler,http,discord,tickers,classify,health,config}.js, app/ingest.js, app/ingest/adapters/rss.js, prisma schema, live Google News RSS (15 requests, all 200, see build/p3_coinSources_draft.json `_meta.live_probe`).

## VERDICT: CHANGES REQUIRED

The architecture is right (one 20 s adapter, per-coin nextDueAt, alertable:false, titleKey dedupe). Six things must change before GLM builds it; the rest are exact-name corrections.

Blocking:
1. **matchCoin as specified drops most TRUE positives for ambiguous coins** (live: LIT 12/13 real items dropped, XPL 7/8, SUI ~20/44). Use the v2 gate in section C (adds `(SYM)` parenthetical, `weak` words + context, junk filters). Verified 41/42 on live titles.
2. **429 handling: rethrow the HttpError unchanged** (it already carries `status` and `retryAfterMs`; a `new Error` with only `status` loses Retry-After) and **commit per-coin state only at the end of a successful tick** (section D3), otherwise coins fetched before the 429 advance nextDueAt while their items are thrown away.
3. **Budget arithmetic**: 49 coins × 96 runs/day (15 min) = 4,704 ≈ the 5,000 cap; any portfolio growth silently starves coins until UTC midnight. Default tier-A interval 20 min (`GNEWS_TIER_A_MIN=20`) with the adaptive guard in D4.
4. **Default record rule references `BARE_BLOCK`/`NAME_BLOCK`, which tickers.js does NOT export.** Default for an unlisted base = `{ name: nameOf(base), aliases: [nameOf(base)], ambiguous: true, query: '"<name>" crypto' }` (always ambiguous; no export needed).
5. **Queries must never contain a bare unquoted common word**: Google pads no-hit queries with unrelated crypto news (live: `"Harmony Protocol" crypto` → 4 generic Bitget-hack items; fully quoted `"Harmony ONE" OR "Harmony blockchain"` → 0 items, correct). Use the draft JSON queries verbatim.
6. **Junk sources seen live must be dropped in the adapter** (D6): hosts binance.com / kucoin.com / bybit.com / bitget.com / t.co (Square user posts, "Convert 1 X to Y" pages, SEO pages) and JUNK_TITLE_RE.

## A. Exact name/shape corrections to the spec

| Spec says | Reality | Fix |
|---|---|---|
| "see discord.js refreshPortfolio — export a shared helper" | `refreshPortfolio()` is a METHOD on class `Alerts` (discord.js:16), throttled 5 min, reads `BBW_LIVE_JSON` `data.setups[].symbol`, strips `/USDT$/`, `/^1000000/`, `/^1000/`, unions `PORTFOLIO` (config.js). On read error it KEEPS the previous set. | New `app/ingest/watchlist.js`: `loadWatchBases({ bbwFile = BBW_LIVE_JSON, portfolio = PORTFOLIO } = {}) → string[]` (sorted, unique, uppercase, same strip rules, filtered by `/^[A-Z0-9]+$/` and `!isNonCoin(base)`); THROWS on read/parse error. `Alerts.refreshPortfolio()` becomes: keep the 5-min throttle, `try { this.portfolio = new Set(loadWatchBases()); } catch (_) {}`. Both callers keep previous list on throw. |
| `http.request(url, { ua: BROWSER_UA, timeoutMs: 15000 })` | Signature is `request(url, { method, headers, body, ua, timeoutMs = 10000, conditional = false })`; `ua` defaults to `BROWSER_UA` already; throws `HttpError(message, status, retryAfterMs)` for status ≥ 400 (`name:'HttpError'`, `.status`, `.retryAfterMs`), `status 0` on network error; returns `{ status, notModified, headers, text, json() }`. | Call `request(url, { timeoutMs: 15000 })`. Do not pass `conditional` (Google sends no ETag). |
| "throw an Error with `status` so the scheduler backs off" | scheduler `_run` catches anything thrown by `adapter.run()`; `_backoffUntil`: status 403/418 → `max(retryAfterMs, 10 min)`; 429 → `max(retryAfterMs, 60 s)`; anything else → `min(intervalMs·2^consecutiveErrors, 10 min)`. Backoff is FLAT for 429 (no escalation). | Rethrow the `HttpError` as-is. For a 200 with a non-RSS body (consent/captcha HTML) throw `Object.assign(new Error('gnews: non-RSS body'), { status: 429, retryAfterMs })`. Escalate yourself: keep `consecutive429` in the adapter, set `retryAfterMs = Math.max(err.retryAfterMs || 0, 60000 * 2 ** Math.min(consecutive429, 5))` (60 s → 32 min) before rethrowing; reset on the next successful request. |
| `warmRuns: 1` "backfill non-warm" | `state.warm` flips true once `okRuns >= warmRuns` AND onItems succeeded — i.e. after the FIRST tick, which only covers 3 of ~49 coins. warmRuns does not make the 7-day backfill non-warm; `raw.alertable === false` does. | Keep `warmRuns: 1` (harmless); the no-alert guarantee comes from `alertable:false` in store.js (section E). State the spec this way. |
| Watchdog | `wd = max(45 s, intervalMs + 30 s) = 50 s` for intervalMs 20 s; 3 requests × 15 s timeout = 45 s worst case. | OK but tight: use `timeoutMs: 12000` (3 × 12 = 36 s). |
| "Every 10 min log one stats line" | No timer infrastructure in adapters; scheduler calls `run()` every 16–24 s (jitter 0.8–1.2). | Implement inside `run()`: `if (Date.now() - lastStatsAt >= 600000) { console.log(...); reset counters }`. No setInterval. |
| `sourceDomain` | store.js:167 `sourceDomain: new URL(raw.url).hostname.replace(/^www\./, '')` — with Google redirect URLs every gnews post would be `news.google.com`. | `sourceDomain: raw.sourceDomain || new URL(raw.url).hostname.replace(/^www\./, '')` (spec correct). |
| titleKey "loaded in init() from the same 5000 rows" | `init()` = `findMany({ take: 5000, orderBy: firstSeenAt desc, select: { id, url, title } })`. DB today: 265 posts. Once +40 feeds and gnews are live, 7 days can exceed 5000 rows, and there is NO DB backstop for titleKey (url has `@unique`, title does not). | Memory only, no DB index. In `init()` run a SECOND query: `findMany({ where: { firstSeenAt: { gte: new Date(Date.now() - KEEP_DAYS*86400000) } }, select: { title: true, sourceDomain: true } })` → `this.titleKeys = new Set(normalize(title) + '|' + sourceDomain)`. Uses the existing `firstSeenAt` index. Add to the Set on every successful create (after line 227). |
| `matchCoin(title, rec)` (plan) vs `matchCoin(title, base, rec)` (spec) | — | `matchCoin(title, base, rec) → boolean`; `stripSourceSuffix(title, publisherName)`. |
| `classify`: "tier-4 OPINION → 10" | `classify(raw, tickers)` receives the whole raw (has `sourceTier`); line 143 already forces `category='other'` for news OPINION titles unless hack. | Add after `if (importanceOverride !== null) …` (line 190): `if (kind === 'news' && Number(raw.sourceTier) === 4 && category === 'other' && (OPINION_RE.test(title) || LOWVALUE_RE.test(title))) importance = 10;` with `LOWVALUE_RE` from section F. |
| ingest.js adapter list | `adapters = [bybit.make(), …, ...rss.make()]`; `scheduler.add(a)` per adapter; `health.js` alarms a tier-4 adapter after 30 min without `lastOkAt`. | Append `gnews.make({ getTierA: () => loadWatchBases() })`. A run that returns `[]` (disabled / nothing due / budget spent) still counts as OK → no false health alarms. |
| Skip non-ASCII bases | `loadWatchBases` already filters `/^[A-Z0-9]+$/` (BROCCOLI714 passes). | Keep the filter in ONE place (watchlist.js). |

Confirmed OK as written: state-file shape; `hintTickers: [base]` (tagTickers pushes hints first, `ok()` strips 1000-prefix/EXCLUDE/nonCoin; a stock-perp title drops hints not in `bySymbol`); `publishedAt = new Date(pubDate)` (RFC-2822 parses); store already rejects future > 10 min and older than KEEP_DAYS (7 d); Google item links are stable per article so the existing URL dedupe (`this.urls` + DB unique) handles re-seen items across ticks; `encodeURIComponent(query + ' when:2d')` form verified live (`when%3A2d` accepted).

## B. coinSources.json — use build/p3_coinSources_draft.json

49 records (the caller's 48 + MUBARAK, which is in today's `base_break_live.json`). Loader: `require('./coinSources.json')`, ignore keys starting with `_`, `getRec(base) = json[base] || DEFAULT(base)`. Record fields: `name, aliases[], weak[] (optional), ambiguous, query`. `weak` absent ⇒ `ambiguous ? [] : [base, name]`.

## C. coinMatch.js — v2 gate (exact)

```
CONTEXT_RE  = /\b(crypto|cryptocurrenc(y|ies)|tokens?|coins?|altcoins?|memecoin|meme coin|blockchain|on-?chain|DeFi|DEX|perps?|perpetual|futures|staking|stake|unlock|airdrop|mainnet|testnet|launch(es|ed)?|upgrade|partnership|integration|listing|TVL|whales?|liquidations?|market cap|price|rall(y|ies)|surges?|jumps?|drops?|falls?|rebounds?|breakout|bullish|bearish|bull|bear|ETPs?|ETFs?|wallet|validators?|protocol|network|USDT|Binance|Coinbase|Bybit|Bitget|Kraken|OKX)\b/i
STOCK_WORDS_RE = /\b(shares|stock price|\(NYSE:|\(NASDAQ:|earnings|EPS)\b/i
JUNK_TITLE_RE  = /^Convert \d|\(@[A-Za-z0-9_.-]+\)'s insights|Price Today, Live Chart|Related Funding Rounds|Price, Market Cap, Volume and Chart|^\$?[A-Za-z]+ Entry: \d/i
```
`stripSourceSuffix(title, publisher)`: if `publisher` given and title ends with `' - ' + publisher` → remove exactly that; else remove `/\s+-\s+[^-]{1,60}$/`. (Verified: "NEAR Protocol: Venice launches AI - 24 Sep 2026 - TradingView" → "…- 24 Sep 2026".)

`matchCoin(title, base, rec)` on `t = stripSourceSuffix(title, publisher)` (adapter strips first; matchCoin must be idempotent):
1. `if (isNonCoin(base) || STOCK_PERP_TITLE_RE.test(t) || JUNK_TITLE_RE.test(t)) return false;`
2. any alias: `new RegExp('(^|[^a-z0-9])' + esc(alias.toLowerCase()) + '([^a-z0-9]|$)').test(t.toLowerCase())` → true
3. `new RegExp('\\$' + base + '\\b', 'i').test(t)` → true
4. `new RegExp('\\b' + base + 'USDT\\b').test(t)` → true
5. `stock = STOCK_WORDS_RE.test(t)`; `if (!stock && t.includes('(' + base + ')')) return true;` (exact uppercase)
6. `weak = rec.weak ?? (rec.ambiguous ? [] : [base, rec.name])`; `if (!stock && CONTEXT_RE.test(t))` for each w: `new RegExp('(^|[^A-Za-z0-9])' + esc(w) + '([^A-Za-z0-9]|$)').test(t)` (CASE-SENSITIVE) → true
7. return false

Live-verified outcomes (41/42): keeps "SUI Flashes a Key Macro Signal: Has the Bull Market Begun?", "Sui leads way as most big cryptocurrencies post gains", "Lighter (LIT) token drops 11.2%", "Bitwise launches first Lighter ETP on Xetra", "XPL Surges 30% Despites 6% Plasma Unlock Scares", "Quant (QNT) token jumps", "OFFICIAL TRUMP (TRUMP) Drops 3.15%", "Pump(dot)fun Caps Creator Fee"; drops "Hurricane near Florida", "Sun Communities (SUI) shares rise on earnings", "Pepe the Frog meme", "Trump's 2025 income wasn't all from cryptocurrency", "Hunter Biden's LAPTOP Memecoin…", "Vacheron … Perpetual Calendar", "DOGE cuts federal crypto oversight budget", "DoorDash (DASH) stock price jumps on earnings", "xAI raises $10B for Grok crypto payments", "Cathie Wood ARK Invest buys more Coinbase stock", all Convert/Square/CryptoRank-price pages. Accepted miss: "Venice AI Chooses NEAR for Encrypted AI Inference" (no context word). Accepted risk: bare alias "Avalanche" (snow news only reaches us if Google returns it for `Avalanche crypto`).

## D. adapters/gnews.js — exact behaviour

D1. `make({ getTierA })` → `{ name: 'gnews', tier: 4, intervalMs: 20000, warmRuns: 1, run }`. Env: `GNEWS_ENABLED` ('0' → run returns [] and does nothing), `GNEWS_DAILY_BUDGET` (default 5000), `GNEWS_TIER_A_MIN` (default 20), `GNEWS_STATE_FILE` (default `app/ingest/cache/gnews_state.json`).
D2. Tier A list: call `getTierA()` at most once per 60 s (cache); on throw keep the previous list; filter `/^[A-Z0-9]+$/` and `!isNonCoin`. Ensure every base has a `coins[base]` state entry (`{ nextDueAt: 0, lastOkAt: 0, firstDone: false }`). If a coin's `lastOkAt` is older than 7 d treat `firstDone` as false (re-backfill).
D3. Per tick: `day = new Date().toISOString().slice(0,10)`; if `state.day !== day` → `{ day, used: 0 }`. If `used >= budget` → return []. Pick ≤ 3 bases with `nextDueAt <= now`, smallest nextDueAt first. Fetch SEQUENTIALLY; keep results in a local `pending = []`. For each: `used += 1` (count before the request, failures included); `res = await request(url, { timeoutMs: 12000 })`; if `!/<rss|<item>/i.test(res.text)` → throw the non-RSS error from section A; parse; `pending.push({ base, items })`. Only after ALL selected coins succeeded: for each pending set `nextDueAt = now + intervalMs_A`, `firstDone = true`, `lastOkAt = now`; write the state file ONCE (write `.tmp` then `fs.renameSync`); return the flattened items. On any thrown error: write the state file (so `used` is persisted), then rethrow — no `nextDueAt` advances, so those coins are re-fetched after the scheduler backoff (cost: ≤ 2 duplicate requests per 429).
D4. `intervalMs_A = max(GNEWS_TIER_A_MIN, ceil(1440 * N / (0.9 * budget))) minutes` where N = tier-A size; log once when the adaptive branch changes the value.
D5. URL: `` `https://news.google.com/rss/search?q=${encodeURIComponent(rec.query + ' when:' + (firstDone ? '2d' : '7d'))}&hl=en-US&gl=US&ceid=US:en` ``.
D6. Parse each `<item>`: `<title>`, `<link>`, `<pubDate>`, `<source url="…">Publisher</source>`; decode `&amp; &lt; &gt; &quot; &#39; &#x..; &#..;`. `publisherHost = new URL(sourceUrl).hostname.replace(/^www\./, '')` (fallback `'news.google.com'`). DROP the item if `publisherHost` ∈ `JUNK_HOSTS = ['binance.com','kucoin.com','bybit.com','bitget.com','t.co']` (their real announcements arrive through the exchange adapters; what Google returns from them is user posts and SEO pages). Then `title = stripSourceSuffix(title, publisherName)`; drop if `!matchCoin(title, base, rec)`; drop if pubDate invalid or older than 7 d or > 10 min in the future. Keep ≤ 30 per coin per run, newest first.
D7. RawItem exactly as the spec (`sourceName: 'gnews:' + publisherHost`, `sourceTier: 4`, `kind: 'news'`, `exchange: null`, `url: link` as-is, `hintCategory: null`, `hintTickers: [base]`, `sourceDomain: publisherHost`, `alertable: false`).
D8. Stats (inside run, every ≥ 10 min): `[gnews] used=<used>/<budget> today, coins=<N>, interval=<min>m, due=<dueCount>, kept=<k> dropped=<d> junk=<j> (last 10 min), errors=<e>`; reset k/d/j/e after logging.

## E. store.js — exact edits

E1. Line 31 select → `{ id: true, url: true, title: true }` unchanged; ADD the 7-day titleKey query from section A into `init()`; `this.titleKeys = new Set()` in the constructor.
E2. After the `known` block (i.e. just before line 129 `let tickers = tagTickers(...)`): `if (String(raw.sourceName || '').startsWith('gnews:')) { const k = normalize(raw.title) + '|' + (raw.sourceDomain || new URL(raw.url).hostname.replace(/^www\./, '')); if (k && this.titleKeys.has(k)) return null; }`.
E3. Line 161: `const eligible = raw.alertable === false ? false : (this.alerts ? this.alerts.isEligible(...) : false);`
E4. Lines 74 and 107 (detail-retry and revision paths): prefix the spread condition with `raw.alertable !== false && `.
E5. Line 167: `sourceDomain: raw.sourceDomain || new URL(raw.url).hostname.replace(/^www\./, '')`.
E6. After line 227 (`this.urls.set(...)`): `this.titleKeys.add(normalize(post.title) + '|' + post.sourceDomain);`
`Alerts.enqueue()` has no callers (grep), so E3/E4 are the only eligibility sites. Direct-copy-after-gnews-copy is NOT deduped (accepted: storyIndex simhash clusters them into one story).

## F. classify.js

`LOWVALUE_RE = /\b(best crypto to (buy|invest)|next crypto to explode|top \d+ (alt)?coins|presale|(jumps?|rises?|drops?|falls?|surges?|gains?|declines?|rebounds?|slips?|climbs?) (nearly |over |about )?\d+(\.\d+)?%|in (one|four|24) hours?|price (analysis|outlook|prediction|news|eyes|targets|builds|sets up))\b/i` plus the one-line rule in section A. Live: tokenpost/pluang/tradersunion emit 5–15 "X jumps 3.2% in one hour" items per coin per day — they stay stored (counted by `newsCount48h`, see J) but at importance 10.

## G. watchlist.js / discord.js — see table row 1. Also export `loadWatchBases` for tests with an explicit `bbwFile` path (no env needed).

## H. ingest.js — `const gnews = require('./ingest/adapters/gnews'); const { loadWatchBases } = require('./ingest/watchlist');` and push `gnews.make({ getTierA: () => loadWatchBases() })` into `adapters`. No other change (no timers; scheduler owns cadence).

## I. Required tests — build/tests/p3_step4a.test.js (assert_lib harness, isolated test DB, add to run_all_tests.sh)

coinMatch (no DB):
- the 8 spec fixtures (Ethena/NEAR/Hurricane near Florida/Sui Network/Sun Communities (SUI) shares rise on earnings/$PEPE/Pepe the Frog/stripSourceSuffix "X rallies - CoinDesk") 
- live positives: "SUI Flashes a Key Macro Signal: Has the Bull Market Begun?" SUI true; "Sui leads way as most big cryptocurrencies post gains" SUI true; "Lighter (LIT) token drops 11.2% after Bitwise launches staking ETP" LIT true; "Bitwise launches first Lighter ETP on Xetra" LIT true; "XPL Surges 30% Despites 6% Plasma Unlock Scares" XPL true; "Quant (QNT) token jumps nearly 14%" QNT true; "OFFICIAL TRUMP (TRUMP) Drops 3.15% Amid Token Unlock" TRUMP true; "Pump(dot)fun Caps Creator Fee Changes" PUMP true; "DeepBook Launches on Sui" SUI true.
- live negatives: "Real estate, watches and guitars: Trump's 2025 $2.2B income wasn't all from cryptocurrency" TRUMP false; "Hunter Biden's LAPTOP Memecoin Pops 13%, While Bitcoin and Dogecoin Trail" TRUMP false; "Vacheron Constantin's $219K Overseas Perpetual Calendar" LIT false; "DOGE cuts federal crypto oversight budget" DOGE false; "DoorDash (DASH) stock price jumps on earnings" DASH false; "xAI raises $10B for Grok crypto payments" XAI false; "Cathie Wood ARK Invest buys more Coinbase stock" ARK false; "Convert 1 CZK (Czech Koruna) to NEAR (NEAR Protocol)" NEAR false; "ALIEN CRYPTO(@Amirsangi)'s insights" SUI false; "Karate Cat Price | KCAT Price Today, Live Chart" PUMP false; "Bitget lists NEARUSDT and TSLAUSDT stock perpetual" NEAR false (STOCK_PERP_TITLE_RE); isNonCoin base → false.
- stripSourceSuffix("NEAR Protocol: Venice launches AI - 24 Sep 2026 - TradingView", "TradingView") → "NEAR Protocol: Venice launches AI - 24 Sep 2026".
- default record for an unlisted base is `ambiguous: true`; `_meta` key ignored.

gnews adapter (fake `request` injected via `make({ getTierA, request })`, tmp state file, fixed `now`):
- fixture RSS 6 items: 3 matching, 1 non-matching, 1 older than 7 d, 1 from binance.com → returns 3 RawItems with every field of D7 (sourceName `gnews:<host>`, sourceDomain host, alertable false, hintTickers [base]); state shows `used=1`, `nextDueAt = now + interval`, `firstDone true`; first URL contains `when%3A7d`, second run URL contains `when%3A2d`.
- second run before due → no request; ≤ 3 coins per tick with 10 due; budget exhausted (`used >= budget`) → no request, returns [].
- 429 on coin 2 of 3: throws the SAME HttpError instance (status 429), coin 1's nextDueAt NOT advanced, `used` incremented by 2 and persisted; consecutive429 escalates retryAfterMs (2nd time ≥ 120000).
- 200 with HTML body → throws with status 429.
- UTC day change resets `used` to 0. `GNEWS_ENABLED=0` → [] and no request. Adaptive interval: N=49, budget=5000 → 20 min; N=200 → ≥ 64 min.
- stats line printed once after ≥ 10 min of fake time, not before.

store (test DB):
- gnews item on a portfolio coin, `alertable:false`, classify importance forced ≥ 70 (hack title) → `alertState null`, `sourceDomain` = raw.sourceDomain (not news.google.com).
- same normalized title + same sourceDomain already stored (direct RSS) → gnews save returns null and no row; different sourceDomain → stored.
- after `init()` on a DB with a 6-day-old post, its titleKey is loaded (query is by firstSeenAt, not take:5000).
- revision path with `alertable:false` → alertState stays null.

classify: tier 4 "NEAR price prediction 2026" → 10; tier 4 "SUI token jumps 7.24% in one hour" → 10; tier 3 same title → 20 (unchanged); tier 4 hack title → 85.

watchlist: fixture BBW file with `1000PEPEUSDT`, `ONEUSDT`, `币安人生USDT`, `HUTUSDT` (nonCoin) + `NEWS_PORTFOLIO=BTC,ETH` → `['BTC','ETH','ONE','PEPE']`; missing file → throws; `Alerts.refreshPortfolio()` keeps the previous set when the file is missing.

## J. Accepted risks / follow-ups (not in 4A)
- Bare "Avalanche"/"Ripple"/"Ether" aliases can match non-crypto uses; only reachable through crypto-scoped queries — monitor with the 50-item tag audit.
- Price-move flood (importance 10) inflates `newsCount48h` on the BBW chip; decide at Step 5 whether `newsCount48h` counts importance ≥ 20 only.
- ONE, XAI, BR, DASH, ARK, SAGA returned 0 items in 2 days: expected for dead coins; an empty feed is not an error and must not count as a failure.
- Google 100-item feed cap: for BTC/ETH `when:7d` on the first run only returns the newest ~100 — fine.
