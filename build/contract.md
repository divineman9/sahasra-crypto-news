# CRYPTO NEWS TERMINAL — BUILD CONTRACT (authoritative; follow literally)

Target: Windows 11, Node 24, npm. Project root = the output directory. All paths below are relative to it.
Stack (pin these exact major versions in package.json):
next ^15.1, react ^19.0, react-dom ^19.0, typescript ^5.7, tailwindcss ^3.4 (v3 — NOT v4), postcss ^8.4,
autoprefixer ^10.4, zustand ^5.0, lucide-react ^0.469, @prisma/client ^6.2, prisma ^6.2 (dev), ioredis ^5.4,
ws ^8.18, concurrently ^9.1 (dev), dotenv ^16.4, @types/node ^22, @types/react ^19, @types/react-dom ^19, @types/ws ^8.
Do NOT set "type": "module" in package.json. `ingest.js`, `ws-server.js`, `prisma/seed.js` are CommonJS (`require`).
Every Node script (`ingest.js`, `ws-server.js`, `prisma/seed.js`) starts with `require('dotenv').config();`.

## 1. Environment (.env — user creates it from .env.example; NEVER hardcode credentials)
```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/cryptonews?schema=public"
REDIS_URL="redis://localhost:6379"
WS_PORT=4181
NEXT_PUBLIC_WS_URL="ws://localhost:4181"
INGEST_INTERVAL_MS=5000
```
Ports: Next.js 4180, WebSocket server 4181.

## 2. Prisma schema — prisma/schema.prisma (EXACTLY this, no extra models/fields/enums)
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Post {
  id           String       @id @default(uuid())
  title        String
  url          String       @unique
  sourceDomain String
  publishedAt  DateTime
  kind         String       // "news", "media", "blog"
  sentiment    String       // "bullish", "bearish", "neutral"
  instruments  Instrument[]
  votes        VoteData?
  createdAt    DateTime     @default(now())

  @@index([publishedAt])
}

model Instrument {
  id     String @id @default(uuid())
  ticker String @unique
  name   String
  posts  Post[]
}

