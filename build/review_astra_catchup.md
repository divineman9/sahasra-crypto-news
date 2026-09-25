VERDICT: CHANGES REQUIRED

| Earlier blocking finding | Status | Code and test evidence |
|---|---|---|
| 1. Inconsistent context tagging | **PARTIAL** | Reported parenthetical, venue and bare-OP examples are addressed in [tickers.js:278](<D:/claude projects/crypto-news-terminal/app/ingest/tickers.js:278>) and `:363`; assertions: `fix1.test.js:25–30`, `fix2.test.js:22–30`. Hints still bypass context at `tickers.js:258`, explicitly permitted by the narrower F1 spec. |
| 2. Reversed sentiment | **PARTIAL** | Original examples and title-case ETF regression are addressed; assertions: `fix1.test.js:43–48`, `fix2.test.js:14–19`. Passive negation remains wrong at [classify.js:77](<D:/claude projects/crypto-news-terminal/app/ingest/classify.js:77>). See blocker 2. |
| 3. Incomplete detail extraction | **PARTIAL** | Binance extraction exists at [details.js:114](<D:/claude projects/crypto-news-terminal/app/ingest/details.js:114>); assertions: `details.test.js:7–14`, `fix2.test.js:39–47`. Failed extraction is not retried, body-only revisions are ignored, and title revisions can erase extracted assets. See blocker 3. |
| 4. Symbol recovery failures | **PARTIAL** | Normal flood suppression, failed-create retry and cached duplicate acknowledgement are addressed; assertions: `fix1.test.js:69–76,105–110`. [symbols.js:254](<D:/claude projects/crypto-news-terminal/app/ingest/adapters/symbols.js:254>) still commits discovery separately from pending eligibility. See blocker 4. |
| 5. Discord queue/deduplication | **PARTIAL** | Atomic initial eligibility, database dedupe, backoff and successful-health-POST dedupe exist; assertions: `fix1.test.js:94–98,112–134`. Delivery acknowledgement failure and revisions still permit duplicate sends. See blocker 1. |
| 6. Non-idempotent republishing | **FIXED** | [hotListUpsert.js:10](<D:/claude projects/crypto-news-terminal/app/ingest/hotListUpsert.js:10>) removes matching IDs atomically; [redisOptional.js:124](<D:/claude projects/crypto-news-terminal/app/ingest/redisOptional.js:124>) implements equivalent list behavior. Assertions: `fix1.test.js:80–87`, `fix2.test.js:33–37`. UI upserts also deduplicate by ID. |
| 7. Overlapping saves/misleading health | **FIXED** for the reported failures | [scheduler.js:87](<D:/claude projects/crypto-news-terminal/app/ingest/scheduler.js:87>) retains unresolved saves and exits after a prolonged hang; [newsFile.js:64](<D:/claude projects/crypto-news-terminal/app/ingest/newsFile.js:64>) includes repeated save failures; `price.js:77` guards overlap. Assertions: `step3_scheduler.test.js:14–17`, `fix1.test.js:137–150`. Health caveat below. |
| 8. Failed refresh erases indexes | **FIXED** | [tickers.js:161](<D:/claude projects/crypto-news-terminal/app/ingest/tickers.js:161>) swaps only a nonempty replacement and retains added bases. Assertion: `fix1.test.js:34–40`. |
| 9. Supervisor locking/log rotation | **PARTIAL** | Rotation generations and status updates are implemented; assertions: `supervisor.test.js:21–39`. Stale-lock recovery still has a race that the delayed ownership check cannot eliminate. See blocker 5. |

These are **static-review conclusions**. I read the code and tests; I did not execute tests, write files, or access the database. The reported 177/177 and subsequent 267 assertions are not independently rerun results.

| Pending item | Verdict |
|---|---|
| Fix round 1 | **CHANGES REQUIRED** — blockers 1–5 remain in the current code. |
| Fix round 2 | **CHANGES REQUIRED** overall. Its two named regressions—ETF capitalization and `"from"` context—are fixed. |
| Step 4: soak start | **CHANGES REQUIRED** — I do not agree that this code clears the gate. Fix the blockers, validate the scenarios below, deploy, and restart the soak. |
| Step 5: frozen snapshots | **CHANGES REQUIRED** — blocker 6. |
| Step 6: BWEnews | **CHANGES REQUIRED** — blocker 7. |
| Step 7: Upbit | **APPROVED** within the specified mapping contract. |
| Step 7: OKX spot/swap | **CHANGES REQUIRED** — shared symbol durability, blocker 4. |
| Step 7: Coinbase | **CHANGES REQUIRED** — blockers 4 and 8. |
| Step 7: Binance Alpha classifier rule | **CHANGES REQUIRED** — blocker 9. |
| Neon theme | **APPROVED** by source review; the chip backup diff is cosmetic and includes reduced-motion support. |
| Sahasra header, lotus and icon | **APPROVED** by source review; visual/browser validation was not performed. |

