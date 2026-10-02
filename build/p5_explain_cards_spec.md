# P5 — "Understand this" explain cards with Dasa Mahavidya symbols

Design spec, no code. Written 2026-10-01 (ET). Author: Fable (orchestrator), merged with Astra's review (mapping, art guardrails, motion). Reviewer gate: Fable APPROVE per step (Astra when asked).
Repo: `D:\claude projects\crypto-news-terminal` (private). Public mirror: `D:\claude projects\sahasra-public` (news-only, sanitized).

Builds on what exists today:
- `app/ingest/classify.js` → `category` ∈ `hack | delisting | unlock | etf | listing | regulatory | maintenance | other`, `importance`, `sentiment`, `parseUnlock(title)` (tokens / pct / basis).
- `PostDTO` (`app/src/lib/types.ts`) has `storyId`, `sourceTier`, `kind`, `exchange`, `instruments[]`, `priceTicker`, `ret1m/5m/15m`.
- `app/ingest/price.js` (coin + BTC prices), `app/ingest/scheduler.js` (periodic jobs), `app/ingest/newsFile.js` (atomic JSON writes), `SahasraLotus.tsx` (inline-SVG component pattern, `sahasra-` id prefix, motion in `globals.css` with a reduced-motion guard).
- Private calendar: `D:\claude projects\crypto\screener\events_live.json` → `supply_shock[]` (`symbol, ts_ms, pct_circ, tokens, days, date_et, per_source_pct`), `funding_1h_now[]`, `interval_changes[]`.

---

## 0. One-paragraph summary

When a story passes the **big-news gate**, the ingest builds one **ExplainEvent** JSON (facts → template → optional GLM plain-words rewrite that must pass the **number guard**). The UI shows it as a card whose sections are the user-approved ones — *What happened · Why it matters · What could happen next (3 scenarios) · What to watch · Evidence meter* — plus *Has this happened before?*, *event timeline*, glossary hovers, and three short lines Astra's review added (*Trade-offs · Who is affected · What remains uncertain*). Each section is headed by a small original line-art symbol of one of the ten Mahavidyas, used as a **lens for understanding** (never as a label for bad news). Each symbol plays one brief, abstract, single-play animation when the card expands. A **forward log** records the coin's move vs BTC at 1/7/30 days; **base rates** are rebuilt monthly and are the only source of "Historically X of N". Everything that is *text, template, art, code* is public; everything that is *measured* (base-rate seed, forward-log data, funding/OI, unlock calendar) stays private.

---

## 1. Devi mapping — ten lenses, one per card section (Astra's mapping, adopted)

Principle (Astra, adopted over my first draft): the Devis mark **how to look at** a section, not **what kind of news** it is. No Devi is ever attached to a category, a sentiment, a price direction, or a scenario. There is no "hero Devi per category"; the card's identity comes from the plain category tag and coin, and the ten marks are the same on every card. Never label Dhumavati "failure/loss", Kali "hacks/crash", Kamala "gains", Bagalamukhi "ban".

| # | Devi | Lens (card section) | What the section contains | Emblem (abstract) | Colours (dark / light) |
|---|---|---|---|---|---|
| 1 | **Tara** | **"Understand this"** — card title / the guiding frame | Card header: coin, category tag, time ET, rev | lotus over crossing waves | cobalt `#2f6bff` / `#1d4ed8`, silver `#c9d1e0` |
| 2 | **Kali** | **"What changes?"** — time / transformation | *What happened* (the facts, dated) | opening circular arc | midnight blue `#1b2559` (dark) `#2a3a8c` (light), crimson `#c81e45` |
| 3 | **Bhuvaneshwari** | **"Wider context"** — encompassing space | *Why it matters* (mechanism, who else it touches) | nested horizons | amber `#ffb000` / `#b07400`, violet `#9d4dff` |
| 4 | **Tripura Sundari** | **"Putting it together"** — harmony of parts | *What could happen next* — the 3 scenarios as one balanced picture | three balanced petal clusters | rose `#ff4d6d` / `#be123c`, gold `#e0b84a` |
| 5 | **Chhinnamasta** | **"Trade-offs"** — energy given and received | One line: what one group gives up so another gets (e.g. unlock: early holders get liquidity, current holders get dilution) | three flowing ribbons | coral `#ff7a59` / `#c2410c`, ivory `#f3efe4` |
| 6 | **Kamala** | **"Who is affected?"** — flourishing, in plain terms | Who gains access / fees / liquidity and who carries the cost; never "guaranteed" anything | unfolding lotus | pink `#ff8fc2` / `#be3d7f`, gold `#ffb000` |
| 7 | **Bhairavi** | **"What deserves attention?"** — discipline, steady focus | *What to watch* (3 checkable signs) | steady flame in a triangle | vermilion `#ff3860` / `#c21e3e`, copper `#c67a3c` |
| 8 | **Bagalamukhi** | **"Pauses and restrictions"** — stilling | Conditional: halts, paused withdrawals, delisting dates, decision deadlines; hidden if none | waves settling into a line | yellow `#ffd21f` / `#a88600`, ochre `#b9892b` |
| 9 | **Dhumavati** | **"What remains uncertain?"** — endurance through not-knowing | 2–3 bullets: unconfirmed numbers, missing data, "Not enough comparable cases" | open ring with smoke curves | slate `#8e99ab` / `#55606f`, pearl `#e6e9ef` |
| 10 | **Matangi** | **"Terms and voices"** — speech / knowledge | Glossary hovers + the *Timeline* of sources ("voices") | abstract veena strings | emerald `#19c37d` / `#0f8a58`, teal `#14b8a6` |