model VoteData {
  id        String @id @default(uuid())
  postId    String @unique
  post      Post   @relation(fields: [postId], references: [id], onDelete: Cascade)
  bullish   Int    @default(0)
  bearish   Int    @default(0)
  important Int    @default(0)
  toxic     Int    @default(0)
}
```

## 3. Shared data shape — PostDTO (the ONLY shape sent over REST, Redis and WebSocket)
```ts
export type Sentiment = "bullish" | "bearish" | "neutral";
export type Kind = "news" | "media" | "blog";
export type VoteType = "bullish" | "bearish" | "important" | "toxic";
export interface Votes { bullish: number; bearish: number; important: number; toxic: number }
export interface PostDTO {
  id: string;
  title: string;
  url: string;
  sourceDomain: string;
  publishedAt: string;   // ISO 8601
  createdAt: string;     // ISO 8601
  kind: Kind;
  sentiment: Sentiment;
  instruments: { ticker: string; name: string }[];
  votes: Votes;          // zeros if VoteData row missing
}
```
Serialization from a Prisma Post loaded with `include: { instruments: true, votes: true }`:
dates -> `.toISOString()`, instruments -> `{ticker, name}` sorted by ticker, votes -> the 4 ints or all 0.
Implemented once in TS at `src/lib/serialize.ts` (`export function serializePost(p): PostDTO`) and once in CommonJS at
`lib/serialize.js` (`module.exports = { serializePost }`) for Node scripts — identical logic.

## 4. Score / filter rules (implemented in `src/lib/filters.ts`, used by the UI)
- `score(p) = votes.bullish + votes.bearish + 2*votes.important - votes.toxic`
- Hot: `score >= 8`
- Rising: published within the last 60 minutes AND `score >= 2`
- Bullish: `sentiment === "bullish"`; Bearish: `sentiment === "bearish"`; All: everything.
- Portfolio: if the portfolio ticker list is non-empty, only posts having at least one instrument whose ticker is in the list.
- Visible list is always sorted by `publishedAt` desc, then `id` desc.
Exports: `export type FilterKey = "all"|"hot"|"rising"|"bullish"|"bearish"; export function score(p): number;
export function matchesFilter(p, f, now: number): boolean; export function visiblePosts(posts, f, portfolio: string[], now: number): PostDTO[]`.

## 5. Redis contract
- Hot feed list key `news:hot`: JSON-stringified PostDTO strings, newest at index 0. After every push: `LTRIM news:hot 0 999`.
- Channel `news:new`: message = JSON PostDTO of a newly ingested post.
- Channel `news:update`: message = JSON PostDTO after a vote changed its counts.
- Prices cache key `prices:coingecko` (JSON of the /api/prices response body), `EX 60`.

## 6. WebSocket protocol (server -> client only; JSON text frames)
- On connect: `{ "type": "snapshot", "posts": PostDTO[] }` = `LRANGE news:hot 0 49` parsed (newest first).
- New post: `{ "type": "post", "post": PostDTO }` (from `news:new`).
- Vote update: `{ "type": "update", "post": PostDTO }` (from `news:update`).
Client ignores unknown types and malformed frames.

## 7. REST API (Next.js App Router route handlers; every handler file has `export const dynamic = "force-dynamic";` and `export const runtime = "nodejs";`)
- `GET /api/posts?cursor=<postId>&limit=<n>` — `src/app/api/posts/route.ts`
  - limit default 20, clamp 1..100. Order `[{ publishedAt: "desc" }, { id: "desc" }]`, include instruments+votes.
  - If cursor given and no Post with that id exists -> 400 `{ error: "invalid cursor" }`.
  - Use Prisma cursor pagination: `take: limit + 1`, `cursor: { id }`, `skip: 1` when cursor present.
  - Response 200 `{ posts: PostDTO[], nextCursor: string | null }` (nextCursor = id of the last returned post if there were more rows, else null).
  - Header `Cache-Control: no-store`. DB error -> 500 `{ error: "database unavailable" }`.
- `POST /api/posts/[id]/vote` body `{ "type": VoteType }` — `src/app/api/posts/[id]/vote/route.ts`
  - Next 15: `params` is a Promise: `export async function POST(req: Request, { params }: { params: Promise<{ id: string }> })`.
  - Invalid JSON/type -> 400. Unknown post -> 404.
  - `prisma.voteData.upsert({ where: { postId }, create: { postId, [type]: 1 }, update: { [type]: { increment: 1 } } })`, reload post with includes, serialize.
  - `redis.publish("news:update", JSON.stringify(dto))` (a Redis failure must NOT fail the request — catch and log).
  - Response 200 `{ post: PostDTO }`. Other errors -> 500 JSON.
- `GET /api/prices` — `src/app/api/prices/route.ts`
  - Coins (fixed list, in this order): BTC bitcoin, ETH ethereum, SOL solana, BNB binancecoin, XRP ripple, DOGE dogecoin, ADA cardano, AVAX avalanche-2, LINK chainlink, TON the-open-network.
  - First try Redis `GET prices:coingecko`; if present return it.
  - Else fetch `https://api.coingecko.com/api/v3/simple/price?ids=<comma ids>&vs_currencies=usd&include_24hr_change=true` with an 8s AbortController timeout.
  - Response `{ prices: { ticker: string; name: string; usd: number; change24h: number }[], fetchedAt: string, stale: boolean }` — include only coins present in the CoinGecko response (partial results are fine). Cache in Redis `EX 60` and in a module-level variable.
  - On any fetch error: return the module-level last good value with `stale: true`, or `{ prices: [], fetchedAt: <now>, stale: true }`, always HTTP 200. Redis errors are caught and ignored.

## 8. Shared server libs
- `src/lib/prisma.ts`: global-singleton PrismaClient (dev hot-reload safe).
- `src/lib/redis.ts`: `export const redis` global-singleton ioredis client from `process.env.REDIS_URL ?? "redis://localhost:6379"`, options `{ maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false }`, attach `.on("error", ...)` that logs once per 30 s (never throws).
- `src/lib/types.ts`: the types from section 3 plus `FilterKey`.

