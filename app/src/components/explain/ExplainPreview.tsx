"use client";

import Link from "next/link";
import type { ExplainEvent } from "@/lib/explainTypes";
import { DeviMark } from "../devi";

const GLYPH = { down: "▼", up: "▲", chop: "◆" } as const;
const WORD = { down: "Lower", up: "Higher", chop: "Sideways" } as const;

// Mini preview shown first in an expanded feed row: the three scenario lines with the Tara mark + "Open card".
export function ExplainPreview({ event }: { event: ExplainEvent }) {
  const postId = event.post_ids[0];
  return (
    <div className="ex-preview" data-testid="explain-preview">
      <div className="ex-preview-head">
        <DeviMark devi="tara" size={22} play glow tooltip={false} />
        <span className="ex-preview-title">What could happen next</span>
        {postId ? (
          <Link href={`/post/${postId}`} className="ex-preview-open">Open card →</Link>
        ) : null}
      </div>
      <ul className="ex-preview-list">
        {event.text.scenarios.slice(0, 3).map((s, i) => (
          <li key={i}>
            <span className="ex-preview-dir" aria-hidden="true">{GLYPH[s.dir]}</span>
            <span className="ex-sr-only">{WORD[s.dir]}: </span>
            {s.title}
            <span className="ex-preview-tf"> · {s.timeframe}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
