"use client";

import { memo } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { useFeedStore } from "@/store/useFeedStore";
import { useLabel } from "@/hooks/useLabel";
import { ageMs, fmtAge, isFresh, type StoryView } from "@/lib/filters";
import { CATEGORY_STYLE, SENTIMENT_CHIP, fmtPubTime, fmtDateTime, fmtRet, kindIcon } from "@/lib/ui";

const GRID =
  "grid grid-cols-[72px_minmax(0,1fr)_120px_130px_190px_52px] items-center gap-2 h-7 text-xs px-2 border-b border-slate-800/60 hover:bg-slate-800/60";

function FeedRowImpl({ story, now }: { story: StoryView; now: number }) {
  const flashAt = useFeedStore((s) => s.flashIds[story.post.id]);
  const { setLabel, busy } = useLabel(story.post);
  const { post, count, maxImportance } = story;

  const flash = flashAt !== undefined && now - flashAt <= 2500;
  const cat = CATEGORY_STYLE[post.category];
  const ki = kindIcon(post.kind);
  const age = ageMs(post, now);

  let rowCls = GRID;
  if (flash) rowCls += " row-flash";
  if (post.userLabel === "catalyst") rowCls += " border-l-2 border-emerald-500";

  const tickers = post.instruments.slice(0, 3);
  const extraTickers = post.instruments.length - 3;

  return (
    <div
      className={rowCls}
      style={post.userLabel === "dismiss" ? { opacity: 0.4 } : undefined}
    >
      {/* 1. time */}
      <span
        className="font-mono text-slate-500 truncate"
        title={`published: ${fmtDateTime(post.publishedAt)}\ncollected: ${fmtDateTime(post.firstSeenAt)}`}
      >
        {fmtPubTime(post.publishedAt)}
      </span>

      {/* 2. title */}
      <div className="min-w-0 flex items-center gap-1.5">
        <ki.Icon className={`h-3.5 w-3.5 shrink-0 ${ki.cls}`} aria-label={ki.label} />
        <Link
          href={`/post/${post.id}`}
          className="truncate text-slate-200 hover:text-white"
          title={post.title}
        >
          {post.title}
        </Link>
      </div>

      {/* 3. source */}
      <div className="min-w-0 flex items-center gap-1">
        <span className="truncate text-slate-400" title={post.sourceName}>
          {post.sourceTier === 1 && post.exchange ? post.exchange : post.sourceDomain}
        </span>
        {count > 1 && (
          <span
            className="shrink-0 rounded border border-slate-600 px-1 text-[10px] text-slate-400"
            title={`${count} sources`}
          >
            +{count - 1}
          </span>
        )}
      </div>

      {/* 4. tickers */}
      <div className="min-w-0 flex items-center gap-1">
        {tickers.map((t) => (
          <Link
            key={t.ticker}
            href={`/coin/${t.ticker}`}
            onClick={(e) => e.stopPropagation()}
            title={`Open ${t.ticker} coin page`}
            className={`shrink-0 rounded border px-1 text-[10px] hover:brightness-125 ${SENTIMENT_CHIP[post.sentiment]}`}
          >
            ${t.ticker}
          </Link>
        ))}
        {extraTickers > 0 && (
          <span className="shrink-0 text-slate-500">+{extraTickers}</span>
        )}
      </div>

      {/* 5. tags */}
      <div className="min-w-0 flex items-center gap-1.5">
        {cat.label && (
          <span
            className={`shrink-0 rounded border px-1 text-[10px] ${cat.cls}`}
          >
            {cat.label}
          </span>
        )}
        <span className="shrink-0 font-mono text-slate-400">{maxImportance}</span>
        <span
          className={`shrink-0 rounded border px-1 text-[10px] ${
            isFresh(post, now)
              ? "text-emerald-400 border-emerald-500/40"
              : "text-slate-600 border-slate-700"
          }`}
        >
          {fmtAge(age)}
        </span>
        {post.ret5m != null && (
          <span
            className={`shrink-0 font-mono ${
              post.moved5m ? "font-bold " : ""
            }${
              post.ret5m > 0
                ? "text-emerald-400"
                : post.ret5m < 0
                  ? "text-rose-400"
                  : "text-slate-400"
            }`}
          >
            5m {fmtRet(post.ret5m)}
          </span>
        )}
      </div>

      {/* 6. mark */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="mark as catalyst"
          disabled={busy}
          onClick={() => setLabel("catalyst")}
          className={`h-5 w-5 flex items-center justify-center rounded hover:bg-slate-700 disabled:opacity-40 ${
            post.userLabel === "catalyst" ? "text-emerald-400" : "text-slate-500"
          }`}
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          type="button"
          title="dismiss"
          disabled={busy}
          onClick={() => setLabel("dismiss")}
          className={`h-5 w-5 flex items-center justify-center rounded hover:bg-slate-700 disabled:opacity-40 ${
            post.userLabel === "dismiss" ? "text-rose-400" : "text-slate-500"
          }`}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export const FeedRow = memo(FeedRowImpl);