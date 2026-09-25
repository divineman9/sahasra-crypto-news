# PHASE 3 · STEP 4A — PER-COIN GOOGLE NEWS (tier A = live-setup coins) — authoritative

Source of truth for design: "STEP 4A corrections" in build/phase3_plan.md (Fable review). This spec makes it concrete.

## Files
- NEW `app/ingest/coinSources.json` — curated per-coin search records (data, curated by Fable):
  `{ "<BASE>": { "name": "Ethena", "aliases": ["Ethena", "Ethena Labs", "USDe"], "ambiguous": false, "query": "\"Ethena\" crypto" } }`
  - `aliases`: whole phrases that prove the headline is about this coin (case-insensitive, word-bounded).
  - `ambiguous: true` → bare `SYM` never counts; only aliases, `$SYM`, or `SYMUSDT` count.
  - `query`: the Google News query without `when:` (the adapter appends ` when:2d`, or ` when:7d` on first run).
  - A base with no record → default `{ name: nameOf(base), aliases: [nameOf(base)], ambiguous: base.length <= 4 || BARE_BLOCK/NAME_BLOCK, query: '"<name>" crypto' }`; bases that are not /^[A-Z0-9]+$/ are skipped.
- NEW `app/ingest/coinMatch.js` — `matchCoin(title, base, rec)` → boolean, and `stripSourceSuffix(title)` → title without trailing ` - <Publisher>`.
  Pass if (after stripping suffix): any alias phrase matches (case-insensitive, `(^|[^a-z0-9])phrase([^a-z0-9]|$)`), OR `$BASE` appears, OR `BASEUSDT` appears, OR (!ambiguous AND bare `\bBASE\b` in the title's original case adjacent (±2 words) to one of token|coin|crypto|price|perp|futures|network|protocol|blockchain).
  Fail if `STOCK_PERP_TITLE_RE` matches or `isNonCoin(base)`.
- NEW `app/ingest/adapters/gnews.js` — `make({ getTierA })` returns `{ name: 'gnews', tier: 4, intervalMs: 20000, warmRuns: 1, run }`.
  - Env: `GNEWS_ENABLED` (default '1'; '0' → run returns [] and does nothing), `GNEWS_DAILY_BUDGET` (default 5000).
  - Tier A set = `getTierA()` → array of bases (from base_break_live.json setups + NEWS_PORTFOLIO; see discord.js refreshPortfolio — export a shared helper `loadWatchBases()` from a new `app/ingest/watchlist.js` and use it in both places).
  - State file `app/ingest/cache/gnews_state.json` (env `GNEWS_STATE_FILE` overrides; tests use tmp): `{ day: 'YYYY-MM-DD', used: N, coins: { BASE: { nextDueAt, lastOkAt, firstDone } } }`. Budget resets when the UTC day changes.
  - Each run: pick up to 3 due bases (nextDueAt ≤ now), oldest-due first, skipping non-ASCII; if `used >= budget` → return []. For each: GET `https://news.google.com/rss/search?q=<encodeURIComponent(query + ' when:' + (firstDone ? '2d' : '7d'))>&hl=en-US&gl=US&ceid=US:en` via `http.request(url, { ua: BROWSER_UA, timeoutMs: 15000 })`; `used += 1`; on success set `nextDueAt = now + 15 min`, `firstDone = true`, `lastOkAt = now`.
  - On HttpError 429/403 (or a body that is not RSS): throw an Error with `status` so the scheduler backs the whole adapter off (existing scheduler backoff); do not advance nextDueAt for that coin.
  - Parse `<item>`: `<title>`, `<link>`, `<pubDate>`, `<source url="...">Publisher</source>`. Decode entities (&amp; &lt; &gt; &quot; &#39; numeric).
  - For each item: `title = stripSourceSuffix(title)`; skip if `!matchCoin(title, base, rec)`; skip if pubDate invalid or older than 7 d.
    RawItem: `{ sourceName: 'gnews:' + publisherHost, sourceTier: 4, kind: 'news', exchange: null, title, url: link (Google redirect, as-is), publishedAt: new Date(pubDate), hintCategory: null, hintTickers: [base], sourceDomain: publisherHost, alertable: false }` where publisherHost = hostname of `<source url>` minus `www.` (fallback 'news.google.com').
  - Per coin keep at most 30 items per run (newest first).
  - Every 10 min log one stats line: `[gnews] used=<n>/<budget> today, coins=<A count>, kept=<k> dropped=<d> (last 10 min), errors=<e>`.
- `app/ingest/store.js`:
  - `sourceDomain: raw.sourceDomain || new URL(raw.url).hostname.replace(/^www\./, '')`.
  - `raw.alertable === false` → `eligible = false` (new-post path) and never set alertState pending in revision/detail-retry paths.
  - Title-key dedupe: keep `this.titleKeys = new Set()` of `normalize(title) + '|' + sourceDomain`, loaded in `init()` from the same 5000 rows (select sourceDomain too) and added on every create. For an incoming item whose `sourceName` starts with `gnews:`, if its titleKey already exists → return null (a direct copy already exists).
- `app/ingest/classify.js`: tier-4 items whose title matches OPINION_RE (price prediction etc.) → importance 10.
- `app/ingest.js`: add `gnews.make({ getTierA: () => loadWatchBases() })` to the adapter list.

## Tests (orchestrator-owned) `build/tests/p3_step4a.test.js`
- coinMatch: "Ethena governance approves fee switch" → ENA true; "NEAR Protocol announces upgrade" → NEAR true; "Hurricane near Florida" → NEAR false; "Sui Network outage" → SUI true; "Sun Communities (SUI) shares" → SUI false; "$PEPE rallies" → PEPE true; "Pepe the Frog meme" → PEPE false (ambiguous); stripSourceSuffix("X rallies - CoinDesk") → "X rallies".
- gnews adapter with a fake http (fixture RSS with 5 items: 3 matching, 1 non-matching, 1 older than 7 d): returns 3 RawItems with correct fields; state file in tmp shows used=1, nextDueAt ≈ now+15 min; second run before due → no fetch; budget exhausted → no fetch; 429 → throws with status 429 and nextDueAt unchanged; GNEWS_ENABLED=0 → [] and no fetch.
- store: alertable:false item on a portfolio coin at importance 85 → alertState null; gnews item whose normalized title+domain already exists → not stored; sourceDomain comes from raw.sourceDomain.
- classify: tier 4 "NEAR price prediction 2026" → importance 10.
- watchlist: loadWatchBases reads setups from a fixture BBW file + NEWS_PORTFOLIO.
