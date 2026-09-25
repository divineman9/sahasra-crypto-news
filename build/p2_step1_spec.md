# PHASE 2 · STEP 1 — FLAG CONTRACT (authoritative)
Source: Astra review, blocking findings 1 and 2. A chip must never show expired news or stale data, and a bullish listing must never hide a fresh hack or delisting.

## A. `app/ingest/newsFile.js` (full rewrite, CommonJS)
`startNewsFile({ prisma, scheduler = null, intervalMs = 5000 })` returns a stop function.

**Worker loop:**
- Non-overlapping: while a tick is still running, skip the next timer fire.
- Errors: log at most once per minute, never throw.

**Each tick:**
1. `now = Date.now()`, `since = new Date(now - 48*3600e3)`, `future = new Date(now + 5*60e3)`.
2. Query posts:
   - where: `publishedAt: { gte: since, lte: future }`, `firstSeenAt: { gte: since }`, `importance: { gte: 50 }`, `OR: [{ userLabel: null }, { userLabel: { not: 'dismiss' } }]`
   - include: `instruments`
   - orderBy: `firstSeenAt: 'desc'`
   - take: 2000
3. Item shape: `{ id, title, url, category, importance, sentiment, source: sourceName, storyId, publishedAt: ISO, firstSeenAt: ISO }`.
4. Classify each post:
   - `risk` if category is 'hack' or 'delisting', or sentiment === 'bearish';
   - else `catalyst` if sentiment === 'bullish';
   - else `other`.
5. Build `flags[ticker]` for each instrument ticker of each post:
   - `{ count, risk, catalyst, other, items, latestPublishedAt }`
   - `risk` / `catalyst` / `other`: the best item of that class for the ticker. Best = highest importance, ties broken by newest publishedAt. `null` if none.
   - `items`: up to 5 items, sorted with risk items first, then catalyst, then other; within a class by importance desc, then publishedAt desc.
   - `count`: number of distinct storyIds for that ticker.
   - `latestPublishedAt`: ISO max publishedAt.
6. Build `health` from `scheduler.health()` if a scheduler was given, else `{ known: false }`:
   - `tier1Total` = number of tier-1 adapters (all adapters with tier === 1).
   - `tier1Ok` = tier-1 adapters with `lastOkAt > now - 15*60e3` and `consecutiveErrors < 3`.
   - `stale` = names of adapters failing that test. For non-tier-1 adapters the window is 30 min.
   - `ok = stale.length === 0`.
   - Output `{ known: true, ok, tier1Ok, tier1Total, stale }`.
7. Write the result atomically (same retry logic as the current `writeAtomic`):

   ```js
   {
     schema: 2, asof, asof_ms, heartbeat_ms: intervalMs,
     window_h: 48, min_importance: 50,
     health, flags
   }
   ```

   Skip silently if the target directory does not exist.

## B. `app/ingest.js`
Change the call to `startNewsFile({ prisma, scheduler })`. Nothing else.

## C. `app/ingest/store.js`
Quarantine future timestamps. In save(), next to the existing invalid-date check:
- if `raw.publishedAt.getTime() > Date.now() + 10*60e3` → `console.error('[store] future publishedAt quarantined', raw.sourceName, raw.url)` and return null.

## D. `D:\claude projects\crypto\screener\news_chip.js` (full rewrite, ES5 only: var/function, no arrow functions, no template literals)
IIFE, `"use strict"`. Same stocks guard and the same six table ids as now (`topTable, fastTable, ltfTable, setupTable, firstLtfTable, firstBarTable`).

**State and loading:**
- `var NEWS = null, lastFetchOk = 0;`
- `load()` fetches `news_live.json?_=` + Date.now(). On success with `j.flags` and `j.schema === 2`: `NEWS = j; lastFetchOk = Date.now()`. Then call `apply()` in both the success and failure cases.
- Poll every 15 s.
- Also `setInterval(apply, 30000)`, so ages and expiry refresh even when the data doesn't change.

**Constants:** `STALE_MS = 60000`, `MAX_AGE_MS = 48*3600e3`.

**`isStale()`:**
- true if `!NEWS`, or `Date.now() - NEWS.asof_ms > STALE_MS`, or `Date.now() - lastFetchOk > STALE_MS`.

**Banner:**
- One fixed element `#newsChipBanner`, created on demand: fixed top-right, small, font 11px, padding 3px 8px, border-radius 4px, z-index 9999, background `#1b1b1b`.
- If `isStale()`:
  - text `"📰 news feed stale — chips hidden" + (NEWS ? " (last update " + ageText(NEWS.asof) + " ago)" : "")`, grey `var(--muted)` border and text.
  - Remove ALL `.news-chip` elements.
  - Return.
- Else if `NEWS.health && NEWS.health.known && !NEWS.health.ok`:
  - text `"📰 news coverage degraded: " + NEWS.health.stale.join(", ")`, amber border and text.
  - Keep showing chips.
- Else hide the banner.

**`fresh(item)`:**
- `item && item.publishedAt`
- `Date.now() - Date.parse(item.publishedAt) <= MAX_AGE_MS`
- `Date.parse(item.publishedAt) <= Date.now() + 5*60e3`

**`chip(item, kind)`** returns an `<a class="badge news-chip" target="_blank" rel="noopener">`:
- href `"http://127.0.0.1:4180/post/" + item.id`
- border/colour:
  - `var(--red)` for kind risk
  - `var(--lime)` for catalyst
  - `var(--amber)` for other
- text:
  - risk → `"⚠ " + item.category.toUpperCase() + " · " + ageText(item.publishedAt) + " ago"`
  - catalyst / other → `"📰 " + item.category.toUpperCase() + " · " + ageText(item.publishedAt) + " ago · " + dayText(item.publishedAt)`
- title: that item's own title, importance, source and age. Plus, only on the first chip of the row, a line listing the other fresh items for the coin.
- style: `background:transparent;border:1px solid <col>;color:<col>;cursor:pointer;text-decoration:none;margin-left:4px`

**`apply()`:**
- If `isStale()` → the banner handles everything; return.
- For each row: `base = baseOf(first td a text)`; `f = NEWS.flags[base]`.
- Fresh items to show, each only if `fresh()`: `f.risk`, then `f.catalyst` if `f.risk` is not fresh or they are different items, then `f.other` ONLY when neither risk nor catalyst is fresh.
- `key` = ids of the shown items joined + `"|" + Math.floor(Date.now() / 60000)` (the minute bucket forces the age text to refresh).
- If the row's existing chips carry the same key (a `data-key` attribute on the first chip), skip the row. Otherwise remove the row's `.news-chip` elements and append the new chips to `tr.children[3]` (fallback: first td).
- No fresh items → remove the row's chips.
- Wrap everything in try/catch.
- Keep the MutationObserver with the 150 ms debounce, and still ignore mutations that consist only of `.news-chip` nodes (and the banner).

**Helpers** (same as now): `baseOf`, `ageText(iso)` ("Nm" / "Nh" / "Nd"), `dayText(iso)` ("Sep 24").
