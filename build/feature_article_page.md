# FEATURE: in-app article page (authoritative; follow literally)

Existing project: Next.js 15 App Router + React 19 + TypeScript strict + Tailwind v3 + zustand v5 + lucide-react, alias `@/` = `src/`.
Existing modules you MUST use (do not re-create them):
- `@/lib/types`: `PostDTO { id, title, url, sourceDomain, publishedAt (ISO), createdAt (ISO), kind: "news"|"media"|"blog", sentiment: "bullish"|"bearish"|"neutral", instruments: {ticker,name}[], votes: {bullish,bearish,important,toxic} }`, `VoteType = "bullish"|"bearish"|"important"|"toxic"`.
- `@/lib/filters`: `score(p: PostDTO): number`, `matchesFilter(p, f: "hot"|"rising"|..., now: number): boolean`.
- `@/lib/prisma`: `export const prisma`. `@/lib/serialize`: `export function serializePost(p)` (p loaded with `include: { instruments: true, votes: true }`).
- `@/store/useFeedStore`: `export const useFeedStore` (zustand). State: `posts: PostDTO[]`, `source`, `wsStatus`, `portfolio: string[]`, `flashIds`. Actions: `upsertPost(post, isNew: boolean)`, `applyLocalVote(id, type)`, `addTicker(t)`. Always read with selectors: `useFeedStore((s) => s.posts)`.
- `@/hooks/useFeedSocket`: `export function useFeedSocket(): void`. `@/hooks/useHydratePosts`: `export function useHydratePosts(): void`.
- `@/components/TopBar`: `export function TopBar()`.
- Existing vote endpoint: `POST /api/posts/${id}/vote` body `{ type }` -> `{ post: PostDTO }`.

## New files

### 1. `src/app/api/posts/[id]/route.ts`
`export const dynamic = "force-dynamic"; export const runtime = "nodejs";`
`export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> })`:
- `const { id } = await params;` if id is not a UUID (regex `/^[0-9a-f-]{36}$/i`) -> 404 `{ error: "post not found" }`.
- `prisma.post.findUnique({ where: { id }, include: { instruments: true, votes: true } })`; null -> 404 `{ error: "post not found" }`.
- 200 `{ post: serializePost(p) }` with header `Cache-Control: no-store`. DB error -> 500 `{ error: "database unavailable" }`.

### 2. `src/lib/simulated.ts`
`export function isSimulated(post: Pick<PostDTO, "id" | "url">): boolean` — true if `post.id.startsWith("mock-")`, or the URL hostname ends with `.local`, or the URL cannot be parsed (wrap `new URL` in try/catch).

### 3. `src/hooks/useVote.ts` ("use client")
`export function useVote(post: PostDTO): { vote: (type: VoteType) => Promise<void>; busy: boolean }` — exactly the logic currently inside FeedRow: if busy return; if `post.id.startsWith("mock-")` call `applyLocalVote(post.id, type)` and return; else setBusy(true), POST to `/api/posts/${post.id}/vote` with JSON `{ type }`, on ok `upsertPost(data.post, false)`, swallow network errors, finally setBusy(false). Read the two actions with selectors.

### 4. `src/components/FeedProvider.tsx` ("use client")
`export function FeedProvider({ children }: { children: React.ReactNode })` — calls `useFeedSocket()` and `useHydratePosts()` once, returns `<>{children}</>`. (Keeps ONE WebSocket connection alive across page navigations.)

### 5. `src/app/post/[id]/page.tsx` ("use client", default export)
- Get the id with `useParams<{ id: string }>()` from `next/navigation`.
- Mounted gate exactly like the home page: until mounted render `<div className="p-4 font-mono text-xs text-slate-500">loading…</div>`.
- Layout: `<div className="flex h-screen flex-col p-4"><TopBar /><div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded border border-slate-800">…</div></div>`.
- Post lookup: `const fromStore = useFeedStore((s) => s.posts.find((p) => p.id === id))`. If not in store and id does not start with "mock-", fetch `/api/posts/${id}` (cache "no-store"); on 200 call `useFeedStore.getState().upsertPost(data.post, false)` (so live vote updates then flow through the store); on 404 set a notFound flag; on other errors set an error message. While fetching show "loading article…".
- Not found: text "Article not found." plus a back link.
- Render `<PostDetail post={post} />` when found.

