// Tilebound — sound effects, synthesized with the Web Audio API (no audio files, nothing to license or download).
// Every effect is a tiny recipe built from two primitives: tone() (an oscillator with a pitch sweep and a
// percussive envelope) and noise() (filtered white noise with a filter sweep). Recipes receive the audio
// context and an output node, so the same code plays live or renders offline (see the smoke test).
//
// API: TileboundSfx.play(name)  ·  .setMuted(bool) / .muted  ·  .unlock() (call from a user gesture)
//      .names (all effect names)  ·  .stats (play requests per name, for tests)  ·  .render(ctx, out, name, t)
// Which effect each hero/enemy uses is the `sfx` field in tilebound-data.js.
(() => {
  'use strict';
  const VOLUME = 0.95;
  let ctx = null, master = null, muted = false;
  try { muted = localStorage.getItem('tilebound.sound') === 'off'; } catch { /* storage unavailable */ }

  const noiseBuffers = new WeakMap();
  function noiseBuffer(c) {
    let b = noiseBuffers.get(c);
    if (!b) {
      b = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseBuffers.set(c, b);
    }
    return b;
  }

  // Percussive envelope: quick attack to `vol`, exponential decay to silence over `dur`.
  function env(c, out, t, dur, vol, attack) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(out);
    return g;
  }

  function tone(c, out, t, { type = 'sine', f = 440, f2 = f, dur = 0.1, vol = 0.2, attack = 0.004 }) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    o.connect(env(c, out, t, dur, vol, attack));
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(c, out, t, { filter = 'bandpass', f = 1000, f2 = f, q = 1, dur = 0.1, vol = 0.2, attack = 0.003 }) {
    const s = c.createBufferSource();
    s.buffer = noiseBuffer(c);
    const bq = c.createBiquadFilter();
    bq.type = filter; bq.Q.value = q;
    bq.frequency.setValueAtTime(f, t);
    if (f2 !== f) bq.frequency.exponentialRampToValueAtTime(f2, t + dur);
    s.connect(bq).connect(env(c, out, t, dur, vol, attack));
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  const notes = (c, o, t, freqs, gap, opts) => freqs.forEach((f, i) => tone(c, o, t + i * gap, { f, ...opts }));

  // ---------- the effects ----------
  const SOUNDS = {
    // interface
    click: (c, o, t) => tone(c, o, t, { type: 'square', f: 540, f2: 480, dur: 0.05, vol: 0.07 }),
    select: (c, o, t) => notes(c, o, t, [600, 900], 0.05, { type: 'triangle', dur: 0.07, vol: 0.12 }),
    deselect: (c, o, t) => notes(c, o, t, [900, 600], 0.05, { type: 'triangle', dur: 0.07, vol: 0.1 }),
    start: (c, o, t) => { notes(c, o, t, [392, 523, 659, 784], 0.07, { type: 'triangle', dur: 0.16, vol: 0.12 }); noise(c, o, t, { f: 300, f2: 1500, dur: 0.35, vol: 0.06 }); },
    pickup: (c, o, t) => tone(c, o, t, { type: 'triangle', f: 480, f2: 820, dur: 0.08, vol: 0.12 }),
    cancel: (c, o, t) => tone(c, o, t, { type: 'triangle', f: 520, f2: 330, dur: 0.1, vol: 0.1 }),

    // movement
    step: (c, o, t) => { for (const d of [0, 0.1]) { noise(c, o, t + d, { filter: 'lowpass', f: 380, dur: 0.07, vol: 0.4 }); tone(c, o, t + d, { f: 95, f2: 60, dur: 0.06, vol: 0.18 }); } },
    sidestep: (c, o, t) => noise(c, o, t, { f: 700, f2: 2200, q: 1.2, dur: 0.17, vol: 0.4, attack: 0.03 }),
    hold: (c, o, t) => { noise(c, o, t, { filter: 'lowpass', f: 500, dur: 0.09, vol: 0.32 }); tone(c, o, t, { type: 'triangle', f: 196, dur: 0.11, vol: 0.12 }); },
    drop: (c, o, t) => { tone(c, o, t, { f: 150, f2: 70, dur: 0.11, vol: 0.3 }); noise(c, o, t, { filter: 'lowpass', f: 600, dur: 0.06, vol: 0.25 }); },
    bump: (c, o, t) => tone(c, o, t, { type: 'square', f: 170, f2: 120, dur: 0.07, vol: 0.1 }),
    blocked: (c, o, t) => { tone(c, o, t, { type: 'square', f: 110, f2: 82, dur: 0.22, vol: 0.12 }); tone(c, o, t, { type: 'square', f: 117, f2: 87, dur: 0.22, vol: 0.1 }); noise(c, o, t, { filter: 'lowpass', f: 400, dur: 0.12, vol: 0.2 }); },

    // hero attacks (HEROES[*].sfx)
    slash: (c, o, t) => { noise(c, o, t, { f: 3200, f2: 700, q: 1.2, dur: 0.15, vol: 0.4 }); tone(c, o, t, { type: 'sawtooth', f: 320, f2: 120, dur: 0.08, vol: 0.06 }); },
    stab: (c, o, t) => { noise(c, o, t, { f: 1400, f2: 3800, q: 2, dur: 0.09, vol: 0.32 }); tone(c, o, t, { type: 'square', f: 420, f2: 950, dur: 0.05, vol: 0.05 }); },
    dagger: (c, o, t) => { for (const d of [0, 0.07]) noise(c, o, t + d, { f: 4200, f2: 1600, q: 1.5, dur: 0.07, vol: 0.3 }); },
    arrow: (c, o, t) => { tone(c, o, t, { type: 'triangle', f: 720, f2: 410, dur: 0.1, vol: 0.22 }); noise(c, o, t + 0.02, { f: 1200, f2: 3200, q: 0.8, dur: 0.14, vol: 0.12 }); },
    bolt: (c, o, t) => { tone(c, o, t, { type: 'square', f: 950, f2: 300, dur: 0.08, vol: 0.09 }); noise(c, o, t, { filter: 'highpass', f: 2500, dur: 0.05, vol: 0.12 }); },
    fire: (c, o, t) => { noise(c, o, t, { f: 500, f2: 2600, q: 0.8, dur: 0.32, vol: 0.32, attack: 0.04 }); tone(c, o, t, { type: 'sawtooth', f: 160, f2: 440, dur: 0.26, vol: 0.05 }); },
    holy: (c, o, t) => { tone(c, o, t, { f: 880, dur: 0.3, vol: 0.09, attack: 0.02 }); tone(c, o, t + 0.05, { f: 1320, dur: 0.28, vol: 0.07, attack: 0.02 }); },
    shield: (c, o, t) => { tone(c, o, t, { type: 'square', f: 620, dur: 0.14, vol: 0.06 }); tone(c, o, t, { type: 'square', f: 931, dur: 0.12, vol: 0.05 }); noise(c, o, t, { filter: 'highpass', f: 3000, dur: 0.05, vol: 0.18 }); },
    bomb: (c, o, t) => { tone(c, o, t, { f: 1400, f2: 500, dur: 0.24, vol: 0.07 }); noise(c, o, t + 0.24, { filter: 'lowpass', f: 500, f2: 70, dur: 0.5, vol: 0.7 }); tone(c, o, t + 0.24, { f: 85, f2: 38, dur: 0.45, vol: 0.45 }); },
    whirl: (c, o, t) => { noise(c, o, t, { f: 400, f2: 1800, q: 1.5, dur: 0.14, vol: 0.25, attack: 0.03 }); noise(c, o, t + 0.12, { f: 1800, f2: 500, q: 1.5, dur: 0.14, vol: 0.25 }); },
    axe: (c, o, t) => { noise(c, o, t, { f: 2200, f2: 380, q: 1, dur: 0.22, vol: 0.5 }); tone(c, o, t, { type: 'sawtooth', f: 170, f2: 55, dur: 0.16, vol: 0.12 }); },
    wrench: (c, o, t) => notes(c, o, t, [1250, 1850], 0.05, { type: 'square', dur: 0.05, vol: 0.11 }),
    grow: (c, o, t) => { tone(c, o, t, { type: 'triangle', f: 170, f2: 330, dur: 0.32, vol: 0.13, attack: 0.04 }); noise(c, o, t, { filter: 'lowpass', f: 1100, dur: 0.28, vol: 0.12, attack: 0.05 }); },
    build: (c, o, t) => { notes(c, o, t, [1500, 1500, 1500], 0.08, { type: 'square', dur: 0.045, vol: 0.11 }); tone(c, o, t + 0.26, { type: 'square', f: 300, f2: 700, dur: 0.14, vol: 0.1 }); },

    // enemy attacks (ENEMIES[*].sfx)
    clack: (c, o, t) => { for (const d of [0, 0.05]) { tone(c, o, t + d, { type: 'square', f: 1500, f2: 1200, dur: 0.025, vol: 0.06 }); noise(c, o, t + d, { filter: 'highpass', f: 3000, dur: 0.03, vol: 0.15 }); } },
    squelch: (c, o, t) => { tone(c, o, t, { f: 220, f2: 85, dur: 0.16, vol: 0.3 }); noise(c, o, t, { filter: 'lowpass', f: 600, dur: 0.12, vol: 0.18 }); },
    claw: (c, o, t) => { noise(c, o, t, { filter: 'highpass', f: 2600, f2: 1200, dur: 0.09, vol: 0.3 }); tone(c, o, t, { type: 'square', f: 520, f2: 300, dur: 0.05, vol: 0.05 }); },
    bite: (c, o, t) => { notes(c, o, t, [1150, 1400], 0.05, { type: 'square', f2: 700, dur: 0.045, vol: 0.05 }); noise(c, o, t + 0.04, { filter: 'highpass', f: 2000, dur: 0.04, vol: 0.15 }); },
    shoot: (c, o, t) => { tone(c, o, t, { type: 'triangle', f: 520, f2: 300, dur: 0.11, vol: 0.2 }); noise(c, o, t + 0.02, { f: 900, f2: 2400, q: 0.8, dur: 0.14, vol: 0.12 }); },
    club: (c, o, t) => { noise(c, o, t, { filter: 'lowpass', f: 650, dur: 0.16, vol: 0.5 }); tone(c, o, t, { f: 125, f2: 55, dur: 0.16, vol: 0.35 }); },
    slam: (c, o, t) => { tone(c, o, t, { f: 72, f2: 32, dur: 0.55, vol: 0.6 }); noise(c, o, t, { filter: 'lowpass', f: 320, f2: 60, dur: 0.5, vol: 0.55 }); },

    // results
    hit: (c, o, t) => { noise(c, o, t, { filter: 'lowpass', f: 1300, dur: 0.07, vol: 0.35 }); tone(c, o, t, { f: 190, f2: 90, dur: 0.07, vol: 0.22 }); },
    enemyDie: (c, o, t) => { tone(c, o, t, { type: 'square', f: 540, f2: 80, dur: 0.24, vol: 0.08 }); noise(c, o, t, { f: 1000, f2: 180, q: 0.7, dur: 0.24, vol: 0.22 }); },
    split: (c, o, t) => notes(c, o, t, [260, 330], 0.08, { f2: 620, dur: 0.08, vol: 0.2 }),
    heroHurt: (c, o, t) => { tone(c, o, t, { type: 'square', f: 230, f2: 110, dur: 0.13, vol: 0.1 }); noise(c, o, t, { filter: 'lowpass', f: 900, dur: 0.09, vol: 0.3 }); },
    heroDie: (c, o, t) => notes(c, o, t, [440, 370, 294], 0.15, { type: 'triangle', dur: 0.2, vol: 0.14 }),
    heal: (c, o, t) => { tone(c, o, t, { f: 660, f2: 990, dur: 0.16, vol: 0.09 }); tone(c, o, t + 0.08, { f: 990, dur: 0.18, vol: 0.07 }); },

    // items & world
    coin: (c, o, t) => { tone(c, o, t, { type: 'square', f: 988, dur: 0.08, vol: 0.1 }); tone(c, o, t + 0.07, { type: 'square', f: 1319, dur: 0.25, vol: 0.1 }); },
    potion: (c, o, t) => notes(c, o, t, [380, 450, 520], 0.06, { f2: 760, dur: 0.05, vol: 0.12 }),
    shrine: (c, o, t) => notes(c, o, t, [523, 659, 784, 1047], 0.06, { dur: 0.45, vol: 0.06, attack: 0.01 }),
    spikes: (c, o, t) => { noise(c, o, t, { filter: 'highpass', f: 4200, dur: 0.09, vol: 0.18 }); tone(c, o, t, { type: 'square', f: 1800, f2: 2500, dur: 0.05, vol: 0.03 }); },
    boulder: (c, o, t) => noise(c, o, t, { filter: 'lowpass', f: 260, dur: 0.3, vol: 0.7, attack: 0.05 }),
    gameOver: (c, o, t) => notes(c, o, t, [392, 330, 262, 196], 0.22, { type: 'triangle', dur: 0.32, vol: 0.14 }),
  };

  // ---------- live playback ----------
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      const comp = ctx.createDynamicsCompressor(); // keeps stacked hits from clipping
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  // Browsers only allow audio after a user gesture: unlock on the first one.
  const firstGesture = () => { unlock(); removeEventListener('pointerdown', firstGesture); removeEventListener('keydown', firstGesture); };
  addEventListener('pointerdown', firstGesture);
  addEventListener('keydown', firstGesture);

  const stats = {};
  const lastPlayed = new Map();
  function play(name) {
    stats[name] = (stats[name] || 0) + 1;
    if (muted || !SOUNDS[name]) return;
    const c = unlock();
    if (!c) return;
    const now = c.currentTime;
    if (now - (lastPlayed.get(name) ?? -1) < 0.035) return; // the same effect several times at once sounds like one
    lastPlayed.set(name, now);
    try { SOUNDS[name](c, master, now + 0.005); } catch { /* audio must never break the game */ }
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('tilebound.sound', muted ? 'off' : 'on'); } catch { /* storage unavailable */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime, 0.02);
  }

  window.TileboundSfx = {
    play, unlock, setMuted, stats,
    get muted() { return muted; },
    names: Object.keys(SOUNDS),
    render: (c, out, name, t = 0) => SOUNDS[name](c, out, t), // for offline rendering in tests
  };
})();
