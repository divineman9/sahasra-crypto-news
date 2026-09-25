# PHASE 2 · FIX ROUND 1 for steps 1–3 (union of the Fable + Astra review findings; authoritative)
CommonJS, Node 24, Prisma. New Post fields exist: `alertSentAt DateTime?`, `alertNextAt DateTime?` (plus the existing `alertState`, `alertAttempts`, `hotPublishedAt`).

## F1 tickers.js — context everywhere, safe refresh
1. Apply the SAME context check (`contextOf`: subject / venue / chain / plain) to parentheticals and to `$TICKER`s, not only to names and bare tokens.
   - Parenthetical: evaluate the context of the whole "Name (TICK)" span.
     - Text before the "(" matches CHAIN_BEFORE → chain → skip.
     - The name immediately before the "(" is itself preceded by CHAIN_BEFORE ("… hacked on Solana (SOL)") → chain → skip.
     - Text after the ")" matches VENUE_AFTER ("Hyperliquid (HYPE) lists XYZ") → venue → skip.
     - EVENT_AFTER after the ")" → subject → tag.
   - `$TICKER`: skip when chain (CHAIN_BEFORE before the $) or venue (VENUE_AFTER after it).
   - Hint tickers from adapters stay exempt.
2. Subject override for gated tokens: a bare token in (BARE_BLOCK ∩ NEEDS_GATE) = {OP, AI, ONE, GAS, SUN, ARK, SPX} that is in the universe IS tagged when `contextOf` is 'subject' ("OP hacked for $10M" → OP). All other BARE_BLOCK tokens are never tagged.
3. CHAIN_BEFORE becomes `/\b(on|across|in|via|from|of the|built on|deployed on)\s+$/`.
   CHAIN_AFTER additionally matches `\s+(dex|protocol|bridge|d?app|l2|layer[- ]?2|rollup)`, so "drain $12M from Arbitrum DEX" and "Ethereum L2 Arbitrum" do not tag ARB / ETH as the affected asset. EVENT_AFTER still wins ("Arbitrum suffers outage" → ARB subject).
4. MAX_TICKERS = 50 (bulk notices).
5. `loadUniverse({ force })`: build into new structures and swap ONLY IF the new coin list is non-empty (a valid fetch or a valid cache). On a failed fetch with no cache, keep the current indexes untouched and log `[tickers] refresh failed, keeping previous universe`.

## F2 classify.js — action-scoped sentiment, stock perps, charges
1. Negation helper: `const NEG = /\b(not|no|never|refuses? to|refused to|declines? to|declined to|won't|will not|fails? to|failed to|yet to|has not|hasn't|have not|haven't|denies|denied)\b/i`. A verb match counts as negated when NEG matches within the 25 characters before it.
2. ETF sentiment:
   - Find the FIRST (earliest-index) non-negated action among
     - bull `/\b(approv(e|es|ed|al)|launch(es|ed)?|inflows?|debut(s|ed)?|green ?light(s|ed)?)\b/gi`
     - bear `/\b(delay(s|ed)?|reject(s|ed|ion)?|den(y|ies|ied)|postpone(s|d)?|withdraw(s|n|al)?|outflows?|pulls? (out|back))\b/gi`
   - Its class decides. A negated bull action ("has not approved") → neutral. No action → neutral.
   - So "SEC approves Solana ETF after delays" → bullish; "SEC delays approval" → bearish; "Bitcoin ETFs pull in $1B" → bullish (pull in is not bearish).
3. Regulatory sentiment:
   - A favourable resolution (dismiss/drop/end/withdraw/clear/win/vacate/overturn … lawsuit/case/charges/probe) counts only if NOT negated → bullish ("Judge refuses to dismiss SEC lawsuit" → the resolution is negated → falls through to bearish).
   - Then bearish on `/\b(lawsuit|sued|sues|charged|charges (against|filed|over)|faces? charges|criminal charges|indict(ed|ment)?|ban(s|ned)?|fined|sanction(s|ed)?|probe|investigat(es|ion|ing)|subpoena(s|ed)?)\b/i`, else neutral.
   - Also in the regulatory CATEGORY regex, replace bare `charges?` with `charged|charges (against|filed|over)|faces? charges|criminal charges`, so "Binance charges zero fees" is not regulatory.
