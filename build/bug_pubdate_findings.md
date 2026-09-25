# Bug: feed shows a different published date than the article (bloomingbit 120964 / thecryptobasic Dcent)

Investigated 2026-09-25 ~17:35Z, read-only. DB = cryptonews (Prisma), UI = http://127.0.0.1:4180.

## ROOT CAUSE

**Display bug, not a data bug.** The feed's Time column (`app/src/components/FeedRow.tsx:41`) renders
`fmtTime(post.firstSeenAt)` — the moment *our collector* stored the row — as a bare local `HH:MM` with no date.
`publishedAt` is only in the hover `title`. Every Google-News item was backfilled in one 26-minute burst today
(1259 rows, `firstSeenAt` 17:02:34Z → 17:28:50Z, right after the gnews adapter deploy at 17:02Z), with a median
publish→seen lag of 24.7 h (648 of 1259 rows > 24 h). So a Sep-23/24 article shows "22:38" (today, IST) in the
feed while the publisher page says Sep 24 07:10 — the user reads it as a wrong published date.

Stored `publishedAt` is exactly right for both reported articles (Google's RSS `<pubDate>` == the publisher's
`article:published_time`, to the second). No timezone bug: DB is UTC, the UI converts to browser-local (IST),
and bloomingbit itself renders the timestamp in the *viewer's* zone (`+05:30`), so "7:10 AM Sep 24" on
bloomingbit == `2026-09-24T01:40:50Z` in our DB.

## EVIDENCE

### Example 1 — https://en.bloomingbit.io/feed/news/120964
| what | value |
|---|---|
| Publisher page `article:published_time` / JSON-LD `datePublished` | `2026-09-24T07:10:50+05:30` = **2026-09-24T01:40:50Z**; visible "Published 7:10 AM Sep 24" |
| Google RSS `<pubDate>` (search `"Bankless" "Zcash" "Ethereum 2021" when:7d`) | `Thu, 24 Sep 2026 01:40:50 GMT` — identical |
| DB row `1ef77661-5f83-4486-8983-201aa003d9f8` `publishedAt` | `2026-09-24T01:40:50.000Z` — identical |
| DB `firstSeenAt` | `2026-09-25T17:08:38.782Z` (39.5 h later) |
| Feed Time column shows (IST) | **22:38** (= firstSeenAt), no date; age chip in the tags column says `1d` (publishedAt-based) — the two contradict each other on the same row |
| /post/[id] page shows | `published 2026-09-24 07:10:50` (local) — correct; Timing box shows Published + First seen — correct |
| Stored URL | `https://news.google.com/rss/articles/CBMiVEFVX3lxTFBO…?oc=5`. Google returns 302 → same URL + `&hl=en-IN&gl=IN&ceid=IN:en` → 200 JS interstitial. Decoded via `/_/DotsSplashUi/data/batchexecute` (page tokens `data-n-a-sg`/`data-n-a-ts`) → **https://en.bloomingbit.io/feed/news/120964**. Link is correct. |

### Example 2 — thecryptobasic.com/2026/09/23/investor-loses-100000-in-xrp-and-xlm-as-dcent-wallet-drain-…
| what | value |
|---|---|
| Publisher `article:published_time` | `2026-09-23T17:14:32+00:00` |
| Google RSS `<pubDate>` | `Wed, 23 Sep 2026 17:14:32 GMT` — identical |
| DB row `3f46f1fa-171a-4513-9a58-15de1ce876b3` `publishedAt` | `2026-09-23T17:14:32.000Z` — identical |
| DB `firstSeenAt` | `2026-09-25T17:07:51.156Z` (47.9 h later) |
| Feed shows (IST) | **22:37** today vs real Sep 23 22:44 IST |

### Population check (rows with firstSeenAt in the last 24 h)
| source | n | median lag (seen − published) | p over 24 h | over 6 h |
|---|---|---|---|---|
| gnews:* | 1259 | 24.7 h | 648 | 976 |
| non-gnews | 270 | 20.0 h | 108 | 193 |
Zero gnews rows have `publishedAt > firstSeenAt` (no future-dating → no KST/UTC offset error in the adapter;
`gnews.js:173 new Date(it.pubDate)` parses the RFC-822 GMT string correctly). The 7 other gnews publishers I
tried to open through the Google redirect (cryptobriefing, blockchain.news, cryptotimes, tronweekly, coinfomania…)
all stop at the JS interstitial for curl, so only the two articles above were verified end-to-end — but both
matched to the second, and the pubDate Google emits is the publisher's own `<pubDate>`/`published_time`, not an
indexing time.

Not a factor: ingest health (last row 17:28:50Z vs db now 17:34:33Z; RSS trickle 2–6 rows/h before the burst is
the normal non-gnews rate).

## Every surface that renders a post date — field used

| file:line | renders | field | format / tz | verdict |
|---|---|---|---|---|
| `app/src/components/FeedRow.tsx:41` | Time column | **firstSeenAt** | `fmtTime` → local `HH:MM`, no date | **BUG** (the reported one) |
| `FeedRow.tsx:38-40` | hover title | publishedAt + firstSeenAt | raw ISO UTC | ok but hidden |
| `FeedRow.tsx:105` | age chip `1d`/`5h` | publishedAt (`ageMs`) | relative | correct — contradicts col 1 |
| `PostDetail.tsx:76` meta line | `published …` | publishedAt | `fmtDateTime` local `YYYY-MM-DD HH:MM:SS` | correct |
| `PostDetail.tsx:78` | `… ago` | publishedAt | relative | correct |
| `PostDetail.tsx:155-158` Timing box | Published / First seen | both, labelled | local | correct |
| `PostDetail.tsx:233` Sources in this story | per-source time | **firstSeenAt** (`fmtTime(...,true)`) | local `HH:MM:SS`, no date | misleading for backfilled items (labelled only by the "1st" badge) |
| `PostDetail.tsx:270` Related news | time | **firstSeenAt** | local `HH:MM` | same issue |
| `app/src/app/post/[id]/page.tsx` | – | – | delegates to PostDetail | n/a |
| `app/src/lib/serialize.ts:60-62` | DTO | both, `toISOString()` UTC | – | correct |
| `app/ingest/newsFile.js:92-103,160-171` → `news_live.json` | chip items | publishedAt (+firstSeenAt) | ISO UTC | correct |
| `crypto/screener/news_chip.js:141-149,177` | chip label + tooltip | publishedAt (`ageText`, `dayText`) | relative + `Sep 24` local | correct (p1_evidence.md notes this exact bug was already fixed once on the chip) |

