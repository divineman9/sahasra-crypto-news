"use client";

import { useEffect, useState } from "react";
import type { ExplainEvent } from "@/lib/explainTypes";
import { fetchExplainEvent } from "@/lib/explainApi";
import { ExplainCard } from "./ExplainCard";
import { ExplainPreview } from "./ExplainPreview";

// Fetches one explain event by id and renders the card; shows nothing on failure.
export function ExplainLoader({ id, play = true, preview = false }: { id: string; play?: boolean; preview?: boolean }) {
  const [event, setEvent] = useState<ExplainEvent | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  useEffect(() => {
    const ac = new AbortController();
    setState("loading");
    fetchExplainEvent(id, ac.signal)
      .then((e) => {
        if (ac.signal.aborted) return;
        setEvent(e);
        setState(e ? "ok" : "missing");
      })
      .catch(() => {
        if (!ac.signal.aborted) setState("missing");
      });
    return () => ac.abort();
  }, [id]);
  if (state === "loading") return <div className="ex-loading" aria-busy="true">Loading explanation…</div>;
  if (!event) return null;
  return (
    <>
      {preview ? <ExplainPreview event={event} /> : null}
      <ExplainCard event={event} play={play} />
    </>
  );
}
