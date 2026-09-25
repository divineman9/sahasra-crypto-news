"""Opus ship-gate for Phase 1 (real feeds)."""
import sys, re
from pathlib import Path
sys.path.insert(0, r"D:\claude projects")
from agents import ask_claude
ROOT = Path(r"D:\claude projects\crypto-news-terminal"); APP = ROOT / "app"
paths = ["ingest.js", "lib/serialize.js", "prisma/schema.prisma"] + [str(p.relative_to(APP)).replace("\\", "/") for p in sorted((APP / "ingest").rglob("*.js"))] + \
    ["src/lib/filters.ts", "src/lib/since.ts", "src/lib/hotList.ts", "src/lib/ui.ts", "src/hooks/useLabel.ts", "src/app/api/news/route.ts", "src/app/api/news/flags/route.ts",
     "src/app/api/posts/[id]/label/route.ts", "src/app/api/posts/route.ts", "src/components/FeedRow.tsx", "src/components/NewsFeed.tsx", "src/components/PostDetail.tsx", "src/store/useFeedStore.ts"]
files = [f"### {p}\n```\n{(APP / p).read_text(encoding='utf-8', errors='replace')}\n```" for p in paths]
files.append("### crypto/screener/news_chip.js\n```\n" + Path(r"D:\claude projects\crypto\screener\news_chip.js").read_text(encoding="utf-8") + "\n```")
plan = (ROOT / "build" / "phase1_plan.md").read_text(encoding="utf-8")
evidence = (ROOT / "build" / "p1_evidence.md").read_text(encoding="utf-8")
prompt = f"""You are the final ship-gate validator. Review the Phase 1 "real news feeds" implementation of a self-hosted crypto news terminal for a solo trader.

AGREED PHASE 1 PLAN (Fable + Grok, verified):
{plan}

LIVE VERIFICATION BY THE ORCHESTRATOR:
{evidence}

SOURCE ({len(files)} files):
{chr(10).join(files)}

Validate: correctness bugs (async/races, Prisma queries, Redis, timezone/timestamps, clustering, ticker tagging edge cases), rate-limit/ban risk of the polling design, error handling that could silently stop ingestion, data-quality risks that would put a WRONG news flag on a trading signal, security of the new API routes, and fidelity to the plan. Cite file + line/snippet for each issue; do not report things that are fine; mark anything unverifiable.
Output:
## Validation Score: X/10
## Passed Checks
## Failed Checks
## Critical Issues (must fix before shipping)
## Nice-to-have Improvements
## Ship Decision: SHIP / SHIP WITH FIXES / DO NOT SHIP"""
print(f"files={len(files)} chars={len(prompt)}", file=sys.stderr)
report = ask_claude(prompt, max_tokens=5000, model="claude-opus-5-5")
(ROOT / "build" / "validation_p1.md").write_text("# Phase 1 validation\n\n" + report, encoding="utf-8")
s = re.search(r"Validation Score:\s*(\d+(?:\.\d+)?)/10", report); d = re.search(r"Ship Decision:\s*(.*)", report)
print(f"SCORE={s.group(1) if s else '?'} DECISION={d.group(1).strip() if d else '?'}")
