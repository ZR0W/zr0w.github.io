---
name: signal-search
description: Map of the Signal Search browser game (docs/tools/signal-search.html, the neon hidden-terrain treasure hunt). Use for ANY request about it, however loosely worded — "the signal game", "the hacker game", "the fog / treasure / radar game", "the gradient descent game", nodes, Drawn / Greedy / Leveler, Trace / Ping / radar, energy, reserve, movement budget, cliffs, levels, signal loss, the estimated (fogged) map, world or map generation, presets, the start screen, tabs, the neon art style, or bugs in any of these.
---

# Signal Search — agent guide

A single-player, browser-only, imperfect-information pathfinding game. The terrain is a hidden square grid of
cells, each at a whole-number height level; one cell holds a treasure. Each round the player launches a node,
buys information and a movement budget from an energy reserve, and reads the report it sends back. Vanilla JS,
no build, no dependencies beyond Google Fonts. Deployed with the rest of the site from `docs/` on `deploy-main`
(see the root `CLAUDE.md`). The game is the user's own design; keep new content original. The art direction
(neon instrument console) is inspired by anime control-room screens but uses no logos, names or graphics from
any existing work; keep it that way.

The design history (the earlier continuous-terrain prototype, the design document, notebook notes) lives in the
separate repo `Zr0w/signal-search-game` (`docs/DESIGN.md`, `AGENTS.md`). That repo holds the continuous version;
this site holds the grid version. They share the world-generation layers and the estimated-map maths.

## Files

| File | What it is |
|---|---|
| `docs/tools/signal-search.html` | Page: all CSS (neon theme tokens in `:root`), markup for the three views. Simple.css is deliberately omitted. |
| `docs/js/signal-search.js` | Everything else, one IIFE: world generation, game rules, estimated map, drawing, input, views. |
| `docs/index.html` | Webtools list entry. |
| `.claude/skills/signal-search/smoke-test.js` | Headless regression check (see Testing). |

## Views

Routed on the URL hash by `route()`: empty → **Start** (`#viewStart`: brief, game settings), `#play` → **Play**
(`#viewPlay`: map + tabbed panel), `#world` → **World** (`#viewWorld`: generation settings and preview).
Play's side panel has four toggle tabs (`setTab`): Node, Report, Log, Help. Tapping the open tab closes it.
World settings sections fold (the `.acc` buttons); only the first two start open.

## Vocabulary → code

| User might say | Means | Where |
|---|---|---|
| node, signal, probe | one launch per round | `commit`, `runNode`, `applyRun` |
| path-finder, algorithm, mode | `N_.algo`: `drawn`, `greedy`, `leveler` | `ALGO`, `ALGO_NOTE`, `runNode` |
| hand-drawn / pre-drawn path | `drawn`: follows `path` exactly; stops at a cliff; **lost** if the budget runs out mid-path | `runNode` |
| greedy | steps to its lowest neighbour if that is lower **or level**; never revisits a cell; stops when every new neighbour is higher | `runNode` |
| leveler | steps to the neighbour closest to its own level (prefers level, then down, then up); never revisits | `runNode` |
| information, sensors | `N_.trace`, `N_.ping` (radius 0–4), `N_.radar` | `costs`, `applyRun` |
| radar, treasure ping, bearing | 8-sector bearing to `W.treasure` plus 1–5 strength | `radar`, red wedges in `render` |
| energy, bill, cost breakdown | itemised table in the Node tab | `costs`, `updatePlan`, `COST`, `pingCost` |
| climbing cost | `1 + climb × levels²` per step up; downhill adds nothing | `climbCost` |
| cliff | step up of more than `physics.maxStep` levels; no node climbs it | `runNode`, red edges in `drawCells` |
| signal loss / signal lost | only a Drawn node whose budget runs out before the end of its path; Trace still returns crossed cells | `runNode` status `dead`, `renderReport` |
| home, base, launch points | `W.base` plus `anchors` (where surviving nodes stopped) | `nearestAnchor`, `launch` |
| fog, estimated map, belief | Gaussian process on cell readings | `addObs`, `fitBelief`, `belief.mean/sd` |
| rounds, reserve, per-node cap, noise, refund | game settings `GS` (edited on Start), snapshotted into `GM` by `newGame` | `GDEF`, `GPRE`, `syncStart` |
| map generation, terrain, presets | world settings `S` | `generate`, `buildWorld`, `PRESETS`, `SCHEMA` |

## World generation (`generate(S, seed)`)

1. Build a smooth field on a fine grid (`k×k` samples per cell) from the enabled layers: layered noise, ridges
   (with domain warp), test-function basins (Rosenbrock, Rastrigin, saddle, Ackley), blobs, optional erosion.
2. Average each `k×k` block into one cell, normalise to 0–1.
3. Cut into `S.levels` whole levels: even height bands, or equal cells per level (`S.spacing`).
4. Optionally remove one-cell pits and spikes (`S.despeckle`).
5. Choose the base (corner or quietest random cell) and level a landing pad with a sloped apron.
6. Optionally cap the tallest step between neighbours (`S.cliffCap`) by lowering peaks.
7. Measure: cliff and flat edge shares, pits (regions with no way down), cells-per-level histogram.
8. Place the treasure on a cell reachable from the base without climbing a cliff, at least
   `rules.dist × N` steps away (random, or the lowest such cell). `buildWorld` rerolls the seed up to 12 times.

Preset level counts were calibrated so roughly 8–13% of edges are cliffs at the default `maxStep`.

## Settings storage

`localStorage` keys `signal-grid-world-v2` (world `S`) and `signal-grid-game-v2` (game `GS`). If you change the
shape of either object, bump the key suffix so old saved settings are ignored.

## Recipes

- **New path-finder:** add it to `ALGO`, `ALGO_NOTE` and `COST`; add a branch in `runNode`; add a `STAT` entry for
  any new stop reason; mention it in `updateRules`. The buttons are generated from `ALGO`.
- **New information type:** add a cost to `COST`, a toggle in `#segInfo` (built near `mkBtn`), a line in `costs()`,
  its effect in `applyRun`, its drawing in `render`/`renderReport`, and a rule line in `updateRules`.
- **New terrain layer:** defaults in `OFF`, key in `LAYERS`, contribution in step 1 of `generate`, a section in
  `SCHEMA`; then recheck cliff shares per preset and adjust preset `levels`.
- **New game setting:** default in `GDEF`, control in the Start markup, wiring in the start-view section, read it as
  `GM.<name>` in game code, mention it in `updateRules`.

## Testing

```sh
node .claude/skills/signal-search/smoke-test.js
```

Runs the page in headless Chromium (Playwright, preinstalled in Claude cloud sessions). It exposes the IIFE's
internals by rewriting the script on load, so keep the file ending in `})();`. Checks: no page errors; every preset
yields a valid world with a reachable treasure; start → play → commits with each path-finder; movement rules
(orthogonal steps, no cliff climbs, exact step cost, Greedy never climbs, no revisits); radar accuracy; world view
renders. Run it after any change to rules or generation.

## Known gaps

- No score or end screen beyond the message in the Node tab when the treasure is found or rounds/reserve run out.
- Balance is untuned: the default first Drawn path can run out of budget because the blank map can't predict climbs.
- On phones the map plus an open Node tab is taller than one screen; closing the tab brings it back to the map.
