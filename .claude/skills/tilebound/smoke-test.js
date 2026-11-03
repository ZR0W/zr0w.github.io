// Tilebound smoke test (headless Chromium via Playwright, which is preinstalled in Claude cloud sessions).
//   node .claude/skills/tilebound/smoke-test.js            # ~2 min
//   TURNS=40 node .claude/skills/tilebound/smoke-test.js   # quicker
// Checks: no page errors on game + wiki; terrain validity over many rows; a random-party run where after
// every turn no unit overlaps or sits in a wall and heroes stay in the zone; a few rule scenarios.
// Exits non-zero on any failure. It is a dev tool only — nothing in docs/ depends on it.
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../..');
const game = 'file://' + path.join(root, 'docs/tools/tilebound.html');
const wiki = 'file://' + path.join(root, 'docs/tools/tilebound-wiki.html');
const TURNS = Number(process.env.TURNS || 120);
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // ---- wiki renders from the shared data ----
  await page.goto(wiki);
  const entries = await page.locator('[data-entry]').count();
  const expected = await page.evaluate(() => { const T = window.TILEBOUND; return [T.HEROES, T.ENEMIES, T.ITEMS, T.STRUCTURES].reduce((a, o) => a + Object.keys(o).length, 0); });
  check('wiki renders one entry per hero/enemy/item/structure', entries === expected, `${entries}/${expected}`);

  // ---- game ----
  await page.goto(game + '?seed=1');
  await page.click('#pGo'); // start screen → classic party
  const T = 'window.tilebound';

  const terrain = await page.evaluate(() => {
    const T = window.tilebound, W = window.TILEBOUND.W; let bad = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      T.newGame(seed); const S = T.state;
      for (let r = 11; r < 300; r++) T.genRow(r);
      for (let r = 0; r < 300; r++) { let run = 0, best = 0; for (const c of S.rows.get(r)) { run = c === '.' ? run + 1 : 0; best = Math.max(best, run); } if (best < 2) bad++; }
      const seen = new Set(), q = [];
      for (let x = 0; x < W; x++) if (S.rows.get(0)[x] === '.') { seen.add(x + ',0'); q.push([x, 0]); }
      while (q.length) { const [x, r] = q.shift(); for (const [dx, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nr = r + dr, k = nx + ',' + nr; if (nx < 0 || nx >= W || nr < 0 || nr >= 300 || seen.has(k) || S.rows.get(nr)[nx] !== '.') continue; seen.add(k); q.push([nx, nr]); } }
      if (![...Array(W).keys()].some((x) => seen.has(x + ',299'))) bad += 1000;
    }
    return bad;
  });
  check('terrain: every row has a 2-wide opening and the map connects', terrain === 0, `violations=${terrain}`);

  const run = await page.evaluate(async (turns) => {
    const T = window.tilebound, { HEROES, H, ZONE } = window.TILEBOUND, sl = (ms) => new Promise((r) => setTimeout(r, ms));
    const pickable = Object.keys(HEROES).filter((k) => !HEROES[k].hidden), dirs = ['up', 'up', 'up', 'left', 'right', 'hold'];
    let done = 0, maxDepth = 0;
    for (let g = 0; g < 3; g++) {
      T.newGame(700 + g, pickable.slice().sort(() => Math.random() - 0.5).slice(0, 4)); const S = () => T.state;
      for (let i = 0; i < turns / 3 && !S().over; i++) {
        const t0 = S().turn; T.tryMove(dirs[Math.floor(Math.random() * dirs.length)]); while (S().busy) await sl(8);
        if (S().turn === t0) { T.tryMove('hold'); while (S().busy) await sl(8); }
        done++; maxDepth = Math.max(maxDepth, S().camR);
        const occ = new Map();
        for (const h of S().heroes) if (h.alive) {
          const k = h.x + ',' + h.r; if (occ.has(k)) return 'hero overlap at ' + k; occ.set(k, 1);
          if (S().rows.get(h.r)[h.x] !== '.') return 'hero inside a wall';
          if (!h.static && (h.r < S().camR || h.r >= S().camR + ZONE)) return 'hero outside the zone';
        }
        for (const e of S().enemies) { const n = e.size || 1; for (let j = 0; j < n; j++) for (let i2 = 0; i2 < n; i2++) {
          const x = e.x + i2, r = e.r + j; if (r >= S().camR + H) continue; const k = x + ',' + r;
          if (S().rows.get(r) && S().rows.get(r)[x] !== '.') return e.type + ' inside a wall'; if (occ.has(k)) return e.type + ' overlaps at ' + k; occ.set(k, 1);
        } }
      }
    }
    return { done, maxDepth };
  }, TURNS);
  check('random-party run keeps every invariant', typeof run === 'object', JSON.stringify(run));

  const rules = await page.evaluate(async () => {
    const T = window.tilebound, sl = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
    const setup = (party, f) => { T.newGame(3, party); const S = T.state; S.enemies = []; S.items = []; for (const r of S.rows.keys()) S.rows.set(r, Array(7).fill('.')); f(S, (t) => S.heroes.find((h) => h.type === t)); };
    const act = async (d) => { T.tryMove(d); while (T.state.busy) await sl(8); return T.state.turn; };
    const foe = (S, x, r, hp = 9) => S.enemies.push({ id: 'e' + x + '_' + r, kind: 'enemy', type: 'skeleton', x, r, hp, maxHp: hp, dmg: 0, dir: 1, flee: 0 });
    // squish: cleric at the left wall, others move left
    setup(['ranger', 'knight', 'mage', 'cleric'], (S, H) => { H('cleric').x = 0; });
    out.squish = (await act('left')) === 2 && T.state.heroes.find((h) => h.type === 'mage').x === 1;
    // whole squad against the wall → refused, no turn
    setup(['ranger', 'knight', 'mage', 'cleric'], (S, H) => { ['ranger', 'knight', 'mage', 'cleric'].forEach((t, i) => { H(t).x = 0; H(t).r = i; }); });
    out.wallRefused = (await act('left')) === 1;
    // lone knight facing an enemy holds and attacks on forward
    setup(['ranger', 'knight', 'mage', 'cleric'], (S, H) => { S.heroes.forEach((h) => { if (h.type !== 'knight') h.alive = false; }); H('knight').r = 2; foe(S, 3, 3); });
    out.holdAndFight = (await act('up')) === 2 && T.state.enemies[0].hp === 7;
    // ranger does not pierce; knight hits all 3
    setup(['ranger', 'knight', 'mage', 'cleric'], (S) => { foe(S, 1, 3); foe(S, 1, 4); foe(S, 2, 2); foe(S, 3, 2); });
    await act('hold');
    const hp = Object.fromEntries(T.state.enemies.map((e) => [e.id, e.hp]));
    out.patterns = hp.e1_3 === 8 && hp.e1_4 === 9 && hp.e2_2 === 7 && hp.e3_2 === 7;
    return out;
  });
  for (const [k, v] of Object.entries(rules)) check('rule: ' + k, v === true);

  check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