## 9. Instrument dictionary — `lib/instruments.js` (CommonJS, used by seed + ingest)
`module.exports = { INSTRUMENTS }` where INSTRUMENTS is an array of 30 `{ ticker, name, keywords: string[] }`:
BTC Bitcoin, ETH Ethereum, SOL Solana, BNB BNB, XRP XRP, DOGE Dogecoin, ADA Cardano, AVAX Avalanche, LINK Chainlink,
TON Toncoin, DOT Polkadot, MATIC Polygon, LTC Litecoin, TRX TRON, SHIB Shiba Inu, UNI Uniswap, ATOM Cosmos, XLM Stellar,
NEAR NEAR Protocol, APT Aptos, ARB Arbitrum, OP Optimism, SUI Sui, PEPE Pepe, INJ Injective, FIL Filecoin, AAVE Aave,
MKR Maker, RNDR Render, TIA Celestia. keywords include the lowercase name, ticker, and 1-2 aliases (e.g. ETH: ["ethereum","ether","vitalik"], BTC: ["bitcoin","btc","satoshi"]).
Also export `extractTickers(title)`: case-insensitive whole-word match of keywords/tickers against the title, returns unique tickers (max 3).

## 10. Mock article generator — `lib/mockNews.js` (CommonJS, used by seed + ingest)
`module.exports = { makeArticle }`. `makeArticle(publishedAt: Date)` returns
`{ title, url, sourceDomain, publishedAt, kind, sentiment, tickers: string[], votes: {bullish,bearish,important,toxic} }`:
- title built from ~25 templates with `{COIN}`/`{NAME}`/`{N}` placeholders filled from INSTRUMENTS (e.g. "{NAME} surges {N}% as ETF inflows hit record", "SEC delays decision on {NAME} ETF", "Whale moves ${N}M in {COIN} to exchange", "{NAME} network upgrade goes live on mainnet").
- tickers = `extractTickers(title)`; if fewer than 1, add the template coin; optionally add 1-2 random extra tickers (total 1-3).
- sourceDomain random from: coindesk.com, cointelegraph.com, theblock.co, decrypt.co, bloomberg.com, reuters.com, cryptoslate.com, bitcoinmagazine.com, u.today, x.com.
- kind: sourceDomain x.com -> "media", bitcoinmagazine.com -> "blog", else "news".
- sentiment: from template tag (positive/negative/neutral templates) -> "bullish"/"bearish"/"neutral".
- url: `https://<sourceDomain>/<slug-of-title>-<random 8 hex chars>` (must be unique).
- votes: random ints bullish 0-15, bearish 0-10, important 0-6, toxic 0-3.

