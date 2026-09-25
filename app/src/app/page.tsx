"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { LeftSidebar } from "@/components/LeftSidebar";
import { NewsFeed } from "@/components/NewsFeed";
import { RightSidebar } from "@/components/RightSidebar";

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="p-4 font-mono text-xs text-slate-500">loading terminal…</div>;
  }

  return (
    <div className="flex h-screen flex-col p-4">
      <TopBar />
      <div className="mt-2 grid grid-cols-[220px_minmax(0,1fr)_280px] min-h-0 flex-1 border border-slate-800 rounded">
        <aside className="overflow-y-auto border-r border-slate-800">
          <LeftSidebar />
        </aside>
        <main className="overflow-y-auto">
          <NewsFeed />
        </main>
        <aside className="overflow-y-auto border-l border-slate-800">
          <RightSidebar />
        </aside>
      </div>
    </div>
  );
}