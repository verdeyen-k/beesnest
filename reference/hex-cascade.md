# Hex Cascade — project brief

A small interactive toy: a large hexagon made of hexagonal cells. The user fills cells by clicking. Any empty cell that touches **3 or more filled cells** fills itself automatically, and those auto-fills can set off further auto-fills (a cascade).

The current working version is a single self-contained HTML file, `hex-cascade.html` (no build step, no dependencies besides Google Fonts). This brief describes what it does so you can extend or port it.

## The board

- A regular hexagon with **10 cells per side** → **271 cells** total.
  - General formula: side length `N` gives `3N(N-1) + 1` cells (N=5 → 61, N=10 → 271).
- Cells are **pointy-top** hexagons.
- Coordinates are **axial** `(q, r)` with implied `s = -q - r`. A cell is on the board when `max(|q|, |r|, |s|) <= N - 1`.
- Each cell has up to 6 neighbors, using the axial direction offsets:
  `(+1,0) (+1,-1) (0,-1) (-1,0) (-1,+1) (0,+1)`. Edge cells have fewer.
- Pixel center for a cell (pointy-top): `x = size * √3 * (q + r/2)`, `y = size * 1.5 * r`.

## The rule

1. The user's clicks define a set of **seed** cells.
2. The filled state is always the **closure** of the seeds:
   - Start with filled = seeds.
   - Repeatedly find every empty cell with ≥ 3 filled neighbors and fill all of them **at once** (one "wave").
   - Stop when a pass adds nothing.
3. Each cell records which wave filled it: `-1` empty, `0` seed (user click), `1..k` auto-filled in wave k.

The closure is recomputed from the seed set after every change, not updated incrementally. This means removing a seed also removes any auto-fills that only existed because of it.

## Interaction

- **Click an empty cell** → it becomes a seed; closure recomputes.
- **Click a seed** → it stops being a seed; closure recomputes (dependent auto-fills clear).
- **Click an auto-filled cell** → nothing changes; the cell does a small shake. Auto-fills can only go away by removing seeds they depend on.
- **Hover an empty cell** → preview: every cell that would auto-fill if you clicked it gets a dashed amber outline.
- Keyboard: cells are focusable; Enter/Space toggles.
- Buttons:
  - **Clear** — remove all seeds.
  - **Undo** — restore the previous seed set (history stack of seed sets).
  - **Random 25** — replace seeds with 25 random cells.
  - **Show wave numbers** (checkbox) — label each auto-filled cell with the wave that filled it.
- Stats strip: total filled / 271, seeds ("clicked"), auto-filled count, number of cascade waves.
- Newly filled cells animate in with a pop, staggered by wave number (~70 ms per wave) so cascades read as a ripple outward.

## Visual conventions

- Seeds: deep blue. Auto-fills: amber. Empty: near-white (dark theme: dark green-grey).
- Supports light and dark themes via CSS custom properties.
- Rendered as SVG polygons (one per cell) with a text element per cell for wave numbers. The SVG `viewBox` is sized from N, so the board scales to fit its container.
- On load, three seeds are placed around the center so the rule is visible immediately: `(0,-1)`, `(1,0)`, `(-1,1)` (these all touch `(0,0)`, which auto-fills).

## Key code pieces (in `hex-cascade.html`)

- `N` — cells per side (currently `10`). Changing this is the only edit needed to resize the board, apart from the "/ 271" text in the stats strip and the intro sentence.
- `cells[]`, `idx` (Map `"q,r"` → index), `nbrs[]` (neighbor index lists) — built once at startup.
- `closure(seedSet)` → `{ g, waves }` where `g[i]` is the wave per cell.
- `render()` — recomputes closure, updates classes/animations/stats.
- `preview(i)` — computes closure with `i` added and outlines the difference.

## Notes for further work

- The closure is O(cells × waves) per change; fine at 271 cells, would still be fine at a few thousand.
- If porting (e.g. to React, a canvas renderer, or another language), keep the "recompute closure from seeds" model — it's what makes un-filling behave predictably.
