"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useFeedStore } from "@/store/useFeedStore";
import { visibleStories } from "@/lib/filters";
import { fetchOlder } from "@/lib/feedApi";
import { FeedRow } from "@/components/FeedRow";
import { ArrowUp, History } from "lucide-react";

export function NewsFeed() {
  const posts = useFeedStore((s) => s.posts);
  const filter = useFeedStore((s) => s.filter);
  const portfolio = useFeedStore((s) => s.portfolio);
  const hideLowGnews = useFeedStore((s) => s.hideLowGnews);
  const pendingCount = useFeedStore((s) => s.pending.length);
  const setPaused = useFeedStore((s) => s.setPaused);
  const flushPending = useFeedStore((s) => s.flushPending);
  const nextCursor = useFeedStore((s) => s.nextCursor);
  const loadingOlder = useFeedStore((s) => s.loadingOlder);
  const source = useFeedStore((s) => s.source);
  const [now, setNow] = useState(() => Date.now());

  const listRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);

  const update = useCallback(() => {
    const top = listRef.current?.scrollTop ?? 0;
    setPaused(hoverRef.current || top > 4);
  }, [setPaused]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => setPaused(false), [setPaused]);

  const stories = useMemo(
    () => visibleStories(posts, filter, portfolio, now, hideLowGnews),
    [posts, filter, portfolio, now, hideLowGnews]
  );

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-[72px_minmax(0,1fr)_120px_130px_190px_52px] gap-2 border-b border-slate-800 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">
        <span>Published</span>
        <span>Title</span>
        <span>Source</span>
        <span>Tickers</span>
        <span>Tags</span>
        <span>Mark</span>
      </div>
      <div
        ref={listRef}
        onScroll={update}
        onMouseEnter={() => {
          hoverRef.current = true;
          update();
        }}
        onMouseLeave={() => {
          hoverRef.current = false;
          update();
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {pendingCount > 0 && (
          <button
            onClick={() => {
              flushPending();
              listRef.current?.scrollTo({ top: 0 });
            }}
            className="sticky top-0 z-10 flex w-full items-center justify-center gap-1 border-b border-emerald-500/30 bg-slate-900/95 py-1 text-[11px] text-emerald-400 hover:bg-slate-800"
          >
            <ArrowUp size={12} /> {pendingCount} new post
            {pendingCount === 1 ? "" : "s"} — click to show
          </button>
        )}
        {stories.length === 0 ? (
          <p className="p-4 text-center text-xs text-slate-600">
            No stories match the current filter.
          </p>
        ) : (
          stories.map((v) => <FeedRow key={v.post.id} story={v} now={now} />)
        )}
        {source === "live" &&
          (typeof nextCursor === "string" && nextCursor.length > 0 ? (
            <button
              onClick={() => {
                fetchOlder();
              }}
              disabled={loadingOlder}
              className="flex w-full items-center justify-center gap-1 py-2 text-[11px] text-slate-400 hover:text-emerald-400"
            >
              <History size={12} />
              {loadingOlder ? "loading…" : "Load older"}
            </button>
          ) : nextCursor === null ? (
            <p className="py-2 text-center text-[10px] text-slate-600">
              end of archive
            </p>
          ) : null)}
      </div>
    </section>
  );
}