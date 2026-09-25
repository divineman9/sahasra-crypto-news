# PHASE 1 — API + UI CONTRACT (authoritative; follow literally)

Next.js 15 App Router, React 19, TypeScript strict, Tailwind v3, zustand v5, lucide-react. Alias `@/` = `src/`.
Route handlers: `export const dynamic = "force-dynamic"; export const runtime = "nodejs";`. Next 15 params are a Promise: `{ params }: { params: Promise<{ id: string }> }`.

## Existing modules (use them; do not re-create)
- `@/lib/types`:
  - `PostDTO { id, title, url, sourceDomain, publishedAt, createdAt, kind: Kind, sentiment, instruments: {ticker,name}[], votes, firstSeenAt, sourceName, sourceTier, category: Category, importance, exchange: string|null, storyId: string|null, announcementSeenAt: string|null, symbolSeenAt: string|null, userLabel: UserLabel|null, ret1m: number|null, ret5m: number|null, ret15m: number|null, moved5m: boolean|null, priceStatus: string }`
  - `Kind = "news"|"exchange"|"regulator"|"symbol"|"media"|"blog"`
  - `Category = "listing"|"delisting"|"hack"|"etf"|"regulatory"|"maintenance"|"other"`
  - `UserLabel = "catalyst"|"dismiss"`
  - `FilterKey = "all"|"hot"|"rising"|"bullish"|"bearish"|"exchange"`
  - `VoteType`, `Votes`
- `@/lib/prisma` (`prisma`), `@/lib/redis` (`redis`), `@/lib/serialize` (`serializePost`, the post must include `{instruments: true, votes: true}`), `@/lib/simulated` (`isSimulated(post)`).
- `@/store/useFeedStore`:
  - State: `posts, source ("mock"|"live"), filter, portfolio, myVotes, wsStatus, flashIds, pending, paused, nextCursor, loadingOlder`.
  - Actions: `hydrate, mergeSnapshot, upsertPost(post, isNew), setPaused, flushPending, setNextCursor, setLoadingOlder, setFilter, addTicker, removeTicker, setWsStatus, applyLocalVote, recordMyVote`.
  - Always use selectors: `useFeedStore((s) => s.posts)`.
- `@/lib/feedApi` (`fetchLatest`, `fetchOlder`), `@/components/TopBar` (`TopBar`), `@/components/PriceWidget`.

## 1. `src/lib/since.ts` (new)
`export function parseSince(v: string | null, def = "48h"): number`
- Parses `/^(\d+)(m|h|d)$/` into milliseconds. Invalid or missing input → the default.
- Clamp to between 1 minute and 30 days.

## 2. `src/lib/hotList.ts` (new)
`export async function updateHotList(id: string, json: string): Promise<void>`
- Runs this Lua script with `redis.eval(LUA, 1, "news:hot", id, json)`:

  ```lua
  local items = redis.call("LRANGE", KEYS[1], 0, -1)
  for i, s in ipairs(items) do
    local ok, obj = pcall(cjson.decode, s)
    if ok and type(obj) == "table" and obj.id == ARGV[1] then
      redis.call("LSET", KEYS[1], i - 1, ARGV[2])
      return i - 1
    end
  end
  return -1
  ```

- Then `redis.publish("news:update", json)`.
- Catch and log every Redis error (it must never throw).

## 3. `src/app/api/posts/[id]/label/route.ts` (new) — POST `{ "label": "catalyst" | "dismiss" | null }`
- CSRF, same as the vote route:
  - content-type must include `application/json`, else 415;
  - if an Origin header is present it must be `http://localhost:4180` or `http://127.0.0.1:4180`, else 403.
- Invalid JSON or an invalid label → 400. Unknown id → 404. An id that is not a UUID (`/^[0-9a-f-]{36}$/i`) → 404.
- `prisma.post.update({ where: {id}, data: { userLabel: label }, include: { instruments: true, votes: true } })`.
- `dto = serializePost(...)`, then `await updateHotList(id, JSON.stringify(dto))`.
- Respond 200 `{ post: dto }` with `Cache-Control: no-store`. Other errors → 500 JSON.

