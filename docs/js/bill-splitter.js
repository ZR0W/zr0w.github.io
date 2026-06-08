(function () {
  'use strict';

  var itemListEl = null;
  var subtotalEl = null;
  var taxEl = null;
  var tipEl = null;
  var totalEl = null;
  var itemsSumEl = null;
  var noticeEl = null;
  var resultsTableEl = null;
  var resultsBodyEl = null;
  var requestsSumEl = null;

  var totalManual = false;
  var itemIdCounter = 0;

  function parseMoney(value) {
    if (value === '' || value == null) return 0;
    var n = parseFloat(value);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function formatMoney(n) {
    return '$' + n.toFixed(2);
  }

  function formatPct(ratio) {
    return (ratio * 100).toFixed(1) + '%';
  }

  function roundCents(n) {
    return Math.round(n * 100) / 100;
  }

  function sumItemPrices() {
    var rows = itemListEl.querySelectorAll('.item-row');
    var sum = 0;
    for (var i = 0; i < rows.length; i++) {
      sum += parseMoney(rows[i].querySelector('.item-price').value);
    }
    return roundCents(sum);
  }

  function getItems() {
    var rows = itemListEl.querySelectorAll('.item-row');
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var name = row.querySelector('.item-name').value.trim();
      var price = parseMoney(row.querySelector('.item-price').value);
      if (price > 0) {
        items.push({ name: name || 'Item ' + (items.length + 1), price: price });
      }
    }
    return items;
  }

  function distributeCents(amounts, targetTotal) {
    if (!amounts.length) return [];
    var scaled = amounts.map(function (a) { return a * 100; });
    var floored = scaled.map(function (s) { return Math.floor(s); });
    var assigned = floored.reduce(function (a, b) { return a + b; }, 0);
    var targetCents = Math.round(targetTotal * 100);
    var remainder = targetCents - assigned;
    var fractions = scaled.map(function (s, i) {
      return { index: i, frac: s - floored[i] };
    });
    fractions.sort(function (a, b) { return b.frac - a.frac; });
    for (var r = 0; r < remainder; r++) {
      floored[fractions[r % fractions.length].index] += 1;
    }
    return floored.map(function (c) { return c / 100; });
  }

  function setNotice(type, message) {
    noticeEl.className = 'notice' + (type ? ' ' + type : '');
    noticeEl.textContent = message || '';
  }

  function syncItemsSumDisplay() {
    var sum = sumItemPrices();
    itemsSumEl.textContent = sum > 0 ? formatMoney(sum) : '—';
  }

  function syncTotalFromComponents() {
    if (totalManual) return;
    var calc = roundCents(parseMoney(subtotalEl.value) + parseMoney(taxEl.value) + parseMoney(tipEl.value));
    totalEl.value = calc > 0 ? calc.toFixed(2) : '';
  }

  function onComponentInput() {
    totalManual = false;
    syncTotalFromComponents();
    recalculate();
  }

  function onTotalInput() {
    var subtotal = parseMoney(subtotalEl.value);
    var tax = parseMoney(taxEl.value);
    var tip = parseMoney(tipEl.value);
    var calc = roundCents(subtotal + tax + tip);
    var entered = parseMoney(totalEl.value);

    if (totalEl.value === '' || Math.abs(roundCents(entered) - calc) < 0.005) {
      totalManual = false;
    } else {
      totalManual = true;
      taxEl.value = '';
      tipEl.value = '';
    }
    recalculate();
  }

  function createItemRow(name, price) {
    var id = ++itemIdCounter;
    var row = document.createElement('div');
    row.className = 'item-row';
    row.dataset.itemId = String(id);
    row.innerHTML =
      '<input type="text" class="item-name" placeholder="Item name" aria-label="Item name" autocomplete="off" value="' + (name || '') + '">' +
      '<input type="number" class="item-price" min="0" step="0.01" placeholder="0.00" inputmode="decimal" aria-label="Item price" autocomplete="off" value="' + (price != null ? price : '') + '">' +
      '<button type="button" class="remove" aria-label="Remove item"><span class="remove-long">Remove</span><span class="remove-short" aria-hidden="true">×</span></button>';
    return row;
  }

  function addItem(name, price) {
    var row = createItemRow(name, price);
    itemListEl.appendChild(row);
    row.querySelector('.item-name').addEventListener('input', recalculate);
    row.querySelector('.item-price').addEventListener('input', onItemInput);
    row.querySelector('.remove').addEventListener('click', function () {
      row.remove();
      if (!itemListEl.querySelector('.item-row')) addItem('', '');
      onItemInput();
    });
  }

  function onItemInput() {
    syncItemsSumDisplay();
    recalculate();
  }

  function computeRequests(items, subtotal, total) {
    var raw = items.map(function (item) {
      return (item.price / subtotal) * total;
    });
    var itemsSum = roundCents(items.reduce(function (s, item) { return s + item.price; }, 0));
    if (Math.abs(itemsSum - subtotal) < 0.005) {
      return distributeCents(raw, total);
    }
    return raw.map(function (amount) { return roundCents(amount); });
  }

  function recalculate() {
    syncItemsSumDisplay();

    var items = getItems();
    var itemsSum = sumItemPrices();
    var subtotal = parseMoney(subtotalEl.value);
    var total = parseMoney(totalEl.value);

    if (!items.length) {
      resultsTableEl.hidden = true;
      setNotice('info', 'Add at least one item with a price.');
      return;
    }

    if (subtotal <= 0) {
      resultsTableEl.hidden = true;
      setNotice('error', 'Enter a subtotal greater than zero.');
      return;
    }

    if (total <= 0) {
      resultsTableEl.hidden = true;
      setNotice('error', 'Enter a final total greater than zero.');
      return;
    }

    var messages = [];
    if (itemsSum > 0 && Math.abs(itemsSum - subtotal) > 0.01) {
      messages.push(
        'Item prices sum to ' + formatMoney(itemsSum) + ' but subtotal is ' + formatMoney(subtotal) +
        '. Each request uses item price ÷ subtotal × total.'
      );
    }
    if (totalManual) {
      messages.push('Total entered directly — tax and tip cleared. Extra amount is ' + formatMoney(total - subtotal) + ' above subtotal.');
    }
    setNotice(messages.length ? 'info' : '', messages.join(' '));

    var requests = computeRequests(items, subtotal, total);

    resultsBodyEl.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      var share = items[i].price / subtotal;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td data-label="Item">' + escapeHtml(items[i].name) + '</td>' +
        '<td data-label="Price">' + formatMoney(items[i].price) + '</td>' +
        '<td data-label="Share">' + formatPct(share) + '</td>' +
        '<td class="request" data-label="Request">' + formatMoney(requests[i]) + '</td>';
      resultsBodyEl.appendChild(tr);
    }

    var sumRequests = roundCents(requests.reduce(function (a, b) { return a + b; }, 0));
    requestsSumEl.textContent = formatMoney(sumRequests);
    resultsTableEl.hidden = false;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function init() {
    itemListEl = document.getElementById('itemList');
    subtotalEl = document.getElementById('subtotal');
    taxEl = document.getElementById('tax');
    tipEl = document.getElementById('tip');
    totalEl = document.getElementById('total');
    itemsSumEl = document.getElementById('itemsSum');
    noticeEl = document.getElementById('notice');
    resultsTableEl = document.getElementById('resultsTable');
    resultsBodyEl = document.getElementById('resultsBody');
    requestsSumEl = document.getElementById('requestsSum');

    document.getElementById('addItemBtn').addEventListener('click', function () {
      addItem('', '');
      recalculate();
    });

    document.getElementById('useItemsSumBtn').addEventListener('click', function () {
      var sum = sumItemPrices();
      if (sum > 0) {
        subtotalEl.value = sum.toFixed(2);
        onComponentInput();
      }
    });

    subtotalEl.addEventListener('input', onComponentInput);
    taxEl.addEventListener('input', onComponentInput);
    tipEl.addEventListener('input', onComponentInput);
    totalEl.addEventListener('input', onTotalInput);

    addItem('', '');
    addItem('', '');
    recalculate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
