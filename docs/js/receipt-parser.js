(function () {
  'use strict';

  var TOOL_URL = 'https://zr0w.github.io/tools/receipt-parser.html';

  // State
  var receiptData = null;
  var items = [];
  var itemIdCounter = 0;

  // DOM refs
  var receiptUrlEl, fetchBtnEl, receiptTextEl, parseTextBtnEl;
  var inputNoticeEl, resultsSectionEl, receiptMetaEl, itemListEl;
  var selectAllBtnEl, deselectAllBtnEl;
  var dispSubtotalEl, dispTaxEl, dispTipEl, dispTotalEl;
  var portionAmountEl, portionDetailEl, resultsNoticeEl;

  // ─── Utilities ───────────────────────────────────────────────────────────

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

  // ─── Parse Toast __NEXT_DATA__ (from fetched HTML) ───────────────────────

  function parseNextDataHtml(html) {
    var match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return null;
    var data;
    try { data = JSON.parse(match[1]); } catch (e) { return null; }
    return extractFromNextData(data);
  }

  function extractFromNextData(data) {
    var pp = data && data.props && data.props.pageProps;
    if (!pp) return null;

    var rc = pp.receipt || pp.checkReceipt || pp.receiptData || pp.data || pp;
    var ck = rc.check || rc.order || rc;
    var sels = ck.selections || ck.lineItems || ck.items || ck.orderItems;
    if (!Array.isArray(sels) || !sels.length) return null;

    var parsedItems = [];
    for (var i = 0; i < sels.length; i++) {
      var s = sels[i];
      if (s.parentItemId || s.parentId) continue; // skip modifiers
      var name = s.displayName || s.name || s.itemName || ('Item ' + (parsedItems.length + 1));
      var qty = parseInt(s.quantity || s.qty || 1, 10) || 1;
      var price = parseMoney(s.price || s.unitPrice || s.preDiscountPrice || s.totalPrice || 0);
      // Multiply if price is per-unit and totalPrice not given
      if (qty > 1 && s.totalPrice == null && (s.price != null || s.unitPrice != null)) {
        price = price * qty;
      }
      if (price > 0) parsedItems.push({ name: name, price: price, qty: qty });
    }

    if (!parsedItems.length) return null;

    var subtotal = parseMoney(ck.subtotal || ck.subTotal || rc.subtotal || 0);
    var tax = parseMoney(ck.taxAmount || ck.tax || ck.taxTotal || rc.taxAmount || rc.tax || 0);
    var tip = parseMoney(ck.gratuity || ck.tip || ck.tipAmount || rc.gratuity || rc.tip || 0);
    var total = parseMoney(ck.totalAmount || ck.total || rc.totalAmount || rc.total || 0);
    if (total <= 0 && subtotal > 0) total = subtotal + tax + tip;

    var restaurantObj = rc.restaurant || rc.restaurantInfo || rc.venue || {};
    var restaurant = restaurantObj.name || restaurantObj.restaurantName || '';

    var closedAt = ck.closedDate || ck.closedAt || ck.paidDate || rc.closedDate || '';
    var date = '';
    if (closedAt) {
      try { date = new Date(closedAt).toLocaleDateString(); } catch (e) {}
    }

    return { restaurant: restaurant, date: date, subtotal: subtotal, tax: tax, tip: tip, total: total, items: parsedItems };
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
      // Structured data from __NEXT_DATA__ via bookmarklet
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

  // ─── Parse pasted / innerText receipt ────────────────────────────────────

  function parseReceiptText(text) {
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); });
    var parsedItems = [];
    var subtotal = 0, tax = 0, tip = 0, total = 0;
    var restaurant = '';

    // Patterns
    var tabPriceRe      = /^(.+?)\t\$?(\d+\.\d{2})\s*$/;
    var spacePriceRe    = /^(.*\S)\s{2,}\$?(\d+\.\d{2})\s*$/;
    var priceOnlyRe     = /^\$?(\d+\.\d{2})\s*$/;
    var qtyPrefixRe     = /^(\d+)\s+(.+)/;
    var skipRe          = /^(server|table|guests?|ordered|opened|closed|check\s*#|order\s*#|card|auth|approval|receipt|thank|phone|www\.|http|input\s+type|visa|mastercard|amex|discover|powered|©|never\s+miss|sign\s+up|download|application|device|authorization|transaction|time\s*$)/i;

    var firstReal = true;
    var pendingName = null;

    function classify(name, price) {
      var lc = name.toLowerCase().trim();
      if (/subtotal/.test(lc) && !/^total/.test(lc)) { if (!subtotal) subtotal = price; return; }
      if (/\btax\b/.test(lc))                          { if (!tax)      tax      = price; return; }
      if (/tip|gratuity/.test(lc))                     { if (!tip)      tip      = price; return; }
      if (/^total/.test(lc))                            { if (price > total) total = price; return; }
      // Item line
      if (skipRe.test(name)) return;
      var m = name.match(qtyPrefixRe);
      var qty      = m ? parseInt(m[1], 10) : 1;
      var itemName = m ? m[2].trim() : name.trim();
      if (itemName && price > 0) parsedItems.push({ name: itemName, price: price, qty: qty });
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line) { pendingName = null; continue; }

      // First non-skip, non-price line = restaurant name
      if (firstReal && !skipRe.test(line) && !priceOnlyRe.test(line)) {
        restaurant = line;
        firstReal = false;
        continue;
      }
      firstReal = false;

      // Price-only line: pair with pending name
      var pm = line.match(priceOnlyRe);
      if (pm && pendingName) {
        classify(pendingName, parseMoney(pm[1]));
        pendingName = null;
        continue;
      }

      // Tab-separated: "Name\t$X.XX"
      var tm = line.match(tabPriceRe);
      if (tm) {
        classify(tm[1], parseMoney(tm[2]));
        pendingName = null;
        continue;
      }

      // Space-separated: "Name   $X.XX"
      var sm = line.match(spacePriceRe);
      if (sm) {
        classify(sm[1], parseMoney(sm[2]));
        pendingName = null;
        continue;
      }

      // No price on this line — might be a name for next line's price
      if (!skipRe.test(line) && !pm && line.length < 80) {
        pendingName = line;
      } else {
        pendingName = null;
      }
    }

    if (total <= 0 && subtotal > 0) total = subtotal + tax + tip;
    return { restaurant: restaurant, date: '', subtotal: subtotal, tax: tax, tip: tip, total: total, items: parsedItems };
  }

  // ─── CORS-proxy fetch ─────────────────────────────────────────────────────

  function fetchReceipt(url) {
    setNotice(inputNoticeEl, 'info', 'Fetching receipt…');
    fetchBtnEl.disabled = true;

    var proxies = [
      {
        build:   function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); },
        extract: function (r) { return r.text(); }
      },
      {
        build:   function (u) { return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); },
        extract: function (r) {
          return r.json().then(function (j) {
            if (!j.contents) throw new Error('empty');
            return j.contents;
          });
        }
      },
      {
        build:   function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); },
        extract: function (r) { return r.text(); }
      }
    ];

    tryProxy(url, proxies, 0);
  }

  function tryProxy(url, proxies, idx) {
    if (idx >= proxies.length) {
      fetchBtnEl.disabled = false;
      setNotice(inputNoticeEl, 'error',
        'Toast blocks automated requests. Use the bookmarklet (drag it to your bookmarks bar), or paste the receipt text below.');
      document.getElementById('textDetails').open = true;
      return;
    }

    var proxy = proxies[idx];
    fetch(proxy.build(url))
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return proxy.extract(resp);
      })
      .then(function (html) {
        fetchBtnEl.disabled = false;
        var parsed = parseNextDataHtml(html);
        if (parsed && parsed.items.length) {
          setNotice(inputNoticeEl, '', '');
          renderReceipt(parsed);
          return;
        }
        // Fallback: strip tags and parse as text
        var bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                          .replace(/<[^>]+>/g, ' ')
                          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                          .replace(/&nbsp;/g, ' ').replace(/\s+/g, '\n');
        parsed = parseReceiptText(bodyText);
        if (parsed && parsed.items.length) {
          setNotice(inputNoticeEl, 'warn', 'Fetched page but no structured data found — parsed visible text instead. Check items for accuracy.');
          renderReceipt(parsed);
          return;
        }
        setNotice(inputNoticeEl, 'error',
          'Fetched the page but could not extract receipt items. Use the bookmarklet or paste the text below.');
        document.getElementById('textDetails').open = true;
      })
      .catch(function () { tryProxy(url, proxies, idx + 1); });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  function renderReceipt(data) {
    receiptData = data;
    items = [];
    itemIdCounter = 0;

    for (var i = 0; i < data.items.length; i++) {
      var d = data.items[i];
      items.push({ id: ++itemIdCounter, name: d.name, price: d.price, qty: d.qty || 1, checked: true, removed: false });
    }

    var meta = '';
    if (data.restaurant) meta += '<strong>' + escapeHtml(data.restaurant) + '</strong>';
    if (data.date)       meta += (meta ? '<br>' : '') + escapeHtml(data.date);
    receiptMetaEl.innerHTML = meta;

    renderItemList();

    dispSubtotalEl.textContent = data.subtotal > 0 ? formatMoney(data.subtotal) : '—';
    dispTaxEl.textContent      = data.tax      > 0 ? formatMoney(data.tax)      : '—';
    dispTipEl.textContent      = data.tip      > 0 ? formatMoney(data.tip)      : '—';
    dispTotalEl.textContent    = data.total    > 0 ? formatMoney(data.total)    : '—';

    resultsSectionEl.hidden = false;
    resultsSectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updatePortion();

    if (data.subtotal > 0) {
      var sum = 0;
      for (var j = 0; j < items.length; j++) sum += items[j].price;
      var diff = Math.abs(sum - data.subtotal);
      if (diff > 0.05) {
        setNotice(resultsNoticeEl, 'warn',
          'Item prices sum to ' + formatMoney(sum) + ' but subtotal is ' + formatMoney(data.subtotal) +
          '. Portion = item ÷ subtotal × total.');
      } else {
        setNotice(resultsNoticeEl, '', '');
      }
    }
  }

  function renderItemList() {
    itemListEl.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      itemListEl.appendChild(makeItemEl(items[i]));
    }
  }

  function makeItemEl(item) {
    var div = document.createElement('div');
    div.className = 'item-row' + (item.removed ? ' removed' : '');
    div.dataset.id = String(item.id);

    var cbId = 'cb-' + item.id;
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = cbId;
    cb.checked = item.checked;

    var lbl = document.createElement('label');
    lbl.htmlFor = cbId;

    var nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    nameSpan.textContent = item.qty > 1 ? item.qty + '× ' + item.name : item.name;

    var priceSpan = document.createElement('span');
    priceSpan.className = 'item-price';
    priceSpan.textContent = formatMoney(item.price);

    lbl.appendChild(nameSpan);
    lbl.appendChild(priceSpan);

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', 'Remove ' + item.name);

    cb.addEventListener('change', (function (it, checkbox) {
      return function () { it.checked = checkbox.checked; updatePortion(); };
    }(item, cb)));

    removeBtn.addEventListener('click', (function (it, el) {
      return function () {
        it.removed = true;
        it.checked = false;
        el.classList.add('removed');
        updatePortion();
      };
    }(item, div)));

    div.appendChild(cb);
    div.appendChild(lbl);
    div.appendChild(removeBtn);
    return div;
  }

  function syncCheckboxes() {
    var rows = itemListEl.querySelectorAll('.item-row');
    for (var i = 0; i < rows.length; i++) {
      var id = parseInt(rows[i].dataset.id, 10);
      for (var j = 0; j < items.length; j++) {
        if (items[j].id === id) {
          var cb = rows[i].querySelector('input[type="checkbox"]');
          if (cb) cb.checked = items[j].checked;
          break;
        }
      }
    }
  }

  function updatePortion() {
    if (!receiptData) return;
    var subtotal = receiptData.subtotal;
    var total    = receiptData.total;

    if (subtotal <= 0 || total <= 0) {
      portionAmountEl.textContent = '—';
      portionDetailEl.textContent = 'Missing subtotal or total from receipt.';
      return;
    }

    var selectedSum = 0, count = 0;
    for (var i = 0; i < items.length; i++) {
      if (!items[i].removed && items[i].checked) {
        selectedSum += items[i].price;
        count++;
      }
    }

    if (count === 0) {
      portionAmountEl.textContent = formatMoney(0);
      portionDetailEl.textContent = 'No items selected.';
      return;
    }

    var portion = Math.round((selectedSum / subtotal) * total * 100) / 100;
    portionAmountEl.textContent = formatMoney(portion);
    var pct = ((selectedSum / subtotal) * 100).toFixed(1);
    portionDetailEl.textContent =
      count + ' item' + (count !== 1 ? 's' : '') +
      ' · ' + formatMoney(selectedSum) + ' of ' + formatMoney(subtotal) +
      ' subtotal (' + pct + '%) · includes proportional tax & tip';
  }

  // ─── Bookmarklet ─────────────────────────────────────────────────────────
  // Runs on a Toast receipt page; extracts data and opens this tool with it.

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
    receiptUrlEl     = document.getElementById('receiptUrl');
    fetchBtnEl       = document.getElementById('fetchBtn');
    receiptTextEl    = document.getElementById('receiptText');
    parseTextBtnEl   = document.getElementById('parseTextBtn');
    inputNoticeEl    = document.getElementById('inputNotice');
    resultsSectionEl = document.getElementById('resultsSection');
    receiptMetaEl    = document.getElementById('receiptMeta');
    itemListEl       = document.getElementById('itemList');
    selectAllBtnEl   = document.getElementById('selectAllBtn');
    deselectAllBtnEl = document.getElementById('deselectAllBtn');
    dispSubtotalEl   = document.getElementById('dispSubtotal');
    dispTaxEl        = document.getElementById('dispTax');
    dispTipEl        = document.getElementById('dispTip');
    dispTotalEl      = document.getElementById('dispTotal');
    portionAmountEl  = document.getElementById('portionAmount');
    portionDetailEl  = document.getElementById('portionDetail');
    resultsNoticeEl  = document.getElementById('resultsNotice');

    // Wire up bookmarklet href
    document.getElementById('bookmarkletLink').href = 'javascript:' + BOOKMARKLET_CODE;

    fetchBtnEl.addEventListener('click', function () {
      var url = receiptUrlEl.value.trim();
      if (!url) { setNotice(inputNoticeEl, 'error', 'Enter a receipt URL first.'); return; }
      fetchReceipt(url);
    });
    receiptUrlEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') fetchBtnEl.click();
    });

    parseTextBtnEl.addEventListener('click', function () {
      var text = receiptTextEl.value.trim();
      if (!text) { setNotice(inputNoticeEl, 'error', 'Paste receipt text first.'); return; }
      var parsed = parseReceiptText(text);
      if (!parsed || !parsed.items.length) {
        setNotice(inputNoticeEl, 'error', 'No items found. Make sure the text includes item names and prices.');
        return;
      }
      setNotice(inputNoticeEl, '', '');
      renderReceipt(parsed);
    });

    selectAllBtnEl.addEventListener('click', function () {
      for (var i = 0; i < items.length; i++) { if (!items[i].removed) items[i].checked = true; }
      syncCheckboxes();
      updatePortion();
    });
    deselectAllBtnEl.addEventListener('click', function () {
      for (var i = 0; i < items.length; i++) { items[i].checked = false; }
      syncCheckboxes();
      updatePortion();
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
