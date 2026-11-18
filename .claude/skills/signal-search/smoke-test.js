// Signal Search smoke test (headless Chromium via Playwright, which is preinstalled in Claude cloud sessions).
//   node .claude/skills/signal-search/smoke-test.js
// Checks: no page errors; every world preset generates a treasure the base can reach; a game runs start → play →
// several commits with each path-finder; node movement obeys the rules (one orthogonal step at a time, no cliff
// climbs, step cost = 1 + climb × levels², Greedy never climbs, no node revisits a cell); radar points the right way.
// Exits non-zero on any failure. It is a dev tool only — nothing in docs/ depends on it.
const path = require('path');
const { chromium } = require('playwright');

const page_ = 'file://' + path.resolve(__dirname, '../../../docs/tools/signal-search.html');
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // The game script is one IIFE; expose its internals for testing only.
  await page.route('**/signal-search.js', async route => {
    let body = require('fs').readFileSync(path.resolve(__dirname, '../../../docs/js/signal-search.js'), 'utf8');
    body = body.replace(/\}\)\(\);\s*$/, 'window.__SS={get W(){return W},runNode,radar,generate,buildWorld,PRESETS,LAYERS,DEF,clone,COST};\n})();\n');
    await route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(page_);
  await page.waitForFunction(() => window.__SS && window.__SS.W);

  const gen = await page.evaluate(() => {
    const T = window.__SS, out = [];
    for (const p of Object.keys(T.PRESETS)) {
      const S = T.clone(T.DEF); for (const k of T.LAYERS) S[k] = T.clone(T.PRESETS[p][k]); S.levels = T.PRESETS[p].levels;
      for (let s = 0; s < 3; s++) { const w = T.buildWorld(S, 500 + s * 77); out.push({ p, ok: w.ok, reach: w.route && w.route[w.route.length - 1] === w.treasure, levelsOk: Array.from(w.lv).every(v => v >= 0 && v < w.levels) }); }
    }
    return out;
  });
  check('every preset generates valid worlds with a reachable treasure', gen.every(g => g.ok && g.reach && g.levelsOk), JSON.stringify(gen.filter(g => !(g.ok && g.reach && g.levelsOk))));

  await page.click('#bStart');
  await page.waitForFunction(() => location.hash === '#play');
  check('start button opens play view', await page.isVisible('#viewPlay'));

  const box = await page.locator('#map').boundingBox();
  for (const [algo, cell] of [[0, [12, 6]], [1, null], [2, null], [0, [5, 12]]]) {
    await page.click(`#segAlgo > button:nth-child(${algo + 1})`);
    if (cell) await page.mouse.click(box.x + (cell[0] + 0.5) / 24 * box.width, box.y + (cell[1] + 0.5) / 24 * box.height);
    if (await page.isEnabled('#bGo')) await page.click('#bGo'); else console.log('  skipped:', (await page.textContent('#plan')).replace(/\s+/g, ' ').slice(-160));
    await page.waitForTimeout(1300);
  }
  const turn = await page.textContent('#sTurn');
  check('commits advance rounds', Number(turn) >= 3, `round ${turn}`);

  const rules = await page.evaluate(() => {
    const T = window.__SS, W = T.W, N = W.N, bad = [], counts = {};
    for (const algo of ['greedy', 'leveler']) for (let i = 0; i < N * N; i += 3) {
      const r = T.runNode(i, [], 40, algo), seen = new Set([i]); counts[algo + ':' + r.status] = (counts[algo + ':' + r.status] || 0) + 1;
      for (let j = 1; j < r.pts.length; j++) {
        const p = r.pts[j], q = r.pts[j - 1], dd = p.h - q.h, man = Math.abs(p.i % N - q.i % N) + Math.abs(((p.i / N) | 0) - ((q.i / N) | 0));
        if (man !== 1) bad.push('non-orthogonal step'); if (dd > W.physics.maxStep) bad.push('climbed a cliff');
        if (p.c !== 1 + (dd > 0 ? W.physics.climb * dd * dd : 0)) bad.push('wrong step cost');
        if (algo === 'greedy' && dd > 0) bad.push('greedy climbed'); if (seen.has(p.i)) bad.push(algo + ' revisited'); seen.add(p.i);
      }
      if (r.E < 0) bad.push('negative energy');
    }
    let hit = 0, n = 0;
    for (let i = 0; i < N * N; i += 2) { if (i === W.treasure) continue; const r = T.radar(i), dx = W.treasure % N - i % N, dy = ((W.treasure / N) | 0) - ((i / N) | 0);
      const k = ((Math.round(Math.atan2(dx, -dy) / (Math.PI / 4)) % 8) + 8) % 8; n++; if (k === r.best) hit++; }
    return { bad: [...new Set(bad)], counts, radar: hit / n };
  });
  check('node movement obeys the rules', rules.bad.length === 0, rules.bad.join(', ') + ' ' + JSON.stringify(rules.counts));
  check('radar picks the right sector at least 90% of the time', rules.radar >= 0.9, (rules.radar * 100).toFixed(0) + '%');

  await page.click('#navWorld');
  await page.waitForTimeout(600);
  check('world settings view renders stats', (await page.textContent('#wstats')).includes('Base→treasure'));
  for (const t of ['report', 'log', 'help', 'node']) { await page.click('#navPlay'); await page.click(`#tab-${t}`); }
  check('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
  process.exit(failed ? 1 : 0);
})();
