#!/bin/bash
cd "/d/claude projects"
A="D:/claude projects/crypto-news-terminal/app"
g() { echo ">>> $1"; python glm_build.py --model glm --file "$A/$1" --task "$2" 2>&1 | tail -1 | grep -oE "WROTE.*|ERROR.*|FAIL.*|rror.*"; }

g "src/app/api/posts/[id]/vote/route.ts" 'Apply exactly these changes, keep everything else:
(1) CSRF protection at the very top of POST, before reading params/body: const ct = req.headers.get("content-type") ?? ""; if (!ct.toLowerCase().includes("application/json")) return NextResponse.json({ error: "content-type must be application/json" }, { status: 415 }); const origin = req.headers.get("origin"); if (origin && !["http://localhost:4180", "http://127.0.0.1:4180"].includes(origin)) return NextResponse.json({ error: "forbidden origin" }, { status: 403 });
(2) Keep the Redis hot list in sync: add a module-level constant
const UPDATE_HOT_LUA = `local items = redis.call("LRANGE", KEYS[1], 0, -1)
for i, s in ipairs(items) do
  local ok, obj = pcall(cjson.decode, s)
  if ok and type(obj) == "table" and obj.id == ARGV[1] then
    redis.call("LSET", KEYS[1], i - 1, ARGV[2])
    return i - 1
  end
end
return -1`;
and inside the existing Redis try block, BEFORE the publish, run: const json = JSON.stringify(dto); await redis.eval(UPDATE_HOT_LUA, 1, "news:hot", id, json); then publish json on "news:update" (reuse the json variable). The whole Redis block stays wrapped so Redis failures never fail the request.'

g src/hooks/useHydratePosts.ts 'Rewrite the hook body to delegate to the shared loader: import { fetchLatest } from "@/lib/feedApi"; useEffect(() => { fetchLatest().catch((err) => console.warn("hydrate failed, keeping mock data", err)); }, []); Remove the old inline fetch and the useFeedStore import if unused. Keep the export name useHydratePosts and "use client".'

g src/hooks/useFeedSocket.ts 'Re-sync after reconnects: import { fetchLatest } from "@/lib/feedApi"; add const everOpenedRef = useRef(false); in ws.onopen after setting status "open": if (everOpenedRef.current) { fetchLatest().catch(() => {}); } everOpenedRef.current = true; Change nothing else.'

g src/hooks/useVote.ts 'One vote per type per post: (1) read const voted = useFeedStore((s) => s.myVotes[post.id]) ?? [] and const recordMyVote = useFeedStore((s) => s.recordMyVote); (2) at the start of vote(): if (voted.includes(type)) return; (3) for mock posts call applyLocalVote then recordMyVote(post.id, type); for real posts call recordMyVote(post.id, type) only when res.ok (after upsertPost); (4) return { vote, busy, voted } and update the return type to { vote: (type: VoteType) => Promise<void>; busy: boolean; voted: VoteType[] }. Keep everything else.'

g src/components/FeedRow.tsx 'Apply exactly these changes, keep everything else: (1) const { vote, busy, voted } = useVote(post); (2) in the voteBtn helper, compute const isVoted = voted.includes(type); set disabled={busy || isVoted}; append to the className ` ${isVoted ? "bg-slate-700/70 ring-1 ring-inset ring-current" : ""}`; set title={isVoted ? `you voted ${type}` : `vote ${type}`}. (3) In the toLocaleTimeString options replace hour12: false with hourCycle: "h23".'

g src/components/PostDetail.tsx 'Apply exactly these changes, keep everything else: (1) destructure voted from useVote(post): const { vote, busy, voted } = useVote(post); (2) for each of the 4 large vote buttons: disabled={busy || voted.includes(<its type>)} and when voted.includes(<its type>) add the classes "bg-slate-700/70 ring-1 ring-inset ring-current" and show a small "✓" after the count; (3) wherever a time is formatted with toLocaleTimeString and hour12: false, use hourCycle: "h23" instead.'

