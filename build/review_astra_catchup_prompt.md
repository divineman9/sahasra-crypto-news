You are Astra, the second step-gate reviewer (alongside Fable). While you were unavailable (ChatGPT usage limit), the user allowed the build to proceed on Fable's approval alone. Now review ALL the steps you have not checked, listed in `build/astra_pending_review.md`. Read-only: do not modify anything.

Context:
- Your own earlier review of steps 1–3 is `build/review_steps1-3_astra.md` (9 blocking findings).
- The fix specs are `build/p2_fix1_spec.md` (F1–F10); fix round 2 is described in the ledger.
- Tests (isolated DB `cryptonews_test`): `build/tests/*.test.js`, run via `build/tests/run_all_tests.sh`; the last run was 177/177. You cannot write files or the DB, so verify by reading the code and tests.
- Fable's verdicts: fix round 1 → CHANGES REQUIRED (2 regressions: title-case ETF regex; "from" chain word) → fixed in round 2 → Fable APPROVE.
- Live: the supervisor has been running the round-2 code since 13:09:58 UTC; the 24 h soak (step 4) is in progress.

Questions:
1. For each of your 9 earlier blocking findings: FIXED / NOT FIXED / PARTIAL, with evidence (file:line, test).
2. Any new bug or regression in fix rounds 1–2 (file:line and a concrete scenario)?
3. Do you agree with Fable that the soak (step 4) could start? If not, what must change? (If a code change is needed, the soak will restart.)

Output: first line `VERDICT: APPROVE` or `VERDICT: CHANGES REQUIRED`; then the finding table; blocking issues (numbered: file:line, evidence, exact fix); non-blocking notes.

ALSO REVIEW (added 10:52, Fable-approved, deployed 14:07 UTC): see astra_pending_review.md sections "Step 5" and "Steps 6-7".
- Step 5 frozen signal snapshots: build/p2_step5_spec.md (incl. FIX ROUND), app/ingest/signalSnapshot.js, app/signalSnap.js, SignalSnapshot model in app/prisma/schema.prisma, supervisor 'signals' service; tests build/tests/step5_signals.test.js, step5_worker.test.js.
- Steps 6-7 sources: build/p2_step67_spec.md, app/ingest/adapters/bwenews.js, upbit.js, symbols.js (OKX/Coinbase + delisting 3-run debounce), classify.js Alpha rule; tests step67_sources.test.js, step67_debounce.test.js.
- Cosmetic: neon theme (app/tailwind.config.ts, app/src/app/globals.css, crypto/screener/news_chip.js) and Sahasra header (app/src/components/TopBar.tsx, SahasraLotus.tsx, app/src/app/icon.svg).
Give a verdict per item (APPROVED / CHANGES REQUIRED with blocking issues).
