# PHASE 2 · STEPS 6 + 7 — BWEnews flash + Upbit / OKX / Coinbase (authoritative)
Existing conventions:
- RawItem: `{ sourceName, sourceTier, kind, exchange, title, url, publishedAt, hintCategory, hintTickers, symbolRef? }`.
- Adapters: `make()` returns `{ name, tier, intervalMs, warmRuns?, run }`.
- HTTP: `request(url, { ua, timeoutMs, conditional })` → `{ status, notModified, text, json() }`, throwing HttpError for ≥400.
- Adapters THROW on an unexpected shape or an empty list (so health sees it).

## STEP 6 — `app/ingest/adapters/bwenews.js` (new)
- `make()` returns `{ name: 'tg:bwenews', tier: 2, intervalMs: 30000, run }`.
- GET `https://t.me/s/BWEnews` with the browser UA and a 15 s timeout (no conditional; the page is `no-store`).
- Export a pure `parseBwenews(html)` → an array of messages `{ id, url, publishedAt, text, links }`:
  - Split the HTML on the `data-post="` attribute. Each segment starts with the post id ("BWEnews/16492"). `url = 'https://t.me/' + id`.
  - `publishedAt = new Date(<the first <time ... datetime="..."> in the segment>)`; skip messages without a valid date.
  - Text: the inner HTML of the first element whose class contains `tgme_widget_message_text`. Replace `<br>` with ' \n ', strip tags, decode entities (`&amp; &lt; &gt; &quot; &#39; &nbsp;` and numeric `&#NNN;` / `&#xHH;`), then collapse whitespace.
  - `links`: all `href="https://..."` in the segment that are not on t.me or telegram.org, deduplicated.
  - Throw `Error('bwenews: no messages parsed')` if the page is non-empty but 0 messages are parsed (layout change → visible failure).
- **Title:** the English part only.
  - Cut the text at the first CJK character (`[㐀-鿿豈-﫿]`) that occurs after position 15.
  - Also cut at the first ' 方程式' if present.
  - Drop a leading "BWENEWS:" prefix.
  - Trim and cap at 240 chars.
  - Our own tagger decides tickers: hintTickers is always `[]`, and do NOT import any ticker annotation from the post.
- **Gating** (only these become items):
  - Skip messages mentioning `/BWENEWS AI|No Accuracy Guaranteed/i` UNLESS they have at least one external link.
  - Keep only titles matching `/\b(hack(ed|s)?|exploit(ed|s)?|drain(ed|s)?|stolen|breach|attack(er|ed)?|compromised|SEC|CFTC|DOJ|lawsuit|charged|indict|delist(s|ed|ing)?|will list|lists|listing|launch(es|ed)?|halt(s|ed)?|pause[ds]?|suspend(s|ed)?|outage|ETF|liquidat\w*|bankrupt\w*|insolven\w*|freeze|frozen|depeg\w*|withdrawals?)\b/i`.
- Items: `{ sourceName: 'tg:bwenews', sourceTier: 2, kind: 'news', exchange: null, title, url, publishedAt, hintCategory: null, hintTickers: [] }`.
- Return [] (no throw) when the page is identical to the last one: keep a hash of the joined message ids plus their text lengths.

## STEP 7a — `app/ingest/adapters/upbit.js` (new)
- `make()` returns `{ name: 'upbit', tier: 1, intervalMs: 10000, run }`.
- GET `https://api-manager.upbit.com/api/v1/announcements?os=web&page=1&per_page=20&category=all` (browser UA, `conditional: true`; 304 → []).
  - Response: `{ success, data: { notices: [...], fixed_notices: [...] } }`.
  - Throw if `success === false` or `notices` is not a non-empty array.
- Each notice `{ id, title, category, listed_at, first_listed_at }` →
  - title `'[Upbit] ' + title`
  - url `'https://upbit.com/service_center/notice?id=' + id`
  - publishedAt = `new Date(first_listed_at || listed_at)` (listed_at changes on edits)
  - exchange 'Upbit', kind 'exchange', tier 1, hintTickers = the parenthetical `\(([A-Z0-9]{2,15})\)` captures.
- hintCategory (Korean):
  - if the title contains '해제' → null;
  - else listing if `/디지털 자산 추가|마켓 추가|신규 거래지원|거래지원 개시/`;
  - else delisting if `/거래지원 종료|상장 폐지|유의 종목 지정|투자유의/`;
  - else maintenance if `category === '입출금'` or `/입출금|점검|일시 중단/`;
  - else null.
- Export a pure `mapUpbit(json)` → items (for tests).

## STEP 7b — OKX new markets (add to `app/ingest/adapters/symbols.js`)
Two more venues through the existing symbolAdapter framework (same flood cap, pendingEmit durability, size floor):
- `okx-spot`: GET `https://app.okx.com/api/v5/public/instruments?instType=SPOT` (NOTE: `www.okx.com` is blocked on this network; use app.okx.com).
  - Symbols = `instId` of entries whose `quoteCcy` is USDT, USDC or USD.
  - Base = `baseCcy`.
  - MIN_SYMBOLS 500.
- `okx-swap`: GET `…?instType=SWAP`. Symbols = `instId` (e.g. "BTC-USDT-SWAP"). Base = the first segment of `uly` (or of instId). MIN_SYMBOLS 200.
- Title for a new base:
  - `New OKX spot market live: <instId>`, or `New OKX perpetual live: <instId>` for swap;
  - if that entry's `state === 'preopen'`, use `OKX pre-listing: <instId> opens <ISO of listTime>`.
  - The fetchSymbols function for OKX must therefore return the entry objects (or keep a map instId → {state, listTime}) so the title can use them.
- url: `https://www.okx.com/trade-spot/<instId lowercase>` or `https://www.okx.com/trade-swap/<instId lowercase>`.
- exchange 'OKX', hintCategory 'listing', hintTickers [base].

## STEP 7c — Coinbase new markets + delistings
- Venue `coinbase` in the same framework: GET `https://api.exchange.coinbase.com/products` (browser UA). Symbols = the `id` of products with `status === 'online'` and `quote_currency` in USD, USDC, USDT. Base = `base_currency`. MIN_SYMBOLS 300.
  - Title: `New Coinbase market live: <id>`.
  - url: `https://www.coinbase.com/advanced-trade/spot/<id>`.
  - exchange 'Coinbase'.
- Delisting detection (Coinbase only, in the same adapter module):
  - Keep an in-memory map base → count of online products from the previous successful run (seeded silently on the first run).
  - When a base that had ≥1 online product now has 0 online products AND the product list size passed the floor → emit ONE item:
    - title `Coinbase delisted <BASE> (no online markets)`
    - url `https://www.coinbase.com/advanced-trade/spot/<BASE>-USD#delisted-<YYYY-MM-DD>`
    - kind 'symbol', hintCategory 'delisting', hintTickers [base], exchange 'Coinbase'.
  - More than 10 such disappearances in one run → treat as a feed glitch: log and emit none.

## Classifier addition (`app/ingest/classify.js`)
- Titles matching `/doesn'?t mean official listing|not an official listing|alpha listing/i` → category 'other', importance 30, sentiment neutral (Binance Alpha is not a spot listing).

## Wiring (`app/ingest.js`)
- Add `bwenews.make()` and `upbit.make()` to the adapter list.
- `symbols.make()` now also returns the okx-spot, okx-swap and coinbase adapters.