Secular parts (no Devi, by design): the **Evidence meter** (source quality, corroboration, timestamp, uncertainty — a plain three-dot meter), the **"Has this happened before?"** base-rate block, scenario direction markers (plain `▲ ▼ ◆` glyphs), and the heat badge (plain "Volatility: high").

Tooltip text for every mark (Astra's wording): *"Inspired by {Devi}'s association with {attribute}; a contemporary editorial interpretation."* Example: *"Inspired by Dhumavati's association with endurance through uncertainty; a contemporary editorial interpretation."*

Meaning lines (one each, used on the legend page and in the tooltip's second line):
- Tara — guidance across difficult water.  · Kali — time and transformation.  · Bhuvaneshwari — the whole field in which things happen.  · Tripura Sundari — the beauty of a complete, balanced picture.  · Chhinnamasta — energy given so that others are nourished.  · Kamala — flourishing and plenty.  · Bhairavi — fierce, steady attention.  · Bagalamukhi — stillness and restraint.  · Dhumavati — endurance when things are unclear.  · Matangi — the spoken word and learning.

---

## 2. Art direction

### 2.1 Style (Astra's guardrails, adopted)
- **Original, symbolic, consistent line-art.** "Yantra-inspired ornament" — circles, petals, arcs, triangles as decoration — explicitly **not** purported ritual yantras. No invented "authentic" yantras, no sacred syllables, no decorative mantras, no Devanagari.
- **No** copied/traced artwork, realistic figures, faces, bodies, weapons as weapons, gore or gore substitutes. Kali and Chhinnamasta are pure abstract motion (§2.6). Darkness is never drawn as evil; Dhumavati's smoke is calm, not ominous.
- Stroke-only, `stroke="currentColor"`, `stroke-width 1.5` at 64 px, round caps/joins; optional second colour as a 10–14 % fill. `color` comes from `--devi-<name>` (table §1); both themes defined in `globals.css` (`:root` dark neon; `[data-theme="light"]` and `prefers-color-scheme: light`).
- Neon stays on **borders only** (card border, section rules); text is crisp high-contrast; symbols carry no glow in light theme and only a 1 px soft glow in dark theme on the card header mark.
- Icons **supplement** the text labels: every section heading is text first; marks are `aria-hidden`; the card is fully meaningful with images disabled and with animation disabled.

### 2.2 Per-Devi composition (viewBox 0 0 64 64, centre 32,32)

| Devi | Ornament base | Emblem |
|---|---|---|
| Tara | thin circle r28, 8 small petals | lotus (5 narrow petals) above two crossing sine waves; a dot (the guiding point) on the upper wave |
| Kali | circle r28 | one circular arc open at the top-right (~300°), a faint jagged polyline inside that reads as shadow, and 6 light dots |
| Bhuvaneshwari | none | three nested horizon arcs (bottom-anchored), a small oval around a 5-dot constellation |
| Tripura Sundari | circle r28 | three petal clusters at 120°, each 3 petals, around a centre dot |
| Chhinnamasta | circle r28 | a centre dot with three ribbons (S-curves) flowing outward to three small 3-petal forms |
| Kamala | 8 outer petals | a lotus of 5 petals; two thin showering arcs (dotted) above left and right |
| Bhairavi | upward triangle r24 | a single flame stroke (3-tongue) centred inside |
| Bagalamukhi | none | a zigzag line on the left settling into a straight line on the right; a square bracket `[ ]` in gold around the transition |
| Dhumavati | none | an open ring (gap at top), two smoke curls rising from the gap, the ring's centre empty |
| Matangi | circle r28 | four string curves (veena) across the circle, slightly different amplitudes |

### 2.3 Sizes and placement
- **Card header mark (Tara):** 40 × 40 px top-left (32 px mobile).
- **Section marks:** 18 px, left of each section heading, in the Devi's colour at 85 % opacity.
- **Feed-row chip:** 16 px Tara inside the "Understand this" chip. **Sidebar "Big news":** 18 px Tara per row.
- No more than one mark per heading; never a Devi inside running text or next to a number.

### 2.4 Implementation shape (for the coder; no code here)
- `app/src/components/devi/` — one file per Devi (`Tara.tsx` … `Matangi.tsx`), pure components, props `{ size?: number; play?: boolean; className?: string }`, rendering **inline `<svg>`** with `aria-hidden="true"` (decorative; the heading text carries meaning) and a `<title>` for devtools only; ids prefixed `devi-<name>-`. No external assets, no `<image>`, no `<use href="http…">`, no libraries.
- `app/src/components/devi/index.ts` — `DEVI` registry `{ key, name, iast, lens, meaning, tooltip, accentVar, Component }` and `DeviMark({ devi, size, play })`.
- Shared single source for the mapping: `app/ingest/explain/devi.json` (also imported by the TS side) so the legend page, tooltips and tests read one file.

### 2.5 Sensitivity text
- Legend page `/about/devis` (public): the ten symbols with IAST + plain name, lens, meaning line, and the note: *"These are original, contemporary editorial symbols inspired by the Daśa Mahāvidyā. They are decorative lenses for reading news, not devotional images, not ritual yantras, and they make no claims about markets."*
- Card footer (always): *"Explains the news. Not advice. Nothing here says buy or sell."*
- **Tagline note for the user (Astra's suggestion, not applied):** the site tagline "the final path to the Oneness" may read as salvation-through-trading next to these symbols; Astra suggests reconsidering it. Left unchanged pending the user's decision.

### 2.6 Motion — one brief, abstract, single-play animation per Devi (user requirement + Astra's guardrails)

Rules:
- **Single play on expand.** The animation runs once when the card (or section) first becomes visible after expand; no idle loop, no continuous pulsing, no flashing, no shaking. (The user allowed "a gentle idle loop at most"; Astra advised none — none is adopted.) On the legend page a mark replays once on hover/tap.
- **2–4 s, slow, subtle, low CPU:** animate only `opacity`, `transform` (translate/scale/rotate) and `stroke-dashoffset`; no filters, no path morphing, ≤ 6 animated elements per symbol, `will-change` not used.
- **Static = final frame.** The resting drawing is the resolved state (shadow already dissolved, lotus already open), so meaning never depends on motion. `prefers-reduced-motion: reduce` → never add the playing class; static only.
- **Visibility-gated:** the component adds class `is-playing` when an `IntersectionObserver` reports ≥ 50 % visible and `play` is true; it removes nothing afterwards (fill-mode `forwards`); offscreen before start → never starts; leaves viewport mid-play → class removed (animation cancelled to the static frame).
- Implementation: CSS keyframes in `globals.css` under `.devi.is-playing .devi-<name>-<part>`, not SMIL (CSS can be cancelled and gated; SMIL cannot be paused per element reliably). Durations and easing in one place (`--devi-dur: 3s; --devi-ease: cubic-bezier(.4,0,.2,1)`).
- **Content guardrails (Astra):** no victory loops, no comic enemies, no combat, no gore substitutes, no gamified violence; darkness is not evil, widowhood is not misfortune; no symbol is ever tied to a token's price.

Per-Devi keyframes (Astra's versions adopted where they differ from the user's list; the user's Kali "demon" example is rendered as *protective transformation*, not combat):

| Devi | Motion (0 → 100 %) | Animated parts |
|---|---|---|
| **Kali** | A circular arc sweeps once clockwise (`stroke-dashoffset` 0→full over 0–50 %); the jagged shadow polyline fades (opacity 1→0, 30–80 %) while 6 light dots rise 6 px and brighten (60–100 %). Reads as a shadow dissolving into light — transformation, no combat. | arc, shadow, dots |
| **Tara** | The guiding dot travels along the upper wave left→right (translate along a straight path with a gentle sine via two keyframes, 0–70 %); the waves' amplitude eases to flat (scaleY 1→0.35 about the baseline, 40–100 %); the lotus fades in and rises 4 px (60–100 %). Guidance across water to stillness. | dot, waves, lotus |
| **Tripura Sundari** | The three petal clusters start rotated ±20° and 10 % smaller, align to 0° and full scale (0–80 %); the centre dot appears last (80–100 %). Parts harmonising. | 3 clusters, centre |
| **Bhuvaneshwari** | The enclosing oval scales 0.6→1 (0–70 %); the three horizon arcs draw in from the centre outward (dashoffset, staggered 0.3 s); constellation dots fade in (50–100 %). Space expanding to cradle. | oval, 3 arcs, dots |
| **Bhairavi** | The flame stroke draws upward (dashoffset 0–50 %), its tip wavers twice (translateX ±1.5 px, 50–80 %), then settles (80–100 %); triangle fades in beneath (0–40 %). Rising, clarifying, steady. | flame, triangle |
| **Chhinnamasta** | The centre light scales 0→1 (0–25 %); three ribbons draw outward (dashoffset, 20–75 %); the three small petal forms at the ends brighten (70–100 %). Energy released that nourishes — no severing imagery. | centre, 3 ribbons, 3 forms |
| **Dhumavati** | Two smoke curls rise 8 px and thin (opacity .8→.25, 0–100 %); the open ring draws from its gap around (dashoffset 0–60 %); the empty centre stays untouched. A veil thinning around an enduring centre. | 2 curls, ring |
| **Bagalamukhi** | The zigzag's amplitude eases to a line (scaleY 1→0.05 about its axis, 0–70 %); the golden bracket closes gently from 110 % to 100 % width (30–90 %). Turbulence stilled. | zigzag, 2 bracket strokes |
| **Matangi** | Four string curves vibrate (scaleY 1.4→1 with two decaying oscillations, staggered 0.15 s, 0–80 %), ending in an ordered pattern. Resonance into order. | 4 strings |
| **Kamala** | The lotus petals open (each petal rotates from the base ±25°→0°, scale .7→1, 0–70 %); two showering arcs draw from the top (dashoffset, 20–80 %) with 3 dots each fading in (60–100 %). Opening beneath gentle showers. | 5 petals, 2 arcs, dots |

Acceptance for motion: each animation measured ≤ 4 s total; Chrome performance trace during one card expand stays under 5 % CPU on the user's PC; `prefers-reduced-motion` renders the static frame with no `is-playing` class; scrolling the card out mid-play leaves the static frame.

### 2.7 Public vs private — Fable's call
**Ship the Devi art, mapping, meaning lines, tooltips, legend page, animations, templates, glossary, card UI and the gate/outcome code in the public repo.** Reasons: (1) they are original line-art and prose — no study data, no keys, no third-party IP; (2) the Sahasra lotus and name are already public, so the visual identity is already out; (3) the respectful framing (tooltips, legend note) must travel with the symbols — splitting would strip it. **Keep private:** `base_rates.seed.json` (the unlock study: 171/236, −16.3 % median vs BTC, and any other measured number), the accumulated `forward_log.jsonl`, the `events_live.json` integration path, funding/OI lines, and `build/tools/glm_rewrite.py` (uses `agents.py` keys). The public build starts with an empty forward log and shows "Not enough comparable cases" everywhere until the user's own log fills — identical code, different data.

---

## 3. Data model

### 3.1 ExplainEvent (one JSON object per event)

```
{
  "id": "evt_2026-10-02_STO_unlock",            // `${dayET}_${coinOrTopic}_${category}`
  "rev": 3,                                     // bumps on every merge/update
  "created_at": "2026-10-02T13:05:00.000Z",     // ISO UTC; UI renders ET
  "updated_at": "2026-10-02T15:40:00.000Z",
  "state": "live" | "queued" | "closed",        // queued = gate slot full (§4.1); closed = >72h old
  "category": "unlock",                         // classify.js category
  "subtype": "supply_shock",                    // §4.2; null if none
  "sentiment": "bearish" | "bullish" | "neutral",
  "coin": { "ticker": "STO", "name": "StakeStone" } | null,   // null for macro
  "topic": null | "fed_rate",                   // macro key when coin is null
  "exchange": "binance" | null,
  "facts": {                                    // everything a template may quote — the ONLY number source
    "headline": "…", "source": "defillama", "source_tier": 1, "url": "…", "published_at": "…",
    "unlock_pct_circ": 5.1, "unlock_tokens": 21351728, "unlock_date_et": "Oct 2", "unlock_days": 1,
    "amount_usd": null, "exchange": null, "price_t0": 0.0421, "btc_t0": 68210, "range_24h_pct": 9.4,
    "restrictions": [ { "kind": "withdrawals_paused"|"trading_halt"|"delist_date"|"decision_deadline", "detail": "…", "when_et": "…" } ]
  },
  "text": {
    "what": "…", "why": "…",
    "scenarios": [ { "dir": "down"|"up"|"chop", "title": "…", "timeframe": "1–7 days",
                     "condition": "…", "evidence": "…",
                     "base_rate": { "x": 171, "n": 236, "measure": "lower vs BTC after 30d" } | null } ],
    "tradeoffs": "…",                          // one sentence (Chhinnamasta lens)
    "affected": [ { "who": "…", "how": "…" } ], // Kamala lens, 2–3 items
    "watch": [ { "label": "…", "detail": "…" } ],
    "uncertain": [ "…", "…" ],                 // Dhumavati lens
    "source": "template" | "glm",
    "glm": { "tried": true, "accepted": false, "reason": "number 12% not in input", "cached": true } | null
  },
  "evidence": { "level": "Strong"|"Moderate"|"Limited", "reason": "…", "sources": 3, "primary": true, "latest_ts": "…" },
  "heat": { "level": "high"|"normal"|null, "range_24h_pct": 9.4, "private": { "funding_1h": 0.08, "oi_chg_24h": 31 } | null },
  "history": { "cases": [ { "date": "2026-03-04", "coin": "ARB", "headline": "…", "r1": -4.2, "r7": -9.8, "r30": -16.1 } ], "note": "Not enough comparable cases" | null },
  "timeline": [ { "ts": "…", "kind": "first"|"update"|"confirmation"|"denial"|"price", "source": "…", "title": "…", "url": "…", "post_id": "uuid" } ],
  "post_ids": [ "uuid", "uuid" ],
  "glossary": [ "circulating supply", "cliff unlock" ]
}
```

Storage (no DB migration): `app/ingest/cache/explain/events.json` (array, last 30 days; atomic tmp+rename like `newsFile.js`), `forward_log.jsonl` (append-only), `base_rates.json` (rebuilt monthly; private seed `base_rates.seed.json`), `glm_cache.json` (hash → accepted rewrite). APIs read these files on demand with an mtime cache. Volumes are tiny (≤ 72 events/day by the gate; realistically 5–15).

### 3.2 Forward log row (`forward_log.jsonl`)

```
{ "event_id": "…", "category": "unlock", "subtype": "supply_shock", "coin": "STO", "t0": "ISO", "p0": 0.0421, "btc0": 68210,
  "d1": { "t": "ISO", "p": 0.039, "btc": 68900, "ret": -7.4, "ret_vs_btc": -8.4 } | null,
  "d7": { … } | null, "d30": { … } | null, "status": "open"|"done"|"no_price" }
```

### 3.3 Base rates (`base_rates.json`; public starts `{}`)

```
{ "built_at": "ISO", "min_n": 20,
  "unlock:supply_shock": { "n": 236, "lower_vs_btc_d30": 171, "median_vs_btc_d30": -16.3, "source": "study 2026-09 + forward log" },
  "listing:top_exchange": { "n": 0 } }
```

Display rule: "Historically X of N …" only if `n ≥ min_n`; otherwise the literal "Not enough comparable cases" (which also appears in the *What remains uncertain* list). Never interpolate a number from any other place.

---

## 4. Logic

### 4.1 Big-news gate (`app/ingest/explain/gate.js`)
Input: a classified post (the object the store writes). Output: `{ pass, subtype, reason }`.

Pass conditions (any one):
1. **Unlock supply shock** — `category=unlock` and (`parseUnlock().pct ≥ 5` on circulating basis) **or** (private) coin in `events_live.json.supply_shock[]` with `pct_circ ≥ 5` and `ts_ms` within 72 h. Env `EXPLAIN_UNLOCK_CALENDAR=<path>`; empty → news-parsed only.
2. **Hack / exploit / freeze / depeg** — `category=hack` and (`sourceTier ≤ 2` or `kind ∈ {exchange, official}`); or new flags added to `classify.js` (not new categories): `depeg` (`depeg|loses? (its )?peg|below \$?0\.9\d`), `freeze` (`freez(e|es|ing)|halt(s|ed)? (trading|withdrawals|deposits)|paus(e|ed) (all )?(withdrawals|deposits|trading)`).
3. **Listing / delisting on a top exchange** — `category ∈ {listing, delisting}`, `kind = exchange`, `exchange ∈ TOP_EXCHANGES = {binance, coinbase, okx, bybit, upbit, kraken, bithumb}` (in `config.js`).
4. **Major regulatory / ETF / macro** — `category ∈ {etf, regulatory}`, `importance ≥ 70`, and (`sourceTier ≤ 2` or `kind = regulator`). Macro topics (Fed, CPI, executive order, stablecoin bill) get `coin=null`, `topic=<slug>`.

Rate limits:
- **≤ 3 new events per rolling 60 min.** A passing story with no slot becomes `state: queued`; promoted FIFO (importance desc, then time) when a slot frees; dropped after 6 h unpromoted (`[explain] queue expired`).
- **1 per coin per ET day** (macro: 1 per topic per day). A second passing story for the same coin/topic the same ET day **merges** (§4.3) — never a second card.
- `maintenance` / `other` never pass. `userLabel=dismiss` never passes.

### 4.2 Subtypes (drive templates and the plain category tag — not Devis)

| category | subtype | tag text / tag colour (plain, secular) |
|---|---|---|
| hack | `theft` (drain/breach/stolen) | "Hack" · `--neon-red` |
| hack | `exploit` (code/oracle/bridge) · flag `depeg` → `depeg` | "Exploit" / "Depeg" · `--neon-red` |
| hack / regulatory + flag `freeze` | `halt` | "Halt" · `--neon-amber` |
| delisting | `top_exchange` | "Delisting" · `--neon-amber` |
| unlock | `supply_shock` | "Unlock" · `--neon-violet` |
| listing | `top_exchange` | "Listing" · `--neon-lime` |
| etf | `bullish` / `bearish` / `neutral` | "ETF" · `--neon-cyan` |
| regulatory | `bull` / `bear` / `macro` | "Regulation" / "Macro" · `--neon-cyan` |

Scenario direction markers: `▼ down`, `▲ up`, `◆ chop` in muted text colour. Heat badge: plain text "Volatility: high" when `range_24h_pct ≥ 8` (private: or |funding| ≥ 0.05 %/h or OI 24 h change ≥ 25 %).

### 4.3 Merging (evolving event)
Key = `${dayET}:${coin||topic}:${category}`. A passing post whose key exists, or whose `storyId` matches a post already in an event, is **attached**: append to `timeline` (`update`; `confirmation` if official/exchange; `denial` if NEG_RE + "hack|exploit" in title), union `post_ids`, recompute `facts` (max unlock pct across sources; newest headline from the highest-tier source; union `restrictions`), bump `rev`, set `updated_at`, re-render templates, re-run GLM only if the facts hash changed. Same coin/category after 24 h → new event, with the earlier one first in `history.cases`.

### 4.4 Templates (`app/ingest/explain/templates.js`)
Pure functions `(facts) → text` per subtype. Kid-level: short sentences, one idea each, no jargon without a glossary term, **no number unless it is in `facts`**. Each template emits `what, why, scenarios[3], tradeoffs, affected[], watch[], uncertain[]`. Every scenario has `timeframe`, `condition` ("more likely if…"), `evidence` ("we would know because…"). No price targets: directions are "lower than before the news", "back above where it was before", "sideways".

Examples (wording to match in spirit; numbers are placeholders filled from facts only):

**Unlock / supply shock**
- What: "On {unlock_date_et} about {unlock_pct_circ}% more {ticker} coins become free to sell. That is {unlock_tokens} coins."
- Why: "More coins for sale with the same buyers usually means the price has to work harder to stay where it is. Early investors who got cheap coins may want to sell some."
- S1 ▼ (1–7 d): "Price drifts lower as the new coins get sold." Condition: "more likely if the coins go to early investors, not a locked treasury." Evidence: "exchange deposits of {ticker} rise; price lags BTC."
- S2 ▲ (1–7 d): "Buyers were waiting and absorb the coins." Condition: "more likely if the project announced buybacks or the unlock was known for weeks." Evidence: "price holds the pre-news level while BTC is flat."
- S3 ◆ (first 48 h): "Big moves both ways while traders guess." Condition: "more likely when volatility is already high." Evidence: "24 h range stays wide."
- Trade-offs: "Early holders get the freedom to sell; everyone else holds a bigger pile of coins than yesterday."
- Affected: investors receiving coins (can sell) · current holders (more supply) · the exchange (more trading).
- Watch: "Does the price hold the level it had before the unlock news?" · "Who receives the coins?" · "Is {ticker} weaker or stronger than BTC this week?"
- Uncertain: "Which wallets receive the coins is not confirmed." · "Not enough comparable cases" (if no base rate).
- Base-rate slot (only if n ≥ 20): "Historically {x} of {n} coins were lower vs BTC 30 days after an unlock this big."

**Hack / theft**
- What: "{project} lost about {amount_usd} to a hacker on {date_et}, reported by {source}." Why: "Money is gone, trust is hurt, and stolen coins may be sold on the market."
- Scenarios: ▼ (hours–3 d) · ▲ recover (days–weeks: "the team covers the loss or exchanges freeze the funds"; evidence: official post) · ◆.
- Trade-offs: "Pausing the system protects what is left but locks users out meanwhile." Affected: users with funds inside · the token's holders · exchanges that may freeze deposits.
- Watch: "Does the team confirm the number?" · "Are stolen coins moving to exchanges?" · "Is there a refund or pause plan?" Uncertain: "Exact loss not yet confirmed by the team."

**Exploit / depeg**
- What (depeg): "{ticker} is meant to stay at $1. Right now it is below that, according to {source}." Why: "A stablecoin is only useful if people believe it is worth $1. When that belief cracks, many want out at once."
- Scenarios: ▲ back to $1 (issuer shows reserves; redemptions work; evidence: at peg 24 h) · ▼ stays below (redemptions paused) · ◆.
- Watch: "Can people redeem for $1?" · "What does the issuer say?" · "Is it one exchange or everywhere?"

**Halt / freeze / ban** — What: "{exchange|project} paused {what_paused} on {date_et}." Why: "When you cannot move your coins, people get nervous and sell elsewhere." Restrictions block filled from `facts.restrictions`. Watch: "When do withdrawals reopen?" · "Is the reason explained?" · "Are other exchanges still working?"

**Listing on a top exchange** — What: "{exchange} will list {ticker} ({spot|futures}) on {date_et}." Why: "A big exchange brings new buyers — but many traders buy the rumour and sell on listing day." Scenarios: ▲ continues (volume stays high after day 1) · ▼ after the pop · ◆. Affected: new buyers (access) · early holders (liquidity) · the exchange (fees). Watch: "Volume on day 2 vs day 1" · "Did price already jump before the announcement?"

**Delisting** — mirror of listing; Restrictions block carries the last trading date; Watch: "last trading date", "where else it trades".

**Regulatory / ETF / macro** — What: "{body} {did}: {headline_plain}." Why: "Rules decide who is allowed to buy. This touches {coin|the whole market}, not one project." Scenarios: relief / pressure / wait-and-see, each with a dated next step when present. Restrictions block carries decision deadlines. Watch: "Is there a date for the next decision?" · "Did other regulators react?" · "Is this new or a repeat?"

### 4.5 Optional GLM rewrite (`rewrite.js`) — off by default
- Env `EXPLAIN_REWRITE_CMD` = a command reading JSON `{facts, text}` on stdin, printing JSON `{why, tradeoffs, scenarios[].title, scenarios[].condition}` on stdout. Private value: `python "D:\claude projects\crypto-news-terminal\build\tools\glm_rewrite.py"` (wraps `ask_glm` from `agents.py`; 20 s timeout; system prompt: "rewrite in plain words for a 12-year-old; do not add or change any number, date or coin; no advice"). Public: empty → templates only.
- Only `why`, `tradeoffs`, scenario `title`/`condition` are rewritable; `what`, `evidence`, `watch`, `uncertain`, `affected` and all numbers stay template.
- **Sparingly:** one call per facts-hash, max 1 in flight, max 20/day (`EXPLAIN_REWRITE_DAILY_MAX`), cached in `glm_cache.json` keyed by `sha1(category|subtype|JSON(facts))`. Failure/timeout → template, `[explain] glm skip <reason>`; no retry for the same hash within 24 h.

### 4.6 Number guard (`numberGuard.js`)
1. **Allowed-set A:** from `facts` and the template text extract every numeric token and normalise: strip `$ , %`, lowercase suffix (`k m b bn million billion`) → canonical number (`5.1%`→`5.1`, `$2.3m`→`2300000`, `21,351,728`→`21351728`), plus integer parts of dates (`Oct 2`→`2`; `2026-10-02`→`2026,10,2`) and number words one–ten → `1..10`.
2. **Output-set B:** same extraction on the GLM output.
3. **Accept only if** `B ⊆ A`, **and**: no ticker outside `facts.ticker`/`BTC` (`\b[A-Z]{2,6}\b` filtered by `coins.json`), no banned words (`buy, sell, long, short, target, entry, stop loss, take profit, guaranteed, will go, moon, dump`), no URL, no "I/we recommend", each field 0.4×–1.6× the template length, same scenario count, valid UTF-8, no markdown.
4. Reject reason stored in `text.glm.reason` (dev inspector only). On reject → template, `text.source="template"`.
5. Required unit cases: passthrough (accept); invented `12%` (reject); `5.10%` of `5.1` (accept); `2m` for `2,000,000` (accept); new coin `SOL` (reject); word "target" (reject); truncated JSON (reject).

### 4.7 Evidence meter (secular, rule-based, `evidence.js`)
Inputs only: source quality (tier/kind), corroboration (independent domains), timestamp (latest confirmation age), uncertainty (denials, disagreeing numbers).
- **Strong:** a primary source (exchange announcement, official project post, regulator, on-chain explorer) **and** ≥ 2 independent domains, no `denial`.
- **Moderate:** one tier-1/2 publisher, or exchange-only, or primary but single domain.
- **Limited:** single tier ≥ 3 source, social/media-only, Google-News-only, or a `denial` present, or sources disagree on the key number (e.g. `per_source_pct` spread > 1 pt).
- Reason is literal: "Strong — Binance announcement + 3 news sources, last confirmed 2:40 PM ET"; "Limited — one unverified Telegram wire, no official confirmation yet". Recomputed on every merge.

### 4.8 Forward log and outcome job (`outcomes.js`, hourly via `scheduler.js`)
- On event creation: append the row with `p0/btc0` from `price.js` (`status: no_price` if none; macro events use BTC).
- Hourly: for each `open` row and each horizon `d1/d7/d30` whose `t0 + horizon` has passed and is null, fetch current price and fill `{t, p, btc, ret, ret_vs_btc}` (%, 1 decimal). `done` when d30 is filled. ≤ 1 fetch per row per horizon.
- Monthly (1st, 03:00 ET): `baseRates.rebuild()` groups by `category:subtype`, counts `lower_vs_btc_d30`, median; merges the private seed if present (seed n + log n); writes `base_rates.json`. `history.cases` = last 5 `done` rows with the same `category:subtype` (same coin first).

### 4.9 Times
Store ISO UTC; render ET with suffix ("Oct 2, 9:05 AM ET"); "Updated 2:40 PM ET · rev 3"; `dayET` keys use `America/New_York`.

---

## 5. UI

### 5.1 Where the card appears
1. **Feed row:** posts with an event get a chip `[Tara 16px] Understand this` right of the category tag; click expands the row (existing mechanism) → `ExplainCard` compact; animations play once on this expand.
2. **Post page** `/post/[id]`: full `ExplainCard` above the article; plays once on first view.
3. **Right sidebar:** "Big news · today" (max 5): Tara 18 px, coin, category tag, 6-word *what*, time ET, evidence dots.
4. **Legend page** `/about/devis`: the ten symbols, lens, meaning, tooltip text, sensitivity note; hover/tap replays a symbol once.

### 5.2 Card layout (desktop ≥ 900 px; mobile stacks in the same order)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Tara 40]  UNDERSTAND THIS                           Evidence ●●○ Moderate │
│            STO · [Unlock] · Oct 2, 9:05 AM ET · Updated 2:40 PM ET · rev 3  │
│            Volatility: high                                          │
├──────────────────────────────────────────────────────────────────────┤
│ [Kali] WHAT CHANGES?        On Oct 2 about 5.1% more STO coins…      │
│ [Bhuvaneshwari] WIDER CONTEXT   More coins for sale, same buyers…    │
├──────────────────────────────────────────────────────────────────────┤
│ [Tripura Sundari] PUTTING IT TOGETHER — what could happen next       │
│  ▾ ▼ Drifts lower · 1–7 days                                          │
│      More likely if… · We'd know because…                            │
│      Historically 171 of 236 lower vs BTC after 30 d  | Not enough comparable cases │
│  ▸ ▲ Buyers absorb it · 1–7 days                                      │
│  ▸ ◆ Big moves both ways · first 48 h                                 │
│ [Chhinnamasta] TRADE-OFFS   Early holders can sell; everyone else holds more supply. │
│ [Kamala] WHO IS AFFECTED?   investors receiving coins · current holders · the exchange │
├──────────────────────────────────────────────────────────────────────┤
│ [Bhairavi] WHAT DESERVES ATTENTION?  • Holds pre-news level? • Who gets coins? • vs BTC? │
│ [Bagalamukhi] PAUSES AND RESTRICTIONS   (only when facts.restrictions is non-empty)      │
│ [Dhumavati] WHAT REMAINS UNCERTAIN?  • Receiving wallets unconfirmed • Not enough comparable cases │
├──────────────────────────────────────────────────────────────────────┤
│ EVIDENCE   Moderate — DefiLlama calendar + 1 news source, last confirmed 2:40 PM ET      │
│ HAS THIS HAPPENED BEFORE?   ARB 2026-03-04  d1 −4.2  d7 −9.8  d30 −16.1 vs BTC            │
│ [Matangi] TERMS AND VOICES   circulating supply · cliff unlock (hover)                    │
│      9:05 AM ET first (defillama) · 11:20 AM update (theblock) · 2:40 PM confirmation (binance) │
├──────────────────────────────────────────────────────────────────────┤
│ Explains the news. Not advice. Nothing here says buy or sell.        │
└──────────────────────────────────────────────────────────────────────┘
```

- Headings are text; marks are decorative and `aria-hidden`. Scenario rows collapsible, first open. Glossary terms dotted-underlined with hover/tap definitions from `app/src/lib/glossary.ts` (≈ 25 terms; funding rate / open interest only when the private heat line is present).
- Theme: elevated panel on `--neon-bg`; neon only on the card border and section rules; high-contrast text; light overrides. No new fonts, no chart library; past cases are text.
- Keyboard: scenarios expandable via Enter/Space; tooltips reachable by focus.

### 5.3 API
- `GET /api/explain?limit=20&coin=STO` → `{ events }` (server strips `heat.private` unless `EXPLAIN_PRIVATE=1`).
- `GET /api/explain/[id]` → one event.
- `GET /api/posts/[id]` gains `explainEventId: string | null` (in-memory `post_ids` index refreshed on file mtime change).
- All `Cache-Control: no-store`; read on request with mtime cache (no polling).

---

## 6. Files to touch

**Ingest (Node, identical in private and public)**
- `app/ingest/classify.js` — add `flags: { depeg, freeze }` to the result; export `parseUnlock` if not already.
- `app/ingest/explain/gate.js`, `templates.js`, `numberGuard.js`, `rewrite.js`, `evidence.js`, `events.js` (load/save/merge/queue), `outcomes.js`, `baseRates.js`, `devi.json` (single source of the mapping: key, name, iast, lens, meaning, tooltip, colours).
- `app/ingest/store.js` — after save/classify, call `explain.consider(post)`.
- `app/ingest/scheduler.js` — hourly `outcomes.run()`, monthly `baseRates.rebuild()`, every 10 min `events.promoteQueue()` + `events.closeOld()`.
- `app/ingest/config.js` — `TOP_EXCHANGES`, `EXPLAIN_*`. `app/.env.example` — `EXPLAIN_ENABLED, EXPLAIN_REWRITE_CMD, EXPLAIN_REWRITE_DAILY_MAX, EXPLAIN_UNLOCK_CALENDAR, EXPLAIN_PRIVATE`.

**UI (Next.js)**
- `app/src/components/devi/{Tara,Kali,Bhuvaneshwari,TripuraSundari,Chhinnamasta,Kamala,Bhairavi,Bagalamukhi,Dhumavati,Matangi}.tsx`, `devi/index.ts`, `devi/DeviMark.tsx` (IntersectionObserver + `is-playing` + reduced-motion check live here, once).
- `app/src/components/explain/{ExplainCard,SectionHeading,Scenarios,TradeoffsAffected,WatchList,Restrictions,Uncertain,EvidenceMeter,HeatBadge,PastCases,TermsAndVoices,GlossaryTerm}.tsx`
- `app/src/lib/explainTypes.ts`, `glossary.ts`, `explainApi.ts`
- `app/src/app/api/explain/route.ts`, `api/explain/[id]/route.ts`, `api/posts/[id]/route.ts` (+`explainEventId`), `lib/serialize.ts`, `lib/types.ts`
- `FeedRow.tsx` (chip + expanded card), `PostDetail.tsx`, `RightSidebar.tsx`, `app/src/app/about/devis/page.tsx`, `globals.css` (`--devi-*` tokens both themes, `.explain-card`, `.devi` keyframes, reduced-motion guard).

**Private only**
- `build/tools/glm_rewrite.py`, `app/ingest/cache/explain/base_rates.seed.json`, `.env` values for `EXPLAIN_REWRITE_CMD` and `EXPLAIN_UNLOCK_CALENDAR`.

**Public repo sync checklist (`sahasra-public`)**
- Copy: all "Ingest" and "UI" files above, `devi.json`, glossary, legend page, `docs/DEVIS.md` (mapping table, tooltips, sensitivity note, motion rules), README section "Understand this".
- Never copy: `cache/explain/*.json*`, `build/tools/glm_rewrite.py`, `.env`, anything referencing `events_live`, any number from the unlock study (grep the diff for `171`, `236`, `16.3` before pushing).

---

## 7. Tests (`build/tests/p5_*.test.js`, added to `run_all_tests.sh`)

| File | Covers |
|---|---|
| `p5_gate.test.js` | each pass condition; maintenance/other/dismiss never pass; 4th event in an hour → queued; promotion; 1-per-coin-per-day; macro topic key |
| `p5_merge.test.js` | storyId attach; timeline kinds; rev bump; facts recompute (max pct, restrictions union); > 24 h → new event |
| `p5_templates.test.js` | every subtype renders what/why/3 scenarios/tradeoffs/≥2 affected/≥2 watch/≥1 uncertain; no banned words; every number ∈ facts; base-rate line only when n ≥ 20 else the literal |
| `p5_numguard.test.js` | the seven cases in §4.6.5 plus date integers and `$2.3m` |
| `p5_rewrite.test.js` | unset → `source=template`; bad-JSON command → template; daily cap; cache hit skips the spawn |
| `p5_evidence.test.js` | Strong/Moderate/Limited incl. the disagreeing-numbers case; reason strings with ET timestamp |
| `p5_outcomes.test.js` | horizons fill in order with a stubbed price source; `no_price`; base-rate math with/without seed |
| `p5_devi.test.js` | render each of the 10 to string: valid SVG, `aria-hidden="true"`, no `href`/`<image>`/text glyphs, ids prefixed `devi-<name>-`; `devi.json` has 10 entries with lens/tooltip/meaning/colours; every tooltip starts with "Inspired by"; no entry's text contains `hack, crash, failure, loss, gain, bull, bear, buy, sell` |
| `p5_motion.test.js` | each `.devi-<name>` keyframe set in `globals.css` exists, total duration ≤ 4 s, animates only opacity/transform/stroke-dashoffset, `animation-iteration-count` is 1; reduced-motion block disables all; `DeviMark` adds `is-playing` only when `play` and visible (jsdom IO stub) |
| `p5_ui_look.test.js` | built app on 4190: `/post/<id>` with an event shows header, 9 lens headings + evidence + history, footer disclaimer, ET times; Restrictions hidden when empty; `/about/devis` lists 10; `/api/explain` strips `heat.private` by default |
| `p5_public_sanity.test.js` (private only) | public tree must not contain `events_live`, `171`, `236`, `16.3`, `ask_glm` |

---

## 8. Build plan

### P1 — gate, templates, card, Devis (coder, 1 PR)
Scope: §4.1–4.4, §4.7, §3.1 store (no forward log), the 10 Devi components (static frames) + `DeviMark` + `devi.json` + legend page, `ExplainCard` with all lens sections, evidence meter, timeline, footer; feed chip, post page, APIs. GLM off.
Acceptance: `p5_gate`, `p5_merge`, `p5_templates`, `p5_evidence`, `p5_devi`, `p5_ui_look` pass; 1 h soak on the live collector produces ≤ 3 events/h and 0 duplicates per coin/day; screenshots of one unlock card and one listing card in dark and light; each mark renders at 16/18/40 px without clipping; Fable APPROVE.

### P2 — motion, plain words, glossary, sidebar, heat (coder, 1 PR)
Scope: §2.6 animations (keyframes, IntersectionObserver, reduced-motion, single play), §4.5 rewrite hook + `glm_rewrite.py` (private) + cache + daily cap, §4.6 number guard, glossary hovers, Right-sidebar "Big news", heat badge (private funding/OI line via `EXPLAIN_PRIVATE`), "what changed" line on merges.
Acceptance: `p5_motion`, `p5_numguard`, `p5_rewrite` pass; Chrome trace of one expand ≤ 5 % CPU, every animation ≤ 4 s, no replays on scroll; reduced-motion verified static; a forced run of 5 real events shows ≥ 1 accepted rewrite and any rejects with logged reasons; cache prevents a second spawn for the same hash; cap stops at 20; public build with `EXPLAIN_REWRITE_CMD` empty renders identically from templates; Fable APPROVE.

### P3 — forward log, outcomes, history, public sync (coder, 1 PR)
Scope: §4.8 forward log + hourly job + monthly base rates + private seed merge, "Has this happened before?" past cases vs BTC, base-rate line in scenarios, `p5_public_sanity`, public-repo sync + `docs/DEVIS.md` + README section.
Acceptance: `p5_outcomes` pass; simulated 31-day run with a stubbed clock yields correct `n`/medians and the card flips from "Not enough comparable cases" to "Historically X of N" exactly at `n = 20`; private build shows seed numbers, public build shows none (sanity green); Fable APPROVE; push private first, then public via the checklist.

### Constraints (all packages)
- Low-RAM PC: no new npm dependencies, no polling loops, files read on demand with mtime cache; ≤ 1 price fetch per open row per horizon; animations limited to opacity/transform/dashoffset.
- GLM only through `EXPLAIN_REWRITE_CMD` → `agents.py ask_glm`, cached, capped; no new paid APIs.
- All times displayed in ET; keys use the ET day.
- Coder follows the spec literally; deviations are flagged in the PR note for Fable, not silently redesigned.
