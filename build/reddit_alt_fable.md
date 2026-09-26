# Reddit without API keys — options for the Social tab (Fable, 2026-09-26)

Answer to `build/reddit_alt_prompt.md`. Read-only review of `app/ingest/adapters/reddit.js`,
`app/ingest/config.js` (REDDIT_SUBS), `http.js`, `scheduler.js`, `rss.js`/`youtube.js`, and the
step-7 test suite. Every endpoint below was hit live from this PC on 2026-09-26 ~04:07–04:12 UTC
unless marked "not tested". Exactly two requests were made to reddit.com, 3 min apart.

## TL;DR

Use Reddit's own public Atom feed, but as **one multireddit request** instead of six per-sub
requests: `https://www.reddit.com/r/CryptoCurrency+CryptoMarkets+Bitcoin+ethereum+solana+defi/hot/.rss?limit=100`.
Verified live: HTTP 200, 100 entries, all six subs present (Bitcoin 39, CryptoCurrency 14,
CryptoMarkets 17, solana 17, defi 9, ethereum 4), 93/100 posted within 48 h. Poll it every
10 min with a hard ≥60 s module-level gap. That is 6 req/h against a limiter Reddit itself
advertises as 1 request per ~25–60 s window, so we never touch the ceiling. Everything else
(Redlib, PullPush, Lemmy, Mastodon, Bluesky) was either broken, paywalled, dead, or not Reddit.
Arctic Shift works keyless and is the only credible *fallback*, but it is a scraped archive
Reddit's policy explicitly targets, so it should be an opt-in flag, not the default.

## Live measurements