Windows / filters / ordering:
| where | rule | field | note |
|---|---|---|---|
| `lib/filters.ts:18-23` isFresh / Hot | ≤48 h | publishedAt | correct |
| `lib/filters.ts:76` Rising | ≥2 members first seen ≤1 h | firstSeenAt | velocity signal by design; backfill burst makes every multi-source old story "rising" for 1 h after a deploy |
| `components/TrendingCoins.tsx:20-23` | last 24 h | **firstSeenAt** | backfill inflates trending with 1–7-day-old stories |
| `store/useFeedStore.ts:43-49`, `filters.ts:35-37,66`, `/api/posts:24`, `/api/news:33` | feed order | firstSeenAt desc | mandated by `build/p1_contract_ui.md:91` ("not publishedAt"); WS "new row flashes at top" and cursor pagination depend on it |
| `/api/posts/route.ts` | main feed window | **none** | no publishedAt window at all → 7-day-old gnews backfill (`when:7d`) lands in the main feed showing today's time |
| `/api/news/route.ts:25`, `newsFile.js:81-83` | ticker news / chip | publishedAt ≥ since (+ firstSeenAt ≥ since for chip) | correct |

## FIX (recommended, exact)

**Display-only fix; no need to fetch publisher pages.** Google's pubDate is the publisher's own timestamp
(2/2 verified to the second). Extracting it from the article page would cost one `batchexecute` POST to decode
the redirect + one page GET per item (~1259 items on this backfill alone; Google rate-limits/blocks), for zero
gain. Keep `publishedAt` as is.

1. **`app/src/lib/ui.ts`** — add
   `fmtPubTime(iso: string, now: number): string` → if `now - Date.parse(iso) < 24h` return `fmtTime(iso)`
   (`HH:MM` local); else return local `DD/MM HH:MM` (e.g. `24/09 07:10`), built with `padStart` like `fmtDateTime`
   (same manual-build rule as the contract, avoids hydration mismatch). Local browser tz, 24 h.
2. **`FeedRow.tsx:41`** — `{fmtPubTime(post.publishedAt, now)}` (the `now` prop is already passed in). Keep the
   hover title but make it readable: `published: ${fmtDateTime(post.publishedAt)}\nfirst seen: ${fmtDateTime(post.firstSeenAt)}`.
   Widen column 1 in `GRID` from `44px` to `72px` (`24/09 07:10` is 11 mono chars at text-xs) and the matching
   header grid in `NewsFeed.tsx`; rename header `Time` → `Published`.
3. **`PostDetail.tsx:233` and `:270`** — same `fmtPubTime(p.publishedAt, now)`; keep the sibling sort by
   firstSeenAt (the `1st` badge = who we saw first, which is the latency metric), and keep the Timing box as is
   (it already labels both).
4. **Feed ORDER — keep `firstSeenAt desc`.** It is the arrival stream: WS pushes, `row-flash`, cursor pagination
   and the contract all assume it, and a late-discovered 2-day-old item *should* appear at the top once (that is
   the "new to us" event) — it just must be labelled with its real published time, which fix 1–3 does. Switching
   to publishedAt would bury new discoveries under older-published items and break the cursor.
   Optional later: a `sort: arrival | published` toggle in the feed header.
5. **Backfill hygiene (so old items don't flood the stream):**
   - `/api/posts/route.ts` — add `where: { publishedAt: { gte: new Date(Date.now() - 48h) } }` (same window
     `/api/news` and `newsFile.js` already use); the store's `MAX_POSTS` cap then holds mostly current news.
   - `app/ingest/adapters/gnews.js` — on insert, skip items whose `publishedAt` is older than 48 h (they are
     never eligible for Hot/chip/feed anyway); this alone would have dropped most of the 648 >24 h rows.
   - Do **not** set `firstSeenAt = publishedAt` for old items: `firstSeenAt` is a measurement (latency,
     "price after first seen") and must stay honest.
6. **Filters for old items discovered today:**
   - Hot: unchanged — already `publishedAt ≤ 48h && importance ≥ 70`, so a 3-day-old item found today is
     correctly *not* hot; a 30-h-old one is (its news may still be un-priced only if genuinely fresh, so consider
     tightening Hot to ≤ 24 h publishedAt — user call).
   - Rising (`filters.ts:76`): add `&& isFresh(v.post, now)` and preferably `ageMs(v.post, now) ≤ 6h` so a
     backfill burst of an old multi-source story cannot register as rising.
   - Trending (`TrendingCoins.tsx:23`): use `publishedAt` for the 24 h cutoff.
7. Chip (`news_chip.js`) and `news_live.json`: no change — already publishedAt.

Not in scope but noted: stored `url` is the Google redirect; decoding it at ingest (one batchexecute POST per
item) would let us store the canonical publisher URL and dedupe against direct-RSS copies of the same article.
