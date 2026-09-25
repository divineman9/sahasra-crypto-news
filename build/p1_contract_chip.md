# NEWS CHIP for the ShivaShakthi base-break dashboard (authoritative)

## Context
- **Page:** `D:\claude projects\crypto\screener\base_break.html`, served by a static http.server on `http://127.0.0.1:8765/`. It is plain ES5-style JS (no modules, no framework).
- **Rendering:** the page re-renders its tables every few seconds.
- **Rows:** each setup row is a `<tr>`. Its first `<td>` contains an `<a>` whose text is the coin name with the `USDT` suffix already removed (e.g. `HYPE`, `1000PEPE`, `BROCCOLI714`). The 4th `<td>` holds the stage badges (`<span class="badge ...">`).
- **Feeds:** crypto by default. The page is showing the stocks feed when `location.search` contains `feed=stocks`; the chip must do NOTHING then.
- **CSS:** variables exist: `--red`, `--amber`, `--lime`, `--cyan`, `--muted`. The existing `.badge` class is a small inline pill.
- **Data:** the news ingest worker writes `news_live.json` in the same folder (same origin):
```json
{ "asof": "ISO", "asof_ms": 0, "window_h": 48, "min_importance": 50,
  "flags": { "HYPE": { "count": 2, "maxImportance": 95, "latestSeenAt": "ISO",
             "top": [ { "id": "uuid", "title": "...", "url": "https://...", "category": "listing", "importance": 95,
                        "sentiment": "bullish", "source": "binance-cms", "firstSeenAt": "ISO" } ] } } }
```

## Write `D:\claude projects\crypto\screener\news_chip.js` (new file)
A single IIFE, `"use strict"`, ES5-compatible syntax (var, function; no arrow functions, no template literals).

1. **Stocks guard:** if `/(^|[?&])feed=stocks(&|$)/.test(location.search)`, return immediately.
2. **Data:** `var NEWS = null;`.
   - `function load(){ fetch("news_live.json?_=" + Date.now()).then(r => ok ? json : null).then(j => { if (j && j.flags) { NEWS = j; apply(); } }).catch(function(){}); }` (written in ES5).
   - Call it now, then `setInterval(load, 15000)`.
3. **baseOf(name):** uppercase, strip a trailing `USDT`/`USDC` if present, then strip a leading `1000000` or `1000`.
4. **ageText(iso):** minutes since → `"Nm"` if < 60, `"Nh"` if < 48 h (floor), else `"Nd"`.
5. **Table scope.** Only these tables: `#topTable, #fastTable, #ltfTable, #setupTable, #firstLtfTable, #firstBarTable`.
6. **apply()** — if `!NEWS` return. For each `tbody tr` of those tables:
   - `a = tr.querySelector("td:first-child a")`; skip if missing.
   - `base = baseOf(a.textContent.trim())`; `f = NEWS.flags[base]`.
   - `existing = tr.querySelector(".news-chip")`.
   - If `!f`: remove `existing` if present, then continue.
   - Build `key = base + "|" + f.count + "|" + f.maxImportance + "|" + f.latestSeenAt`. If `existing` has `data-key === key`, continue (nothing changed).
   - Otherwise remove `existing` and create a new chip:
     - `var top = f.top[0]`.
     - Colour: `var(--red)` if top.category is hack or delisting, or top.sentiment is bearish; `var(--lime)` if top.category is listing or top.sentiment is bullish; otherwise `var(--amber)`.
     - Element: `<a class="badge news-chip" data-key=key target="_blank" rel="noopener">`.
       - href = `"http://127.0.0.1:4180/post/" + top.id`.
       - Inline style: `background:transparent;border:1px solid <col>;color:<col>;cursor:pointer;text-decoration:none;margin-left:4px`.
       - Text: `"📰 NEWS " + ageText(f.latestSeenAt) + (f.count > 1 ? " ×" + f.count : "")`.
     - Tooltip (`title` attribute), one line per item of `f.top`: `"[" + category.toUpperCase() + " " + importance + "] " + title + " — " + source + " · " + ageText(firstSeenAt) + " ago"`, joined with `"\n"`. Then add a final line `"Click to open in the news terminal (news ≤48h, importance ≥50)"`.
     - Append the chip to the 4th td if it exists (`tr.children[3]`), else to the first td.
   - Wrap the whole body of apply in try/catch (swallow errors) so the page can never break.
7. **Re-apply after the page re-renders:**
   - `new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })`.
   - `schedule` debounces apply by 150 ms with setTimeout.
   - IMPORTANT: ignore mutations caused by our own chips. Inside the observer callback, skip when every mutation's added/removed nodes are `.news-chip` elements (check `node.classList && node.classList.contains("news-chip")`), so we don't loop forever.
8. Nothing else: no global variables except via the IIFE, no console spam.