## 4. `src/app/api/news/route.ts` (new) — GET `?ticker=SOL&since=48h&minImportance=50&limit=20`
- ticker required (uppercase it, strip non `[A-Z0-9]`). Missing → 400 `{error:"ticker required"}`.
- sinceMs via parseSince. minImportance: int, default 50, clamped 0–100. limit: default 20, clamped 1–100.
- Query: `prisma.post.findMany({ where: { instruments: { some: { ticker } }, publishedAt: { gte: new Date(Date.now() - sinceMs) }, importance: { gte: minImportance }, OR: [{ userLabel: null }, { userLabel: { not: "dismiss" } }] }, orderBy: [{ firstSeenAt: "desc" }, { id: "desc" }], take: limit, include: { instruments: true, votes: true } })`.
- Response `{ ticker, since: <input or "48h">, minImportance, count, items: PostDTO[] }`.
- Headers: `Cache-Control: no-store`, `Access-Control-Allow-Origin: *`. DB error → 500 `{error:"database unavailable"}`.

## 5. `src/app/api/news/flags/route.ts` (new) — GET `?tickers=BTC,ETH&since=48h&minImportance=50`
- tickers: optional comma list (uppercase, sanitised, max 200). If absent → all tickers.
- Query posts with `publishedAt >= since`, `firstSeenAt >= since`, `importance >= minImportance`, the same label OR-filter, and instruments. If tickers were given: `instruments: { some: { ticker: { in: tickers } } }`.
- Build `flags[ticker] = { count, maxImportance, latestSeenAt, top: [≤3 sorted by importance desc then firstSeenAt desc: {id, title, url, category, importance, sentiment, source, firstSeenAt}] }`. Only include tickers in the requested list, when one is given.
- Response `{ asof: ISO, window: since, minImportance, flags }`. Same headers as section 4.

## 6. `src/lib/filters.ts` (full rewrite)
```ts
export type { FilterKey };
export interface StoryView { post: PostDTO; members: PostDTO[]; count: number; maxImportance: number; tier1: boolean }
export const HOT_IMPORTANCE = 70;
export const FRESH_MS = 48 * 3600 * 1000;
export function ageMs(p: PostDTO, now: number): number          // now - Date.parse(p.publishedAt)
export function isFresh(p: PostDTO, now: number): boolean       // ageMs <= FRESH_MS
export function fmtAge(ms: number): string                      // "12s" | "5m" | "3h" | "2d" (floor, min 0)
export function byFirstSeenDesc(a: PostDTO, b: PostDTO): number // firstSeenAt desc, then id desc
export function groupStories(posts: PostDTO[]): StoryView[]
export function matchesStory(v: StoryView, f: FilterKey, now: number): boolean
export function visibleStories(posts: PostDTO[], f: FilterKey, portfolio: string[], now: number): StoryView[]
```
- `groupStories`: key = `storyId ?? id`. Members are sorted by firstSeenAt ascending; post = members[0] (the first source); `count = members.length`; `maxImportance = max(importance)`; `tier1 = members.some(m => m.sourceTier === 1)`. The result is sorted by `byFirstSeenDesc(post)`.
- `matchesStory`:
  - all → true;
  - hot → `maxImportance >= 70 && isFresh(post)`;
  - rising → `members.filter(m => now - Date.parse(m.firstSeenAt) <= 3600000).length >= 2`;
  - bullish/bearish → `post.sentiment` equals it;
  - exchange → `tier1`.
- `visibleStories`: groupStories → filter matchesStory → if portfolio is non-empty, keep stories where any member has an instrument ticker in the portfolio.

## 7. Store edits (`src/store/useFeedStore.ts`)
- `sortDesc` must sort by `firstSeenAt` desc then id desc (not publishedAt).
- The initial `posts` stays `MOCK_POSTS` (which becomes an empty array — see section 8).