4. Tokenized-stock instruments: if the title matches `/\b(stock (index )?perp(etual)?s?|hot stock|tokenized stocks?|xstocks?|bstocks?|pre-ipo)\b/i`, set category 'other', importance 30, sentiment neutral (these are not crypto catalysts).

## F3 adapters/symbols.js — flood cap and persistence order
1. In the new-symbol loop: create each KnownSymbol row with `pendingEmit: false`, and add the symbol to `known` ONLY AFTER the create succeeded (a failed create is retried next cycle). Collect new bases as `{ base, symbol }`.
2. AFTER the loop:
   - If `newBases.length > 10` → log the flood message and emit nothing (rows stay `pendingEmit: false`).
   - Else, if `newBases.length > 0` → `prisma.knownSymbol.updateMany({ where: { venue, symbol: { in: newBases.map(b => b.symbol) } }, data: { pendingEmit: true } })`.
3. Then the pending loader emits all `pendingEmit: true` rows (as now). A flood therefore emits 0 items this run AND on later runs.

## F4 store.js — acks, revisions, eligibility with the post
1. Symbol ack on the duplicate path: when the url is already known and `raw.kind === 'symbol'` and `raw.symbolRef` is set → run the same knownSymbol ack update (`pendingEmit: false`, `emittedAt: now`), errors caught.
2. Revisions:
   - Compare NORMALIZED titles (`normalize()` from cluster.js). Ignore a revision if the normalized title is unchanged, or if this url was already revised less than 10 minutes ago (in-memory Map url → lastRevisedAt).
   - On revision also set `priceTicker: tickers[0] || null` when the stored `priceStatus` is 'pending'.
   - Return the revised DTO with a property `revised: true` (instead of null), so the caller can re-evaluate alerts.
3. Alert eligibility with the post:
   - `Store` accepts an optional `alerts` in its constructor, and `save(raw, opts = {})` receives `opts.warm`.
   - Before `prisma.post.create`, compute `const eligible = this.alerts ? this.alerts.isEligible({ tickers, importance: cls.importance, publishedAt: raw.publishedAt }, !!opts.warm) : false;` and include `alertState: eligible ? 'pending' : null` in the create data (atomic with the post).
   - For a revision: if the revised post is eligible and its alertState is null → update it to 'pending'.

## F5 discord.js — durable delivery, no duplicates, no Redis dependency
1. `isEligible({ tickers, importance, publishedAt }, warm)`: pure, synchronous. It is the same rule as before (webhook set, warm, importance ≥ 70, published ≤ 48 h, tickers ∩ portfolio). `enqueue(dto, { warm })` becomes a thin wrapper: if eligible and the post's alertState is null → set 'pending'. DB errors are RE-THROWN (not swallowed).
2. Worker tick:
   - Select pending posts where `alertNextAt` is null or ≤ now, ordered by firstSeenAt asc, take 10.
   - For each post, story dedupe comes from the DATABASE, not Redis: if another post with the same storyId (or id) has `alertState: 'sent'` and `alertSentAt` ≥ now − 30 min → set 'skip'.
   - Otherwise:
     1. Set `alertState: 'sending'`.
     2. POST.
     3. On success → `alertState 'sent'`, `alertSentAt` now.
   - On failure:
     - `alertAttempts += 1`
     - `alertState` back to 'pending'
     - `alertNextAt = now + min(2^attempts, 60)` minutes
     - After 24 h since firstSeenAt → 'failed'
   - A 429 stops the tick and respects retryAfterMs.
3. Uncertain deliveries: at worker start (first tick), any post left in 'sending' (a crash between the POST and the DB update) → set 'uncertain' and never resend automatically (at-most-once).
4. `healthAlert(name, text)`:
   - Skip if `redis.exists('alert:health:' + name)`.
   - Otherwise POST, and set the key (EX 1800) ONLY AFTER a successful POST.
   - Failures are caught and logged.

## F6 republish.js + store — idempotent hot list
- Add the module `ingest/hotListUpsert.js` exporting `async function hotUpsert(redis, id, json)`. It runs one Lua script via `redis.eval(SCRIPT, 1, 'news:hot', id, json, 1000)`:
  1. Remove every list entry whose decoded `.id` equals ARGV[1] (use `cjson.decode` in `pcall`, then `LREM` the exact string).
  2. `LPUSH` ARGV[2].
  3. `LTRIM` to ARGV[3]-1.
  4. `PUBLISH news:new` ARGV[2].
  5. Return 1.
