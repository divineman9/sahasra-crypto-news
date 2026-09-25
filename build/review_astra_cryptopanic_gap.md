**WHY:** Sahasra currently collects a narrow slice of crypto news, then filters it aggressively; CryptoPanic mixes many more publishers, X posts, blogs, videos, and broader financial stories. Its current list includes AMBCrypto, CryptoPotato, Coinpaper, Daily Hodl, WatcherGuru, Reuters Business, and video—several categories Sahasra doesn’t ingest. Sahasra also misses some valid coin tags, hides lower-scored articles from dashboard chips, and initially loads only 50 posts. **A much broader, useful alternative is achievable without paid data subscriptions**, especially for your traded altcoins. Complete coverage, dependable free X ingestion, and CryptoPanic’s community activity are not realistic promises. CryptoPanic itself does not contain “all news.” [Current CryptoPanic list](https://cryptopanic.com/)

Read-only review completed. **Verification limitation:** shell networking was blocked, no browser was available, and the web reader rejects RSS/XML bodies. Below I distinguish checked endpoint responses from fully parsed, live-verified feeds; I cannot honestly certify the requested 20–40 feeds as production-ready.

**1. The priority finding: actual altcoin coverage**

At **September 25, 11:05 a.m. ET**, I read `setups[].symbol` and queried PostgreSQL inside a **READ ONLY transaction**, joining posts to their tagged instruments and filtering by `publishedAt ≥ now − 48 hours`.

| Measurement | Result |
|---|---:|
| Live setup rows, including multiple timeframes | 141 |
| Distinct setup coins | 46 |
| Coins with any tagged post published within 48h | **8/46 — 17.4%** |
| Coins passing importance ≥50 and not dismissed | **3/46 — 6.5%** |
| Altcoins only, excluding BTC: any tagged news | **7/45 — 15.6%** |
| Altcoins only: passing the importance filter | **2/45 — 4.4%** |

The eight covered coins were **BTC, ETH, SOL, HYPE, LTC, ZEC, ONDO, AAVE**. Only **BTC, HYPE, LTC** passed the importance threshold. Missing examples included **ENA, FET, PENGU, AVAX, NEAR, SUI, XRP, LINK, TAO, ASTER, ARB, DOGE**.

These are **tagged-coverage counts**, not a claim that every tag is correct or that uncovered coins actually had news.

Three concrete causes:

- **“Collected today” differs from “published today.”** Around 11:05–11:08 ET, the database contained 259 posts collected within 24h, but only **116–117 published within 24h**; 176 were published within 48h. Your 257 figure appears consistent with ingestion/backfill volume.
- **The dashboard deliberately excludes ordinary news.** Both [the coin API](</D:/claude projects/crypto-news-terminal/app/src/app/api/news/route.ts:19>) and [dashboard export](</D:/claude projects/crypto-news-terminal/app/ingest/newsFile.js:85>) require importance ≥50 by default. An Aave V4 article scored 30; several SOL articles scored 20.
- **Tagging loses legitimate project mentions.** Read-only probes of the actual tagger returned no tags for “Ethena governance approves fee switch,” “Sei introduces a new network upgrade,” and “NEAR Protocol announces a major upgrade.” Its name blocklist and broad “venue” rules suppress these. Conversely, a headline mentioning *Polygon veterans* gained a POL tag. [Tagger](</D:/claude projects/crypto-news-terminal/app/ingest/tickers.js:236>)

One correction to the premise: the code already supplements CoinGecko’s top 500 with Binance futures bases through `addBases()`. The remaining problem is **canonical names, aliases, context, and retrieval**, not merely dictionary size.

**2. Gap table**

| Area | Gap / implication |
|---|---|
| Volume and breadth | Six editorial RSS publishers cannot cover 500 traded coins consistently. Exchange announcements provide valuable events, but cannot replace project reporting. |
| Presentation | Sahasra has 28px rows with roughly 536px reserved for metadata before gaps/padding, truncating headlines. CryptoPanic’s documented layout emphasizes a headline list and adjacent detail pane. Its exact current visual rendering could not be inspected here. [Layout reference](https://www.binance.com/en/square/post/1682330) |
| Discovery/features | Sahasra initially fetches 50 posts; portfolio filters and counts operate on loaded posts. This can look like “no news” until older pages load. No dedicated Social/Media filters or full coin-search workflow. |
| Ranking | Importance is an event heuristic, not community sentiment. “Rising” counts cluster members, and the source badge uses member count rather than distinct publishers. |
| Cannot reproduce freely/reliably | CryptoPanic’s existing voters/comments, proprietary Panic Score, licensed content, and dependable comprehensive X coverage. X currently charges **$0.005 per post read**. [X pricing](https://docs.x.com/x-api/getting-started/pricing) |
| Already better suited to your purpose | Direct ShivaShakthi integration, private catalyst/dismiss labels, exchange-first ingestion, publication/first-seen timestamps, source health, and post-event price snapshots. These are more relevant to your workflow than public voting. |
| Refresh opportunity | CryptoPanic documents 10-minute visitor, 5-minute registered-user, and ~30-second PLUS refresh. Your 90-second RSS polling and faster exchange adapters can compete on collection cadence; actual latency still needs measurement. [CryptoPanic features](https://cryptopanic.com/about/) |

**3. Top eight free improvements**

Ranked for **your altcoin objective**, balancing impact and effort. S ≈ small targeted change; M ≈ several connected changes.

| Rank | What and why | Concrete source / implementation | Effort | Main risk |
|---:|---|---|:---:|---|
| **1** | **Per-coin news collection, prioritized by live setups.** General feeds leave the long tail uncovered. | Google News queries plus a canonical Binance-symbol→project map; example [NEAR query](https://news.google.com/rss/search?q=%22NEAR%20Protocol%22%20when%3A2d&hl=en-US&gl=US&ceid=US%3Aen). Endpoint not validated here. | M | Ambiguous matches, indexing delay, undocumented throttling |
| **2** | **Separate “has news” from “has catalyst.”** Immediately exposes existing coverage without making alerts noisy. | Show all relevant <48h articles at importance ≥0; retain ≥50/70 for catalyst badges/alerts. Change both API and dashboard export semantics. | S | Users confusing commentary with catalysts |
| **3** | **Repair tagging recall and precision.** More feeds otherwise produce more missed/misassigned stories. | Explicit project aliases, source identity, summary context, and subject-vs-ecosystem tags; correct the examples above. | M | Ticker collisions and rebrands |
| **4** | **Add 10–15 editorial feeds first.** Fastest broad content gain. | Start with [Blockworks](https://blockworks.co/feed), [Unchained](https://unchainedcrypto.com/feed/), [Protos](https://protos.com/feed/), [Crypto.news](https://crypto.news/feed/), [CryptoPotato](https://cryptopotato.com/feed/), [AMBCrypto](https://ambcrypto.com/feed/). | S | Syndication, sponsored articles, price-prediction spam |
| **5** | **Query the complete 48h archive when selecting a coin.** Eliminate misleading empty results from the initial 50-post window. | Server-side ticker/time/source filtering and pagination; show matching stories versus loaded rows. | M | Query/index performance |
| **6** | **Give headlines more room.** Improves the terminal’s feel immediately. | Move secondary tags/returns into expandable details; clickable tickers; adjacent article preview; retain compact timestamps/source. | S | Overcrowding on small screens |
| **7** | **Collect primary project announcements, releases, and events.** Better long-tail signal than another generic publisher. | [Sui](https://blog.sui.io/rss/), [Solana](https://solana.com/news/rss.xml), [Aptos Medium](https://medium.com/feed/aptoslabs), [Agave releases](https://github.com/anza-xyz/agave/releases.atom), [CoinMarketCal](https://coinmarketcal.com/developer/docs). | M | Routine releases and promotional announcements |
| **8** | **Add separate Social and Media views.** More context without overwhelming the trading feed. | Approved Reddit API access and curated YouTube channel feeds below. | M | Access restrictions, hype, duplicated clips |

Do not make X scraping the ninth “easy win”: login requirements, changing markup, anti-bot controls, and unreliable third-party bridges make it a maintenance burden.

**4. Free per-coin sources and a scalable design**

| Source | Assessment |
|---|---|
| **Google News RSS** | Best broad discovery candidate for obscure coins. The exact query endpoints were inaccessible to this web tool, so **not live-verified**. Search project names, not bare tickers: `"NEAR Protocol" when:2d`; `"Harmony" ("ONE" OR blockchain) when:2d`; `"Render Network" OR ("RENDER" crypto) when:2d`. Independently enforce publication age and validate the matched entity. |
| **Official blogs** | Highest priority for upgrades, incidents, governance, integrations. Solana, Sui, Ethereum and IOTA endpoints produced RSS/XML response indications. Sparse output is normal; many coins have no substantive update for weeks. |
| **Medium / Substack / Mirror** | Aptos Medium, The Daily Gwei Substack and The Defiant Substack produced XML indications. Mirror examples failed verification; migrations are real—Tableland documents moving from Mirror/Substack to Paragraph. Discover each project’s current feed rather than assuming a universal path. [Migration example](https://paragraph.com/@tableland-2/we-re-moving-to-paragraph-xyz) |
| **GitHub releases** | Geth and Agave `.atom` endpoints produced Atom indications. Maintain an official repository→coin map. Stable mainnet/security releases deserve attention; nightly builds and SDK patches generally do not. |
| **Coin subreddits** | Useful leads and incident reports; unreliable as unauthenticated infrastructure. A subreddit’s subject does not make every post news about its token. |
| **YouTube** | Useful interviews and project updates; generally slower and noisier than primary announcements. Collect channels once, then tag locally. |
| **Event calendars** | CoinMarketCal currently documents **3,000 requests/month, 1 request/sec on Free**, a seven-day upcoming window, and no free historical window. Source proofs and impact scoring require higher tiers. Batch coin filters and preserve estimated dates. [Limits](https://coinmarketcal.com/developer/docs/rate-limits), [fields](https://coinmarketcal.com/developer/docs/events) |
| **Project X accounts** | Often the earliest source, but **no dependable free automated coverage** established. Keep verified account links in coin profiles; use official blog/release mirrors where available. |
| **Binance Square** | Supplemental Social content only. The public site is accessible, but I did not verify a supported free read feed. Binance’s documented Square skill is for **publishing**, not news ingestion. [Official explanation](https://www.binance.com/en/square/post/307056306780705) |

**Scheduling proposal:** no design can guarantee “without rate limits,” particularly for Google News.

- Maintain one record per traded asset: Binance symbol/base asset, canonical project ID, aliases, ambiguous terms, official domains, subreddit, repositories, channel IDs, and search query.
- Normalize contract multipliers/rebrands through explicit mappings; avoid blindly stripping numeric prefixes from every symbol.
- Example baseline: **46 active coins every 30 minutes; remaining 454 every 12 hours** = approximately **3,116 Google requests/day**, spread throughout the day. Start smaller; this is a workload estimate, **not an approved Google allowance**.
- Prioritize newly appearing setups within a fixed request budget. Collect shared publisher feeds once, not once per coin.
- Reuse existing conditional requests/backoff; add persistent next-poll times, cached results, jitter, per-host budgets, and `Retry-After` handling. Back off on blocks rather than rotating identities.
- Deduplicate publisher URLs across direct RSS, Google, Reddit and Square; count **distinct original publishers**, not reposts.
- Require entity evidence before attaching a coin. **Never tag an article solely because a per-coin search returned it.**
- Keep `publishedAt`, `firstSeenAt`, and scheduled event time separate. Old material discovered today must not become “fresh news.”
- Measure **active coins covered / active coins checked**, tag precision, source failures, and detection delay—not just headline volume.

Planning expectations, **not measured rates**: Google may yield 0–5 distinct relevant items/day for many smaller coins; official blogs often 0–1; meaningful releases/events usually zero on an ordinary day. No honest collector can produce fresh news when none exists.

**5. Thirty additional feed endpoints checked**

All URLs below produced an **RSS/Atom/XML content-type indication** in this session’s web checks. The reader then rejected the format. **HTTP 200, valid item parsing, and latest-item freshness remain unverified**—this is the strongest evidence available here, not a completed ingestion acceptance test.

| Publisher | Feed URL |
|---|---|
| Bitcoin.com News | https://news.bitcoin.com/feed/ |
| NewsBTC | https://www.newsbtc.com/feed/ |
| Bitcoinist | https://bitcoinist.com/feed/ |
| CryptoPotato | https://cryptopotato.com/feed/ |
| Crypto.news | https://crypto.news/feed/ |
| AMBCrypto | https://ambcrypto.com/feed/ |
| The Daily Hodl | https://dailyhodl.com/feed/ |
| CoinGape | https://coingape.com/feed/ |
| Coinpedia | https://coinpedia.org/feed/ |
| Coin Edition | https://coinedition.com/feed/ |
| ZyCrypto | https://zycrypto.com/feed/ |
| Blockworks | https://blockworks.co/feed |
| Protos | https://protos.com/feed/ |
| Unchained | https://unchainedcrypto.com/feed/ |
| Finbold | https://finbold.com/feed/ |
| CoinCentral | https://coincentral.com/feed/ |
| Blockonomi | https://blockonomi.com/feed/ |
| The Crypto Basic | https://thecryptobasic.com/feed/ |
| Cryptopolitan | https://www.cryptopolitan.com/feed/ |
| Cryptonews | https://cryptonews.com/news/feed/ |
| CryptoDnes, English | https://cryptodnes.bg/en/feed/ |
| Ethereum Foundation | https://blog.ethereum.org/feed.xml |
| Solana | https://solana.com/news/rss.xml |
| Sui | https://blog.sui.io/rss/ |
| IOTA | https://blog.iota.org/rss/ |
| Kraken Blog | https://blog.kraken.com/feed |
| Bitfinex Blog | https://blog.bitfinex.com/feed/ |
| Aptos Labs, Medium | https://medium.com/feed/aptoslabs |
| The Daily Gwei, Substack | https://thedailygwei.substack.com/feed |
| The Defiant, Substack | https://thedefiant.substack.com/feed |

Excluded from that list: CryptoBriefing, Bitcoin Magazine and 99Bitcoins returned **403**; Messari `/rss` returned **404**; Chainlink `/feed/` redirected to an **HTML blog**, not a feed. Other attempted endpoints, including Mirror examples, were inconclusive.

Do not enable all thirty indiscriminately. Financial-news spillover, sponsored stories and repeated price predictions need source/category controls.

**6. Reddit, blogs and YouTube: yes, with different roles**

**Reddit: yes with approved authenticated access; no as a dependable anonymous server feed.**

| Community | RSS checked | JSON checked | Result here |
|---|---|---|---|
| r/CryptoCurrency | [RSS](https://www.reddit.com/r/CryptoCurrency/new/.rss) | [JSON](https://www.reddit.com/r/CryptoCurrency/new.json?limit=5) | Atom indication; cached JSON readable |
| r/Bitcoin | [RSS](https://www.reddit.com/r/Bitcoin/new/.rss) | [JSON](https://www.reddit.com/r/Bitcoin/new.json?limit=5) | Atom indication; JSON failed |
| r/ethereum | [RSS](https://www.reddit.com/r/ethereum/new/.rss) | [JSON](https://www.reddit.com/r/ethereum/new.json?limit=5) | Atom indication; cached JSON readable |
| r/solana | [RSS](https://www.reddit.com/r/solana/new/.rss) | [JSON](https://www.reddit.com/r/solana/new.json?limit=5) | Atom indication; cached JSON readable |
| r/CryptoMarkets | [RSS](https://www.reddit.com/r/CryptoMarkets/new/.rss) | [JSON](https://www.reddit.com/r/CryptoMarkets/new.json?limit=5) | Atom indication; cached JSON readable |

Cached web access **does not prove anonymous access from your server**. Reddit’s current documentation requires OAuth, specifies **100 queries/minute per eligible OAuth client**, and says unauthenticated traffic will be blocked. Use a truthful User-Agent such as `windows:sahasra:v1.0 (by /u/YOUR_ACCOUNT)` and observe rate-limit headers. [Current API rules](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki)

The [2023 changes](https://redditinc.com/news/2023apiupdates) introduced revised terms and paid broader access; old “anonymous 10 requests/minute” advice is not a current access guarantee. Commercial use needs permission, and hosted-service IPs require authentication. [Access policy](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data)

Suggested handling:

- **Social tab; default importance 10–25.**
- Prefer source-linked News/Development/Security posts; exclude memes, daily discussion, price targets and referral promotions.
- With JSON, use score/flair/upvote ratio as secondary ranking signals; RSS cannot be assumed to provide those fields. Don’t delay a credible incident solely because it lacks votes.
- Planning budget: **80–400 raw posts/day across these communities; perhaps 10–40 retained**, highly variable and unmeasured.
- Respect removals/deletions; watch brigading and recycled links.

**Blogs: yes—prioritize them over Reddit for long-tail coins.**

Use official-domain feeds and verified project Medium/Substack publications from the table. Put them in **Project/Blogs**, generally importance **30–50**, promoting concrete security/listing/mainnet events after classification. Plan for **0–1 post/day per project**, often much less. Promotional bias, stale feeds, migrations and misleading “partnership” announcements are the main risks.

**YouTube: yes—free channel feeds are a documented mechanism.**

Feed format:

`https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID`

Google also documents WebSub notifications for uploads and title/description changes, avoiding constant polling. [Official documentation](https://developers.google.com/youtube/v3/guides/push_notifications)

These eight channel IDs resolved to the named YouTube channels. **Their live RSS contents were not verified:** Coin Bureau produced an XML indication; the other feed checks returned cache misses.

| Channel | Channel ID | Role |
|---|---|---|
| [CoinDesk](https://www.youtube.com/channel/UC7TghOL755nBk7HelHoi9LQ) | `UC7TghOL755nBk7HelHoi9LQ` | News/interviews |
| [Cointelegraph](https://www.youtube.com/channel/UCRqBu-grVX1p97WaX4d-OuQ) | `UCRqBu-grVX1p97WaX4d-OuQ` | News/interviews |
| [Unchained](https://www.youtube.com/channel/UCWiiMnsnw5Isc2PP1to9nNw) | `UCWiiMnsnw5Isc2PP1to9nNw` | Reporting/interviews |
| [The Defiant](https://www.youtube.com/channel/UCL0J4MLEdLP0-UyLu0hCktg) | `UCL0J4MLEdLP0-UyLu0hCktg` | DeFi reporting |
| [Bankless](https://www.youtube.com/channel/UCAl9Ld79qaZxp9JzEOwd3aA) | `UCAl9Ld79qaZxp9JzEOwd3aA` | Ethereum/DeFi commentary |
| [The Daily Gwei](https://www.youtube.com/channel/UCvCp6vKY5jDr87htKH6hgDA) | `UCvCp6vKY5jDr87htKH6hgDA` | Ethereum updates |
| [Coin Bureau](https://www.youtube.com/channel/UCqK_GSMbpiV8spgD3ZGloSw) | `UCqK_GSMbpiV8spgD3ZGloSw` | News/explainers |
| [Real Vision](https://www.youtube.com/channel/UCGXWKlq1Oxr3ddEtmKhAkPg) | `UCGXWKlq1Oxr3ddEtmKhAkPg` | Crypto/macro interviews |

Use **Media**, default importance **10–30**; rank original reporting above commentary. Budget roughly **5–30 uploads/day across the eight**, including clips, as an unmeasured planning range. Deduplicate by video ID and distinguish clips from full interviews. Tag only coins actually discussed; sponsorship text and sensational titles should not create catalyst alerts.

**The first milestone should be reliable 48-hour coverage for active setup coins, with separate “news” and “catalyst” counts. Matching CryptoPanic’s total scrolling volume is a weaker success criterion.**