## 11. File list and responsibilities
Batch A (config + database):
- package.json (scripts: `"dev": "next dev -p 4180"`, `"build": "next build"`, `"start": "next start -p 4180"`, `"ws": "node ws-server.js"`, `"ingest": "node ingest.js"`, `"db:push": "prisma db push"`, `"db:seed": "node prisma/seed.js"`, `"redis:start": "wsl -d Ubuntu -u root -- service redis-server start"`, `"all": "concurrently -k -n next,ws,ingest -c cyan,magenta,yellow \"npm:dev\" \"npm:ws\" \"npm:ingest\""`)
- tsconfig.json (Next 15 standard, strict, `"paths": { "@/*": ["./src/*"] }`, `allowJs: true`)
- next.config.mjs (`reactStrictMode: true`)
- postcss.config.mjs (tailwindcss + autoprefixer), tailwind.config.ts (content `./src/**/*.{ts,tsx}`, `darkMode: "class"`)
- .env.example (section 1), .gitignore (node_modules, .next, .env, *.log)
- prisma/schema.prisma (section 2), prisma/seed.js
- lib/instruments.js, lib/mockNews.js, lib/serialize.js
- src/lib/prisma.ts, src/lib/redis.ts, src/lib/types.ts, src/lib/serialize.ts, src/lib/filters.ts
- README.md (Windows steps: start Redis `npm run redis:start`; copy .env.example to .env; `npm install`; `npm run db:push`; `npm run db:seed`; `npm run all`; open http://localhost:4180)

`prisma/seed.js`: upsert all 30 instruments by ticker; delete existing Posts whose url starts with "https://seed/"? NO — instead: generate 20 articles with `makeArticle` at publishedAt = now minus i*3 minutes (i=0..19), override url to `https://seed.local/post-<i>` and `upsert` Post by url (update title/sentiment/etc, `instruments: { set: [], connect: [...] }`), then upsert VoteData by postId with the generated votes. Then rebuild Redis: `DEL news:hot`, then for posts ordered publishedAt ASC do `LPUSH news:hot <json>` (so newest ends at index 0), `LTRIM news:hot 0 999`. If Redis is unreachable, log a warning and still exit 0. Disconnect Prisma and Redis (`redis.quit()`) at end; `process.exit(1)` on DB error.

Batch B (real-time backend + API):
- ingest.js: every `INGEST_INTERVAL_MS` (default 5000): `makeArticle(new Date())`; ensure instruments exist (connectOrCreate by ticker using name from INSTRUMENTS); `prisma.post.create({ data: {..., instruments: { connect: [...] }, votes: { create: {...} } }, include: { instruments: true, votes: true } })`; dto = serializePost; `redis.multi().lpush("news:hot", json).ltrim("news:hot", 0, 999).publish("news:new", json).exec()`; log `[ingest] HH:MM:SS <TICKERS> <title>`. Errors in one tick are logged and do not stop the loop (no overlapping ticks: use setTimeout chaining). Graceful SIGINT/SIGTERM: stop timer, `prisma.$disconnect()`, `redis.quit()`.
- ws-server.js: `new WebSocketServer({ port: Number(process.env.WS_PORT || 4181) })`; a dedicated ioredis subscriber connection subscribes to `news:new` and `news:update` (ioredis auto-resubscribes on reconnect — do NOT recreate the client); a second normal ioredis connection for LRANGE. On connection send snapshot (section 6; on Redis error send `{type:"snapshot",posts:[]}`). Broadcast to all clients with `readyState === WebSocket.OPEN`. Heartbeat: every 30 s ping, terminate clients that did not pong. Log connections count. Graceful shutdown on SIGINT/SIGTERM.
- src/app/api/posts/route.ts, src/app/api/posts/[id]/vote/route.ts, src/app/api/prices/route.ts (section 7).

Batch C (frontend):
- src/app/layout.tsx: `<html lang="en" className="dark">`, body `className="bg-slate-900 text-slate-200 antialiased"`, metadata title "Crypto News Terminal". No next/font (use Tailwind `font-mono` system stack).
- src/app/globals.css: `@tailwind base; @tailwind components; @tailwind utilities;` plus thin dark scrollbars and a `@keyframes flash` (bg emerald-500/20 -> transparent over 2s) with class `.row-flash`.
- src/lib/mockPosts.ts: `export const MOCK_POSTS: PostDTO[]` — exactly 20 hand-written realistic items, ids `mock-1`..`mock-20`, publishedAt spaced 4 minutes apart back from a fixed base computed at module load (`Date.now()`), mixed sentiments/kinds/sources, 1-3 instruments each, varied votes (at least 3 with score >= 8).
- src/store/useFeedStore.ts (zustand v5, `create` + `persist` middleware, persist ONLY `portfolio` under key "cnt-portfolio"):
  state `{ posts: PostDTO[] (init MOCK_POSTS), source: "mock"|"live", filter: FilterKey, portfolio: string[], wsStatus: "connecting"|"open"|"closed", flashIds: Record<string, number> }`
  actions: `hydrate(posts)` (replace posts when non-empty, source "live"), `mergeSnapshot(posts)` (union by id, incoming wins; if source was "mock" replace mocks entirely), `upsertPost(post, isNew)` (replace by id or prepend; cap 1000; if isNew set flashIds[id]=Date.now()), `setFilter`, `addTicker(t)` (uppercase, trimmed, alnum only, dedupe), `removeTicker`, `setWsStatus`, `applyLocalVote(id, type)` (increment locally — used for mock-* ids).
- src/hooks/useFeedSocket.ts: client hook; connects to `process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4181"`, handles snapshot/post/update per section 6, exponential backoff reconnect 1s,2s,4s… max 10s, sets wsStatus, cleans up on unmount (no reconnect after unmount).
- src/hooks/useHydratePosts.ts: on mount `fetch("/api/posts?limit=50", { cache: "no-store" })`, on 200 call `hydrate(data.posts)`; on failure keep mock data (console.warn).
- src/app/page.tsx ("use client"): calls both hooks; renders `<TopBar/>` then a CSS grid `grid grid-cols-[220px_minmax(0,1fr)_280px] h-[calc(100vh-2rem)]` with `<LeftSidebar/>`, `<NewsFeed/>`, `<RightSidebar/>`; each column scrolls independently (`overflow-y-auto`), borders `border-slate-800`.
- src/components/TopBar.tsx: h-8 bar: "CRYPTO//NEWS" title in font-mono text-emerald-400, data source badge (MOCK/LIVE), ws status dot (green open / amber connecting / red closed) with label, live clock HH:MM:SS (font-mono, updates every second, render only after mount to avoid hydration mismatch).
- src/components/LeftSidebar.tsx: filter buttons All/Hot/Rising/Bullish/Bearish with lucide icons (LayoutList, Flame, TrendingUp, ArrowUpRight, ArrowDownRight) and counts (computed via `visiblePosts` per filter with current portfolio); Portfolio section: input + Add button (Enter submits), ticker chips with remove (X icon), hint text when empty.
- src/components/NewsFeed.tsx: header row (TIME / TITLE / SOURCE / TICKERS / VOTES, text-[10px] uppercase text-slate-500), then rows from `visiblePosts(posts, filter, portfolio, now)` where `now` refreshes every 30 s; empty-state text.
- src/components/FeedRow.tsx: ONE dense row, `h-7 text-xs`, grid columns `grid-cols-[44px_minmax(0,1fr)_120px_130px_150px]`, hover bg-slate-800/60, `row-flash` class if flashIds[id] within last 2.5 s. Time = local HH:MM font-mono text-slate-500. Title = `<a target="_blank" rel="noopener noreferrer">` truncate, with small kind icon (Newspaper news / PlayCircle media / PenLine blog). Source = sourceDomain text-slate-500 truncate. Ticker chips `$BTC` font-mono text-[10px] px-1 rounded border: bullish -> text-emerald-400 border-emerald-500/40, bearish -> text-rose-400 border-rose-500/40, neutral -> text-cyan-300 border-cyan-500/30. Votes: 4 compact buttons (ThumbsUp bullish emerald, ThumbsDown bearish rose, Flame important amber, Skull toxic slate) each with font-mono count; click -> if id starts with "mock-" `applyLocalVote`, else POST `/api/posts/${id}/vote` and `upsertPost(res.post, false)`; disable the row's buttons while request in flight.
- src/components/RightSidebar.tsx: `<PriceWidget/>` then `<TrendingCoins/>`.
- src/components/PriceWidget.tsx: fetch `/api/prices` on mount and every 60 s; list ticker, USD price (font-mono, `toLocaleString` with 2-6 significant decimals for < $1), 24h change colored emerald/rose with sign; show "stale" tag if `stale`; loading and empty states.
- src/components/TrendingCoins.tsx: from store posts published in the last 24 h, count mentions per ticker, top 10: ticker (font-mono, colored by net sentiment of its posts), mention count, small bull/bear bar (emerald vs rose widths). Clicking a ticker adds it to the portfolio.

General: TypeScript strict, no `any` unless unavoidable, no TODOs/stubs, every import must resolve to a file in this file list or a listed dependency. Client components start with `"use client";`. Import alias `@/` = `src/`.
