**Recommendation: disable Reddit by default and use curated Bluesky feeds for Social.** Reddit RSS is technically useful, but I cannot call it an assuredly ToS-compliant replacement for approved API access.

Reddit now requires explicit API approval, prohibits unauthorized collection, and has announced unauthenticated JSON shutdown and scrutiny of RSS. **A 200 response and conservative polling establish accessibility—not permission.** [Builder policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy), [collection rules](https://support.reddithelp.com/hc/en-us/articles/360043512931-Don-t-break-the-site), [JSON/RSS announcement](https://www.reddit.com/r/modnews/comments/1tq9vxo/protecting_communities_from_scrapers_and_platform/).

| Option | Without keys? Rate/limits | Daily yield and noise | Maintenance / ToS assessment |
|---|---|---|---|
| **Official Reddit RSS** | Yes, per your measurement. Budget **one request globally every 65–75 seconds**, honoring longer server resets. This is an operating limit, not a published entitlement. | Captures new thread titles; actual unique/day unmeasured. `/new` is noisy and lacks dependable score/flair metadata. | Moderate implementation effort; high availability uncertainty. **Permission remains unclear for this collector.** |
| **old.reddit / i.reddit / other official endpoints** | No dependable keyless alternative. Reddit says Old Reddit requires login; unauthenticated JSON is being discontinued. | No dependable daily supply. HTML scraping could reproduce listing content but is brittle. | High maintenance; no separate permission or quota merely because the hostname differs. [Official update](https://redditinc.com/news/modernizing-reddits-infrastructure-and-moderation-tools). |
| **Redlib / Libreddit instances** | Often keyless to visitors; shared-instance limits and upstream blocks. | Reddit-like volume when working; potentially zero during outages. Same underlying noise. | **Reject for a ToS-respecting design.** Redlib explicitly documents token spoofing to circumvent limits; original Libreddit describes itself as nonoperational. [Redlib](https://github.com/redlib-org/redlib), [Libreddit](https://github.com/libreddit/libreddit). |
| **PullPush** | Public API historically keyless; current working quota and freshness unverified. | No credible current items/day estimate; archive availability does not establish live coverage. | High operational and provenance uncertainty. No verified Reddit authorization for this use. |
| **Arctic Shift** | Public API; dynamic load/complexity limits, 429/reset headers, no uptime guarantee. | Coverage/freshness unverified. Fresh score/comment counts can remain **0/1 until roughly 36 hours**, undermining your score gate. | Useful archival tooling; poor foundation for dependable live Social. No verified permission covering your downstream use. [API documentation](https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md). |
| **Pushshift** | Requires approved moderator access and tokens. | **Zero eligible items for this use case.** | Its documented authorization is moderation-only, not a crypto terminal. [Access rules](https://support.reddithelp.com/hc/en-us/articles/16470271632404-Pushshift-Access-Request). |
| **Lemmy** | Public community RSS, no keys; instance-specific limits. Start at 15-minute polling. | Community-dependent; budget for sparse discussion, potentially zero on quiet days. Current daily activity unverified. | Low–moderate maintenance. Native syndication is a better fit; follow instance terms. [RSS documentation](https://join-lemmy.org/docs/contributors/04-api.html). |
| **Mastodon** | Public account/tag RSS where enabled. Poll every 5–10 minutes. REST API default is 300 requests/5 minutes; **that is not an RSS quota guarantee**. | Tags can be noisy with promotion, bots and repeated links; instance-visible content only. Daily yield unmeasured. | Low–moderate maintenance; prefer selected accounts over broad `#crypto`. [RSS support](https://docs.joinmastodon.org/user/network/), [API limits](https://docs.joinmastodon.org/api/rate-limits/). |
| **Bluesky** | Public author/list APIs explicitly require no authentication. Public AppView has generous, unspecified numeric limits. Poll every 5 minutes. | Controllable through curation: **20 authors × 2 relevant originals/day = 40/day**, as a sizing example—not a measured forecast. | Best fit: low–moderate maintenance and documented public access. [Author API](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/feed/getAuthorFeed.json), [list API](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/feed/getListFeed.json), [limits](https://bsky.network/docs/rate-limits/). |
| **Drop Reddit** | No requests or credentials. | Zero Reddit items; loses Reddit-specific sentiment. | Lowest maintenance and Reddit-related risk. Keep subreddit links for manual reading. |

Third-party access is **not proof of a license to collect or redistribute Reddit content**. Conversely, a ToS problem does not automatically establish illegality; copyright, privacy and contractual questions depend on the use and jurisdiction.

**Concrete feed settings**

- Lemmy: `https://lemmy.world/feeds/c/cryptocurrency.xml?sort=New` — every **15 minutes**. `/c/cryptocurrency` itself is the community webpage.
- Mastodon: `https://mastodon.social/tags/bitcoin.rss` and `/tags/ethereum.rss` — every **10 minutes**, with spam filtering and deduplication.
- Bluesky authors: `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=<handle-or-DID>&filter=posts_no_replies&limit=100`
- Bluesky lists: `https://public.api.bsky.app/xrpc/app.bsky.feed.getListFeed?list=<URL-encoded-at://DID/app.bsky.graph.list/RECORD>&limit=100`

For Bluesky, start with 15–25 selected analysts/builders, poll every five minutes, exclude reposts, and deduplicate by post URI. These provide discussion discovery, not Reddit’s community breadth.

**If Reddit authorizes RSS use**, six feeds at 65-second spacing revisit each subreddit every **6½ minutes**. With 25 entries, coverage is adequate provided fewer than 25 new posts arrive between visits; bursts and downtime cause gaps. This is worthwhile for non-alerting thread discovery. Repeated snapshots do **not** mean 25 new items per fetch.

The existing [reddit.js](</D:/claude projects/crypto-news-terminal/app/ingest/adapters/reddit.js>) would need:

- Explicit `off|oauth|rss` mode; no credential requirement in RSS mode.
- One rotating fetcher using `https://www.reddit.com/r/<sub>/new/.rss`, with a **hard global minimum of 65 seconds**, including retries. Six independently scheduled adapters currently start together.
- Atom parsing through the already-installed `rss-parser`; canonical Reddit permalink/ID deduplication.
- Remove score/flair gates in RSS mode; do not invent missing scores or treat feed category as post flair. Removal/NSFW guarantees also weaken.
- Conditional requests, 304 handling, global 429 backoff, and disable on persistent 403. No hostname/IP rotation.
- Preserve `kind:'social'`, tier 4, `alertable:false`, `maxImportance:10`; update the misleading “free script app” setup text.

**Verification limits:** local HTTP probes were blocked by the session sandbox. Remote feed/API checks were inconclusive; PullPush’s homepage returned 403 and Arctic Shift’s homepage loaded. Your earlier Reddit **200/25-entry** result remains the relevant PC measurement. I found the relocated Grok wrapper, but its temporary-file/network requirements were unavailable here; this assessment uses primary documentation. No files changed.
