// Tilebound wiki — renders the hero / enemy / item / terrain / difficulty sections of
// tools/tilebound-wiki.html from window.TILEBOUND (js/tilebound-data.js), the same data the game uses.
// Rules prose lives in the HTML. Adding a hero, enemy, item or structure to the data file adds it here too.
(() => {
  'use strict';
  const T = window.TILEBOUND;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (x) => `${Math.round(x * 1000) / 10}%`;
  const list = (items) => (items && items.length ? `<ul>${items.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '');
  const anchor = (id) => `<a class="anchor" href="#${id}" title="Link to this entry">#</a>`;

  // Attack pattern: 5 wide, from the furthest forward reach down to 1 row behind.
  const maxReach = Math.max(...Object.values(T.HEROES).flatMap((d) => d.zone.map(([, y]) => y)));
  function pattern(d) {
    const z = new Set(d.zone.map(([x, y]) => `${x},${y}`));
    let html = '';
    for (let y = maxReach; y >= -1; y--)
      for (let x = -2; x <= 2; x++)
        html += `<i class="${x === 0 && y === 0 ? 'h' : z.has(`${x},${y}`) ? (d.special === 'druid' ? 'v' : 'a') : ''}"></i>`;
    return `<div class="pat" title="Attack pattern (forward is up)">${html}</div>`;
  }

  // ---------- heroes ----------
  const heroCard = ([k, d]) => `
    <article class="entry hero" id="hero-${k}" data-entry>
      ${anchor('hero-' + k)}
      <div class="top">
        <div class="art">${T.ART[k]}</div>
        <div><h3>${esc(d.name)}${d.hidden ? '<span class="tag">summoned</span>' : ''}</h3><div class="sub caps">${esc(d.cls)}</div></div>
        ${pattern(d)}
      </div>
      <div class="stats"><span>HP <b>${d.hp}</b></span><span>Damage <b>${d.special === 'rage' ? '1 + missing HP' : d.dmg}</b></span>
        <span>Ability <b>${esc(d.ability)}</b></span>${d.pierce === false ? '<span>first target only</span>' : ''}
        ${T.DEFAULT_PARTY.includes(k) ? '<span>classic four</span>' : ''}</div>
      <p>${esc(d.desc[0].toUpperCase() + d.desc.slice(1))}.</p>
      ${list(d.details)}
    </article>`;
  // Selectable heroes first (in data order), then the summoned turret.
  const heroes = Object.entries(T.HEROES).sort((a, b) => (a[1].hidden ? 1 : 0) - (b[1].hidden ? 1 : 0));
  $('#heroGrid').innerHTML = heroes.map(heroCard).join('');

  // ---------- enemies ----------
  const normal = Object.entries(T.ENEMIES).filter(([, d]) => !d.elite);
  const totalWeight = normal.reduce((a, [, d]) => a + d.weight, 0);
  const enemyCard = ([k, d]) => `
    <article class="entry enemy${d.elite ? ' elite' : ''}" id="enemy-${k}" data-entry>
      ${anchor('enemy-' + k)}
      <div class="top">
        <div class="art">${T.ART[k]}</div>
        <div><h3>${esc(d.name)}${d.elite ? '<span class="tag elite">elite</span>' : ''}</h3>
          <div class="sub caps">${d.size ? `${d.size}×${d.size} · ` : ''}appears from row ${d.from}</div></div>
        <span></span>
      </div>
      <div class="stats"><span>HP <b>${d.hp}</b></span><span>Damage <b>${d.dmg}</b></span><span>Points <b>${d.pts}</b></span>
        ${d.elite ? `<span>Spawn <b>${pct(T.DIFFICULTY.eliteChance)}</b> per row, one at a time</span>`
                  : `<span>Spawn weight <b>${d.weight}</b> (${pct(d.weight / totalWeight)} once all unlock)</span>`}</div>
      <p>${esc(d.rule)}</p>
      ${list(d.details)}
    </article>`;
  $('#enemyGrid').innerHTML = Object.entries(T.ENEMIES).map(enemyCard).join('');

  const D = T.DIFFICULTY;
  const chance = (r) => Math.min(D.spawnMax, D.spawnBase + r * D.spawnPerRow);
  const sampleRows = [10, 25, 50, 75, 100];
  $('#scalingBox').innerHTML = `
    <p>For every generated row: spawn chance <b>p = min(${pct(D.spawnMax)}, ${pct(D.spawnBase)} + ${pct(D.spawnPerRow)} × row)</b>.
      One enemy spawns if a roll beats <i>p</i>; ${D.extra.map((e) => `from row ${e.from} another with chance p × ${e.factor}`).join(', ')}.
      The type is drawn from unlocked enemies by weight. Every enemy gets <b>+1 HP per ${D.hpEvery} rows</b> and
      <b>+1 damage per ${D.dmgEvery} rows</b>. Small slimes from a split always have 1 HP.</p>
    <table><tr><th>Row</th><th class="num">Spawn chance</th><th class="num">Max enemies</th><th class="num">HP bonus</th><th class="num">Damage bonus</th><th>Unlocked</th></tr>
      ${sampleRows.map((r) => `<tr><td>${r}</td><td class="num">${pct(chance(r))}</td>
        <td class="num">${1 + D.extra.filter((e) => r >= e.from).length}</td><td class="num">+${Math.floor(r / D.hpEvery)}</td>
        <td class="num">+${Math.floor(r / D.dmgEvery)}</td>
        <td>${Object.values(T.ENEMIES).filter((d) => r >= d.from).map((d) => esc(d.name)).join(', ')}</td></tr>`).join('')}
    </table>`;

  // ---------- items ----------
  const itemArt = (k) => T.ART[k === 'spikes' ? 'spikesUp' : k];
  $('#itemGrid').innerHTML = Object.entries(T.ITEMS).map(([k, d]) => `
    <article class="entry item" id="item-${k}" data-entry>
      ${anchor('item-' + k)}
      <div class="top"><div class="art">${itemArt(k)}</div>
        <div><h3>${esc(d.name)}</h3><div class="sub caps">${d.spawn ? `from row ${d.spawn.from}` : 'not generated'}</div></div><span></span></div>
      <div class="stats">${d.spawn ? `<span>Per-row chance <b>${pct(d.spawn.chance)}</b></span>` : '<span>made by the Druid</span>'}</div>
      <p>${esc(d.rule)}</p>
      ${list(d.details)}
    </article>`).join('');

  // ---------- terrain ----------
  const TILE = { '#': 'wall', o: 'rock', O: 'pillar', $: 'chest', '+': 'potion', S: 'shrine' };
  $('#legend').innerHTML = [['wall', 'Wall'], ['rock', 'Rock'], ['pillar', 'Pillar']]
    .map(([k, n]) => `<span><i>${T.ART[k]}</i>${n}</span>`).join('');
  const structWeight = Object.values(T.STRUCTURES).reduce((a, s) => a + s.weight, 0);
  const miniMap = (rows) => `<div class="map">${rows.map((row) => [...row].map((c) => `<i>${TILE[c] ? T.ART[TILE[c]] : ''}</i>`).join('')).join('')}</div>`;
  $('#structGrid').innerHTML = Object.entries(T.STRUCTURES).map(([k, s]) => `
    <article class="entry tile" id="structure-${k}" data-entry>
      ${anchor('structure-' + k)}
      <h3>${esc(s.name)}</h3>
      <div class="stats"><span>From row <b>${s.from}</b></span><span>Weight <b>${s.weight}</b> (${pct(s.weight / structWeight)} once all unlock)</span></div>
      <p>${esc(s.desc)}</p>
      ${miniMap(s.sample)}
    </article>`).join('');

  $('#safeRows').textContent = D.safeRows;
  $('#vH').textContent = T.H;
  $('#vZ').textContent = T.ZONE;
  $('#perDepth').textContent = T.SCORING.perDepth;
  $('#chestGold').textContent = T.SCORING.chestGold;

  // ---------- search: hide entries/sections that don't mention every word ----------
  const q = $('#q');
  q.addEventListener('input', () => {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (el) => words.every((w) => el.textContent.toLowerCase().includes(w));
    let any = false;
    for (const sec of document.querySelectorAll('section[data-search]')) {
      const entries = sec.querySelectorAll('[data-entry]');
      let show;
      if (!words.length) { entries.forEach((e) => e.classList.remove('hidden')); show = true; }
      else if (entries.length) {
        let n = 0;
        entries.forEach((e) => { const ok = hit(e); e.classList.toggle('hidden', !ok); if (ok) n++; });
        show = n > 0 || hit(sec.querySelector('h2'));
        if (show && !n) entries.forEach((e) => e.classList.remove('hidden')); // section title matched
      } else show = hit(sec);
      sec.classList.toggle('hidden', !show);
      any = any || show;
    }
    $('#nores').classList.toggle('hidden', any);
  });
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
})();