**Blocking issues**

1. **Discord can resend successfully delivered alerts.**  
   [discord.js:140](<D:/claude projects/crypto-news-terminal/app/ingest/discord.js:140>) catches both POST failures and failures writing `sent`. If Discord returns success but the database acknowledgement fails, the catch changes the row back to `pending`; the next eligible attempt sends again.

   There is a second regression: [ingest.js:77](<D:/claude projects/crypto-news-terminal/app/ingest.js:77>) enqueues revisions, but [serialize.js:13](<D:/claude projects/crypto-news-terminal/app/lib/serialize.js:13>) omits `alertState`. Consequently, `discord.js:61` treats a previously sent revision as unqueued and overwrites it with `pending`. The dedupe query excludes that same post.

   **Exact fix:** separate delivery from acknowledgement handling; successful or ambiguous delivery must not return to the automatic-send queue. Make enqueue a database conditional transition from `alertState: null`, preserving sent/sending/uncertain states. Treat unresolved deliveries as reservations for their story. Add tests for successful POST plus failed acknowledgement, and revision of an already-sent post.

2. **Passive negation still produces bullish regulatory sentiment.**  
   [classify.js:77](<D:/claude projects/crypto-news-terminal/app/ingest/classify.js:77>) checks negation before the *beginning of the entire match*, which starts with `lawsuit`/`case`, rather than before the resolution verb.

   **Scenario:** `SEC lawsuit was not dismissed` matches `REG_BULL_RE_2`; the text before `lawsuit` contains no negation, so it returns bullish. Existing tests cover “refuses to dismiss,” not this construction.

   **Exact fix:** locate the resolution verb within both regulatory patterns and evaluate negation scoped to that verb/clause. Add passive positive and negative fixtures, including “was not dismissed” and “has never been withdrawn.”

3. **Detail-derived assets are neither recoverable nor revision-safe.**  
   [store.js:61](<D:/claude projects/crypto-news-terminal/app/ingest/store.js:61>) returns immediately for unchanged titles. Extraction only happens on the new-post path at `:110`.

   **Scenarios:** a temporary detail-fetch failure permanently leaves a generic notice untagged; a material body edit with the same title is ignored; changing a generic notice’s title after successful extraction retags from the title alone and replaces its instruments with an empty set at `:81`.

   **Exact fix:** persist detail-enrichment status and retry failures/budget deferrals independently of title deduplication. Track material body changes, apply enrichment on revisions, and preserve existing detail-derived instruments until a successful replacement is available. Preserve publication/observation clocks. Add tests for all three paths. Binance-only scope does not resolve these failures.

4. **Symbol discovery can commit without durable pending work.**  
   [symbols.js:254](<D:/claude projects/crypto-news-terminal/app/ingest/adapters/symbols.js:254>) creates rows with `pendingEmit: false` and updates the in-memory known sets; only afterward does `:269` flag pending rows.

   **Scenario:** a crash between those operations leaves a permanently known, nonpending symbol. A failed pending update followed by failed post saving has the same outcome. Additionally, flood size counts successful inserts: 15 discovered bases with five failed inserts can emit ten, then five on retry.

   **Exact fix:** compute the complete new-base batch and flood decision before persistence. Commit discovery and its pending/suppressed disposition together, then update memory after commit. Emit/retry from durable records. On a duplicate-URL database conflict, reconcile the existing post and symbol acknowledgement even when the URL is outside the 5,000-entry memory cache. Add crash-boundary, pending-update-failure, partial-flood-write and uncached-duplicate tests.

5. **Supervisor stale-lock recovery remains racy.**  
   [supervisor.js:64](<D:/claude projects/crypto-news-terminal/app/supervisor.js:64>) reads the old owner and later unconditionally unlinks the pathname at `:70`.

   **Concrete interleaving:** starters A and B read a stale PID; B pauses; A replaces the lock, passes the 200-ms check and starts ingestion; B resumes, deletes A’s lock, acquires its own, and starts another ingestion process. `supervisor.test.js` starts its second instance after four seconds and does not exercise this race.

   **Exact fix:** use an OS-backed exclusive lock held throughout supervisor lifetime, or equivalent serialized ownership-safe acquisition and stale recovery. Release only owned locks; remove the unconditional shutdown unlink at `:324`. Test the interleaving with B delayed beyond A’s startup check.

