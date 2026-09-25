You are a senior independent reviewer (a second reviewer alongside Fable). You have READ-ONLY access to the project folder (current directory = `D:\claude projects\crypto-news-terminal`). Read files yourself; do not modify anything.

## The project
A self-hosted, CryptoPanic-style real-time crypto news system for a SOLO crypto trader on Windows 11 (low RAM, ~1–2 GB free).
- **Goal:** attach a "news on this coin ≤48 h" flag to his Binance-perp base-break trading signals.
- **The main dashboard (ShivaShakthi)** lives outside this folder, at `D:\claude projects\crypto\screener\base_break.html`. It now loads `D:\claude projects\crypto\screener\news_chip.js` (read both if you can).
- **His rule:** news only counts as a catalyst or risk if it is ≤48 h old.

## Read these first (in order)
1. `build/phase1_plan.md` — the Phase 1 plan agreed after 3 rounds between Fable (Claude) and Grok; the disputes were resolved.
2. `build/p1_evidence.md` — what was built and verified live, round by round (7 fix rounds).
3. `build/validation_p1.md` — the latest Opus ship-gate review (6/10, SHIP WITH FIXES; round 7 then fixed its critical items).
4. `build/p1_contract_ingest.md`, `build/p1_contract_ingest2.md`, `build/p1_contract_ui.md`, `build/p1_contract_chip.md` — the specs given to the code-writing model.
5. The code:
   - `app/ingest.js` and `app/ingest/**` (scheduler, http, tickers, classify, cluster, store, newsFile, discord, health, price, report, adapters/*)
   - `app/src/app/api/**`, `app/src/components/**`, `app/src/lib/**`, `app/src/store/useFeedStore.ts`
   - `app/prisma/schema.prisma`
6. The tests: `build/tests/*.js` (headline probes, scheduler/symbols unit probes, soak_check.js).

Background research (optional):
- Fable's CryptoPanic teardown: CryptoPanic sells a ~30 s refresh plus a "Panic Score" in PLUS ($49/yr). Its free API was discontinued on 2026-04-01.
- Competitors: Tree News / PhoenixNews at $500–2,500/mo.
- Fastest free sources: exchange announcement APIs > Telegram flash channels > RSS.

## What I want from you
1. **What Fable (and the plan) got RIGHT:** the design decisions you agree with, and why. Be specific.
2. **What is WRONG or RISKY** in the current design or code that the earlier reviews missed. Cite file + snippet. Verify by reading the code; do not speculate. Focus on anything that would put a WRONG news flag on a trading signal, miss a real listing/delisting/hack, or silently stop ingestion.
3. **What to ADD:** the highest-value additions for this solo trader, ranked by (trading value ÷ effort). For each give: what, why it matters for trading, the data source/endpoint (free/cheap), effort S/M/L, and risks. Consider (not limited to):
   - Telegram flash (BWEnews)
   - the Upbit private WS
   - Coinbase / OKX listings
   - token-unlock integration with his existing events tracker
   - funding/OI spike correlation
   - "news-driven vs no-news move" labels on signals
   - a hit-rate report
   - Discord alerts
   - an LLM "why it matters" for importance ≥70 only
   - the Hyperliquid listing lead/lag study
   - memory/robustness on a low-RAM Windows box (hidden launchers vs background shells)
4. **What to REMOVE or SIMPLIFY** (over-engineering).
5. **A concrete Phase 2 plan:** an ordered list of at most 8 items, with acceptance criteria for each.

## Output format (tight, no fluff)
## 1. Done right
## 2. Problems found (file + evidence + fix)
## 3. Additions ranked (table: # | addition | trading value | source | effort | risk)
## 4. Remove / simplify
## 5. Phase 2 plan (≤8 ordered items with acceptance criteria)
## 6. Verdict (one paragraph: is Phase 1 fit for live trading use as a filter/veto? Score /10)
