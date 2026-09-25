# Steps approved by Fable only — pending Astra catch-up review (ChatGPT Plus limit hit 2026-09-25 ~08:50 ET, resets ~10:51 ET)
User rule (2026-09-25): while ChatGPT/Astra is unavailable, Fable's approval is enough to proceed; when Astra is back, give it ALL unchecked steps in one review.

| # | Step | Review prompt / evidence | Fable verdict | Astra verdict |
|---|------|--------------------------|---------------|---------------|
| 1 | Fix round 1 for steps 1–3 (F1–F10) | build/review_fix1_prompt.md, build/p2_fix1_spec.md | CHANGES REQUIRED (2 regressions) → fixed in round 2 | PENDING |
| 2 | Fix round 2 (ETF case-insensitive, no "from" chain word, parenthetical subject order, MemoryRedis eval, details budget + Binance-only, scheduler 10-min exit, supervisor fail-closed lock + race recheck) | build/tests/fix2.test.js; run_all_tests.sh 177/177 | APPROVE (step 4 may start) | PENDING |
| 3 | Step 4 started: 24 h soak from 2026-09-25 13:09:58 UTC on the fix-round-2 code (supervisor pid 104136) | build/tests/soak_check.js (run after 24 h) | — | PENDING |

## Step 5 — frozen signal-time snapshots (Fable-only, pending Astra)
- Spec: p2_step5_spec.md (incl. FIX ROUND). Code: app/ingest/signalSnapshot.js, app/signalSnap.js. Tests: step5_signals 35/35.
- Fable round 1: CHANGES REQUIRED (late first-sight snapshots, single-object picks, Json null) → fixed; Fable round 2 in progress.

## Steps 6-7 — BWEnews, Upbit, OKX spot/swap, Coinbase (+delisting), Binance Alpha rule (Fable-only, pending Astra)
- Spec: p2_step67_spec.md. Tests: step67_sources 28/28. Live smoke OK (bwenews 13, upbit 20, okx 978/492, coinbase 427 seeded).
- 2026-09-25: Fable APPROVED step 5 (round 2) and steps 6-7 (after 2 fix rounds: bwenews reply text, dash-symbol base on restart, Coinbase delisting 3-run debounce + glitch guard, ingest.js handler). Tests: 13 suites / 267 assertions pass (incl. step5_worker on cryptonews_test, step67_debounce).
- DEPLOYED 2026-09-25 14:06:59 UTC (supervisor services: ingest, signals). 24 h soak restarted from this time. Astra review of steps 5-7 still owed.

## Neon theme (2026-09-25, cosmetic, pending Fable+Astra look)
- app/tailwind.config.ts palette remap (slate/emerald/rose/amber/cyan/sky/orange -> neon), app/src/app/globals.css glow/grid; crypto/screener/news_chip.js glow + pulsing risk chip (backup news_chip.js.pre_neon). No logic changes; build OK.
- Sahasra branding (Fable design, build/sahasra/): SahasraLotus.tsx + TopBar.tsx installed, globals.css appended, layout title. Backups *.pre_sahasra. Build OK.
- 2026-09-25: Fix round 3 (Astra B1-B9 + Fable hardening notes) Fable APPROVED; DEPLOYED 15:53:12 UTC; soak re-baselined. Astra re-review owed.
- 2026-09-25: Phase 3 step 1 (news counts, 📰 chip, stock exclusion, /api/news default 0) Fable APPROVED; DEPLOYED 16:30:47 UTC. Astra review owed.
- 2026-09-25: Phase 3 step 4A (per-coin Google News, gnews adapter, coinMatch, watchlist, store titleKey/alertable) Fable APPROVED (GO); DEPLOYED 17:02:32 UTC. Astra review owed.
- 2026-09-25: Date display fix (FeedRow Published col, PostDetail, Rising/Trending by publishedAt, /api/posts 48h window) + Phase 3 step 2 tagger recall (curated coinSources gate, freeOccurrence, people/exchange/BSC rules) Fable APPROVED; DEPLOYED 17:53 UTC. Astra review owed.

## Phase 3 steps 3-fix, 5, 4B/C, 6, 7, 8 + final fix round (cloud session 2026-09-25, Fable-only, pending Astra)
- Handoff with scope, commits and follow-ups: build/HANDOFF_phase3.md. Diff: `git diff 3295a7b..claude/laughing-cerf-6h5fd6`.
- Code written by Sonnet (cloud; GLM unreachable), each step Fable APPROVED after 0-2 fix rounds, plus a final whole-project Fable review with a live collector boot (1 blocker + 8 follow-ups fixed, re-approved).
- Tests: 30 suites; all pass in cloud except supervisor (Windows-only) and details (binance.com blocked).
- NOT YET DEPLOYED. Astra review owed for all of it.
