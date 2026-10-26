(function () {
  'use strict';

  var TOOL_URL = 'https://zr0w.github.io/tools/receipt-parser.html';

  // ─── State ────────────────────────────────────────────────────────────────
  var receiptData = null;
  var items = [];
  var itemIdCounter = 0;
  var participants = [];
  var participantIdCounter = 0;
  var touchSelectedItem = null; // { itemId, source: 'pool'|'lane', participantId? }
  var previewTimer = null;

  var PERSON_COLORS = [
    '#4a8bd4', '#d95f5f', '#4fa86a', '#d98930',
    '#8b5ac8', '#3abcbc', '#d45f8b', '#7a9a30'
  ];

  // ─── DOM refs ─────────────────────────────────────────────────────────────
  var receiptTextEl, parseTextBtnEl, previewEl;
  var inputNoticeEl, resultsSectionEl, receiptMetaEl, summaryInlineEl;
  var poolCardsEl, trashZoneEl, lanesEl, addPersonBtnEl;

  // ─── Utilities ────────────────────────────────────────────────────────────

  function formatMoney(n) { return '$' + n.toFixed(2); }

  function parseMoney(val) {
    var n = parseFloat(String(val || '').replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function setNotice(el, type, msg) {
    el.className = 'notice' + (type ? ' ' + type : '');
    el.textContent = msg || '';
  }

  // ─── Parse bookmarklet payload from URL hash ─────────────────────────────

  function parseHashData() {
    var hash = location.hash;
    if (!hash || hash.indexOf('#data=') !== 0) return null;
    var encoded = hash.slice(6);
    var payload;
    try {
      payload = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    } catch (e) { return null; }

    var src = payload.s || payload.source || '';

    if (src === 'nd' || src === 'nextdata') {
      var rawItems = payload.i || payload.items || [];
      var parsedItems = [];
      for (var i = 0; i < rawItems.length; i++) {
        var it = rawItems[i];
        var price = +(it.p || it.price || 0);
        var qty   = +(it.q || it.qty   || 1) || 1;
        if (price > 0) parsedItems.push({ name: it.n || it.name || 'Item', price: price, qty: qty });
      }
      return {
        restaurant: payload.r || payload.restaurant || '',
        date:       payload.date || '',
        subtotal:   +(payload.sb || payload.subtotal || 0),
        tax:        +(payload.tx || payload.tax      || 0),
        tip:        +(payload.tp || payload.tip      || 0),
        total:      +(payload.tt || payload.total    || 0),
        items: parsedItems
      };
    }

    if (src === 'txt' || src === 'text') {
      return parseReceiptText(payload.t || payload.text || '');
    }

    return null;
  }

  // ─── Parse pasted / typed receipt text ───────────────────────────────────

  var tabPriceRe   = /^(.+?)\t\$?(\d+(?:\.\d{1,2})?)\s*$/;
  var spacePriceRe = /^(.*\S)\s{2,}\$?(\d+(?:\.\d{1,2})?)\s*$/;
  var commaPriceRe = /^([^,]+),\s*\$?(\d+(?:\.\d{1,2})?)\s*$/;
  var priceOnlyRe  = /^\$?(\d+(?:\.\d{1,2})?)\s*$/;
  var qtyPrefixRe  = /^(\d+)\s*[x×]?\s+(.+)/i;
  var skipRe       = /^(server|table|guests?|ordered|opened|closed|check\s*#|order\s*#|card|auth|approval|receipt|thank|phone|www\.|http|input\s+type|visa|mastercard|amex|discover|powered|©|never\s+miss|sign\s+up|download|application|device|authorization|transaction|time\s*$)/i;
  var summaryRe    = /^(subtotal|sub\s+total|tax|tip|gratuity|total|amount\s+due)/i;

  function parseReceiptText(text) {
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); });
    var parsedItems = [];
    var subtotal = 0, tax = 0, tip = 0, total = 0;
    var restaurant = '';

    var firstReal = true;
    var pendingName = null;

    function classify(name, price) {
      var lc = name.toLowerCase().trim();
      if (/^(subtotal|sub\s+total)/.test(lc))          { if (!subtotal) subtotal = price; return; }
      if (/\btax\b/.test(lc))                           { if (!tax)      tax      = price; return; }
      if (/tip|gratuity/.test(lc))                      { if (!tip)      tip      = price; return; }
      if (/^(total|amount\s+due)/.test(lc))             { if (price > total) total = price; return; }
      if (skipRe.test(name)) return;
      var m = name.match(qtyPrefixRe);
      var qty      = m ? parseInt(m[1], 10) : 1;
      var itemName = m ? m[2].trim() : name.trim();
      if (itemName && price > 0) parsedItems.push({ name: itemName, price: price, qty: qty });
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line) { pendingName = null; continue; }

      if (firstReal && !skipRe.test(line) && !priceOnlyRe.test(line)) {
        restaurant = line;
        firstReal = false;
        continue;
      }
      firstReal = false;

      var pm = line.match(priceOnlyRe);
      if (pm && pendingName) {
        classify(pendingName, parseMoney(pm[1]));
        pendingName = null;
        continue;
      }

      var cm = line.match(commaPriceRe);
      if (cm) {
        classify(cm[1].trim(), parseMoney(cm[2]));
        pendingName = null;
        continue;
      }

      var tm = line.match(tabPriceRe);
      if (tm) {
        classify(tm[1], parseMoney(tm[2]));
        pendingName = null;
        continue;
      }

      var sm = line.match(spacePriceRe);
      if (sm) {
        classify(sm[1], parseMoney(sm[2]));
        pendingName = null;
        continue;
      }

      if (!skipRe.test(line) && !pm && line.length < 80) {
        pendingName = line;
      } else {
        pendingName = null;
      }
    }

    if (total <= 0 && subtotal > 0) total = subtotal + tax + tip;
    return { restaurant: restaurant, date: '', subtotal: subtotal, tax: tax, tip: tip, total: total, items: parsedItems };
  }

  // ─── Line-by-line classifier for live preview ─────────────────────────────

  function classifyLines(lines) {
    var result = [];
    var pendingName = null;
    var pendingIdx = -1;
    var firstReal = true;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (!line) {
        pendingName = null;
        pendingIdx = -1;
        result.push({ type: 'empty' });
        continue;
      }

      if (firstReal && !skipRe.test(line) && !priceOnlyRe.test(line)) {
        firstReal = false;
        result.push({ type: 'restaurant', line: line });
        continue;
      }
      firstReal = false;

      var pm = line.match(priceOnlyRe);
      if (pm && pendingName !== null) {
        var price = parseMoney(pm[1]);
        var lc = pendingName.toLowerCase().trim();
        var t = summaryRe.test(lc) ? 'summary' : (skipRe.test(pendingName) ? 'skipped' : 'item');
        var name = pendingName;
        var m = !summaryRe.test(lc) ? name.match(qtyPrefixRe) : null;
        var displayName = m ? m[1] + '× ' + m[2].trim() : name;
        result[pendingIdx] = { type: t, line: name, name: displayName, price: price };
        pendingName = null;
        pendingIdx = -1;
        result.push({ type: 'hidden' }); // price-only line consumed
        continue;
      }

      var cm = line.match(commaPriceRe);
      if (cm) {
        var rawName = cm[1].trim();
        var price = parseMoney(cm[2]);
        var lc = rawName.toLowerCase();
        var t = summaryRe.test(lc) ? 'summary' : 'item';
        var m = t === 'item' ? rawName.match(qtyPrefixRe) : null;
        var displayName = m ? m[1] + '× ' + m[2].trim() : rawName;
        result.push({ type: t, line: line, name: displayName, price: price });
        pendingName = null;
        pendingIdx = -1;
        continue;
      }

      var tm = line.match(tabPriceRe);
      if (tm) {
        var rawName = tm[1].trim();
        var price = parseMoney(tm[2]);
        var lc = rawName.toLowerCase();
        var t = summaryRe.test(lc) ? 'summary' : 'item';
        var m = t === 'item' ? rawName.match(qtyPrefixRe) : null;
        var displayName = m ? m[1] + '× ' + m[2].trim() : rawName;
        result.push({ type: t, line: line, name: displayName, price: price });
        pendingName = null;
        pendingIdx = -1;
        continue;
      }

      var sm = line.match(spacePriceRe);
      if (sm) {
        var rawName = sm[1].trim();
        var price = parseMoney(sm[2]);
        var lc = rawName.toLowerCase();
        var t = summaryRe.test(lc) ? 'summary' : 'item';
        var m = t === 'item' ? rawName.match(qtyPrefixRe) : null;
        var displayName = m ? m[1] + '× ' + m[2].trim() : rawName;
        result.push({ type: t, line: line, name: displayName, price: price });
        pendingName = null;
        pendingIdx = -1;
        continue;
      }

      if (!skipRe.test(line) && !pm && line.length < 80) {
        pendingName = line;
        pendingIdx = result.length;
        result.push({ type: 'pending', line: line });
      } else {
        result.push({ type: 'skipped', line: line });
        pendingName = null;
        pendingIdx = -1;
      }
    }

    // Unresolved pending name = skipped
    if (pendingName !== null && pendingIdx >= 0) {
      result[pendingIdx] = { type: 'skipped', line: pendingName };
    }

    return result;
  }

  // ─── Live preview ─────────────────────────────────────────────────────────

  function renderPreview(text) {
    if (!previewEl) return;
    text = text || '';
    if (!text.trim()) { previewEl.innerHTML = ''; return; }

    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); });
    var classified = classifyLines(lines);

    var itemCount = 0, foodTotal = 0;
    for (var i = 0; i < classified.length; i++) {
      if (classified[i].type === 'item') { itemCount++; foodTotal += classified[i].price; }
    }

    var headerLabel = itemCount + ' item' + (itemCount !== 1 ? 's' : '');
    if (foodTotal > 0) headerLabel += ' · ' + formatMoney(foodTotal) + ' food';

    var html = '<div class="preview-header"><strong>' + escapeHtml(headerLabel) + '</strong></div>';

    for (var i = 0; i < classified.length; i++) {
      var c = classified[i];
      if (c.type === 'empty' || c.type === 'hidden') continue;

      if (c.type === 'item') {
        html += '<div class="preview-row item">' +
          '<span class="pr-icon">✓</span>' +
          '<span class="pr-name">' + escapeHtml(c.name) + '</span>' +
          '<span class="pr-price">' + formatMoney(c.price) + '</span>' +
          '</div>';
      } else if (c.type === 'summary') {
        html += '<div class="preview-row summary">' +
          '<span class="pr-icon">─</span>' +
          '<span class="pr-name">' + escapeHtml(c.name) + '</span>' +
          '<span class="pr-price">' + formatMoney(c.price) + '</span>' +
          '</div>';
      } else if (c.type === 'restaurant') {
        html += '<div class="preview-row summary">' +
          '<span class="pr-icon">🍽</span>' +
          '<span class="pr-name">' + escapeHtml(c.line) + '</span>' +
          '</div>';
      } else if (c.type === 'pending') {
        html += '<div class="preview-row skipped">' +
          '<span class="pr-icon">?</span>' +
          '<span class="pr-name">' + escapeHtml(c.line) + '</span>' +
          '</div>';
      } else {
        // skipped
        html += '<div class="preview-row skipped">' +
          '<span class="pr-icon">?</span>' +
          '<span class="pr-name">' + escapeHtml(c.line) + '</span>' +
          '</div>';
      }
    }

    previewEl.innerHTML = html;
  }

  function schedulePreview(text) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () { renderPreview(text); }, 300);
  }

  // ─── Participants ─────────────────────────────────────────────────────────

  function addParticipant(name) {
    var colorIdx = participantIdCounter % PERSON_COLORS.length;
    var p = { id: ++participantIdCounter, name: name, colorIdx: colorIdx };
    participants.push(p);
    return p;
  }

  function removeParticipant(id) {
    participants = participants.filter(function (p) { return p.id !== id; });
    for (var i = 0; i < items.length; i++) {
      items[i].assignedTo = items[i].assignedTo.filter(function (pid) { return pid !== id; });
    }
    renderBoard();
  }

  // ─── Item assignment ──────────────────────────────────────────────────────

  function assignItem(itemId, participantId) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === itemId) {
        if (items[i].assignedTo.indexOf(participantId) !== -1) return false; // duplicate
        items[i].assignedTo.push(participantId);
        return true;
      }
    }
    return false;
  }

  function unassignItem(itemId, participantId) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === itemId) {
        items[i].assignedTo = items[i].assignedTo.filter(function (pid) { return pid !== participantId; });
        return;
      }
    }
  }

  function removeItem(itemId) {
    items = items.filter(function (it) { return it.id !== itemId; });
  }

  function getItem(itemId) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === itemId) return items[i];
    }
    return null;
  }

  function getParticipant(id) {
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].id === id) return participants[i];
    }
    return null;
  }

  // ─── Calculations ─────────────────────────────────────────────────────────

  function calcPersonEffectiveCost(participantId) {
    var food = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.assignedTo.indexOf(participantId) !== -1) {
        food += it.price / it.assignedTo.length;
      }
    }
    return food;
  }

  function calcPersonTotals(participantId) {
    if (!receiptData || receiptData.subtotal <= 0 || receiptData.total <= 0) {
      return { food: 0, tax: 0, tip: 0, total: 0 };
    }
    var food = calcPersonEffectiveCost(participantId);
    var proportion = food / receiptData.subtotal;
    var tax  = Math.round(proportion * receiptData.tax   * 100) / 100;
    var tip  = Math.round(proportion * receiptData.tip   * 100) / 100;
    var tot  = Math.round(proportion * receiptData.total * 100) / 100;
    return { food: food, tax: tax, tip: tip, total: tot };
  }

  // ─── Board rendering ──────────────────────────────────────────────────────

  function renderBoard() {
    renderPool();
    renderLanes();
    updateSummaryInline();
  }

  function updateSummaryInline() {
    if (!receiptData) return;
    var parts = [];
    if (receiptData.subtotal > 0) parts.push('Subtotal ' + formatMoney(receiptData.subtotal));
    if (receiptData.tax      > 0) parts.push('Tax '      + formatMoney(receiptData.tax));
    if (receiptData.tip      > 0) parts.push('Tip '      + formatMoney(receiptData.tip));
    if (receiptData.total    > 0) parts.push('Total '    + formatMoney(receiptData.total));
    summaryInlineEl.textContent = parts.join(' · ');
  }

  // ─── Pool ─────────────────────────────────────────────────────────────────

  function renderPool() {
    poolCardsEl.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      poolCardsEl.appendChild(makePoolCard(items[i]));
    }
  }

  function makePoolCard(item) {
    var card = document.createElement('div');
    card.className = 'pool-card';
    card.draggable = true;
    card.dataset.itemId = String(item.id);

    var nameSpan = document.createElement('span');
    nameSpan.className = 'card-name';
    nameSpan.textContent = item.qty > 1 ? item.qty + '× ' + item.name : item.name;
    nameSpan.title = nameSpan.textContent;

    var priceSpan = document.createElement('span');
    priceSpan.className = 'card-price';
    priceSpan.textContent = formatMoney(item.price);

    var badges = document.createElement('div');
    badges.className = 'card-badges';
    for (var j = 0; j < item.assignedTo.length; j++) {
      var p = getParticipant(item.assignedTo[j]);
      if (p) {
        var dot = document.createElement('span');
        dot.className = 'badge-dot';
        dot.style.background = PERSON_COLORS[p.colorIdx];
        dot.title = p.name;
        badges.appendChild(dot);
      }
    }

    card.appendChild(nameSpan);
    card.appendChild(priceSpan);
    card.appendChild(badges);

    // Drag (desktop)
    card.addEventListener('dragstart', function (e) {
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'pool:' + item.id);
    });
    card.addEventListener('dragend', function () {
      card.classList.remove('dragging');
    });

    // Touch (mobile)
    card.addEventListener('click', function (e) {
      e.stopPropagation();
      if (touchSelectedItem && touchSelectedItem.itemId === item.id && touchSelectedItem.source === 'pool') {
        // Deselect
        touchSelectedItem = null;
        card.classList.remove('touch-selected');
      } else {
        clearTouchSelection();
        touchSelectedItem = { itemId: item.id, source: 'pool' };
        card.classList.add('touch-selected');
      }
    });

    return card;
  }

  // ─── Lanes ────────────────────────────────────────────────────────────────

  function renderLanes() {
    lanesEl.innerHTML = '';
    for (var i = 0; i < participants.length; i++) {
      lanesEl.appendChild(makeLane(participants[i]));
    }
  }

  function makeLane(participant) {
    var color = PERSON_COLORS[participant.colorIdx];

    var lane = document.createElement('div');
    lane.className = 'lane';
    lane.dataset.participantId = String(participant.id);
    lane.style.setProperty('--lane-color', color);

    // Header
    var header = document.createElement('div');
    header.className = 'lane-header';

    var dot = document.createElement('span');
    dot.className = 'lane-color-dot';

    var nameEl = document.createElement('span');
    nameEl.className = 'lane-name';
    nameEl.contentEditable = 'true';
    nameEl.textContent = participant.name;
    nameEl.spellcheck = false;
    nameEl.addEventListener('blur', (function (p) {
      return function () {
        var newName = nameEl.textContent.trim();
        if (newName) {
          p.name = newName;
          renderPool(); // refresh badge tooltips
        } else {
          nameEl.textContent = p.name;
        }
      };
    }(participant)));
    nameEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    });

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'lane-del';
    delBtn.textContent = '×';
    delBtn.title = 'Remove ' + participant.name;
    delBtn.addEventListener('click', function () { removeParticipant(participant.id); });

    header.appendChild(dot);
    header.appendChild(nameEl);
    header.appendChild(delBtn);

    // Body (drop zone)
    var body = document.createElement('div');
    body.className = 'lane-body';

    var assignedItems = items.filter(function (it) {
      return it.assignedTo.indexOf(participant.id) !== -1;
    });

    if (assignedItems.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'lane-empty';
      empty.textContent = 'Drop items here';
      body.appendChild(empty);
    } else {
      for (var i = 0; i < assignedItems.length; i++) {
        body.appendChild(makeLaneCard(assignedItems[i], participant.id));
      }
    }

    // Drop handlers on body
    body.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      body.classList.add('drag-over');
      lane.classList.add('drag-over');
    });
    body.addEventListener('dragleave', function (e) {
      if (!body.contains(e.relatedTarget)) {
        body.classList.remove('drag-over');
        lane.classList.remove('drag-over');
      }
    });
    body.addEventListener('drop', (function (pid) {
      return function (e) {
        e.preventDefault();
        body.classList.remove('drag-over');
        lane.classList.remove('drag-over');
        var data = e.dataTransfer.getData('text/plain');
        handleDrop(data, pid);
      };
    }(participant.id)));

    // Touch: tap lane body to assign selected pool card
    body.addEventListener('click', (function (pid) {
      return function (e) {
        if (!touchSelectedItem) return;
        if (touchSelectedItem.source === 'pool') {
          var ok = assignItem(touchSelectedItem.itemId, pid);
          if (!ok) flashLaneCard(touchSelectedItem.itemId, pid);
          clearTouchSelection();
          renderBoard();
        }
      };
    }(participant.id)));

    // Footer
    var footer = makeLaneFooter(participant.id);

    lane.appendChild(header);
    lane.appendChild(body);
    lane.appendChild(footer);
    return lane;
  }

  function makeLaneCard(item, participantId) {
    var shareCount = item.assignedTo.length;
    var shareAmt = item.price / shareCount;

    var card = document.createElement('div');
    card.className = 'lane-card';
    card.draggable = true;
    card.dataset.itemId = String(item.id);
    card.dataset.participantId = String(participantId);

    var main = document.createElement('div');
    main.className = 'card-main';

    var nameSpan = document.createElement('span');
    nameSpan.className = 'card-name';
    nameSpan.textContent = item.qty > 1 ? item.qty + '× ' + item.name : item.name;
    nameSpan.title = nameSpan.textContent;

    var priceSpan = document.createElement('span');
    priceSpan.className = 'card-price';
    priceSpan.textContent = formatMoney(item.price);

    main.appendChild(nameSpan);
    main.appendChild(priceSpan);

    var rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.className = 'card-rm';
    rmBtn.textContent = '×';
    rmBtn.title = 'Remove from this person';
    rmBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      unassignItem(item.id, participantId);
      renderBoard();
    });

    card.appendChild(main);

    if (shareCount > 1) {
      var shareDiv = document.createElement('div');
      shareDiv.className = 'card-share';
      shareDiv.textContent = '÷' + shareCount + ' · ' + formatMoney(shareAmt);
      card.appendChild(shareDiv);
    }

    card.appendChild(rmBtn);

    // Drag (desktop) — encode source lane too
    card.addEventListener('dragstart', function (e) {
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'lane:' + item.id + ':' + participantId);
    });
    card.addEventListener('dragend', function () {
      card.classList.remove('dragging');
    });

    return card;
  }

  function makeLaneFooter(participantId) {
    var totals = calcPersonTotals(participantId);

    var footer = document.createElement('div');
    footer.className = 'lane-footer';

    function frow(label, val) {
      var row = document.createElement('div');
      row.className = 'lane-frow';
      var lbl = document.createElement('span');
      lbl.textContent = label;
      var amt = document.createElement('span');
      amt.className = 'lane-fval';
      amt.textContent = formatMoney(val);
      row.appendChild(lbl);
      row.appendChild(amt);
      return row;
    }

    footer.appendChild(frow('Food', totals.food));
    footer.appendChild(frow('Tax', totals.tax));
    footer.appendChild(frow('Tip', totals.tip));

    var totalRow = frow('Total', totals.total);
    totalRow.classList.add('total');
    footer.appendChild(totalRow);

    return footer;
  }

  // ─── Trash zone ───────────────────────────────────────────────────────────

  function setupTrashZone() {
    trashZoneEl.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      trashZoneEl.classList.add('drag-over');
    });
    trashZoneEl.addEventListener('dragleave', function (e) {
      if (!trashZoneEl.contains(e.relatedTarget)) {
        trashZoneEl.classList.remove('drag-over');
      }
    });
    trashZoneEl.addEventListener('drop', function (e) {
      e.preventDefault();
      trashZoneEl.classList.remove('drag-over');
      var data = e.dataTransfer.getData('text/plain');
      if (!data) return;
      var parts = data.split(':');
      if (parts[0] === 'pool') {
        removeItem(parseInt(parts[1], 10));
      } else if (parts[0] === 'lane') {
        unassignItem(parseInt(parts[1], 10), parseInt(parts[2], 10));
      }
      renderBoard();
    });
  }

  // ─── Drop routing ─────────────────────────────────────────────────────────

  function handleDrop(data, targetParticipantId) {
    if (!data) return;
    var parts = data.split(':');
    var source = parts[0];
    var itemId = parseInt(parts[1], 10);

    if (source === 'pool') {
      var ok = assignItem(itemId, targetParticipantId);
      renderBoard();
      if (!ok) flashLaneCard(itemId, targetParticipantId);
    } else if (source === 'lane') {
      var srcParticipantId = parseInt(parts[2], 10);
      if (srcParticipantId === targetParticipantId) {
        // Dropped onto same lane
        flashLaneCard(itemId, targetParticipantId);
        return;
      }
      unassignItem(itemId, srcParticipantId);
      assignItem(itemId, targetParticipantId);
      renderBoard();
    }
  }

  // ─── Flash animation ──────────────────────────────────────────────────────

  function flashLaneCard(itemId, participantId) {
    var laneEl = lanesEl.querySelector('[data-participant-id="' + participantId + '"]');
    if (!laneEl) return;
    var cardEl = laneEl.querySelector('[data-item-id="' + itemId + '"]');
    if (!cardEl) return;
    cardEl.classList.remove('flash');
    void cardEl.offsetWidth; // reflow
    cardEl.classList.add('flash');
    cardEl.addEventListener('animationend', function () {
      cardEl.classList.remove('flash');
    }, { once: true });
  }

  // ─── Touch selection helpers ──────────────────────────────────────────────

  function clearTouchSelection() {
    touchSelectedItem = null;
    var selected = poolCardsEl.querySelectorAll('.touch-selected');
    for (var i = 0; i < selected.length; i++) {
      selected[i].classList.remove('touch-selected');
    }
  }

  // ─── Add person inline ────────────────────────────────────────────────────

  function promptAddPerson() {
    // Show an inline input instead of window.prompt
    var existing = document.getElementById('addPersonInput');
    if (existing) { existing.focus(); return; }

    var wrap = document.createElement('div');
    wrap.id = 'addPersonInput';
    wrap.style.cssText = 'display:inline-flex;gap:.4rem;align-items:center;margin-left:.5rem;';

    var inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Name…';
    inp.style.cssText = 'font-size:.9rem;padding:.3rem .5rem;width:8rem;';
    inp.maxLength = 40;

    var okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.textContent = 'Add';
    okBtn.style.fontSize = '.9rem';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '✕';
    cancelBtn.style.cssText = 'font-size:.9rem;background:none;border:none;cursor:pointer;color:#888;';

    function submit() {
      var name = inp.value.trim();
      wrap.remove();
      if (name) {
        addParticipant(name);
        renderBoard();
      }
    }

    okBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', function () { wrap.remove(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') wrap.remove();
    });

    wrap.appendChild(inp);
    wrap.appendChild(okBtn);
    wrap.appendChild(cancelBtn);
    addPersonBtnEl.insertAdjacentElement('afterend', wrap);
    inp.focus();
  }

  // ─── Render receipt ───────────────────────────────────────────────────────

  function renderReceipt(data) {
    receiptData = data;
    items = [];
    itemIdCounter = 0;

    for (var i = 0; i < data.items.length; i++) {
      var d = data.items[i];
      items.push({ id: ++itemIdCounter, name: d.name, price: d.price, qty: d.qty || 1, assignedTo: [] });
    }

    // Seed one default participant on first load only
    if (participants.length === 0) {
      addParticipant('Me');
    }

    var meta = '';
    if (data.restaurant) meta += '<strong>' + escapeHtml(data.restaurant) + '</strong>';
    if (data.date)       meta += (meta ? ' · ' : '') + escapeHtml(data.date);
    receiptMetaEl.innerHTML = meta;

    resultsSectionEl.hidden = false;
    resultsSectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    renderBoard();
  }

  // ─── Bookmarklet ─────────────────────────────────────────────────────────

  var BOOKMARKLET_CODE = '(function(){' +
    'var nd=document.getElementById(\'__NEXT_DATA__\'),p=null;' +
    'if(nd){try{' +
      'var d=JSON.parse(nd.textContent),' +
      'pp=(d.props||{}).pageProps||{},' +
      'rc=pp.receipt||pp.checkReceipt||pp.receiptData||pp.data||{},' +
      'ck=rc.check||rc.order||rc,' +
      'sl=ck.selections||ck.lineItems||ck.items||[];' +
      'if(sl.length){p={s:\'nd\',' +
        'r:((rc.restaurant||rc.restaurantInfo||{}).name||document.title||\'\')+\'\',' +
        'i:sl.filter(function(x){return!x.parentItemId;}).map(function(x){' +
          'return{n:x.displayName||x.name||\'Item\',' +
                 'p:+(x.price||x.unitPrice||0),' +
                 'q:+(x.quantity||x.qty||1)};}),' +
        'sb:+(ck.subtotal||rc.subtotal||0),' +
        'tx:+(ck.taxAmount||ck.tax||rc.taxAmount||rc.tax||0),' +
        'tp:+(ck.gratuity||ck.tip||rc.gratuity||rc.tip||0),' +
        'tt:+(ck.totalAmount||ck.total||rc.totalAmount||rc.total||0)' +
      '};}' +
    '}catch(e){}}' +
    'if(!p||!p.i||!p.i.length){p={s:\'txt\',t:document.body.innerText};}' +
    'window.open(\'' + TOOL_URL + '#data=\'+btoa(unescape(encodeURIComponent(JSON.stringify(p)))),\'_blank\');' +
  '})();';

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    receiptTextEl    = document.getElementById('receiptText');
    parseTextBtnEl   = document.getElementById('parseTextBtn');
    previewEl        = document.getElementById('preview');
    inputNoticeEl    = document.getElementById('inputNotice');
    resultsSectionEl = document.getElementById('resultsSection');
    receiptMetaEl    = document.getElementById('receiptMeta');
    summaryInlineEl  = document.getElementById('summaryInline');
    poolCardsEl      = document.getElementById('poolCards');
    trashZoneEl      = document.getElementById('trashZone');
    lanesEl          = document.getElementById('lanes');
    addPersonBtnEl   = document.getElementById('addPersonBtn');

    document.getElementById('bookmarkletLink').href = 'javascript:' + BOOKMARKLET_CODE;

    setupTrashZone();

    // Live preview on input
    receiptTextEl.addEventListener('input', function () {
      schedulePreview(receiptTextEl.value);
    });

    parseTextBtnEl.addEventListener('click', function () {
      var text = receiptTextEl.value.trim();
      if (!text) { setNotice(inputNoticeEl, 'error', 'Paste or type receipt text first.'); return; }
      var parsed = parseReceiptText(text);
      if (!parsed || !parsed.items.length) {
        setNotice(inputNoticeEl, 'error', 'No items found. Make sure the text includes item names and prices.');
        return;
      }
      setNotice(inputNoticeEl, '', '');
      renderReceipt(parsed);
    });

    addPersonBtnEl.addEventListener('click', promptAddPerson);

    // Dismiss touch selection when clicking outside pool cards
    document.addEventListener('click', function (e) {
      if (!poolCardsEl.contains(e.target)) {
        clearTouchSelection();
      }
    });

    // Load from bookmarklet hash data
    var hashData = parseHashData();
    if (hashData && hashData.items.length) {
      setNotice(inputNoticeEl, 'info', 'Receipt loaded from bookmarklet.');
      renderReceipt(hashData);
      history.replaceState(null, '', location.pathname);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