### 6. `src/components/PostDetail.tsx` ("use client")
`export function PostDetail({ post }: { post: PostDTO })`, content max-w-4xl, padding p-4, terminal styling (slate-900 bg inherited, borders slate-800, text-xs/sm, font-mono for numbers):
- Top row: `<Link href="/">` from `next/link` with lucide `ArrowLeft` icon + "back to feed" (text-slate-400 hover:text-emerald-400).
- Meta line: kind icon (Newspaper news sky-400 / PlayCircle media fuchsia-400 / PenLine blog amber-400) + kind label uppercase, `sourceDomain`, full local date-time `YYYY-MM-DD HH:MM:SS` (24h, build it manually with padStart) and relative age ("12s ago", "5m ago", "2h ago", "3d ago", recomputed every 30 s).
- Title: `<h1 className="text-lg text-slate-100 mt-2">`.
- Badges row: sentiment badge (bullish emerald / bearish rose / neutral cyan, bordered, uppercase text-[10px]); "HOT" badge (amber, lucide Flame) if `matchesFilter(post,"hot",now)`; "RISING" badge (sky, TrendingUp) if `matchesFilter(post,"rising",now)`; `score N` in slate-400 font-mono.
- Tickers: chips `$TICKER · Name` colored by the post sentiment (same classes as the feed: bullish `text-emerald-400 border-emerald-500/40`, bearish `text-rose-400 border-rose-500/40`, neutral `text-cyan-300 border-cyan-500/30`); each chip is a button that calls `addTicker(ticker)` and has title "add to portfolio".
- Votes panel: 4 larger buttons in a row using `useVote(post)` — ThumbsUp "Bullish" emerald, ThumbsDown "Bearish" rose, Flame "Important" amber, Skull "Toxic" slate — each shows its count (font-mono) and is disabled while busy. Below it a thin bar: bullish share vs bearish share (emerald vs rose widths; if both 0 show a neutral slate bar).
- Source box: if `isSimulated(post)`: a dashed-border note "Simulated article — generated by the mock ingest worker (ingest.js). There is no source page for it." Otherwise an external `<a href={post.url} target="_blank" rel="noopener noreferrer">` "Read full article on {sourceDomain}" with lucide `ExternalLink` icon.
- Related news: heading "RELATED NEWS"; from the store posts (selector), other posts (id !== post.id) sharing at least one ticker with this post, sorted by publishedAt desc, max 10; each row: HH:MM (24h, font-mono slate-500), title as `<Link href={`/post/${p.id}`}>` truncate, sourceDomain slate-500, ticker chips; empty-state "No related news yet."

## Edits to existing files (only these)
- `src/app/layout.tsx`: import `{ FeedProvider }` from "@/components/FeedProvider" and wrap `{children}` inside `<FeedProvider>` in the body. Keep everything else.
- `src/app/page.tsx`: remove the `useFeedSocket()` and `useHydratePosts()` calls and their imports (FeedProvider does it now). Keep everything else.
- `src/components/FeedRow.tsx`: (a) replace the inline vote function + busy state with `const { vote, busy } = useVote(post);` from "@/hooks/useVote" (remove now-unused imports/selectors: applyLocalVote, upsertPost, useState if unused); (b) replace the title `<a href={post.url} target="_blank" rel="noopener noreferrer" ...>` with `<Link href={`/post/${post.id}`} ...>` from "next/link", keeping the same className and children. Keep memo export and everything else.
- `lib/mockNews.js`: the generated url becomes `https://news.local/${sourceDomain}/${slugify(title)}-${randHex(8)}` (clearly simulated, still unique). Nothing else.