| Endpoint | Result |
|---|---|
| `www.reddit.com/r/CryptoCurrency/new/.rss` (UA `SahasraNews/1.0 (...)`) | 200, Atom, 25 entries, 70 KB. Headers: `x-ratelimit-used: 1`, `x-ratelimit-remaining: 0.0`, `x-ratelimit-reset: 25`, `Cache-Control: private, max-age=3600`, no ETag/Last-Modified. Entries carry `<author><name>/u/…`, `<category term="CryptoCurrency">`, `<id>t3_…`, `<link>`, `<published>`, `<updated>`, `<content>`, `<media:thumbnail>`. **No score, no flair, no stickied flag.** The 25 "new" posts span 2.5 days (~10 surviving posts/day in r/CryptoCurrency — moderated-out posts never appear). |
| `www.reddit.com/r/CryptoCurrency+CryptoMarkets+Bitcoin+ethereum+solana+defi/hot/.rss?limit=100` | 200, 100 entries, 245 KB, same rate-limit headers (`remaining 0.0`, `reset 7`). Per-sub counts above. 4 AutoModerator/EthereumDaily entries + 7 "Daily … Discussion" threads present (must be filtered by author/title). |
| `www.reddit.com/r/<sub>.json` unauthenticated | 403 (measured earlier by user; consistent with Data API Wiki: "Traffic not using OAuth or login credentials will be blocked"). |
| `old.reddit.com/...rss`, `i.reddit.com` | Not tested (request budget). Same backend and, to my knowledge, same limiter; i.reddit.com was retired in 2023. No advantage over www. |
| Redlib `safereddit.com/r/CryptoCurrency/new.rss` | 404 — page body: "Reddit error 400 Bad Request" (instance's own upstream scraping is being blocked). |
| Redlib `redlib.catsarch.com/r/CryptoCurrency/new.rss` | 429 — Anubis anti-bot wall. |
| PullPush `api.pullpush.io/reddit/search/submission/?subreddit=CryptoCurrency&size=5` | 429: "This website does not provide free scraping resources for agents… paid scraping service." Dead for us. |
| Arctic Shift `arctic-shift.photon-reddit.com/api/posts/search?subreddit=CryptoCurrency&limit=5&sort=desc` | 200 JSON, keyless. Post created 04:02 UTC was already returned at 04:07 (~5 min lag). Has `link_flair_text`, `over_18`, `author`, `removed_by_category`; **`score` is the ingest-time snapshot (=1)**, so no score gate. `&format=rss` also works (200, RSS 2.0). Headers `X-RateLimit-Reset`. README: "No uptime or performance guarantees :)", limits "calculated dynamically", "a couple requests per second… nothing to worry about". |
| Lemmy `lemmy.world/feeds/c/cryptocurrency.xml?sort=New` and API | 200, but the 20 newest posts span 2026-01-10 → 2026-09-09 (~2 posts/month). `lemmy.ml/c/crypto` = 362 posts *ever*. Dead. |
| Mastodon `mastodon.social/tags/bitcoin.rss` | 200, 20 items in ~7 h (~60–70/day). Sample: JP price-ticker bot, BCH price bot, Spanish macro bot, one news-repost bot (@newisty), pizza spam, a podcast stream. No engagement data in RSS → cannot separate signal from bots. |
| Bluesky `public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=bitcoin` | 403 without auth (search needs a session). `getAuthorFeed?actor=coindesk.com` → 200 keyless. `bsky.app/profile/coindesk.com/rss` → 302 → 200, 18 items, newest Feb 2025 (stale). Account-based only. |

## Options, one by one

### 1. Unauthenticated Reddit `.rss`, ≤1 req/min — RECOMMENDED (in multireddit form)
- **Keys:** none.
- **Limits:** Reddit's limiter budgets exactly 1 request per window (`remaining 0.0` after 1, reset 7–50 s observed). Multireddit + `limit=100` means one request covers all six subs, so 1 request / 10 min uses ~10 % of the allowance. Per-sub rotation (6 requests/6 min) is unnecessary and 10x more exposure for no gain.
- **Items/day:** the 100-entry hot window held 93 posts ≤48 h old; after dropping daily threads and capping per sub (see below) expect ~40–60 distinct items in the window and ~30–50 new items/day. r/ethereum contributes only ~4 because it is quiet, not because of the cap.
- **Noise:** hot ranking is Reddit's own score+recency sort, so "position in hot" replaces the `minScore` gate reasonably well. Losses vs OAuth mode: no flair (the news/breaking bypass goes away), no `stickied`/`removed_by_category` flags (daily threads must be filtered by author `/u/AutoModerator` + title regex; removed posts do not appear in hot listings anyway).
- **Maintenance risk:** low-medium. `.rss` has existed for 15+ years and still gets its own rate-limit budget from Reddit today, but Reddit can throttle, geo-gate, or put it behind login any day. Adapter must degrade silently (429 → scheduler backoff already handles; mark `quietHealth: true`).
- **ToS/legal:** best of all options. RSS is a Reddit-served syndication surface, not the Data API (the Wiki's "blocked without OAuth" line matches the `.json` 403 while `.rss` is deliberately still served with a published limiter). Public Content Policy (updated 2026-09-24): "you can use Reddit content for non-commercial uses, such as learning and community" — a self-hosted personal reader is squarely that. Data API Wiki: "Our robots.txt is for search engines, not Data API users" (robots.txt itself is a blanket `Disallow: /`, aimed at crawlers/AI training). Stay honest: descriptive User-Agent, respect `Retry-After`, never spoof a browser. Not legal advice; residual risk is Reddit changing its mind, not liability.

### 2. old.reddit.com / i.reddit / other official public endpoints
- Not tested (budget). old.reddit `.rss` is the same limiter and same Atom; `.json` there is also 403 unauthenticated; i.reddit.com is gone. Nothing here beats option 1. Skip.

### 3. Third-party mirrors / archives
- **Redlib/Libreddit instances:** both probed instances failed (404-from-upstream-400, 429 Anubis). They work by spoofing Reddit's Android app OAuth token — a ToS violation on the instance's side and a whack-a-mole uptime story on ours. No.
- **PullPush (Pushshift successor):** now explicitly paywalled for bots (429 message). Pushshift proper is mod-only since 2023. No.
- **Arctic Shift:** the only one that works keyless with fresh data and rich fields (flair, over_18). Downsides: single maintainer, "no uptime guarantees", dynamic undocumented limits, score useless, and it is precisely the "unauthorized bulk collection" Reddit's Public Content Policy says it will "strongly enforce" against — Reddit cut Pushshift off in 2023 and can do the same here. Legal exposure sits with the archive, not a reader, but the availability risk is real. Verdict: acceptable **opt-in fallback** (`REDDIT_SOURCE=arctic`), default off. Concrete URL if ever wired: `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=<sub>&sort=desc&limit=50&fields=id,title,author,created_utc,link_flair_text,over_18,removed_by_category,subreddit,permalink` (one request per sub, 6 req / 10 min, honour `X-RateLimit-Reset` on 429).

### 4. Lemmy / Mastodon / Bluesky as a substitute
- **Lemmy:** every crypto community found is effectively dead (biggest = 362 posts lifetime; lemmy.world/c/cryptocurrency ≈ 2 posts/month). Zero value.
- **Mastodon tag RSS:** free, 300 req/5 min/IP (docs.joinmastodon.org), plenty of volume, but ~60 % bots/price tickers/foreign-language spam and no engagement signal to filter on. Not "discussion" and would need an account allowlist to be usable. Not now.
- **Bluesky:** `getAuthorFeed` works keyless; search does not. That makes it a publisher wire (CoinDesk/The Block accounts), which duplicates the News tab rather than replacing Reddit discussion. Feeds were sparse/stale in the probe. Not now; revisit only if a curated crypto *list* URI is wanted later.

### 5. Drop Reddit
- Zero cost, zero risk, but the Social tab would hold only whale_alert-style items. Option 1 costs one adapter and ~150 lines, so dropping is not warranted.

## Recommendation — exact settings

- URL (built from REDDIT_SUBS order): `https://www.reddit.com/r/CryptoCurrency+CryptoMarkets+Bitcoin+ethereum+solana+defi/hot/.rss?limit=100`
- Interval: 10 min (`REDDIT_RSS_INTERVAL_MS`, default `600000`; floor 120000). Module-level hard gap `REDDIT_MIN_GAP_MS = 60000` between any two reddit.com requests, whatever the scheduler does.
- User-Agent: `REDDIT_USER_AGENT` if set, else `web:sahasra-news:v1.0 (self-hosted RSS reader)`. No Authorization header, no browser UA.
- `conditional: false` (Reddit sends no ETag/Last-Modified; `Cache-Control: private, max-age=3600` means nothing to gain).
- Per-sub hot-position cap `rssTake`: CryptoCurrency 10, Bitcoin 10, CryptoMarkets 8, solana 6, ethereum 6, defi 5 (feed order = hot order; Bitcoin dominates the raw 100 so the cap matters).
- Drop: author `/u/AutoModerator`; title `/\b(daily|weekly|monthly)\b.*\b(discussion|thread|megathread)\b|\bmegathread\b|\bgeneral discussion\b/i`; published >48 h old; link not under a configured sub.
- Items keep the exact OAuth-mode shape: `sourceName: 'reddit:<sub>'` (configured casing), `sourceTier: 4`, `kind: 'social'`, `alertable: false`, `maxImportance: 10`, `hintTickers: []`, `sourceDomain: 'reddit.com'`, `url` = `<link>` with any query string stripped. Nothing downstream needs to change: `store.js`/`health.js` key on `adapter.name` and `raw.sourceName` independently (gnews already emits `gnews:<host>` from an adapter named `gnews`).
- Adapter: exactly one, `name: 'reddit:multi'`, `tier: 4`, `quietHealth: true` (unauthenticated public surface, same treatment as unverified TG wires — a Reddit block must never page Discord).

## Precise changes

### `app/ingest/config.js`
- REDDIT_SUBS: add `rssTake` to each entry (values above); keep `minScore` (still used by OAuth mode). Update the comment: OAuth mode when keys exist, otherwise one multireddit `/hot/.rss` request.

### `app/ingest/adapters/reddit.js` (keep every existing OAuth function and export untouched)
1. New constants: `RSS_BASE = 'https://www.reddit.com/r/'`, `RSS_SUFFIX = '/hot/.rss?limit=100'`, `RSS_INTERVAL_MS = Math.max(120000, Number(process.env.REDDIT_RSS_INTERVAL_MS) || 600000)`, `REDDIT_MIN_GAP_MS = 60000`, `DAILY_THREAD_RE` (regex above), `AUTOMOD = '/u/AutoModerator'`, `SUB_FROM_LINK_RE = /^https?:\/\/(?:www\.|old\.)?reddit\.com\/r\/([^/]+)\//i`.
2. `mode(e = env())` → `'oauth'` if `isConfigured(e)`, else `'off'` if `process.env.REDDIT_RSS_ENABLED === '0'`, else `'rss'`. Export it.
3. `rssUrl(subs)` → `RSS_BASE + subs.map(s => s.sub).join('+') + RSS_SUFFIX`. Export it (tests pin the exact string).
4. `rssUserAgent(e)` → `e.userAgent || 'web:sahasra-news:v1.0 (self-hosted RSS reader)'`.
5. Global gap: module-level `let lastRedditRequestAt = 0;` and `async function awaitRedditGap(now = Date.now, sleep = defaultSleep)` that sleeps `REDDIT_MIN_GAP_MS - (now() - lastRedditRequestAt)` when positive, then sets `lastRedditRequestAt = now()`. Accept injectable `now`/`sleep` via a `_clock` export so tests never wait 60 s. Call it before the OAuth `fetchHot` request too, so both modes share the single reddit.com budget.
6. `parseRssItems(text, subs, nowMs = Date.now())` (pure, exported): `rss-parser` (`new Parser({ timeout: 15000 })`, same as rss.js) → for each item in feed order: derive `sub` from `item.link` via `SUB_FROM_LINK_RE` and match a configured sub case-insensitively (rss-parser does **not** expose Atom `<category>`; verified — `item.categories` is undefined); skip if unmatched; skip `item.author === AUTOMOD`; skip `DAILY_THREAD_RE.test(title)`; skip if `new Date(item.isoDate)` invalid or older than 48 h; per-sub counter, stop taking once `rssTake` reached; push the item shape above with `url` = link minus `?…`.
7. `makeRssAdapter(subs)` → `{ name: 'reddit:multi', tier: 4, intervalMs: RSS_INTERVAL_MS, quietHealth: true, async run() { await awaitRedditGap(); const res = await http.request(rssUrl(subs), { ua: rssUserAgent(env()), timeoutMs: 20000 }); return parseRssItems(res.text, subs); } }`. Errors (429/5xx/network) propagate untouched — `scheduler._backoffUntil` already does `max(Retry-After, 60 s)` on 429 and the 6 h quiet-fail cap.
8. `make(subs = REDDIT_SUBS)`: `switch (mode())` — `'oauth'` → existing `subs.map(makeSubAdapter)`; `'rss'` → `[makeRssAdapter(subs)]` and log once `[reddit] unauthenticated RSS mode — one multireddit /hot/.rss request every <N> min for <k> subs (set REDDIT_* keys for OAuth mode, REDDIT_RSS_ENABLED=0 to turn off)`; `'off'` → existing disabled log line, wording extended with `… or REDDIT_RSS_ENABLED=1` only if the old exact-wording test is updated in the same commit (otherwise leave the line as is).
9. Header comment: state both modes and the shared 60 s gap.

### Elsewhere
- `app/ingest.js`: no change (already spreads `reddit.make()`; startup count becomes 112 adapters).
- `app/.env.example`: document `REDDIT_RSS_ENABLED="1"`, `REDDIT_RSS_INTERVAL_MS="600000"`, note that `REDDIT_USER_AGENT` now also applies to RSS mode, and that the four REDDIT_* keys are optional (Reddit no longer issues script apps).
- `build/HANDOFF_phase3.md` lines 16/44/94/123: Reddit is on by default in RSS mode; health summary line now names `reddit:multi`.
- Fixture: copy `C:\Users\sidda\AppData\Local\Temp\claude\C--Users-sidda\265b8991-ac09-4d52-96d1-f04569174852\scratchpad\reddit_multi_hot_fixture.atom` (40 real entries from today's capture — Bitcoin 12, CryptoCurrency 8, CryptoMarkets 8, solana 7, ethereum 4, defi 1; includes 1 AutoModerator entry and 5 "Daily … Discussion" titles; `<content>` bodies stubbed; 24 KB) to `build/tests/fixtures/reddit_multi_hot.atom`; the full 245 KB capture is beside it as `reddit_multi_hot_live_2026-09-26.atom`. Template the `<published>/<updated>` dates with `{{...}}` the way `fillDates()` already does so the 48 h test is stable.

## Tests to add (`build/tests/p3_step7_media_social.test.js` or a new `p3_step7b_reddit_rss.test.js`, same `assert_lib`, no network)

1. **Mode selection:** no creds, `REDDIT_RSS_ENABLED` unset → `make()` returns exactly 1 adapter `{ name: 'reddit:multi', tier: 4, intervalMs: 600000, quietHealth: true }` and does *not* print the "disabled" line. Creds set → 6 OAuth adapters (existing behaviour, existing tests keep passing). No creds + `REDDIT_RSS_ENABLED='0'` → 0 adapters + disabled line, printed once across two `make()` calls.
2. **Request shape:** injected `http.request` records `url === rssUrl(REDDIT_SUBS) === 'https://www.reddit.com/r/CryptoCurrency+CryptoMarkets+Bitcoin+ethereum+solana+defi/hot/.rss?limit=100'`, `opts.ua` is the default UA, `opts.headers` has no `Authorization`, `opts.conditional` is falsy. With `REDDIT_USER_AGENT` set the custom UA is used.
3. **Parsing (fixture):** count equals sum of per-sub caps actually reachable; every item has `kind 'social'`, `alertable false`, `maxImportance 10`, `sourceTier 4`, `hintTickers []`, `sourceDomain 'reddit.com'`, `sourceName` in `REDDIT_SUBS` casing (`'reddit:ethereum'` for a link `/r/ethereum/`); AutoModerator entry dropped; every "Daily … Discussion" title dropped; an entry templated to 49 h old dropped, one at 47 h kept; per-sub cap enforced in feed order (the fixture has 12 Bitcoin entries — assert exactly `rssTake` (10) Bitcoin items and that they are the first 10 Bitcoin entries; defi has 1 entry, so a cap of 5 must yield 1, not fail); an entry whose link is `/r/SomeOtherSub/` dropped; `url` has no `?` and equals the fixture `<link href>`.
4. **60 s gap:** with injected clock/sleep, two back-to-back `run()` calls → second call sleeps `60000 - elapsed` ms before its request; a call ≥60 s later sleeps 0. Also assert OAuth `fetchHot` path calls `awaitRedditGap` (spy) so both modes share the budget.
5. **Errors propagate:** `http.request` throws `{status: 429, retryAfterMs: 42000}` → `run()` rejects with the same object, exactly one request, no retry (mirrors the existing F7 429 test).
6. **Config:** `REDDIT_SUBS.length === 6`, every entry has integer `rssTake ≥ 1` and the existing `minScore`; update the existing `'subreddit minScore gates'` assertion only if the object shape comparison breaks (compare `minScore` fields, not whole objects).
7. **Startup wiring:** with no creds, `ingest.js`'s adapter list contains one name starting `reddit:` (`reddit:multi`), and `REDDIT_ENABLED='0'` still yields none.
8. **Manual live smoke (not in suite, once, by hand):** `node -e "require('./ingest/adapters/reddit').make()[0].run().then(i=>console.log(i.length, i.slice(0,3)))"` from `app/` — expect ~40–60 items and log lines like `[ingest] … reddit:CryptoCurrency [… ≤10] …`. Then watch `ingest.log` for 1 h: exactly 6 reddit requests, zero 429s.

## Sources checked
- Reddit Data API Wiki (help-center article 16160319875092, updated 2026-09-25): 100 QPM per OAuth client id; "Traffic not using OAuth or login credentials will be blocked"; User-Agent format `<platform>:<app ID>:<version string> (by /u/<username>)`; "Our robots.txt is for search engines, not Data API users."
- Reddit Public Content Policy (article 26410290525844, updated 2026-09-24): non-commercial use allowed; scraping/bulk collection targeted.
- Reddit Data API Terms (rev. 2026-07-20) and Developer Terms (rev. 2026-03-24): commercial use / model training / circumventing rate limits prohibited; nothing specific to RSS.
- Arctic Shift `api/README.md` (rate-limiting and "no guarantees" sections); Mastodon docs (300 req / 5 min / IP). Bluesky rate-limit doc page did not render (from memory: 3000 req / 5 min / IP on the public AppView — unverified).
