# Bluesky curated Social source — research + adapter spec (Fable, 2026-09-26)

Companion to `build/reddit_alt_fable.md` (user picked "Both": keyless Reddit multireddit RSS **and** a
curated Bluesky source in the Social tab). Read-only review of `app/ingest/adapters/youtube.js`,
`reddit.js`, `telegram.js`, `config.js`, `http.js`, `scheduler.js`, `health.js`,
`src/lib/sourceTab.js` and the step-7 tests. Every number below was measured live from this PC on
2026-09-26 between ~04:20 and 04:55 UTC against `https://public.api.bsky.app` with no credentials
(≈1,100 requests total, zero 4xx/5xx other than the expected 403 on `searchPosts`).

## TL;DR (honest)

- Bluesky's crypto-native community is **thin**. Of ~330 accounts probed (every well-known CT name I
  could resolve + the crypto-bio follows of the active seeds + Bennett Tomlin's 90-member "Crypto
  Folks" list), the vast majority signed up in the Nov-2024 wave and last posted 500–1,260 days
  ago (Laura Shin, Lopp, Nic Carter, Tim Beiko, Dankrad, toly, Jesse Pollak, Coinbase, Messari,
  DefiLlama, Glassnode, Chainalysis, Paradigm, a16z… all dead or placeholder). Several
  high-follower "names" are impersonators (Hester Peirce, Brian Armstrong, Lyn Alden, Balaji,
  Arthur Hayes, Cathie Wood, zachxbt). `searchPosts` is 403 keyless, so the only viable keyless
  surface is `getAuthorFeed` on a curated allowlist.
- What *is* alive: the crypto-critics/fraud-research cluster (Cas Piancey, Bennett Tomlin, Molly
  White, David Gerard, Corey Frayer, Hilary Allen, Zeke Faux, Jacob Silverman), a handful of
  Ethereum/Bitcoin builders (Vitalik, Péter Szilágyi, Edmund Edgar, Luke Dashjr), Zcash Foundation,
  web3privacy, and two FT/Bloomberg-adjacent finance posters. **21 accounts** made the cut (table
  below). They produce **~36 original posts/day** raw, of which only **~8/day pass a crypto
  keyword filter** — most of these people also post politics/AI/personal. Recommend shipping with
  the per-account filter ON for the mixed accounts (default) so the Social tab shows ~8–12
  relevant Bluesky items/day rather than ~36 mostly off-topic ones.
- No curated **list** worth using: the only crypto list found (Bennett Tomlin's "Crypto Folks",
  `at://did:plc:qyqbfjkwwohghps2bbknj4ni/app.bsky.graph.list/3lar4g4wih523`, 90 members) is
  ~60 % dead accounts plus off-topic heavy posters (Ed Zitron, Elizabeth Lopatto, Paris Marx); its
  `getListFeed` (works keyless, 200) was 17 originals in the last 8 h, 8 of them Cas Piancey.
  Feed generators ("Crypto", 275 likes; "Crypto Twitter") are wall-to-wall bots (`aiwhale`
  "Smart Money DUMPED", MEXC listing spam, price tickers). Account allowlist it is.

## Live measurements