g src/components/NewsFeed.tsx 'Add pause-on-interaction, a new-posts bar and load-older. Keep the header row, rows memo and empty state. Changes:
(1) imports: add useRef and useCallback from react; import { fetchOlder } from "@/lib/feedApi"; import { ArrowUp, History } from "lucide-react".
(2) selectors: const pendingCount = useFeedStore((s) => s.pending.length); const setPaused = useFeedStore((s) => s.setPaused); const flushPending = useFeedStore((s) => s.flushPending); const nextCursor = useFeedStore((s) => s.nextCursor); const loadingOlder = useFeedStore((s) => s.loadingOlder); const source = useFeedStore((s) => s.source).
(3) const listRef = useRef<HTMLDivElement>(null); const hoverRef = useRef(false); const update = useCallback(() => { const top = listRef.current?.scrollTop ?? 0; setPaused(hoverRef.current || top > 4); }, [setPaused]); on the scrollable list div (the one with overflow-y-auto) add ref={listRef}, onScroll={update}, onMouseEnter={() => { hoverRef.current = true; update(); }}, onMouseLeave={() => { hoverRef.current = false; update(); }}. Also useEffect(() => () => setPaused(false), [setPaused]) so leaving the page never leaves the feed paused.
(4) Inside the scrollable list div, as its first child, when pendingCount > 0 render a sticky button: <button onClick={() => { flushPending(); listRef.current?.scrollTo({ top: 0 }); }} className="sticky top-0 z-10 flex w-full items-center justify-center gap-1 border-b border-emerald-500/30 bg-slate-900/95 py-1 text-[11px] text-emerald-400 hover:bg-slate-800"><ArrowUp size={12} /> {pendingCount} new post{pendingCount === 1 ? "" : "s"} — click to show</button>.
(5) After the rows (still inside the scrollable div), when source === "live": if nextCursor is a non-empty string render a button (full width, py-2, text-[11px] text-slate-400 hover:text-emerald-400, History icon size 12) labelled loadingOlder ? "loading…" : "Load older", disabled={loadingOlder}, onClick={() => { fetchOlder(); }}; else if nextCursor === null render <p className="py-2 text-center text-[10px] text-slate-600">end of archive</p>.'

g src/lib/filters.ts 'Redefine the Rising filter as "gaining traction but not yet Hot": in matchesFilter case "rising" return true only if the post was published within the last 60 minutes AND score(p) >= 5 AND score(p) < 8. Change nothing else.'

g package.json 'Edit only the "all" script: remove the -k flag and add --restart-tries 3 --restart-after 2000 so one crashed process no longer kills the others: "all": "concurrently --restart-tries 3 --restart-after 2000 -n redis,next,ws,ingest -c red,cyan,magenta,yellow \"npm:redis\" \"npm:dev\" \"npm:ws\" \"npm:ingest\"". Keep every other script and dependency exactly. Output valid JSON.'

g ingest.js 'ioredis multi().exec() does not throw on per-command errors; it resolves to an array of [err, result] tuples. After the existing `await redis.multi()...exec()` call, capture its result (const results = await ...exec();) and if results is null or any tuple has a non-null err, log console.error("[ingest] redis pipeline error:", the first error message or "transaction aborted"). Change nothing else.'

g README.md 'Add a short "Using the terminal" section before the Notes section with these bullets: click a headline to open its article page (simulated articles have no external source page); while your mouse is over the feed or it is scrolled down, new posts are held and a "N new posts — click to show" bar appears; each vote type can be cast once per post per browser; "Load older" at the bottom pages back through the archive; Hot = score >= 8, Rising = under 1 hour old with score 5-7 (score = bullish + bearish + 2×important − toxic). Also add to Notes: if one process crashes, `npm run all` restarts it up to 3 times and keeps the others running. Keep all existing content.'
echo ALL_DONE
