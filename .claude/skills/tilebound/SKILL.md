---
name: tilebound
description: Map of the Tilebound browser game (the grid dungeon / squad / roguelike game under docs/tools/tilebound*.html) and its wiki/help page. Use for ANY request about it, however loosely worded — "the dungeon game", "the grid game", "my squad game", "the Niu-Lai-like game", heroes/characters/classes, enemies/monsters/mobs/bestiary, the boss/elite/golem, movement or blocking rules ("squish", "jiggle", "forward button", "placement zone"), map/level/terrain generation, items/traps, difficulty, score, party/start screen, the wiki/help/rules page, art, or bugs in any of these.
---

# Tilebound — agent guide

A single-player, browser-only, endless turn-based dungeon crawler on a 7-wide grid. Vanilla JS, no build,
no dependencies beyond Google Fonts. Deployed with the rest of the site from `docs/` on `deploy-main`
(see the root `CLAUDE.md`). The game is the user's own design; keep new content original.

## Files

| File | What it is |
|---|---|
| `docs/tools/tilebound.html` | Game page: layout, all CSS, party-select overlay (`#party`), game-over overlay (`#over`). |
| `docs/js/tilebound-data.js` | **Single source of truth for content and numbers**: `window.TILEBOUND = { W, H, ZONE, ART, HEROES, ENEMIES, ITEMS, DEFAULT_PARTY, STRUCTURES, DIFFICULTY, SCORING }`. Loaded by both pages. |
| `docs/js/tilebound.js` | Game logic + rendering (one IIFE). Reads everything from `window.TILEBOUND`. |
| `docs/tools/tilebound-wiki.html` | Wiki/help page. Hand-written prose: Overview, Controls, Turn order, **Movement rules table**, Scoring, Tips. |
| `docs/js/tilebound-wiki.js` | Renders the wiki's Heroes, Bestiary, Spawning & scaling, Items, Terrain/Structures sections from the data file, plus search and `#anchor` links (`#hero-knight`, `#enemy-golem`, `#item-chest`, `#structure-vault`). |
| `docs/index.html` | Webtools list entry linking the game and the wiki. |
| `.claude/skills/tilebound/smoke-test.js` | Headless regression check (see Testing). |

`tilebound-data.js` is a deliberate exception to the repo's "one JS file per page" rule so the wiki can't drift
from the game. **When a stat, rule text, unlock row or spawn chance changes, change it in the data file only** — the
game and the wiki both update. Only the wiki's hand-written prose (movement table, turn order, controls, tips) must be
edited by hand when *rules* change.

## Vocabulary → code

| User might say | Means | Where |
|---|---|---|
| characters, heroes, party, squad, classes, team | `HEROES` (12 pickable + hidden `turret`) | data file; party screen at the bottom of tilebound.js |
| the archer (ambiguous!) | usually **Ranger "Wren"** (hero, `ranger`); enemy is **Skeleton Archer** (`archer`) | ask or infer from context |
| wizard / mage, tank / guardian, healer / cleric, bomber / bombardier, summoner / engineer, plant guy / druid | `mage`, `guardian`, `cleric`, `bombardier`, `engineer`, `druid` | data file |
| enemies, monsters, mobs, bestiary | `ENEMIES` | data file; behaviour in `plan(e)` |
| boss, elite, big guy, 2×2 | `golem` (`size: 2`, `elite: true`) | `huntBig`, `fits`, `footprint` |
| placement / deployment zone, gold squares | bottom `ZONE` (4) rows | `inZone`, `zoneOpen` |
| forward / left / right / hold buttons | `tryMove('up' \| 'left' \| 'right' \| 'hold')` | turn resolution |
| rearrange, reposition, drag, swap | `repositionHero`, `swapHeroes`, `startDrag`, `clickHero` | input section |
| jiggle / screen shake / blocked / stuck / squish | `jiggle()`, `refuse()`, the `stuck` / `pinned` / `cause` logic in `tryMove` | turn resolution |
| attack range / pattern / zone of a hero | `zone: [[dx, dr], …]` (dr > 0 = forward/up), `pierce: false` = first target only | data file; strike loop in `runTurn` |
| intent arrows, badges, "!" | `renderOverlay()` (calls `plan(e)` as a preview) | rendering |
| map / level / terrain generation, structures, rooms, walls | `STRUCTURES` (data: from/weight/desc/sample; game: `make(r)` shapes), `chunkOk`, `planStructure`, `genRow` | tilebound.js "terrain" section |
| items, loot, traps, interactables | `ITEMS` (+ `spawn.chance/from`); effects in the pickup block and "world acts" phase of `runTurn` | |
| difficulty, spawn rate, scaling | `DIFFICULTY` + enemy `from`/`weight` | data file; used in `genRow` |
| score | `score()` = depth × `SCORING.perDepth` + kill `pts` + gold | |
| help page, rules doc, wiki, manual | tilebound-wiki.html / tilebound-wiki.js | |

