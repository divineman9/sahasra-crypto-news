import type { ExplainEvent } from "@/lib/explainTypes";
import { GlossaryTerm } from "./GlossaryTerm";
import { glossaryFor } from "@/lib/glossary";

const sign = (n: number): string => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

// Plain text, no Devi: "Volatility: high" only when the heat level is high. Private funding / OI line only
// when the API returned heat.private (EXPLAIN_PRIVATE).
export function HeatBadge({ heat }: { heat: ExplainEvent["heat"] }) {
  const p = heat.private;
  const fr = glossaryFor("funding rate", true);
  const oi = glossaryFor("open interest", true);
  if (heat.level !== "high" && !p) return null;
  return (
    <div className="ex-heat-row">
      {heat.level === "high" ? (
        <span className="ex-heat" data-level="high">
          Volatility: high{heat.range_24h_pct != null ? ` (24h range ${heat.range_24h_pct}%)` : ""}
        </span>
      ) : null}
      {p && (p.funding_1h != null || p.oi_chg_24h != null) && fr && oi ? (
        <span className="ex-muted ex-heat-private">
          {p.funding_1h != null ? <><GlossaryTerm entry={fr}>Funding rate</GlossaryTerm> {sign(p.funding_1h)}%</> : null}
          {p.funding_1h != null && p.oi_chg_24h != null ? " · " : ""}
          {p.oi_chg_24h != null ? <><GlossaryTerm entry={oi}>Open interest</GlossaryTerm> {sign(p.oi_chg_24h)}% (24h)</> : null}
        </span>
      ) : null}
    </div>
  );
}