- MemoryRedis must implement this exact script semantically: when `eval` is called with numKeys 1 and the key 'news:hot', do the dedupe-by-id + lpush + ltrim on its in-memory list and return 1. Detect it by a marker comment `--hotUpsert` inside the script.
- Use `hotUpsert` in `store.js` (instead of the multi lpush/ltrim/publish) and in `republish.js`, so a retry never creates a second entry for the same post.

## F7 scheduler.js / newsFile.js / price.js — no overlapping saves, honest health
1. scheduler: keep `state.itemsInflight` (the promise of the current onItems call, cleared in finally). If the previous onItems has not settled (it timed out but is still running), skip fetching this cycle (log once per stuck period) and reschedule after intervalMs.
2. newsFile `buildHealth`: an adapter is also stale when `(consecutiveSaveErrors || 0) >= 3` (it fetches OK but cannot save).
3. price.js: a non-overlap guard (`running` flag) around each run.

## F8 supervisor.js — real single instance, real rotation, status
1. Lock: create `logs/supervisor.pid` with `fs.openSync(path, 'wx')` (atomic exclusive create).
   - On EEXIST, read the pid. If that pid is alive AND its image is node.exe → print "already running" and exit 0. Check the image with `child_process.execFileSync('tasklist', ['/FI', 'PID eq ' + pid, '/FO', 'CSV', '/NH'])` and look for `"node.exe"`.
   - Otherwise it is a stale lock → unlink it and retry the exclusive create ONCE. If that fails, exit 0.
2. Rotation inside the write path:
   - Keep a byte counter per open log stream.
   - When a write would push it over 5 MB: close the stream, shift `.2→.3`, `.1→.2`, `name.log→.1` (deleting `.3` first), and open a fresh `name.log`.
   - The generations must really advance: `.1` becomes `.2`, and so on.
3. Call `writeStatus()` once at startup, and make the 60 s interval actually call it.

## F9 build/tests/soak_check.js (test tool, orchestrator-owned) — handled separately (no ioredis; health from news_live.json and logs/status.json).

## F10 NEW ingest/details.js — affected assets for important notices whose title names no coin (Astra blocking #3)
`async function detailTickers(raw, { timeoutMs = 8000 } = {})` → string[] (uppercase bases, deduped, max 50, EXCLUDE-filtered using tickers.js EXCLUDE semantics: never USDT/USDC/FDUSD/USD/EUR/TRY/BTC-as-quote).
- Binance (`raw.sourceName === 'binance-cms'`): the article code is the last path segment of `raw.url` (…/announcement/detail/<code>). GET `https://www.binance.com/bapi/composite/v1/public/cms/article/detail/query?articleCode=<code>` via `request()` (browser UA). Body text = `JSON.stringify(json.data.body)`. Extract (a) pairs `/\b([A-Z0-9]{2,15})\/(USDT|USDC|FDUSD|BTC|ETH|BNB|TRY|EUR)\b/g` → group 1, (b) concatenated pairs `/\b(?:1000000|1000)?([A-Z0-9]{2,15}?)(USDT|USDC|FDUSD)\b/g` → group 1, (c) parentheticals `/\(([A-Z0-9]{2,15})\)/g` → group 1.
- Any other exchange item (`raw.kind === 'exchange'`): GET `raw.url` (follow redirects, browser UA, timeoutMs), strip `<script>`/`<style>` blocks and all tags. Extract ONLY pairs (a) and (b) — NOT parentheticals (site navigation contains generic "(BTC)" etc.).
- Strip leading 1000/1000000 from bases. Return [] on any error (log once `[details] <source> <msg>`).
Exported also `extractFromText(text, { parentheticals })` (pure; used by tests).

Store integration (store.js, new-post path): after tagging, if `raw.kind === 'exchange'` and `tickers.length === 0` and `cls.category` is 'listing', 'delisting' or 'maintenance' → `const extra = await detailTickers(raw)`; if non-empty, use `tickers = extra` (then re-run `classify(raw, tickers)` so importance/sentiment rules see the tickers) before creating the post. Keep everything else.
