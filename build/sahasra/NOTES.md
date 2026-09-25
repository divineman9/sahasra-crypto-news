# Sahasra branding — design notes & install

## Rationale

- **Emblem = Sahasrara mandala, not a flower icon.** Four concentric petal rings (24 / 16 / 12 / 8,
  all multiples of 4 so the mandala stays four-fold symmetric) drawn as translucent gradient petals
  with fine strokes and centre veins, layered outer→inner from violet → magenta → cyan → white so the
  eye is pulled to the centre. A rim of 72 gold seed-dots + two hairline circles stands for "the
  thousand"; the centre is a gold ring holding a faint Shiva/Shakti hexagram (ties to the sibling
  ShivaShakthi dashboard) around a luminous bindu (white → gold → magenta). An SVG blur filter gives
  the neon bloom; a CSS drop-shadow adds the outer halo like the sibling's `.emblem`.
- **Motion is barely-there:** outer ring drifts one turn per 140 s, the dot rim counter-drifts per
  220 s, the bindu breathes over 6 s. All three are disabled under `prefers-reduced-motion`.
  The animated `<g>`s carry no SVG `transform` attribute (CSS transform would override it) and use
  `transform-box: fill-box; transform-origin: 50% 50%` so they spin about the centre.
- **Header layout** is a `1fr auto 1fr` grid: left = date + "CRYPTO · NEWS · TERMINAL" in muted
  10 px mono (a quiet counterweight); centre = emblem 64 px, "SAHASRA" 26 px bold with 0.42 em
  tracking (left-padded by the same amount so the tracked wordmark is optically centred) in a
  cyan→violet→magenta gradient with a violet halo; tagline 11 px, 0.26 em tracking, muted violet
  `#b48cff`, flanked by 26 px cyan hairlines; right = the original LIVE pill, ws dot, clock,
  unchanged semantics. Measured height at desktop widths: **~127 px** (target 110–150).
- Palette is strictly the existing neon tokens (#00f0ff, #9d4dff, #ff2bd6, #ffb000, #39ff14) on
  #05060d; font is the existing JetBrains Mono stack. All ids are `sahasra-*` so nothing collides.

## Files

| File | Purpose |
|---|---|
| `SahasraLotus.tsx` | `export function SahasraLotus({ size = 72 })` — self-contained inline SVG emblem, `aria-label="Sahasra"`. Also default-exported. |
| `TopBar.tsx` | Full replacement for `app/src/components/TopBar.tsx` (same `useFeedStore` hooks). |
| `globals_additions.css` | Header shell, wordmark gradient text, tagline, hairlines, keyframes + reduced-motion guard. |
| `preview.html` | Standalone static mock (header + 3-column body with feed rows). Open in a browser and screenshot. Shows measured header height bottom-right. |

Both TSX files were type-checked with `tsc --noEmit` against the app's strict `tsconfig.json`
(paths alias mapped to the build folder) — 0 errors.

## Install steps (all edits under `app/` are to be delegated per the orchestrator rule)

1. Copy `build/sahasra/SahasraLotus.tsx` → `app/src/components/SahasraLotus.tsx`.
2. Replace `app/src/components/TopBar.tsx` with `build/sahasra/TopBar.tsx`
   (it imports `@/components/SahasraLotus`, `@/store/useFeedStore` — no other new deps).
3. Append the whole of `build/sahasra/globals_additions.css` to the end of `app/src/app/globals.css`.
4. In `app/src/app/layout.tsx` change the metadata to
   `title: "Sahasra — the final path to the Oneness"`,
   `description: "Sahasra — real-time crypto news terminal"`.
5. `app/src/app/page.tsx`: **no change required.** The header is auto-height and the body grid
   already has `min-h-0 flex-1`, so the feed simply gets ~95 px less height. Optional: change
   `mt-2` on the grid to `mt-3` for a touch more breathing room.
6. Optional cleanup: `app/src/components/TopBar.tsx.bak` can be deleted afterwards.

## Verify after install

- `npx tsc --noEmit` and `npm run build` clean (the `<use href>` attribute is the modern form React
  18/19 types accept — do not switch to `xlinkHref`).
- In the browser: header ≈ 125–130 px tall at ≥1280 px width; the wordmark sits visually centred
  over the feed column (the 1fr / 1fr side columns keep it centred regardless of the status widgets'
  width); LIVE / LOADING pill, ws dot colour and clock still track store state.
- Emblem renders identically to `preview.html` (Chrome/Edge/Firefox/Safari ≥ 11 all support
  `transform-box: fill-box`). With OS "reduce motion" on, nothing rotates or pulses.
- Tab title reads "Sahasra — the final path to the Oneness".
- At narrow widths (< ~900 px) the side columns shrink first; if the date/status ever collide with
  the wordmark, drop the tracking on the left label or hide it with `hidden md:flex`.