## How the game works (tilebound.js)

- **Coordinates.** Columns `x` 0..6. World rows `r` count **upward** from 0 (forward = `r + 1`). The camera shows rows
  `S.camR .. S.camR + H − 1`; `sy(r)` converts to a screen row (0 = top). Heroes always sit in rows `camR .. camR+ZONE−1`.
  **Depth** shown in the HUD = `S.camR`. Data `from` values are *world rows* (a row first shows at depth ≈ row − 10).
- **State `S`** (built by `newGame(seed, party)`): `rows: Map<r, string[7]>` ('.', 'wall', 'rock', 'pillar'), `plan`
  (queued generated rows), `heroes`, `enemies`, `items`, `camR`, `turn`, `gold`, `kills`, `killPts`, `busy`, `over`, `sel`,
  `hover`, `log`, `rng` (seeded mulberry32; `?seed=N` in the URL).
- **Units.** Hero `{id:'h'+type, type, x, r, hp, maxHp, alive, cd}`; turret = hero with `static: true, owner`. Enemy
  `{id:'e'+n, type, x, r, hp, maxHp, dmg, size, small, dir, flee, nextDir}` — `(x, r)` is the bottom-left of its footprint.
  Item `{id:'i'+n, type, x, r, up, dir, ttl}`. Element ids prefixed `t…` are terrain tiles — don't reuse that prefix.
- **Turn pipeline** — `tryMove(dir)` decides, `runTurn(dir, opts)` resolves:
  1. `tryMove` computes per hero `can()` (recursive through teammates) and `cause` ('enemy' | 'terrain'), then:
     sideways → stuck heroes **squish** (stay), refuse only if nobody moves; forward → a stuck non-turret hero on the bottom
     row is `pinned` (would scroll off): if all pinned are enemy-held and movers fit, advance **without scrolling**
     (`noScroll`), else `refuse`; forward with nobody moving but an enemy blocker → hold-and-fight turn; terrain-only → refuse.
     `refuse()` shakes the board, jiggles, spends no turn. `hold` always runs.
  2. `runTurn`: move (+ camera scroll, `genRow`, `cull`) → pickups → **strike** (one hero at a time; `specialAction` for
     druid/engineer; `dmgOf` for rage; `pierce:false` stops at the first enemy/obstacle; hits deduped per enemy) →
     **enemies** sorted nearest-first, each `plan(e)` executed live (guardian redirects hits in this step) → **world**
     (spikes, boulders, vines) → turn++, `rerollBats`, game over check on `squad()`.
- **Enemy AI** is `plan(e)` — pure, returns `{kind: 'move'|'attack'|'idle', x, r, hero, dir?, flee?, ranged?}`. Helpers:
  `stepPlan`, `hunt`/`huntBig` (BFS via `bfsStep(sx, sr, goal, passable)`), `enemyPassable`, `fits(e, x, r)`.
- **Occupancy helpers:** `heroAt`, `enemyAt` (footprint-aware), `itemAt`, `solid`, `inView`, `aliveHeroes()` (incl. turrets),
  `squad()` (controllable heroes only).
- **Rendering:** DOM, not canvas. `render()` diffs entities into `#ents` via `ensure(id)`/`place()`; positions are CSS
  transforms from `pos(x, r, n)`; `renderOverlay()` draws ranges, rearrange targets and intents into `#ovl`; effects
  (`floatText`, `flashCells`, `attackerGlow`, `strikeFx`, `bump`, `hitFx`) go to `#fx` / element classes.
