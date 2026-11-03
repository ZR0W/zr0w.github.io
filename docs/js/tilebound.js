// Tilebound — an endless, turn-based, cellular-automaton-style dungeon crawler.
//
// World model: the dungeon is 7 columns wide and infinitely tall. World rows are numbered upward
// (row r+1 is "forward" of row r). The camera shows H rows starting at S.camR; the bottom ZONE rows
// of the view are the deployment zone, and the squad always lives there. Moving forward shifts every
// hero and the camera up one row and generates a fresh row at the top.
//
// A turn: (1) choose — move, hold, or reposition one hero in the zone (repositioning spends the turn) →
// (2) move → (3) heroes strike → (4) visible enemies act → (5) interactables act.
// A hero blocked by an obstacle stays behind while the rest of the squad moves. If a blocked hero is at
// the border of the world (bottom row when advancing, or against a side wall) nothing moves: the board
// shakes, the stuck heroes jiggle, and no turn passes. "Hold" always succeeds, so the game can't lock up.
(() => {
  'use strict';

  const W = 7, H = 11, ZONE = 4;
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // ---------- seeded RNG (pass ?seed=123 for a reproducible run) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- temp art (inline SVG, 40×40) ----------
  const svg = (inner) => `<svg viewBox="0 0 40 40" aria-hidden="true">${inner}</svg>`;
  const eyes = (y, c = '#222') => `<circle cx="17.5" cy="${y}" r="1.2" fill="${c}"/><circle cx="22.5" cy="${y}" r="1.2" fill="${c}"/>`;
  const ART = {
    knight: svg(`<path d="M20 9 q8 -6 12 1" stroke="#d9473f" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M9 32 V19 a11 11 0 0 1 22 0 V32 Z" fill="#a9b3bf" stroke="#3a3f47" stroke-width="2"/>
      <rect x="12.5" y="19.5" width="15" height="4.5" rx="1.5" fill="#2b2f36"/>
      <path d="M20 9 V32" stroke="#3a3f47" stroke-width="1.5"/><circle cx="15" cy="28" r="1" fill="#3a3f47"/><circle cx="25" cy="28" r="1" fill="#3a3f47"/>`),
    ranger: svg(`<path d="M20 5 L34 34 H6 Z" fill="#3f7d4a" stroke="#24452a" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="20" cy="24" r="6.5" fill="#f0c9a0"/>${eyes(23.5)}<path d="M17.5 27 q2.5 1.5 5 0" stroke="#7a4a2a" stroke-width="1.2" fill="none"/>`),
    mage: svg(`<circle cx="20" cy="23" r="6" fill="#f0c9a0"/>${eyes(23)}
      <path d="M13.5 25 q6.5 15 13 0 q-6.5 4 -13 0Z" fill="#f4f1ea" stroke="#9a948a" stroke-width="1"/>
      <path d="M7 19 H33 L25 16 L20 3 L15 16 Z" fill="#5b3fa0" stroke="#2e1f55" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="20" cy="11" r="1.6" fill="#f5c542"/><circle cx="23" cy="15" r="1" fill="#f5c542"/>`),
    cleric: svg(`<ellipse cx="20" cy="6.5" rx="6" ry="2.5" fill="none" stroke="#e7b93a" stroke-width="2.2"/>
      <path d="M9 35 q0 -24 11 -24 q11 0 11 24Z" fill="#f2ead8" stroke="#8a7a5a" stroke-width="2"/>
      <circle cx="20" cy="20" r="5.5" fill="#f0c9a0"/>${eyes(19.5)}<path d="M18 22.5 q2 1.2 4 0" stroke="#7a4a2a" stroke-width="1" fill="none"/>
      <path d="M20 27 v6 M17 30 h6" stroke="#c9a032" stroke-width="2.2"/>`),
    skeleton: svg(`<path d="M8 19 a12 12 0 0 1 24 0 v6 h-3.5 v5 h-17 v-5 h-3.5Z" fill="#efeae0" stroke="#3b3a36" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="15" cy="19.5" r="3.4" fill="#2a2a2a"/><circle cx="25" cy="19.5" r="3.4" fill="#2a2a2a"/><path d="M20 23 l-1.8 3.2 h3.6z" fill="#2a2a2a"/>
      <path d="M16 27.5v2.5M20 27.5v2.5M24 27.5v2.5" stroke="#3b3a36" stroke-width="1.6"/>`),
    slime: svg(`<path d="M6 32 q0 -20 14 -20 q14 0 14 20 Z" fill="#4fc1b5" stroke="#1f6b63" stroke-width="2"/>
      <ellipse cx="14" cy="19" rx="3" ry="1.6" fill="#fff" opacity=".55"/><circle cx="16" cy="24" r="2.6" fill="#fff"/><circle cx="24" cy="24" r="2.6" fill="#fff"/>
      <circle cx="16.6" cy="24.6" r="1.3" fill="#1a1a1a"/><circle cx="24.6" cy="24.6" r="1.3" fill="#1a1a1a"/><path d="M18 28.5 q2 1.5 4 0" stroke="#1f6b63" stroke-width="1.3" fill="none"/>`),
    goblin: svg(`<path d="M3 14 L13 19 L13 24Z M37 14 L27 19 L27 24Z" fill="#7bb33f" stroke="#3d5e1d" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="20" cy="21" r="9.5" fill="#8cc44d" stroke="#3d5e1d" stroke-width="2"/>
      <path d="M13.5 17 l5 2.5 M26.5 17 l-5 2.5" stroke="#2a2a2a" stroke-width="2" stroke-linecap="round"/>
      <circle cx="16.5" cy="21.5" r="1.8" fill="#f5d33a"/><circle cx="23.5" cy="21.5" r="1.8" fill="#f5d33a"/>
      <path d="M15 26 h10" stroke="#2a2a2a" stroke-width="1.6"/><path d="M16.5 26 l1.2 2.4 l1.2 -2.4 M21.2 26 l1.2 2.4 l1.2 -2.4" fill="#fff"/>`),
    bat: svg(`<path d="M20 15 C14 9 6 9 2 15 C6 15 8 19 8 22 C11 19 14 20 15 23 C17 21 18 21 20 22 C22 21 23 21 25 23 C26 20 29 19 32 22 C32 19 34 15 38 15 C34 9 26 9 20 15Z"
      fill="#4a3561" stroke="#22172e" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="20" cy="19" r="5.5" fill="#5d4479" stroke="#22172e" stroke-width="1.5"/><path d="M16 14 l1.5 -4 l2 4 M24 14 l-1.5 -4 l-2 4" fill="#5d4479" stroke="#22172e" stroke-width="1.2"/>
      <circle cx="18" cy="18.5" r="1.2" fill="#ff4d4d"/><circle cx="22" cy="18.5" r="1.2" fill="#ff4d4d"/><path d="M18.5 22 l.8 1.6 l.8 -1.6" fill="#fff"/>`),
    orc: svg(`<rect x="8" y="11" width="24" height="23" rx="9" fill="#5f8a4a" stroke="#2e4524" stroke-width="2"/>
      <path d="M8 19 q12 -14 24 0 v-4 q-12 -9 -24 0Z" fill="#6b6f78" stroke="#2e4524" stroke-width="2"/>
      <path d="M13 21 l5 2 M27 21 l-5 2" stroke="#1d1d1d" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="24.5" r="1.5" fill="#ff5a3a"/><circle cx="24" cy="24.5" r="1.5" fill="#ff5a3a"/>
      <path d="M14 29.5 h12" stroke="#1d1d1d" stroke-width="1.8"/><path d="M15 30 l1.2 -4 l1.2 4Z M22.6 30 l1.2 -4 l1.2 4Z" fill="#fff" stroke="#bbb" stroke-width=".6"/>`),
    archer: svg(`<path d="M31 6 q8 14 0 28" stroke="#7a4a2a" stroke-width="2.4" fill="none"/><path d="M31 6 V34" stroke="#cfc8b8" stroke-width="1"/>
      <path d="M5 19 a11 11 0 0 1 22 0 v6 h-3 v5 h-16 v-5 h-3Z" fill="#e4ddcf" stroke="#3b3a36" stroke-width="2" stroke-linejoin="round"/>
      <path d="M5 16 q11 -9 22 0" fill="#7d2a2a" stroke="#3b3a36" stroke-width="1.5"/>
      <circle cx="11.5" cy="19.5" r="3" fill="#2a2a2a"/><circle cx="20.5" cy="19.5" r="3" fill="#2a2a2a"/><circle cx="11.5" cy="19.5" r="1" fill="#ff5a3a"/><circle cx="20.5" cy="19.5" r="1" fill="#ff5a3a"/>
      <path d="M16 23 l-1.5 3 h3z" fill="#2a2a2a"/><path d="M12.5 27.5v2.5M16 27.5v2.5M19.5 27.5v2.5" stroke="#3b3a36" stroke-width="1.5"/>`),
    golem: svg(`<path d="M4 36 L6 16 L12 8 L28 8 L34 16 L36 36 Z" fill="#6f7782" stroke="#2b3036" stroke-width="2" stroke-linejoin="round"/>
      <path d="M6 16 H34 M10 26 L16 22 M30 27 L25 23 M18 34 L20 29 L23 34" stroke="#454c55" stroke-width="1.6" fill="none"/>
      <path d="M10 6 L13 2 L16 6 L20 1 L24 6 L27 2 L30 6 Z" fill="#e7b93a" stroke="#7a5a12" stroke-width="1.2" stroke-linejoin="round"/>
      <rect x="11" y="12.5" width="6.5" height="3" rx="1" fill="#7df0ff"/><rect x="22.5" y="12.5" width="6.5" height="3" rx="1" fill="#7df0ff"/>
      <path d="M15 20 h10" stroke="#2b3036" stroke-width="2"/><circle cx="12" cy="31" r="1.4" fill="#454c55"/><circle cx="29" cy="31" r="1.4" fill="#454c55"/>`),
    rock: svg(`<path d="M6 32 L10 21 L19 16 L26 21 L33 20 L35 32 Z" fill="#6d665e" stroke="#2c2925" stroke-width="2" stroke-linejoin="round"/>
      <path d="M13 25 L18 21.5 M24 27 l4 -3" stroke="#8d857b" stroke-width="1.6"/><path d="M27 12 l4 -2 l2 4 l-4 1z" fill="#5d574f" stroke="#2c2925" stroke-width="1.4"/>`),
    pillar: svg(`<circle cx="20" cy="20" r="14" fill="#55514b" stroke="#2c2925" stroke-width="2"/><circle cx="20" cy="20" r="9.5" fill="#6e6a64" stroke="#3d3a35" stroke-width="1.2"/>
      <path d="M20 10.5 L17.5 19 L23 22.5 L21 29" stroke="#2c2925" stroke-width="1.5" fill="none"/>`),
    wall: svg(`<rect x="1" y="1" width="38" height="38" rx="5" fill="#4b463f"/>
      <g stroke="#2f2b26" stroke-width="2" fill="none"><path d="M1 10.5 H39 M1 20 H39 M1 29.5 H39"/><path d="M14 1 V10.5 M30 1 V10.5 M8 10.5 V20 M24 10.5 V20 M14 20 V29.5 M30 20 V29.5 M8 29.5 V39 M24 29.5 V39"/></g>`),
    chest: svg(`<path d="M7 17 q13 -11 26 0" fill="#b8742f" stroke="#4a2a10" stroke-width="2"/><rect x="7" y="17" width="26" height="16" rx="2" fill="#a0612b" stroke="#4a2a10" stroke-width="2"/>
      <rect x="18" y="11.5" width="4" height="21.5" fill="#e2b13c"/><rect x="16.5" y="19" width="7" height="6" rx="1.2" fill="#f3d36b" stroke="#4a2a10" stroke-width="1.2"/>`),
    potion: svg(`<rect x="15" y="4" width="10" height="4.5" rx="1" fill="#8a5a2b"/><path d="M16.5 8.5 h7 v7 l7 9 a9 9 0 0 1 -8 9.5 h-5 a9 9 0 0 1 -8 -9.5 l7 -9z" fill="#dfe8ec" stroke="#2f3a40" stroke-width="2"/>
      <path d="M10.6 25 h18.8 a8 8 0 0 1 -7.4 8 h-4 a8 8 0 0 1 -7.4 -8z" fill="#d6334a"/><path d="M18 27 h4 M20 25 v4" stroke="#fff" stroke-width="1.6"/>`),
    shrine: svg(`<rect x="11" y="29" width="18" height="6" rx="1" fill="#8b8478" stroke="#3a362f" stroke-width="1.5"/>
      <g stroke="#e7b93a" stroke-width="3.4" fill="none" stroke-linecap="round"><ellipse cx="20" cy="10.5" rx="4" ry="5"/><path d="M20 15.5 V28 M13.5 18.5 H26.5"/></g>`),
    spikesUp: svg(`<rect x="5" y="28" width="30" height="6" rx="1.5" fill="#5a5550"/>
      <path d="M7 28 L10.5 12 L14 28Z M14.5 28 L18 9 L21.5 28Z M22 28 L25.5 12 L29 28Z M28.5 28 L31 16 L33.5 28Z" fill="#c9cdd2" stroke="#4a4f55" stroke-width="1.2" stroke-linejoin="round"/>`),
    spikesDown: svg(`<rect x="5" y="28" width="30" height="6" rx="1.5" fill="#5a5550"/>
      <path d="M8 28 L10.5 24 L13 28Z M15.5 28 L18 23.5 L20.5 28Z M23 28 L25.5 24 L28 28Z" fill="#9aa0a6" stroke="#4a4f55" stroke-width="1"/>`),
    boulder: svg(`<circle cx="20" cy="21" r="14" fill="#857a6c" stroke="#3a332b" stroke-width="2"/>
      <path d="M11 16 q5 -6 11 -4 M24 30 q5 -2 7 -7" stroke="#a89c8c" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M15 25 l3 -2.5 l2.5 3.5" stroke="#3a332b" stroke-width="1.5" fill="none"/>`),
  };

  // ---------- definitions ----------
  // Attack zones are [dx, dr] offsets from the hero; dr > 0 is forward (up the screen).
  const HEROES = {
    knight: { name: 'Brannoc', cls: 'Knight', hp: 6, dmg: 2, ability: 'Cleave', desc: 'hits every enemy in the 3 squares in front (2 dmg)', color: '#ff6b5b', zone: [[-1, 1], [0, 1], [1, 1]] },
    ranger: { name: 'Wren', cls: 'Ranger', hp: 4, dmg: 1, ability: 'Longshot', desc: 'shoots the first enemy up to 4 squares straight ahead (1 dmg); no piercing, obstacles block', pierce: false, color: '#5cd67e', zone: [[0, 1], [0, 2], [0, 3], [0, 4]] },
    mage: { name: 'Ozric', cls: 'Mage', hp: 3, dmg: 2, ability: 'Arc Flame', desc: 'hits every enemy on both diagonals, 2 deep (2 dmg)', color: '#b48cff', zone: [[-1, 1], [1, 1], [-2, 2], [2, 2]] },
    cleric: { name: 'Sister Ilse', cls: 'Cleric', hp: 4, dmg: 1, ability: 'Sanctify', desc: 'smites foes beside her (1 dmg), heals allies beside her +1', color: '#ffd25a', zone: [[0, 1], [-1, 0], [1, 0], [0, -1]], heal: 1 },
  };
  const ENEMIES = {
    skeleton: { name: 'Skeleton', hp: 3, dmg: 1, pts: 10, rule: 'Sentry — if a hero is in line of sight straight below, marches 1 square toward it; otherwise stands still.' },
    slime: { name: 'Slime', hp: 3, dmg: 1, pts: 10, rule: 'Patrol — oozes one way until blocked, then back the other way. Splits into two small slimes when killed.' },
    goblin: { name: 'Goblin', hp: 3, dmg: 1, pts: 15, rule: 'Hunter — path-finds 1 square toward the nearest hero.' },
    bat: { name: 'Bat', hp: 2, dmg: 1, pts: 15, rule: 'Flits randomly. Bites an adjacent hero, then flees to the top of the screen for 5 turns and repeats.' },
    archer: { name: 'Skeleton Archer', hp: 2, dmg: 1, pts: 20, rule: 'Sniper — shoots the first hero in line of sight straight below (up to 5 squares); otherwise paces sideways.' },
    orc: { name: 'Orc Brute', hp: 6, dmg: 2, pts: 30, rule: 'Heavy hunter — chases the nearest hero, but only moves on even turns. Hits for 2.' },
    golem: { name: 'Stone Golem', hp: 12, dmg: 3, pts: 80, size: 2, elite: true, rule: 'ELITE, 2×2 — hunts the nearest hero every turn and hits for 3. Needs a 2-wide gap to pass; never overlaps walls, items or heroes.' },
  };
  const ITEMS = {
    chest: { name: 'Chest', rule: 'Step on it: +25 gold.' },
    potion: { name: 'Potion', rule: 'Step on it: that hero heals +3.' },
    shrine: { name: 'Shrine', rule: 'Step on it: revives a fallen hero and heals the squad +1.' },
    spikes: { name: 'Spike trap', rule: 'Raises / lowers every turn. 1 dmg to anyone on it while raised.' },
    boulder: { name: 'Boulder', rule: 'Rolls sideways, bouncing off walls. 2 dmg to whatever it rolls into. Blocks movement.' },
  };
  const DIRV = { up: [0, 1], left: [-1, 0], right: [1, 0], hold: [0, 0] };
  const NEIGH = [[0, -1], [-1, 0], [1, 0], [0, 1]]; // toward the squad first

  // ---------- state ----------
  let S;
  const rnd = () => S.rng();
  const ri = (n) => Math.floor(rnd() * n);
  const pick = (a) => a[ri(a.length)];

  function urlSeed() {
    const s = new URLSearchParams(location.search).get('seed');
    return s && /^\d+$/.test(s) ? Number(s) >>> 0 : null;
  }

  function newGame(seed) {
    S = {
      seed, rng: mulberry32(seed), camR: 0, turn: 1, gold: 0, kills: 0, killPts: 0,
      busy: false, over: false, sel: null, hover: null, nextId: 1,
      rows: new Map(), heroes: [], enemies: [], items: [], log: [],
    };
    for (let r = 0; r < H; r++) genRow(r);
    const start = [['ranger', 1, 1], ['knight', 3, 1], ['mage', 2, 0], ['cleric', 4, 0]];
    for (const [type, x, r] of start) {
      const d = HEROES[type];
      S.heroes.push({ id: 'h' + type, kind: 'hero', type, x, r, hp: d.hp, maxHp: d.hp, alive: true });
    }
    rerollBats();
    $('#ents').innerHTML = ''; $('#fx').innerHTML = ''; els.clear();
    $('#over').classList.remove('show');
    setStatus('Pick a direction — or tap a hero, then a gold square, to reposition it (costs a turn).');
    $('#log').innerHTML = '<li>Nothing yet — make your first move.</li>'; $('#logTurn').textContent = '';
    setPhase(1);
    buildSquad();
    render();
  }

  // ---------- world queries ----------
  const inView = (r) => r >= S.camR && r < S.camR + H;
  const topRow = () => S.camR + H - 1;
  function terrain(x, r) {
    if (x < 0 || x >= W) return 'edge';
    const row = S.rows.get(r);
    return row ? row[x] : 'edge';
  }
  const solid = (x, r) => terrain(x, r) !== '.';
  const heroAt = (x, r) => S.heroes.find((h) => h.alive && h.x === x && h.r === r);
  // Enemies can be bigger than one square (the 2×2 elite): (x, r) is the bottom-left of the footprint.
  const sizeOf = (e) => e.size || 1;
  const enemyAt = (x, r) => S.enemies.find((e) => e.hp > 0 && x >= e.x && x < e.x + sizeOf(e) && r >= e.r && r < e.r + sizeOf(e));
  const footprint = (x, r, n) => { const c = []; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) c.push([x + i, r + j]); return c; };
  // Could enemy `e` stand with its bottom-left at (x, r)? Every covered square must be open (its own squares count as open).
  function fits(e, x, r) {
    return footprint(x, r, sizeOf(e)).every(([cx, cr]) => {
      if (cx < 0 || cx >= W || !inView(cr) || solid(cx, cr) || heroAt(cx, cr)) return false;
      const o = enemyAt(cx, cr);
      if (o && o !== e) return false;
      const it = itemAt(cx, cr);
      return !it || it.type === 'spikes';
    });
  }
  const itemAt = (x, r) => S.items.find((i) => i.x === x && i.r === r);
  const aliveHeroes = () => S.heroes.filter((h) => h.alive);
  const visibleEnemies = () => S.enemies.filter((e) => e.hp > 0 && inView(e.r));
  const inZone = (x, r) => x >= 0 && x < W && r >= S.camR && r < S.camR + ZONE;
  // Enemies can't share a cell with terrain, units, or any item except spike traps.
  function enemyPassable(x, r) {
    if (!inView(r) || solid(x, r) || enemyAt(x, r) || heroAt(x, r)) return false;
    const it = itemAt(x, r);
    return !it || it.type === 'spikes';
  }
  // Rearrange targets: open zone squares without items (no free pickups).
  const zoneOpen = (x, r) => inZone(x, r) && !solid(x, r) && !enemyAt(x, r) && !itemAt(x, r);

  // ---------- infinite generation ----------
  // Guarantees: rows 0-3 are empty; a row has at most 2 obstacles; two obstacle rows are never adjacent.
  function genRow(r) {
    const row = Array(W).fill('.');
    S.rows.set(r, row);
    if (r < ZONE + 2) return; // the zone and the two rows ahead start empty
    const prev = S.rows.get(r - 1);
    if (!(prev && prev.some((c) => c !== '.')) && rnd() < 0.5) {
      const n = rnd() < 0.4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const x = ri(W);
        row[x] = x === 0 || x === W - 1 ? 'wall' : rnd() < 0.7 ? 'rock' : 'pillar';
      }
    }
    const freeX = () => {
      const opts = [];
      for (let x = 0; x < W; x++) if (row[x] === '.' && !enemyAt(x, r) && !itemAt(x, r)) opts.push(x);
      return opts.length ? pick(opts) : -1;
    };
    const roll = rnd();
    let it = null;
    if (roll < 0.06) it = 'chest';
    else if (roll < 0.10) it = 'potion';
    else if (roll < 0.15 && r > 6) it = 'spikes';
    else if (roll < 0.18 && r > 10) it = 'boulder';
    else if (roll < 0.20 && r > 15) it = 'shrine';
    if (it) {
      const x = freeX();
      if (x >= 0) S.items.push({ id: 'i' + S.nextId++, kind: 'item', type: it, x, r, up: rnd() < 0.5, dir: rnd() < 0.5 ? -1 : 1 });
    }
    // Difficulty: spawn chance, pack size, HP (+1 per 25 rows) and damage (+1 per 60 rows) all grow with depth.
    const p = Math.min(0.9, 0.4 + r * 0.008);
    let n = rnd() < p ? 1 : 0;
    if (r > 15 && rnd() < p * 0.5) n++;
    if (r > 45 && rnd() < p * 0.3) n++;
    const pool = ['skeleton', 'skeleton', 'slime', 'slime'];
    if (r > 5) pool.push('goblin', 'goblin');
    if (r > 9) pool.push('bat', 'bat');
    if (r > 12) pool.push('archer', 'archer');
    if (r > 16) pool.push('orc');
    for (let i = 0; i < n; i++) {
      const x = freeX();
      if (x < 0) break;
      spawnEnemy(pick(pool), x, r, Math.floor(r / 25), Math.floor(r / 60));
    }
    // Elite: occupies rows r-1..r. Rare, from depth 20, never two at once, only on a fully clear 2×2.
    if (r > 20 && rnd() < 0.08 && !S.enemies.some((e) => ENEMIES[e.type].elite)) {
      const probe = { size: 2 };
      const spots = [];
      for (let x = 0; x + 1 < W; x++) if (fits(probe, x, r - 1)) spots.push(x);
      if (spots.length) spawnEnemy('golem', pick(spots), r - 1, Math.floor(r / 25), Math.floor(r / 60));
    }
  }

  function spawnEnemy(type, x, r, hpBonus = 0, dmgBonus = 0, small = false) {
    const hp = small ? 1 : ENEMIES[type].hp + hpBonus;
    const e = { id: 'e' + S.nextId++, kind: 'enemy', type, x, r, hp, maxHp: hp, dmg: ENEMIES[type].dmg + dmgBonus,
      small, size: ENEMIES[type].size || 1, dir: rnd() < 0.5 ? -1 : 1, flee: 0, nextDir: type === 'bat' ? pick(NEIGH) : null };
    S.enemies.push(e);
    return e;
  }

  // Drop everything that scrolled off the bottom.
  function cull() {
    S.enemies = S.enemies.filter((e) => e.r >= S.camR);
    S.items = S.items.filter((i) => i.r >= S.camR);
    for (const r of S.rows.keys()) if (r < S.camR - 1) S.rows.delete(r);
  }

  function rerollBats() {
    for (const e of S.enemies) if (e.type === 'bat') e.nextDir = pick(NEIGH);
  }

  // ---------- enemy rules (pure: returns a plan, doesn't mutate) ----------
  // BFS over enemy-passable cells inside the view; returns the first step toward any goal cell.
  function bfsStep(sx, sr, goal, passable = enemyPassable) {
    const key = (x, r) => x + ',' + r;
    const prev = new Map([[key(sx, sr), null]]);
    const q = [[sx, sr]];
    while (q.length) {
      const [x, r] = q.shift();
      for (const [dx, dr] of NEIGH) {
        const nx = x + dx, nr = r + dr, k = key(nx, nr);
        if (prev.has(k) || nx < 0 || nx >= W || !inView(nr)) continue;
        if (goal(nx, nr)) {
          if (x === sx && r === sr) return [nx, nr];
          let c = [x, r];
          for (;;) { const p = prev.get(key(c[0], c[1])); if (p[0] === sx && p[1] === sr) return c; c = p; }
        }
        if (!passable(nx, nr)) continue;
        prev.set(k, [x, r]);
        q.push([nx, nr]);
      }
    }
    return null;
  }

  // Step into (x, r): attack if a hero is there, move if open, otherwise idle.
  function stepPlan(x, r, extra = {}) {
    const h = heroAt(x, r);
    if (h) return { kind: 'attack', hero: h, x, r, ...extra };
    if (enemyPassable(x, r)) return { kind: 'move', x, r, ...extra };
    return { kind: 'idle', ...extra };
  }

  function hunt(e) {
    if (sizeOf(e) > 1) return huntBig(e);
    const step = bfsStep(e.x, e.r, (x, r) => !!heroAt(x, r));
    return step ? stepPlan(step[0], step[1]) : { kind: 'idle' };
  }

  // Multi-square hunter: path-finds over bottom-left positions where its whole footprint fits.
  // Reaching a position whose footprint covers a hero means it is next to that hero: it attacks.
  function huntBig(e) {
    const n = sizeOf(e);
    const heroIn = (x, r) => footprint(x, r, n).map(([cx, cr]) => heroAt(cx, cr)).find(Boolean);
    const step = bfsStep(e.x, e.r, (x, r) => x + n <= W && r + n - 1 <= topRow() && !!heroIn(x, r), (x, r) => fits(e, x, r));
    if (!step) return { kind: 'idle' };
    const h = heroIn(step[0], step[1]);
    if (h) return { kind: 'attack', hero: h, x: h.x, r: h.r };
    return fits(e, step[0], step[1]) ? { kind: 'move', x: step[0], r: step[1] } : { kind: 'idle' };
  }

  function plan(e) {
    switch (e.type) {
      case 'skeleton': {
        for (let r = e.r - 1; r >= S.camR; r--) {
          if (solid(e.x, r)) break;
          if (heroAt(e.x, r)) return stepPlan(e.x, e.r - 1);
        }
        return { kind: 'idle', why: 'no hero in sight' };
      }
      case 'slime': {
        const a = stepPlan(e.x + e.dir, e.r);
        if (a.kind !== 'idle') return a;
        const b = stepPlan(e.x - e.dir, e.r, { dir: -e.dir });
        return b.kind !== 'idle' ? b : { kind: 'idle', dir: -e.dir };
      }
      case 'archer': {
        for (let r = e.r - 1; r >= Math.max(S.camR, e.r - 5); r--) {
          if (solid(e.x, r) || enemyAt(e.x, r)) break;
          const h = heroAt(e.x, r);
          if (h) return { kind: 'attack', hero: h, x: h.x, r: h.r, ranged: true };
        }
        const a = stepPlan(e.x + e.dir, e.r);
        if (a.kind === 'move') return a;
        const b = stepPlan(e.x - e.dir, e.r, { dir: -e.dir });
        return b.kind === 'move' ? b : { kind: 'idle', dir: -e.dir };
      }
      case 'goblin': case 'golem': return hunt(e);
      case 'orc': return S.turn % 2 === 0 ? hunt(e) : { kind: 'idle', why: 'resting' };
      case 'bat': {
        if (e.flee > 0) {
          const extra = { flee: e.flee - 1 };
          if (e.r === topRow()) return { kind: 'idle', why: 'fleeing', ...extra };
          const step = bfsStep(e.x, e.r, (x, r) => r === topRow() && enemyPassable(x, r));
          if (!step) return { kind: 'idle', why: 'fleeing', ...extra };
          return { ...stepPlan(step[0], step[1]), ...extra, kind: enemyPassable(step[0], step[1]) ? 'move' : 'idle' };
        }
        for (const [dx, dr] of NEIGH) {
          const h = heroAt(e.x + dx, e.r + dr);
          if (h) return { kind: 'attack', hero: h, x: h.x, r: h.r, flee: 5 };
        }
        const d = e.nextDir || [0, -1];
        const p = stepPlan(e.x + d[0], e.r + d[1]);
        return p.kind === 'move' ? p : { kind: 'idle' };
      }
    }
    return { kind: 'idle' };
  }

  // ---------- turn resolution ----------
  function tryMove(dir) {
    if (S.busy || S.over) return;
    const [dx, dr] = DIRV[dir];
    if (dir !== 'hold') {
      const memo = new Map();
      const cause = new Map(); // stuck hero → what ultimately blocks it: 'enemy' or 'terrain'
      const can = (h) => {
        if (memo.has(h)) return memo.get(h);
        memo.set(h, false);
        const nx = h.x + dx, nr = h.r + dr;
        const it = itemAt(nx, nr);
        let ok = !solid(nx, nr) && !enemyAt(nx, nr) && !(it && it.type === 'boulder');
        if (!ok) cause.set(h, enemyAt(nx, nr) ? 'enemy' : 'terrain');
        else { const o = heroAt(nx, nr); if (o) { ok = can(o); if (!ok) cause.set(h, cause.get(o)); } }
        memo.set(h, ok);
        return ok;
      };
      const all = aliveHeroes();
      const stuck = all.filter((h) => !can(h));
      // A stuck hero may stay behind while the rest move, unless it is at the border of the world:
      // on the bottom row when advancing (it would scroll off the map) or pressed against a side wall.
      const pinned = stuck.filter((h) => (dir === 'up' ? h.r === S.camR : terrain(h.x + dx, h.r) === 'edge'));
      const movers = all.filter((h) => !stuck.includes(h));
      // Held by an enemy on the bottom row: the rest still advance (and the held hero stays and
      // attacks) if they can do it inside the zone, so the view doesn't scroll and nobody is lost.
      // (With no movers at all this is simply "everyone holds and fights".)
      let note = '';
      if (dir === 'up' && pinned.length && pinned.every((h) => cause.get(h) === 'enemy')) {
        if (movers.every((h) => h.r + 1 < S.camR + ZONE)) return runTurn(dir, { dx, dr, movers, stuck, noScroll: true });
        note = 'advancing the others would take them past the deployment zone';
      }
      if (pinned.length) return refuse(dir, stuck, pinned, note);
      if (!movers.length) {
        // Nobody can move. Blocked by an enemy: the turn still happens — they stand and attack.
        // Blocked only by terrain: refuse, so a pointless press never wastes a turn.
        if (stuck.some((h) => cause.get(h) === 'enemy')) return runTurn(dir, { dx, dr, movers, stuck, noScroll: true });
        return refuse(dir, stuck, pinned);
      }
      return runTurn(dir, { dx, dr, movers, stuck });
    }
    runTurn('hold');
  }

  function jiggle(heroes) {
    for (const h of heroes) {
      const el = els.get(h.id);
      if (!el) continue;
      el.classList.remove('jiggle'); void el.offsetWidth; el.classList.add('jiggle');
    }
    setTimeout(() => { for (const h of heroes) els.get(h.id)?.classList.remove('jiggle'); }, 420);
  }

  function refuse(dir, blocked, pinned, note = '') {
    const board = $('#board');
    board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake');
    setTimeout(() => board.classList.remove('shake'), 420);
    jiggle(blocked);
    const names = (hs) => hs.map((h) => HEROES[h.type].name).join(', ');
    const word = { up: 'forward', left: 'left', right: 'right' }[dir];
    const why = !pinned.length ? `${names(blocked)} can't move ${word}`
      : dir === 'up' && note ? `${names(pinned)} ${pinned.length === 1 ? 'is' : 'are'} held by an enemy on the back row, and ${note}`
      : dir === 'up' ? `${names(pinned)} can't advance from the back row and would be left off the map`
      : `${names(pinned)} ${pinned.length === 1 ? 'is' : 'are'} against the edge of the world`;
    setStatus(`Blocked — ${why}. Nothing moved and no turn passed. Reposition someone, pick another direction, or hold.`, true);
  }

  function log(phase, text, cls = '') { S.log.push({ phase, text, cls }); }

  // dir: 'up' | 'left' | 'right' (squad moves; opts.movers move, opts.stuck stay put),
  // 'hold', or 'arrange' (a reposition was already applied; opts.text describes it).
  async function runTurn(dir, opts = {}) {
    S.busy = true; S.sel = null; S.log = [];
    setButtons(); highlightCard();
    // 2. move
    setPhase(2);
    const heroes = opts.movers || [];
    const stuck = opts.stuck || [];
    if (dir === 'hold') log('move', 'Squad holds position.');
    else if (dir === 'arrange') log('move', opts.text);
    else {
      for (const h of heroes) { h.x += opts.dx; h.r += opts.dr; }
      if (!heroes.length) log('move', 'Blocked by enemies — the squad stands its ground and attacks.');
      else if (dir === 'up' && opts.noScroll) log('move', 'Squad pushes forward inside the zone while the back row holds the line.');
      else if (dir === 'up') { S.camR++; genRow(topRow()); cull(); log('move', `Squad advances to depth ${S.camR}.`); }
      else log('move', `Squad sidesteps ${dir}.`);
      for (const h of stuck) log('move', `${HEROES[h.type].name} is blocked and ${heroes.length ? 'stays behind' : 'holds position'}.`, 'bad');
    }
    render();
    if (stuck.length) jiggle(stuck);
    await sleep(230);
    if (heroes.length) {
      for (const h of heroes) {
        const it = itemAt(h.x, h.r);
        if (!it) continue;
        const nm = HEROES[h.type].name;
        if (it.type === 'chest') { S.gold += 25; floatText(h.x, h.r, '+25g', 'gold'); log('move', `${nm} opens a chest: +25 gold.`, 'gold'); removeItem(it); }
        else if (it.type === 'potion') { const g = heal(h, 3); log('move', `${nm} drinks a potion: +${g} HP.`, 'good'); removeItem(it); }
        else if (it.type === 'shrine') { useShrine(h); removeItem(it); }
        else if (it.type === 'spikes' && it.up) { damage(h, 1); log('move', `${nm} steps on raised spikes: −1.`, 'bad'); }
      }
      render();
    }

    // 3. heroes strike — one hero at a time, so you can see who attacked and their full pattern
    setPhase(3);
    await sleep(100);
    let struck = false;
    for (const h of aliveHeroes()) {
      if (!h.alive) continue;
      const d = HEROES[h.type];
      const cells = d.zone.map(([ox, or]) => [h.x + ox, h.r + or]).filter(([x, r]) => x >= 0 && x < W && inView(r));
      // Zones hit everything in them, except non-piercing shots (the ranger): those stop at the
      // first enemy or obstacle along the line, nearest first.
      let targets = [];
      if (d.pierce === false) {
        for (const [x, r] of cells) {
          if (solid(x, r)) break;
          const e = enemyAt(x, r);
          if (e) { targets = [e]; break; }
        }
      } else targets = [...new Set(cells.map(([x, r]) => enemyAt(x, r)).filter(Boolean))];
      const heals = d.heal ? cells.map(([x, r]) => heroAt(x, r)).filter((a) => a && a.hp < a.maxHp) : [];
      if (!targets.length && !heals.length) continue;
      struck = true;
      strikeFx(h, d, cells, targets);
      await sleep(170);
      for (const e of targets) { log('strike', `${d.name} → ${ENEMIES[e.type].name}: −${d.dmg}.`); damage(e, d.dmg); }
      for (const a of heals) { heal(a, d.heal); log('strike', `${d.name} heals ${HEROES[a.type].name}: +${d.heal}.`, 'good'); }
      render();
      await sleep(330);
    }
    if (!struck) log('strike', 'No enemies in any attack zone.');

    // 4. enemies act (closest to the squad first, one at a time against the live board)
    setPhase(4);
    const order = visibleEnemies().sort((a, b) => a.r - b.r || a.x - b.x);
    for (const e of order) {
      if (e.hp <= 0 || !aliveHeroes().length) continue;
      const p = plan(e);
      if (p.dir !== undefined) e.dir = p.dir;
      if (p.flee !== undefined) e.flee = p.flee;
      const en = ENEMIES[e.type].name;
      if (p.kind === 'move') { e.x = p.x; e.r = p.r; }
      else if (p.kind === 'attack') {
        render(); // show the moves made so far, then play this attack on its own
        const path = [];
        if (p.ranged) for (let r = e.r - 1; r >= p.hero.r; r--) path.push([e.x, r]);
        else { path.push([p.hero.x, p.hero.r]); bump(e, p.hero); }
        attackerGlow(e.id, '#ff4a3a');
        flashCells(path, '#ff4a3a');
        await sleep(150);
        damage(p.hero, e.dmg);
        log('enemy', `${en} ${p.ranged ? 'shoots' : 'hits'} ${HEROES[p.hero.type].name}: −${e.dmg}.` + (e.type === 'bat' ? ' It flees upward.' : ''), 'bad');
        await sleep(260);
      }
    }
    if (!order.length) log('enemy', 'No enemies in sight.');
    else log('enemy', `${order.length} ${order.length === 1 ? 'enemy' : 'enemies'} took their turn.`);
    render();
    await sleep(order.length ? 260 : 100);

    // 5. interactables act
    setPhase(5);
    let worldActed = false;
    for (const it of S.items.filter((i) => inView(i.r))) {
      if (it.type === 'spikes') {
        it.up = !it.up; worldActed = true;
        if (it.up) {
          const u = heroAt(it.x, it.r) || enemyAt(it.x, it.r);
          if (u) { damage(u, 1); log('world', `Spikes rise under ${unitName(u)}: −1.`, u.kind === 'hero' ? 'bad' : ''); }
        }
      } else if (it.type === 'boulder') {
        worldActed = true;
        const nx = it.x + it.dir;
        const u = heroAt(nx, it.r) || enemyAt(nx, it.r);
        if (u) { damage(u, 2); bump(it, u); it.dir = -it.dir; log('world', `Boulder slams into ${unitName(u)}: −2.`, u.kind === 'hero' ? 'bad' : ''); }
        else if (solid(nx, it.r) || itemAt(nx, it.r)) it.dir = -it.dir;
        else it.x = nx;
      }
    }
    if (worldActed) { render(); await sleep(200); }

    S.turn++;
    rerollBats();
    showLog();
    if (!aliveHeroes().length) return gameOver();
    S.busy = false;
    setPhase(1);
    setStatus(dir === 'up' ? `Depth ${S.camR}. Your move.` : 'Your move.');
    render();
  }

  const unitName = (u) => (u.kind === 'hero' ? HEROES[u.type].name : ENEMIES[u.type].name);

  function damage(u, n) {
    u.hp -= n;
    floatText(u.x, u.r, '−' + n);
    hitFx(u.id);
    if (u.hp > 0) return;
    if (u.kind === 'hero') {
      u.hp = 0; u.alive = false;
      log('death', `${HEROES[u.type].name} has fallen!`, 'bad');
      buildSquad();
    } else {
      const d = ENEMIES[u.type];
      S.kills++; S.killPts += d.pts;
      log('death', `${d.name} destroyed: +${d.pts} pts.`, 'gold');
      S.enemies = S.enemies.filter((e) => e !== u);
      if (u.type === 'slime' && !u.small) {
        let made = 0;
        for (const [dx, dr] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
          if (made === 2) break;
          if (!enemyPassable(u.x + dx, u.r + dr)) continue;
          spawnEnemy('slime', u.x + dx, u.r + dr, 0, u.dmg - 1, true);
          made++;
        }
        if (made) log('death', `The slime splits into ${made} small slime${made > 1 ? 's' : ''}!`, 'bad');
      }
    }
  }

  function heal(h, n) {
    const g = Math.min(n, h.maxHp - h.hp);
    if (g > 0) { h.hp += g; floatText(h.x, h.r, '+' + g, 'heal'); }
    return g;
  }

  function useShrine(h) {
    const dead = S.heroes.find((x) => !x.alive);
    let msg = `${HEROES[h.type].name} prays at the shrine: squad +1 HP`;
    if (dead) {
      let spot = null;
      for (let r = S.camR; r < S.camR + ZONE && !spot; r++)
        for (let x = 0; x < W && !spot; x++) if (zoneOpen(x, r) && !heroAt(x, r)) spot = [x, r];
      if (spot) {
        dead.alive = true; dead.hp = Math.ceil(dead.maxHp / 2); [dead.x, dead.r] = spot;
        msg += `, ${HEROES[dead.type].name} returns`;
      }
    }
    for (const x of aliveHeroes()) heal(x, 1);
    log('move', msg + '.', 'good');
    buildSquad();
  }

  function removeItem(it) { S.items = S.items.filter((i) => i !== it); }

  function score() { return S.camR * 10 + S.killPts + S.gold; }
  function best() {
    try { return Number(localStorage.getItem('tilebound.best')) || 0; } catch { return 0; }
  }
  function saveBest(v) { try { localStorage.setItem('tilebound.best', String(v)); } catch { /* storage unavailable */ } }

  function gameOver() {
    S.over = true; S.busy = false;
    const sc = score(), b = best();
    if (sc > b) saveBest(sc);
    setPhase(0);
    render();
    $('#oScore').textContent = sc; $('#oDepth').textContent = S.camR; $('#oKills').textContent = S.kills; $('#oGold').textContent = S.gold;
    $('#oBest').textContent = sc > b ? 'New best!' : `Best: ${b}`;
    setStatus('Your squad has fallen. Press R or “Descend again”.', true);
    setTimeout(() => $('#over').classList.add('show'), 500);
  }

  // ---------- rendering ----------
  const els = new Map(); // entity id → element

  function buildFloor() {
    const f = $('#floor');
    let html = '';
    for (let sy = 0; sy < H; sy++) for (let x = 0; x < W; x++) html += `<div class="${sy >= H - ZONE ? 'zone' : sy === 0 ? 'top' : ''}"></div>`;
    f.innerHTML = html;
  }

  const sy = (r) => topRow() - r; // world row → screen row (0 = top)
  // translate() percentages are relative to the element, which is n squares wide for an n×n piece.
  const pos = (x, r, n = 1) => `translate(${(x * 100) / n}%, ${(sy(r + n - 1) * 100) / n}%)`;
  const pipHtml = (hp, max) => '<div class="pips">' + Array.from({ length: max }, (_, i) => `<i class="${i < hp ? '' : 'e'}"></i>`).join('') + '</div>';

  function ensure(id, cls) {
    let el = els.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'ent new ' + cls;
      el.dataset.id = id;
      el.innerHTML = '<div class="t"></div>';
      $('#ents').appendChild(el);
      els.set(id, el);
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('new')));
      if (cls.startsWith('hero')) {
        el.addEventListener('mouseenter', () => { S.hover = id; renderOverlay(); highlightCard(); });
        el.addEventListener('mouseleave', () => { if (S.hover === id) { S.hover = null; renderOverlay(); highlightCard(); } });
        el.addEventListener('pointerdown', (ev) => startDrag(ev, id, el));
      }
    }
    return el;
  }

  function setContent(el, key, html) {
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    el.querySelector('.t').innerHTML = html;
  }

  function render() {
    const seen = new Set();
    const place = (id, cls, x, r, key, html, n = 1) => {
      const el = ensure(id, cls);
      el.style.transform = pos(x, r, n);
      el.dataset.x = x; el.dataset.r = r; el.dataset.n = n;
      setContent(el, key, html);
      seen.add(id);
      return el;
    };
    for (let r = S.camR; r <= topRow(); r++) {
      const row = S.rows.get(r);
      for (let x = 0; x < W; x++) if (row[x] !== '.') place(`t${x}_${r}`, 'terrain', x, r, row[x], ART[row[x]]);
    }
    for (const it of S.items) {
      if (!inView(it.r)) continue;
      const art = it.type === 'spikes' ? (it.up ? 'spikesUp' : 'spikesDown') : it.type;
      place(it.id, 'item ' + it.type, it.x, it.r, art, ART[art]);
    }
    for (const e of S.enemies) {
      if (e.hp <= 0 || !inView(e.r)) continue;
      const cls = 'enemy' + (e.small ? ' small' : '') + (sizeOf(e) > 1 ? ' big' : '') + (ENEMIES[e.type].elite ? ' elite' : '');
      place(e.id, cls, e.x, e.r, `${e.type}${e.hp}/${e.maxHp}`, ART[e.type] + pipHtml(e.hp, e.maxHp), sizeOf(e));
    }
    for (const h of S.heroes) {
      if (!h.alive) continue;
      const el = place(h.id, 'hero', h.x, h.r, `${h.type}${h.hp}/${h.maxHp}`, ART[h.type] + pipHtml(h.hp, h.maxHp));
      el.classList.toggle('sel', S.sel === h.id);
    }
    for (const [id, el] of els) {
      if (seen.has(id)) continue;
      els.delete(id);
      el.classList.add('gone');
      el.style.transform = pos(Number(el.dataset.x), Number(el.dataset.r), Number(el.dataset.n) || 1); // slide with the camera as it fades
      setTimeout(() => el.remove(), 260);
    }
    renderOverlay();
    renderHud();
  }

  function renderOverlay() {
    const cellStyle = (x, r) => `left:${(x / W) * 100}%;top:${(sy(r) / H) * 100}%`;
    let html = '';
    // enemy intents (preview against the current board)
    for (const el of els.values()) { el.querySelector('.badge')?.remove(); el.querySelector('.threat')?.remove(); }
    const threatened = new Set();
    if (!S.busy && !S.over) {
      for (const e of visibleEnemies()) {
        const p = plan(e);
        const el = els.get(e.id);
        let badge = '·', cls = 'idle';
        if (p.kind === 'move') {
          const n = sizeOf(e);
          html += `<div class="ov intent" style="${cellStyle(p.x, p.r + n - 1)};width:${(n / W) * 100}%;height:${(n / H) * 100}%"></div>`;
          const dx = p.x - e.x, dr = p.r - e.r;
          badge = dr < 0 ? '↓' : dr > 0 ? '↑' : dx < 0 ? '←' : '→'; cls = '';
        } else if (p.kind === 'attack') { badge = '!'; cls = 'atk'; threatened.add(p.hero.id); }
        if (el) el.insertAdjacentHTML('beforeend', `<div class="badge ${cls}">${badge}</div>`);
      }
      for (const id of threatened) els.get(id)?.insertAdjacentHTML('beforeend', '<div class="threat">!</div>');
    }
    // attack range of hovered / selected hero
    const show = S.heroes.find((h) => h.alive && h.id === (S.hover || S.sel));
    if (show) {
      for (const [ox, or] of HEROES[show.type].zone) {
        const x = show.x + ox, r = show.r + or;
        if (x >= 0 && x < W && inView(r)) html += `<div class="ov range" style="${cellStyle(x, r)}"></div>`;
      }
    }
    // rearrange targets
    const sel = S.heroes.find((h) => h.alive && h.id === S.sel);
    if (sel && !S.busy) {
      for (let r = S.camR; r < S.camR + ZONE; r++)
        for (let x = 0; x < W; x++)
          if (zoneOpen(x, r) && !heroAt(x, r)) html += `<div class="ov target" data-x="${x}" data-r="${r}" style="${cellStyle(x, r)}"></div>`;
    }
    $('#ovl').innerHTML = html;
  }

  function renderHud() {
    const sc = score();
    for (const id of ['#hScore', '#sScore']) $(id).textContent = sc;
    for (const id of ['#hDepth', '#sDepth']) $(id).textContent = S.camR;
    $('#hTurn').textContent = S.turn;
    $('#sKills').textContent = S.kills;
    $('#sGold').textContent = S.gold;
    $('#sBest').textContent = Math.max(best(), sc);
    $('#sSeed').textContent = S.seed;
    const foes = visibleEnemies().length;
    $('#foeCount').textContent = `${foes} ${foes === 1 ? 'enemy' : 'enemies'} in sight`;
    // squad hp
    for (const h of S.heroes) {
      const c = document.querySelector(`.card[data-id="${h.id}"]`);
      if (!c) continue;
      c.querySelector('.hpwrap').innerHTML = pipHtml(h.hp, h.maxHp).replace('</div>', `<span class="hpnum">${h.hp}/${h.maxHp}</span></div>`);
    }
    const alive = aliveHeroes().length;
    $('#aliveCount').textContent = `${alive} ${alive === 1 ? 'HERO' : 'HEROES'}`;
    // in-sight list
    const types = new Map();
    for (const e of visibleEnemies()) types.set(e.type, (types.get(e.type) || 0) + 1);
    const itypes = new Map();
    for (const i of S.items) if (inView(i.r)) itypes.set(i.type, (itypes.get(i.type) || 0) + 1);
    let html = '';
    for (const [t, n] of types) html += `<li><div class="ic">${ART[t]}</div><div><b>${ENEMIES[t].name}${n > 1 ? ' ×' + n : ''}</b> — ${ENEMIES[t].rule}</div></li>`;
    for (const [t, n] of itypes) html += `<li><div class="ic it">${ART[t === 'spikes' ? 'spikesUp' : t]}</div><div><b>${ITEMS[t].name}${n > 1 ? ' ×' + n : ''}</b> — ${ITEMS[t].rule}</div></li>`;
    $('#intents').innerHTML = html || '<li class="none">Nothing in sight. Push forward.</li>';
    setButtons();
  }

  function buildSquad() {
    let html = '';
    for (const h of S.heroes) {
      const d = HEROES[h.type];
      const zone = new Set(d.zone.map(([x, y]) => `${x},${y}`));
      let mini = '';
      for (let y = 4; y >= -1; y--) for (let x = -2; x <= 2; x++) mini += `<i class="${x === 0 && y === 0 ? 'h' : zone.has(`${x},${y}`) ? 'a' : ''}"></i>`;
      html += `<div class="card${h.alive ? '' : ' dead'}" data-id="${h.id}">
        <div class="icon">${ART[h.type]}</div>
        <div><div class="nm">${d.name}</div><div class="cl caps">${d.cls}${h.alive ? '' : ' · fallen'}</div><div class="hpwrap"></div></div>
        <div class="mini">${mini}</div>
        <div class="ab"><b>${d.ability}</b> — ${d.desc}</div></div>`;
    }
    $('#squad').innerHTML = html;
    for (const c of document.querySelectorAll('.card')) {
      c.addEventListener('mouseenter', () => { S.hover = c.dataset.id; renderOverlay(); });
      c.addEventListener('mouseleave', () => { S.hover = null; renderOverlay(); });
      c.addEventListener('click', () => clickHero(c.dataset.id));
    }
  }

  function highlightCard() {
    for (const c of document.querySelectorAll('.card')) c.classList.toggle('on', c.dataset.id === (S.hover || S.sel));
  }

  function floatText(x, r, text, cls = '', color = '') {
    if (!inView(r)) return;
    const d = document.createElement('div');
    d.className = 'float ' + cls;
    if (color) d.style.color = color;
    d.textContent = text;
    d.style.left = (x / W) * 100 + '%';
    d.style.top = (sy(r) / H) * 100 + '%';
    $('#fx').appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  // Briefly paint cells in a colour; `hit` cells (with a target) are painted stronger.
  function flashCells(cells, color, hit = new Set()) {
    for (const [x, r] of cells) {
      const d = document.createElement('div');
      d.className = 'ov pattern' + (hit.has(x + ',' + r) ? ' hit' : '');
      d.style.setProperty('--c', color);
      d.style.left = (x / W) * 100 + '%';
      d.style.top = (sy(r) / H) * 100 + '%';
      $('#fx').appendChild(d);
      setTimeout(() => d.remove(), 750);
    }
  }

  function attackerGlow(id, color) {
    const el = els.get(id);
    if (!el) return;
    el.style.setProperty('--c', color);
    el.classList.remove('striking'); void el.offsetWidth; el.classList.add('striking');
    setTimeout(() => el.classList.remove('striking'), 520);
  }

  // A hero's attack: glow + lunge, its skill name, its card lights up, and its whole pattern flashes.
  function strikeFx(h, d, cells, targets) {
    attackerGlow(h.id, d.color);
    if (h.type !== 'cleric') bump(h, { x: h.x, r: h.r + 1 });
    floatText(h.x, h.r, d.ability, 'skill', d.color);
    flashCells(cells, d.color, new Set(cells.filter(([x, r]) => targets.includes(enemyAt(x, r))).map(([x, r]) => x + ',' + r)));
    const card = document.querySelector(`.card[data-id="${h.id}"]`);
    if (card) {
      card.style.setProperty('--c', d.color);
      card.classList.remove('striking'); void card.offsetWidth; card.classList.add('striking');
      setTimeout(() => card.classList.remove('striking'), 600);
    }
  }

  function hitFx(id) {
    const el = els.get(id);
    if (!el) return;
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
    setTimeout(() => el.classList.remove('hit'), 340);
  }

  // Lunge a piece halfway toward its target and back (bump attack).
  function bump(a, target) {
    const el = els.get(a.id);
    if (!el) return;
    const n = a.size || 1;
    const mx = (a.x + (target.x - a.x) * 0.35 / n), mr = (a.r + (target.r - a.r) * 0.35 / n);
    el.style.transform = pos(mx, mr, n);
    setTimeout(() => { el.style.transform = pos(a.x, a.r, n); }, 120);
  }

  function setPhase(n) {
    for (const li of document.querySelectorAll('#phases li')) li.classList.toggle('on', Number(li.dataset.p) === n);
  }

  function setStatus(text, warn = false) {
    const s = $('#status');
    s.textContent = text;
    s.classList.toggle('warn', warn);
  }

  function setButtons() {
    const dis = S.busy || S.over;
    for (const id of ['#bLeft', '#bUp', '#bRight', '#bHold']) $(id).disabled = dis;
  }

  const PHASE_LABEL = { move: 'move', strike: 'strike', enemy: 'enemies', world: 'world', death: '—' };
  function showLog() {
    $('#logTurn').textContent = `TURN ${S.turn - 1}`;
    $('#log').innerHTML = S.log.map((l) => `<li class="${l.cls}"><em>${PHASE_LABEL[l.phase]}</em>${l.text}</li>`).join('');
  }

  // ---------- input ----------
  function clickHero(id) {
    if (S.busy || S.over) return;
    const h = S.heroes.find((x) => x.id === id && x.alive);
    if (!h) return;
    if (!S.sel) { S.sel = id; setStatus(`${HEROES[h.type].name} selected — click a gold + square to move, or another hero to swap.`); }
    else if (S.sel === id) { S.sel = null; setStatus('Your move.'); }
    else return swapHeroes(S.heroes.find((x) => x.id === S.sel), h);
    render(); highlightCard();
  }

  // Both repositioning paths (tap-tap and drag-drop) end here; each spends the turn.
  function swapHeroes(a, b) {
    [a.x, a.r, b.x, b.r] = [b.x, b.r, a.x, a.r];
    runTurn('arrange', { text: `${HEROES[a.type].name} and ${HEROES[b.type].name} swap places.` });
  }
  function repositionHero(h, x, r) {
    h.x = x; h.r = r;
    runTurn('arrange', { text: `${HEROES[h.type].name} repositions.` });
  }

  $('#ovl').addEventListener('click', (ev) => {
    const t = ev.target.closest('.target');
    if (!t || S.busy || S.over) return;
    const h = S.heroes.find((x) => x.id === S.sel);
    if (h) repositionHero(h, Number(t.dataset.x), Number(t.dataset.r));
  });

  // Drag a hero onto a gold square (move) or another hero (swap). A press that doesn't travel
  // is a tap and falls back to tap-to-select. Pointer events cover mouse, touch and pen alike.
  function cellAtPoint(px, py) {
    const b = $('#board').getBoundingClientRect();
    if (px < b.left || px >= b.right || py < b.top || py >= b.bottom) return null;
    const x = Math.floor(((px - b.left) / b.width) * W);
    const r = topRow() - Math.floor(((py - b.top) / b.height) * H);
    return [x, r];
  }

  function startDrag(ev, id, el) {
    if (S.busy || S.over || ev.button > 0) return;
    ev.preventDefault();
    const h = S.heroes.find((x) => x.id === id && x.alive);
    if (!h) return;
    const sx = ev.clientX, sy0 = ev.clientY;
    let ghost = null, hot = null;
    el.setPointerCapture(ev.pointerId);
    const move = (e) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy0) < 8) return;
        S.sel = id; S.hover = id; render(); highlightCard();
        const rect = el.getBoundingClientRect();
        ghost = document.createElement('div');
        ghost.className = 'ent hero ghost';
        ghost.style.width = rect.width + 'px'; ghost.style.height = rect.height + 'px';
        ghost.innerHTML = el.querySelector('.t').outerHTML;
        document.body.appendChild(ghost);
        el.classList.add('dragging');
        setStatus(`Drop ${HEROES[h.type].name} on a gold square to move, or on another hero to swap (costs a turn).`);
      }
      ghost.style.transform = `translate(${e.clientX - ghost.offsetWidth / 2}px, ${e.clientY - ghost.offsetHeight / 2}px)`;
      const c = cellAtPoint(e.clientX, e.clientY);
      const t = c && document.querySelector(`.ov.target[data-x="${c[0]}"][data-r="${c[1]}"]`);
      if (t !== hot) { hot?.classList.remove('hot'); t?.classList.add('hot'); hot = t; }
    };
    const end = (e) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      if (!ghost) { if (e.type === 'pointerup') clickHero(id); return; }
      ghost.remove(); el.classList.remove('dragging');
      S.hover = null;
      const c = e.type === 'pointerup' && cellAtPoint(e.clientX, e.clientY);
      const other = c && heroAt(c[0], c[1]);
      if (c && other && other !== h) return swapHeroes(h, other);
      if (c && zoneOpen(c[0], c[1]) && !heroAt(c[0], c[1])) return repositionHero(h, c[0], c[1]);
      S.sel = null;
      setStatus('Drop cancelled — nothing moved.');
      render(); highlightCard();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  document.addEventListener('click', (ev) => {
    if (S.sel && !ev.target.closest('.ent.hero, .ov.target, .card, .controls')) { S.sel = null; render(); highlightCard(); }
  });

  $('#bLeft').addEventListener('click', () => tryMove('left'));
  $('#bRight').addEventListener('click', () => tryMove('right'));
  $('#bUp').addEventListener('click', () => tryMove('up'));
  $('#bHold').addEventListener('click', () => tryMove('hold'));
  const again = () => newGame((Math.random() * 2 ** 32) >>> 0);
  $('#newRun').addEventListener('click', again);
  $('#oAgain').addEventListener('click', again);

  document.addEventListener('keydown', (ev) => {
    if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    const map = { w: 'up', arrowup: 'up', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', ' ': 'hold', s: 'hold', arrowdown: 'hold' };
    if (map[k]) { ev.preventDefault(); tryMove(map[k]); }
    else if (k === 'escape' && S.sel) { S.sel = null; render(); highlightCard(); }
    else if (k === 'r' && S.over) again();
  });

  buildFloor();
  newGame(urlSeed() ?? ((Math.random() * 2 ** 32) >>> 0));

  // Small hook for debugging / automated checks in the console.
  window.tilebound = { get state() { return S; }, newGame, tryMove };
})();
