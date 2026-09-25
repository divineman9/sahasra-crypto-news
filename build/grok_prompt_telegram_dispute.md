We're down to two small disagreements with Fable (my other researcher) on the Phase 1 plan for my crypto news terminal. Everything else is agreed. Use live web search, give a source URL for every factual claim, and say "unverified" where you can't confirm something.

If Fable's argument is better, concede. If yours is, keep your position and show the evidence.

## Context
- Solo crypto trader.
- The product is a "news on this coin in the last ≤48 h" flag on my Binance-perp base-break signals.
- **Agreed Phase 1 sources:**
  - Exchange announcement APIs: Bybit, Bitget and KuCoin every 5 s; Bithumb every 2 s.
  - Binance CMS (unofficial) every 10–15 s.
  - A Binance `ticker/price` symbol-diff as confirmation.
  - 7 crypto RSS feeds + SEC press releases, every 60–120 s.
- **Agreed extras:** SimHash clustering, rule-based importance, Discord alerts (portfolio coin, importance ≥70, ≤48 h), price moves at +1/5/15 min, and a 24 h soak test.

## Dispute 1 — Telegram BWEnews: first item of Phase 2, or deferred indefinitely?
- **Your position:** defer Telegram. `t.me/s/` HTML previews are fragile, ToS-gray and have no SLA. Fine as a bonus, not a spine.
- **Fable's position:** make BWEnews (`https://t.me/s/BWEnews`) the FIRST Phase 2 item, health-flagged.
  - Reason: the Phase 1 exchange APIs only cover listings and delistings. RSS is 2–10 min late.
  - So nothing in Phase 1 catches **hacks, exploits, regulatory actions, or major macro/political headlines in under a minute**, and those are exactly the events that move perps hardest.
  - BWEnews posts are timestamped with source links. The channel has ~72.7K subscribers.
- **Questions:**
  1. Is there a *more robust* free sub-minute source for hacks and regulatory headlines than `t.me/s/` HTML? For example:
     - the Telegram Bot API (a bot can't read channels it isn't an admin of — correct?)
     - Telegram MTProto via a user account (e.g. Telethon/GramJS): ToS risk, ban risk?
     - RSS bridges
     - PeckShield/SlowMist/CertiK alert feeds
     - DefiLlama hacks
     - Rekt news
     - any official exchange "security incident" feeds
  2. How fast is BWEnews vs the original source for hacks and regulatory news, in practice? Evidence please.
  3. What is the concrete breakage/ban risk of polling `t.me/s/BWEnews` every 30 s from a home IP, for personal use?
  4. **Verdict:** first in Phase 2, later, or never — and if first, what safeguards?

## Dispute 2 — Hyperliquid `meta` symbol-diff: same PR as Binance diff, or a later phase?
- **Your position:** add it only after the Binance ticker-diff works.
- **Fable's position:** it's a one-line POST (`https://api.hyperliquid.xyz/info` with `{"type":"meta"}` returns `universe[]` with name, maxLeverage, isDelisted). Add it in the same PR once the Binance diff loop is stable, not in a separate phase.
- **Questions:**
  1. Does Hyperliquid list new perps before or after the big CEXs, and does it announce them anywhere first? Is its new-listing signal tradeable for a Binance-perp trader, e.g. as a leading indicator of a Binance listing?
  2. What are the HL info endpoint rate limits?
  3. **Verdict:** same PR or later?

## Output format
### Dispute 1 — Telegram
- Concede / hold, with a short reason.
- A table of alternative fast sources for hacks/regulatory news: name | method | speed | cost | reliability | ToS risk.
- Final recommendation plus safeguards.

### Dispute 2 — Hyperliquid
- Concede / hold, with a short reason.
- Final recommendation.

Keep it short and evidence-based.