- **Debug hook:** `window.tilebound = { state, newGame(seed, party), tryMove, openParty, startRun, party, genRow(r) }`.

## Recipes

- **Add or change a hero:** add `HEROES.<key>` in the data file (`name, cls, hp, dmg, ability, desc, color, zone`, optional
  `pierce:false`, `heal`, `special`, `details[]`) and `ART.<key>` (40×40 SVG string). It appears on the party screen and wiki
  automatically. A new `special` needs code: strike loop / `specialAction` / `dmgOf` / the guardian redirect in `runTurn`.
- **Add or change an enemy:** `ENEMIES.<key>` (`from, weight, name, hp, dmg, pts, rule, details[]`, optional `size`, `elite`)
  + `ART.<key>` + a `case` in `plan(e)` (reuse `hunt`, `stepPlan`, or the slime/archer patterns). Spawning picks it up from
  `from`/`weight`. Elites are spawned separately at the end of `genRow`.
- **Add or change an item:** `ITEMS.<key>` (`spawn: {chance, from}` or none, `name, rule, details[]`) + art. **Order of
  `ITEMS` matters** (cumulative roll). Effects: pickup block in `runTurn` (step-on) or the world phase (per-turn). Decide
  whether it blocks heroes (`can()` in `tryMove`) and enemies (`enemyPassable`/`fits` allow only spikes).
- **Add or change a terrain structure:** metadata + example `sample` in data `STRUCTURES.<key>`, and a matching
  `{ key, make(r) }` entry in the game's `STRUCTURES` array returning `{ rows, items: [{ j, x, type }] }`.
  `rows[0]` is the **lowest** row (generated first, nearest the player) — the opposite of the data `sample`, which is written
  top row first. `j` indexes into `rows`. `chunkOk` rejects anything without a 2-wide opening per row or without a
  connected path, so shapes may be aggressive.
- **Tune difficulty:** `DIFFICULTY` (spawn curve, extra-enemy rows, HP/damage scaling, elite chance, safe rows) and enemy
  `from`/`weight`. The wiki's scaling table recomputes itself.
- **Change a movement/blocking rule:** edit `tryMove` (and `refuse` wording), then update the **Movement rules table** in
  tilebound-wiki.html and the rule scenarios in the smoke test.
- **Wiki-only edit:** prose in tilebound-wiki.html; generated cards/tables in tilebound-wiki.js. Keep it light — same dark
  theme, no libraries.

## Gotchas

- Game strings are single-quoted JS: an apostrophe inside (`can't`) is a syntax error — write "cannot" or use a template literal.
  Run `node -e "new Function(require('fs').readFileSync('docs/js/tilebound.js','utf8'))"` after edits.
- Never block input forever: everything during a turn runs under `S.busy`; `refuse()` must not set it.
- A rule that can strand the squad needs an escape: Hold always works, turrets never block, sideways moves squish.
- The game page omits Simple.css on purpose (like niu-lai-world). Mobile matters: hero dragging uses Pointer Events and
  `touch-action: none`; check 390px width has no horizontal scroll.
- localStorage keys: `tilebound.best`, `tilebound.party` — always wrapped in try/catch.

## Testing

```bash
node .claude/skills/tilebound/smoke-test.js
```

Runs in ~2 minutes (`TURNS=40` for a quicker pass). It loads the wiki and game headlessly and checks:
- the wiki renders an entry for every data item;
- the terrain is valid over 1,500 rows;
- a random-party run keeps every invariant (no overlaps, nothing inside a wall, heroes stay in the zone);
- rule scenarios hold: squish, wall refusal, hold-and-fight, ranger non-pierce and knight cleave;
- there are no console errors.

Add a scenario there whenever you change a rule. For one-off checks, drive `window.tilebound` from Playwright:
1. Click `#pGo` to leave the start screen.
2. Clear the board: `S.enemies = []`, `S.items = []`, and set every row to `'.'`.
3. Place units by pushing objects into `S.enemies` / `S.heroes`.
4. Call `tryMove(...)` and wait until `state.busy` is false.
5. Assert on positions, HP, `turn` and the `#log` / `#status` text.