## 8. `src/lib/mockPosts.ts` → `import type { PostDTO } from "@/lib/types"; export const MOCK_POSTS: PostDTO[] = [];`

## 9. `src/hooks/useLabel.ts` (new, "use client")
`export function useLabel(post: PostDTO): { setLabel: (l: UserLabel | null) => Promise<void>; busy: boolean }`
- POSTs `/api/posts/${post.id}/label` with JSON `{label}`. On ok → `upsertPost(data.post, false)`. Swallow network errors. While in flight, `busy` is true.
- `setLabel(x)` where x equals the current `post.userLabel` sends null (toggle off).

## 10. Visual vocabulary (shared; put in `src/lib/ui.ts`, new)
```ts
export const CATEGORY_STYLE: Record<Category, { label: string; cls: string }> = {
  listing:     { label: "LISTING",     cls: "text-emerald-400 border-emerald-500/50" },
  delisting:   { label: "DELISTING",   cls: "text-rose-400 border-rose-500/50" },
  hack:        { label: "HACK",        cls: "text-red-400 border-red-500/60 bg-red-500/10" },
  etf:         { label: "ETF",         cls: "text-sky-400 border-sky-500/50" },
  regulatory:  { label: "REGULATORY",  cls: "text-amber-400 border-amber-500/50" },
  maintenance: { label: "MAINT",       cls: "text-slate-400 border-slate-600" },
  other:       { label: "",            cls: "" } };
export const SENTIMENT_CHIP: Record<"bullish"|"bearish"|"neutral", string> =
  { bullish: "text-emerald-400 border-emerald-500/40", bearish: "text-rose-400 border-rose-500/40", neutral: "text-cyan-300 border-cyan-500/30" };
export function kindIcon(kind: Kind): { Icon: LucideIcon; cls: string; label: string }
//   exchange → Building2 lime-400 "EXCHANGE"; symbol → Radar cyan-400 "NEW MARKET"; regulator → Landmark amber-400 "REGULATOR";
//   media → PlayCircle fuchsia-400 "MEDIA"; blog → PenLine amber-400 "BLOG"; news/default → Newspaper sky-400 "NEWS"
export function fmtTime(iso: string, withSeconds?: boolean): string   // local 24h, hourCycle "h23"
export function fmtDateTime(iso: string): string                      // "YYYY-MM-DD HH:MM:SS" local, built with padStart
export function fmtRet(v: number | null): string                      // "+1.23%" / "−0.40%" / "—"
```

## 11. `src/components/FeedRow.tsx` (full rewrite, memo, named export `FeedRow`)
Props `{ story: StoryView; now: number }`. One dense row, `h-7 text-xs`, grid `grid-cols-[44px_minmax(0,1fr)_120px_130px_190px_52px]`, `hover:bg-slate-800/60`.
- Add the `row-flash` class if `flashIds[post.id]` is within the last 2.5 s (selector `useFeedStore((s) => s.flashIds[story.post.id])`).
- Add `opacity-40` if `post.userLabel === "dismiss"`, and a left border `border-l-2 border-emerald-500` if `userLabel === "catalyst"`.

Columns:
1. firstSeenAt as HH:MM (font-mono slate-500), with a title attribute giving the full published and first-seen times.
2. `<Link href={`/post/${post.id}`}>`: the kind icon plus the truncated title.
3. Source: `exchange ?? sourceDomain` (slate-400 truncate). If `count > 1`, a small chip `+{count-1}` (slate) with title "N sources".
4. Ticker chips `$T`, coloured by SENTIMENT_CHIP[post.sentiment], at most 3 shown then "+n".
5. Tags:
   - a category badge (bordered, text-[10px], skip when the label is empty) + `maxImportance` in font-mono;
   - an age badge `fmtAge(ageMs)` — emerald-400 when isFresh, else slate-600;
   - if `post.ret5m != null`: `5m {fmtRet}` — emerald if > 0, rose if < 0; bold when `moved5m`.