6. **Step 5 still admits news observed after the signal.**  
   [signalSnapshot.js:40](<D:/claude projects/crypto-news-terminal/app/ingest/signalSnapshot.js:40>) filters against snapshot `now`, without comparing either item timestamp with `watcherSeenAt`. The five-minute allowance at `:125` then permits `coverage: 'news'`.

   **Scenario:** signal at 12:00, news first published/observed at 12:02, snapshot captured at 12:03. The result is `late: false`, `coverage: 'news'`, permanently attributing later news to the earlier signal. The freeze test only changes news *after a row already exists*.

   **Exact fix:** distinguish signal-time qualifying items from later visible items. Derive signal-time coverage/risk only from items whose valid publication and observation times establish availability by the signal timestamp; retain later items separately if needed. Use `unknown` where historical coverage cannot be established. Also set snapshot `firstSeenAt` when building the original payload: currently [schema.prisma:94](<D:/claude projects/crypto-news-terminal/app/prisma/schema.prisma:94>) defaults it to eventual insertion time, so retries misdate first observation. Test delayed first capture and failed-create retry.

7. **BWEnews suppresses retries before persistence succeeds.**  
   [bwenews.js:154](<D:/claude projects/crypto-news-terminal/app/ingest/adapters/bwenews.js:154>) records `lastHash` before downstream saving.

   **Scenario:** the adapter returns important items, saving fails, and the page remains unchanged. Subsequent polls return `[]`; clearing the HTTP conditional cache does not clear this hash. Items can disappear from the Telegram page before another successful attempt. Equal-length text edits also retain the same hash.

   **Exact fix:** cache only successfully acknowledged batches, or return unchanged parsed items and let Store deduplicate. Hash actual content when detecting edits. Add an unchanged-page save-failure recovery test and an equal-length correction test.

8. **Coinbase delistings are lost on save failure.**  
   [symbols.js:219](<D:/claude projects/crypto-news-terminal/app/ingest/adapters/symbols.js:219>) marks a base emitted before its post is saved. These items have no durable pending record or acknowledgement reference.

   **Scenario:** the third missing run emits a delisting; post creation fails. Later runs suppress it through `delistedEmitted`. Restarting also cannot recover it because the first successful poll silently establishes a new baseline.

   **Exact fix:** persist a pending delisting event with stable identity and detection time before considering it emitted. Retry until Store acknowledges the committed post. Keep the three-run debounce and glitch guard. Add save-failure and restart recovery tests; current debounce tests only inspect returned arrays.

9. **The Alpha rule suppresses genuine risk headlines.**  
   [classify.js:127](<D:/claude projects/crypto-news-terminal/app/ingest/classify.js:127>) returns before hack/delisting detection whenever the title contains “alpha listing.”

   **Scenario:** `Token hacked after Binance Alpha listing` becomes `other / 30 / neutral`, suppressing the hack risk.

   **Exact fix:** apply the Alpha downgrade to listing classification only, after preserving independent hack, delisting and other material-risk actions. Add mixed-event fixtures alongside the existing pure Alpha-announcement test.

**Non-blocking notes**

- The ledger’s current soak baseline is **2026-09-25 14:06:59 UTC**, superseding 13:09:58. The inspected status file records ingest starting at 14:06:59.843 and signals at 14:07:04.863, both with zero restarts. These blockers require a new baseline after remediation.
- F1 explicitly exempts adapter hints from context checks. That narrows the original finding rather than fully satisfying it; I have not treated the exemption alone as a new blocker.
- `newsFile.js:55` calculates `tier1Ok` without save failures, although overall `health.ok` includes them. Also, a hung save can retain apparently healthy fetch status until restart. Align the health counters with completed processing.
- Supervisor rotation calls `stream.end()` without waiting for closure before renaming. The existing test covers ordinary paced writes, not queued-write rotation failures.
- The test changes are generally meaningful, and test-database isolation is explicit. Their passing totals do not cover the failure boundaries listed above.
- Cosmetic approval is limited to code inspection. Narrow-screen header layout and rendered readability still need a browser check.

No files or database state were modified.
