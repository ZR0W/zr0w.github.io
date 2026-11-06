// Tilebound — shared game data: art, heroes, enemies, items, terrain structures and difficulty numbers.
// Loaded by the game (tools/tilebound.html → js/tilebound.js) AND by the wiki
// (tools/tilebound-wiki.html → js/tilebound-wiki.js), so the wiki always matches the game.
// Change a number here and both update. See .claude/skills/tilebound/SKILL.md for the full map.
(() => {
  'use strict';
  const W = 7, H = 11, ZONE = 4; // board width, visible rows, deployment-zone rows

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
    lancer: svg(`<path d="M33 4 V37" stroke="#7a5a3a" stroke-width="2.4"/><path d="M33 0.5 L36.5 8.5 H29.5Z" fill="#cfd6de" stroke="#4a4f55" stroke-width="1.2"/>
      <path d="M7 37 q0 -12 11 -12 q11 0 11 12Z" fill="#b8323a" stroke="#5a1a1e" stroke-width="1.6"/>
      <circle cx="18" cy="20" r="7.5" fill="#f0c9a0"/><path d="M9.5 19 a8.5 8.5 0 0 1 17 0 Z" fill="#a9b3bf" stroke="#3a3f47" stroke-width="1.6"/>
      <circle cx="15.5" cy="22" r="1.1" fill="#222"/><circle cx="20.5" cy="22" r="1.1" fill="#222"/>`),
    rogue: svg(`<path d="M20 4 C31 4 34 16 34 35 H6 C6 16 9 4 20 4Z" fill="#3a3346" stroke="#1d1a24" stroke-width="2"/>
      <ellipse cx="20" cy="22" rx="7.5" ry="7" fill="#f0c9a0"/><rect x="12" y="19" width="16" height="4.5" rx="2" fill="#1d1a24"/>
      <circle cx="16.8" cy="21.2" r="1" fill="#fff"/><circle cx="23.2" cy="21.2" r="1" fill="#fff"/>
      <path d="M3 31 L11 25 M37 31 L29 25" stroke="#cfd6de" stroke-width="2.4" stroke-linecap="round"/>`),
    guardian: svg(`<path d="M20 3 L35 8.5 V20 C35 29 28 34.5 20 37.5 C12 34.5 5 29 5 20 V8.5 Z" fill="#4f6d9a" stroke="#22324a" stroke-width="2"/>
      <path d="M20 8 V33 M10 18 H30" stroke="#e7b93a" stroke-width="3.2"/><circle cx="20" cy="18" r="3" fill="#e7b93a"/>`),
    bombardier: svg(`<circle cx="18" cy="24" r="11.5" fill="#2d2f36" stroke="#111" stroke-width="2"/><rect x="14" y="11" width="8" height="4" rx="1" fill="#56606d"/>
      <path d="M22 12 q5 -7 11 -5" stroke="#8a5a2b" stroke-width="2" fill="none"/><path d="M34 7 l2.5 -3 M35 8.5 l3.5 0 M33 5 l0 -3.5" stroke="#ffb340" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="13.5" cy="20" r="3" fill="#5c6675"/><circle cx="14" cy="26" r="2.6" fill="#ff5fa2"/><circle cx="22" cy="26" r="2.6" fill="#ff5fa2"/>`),
    monk: svg(`<path d="M7 37 q0 -15 13 -15 q13 0 13 15Z" fill="#e8892d" stroke="#7a3f10" stroke-width="2"/><path d="M13 24 L25 37" stroke="#b5561a" stroke-width="2.4"/>
      <circle cx="20" cy="15" r="8" fill="#f0c9a0" stroke="#9a6a4a" stroke-width="1.2"/><path d="M16 15.5 h2.4 M21.6 15.5 h2.4" stroke="#222" stroke-width="1.4" stroke-linecap="round"/>
      <circle cx="20" cy="8.6" r="1" fill="#c9862d"/><circle cx="16.4" cy="9.6" r="1" fill="#c9862d"/><circle cx="23.6" cy="9.6" r="1" fill="#c9862d"/>`),
    druid: svg(`<path d="M13 13 L8 4 M10.5 8.5 L5 7.5 M27 13 L32 4 M29.5 8.5 L35 7.5" stroke="#7a5a3a" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M7 37 q0 -19 13 -19 q13 0 13 19Z" fill="#4e7a3a" stroke="#25401a" stroke-width="2"/>
      <circle cx="20" cy="17" r="6.5" fill="#f0c9a0"/>${eyes(17)}<path d="M13 31 q7 -7 14 0 q-7 4.5 -14 0Z" fill="#8cc44d" stroke="#3d5e1d" stroke-width="1"/>`),
    berserker: svg(`<path d="M9 15 q-5 -6 -1 -12 q2 7 7 9 M31 15 q5 -6 1 -12 q-2 7 -7 9" fill="#e9e2cc" stroke="#6a6250" stroke-width="1.5"/>
      <circle cx="20" cy="22" r="7.5" fill="#f0c9a0"/><path d="M9 20 a11 11 0 0 1 22 0Z" fill="#8a8f98" stroke="#3a3f47" stroke-width="2"/>
      <path d="M15.5 22 l3 1 M24.5 22 l-3 1" stroke="#222" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M12 25 q8 17 16 0 q-8 5 -16 0Z" fill="#c4532a" stroke="#7a2a12" stroke-width="1.2"/>`),
    engineer: svg(`<circle cx="20" cy="22" r="10" fill="#f0c9a0" stroke="#9a6a4a" stroke-width="1.2"/><path d="M8.5 18 a11.5 11.5 0 0 1 23 0Z" fill="#d9a03a" stroke="#7a5212" stroke-width="2"/>
      <path d="M8 21 H32" stroke="#3a3f47" stroke-width="1.6"/><circle cx="15.5" cy="21" r="3.4" fill="#7df0ff" stroke="#3a3f47" stroke-width="1.6"/><circle cx="24.5" cy="21" r="3.4" fill="#7df0ff" stroke="#3a3f47" stroke-width="1.6"/>
      <path d="M17 28 q3 1.6 6 0" stroke="#7a4a2a" stroke-width="1.2" fill="none"/><path d="M31 37 L36 30 M34.5 28.5 a2.6 2.6 0 1 0 3 3" stroke="#8a94a1" stroke-width="2.4" fill="none" stroke-linecap="round"/>`),
    turret: svg(`<rect x="8" y="27" width="24" height="9" rx="2" fill="#6b7480" stroke="#2b3036" stroke-width="2"/><rect x="12.5" y="14" width="15" height="14" rx="3" fill="#8a94a1" stroke="#2b3036" stroke-width="2"/>
      <rect x="18" y="2.5" width="4" height="12.5" fill="#4a525c" stroke="#2b3036" stroke-width="1.2"/><circle cx="20" cy="21" r="2.4" fill="#7df0ff"/>`),
    vine: svg(`<path d="M20 37 C13 29 27 22 18 14 C14 10 18 5 23 3" stroke="#3f7d2a" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M18 28 q-9 -2 -11 -9 q9 0 11 9Z M22 20 q9 -2 11 -9 q-9 0 -11 9Z M19 11.5 q-7 -1 -8 -6.5 q7 0 8 6.5Z" fill="#6fb34a" stroke="#2c5a1c" stroke-width="1"/>
      <path d="M9 35 l3 -4 M31 35 l-3 -4 M20 33 v-4" stroke="#b33" stroke-width="1.6" stroke-linecap="round"/>`),
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
  // `sfx` names the attack sound in tilebound-sfx.js.
  // Attack zones are [dx, dr] offsets from the hero; dr > 0 is forward (up the screen).
  const HEROES = {
    knight: { sfx: 'slash', name: 'Brannoc', cls: 'Knight', hp: 6, dmg: 2, ability: 'Cleave', desc: 'hits every enemy in the 3 squares in front (2 dmg)', color: '#ff6b5b', zone: [[-1, 1], [0, 1], [1, 1]] },
    ranger: { sfx: 'arrow', name: 'Wren', cls: 'Ranger', hp: 4, dmg: 1, ability: 'Longshot', desc: 'shoots the first enemy up to 4 squares straight ahead (1 dmg); no piercing, obstacles block', pierce: false, color: '#5cd67e', zone: [[0, 1], [0, 2], [0, 3], [0, 4]] , details: ['Checks the line nearest-first and stops at the first enemy or obstacle.'] },
    mage: { sfx: 'fire', name: 'Ozric', cls: 'Mage', hp: 3, dmg: 2, ability: 'Arc Flame', desc: 'hits every enemy on both diagonals, 2 deep (2 dmg)', color: '#b48cff', zone: [[-1, 1], [1, 1], [-2, 2], [2, 2]] },
    lancer: { sfx: 'stab', name: 'Tamsin', cls: 'Lancer', hp: 5, dmg: 2, ability: 'Skewer', desc: 'spear hits both squares straight ahead, piercing (2 dmg)', color: '#ff9f43', zone: [[0, 1], [0, 2]] },
    rogue: { sfx: 'dagger', name: 'Vex', cls: 'Rogue', hp: 3, dmg: 3, ability: 'Flank', desc: 'stabs the squares directly left and right (3 dmg)', color: '#9aa4b5', zone: [[-1, 0], [1, 0]] },
    guardian: { sfx: 'shield', name: 'Ormund', cls: 'Guardian', hp: 8, dmg: 1, ability: 'Bulwark', desc: 'hits 1 square ahead (1 dmg) and takes enemy hits aimed at allies beside him', color: '#6aa8ff', zone: [[0, 1]], special: 'guard' , details: ['When an enemy attacks a hero orthogonally next to him, he takes the hit instead (turrets included).'] },
    bombardier: { sfx: 'bomb', name: 'Pip', cls: 'Bombardier', hp: 3, dmg: 2, ability: 'Lob', desc: 'bomb lands 3 ahead and blasts a + of 5 squares (2 dmg); nothing up close', color: '#ff5fa2', zone: [[0, 2], [-1, 3], [0, 3], [1, 3], [0, 4]] , details: ['The blast squares are 2–4 rows ahead; the 2 rows directly in front are safe from his own bombs.'] },
    monk: { sfx: 'whirl', name: 'Brother Kael', cls: 'Monk', hp: 5, dmg: 1, ability: 'Whirlwind', desc: 'hits all 8 surrounding squares (1 dmg)', color: '#f4f4f4', zone: [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [0, -1], [1, -1]] },
    druid: { sfx: 'grow', name: 'Fennel', cls: 'Druid', hp: 4, dmg: 0, ability: 'Overgrowth', desc: 'no attack; every 3 turns grows a vine wall in front that blocks enemies for 5 turns', color: '#7ed957', zone: [[0, 1]], special: 'druid' , details: ['Grows a vine on the first turn, then every 3 turns, if the square in front is empty.', 'Vines block enemies, the golem and heroes alike, and wither after 5 turns.'] },
    berserker: { sfx: 'axe', name: 'Hrolf', cls: 'Berserker', hp: 6, dmg: 1, ability: 'Rage', desc: 'hits 1 square ahead for 1 + every HP he is missing', color: '#e8542a', zone: [[0, 1]], special: 'rage' , details: ['Damage = 1 + (max HP − current HP); at 1 HP he hits for 6.'] },
    engineer: { sfx: 'wrench', name: 'Gizmo', cls: 'Engineer', hp: 4, dmg: 1, ability: 'Deploy', desc: 'wrench hits 1 ahead (1 dmg); every 4 turns builds a turret in front, inside the zone, if he has none', color: '#4dd2c8', zone: [[0, 1]], special: 'engineer' , details: ['Builds when he has no turret, the square in front is empty and inside the deployment zone; then waits 4 turns.', 'The turret (3 HP) shoots the first enemy up to 5 squares ahead, moves with the squad, cannot be dragged and is left behind if stuck.'] },
    turret: { sfx: 'bolt', name: 'Turret', cls: 'Construct', hp: 3, dmg: 1, ability: 'Bolt', desc: 'shoots the first enemy up to 5 squares ahead (1 dmg); rolls along with the squad, cannot be repositioned, left behind if stuck', color: '#9fb4c8', zone: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]], pierce: false, hidden: true, static: true , details: ['Built by the Engineer; not selectable.'] },
    cleric: { sfx: 'holy', name: 'Sister Ilse', cls: 'Cleric', hp: 4, dmg: 1, ability: 'Sanctify', desc: 'smites foes beside her (1 dmg), heals allies beside her +1', color: '#ffd25a', zone: [[0, 1], [-1, 0], [1, 0], [0, -1]], heal: 1 , details: ['Heals every injured ally in her 4 adjacent squares by 1 each turn, in addition to hitting enemies there.'] },
  };
  const ENEMIES = {
    skeleton: { sfx: 'clack', from: 0, weight: 2, name: 'Skeleton', hp: 3, dmg: 1, pts: 10, rule: 'Sentry — if a hero is in line of sight straight below, marches 1 square toward it; otherwise stands still.' , details: ['Looks straight down its own column. Walls block its sight; other units do not.', 'Idle (·) when no hero is in sight, so it can be walked around.'] },
    slime: { sfx: 'squelch', from: 0, weight: 2, name: 'Slime', hp: 3, dmg: 1, pts: 10, rule: 'Patrol — oozes one way until blocked, then back the other way. Splits into two small slimes when killed.' , details: ['Starts moving left or right at random and reverses when blocked.', 'A big slime that dies splits into up to two 1-HP small slimes on open squares beside it.', 'Small slimes do not split again.'] },
    goblin: { sfx: 'claw', from: 6, weight: 2, name: 'Goblin', hp: 3, dmg: 1, pts: 15, rule: 'Hunter — path-finds 1 square toward the nearest hero.' , details: ['Breadth-first search toward the nearest reachable hero, one square per turn.', 'Attacks when the next step would land on a hero.'] },
    bat: { sfx: 'bite', from: 10, weight: 2, name: 'Bat', hp: 2, dmg: 1, pts: 15, rule: 'Flits randomly. Bites an adjacent hero, then flees to the top of the screen for 5 turns and repeats.' , details: ['Its random direction is rolled at the end of the previous turn, so the intent badge is accurate.', 'After a bite it path-finds to the top row of the screen for 5 turns, then goes back to flitting.'] },
    archer: { sfx: 'shoot', from: 13, weight: 2, name: 'Skeleton Archer', hp: 2, dmg: 1, pts: 20, rule: 'Sniper — shoots the first hero in line of sight straight below (up to 5 squares); otherwise paces sideways.' , details: ['Ranged: never needs to be adjacent. The shot is blocked by walls and by other enemies.', 'Otherwise patrols sideways like a slime.'] },
    orc: { sfx: 'club', from: 17, weight: 1, name: 'Orc Brute', hp: 6, dmg: 2, pts: 30, rule: 'Heavy hunter — chases the nearest hero, but only moves on even turns. Hits for 2.' , details: ['Same path-finding as the goblin, but rests on odd turns.'] },
    golem: { sfx: 'slam', from: 21, weight: 0, name: 'Stone Golem', hp: 12, dmg: 3, pts: 80, size: 2, elite: true, rule: 'ELITE, 2×2 — hunts the nearest hero every turn and hits for 3. Needs a 2-wide gap to pass; never overlaps walls, items or heroes.' , details: ['Occupies a 2×2 block; (x, r) is its bottom-left square.', 'Path-finds over positions where its whole footprint fits, so it never overlaps walls, items, heroes or enemies and cannot pass 1-wide gaps.', 'Never more than one at a time; spawns only on a clear 2×2 area.', 'An attack pattern that covers several of its squares hits it once.'] },
  };
  const DEFAULT_PARTY = ['ranger', 'knight', 'mage', 'cleric'];
  // Order matters: the per-row item roll walks this list adding up `spawn.chance`.
  const ITEMS = {
    chest: { spawn: { chance: 0.06, from: 0 }, name: 'Chest', rule: 'Step on it: +25 gold.' , details: ['Also found inside vaults.'] },
    potion: { spawn: { chance: 0.04, from: 0 }, name: 'Potion', rule: 'Step on it: that hero heals +3.' , details: ['Sometimes placed in the middle of a pillar hall.'] },
    spikes: { spawn: { chance: 0.05, from: 7 }, name: 'Spike trap', rule: 'Raises / lowers every turn. 1 dmg to anyone on it while raised.' , details: ['Toggles in the world phase; anyone standing on it when it rises takes 1 damage, and so does a hero stepping onto raised spikes.', 'The only item enemies can stand on.'] },
    boulder: { spawn: { chance: 0.03, from: 11 }, name: 'Boulder', rule: 'Rolls sideways, bouncing off walls. 2 dmg to whatever it rolls into. Blocks movement.' , details: ['Rolls 1 square per turn; reverses on hitting a wall, an item or a unit.', 'Hits heroes and enemies alike.'] },
    shrine: { spawn: { chance: 0.02, from: 16 }, name: 'Shrine', rule: 'Step on it: revives a fallen hero and heals the squad +1.' , details: ['Revives the first fallen hero at half HP on a free zone square, if there is one.', 'Sometimes found inside vaults deeper down.'] },
    vine: { name: 'Vine wall', rule: 'Grown by the Druid. Blocks enemies and heroes; withers after 5 turns.', details: ['Not generated; only the Druid makes these.'] },
  };

  // Terrain structures, in the order the generator picks from. `from` = first world row it can
  // start on, `weight` = relative pick chance. `sample` is an illustrative example (top row first):
  // # wall, o rock, O pillar, $ chest, + potion, S shrine, . floor. The shapes are built in tilebound.js.
  const STRUCTURES = {
    scatter: { name: 'Scatter', from: 0, weight: 3, desc: '2–3 rows, each with a 45% chance of one loose rock, pillar or edge wall.', sample: ['....o..', '.......', '#......'] },
    rubble: { name: 'Rubble heap', from: 6, weight: 2, desc: '4–6 rocks and pillars clumped in a 3×3 square.', sample: ['..oo...', '..oO...', '...o...'] },
    ruins: { name: 'Ruins', from: 8, weight: 2, desc: 'Two 2×2 blocks of broken wall at random spots over 4 rows (they can merge).', sample: ['.....##', '##...##', '##.....', '.......'] },
    wallLine: { name: 'Wall line', from: 10, weight: 2, desc: 'A full-width wall with one 3-wide gap or two 2-wide gaps; from row 26 it can be 2 rows thick.', sample: ['###...#'] },
    pillarHall: { name: 'Pillar hall', from: 4, weight: 1.5, desc: 'Two colonnades of pillars over 5 rows; 40% chance of a potion in the middle.', sample: ['.O...O.', '.......', '.O.+.O.', '.......', '.O...O.'] },
    corridor: { name: 'Corridor', from: 15, weight: 1.5, desc: 'Walls down both sides for 4–6 rows with a rock inside; from row 26 it can pinch to 3 wide instead.', sample: ['#.....#', '#..o..#', '#.....#', '#.....#'] },
    vault: { name: 'Vault', from: 6, weight: 1, desc: 'A 3×3 walled cell with a door at the bottom and a chest inside (a shrine 30% of the time from row 16).', sample: ['..###..', '..#$#..', '..#.#..'] },
  };

  // Enemy spawning and scaling. Per generated row: spawn chance p = min(max, base + perRow × row);
  // one enemy if rnd < p, plus extra ones from the listed rows; then the elite check.
  const DIFFICULTY = {
    spawnBase: 0.4, spawnPerRow: 0.008, spawnMax: 0.9,
    extra: [{ from: 16, factor: 0.5 }, { from: 46, factor: 0.3 }], // another enemy if rnd < p × factor
    hpEvery: 25, dmgEvery: 60, // +1 HP per 25 rows, +1 damage per 60 rows (all enemies)
    eliteChance: 0.08, // per row once the elite unlocks, if none is alive
    safeRows: ZONE + 2, // rows 0..5 start empty
  };

  const SCORING = { perDepth: 10, chestGold: 25 }; // score = depth × 10 + kill points + gold

  window.TILEBOUND = { W, H, ZONE, ART, HEROES, ENEMIES, ITEMS, DEFAULT_PARTY, STRUCTURES, DIFFICULTY, SCORING };
})();