6. Two small icon buttons, using `useLabel(post)`:
   - Check (lucide `Check`), title "mark as catalyst";
   - X (lucide `X`), title "dismiss".
   - Active state `text-emerald-400` / `text-rose-400`; disabled while busy.

## 12. `src/components/NewsFeed.tsx` (edit)
- Replace `visiblePosts` with `visibleStories(posts, filter, portfolio, now)`. Render `<FeedRow key={v.post.id} story={v} now={now} />`.
- Update the header grid to the same template, with headers TIME / TITLE / SOURCE / TICKERS / TAGS / MARK.
- Refresh `now` every 15 s.
- Keep the pause/pending bar, "Load older" and "end of archive" exactly as they are.
- Empty state: "No stories match the current filter."

## 13. `src/components/LeftSidebar.tsx` (edit)
- Filters in this order, with lucide icons:
  - All (LayoutList)
  - Hot (Flame)
  - Rising (TrendingUp)
  - Exchange (Building2)
  - Bullish (ArrowUpRight)
  - Bearish (ArrowDownRight)
- Each shows `visibleStories(...).length` for that filter (useMemo on [posts, portfolio, now]; `now` refreshes every 30 s).
- Under the filters, a muted help line: "Hot = importance ≥70 & ≤48h · Rising = ≥2 sources in 60 min · Exchange = exchange/new-market sources".
- Keep the portfolio section.

## 14. `src/components/TrendingCoins.tsx` (edit)
Count **stories** (unique `storyId ?? id`), not posts, per ticker in the last 24 h (by firstSeenAt). Keep everything else.

## 15. `src/components/PostDetail.tsx` (full rewrite, named export `PostDetail`, props `{ post: PostDTO }`)
Uses store selectors (`posts`, `addTicker`) and `useLabel(post)`; `now` refreshes every 30 s. Content `max-w-4xl p-4`, terminal styling.
- Back link to "/" (ArrowLeft, "back to feed").
- Meta line: kind icon + label · `exchange ?? sourceDomain` · published `fmtDateTime` · `fmtAge` ago.
- `<h1 className="text-lg text-slate-100 mt-2">` title.
- Badges row:
  - category badge;
  - `importance N`;
  - sentiment badge;
  - `HOT` if `importance >= 70 && isFresh`;
  - `FRESH ≤48h` (emerald) or `OLDER THAN 48h` (slate).
- Ticker chips `$T · Name`: buttons that call `addTicker`, title "add to portfolio".
- Label buttons: "✓ Catalyst" / "✕ Dismiss" (bordered, active styling, disabled while busy), with helper text "Private label — used to measure which news matters".
- **Timing** box (dl grid):
  - Published, First seen, Source tier, Source.
  - If `announcementSeenAt`: "Announcement seen".
  - If `symbolSeenAt`: "Market live" + `(+N min after announcement)` or `(N min before announcement)` when both exist.
- **Price after first seen** box:
  - status "done" → three cells 1m / 5m / 15m with `fmtRet`, coloured, and "moved ≥1% in 5m" when `moved5m`;
  - "pending" → "measuring… available ~16 min after first seen (Binance perp 1m candles)";
  - otherwise → "no Binance perp for this coin".
  - Show the ticker used (`post.instruments[0]?.ticker`).
- **Source link**: if `!isSimulated(post)` → `<a target="_blank" rel="noopener noreferrer">` "Open original on {sourceDomain}" + ExternalLink icon.
- **Sources in this story (N)**: store posts with the same `storyId ?? id`, ascending by firstSeenAt. Each line: `1st` badge on the first, `fmtTime(firstSeenAt, true)`, source (exchange ?? sourceDomain), title as an external link (target _blank), category badge.
- **Related news**: other stories (`groupStories` over the store posts, excluding this story) sharing any ticker, newest first, max 10. Each is a `<Link href={`/post/${id}`}>` row: time, title, source, category badge. Empty → "No related news yet."

## 16. `src/components/TopBar.tsx` (edit)
Source badge: `source === "live"` → "LIVE" (emerald); otherwise "LOADING" (amber). Keep everything else.
