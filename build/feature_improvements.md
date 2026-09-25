# IMPROVEMENTS SPEC (authoritative; follow literally)

Project: Next.js 15 App Router, React 19, TypeScript strict, zustand v5 (`create` + `persist` from "zustand/middleware"), alias `@/` = `src/`.
Existing types in `@/lib/types`: `PostDTO { id, title, url, sourceDomain, publishedAt (ISO), createdAt (ISO), kind, sentiment, instruments: {ticker,name}[], votes: {bullish,bearish,important,toxic} }`, `VoteType = "bullish"|"bearish"|"important"|"toxic"`, `FilterKey = "all"|"hot"|"rising"|"bullish"|"bearish"`.
`@/lib/mockPosts` exports `MOCK_POSTS: PostDTO[]` (ids start with "mock-").
REST: `GET /api/posts?limit=50[&cursor=<id>]` -> `{ posts: PostDTO[], nextCursor: string | null }` (newest first; nextCursor = id of the oldest returned post when more exist).

## FILE A — `src/store/useFeedStore.ts` (full rewrite; "use client")

```ts
type WsStatus = "connecting" | "open" | "closed";
interface FeedState {
  posts: PostDTO[];                 // init MOCK_POSTS
  source: "mock" | "live";          // init "mock"
  filter: FilterKey;                // init "all"
  portfolio: string[];              // init []   (persisted)
  myVotes: Record<string, VoteType[]>; // init {} (persisted) — vote types this browser already cast per post id
  wsStatus: WsStatus;               // init "connecting"
  flashIds: Record<string, number>; // init {}
  pending: PostDTO[];               // init [] — new live posts held back while the feed is paused (newest first)
  paused: boolean;                  // init false
  nextCursor: string | null | undefined; // init undefined (undefined = not loaded yet, null = no older posts)
  loadingOlder: boolean;            // init false
  hydrate(posts: PostDTO[]): void;
  mergeSnapshot(posts: PostDTO[]): void;
  upsertPost(post: PostDTO, isNew: boolean): void;
  setPaused(paused: boolean): void;
  flushPending(): void;
  setNextCursor(c: string | null): void;
  setLoadingOlder(b: boolean): void;
  setFilter(f: FilterKey): void;
  addTicker(t: string): void;
  removeTicker(t: string): void;
  setWsStatus(s: WsStatus): void;
  applyLocalVote(id: string, type: VoteType): void;
  recordMyVote(id: string, type: VoteType): void;
}
```
Helpers (module-level, not exported): `MAX_POSTS = 1000`; `sortDesc(list)` = sort by `publishedAt` desc then `id` desc (string compare) — returns a new array; `capped(list) = sortDesc(list).slice(0, MAX_POSTS)`; `pruneFlash(flashIds)` keeps entries younger than 5000 ms.

Behaviour:
- `hydrate(incoming)`: if empty do nothing. base = source === "mock" ? [] : posts. Merge by id with INCOMING WINNING (REST is authoritative for counts). Also drop from `pending` any post whose id is in incoming. `set({ posts: capped(merged), source: "live" })`.
- `mergeSnapshot(incoming)`: if empty do nothing. If source === "mock": `set({ posts: capped(incoming), source: "live" })`. Else ADD-ONLY: keep every existing post as-is and only add incoming posts whose id is not already in `posts` or `pending`; `set({ posts: capped(merged) })`.
- `upsertPost(post, isNew)`:
  1. If a post with that id exists in `posts`: replace it in place (same index, no re-sort) and set.
  2. Else if it exists in `pending`: replace it there.
  3. Else (new post): if `paused` is true -> `pending = [post, ...pending].slice(0, 200)`; otherwise prepend to posts (`capped([post, ...posts])`) and if isNew set `flashIds = { ...pruneFlash(flashIds), [post.id]: Date.now() }`.
- `setPaused(p)`: set paused = p; if p is false and pending is non-empty, call `flushPending()`.
- `flushPending()`: if pending empty do nothing. Merge pending into posts (pending wins on id clash), `capped`, add every pending id to flashIds (after pruneFlash) with Date.now(), clear pending.
- `setNextCursor`, `setLoadingOlder`, `setFilter`, `setWsStatus`: plain setters.
- `addTicker(t)`: uppercase, trim, strip non `[A-Z0-9]`, ignore empty/duplicate. `removeTicker(t)`: filter out.
- `applyLocalVote(id, type)`: increment `votes[type]` of that post in `posts` (immutable map).
- `recordMyVote(id, type)`: add type to `myVotes[id]` if not present; if the myVotes object has more than 2000 keys, drop the oldest keys (Object.keys order) down to 2000.
- persist: `name: "cnt-portfolio"`, `partialize: (s) => ({ portfolio: s.portfolio, myVotes: s.myVotes })`.

## FILE B — `src/lib/feedApi.ts` (new; "use client" not needed, plain module)

```ts
import { useFeedStore } from "@/store/useFeedStore";
import type { PostDTO } from "@/lib/types";
function isPostDTO(x: unknown): x is PostDTO  // non-null object with string id, title, publishedAt, Array.isArray(instruments), object votes
export async function fetchLatest(): Promise<void>
export async function fetchOlder(): Promise<void>
```
- `fetchLatest`: GET `/api/posts?limit=50` (`cache: "no-store"`). On non-ok throw. `posts = data.posts.filter(isPostDTO)`; if non-empty `useFeedStore.getState().hydrate(posts)`. If `useFeedStore.getState().nextCursor === undefined` then `setNextCursor(data.nextCursor ?? null)` (only the first load sets the cursor; later re-syncs must not move it forward).
- `fetchOlder`: `const s = useFeedStore.getState();` return if `s.loadingOlder` or `!s.nextCursor`. `setLoadingOlder(true)`; GET `/api/posts?limit=50&cursor=${encodeURIComponent(s.nextCursor)}`; on ok: hydrate(valid posts) and `setNextCursor(data.nextCursor ?? null)`; if the response is 400 (cursor no longer valid) `setNextCursor(null)`; always `setLoadingOlder(false)` in finally. Errors are caught and logged with console.warn.