| Probe | Result |
|---|---|
| `app.bsky.feed.getAuthorFeed?actor=<handle or did>&filter=posts_no_replies&limit=30` | 200 keyless for every account. `filter=posts_no_replies` really does drop replies (verified: 0 `record.reply` items vs 17/30 with the default `posts_with_replies`) but **reposts are still included** as items with `reason.$type = app.bsky.feed.defs#reasonRepost` (1/30 for Cas; David Gerard's bridged Mastodon boosts arrive the same way). `limit` max 100, default 50. Lexicon: "Does not require auth". |
| `app.bsky.actor.getProfile?actor=` | 200 keyless; `did`, `followersCount`, `postsCount`, `description`. |
| `app.bsky.graph.getLists / getList / getListFeed / getActorStarterPacks / getFollows`, `app.bsky.unspecced.getPopularFeedGenerators`, `app.bsky.feed.getFeed` | all 200 keyless. |
| `app.bsky.feed.searchPosts?q=bitcoin` | **403** (Bunny CDN HTML page) — needs a session; confirms the reddit_alt finding. |
| Burst: 120 `getAuthorFeed` calls in 20.2 s (8 threads, ~6 req/s) | 120 × 200, no 429, **no `RateLimit-*` headers at all** on any response (the public AppView sits behind BunnyCDN: `Server: BunnyCDN-*`, `Cache-Control: public, max-age=30`, `CDN-Cache: MISS/EXPIRED`). No `ETag`/`Last-Modified` → `conditional: true` buys nothing. |
| Official docs (bsky.network/docs/advanced-guides/rate-limits, mirrored in the bsky-docs repo) | PDS: **3,000 req / 5 min per IP**; account write budgets irrelevant to us. For the public AppView the doc says only: "These direct endpoints do not support authentication", offer "generous rate-limits", `public.api.bsky.app` **is cached**, "contact support if limits are encountered". So: no published number for public.api.bsky.app; treat 3,000/5 min as the conservative ceiling. Our load: 21 requests per 10-min cycle = **126 req/h = 0.7 % of that ceiling**. |
| URL shape | `https://bsky.app/profile/<handle>/post/<rkey>` returns 200 for custom-domain handles (`vitalik.ca`) and for bridged `*.ap.brid.gy` handles; `<rkey>` = last path segment of `post.uri` (`at://did:plc:…/app.bsky.feed.post/<rkey>`). `profile/<did>/post/<rkey>` also resolves (handle-independent). |
| Timestamps | `record.createdAt` is client-set (author's clock; bridged Mastodon posts carry the original Mastodon time, correct); `post.indexedAt` is AppView server time, observed 1–4 s later for native posts, ~60 s for bridged. |

## Curated accounts (all verified live 2026-09-26; followers / activity from `getProfile` + `getAuthorFeed limit=100`)

`orig/7d` = original posts (no reposts, no replies) in the last 7 days; `pass` = of those, how many the
proposed `BSKY_FILTER` regex (below) keeps; `last` = age of newest original post.

| # | handle | DID | who / why | followers | orig/7d | pass | last | filter |
|---|---|---|---|---|---|---|---|---|
| 1 | cascoinfoundation.org | did:plc:gujnzolp2n4upahg3zb6u6zx | Cas Piancey — Protos writer, Crypto Critics' Corner; Tether/FTX/Deltec digging | 6,396 | 84 | 18 | 0.0 d | on |
| 2 | bft.wtf | did:plc:qyqbfjkwwohghps2bbknj4ni | Bennett Tomlin — fraud researcher (Protos, FUD Letter) | 8,650 | 32 | 2 | 0.1 d | on |
| 3 | molly.wiki | did:plc:exrxvyu6bpoym6mbnctke5tn | Molly White — Citation Needed, W3IGG | 238,192 | 3 | 0 | 3.1 d | on |
| 4 | web3isgoinggreat.com | did:plc:ugyl6syayvsrvu5w4uxtlkz4 | Web3 Is Going Just Great tracker (one post per logged incident; bursty — 30 posts over the last 100 d, none this week) | 22,236 | 0 | 0 | 18.5 d | off |
| 5 | davidgerard.circumstances.run.ap.brid.gy | did:plc:g4zvqebem5mso7y2osno5o43 | David Gerard — Attack of the 50 Foot Blockchain; bridged from Mastodon (boosts arrive as reposts) | 426 | 39 | 2 | 0.4 d | on |
| 6 | csfrayer.bsky.social | did:plc:yjcrm7o57q2hk7lixizk5tb7 | Corey Frayer — ex-SEC senior crypto policy advisor, Consumer Federation of America | 2,033 | 10 | 6 | 1.5 d | on |
| 7 | profhilaryallen.bsky.social | did:plc:4bcrv573bktwj6xw5tie2im5 | Hilary Allen — AU law prof, stablecoin/Clarity Act critic (fintechdystopia.com) | 1,682 | 4 | 1 | 1.4 d | on |
| 8 | jacobsilverman.com | did:plc:ijngmewyhu76j3aetbulfov7 | Jacob Silverman — ICIJ reporter (Easy Money co-author); Tether/laundering stories | 17,573 | 13 | 2 | 0.4 d | on |
| 9 | zekefaux.bsky.social | did:plc:om5px6rmhsd2mkqul2hjzsw5 | Zeke Faux — Bloomberg investigative (Number Go Up) | 9,272 | 1 | 0 | 0.5 d | on |
| 10 | benmckenzie.bsky.social | did:plc:eqkd2r3hrbgotsawtwqztnre | Ben McKenzie — Easy Money co-author | 14,176 | 2 | 1 | 0.2 d | on |
| 11 | davidzmorris.bsky.social | did:plc:lkmrmadl4fpy2s72emscmxgr | David Z. Morris — ex-CoinDesk chief insights columnist | 871 | 2 | 0 | 3.6 d | on |
| 12 | nikhileshde.bsky.social | did:plc:yjlivmqh63ohzgklvioiby4w | Nikhilesh De — CoinDesk managing editor, policy/courts | 1,961 | 3 | 0 | 0.1 d | on |
| 13 | staffordphilip.bsky.social | did:plc:hnnp3pc5eprmczrv5no5thgg | Philip Stafford — FT markets reporter (prediction markets, crypto market structure) | 6,626 | 6 | 2 | 0.6 d | on |
| 14 | matt-levine.bsky.social | did:plc:hthhtetujklon2c7r65cmvrq | "Money Stuff" link poster — one post per Bloomberg column; **not confirmed as Levine's own account** (41.9k followers, no bio link) | 41,887 | 3 | 1 | 1.4 d | on |
| 15 | vitalik.ca | did:plc:qmajrxvehl6ss6w2h4uuv5bg | Vitalik Buterin | 8,857 | 8 | 3 | 0.2 d | on |
| 16 | karalabe.bsky.social | did:plc:if2tug5buc5a3crz2d2i24i3 | Péter Szilágyi — ex-geth lead, dark.bio | 6,027 | 4 | 0 | 0.5 d | on |
| 17 | goat.navy | did:plc:pyzlzqt6b2nyrha7smfry6rv | Edmund Edgar — reality.eth (oracle) builder | 2,127 | 8 | 2 | 1.0 d | on |
| 18 | web3privacy.info | did:plc:3sfk2lroe4a5lm6yr3qxzd3s | Web3Privacy Now — Ethereum cypherpunk/privacy research collective (events-heavy) | 1,596 | 20 | 4 | 0.7 d | on |
| 19 | zfnd.org | did:plc:z7q7hx2lk3s2hpzjcpxfkre4 | Zcash Foundation — Zebra releases, security fixes, engineering updates | 216 | 3 | 3 | 1.7 d | off |
| 20 | lukedashjr.bsky.social | did:plc:lggtzy2odpnrgizsir4gejsw | Luke Dashjr — Bitcoin Knots releases / node-attack mitigation | 441 | 1 | 1 | 4.9 d | off |
| 21 | btcbreakdown.com | did:plc:xufmktwgylcyqth7yeoihm2l | Bitcoin Breakdown daily newsletter ("Issue #660 is live…" — low-info, kept because it is 100 % Bitcoin and daily; drop if the user finds it spammy) | 16,905 | 5 | 5 | 0.6 d | off |
| | **Total** | | | | **251 (35.9/day)** | **53 (7.6/day)** | | |

Rejected, for the record: `protos.com` / `decrypt.co` / `dlnews` / `coindesk.com` /
`crypto.news.web.brid.gy` (outlet mirrors — already in RSS or pure wire), `polymarket.com`
(~23 posts/day of market odds, not crypto discussion), `swanbitcoin.bsky.social` (marketing clips),
`katie0martin.ft.com` (macro, not crypto), `cathiew.bsky.social` (impersonator), `trmlab.bsky.social`
(3 followers, not official), `bitcoin.bsky.social` (memes, 14 d idle), `hasu.moe` / `francescoppola` /
`achow101.com` / `neerajka` / `dystopiabreaker.xyz` / `ginapieters` (all < 1 post/week or idle >
1 month), Ed Zitron / Lopatto / Paris Marx / Dan Davies / Nicholas Weaver (active but general tech
or finance).

Expected volume with the spec below (filter on for the 17 mixed accounts, off for the 4 pure
ones): **~8–12 Social items/day** (7.6 measured this week + W3IGG bursts + drift), skewed toward
Cas Piancey (≈ a third of the total — a `maxPerAccountPerRun` of 10 keeps him from dominating the
tab). Filter off everywhere would be ~36/day, ~75 % off-topic (politics, AI, personal). Noise
inside the filtered set: a few false positives per day from generic terms (`hack`, `bridge`,
`wallet`) — acceptable for a tier-4, never-alerting tab, and the "Hide low-importance" toggle
already hides tier-4 items below importance 30.

## Adapter spec — `app/ingest/adapters/bluesky.js`

Mirror the header-comment style of `youtube.js`/`reddit.js`. Exactly **one** adapter object for all
accounts (unlike youtube.js's one-per-channel), because the health table should show one `bsky:all`
row and the 21 requests share one budget.

### Constants
```
const API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';
const INTERVAL_MS = Math.max(120000, Number(process.env.BLUESKY_INTERVAL_MS) || 600000); // 10 min
const GAP_MS = 250;                 // pause between consecutive account requests
const FORTY_EIGHT_H = 48 * 3600000;
const FUTURE_SKEW_MS = 10 * 60000;  // createdAt more than 10 min in the future => use indexedAt
const PER_ACCOUNT_LIMIT = 30;       // getAuthorFeed limit param
const MAX_PER_ACCOUNT = 10;         // newest N kept per account per run (Cas Piancey cap)
const MIN_TEXT_CHARS = 20;          // "Excellent" + image is not a headline
const TITLE_MAX = 200;
const UA = process.env.BLUESKY_USER_AGENT || 'SahasraNews/1.0 (self-hosted news reader)';
```

### Config (`app/ingest/config.js`)
- New exported `BSKY_FILTER` string (same style as `CRYPTO_FILTER`/`MACRO_FILTER`, compiled with
  `new RegExp(str, 'i')` exactly as telegram.js does at line 128):
  `CRYPTO_FILTER + '|' + '\\b(BTC|ETH|SOL|XRP|USDT|USDC|Tether|Circle|Coinbase|Binance|Kraken|Bitget|Bybit|OKX|FTX|SBF|Bankman|Celsius|Do Kwon|Tornado|Roman Storm|Samourai|SEC|CFTC|Gensler|Atkins|Peirce|GENIUS Act|Clarity Act|MiCA|ETFs?|Saylor|MicroStrategy|treasury compan(y|ies)|miners?|mining|halving|hashrate|Lightning|Knots|Bitcoin Core|Solana|Ripple|Cardano|Dogecoin|memecoins?|airdrops?|rug ?pull|exploit(ed|s)?|hack(ed|er|ers|s)?|drain(ed|er)?|bridge|validators?|staking|restaking|rollups?|L2s?|zk|zero-knowledge|mainnet|smart contracts?|wallets?|self-custody|custod(y|ian)|on-?chain|DAO|Web3|Zcash|Monero|privacy coin|prediction markets?|Polymarket|Kalshi|Ponzi|pig[- ]butchering|money launder\\w*|OFAC|FinCEN|Vitalik|Ethereum Foundation|geth|Uniswap|Aave|Lido|MakerDAO|Hyperliquid|perps?|liquidat\\w+|whale)\\b'`
  (this is the exact regex the `pass` column above was measured with).
- New exported `BSKY_ACCOUNTS` array — **DID is the identity, handle is display only** (handles
  change; DIDs do not; `getAuthorFeed` accepts a DID as `actor`):
  ```
  { slug: 'caspiancey',  handle: 'cascoinfoundation.org',                    did: 'did:plc:gujnzolp2n4upahg3zb6u6zx', name: 'Cas Piancey' },
  { slug: 'bft',         handle: 'bft.wtf',                                  did: 'did:plc:qyqbfjkwwohghps2bbknj4ni', name: 'Bennett Tomlin' },
  { slug: 'mollywhite',  handle: 'molly.wiki',                               did: 'did:plc:exrxvyu6bpoym6mbnctke5tn', name: 'Molly White' },
  { slug: 'w3igg',       handle: 'web3isgoinggreat.com',                     did: 'did:plc:ugyl6syayvsrvu5w4uxtlkz4', name: 'Web3 Is Going Just Great', filter: false },
  { slug: 'davidgerard', handle: 'davidgerard.circumstances.run.ap.brid.gy', did: 'did:plc:g4zvqebem5mso7y2osno5o43', name: 'David Gerard' },
  { slug: 'csfrayer',    handle: 'csfrayer.bsky.social',                     did: 'did:plc:yjcrm7o57q2hk7lixizk5tb7', name: 'Corey Frayer' },
  { slug: 'hilaryallen', handle: 'profhilaryallen.bsky.social',              did: 'did:plc:4bcrv573bktwj6xw5tie2im5', name: 'Hilary Allen' },
  { slug: 'silverman',   handle: 'jacobsilverman.com',                       did: 'did:plc:ijngmewyhu76j3aetbulfov7', name: 'Jacob Silverman' },
  { slug: 'zekefaux',    handle: 'zekefaux.bsky.social',                     did: 'did:plc:om5px6rmhsd2mkqul2hjzsw5', name: 'Zeke Faux' },
  { slug: 'benmckenzie', handle: 'benmckenzie.bsky.social',                  did: 'did:plc:eqkd2r3hrbgotsawtwqztnre', name: 'Ben McKenzie' },
  { slug: 'dzmorris',    handle: 'davidzmorris.bsky.social',                 did: 'did:plc:lkmrmadl4fpy2s72emscmxgr', name: 'David Z. Morris' },
  { slug: 'nikde',       handle: 'nikhileshde.bsky.social',                  did: 'did:plc:yjlivmqh63ohzgklvioiby4w', name: 'Nikhilesh De' },
  { slug: 'pstafford',   handle: 'staffordphilip.bsky.social',               did: 'did:plc:hnnp3pc5eprmczrv5no5thgg', name: 'Philip Stafford' },
  { slug: 'moneystuff',  handle: 'matt-levine.bsky.social',                  did: 'did:plc:hthhtetujklon2c7r65cmvrq', name: 'Money Stuff' },
  { slug: 'vitalik',     handle: 'vitalik.ca',                               did: 'did:plc:qmajrxvehl6ss6w2h4uuv5bg', name: 'Vitalik Buterin' },
  { slug: 'karalabe',    handle: 'karalabe.bsky.social',                     did: 'did:plc:if2tug5buc5a3crz2d2i24i3', name: 'Péter Szilágyi' },
  { slug: 'edmundedgar', handle: 'goat.navy',                                did: 'did:plc:pyzlzqt6b2nyrha7smfry6rv', name: 'Edmund Edgar' },
  { slug: 'web3privacy', handle: 'web3privacy.info',                         did: 'did:plc:3sfk2lroe4a5lm6yr3qxzd3s', name: 'Web3Privacy Now' },
  { slug: 'zfnd',        handle: 'zfnd.org',                                 did: 'did:plc:z7q7hx2lk3s2hpzjcpxfkre4', name: 'Zcash Foundation', filter: false },
  { slug: 'lukedashjr',  handle: 'lukedashjr.bsky.social',                   did: 'did:plc:lggtzy2odpnrgizsir4gejsw', name: 'Luke Dashjr', filter: false },
  { slug: 'btcbreakdown',handle: 'btcbreakdown.com',                         did: 'did:plc:xufmktwgylcyqth7yeoihm2l', name: 'Bitcoin Breakdown', filter: false },
  ```
  `filter` omitted ⇒ `true` ⇒ `BSKY_FILTER` applies; `filter: false` ⇒ every post kept. (Kept as a
  boolean, not a per-account regex string, so config stays readable; a future `filter: '<regex>'`
  string override is trivial to add and telegram.js already shows the pattern.) `sourceName` is
  `'bsky:' + handle` **as configured** (task requirement), so the UI shows `bsky:vitalik.ca`;
  `slug` exists only for log lines/tests. `verified` is deliberately not a field: every entry above
  was live-verified today, but the adapter is `quietHealth: true` regardless (unauthenticated public
  surface, same reasoning as `reddit:multi`).
- Comment block above `BSKY_ACCOUNTS`: "curated 2026-09-26 (build/bluesky_spec.md); DID is the
  identity — re-check handles if a URL 404s; filter:false only for accounts that are 100 % crypto."

### `run()` algorithm (pure helpers exported for tests)
1. `const out = []; const seen = new Set(); let okCount = 0, failCount = 0, lastErr = null;`
2. For each `acct` of `BSKY_ACCOUNTS` **sequentially** (never `Promise.all`):
   - if not the first account, `await sleep(GAP_MS)` (injectable `_sleep` for tests).
   - `url = API + '?actor=' + encodeURIComponent(acct.did) + '&filter=posts_no_replies&limit=' + PER_ACCOUNT_LIMIT`
   - `try { res = await http.request(url, { ua: UA, timeoutMs: 15000 }); items = parseFeed(res.json(), acct); okCount++; } catch (err) { failCount++; lastErr = err; logAccountError(acct, err); continue; }`
     — one dead/renamed/blocked account (400 `BlockedActor`, 400 `Profile not found`, 5xx) must
     never abort the other 20. `logAccountError` is throttled to one line per account per hour
     (module-level `Map<did, lastLoggedAt>`), format `[bsky] <handle>: HTTP <status> <message>`.
   - push `items` into `out`, skipping any whose `uri` is already in `seen` (dedupe by AT URI
     across accounts — a repost is already skipped, but a quote/self-repost can surface the same
     post twice).
3. After the loop: if `okCount === 0 && failCount > 0` → `throw lastErr` (the whole poll failed,
   e.g. CDN outage — let `scheduler._backoffUntil` do its `retryAfterMs`/quietHealth 6 h thing).
   Otherwise return `out` sorted newest-first. Do **not** cap `out` globally (21 × ≤10 = ≤210 upper
   bound; realistic 10–20).

### `parseFeed(json, acct, nowMs = Date.now())` → item[]
For each `f` of `json.feed` (array; missing ⇒ `[]`), in order, stop after `MAX_PER_ACCOUNT` kept:
- **skip if `f.reason`** (any `$type`: `app.bsky.feed.defs#reasonRepost`, `#reasonPin`) — reposts
  are the other author's content, pins are stale.
- **skip if `f.reply` or `f.post.record.reply`** — defensive; `posts_no_replies` already removes
  them but the fixture proves the guard.
- `post = f.post; rec = post.record;` skip if `!post || !rec || !post.uri`.
- `text = String(rec.text || '')`; `ext = rec.embed && rec.embed.$type === 'app.bsky.embed.external' ? rec.embed.external : null`.
  If `text.trim().length < MIN_TEXT_CHARS` and `ext && ext.title` → `text = ext.title` (link-card
  posts with a bare URL as text); else if still `< MIN_TEXT_CHARS` → skip.
- `title = singleLine(text)`: collapse `\s+` to one space, trim, strip a trailing bare URL only if
  it is the last token and the remaining text is still ≥ `MIN_TEXT_CHARS` (Bluesky link posts end
  with the shortened `www.ft.com/content/5613...`), then `slice(0, TITLE_MAX)` and if truncated
  cut back to the last space and append `…`.
- **filter:** if `acct.filter !== false` and `!filterRe.test(text + ' ' + (ext ? ext.title + ' ' + ext.description : ''))` → skip
  (`filterRe = new RegExp(BSKY_FILTER, 'i')` built once at module load). The filter sees the
  *full* text + link-card title/description, not the truncated title (same lesson as telegram.js
  lines 162–165).
- **language:** if `Array.isArray(rec.langs) && rec.langs.length && !rec.langs.some(l => /^en/i.test(l))` → skip.
- **publishedAt:** `created = new Date(rec.createdAt)`, `indexed = new Date(post.indexedAt)`.
  Use `created` **unless** it is invalid or `created.getTime() > nowMs + FUTURE_SKEW_MS`, then use
  `indexed`. Why `createdAt` first: it is the author's real posting time and, for the bridged
  Mastodon account, the original toot time (indexedAt lags by ~60 s there and by however long the
  bridge was down); why the indexedAt guard: `createdAt` is client-supplied and unverified, so a
  bad clock or a deliberately future-dated post would otherwise sit at the top of the tab
  forever. If both are invalid → skip.
- **age:** skip if `publishedAt.getTime() < nowMs - FORTY_EIGHT_H`.
- `rkey = post.uri.split('/').pop()`; skip if empty.
  `url = 'https://bsky.app/profile/' + (post.author && post.author.handle || acct.handle) + '/post/' + rkey`
  — the **live** handle from the response (so a renamed account still links correctly), falling
  back to the configured one. (`store.js` dedupes on `url`; a handle change would create one
  duplicate per post for ≤48 h — accepted, since the alternative `profile/<did>/post/<rkey>` URL
  is ugly in the UI.)
- push:
  ```
  { sourceName: 'bsky:' + acct.handle, sourceTier: 4, kind: 'social', exchange: null,
    title, url, publishedAt, hintCategory: null, hintTickers: [], sourceDomain: 'bsky.app',
    alertable: false, maxImportance: 10, uri: post.uri }
  ```
  `uri` is an extra field for the in-run dedupe; **strip it** (`delete item.uri`) before returning
  from `run()` so the item shape handed to `store.js` is byte-for-byte the reddit/youtube shape.
  `kind: 'social'` routes to the Social tab via `sourceTab()`; `sourceTier: 4` engages
  `hideLowImportanceTier4`; `alertable:false` + `maxImportance:10` keep it out of chips/Discord
  exactly as youtube.js documents.

### Adapter object
```
{ name: 'bsky:all', tier: 4, intervalMs: INTERVAL_MS, quietHealth: true, run }
```
`make(accounts = BSKY_ACCOUNTS)` returns `[]` (and logs once
`[bsky] disabled (BLUESKY_ENABLED=0)`) when `process.env.BLUESKY_ENABLED === '0'`, else
`[makeAdapter(accounts)]`. Default **on** — no keys needed.

### Wiring
- `app/ingest.js`: `const bluesky = require('./ingest/adapters/bluesky');` and
  `...bluesky.make(),` after the reddit spread (gating lives inside `make()`, matching reddit's
  comment; adapter count in the startup log +1).
- `app/.env.example`: `BLUESKY_ENABLED="1"` + comment "curated Bluesky accounts in Social tab
  (config.js BSKY_ACCOUNTS), keyless public API, 1 poll per account every 10 min";
  `BLUESKY_INTERVAL_MS="600000"`, `BLUESKY_USER_AGENT=""` (optional).
- `build/HANDOFF_phase3.md`: Social tab = `reddit:multi` + `bsky:all`.
- `http.js`: no change (`ua` option already exists; no `conditional`).

### Exports
`{ make, makeAdapter, parseFeed, singleLine, buildUrl, _setSleep }` (plus `API`, `INTERVAL_MS`
for tests).

## Tests (`build/tests/p3_step7c_bluesky.test.js`, same `assert_lib`, no network, add to
`run_all_tests.sh` list; uses `fixtures/bsky_author_feed.json` through the existing `fillDates()`
helper)

Fixture tokens: `{{fresh_1h}} {{fresh_2h}} {{fresh_3h}} {{fresh_4h}} {{fresh_5h}} {{fresh_6h}}
{{fresh_7h}} {{fresh_12h}} {{fresh_47h}}` = `new Date(now - N h).toISOString()`, `{{stale_49h}}` =
now − 49 h. The fixture is a real `getAuthorFeed` for `cascoinfoundation.org` (captured with
`posts_with_replies` so it contains 2 replies), 10 items: 7 posts (one is the 9-char "Excellent"),
1 repost (`reason.$type = app.bsky.feed.defs#reasonRepost`, rkey `3mgajtkhn422v`), 2 replies
(`record.reply` present, rkeys `3mwfgi5e67s2m`, `3mwfg43yd3c2m`).

1. **Config:** `BSKY_ACCOUNTS.length === 21`; every entry has `handle`, `name`, `did` matching
   `/^did:plc:[a-z2-7]{24}$/`, unique DIDs, unique handles; exactly 4 entries have `filter === false`
   (`web3isgoinggreat.com`, `zfnd.org`, `lukedashjr.bsky.social`, `btcbreakdown.com`).
   `new RegExp(BSKY_FILTER, 'i')` compiles; it matches `'Tether froze $318k USDT'`, `'Zcash Zebra
   6.4.0 security fixes'`, `'Bitcoin Knots 29.4.2 released'`, `'the Clarity Act was a bill for the
   crypto industry'`; it does not match `'I had no idea Isabel Perón is still alive.'` nor
   `'Zebra 6.4.0 security fixes'` (verified against the regex above — which is why `zfnd.org` is
   `filter: false`).
2. **make():** default → exactly 1 adapter `{ name: 'bsky:all', tier: 4, intervalMs: 600000,
   quietHealth: true }` with a `run` function; `BLUESKY_ENABLED='0'` → `[]` and the disabled line
   printed once across two `make()` calls.
3. **parseFeed on the fixture, filter ON** (`acct = { handle: 'cascoinfoundation.org', did: 'did:plc:gujnzolp2n4upahg3zb6u6zx' }`):
   - repost `3mgajtkhn422v` absent; both replies absent (all three *would* pass the filter — their
     text mentions Tether/stablecoin — so their absence proves the reason/reply skips, not the
     filter); `3mwessqjnac2m` (49 h) absent;
     `3mwf2ntaj3k2m` ("Excellent", 9 chars) absent; `3mwf46gicgc2m` ("iced coffee discourse", no
     crypto term) absent.
   - present: `3mwffxvjfps2m` (Tether/crypto Twitter, 1 h), `3mweyhss7cs2m` (Tether's response,
     6 h), `3mwewenh3oc2m` (a16z crypto bro, 12 h); `3mwew55tkds2m` (47 h, "Chinese Communist
     spies" — no crypto term) absent with filter on.
   - every item: `sourceName === 'bsky:cascoinfoundation.org'`, `sourceTier 4`, `kind 'social'`,
     `alertable false`, `maxImportance 10`, `hintTickers` deep-equals `[]`, `sourceDomain 'bsky.app'`,
     `exchange null`, `hintCategory null`, no `uri` key after `run()` (check via the adapter, see 6),
     `url === 'https://bsky.app/profile/cascoinfoundation.org/post/' + rkey`, `publishedAt` is a
     `Date` equal to the token time (createdAt), `title` has no `\n`, `title.length <= 200`.
4. **parseFeed, filter OFF** (`acct.filter = false`): the 47 h item `3mwew55tkds2m` and the iced
   coffee post are now present; 49 h, repost, replies and the 9-char post still absent → exactly 5
   items, newest first.
5. **Timestamp fallback:** clone one fixture item, set `record.createdAt` to now + 2 h and
   `indexedAt` to `{{fresh_1h}}` → `publishedAt` equals indexedAt. Set `createdAt` to `'garbage'`
   → indexedAt. Set both invalid → item skipped.
6. **run() with injected http:** monkey-patch `http.request` (same technique as the reddit tests)
   to return the fixture for every URL; `_setSleep(() => Promise.resolve())`. Assert: exactly
   `BSKY_ACCOUNTS.length` requests; every URL starts with `API + '?actor=did%3Aplc%3A'` (DID, not
   handle), contains `filter=posts_no_replies` and `limit=30`; `opts.ua` is the default UA and
   `opts.headers` is undefined/has no Authorization; result items have no `uri` property; result
   sorted by `publishedAt` descending; items from `zfnd.org`'s call carry
   `sourceName 'bsky:zfnd.org'` even though the fixture author is Cas (proves `sourceName` comes
   from config, `url` handle from the response author).
7. **Partial failure isolation:** `http.request` throws `HttpError(400)` for the 3rd account and
   `HttpError(503)` for the 7th, succeeds otherwise → `run()` resolves, 19 accounts' items present,
   exactly 2 `[bsky]` error lines logged, and calling `run()` again immediately logs **0** new error
   lines (per-account 1 h throttle).
8. **Total failure propagates:** every request throws `{ status: 429, retryAfterMs: 42000 }` →
   `run()` rejects with that same error object (so the scheduler's `Retry-After` backoff applies).
9. **Gap:** with a recording `_setSleep`, a run over 21 accounts calls sleep exactly 20 times with
   `250`.
10. **Per-account cap:** feed a synthetic 30-post feed (all fresh, all passing) → exactly 10
    items kept, and they are the first 10 in feed order.
11. **Startup wiring:** `ingest.js` adapter list contains one name starting `bsky:`; with
    `BLUESKY_ENABLED='0'` none.
12. **Manual live smoke (once, by hand, not in the suite):**
    `node -e "require('./ingest/adapters/bluesky').make()[0].run().then(i=>console.log(i.length, i.slice(0,5)))"`
    from `app/` — expect 5–25 items, all with `bsky.app` URLs that open; then 1 h of `ingest.log`
    showing 6 `bsky:all` ticks, 0 errors.

## Concerns / open points for the user
1. **Volume is modest** (~8–12/day filtered). Bluesky simply does not have Crypto Twitter. If the
   Social tab needs more, the levers are: `filter: false` on more accounts (adds off-topic
   politics/AI), or adding the four "general but adjacent" heavy posters I left out (Ed Zitron,
   Elizabeth Lopatto, Dan Davies, Nicholas Weaver — ~50 posts/day between them, ~5 % crypto).
2. **Editorial skew:** the live Bluesky crypto voices are overwhelmingly critics/fraud reporters.
   That is useful for hack/fraud/regulatory colour and is fine for a tier-4 tab, but it is not
   market-structure or on-chain analysis (those people are on X/Telegram, both already covered).
3. `matt-levine.bsky.social` may be an unofficial Money Stuff link-poster; harmless (it links to
   bloomberg.com) but flagging it.
4. `web3isgoinggreat.com` is bursty (weeks of silence, then several per day when incidents stack) —
   expect 0 some weeks.
5. Bridged David Gerard: the bridge (`brid.gy`) can lag or drop; his boosts arrive as reposts and
   are skipped correctly. If the bridge dies, the account silently goes quiet — no error.
6. Rate limits are undocumented for `public.api.bsky.app` beyond "generous"; our 126 req/h is
   0.7 % of the PDS figure and the burst test at 6 req/s showed no throttling. Keep `GAP_MS` and
   the 10-min interval; do not parallelise.
7. Account rot: re-run the probe (`getProfile` + `getAuthorFeed`) quarterly; drop anything idle
   > 60 days. The probe script from this session lives in the scratchpad
   (`…/scratchpad/bsky/bsk.py`, `analyze()`), not in the repo.
