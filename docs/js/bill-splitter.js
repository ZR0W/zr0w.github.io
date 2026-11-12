(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  //  Receipt text parser (pure functions, no DOM; also loadable from Node for
  //  tests/bill-splitter.test.js)
  //
  //  Pipeline: normalise lines → find amounts → merge "name / price" split
  //  across lines → find where the totals section starts → classify item lines
  //  and summary lines by keyword → infer missing numbers → reconcile items
  //  against the subtotal by trying alternative readings.
  // ═══════════════════════════════════════════════════════════════════════════

  var Parser = (function () {
    var SUBTOTAL_RE = /\bsub\s*-?\s*total\b|\bsubtotal\b|\b(food|net|item|purchase)\s+total\b|\btotal\s+before\s+tax\b|\bpre-?tax\s+total\b/i;
    var TAX_RE      = /\b(tax|taxes|hst|gst|pst|qst|vat|iva|mwst)\b/i;
    var TIP_RE      = /\b(tip|tips|gratuity|grat)\b/i;
    var TOTAL_RE    = /\b(grand\s+)?total\b|\b(amount|balance|total)\s+due\b/i;
    var DISCOUNT_RE = /\b(discount|promo|promotion|coupon|comp|comped|voucher|happy\s+hour)\b|\b\d+\s?%\s+off\b/i;
    var FEE_RE      = /\b(fee|fees|surcharge|service|charge|delivery|bag|deposit|corkage|kitchen\s+appreciation)\b/i;
    var NOISE_RE    = /\b(visa|master\s?card|amex|american\s+express|discover|jcb|credit|debit|card|cash|change|tendered|payment|paid|refund|balance|rewards?|points|loyalty|saved|savings|feedback|rating|suggested|gift\s+card|auth|authorization|approval|table|server|guests?|seat|check\s*#|order\s*#|receipt)\b/i;
    var MOD_RE      = /^(\+|add\b|extra\b|no\b|sub\b|substitute\b|w\/|without\b|on\s+the\s+side\b)/i;
    var DATE_RES    = [
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i,
      /\b\d{4}-\d{2}-\d{2}\b/
    ];
    var LETTER_RE = /[A-Za-zÀ-ɏ]/;

    // sign? symbol? sign? digits (with optional thousands commas) decimal? closing paren?
    var AMOUNT_RE = /(\()?([-−])?([$€£¥])?([-−])?(\d{1,3}(?:,\d{3})+|\d+)(?:(\.)(\d{1,2})|(,)(\d{2}))?(?![\d%])(\))?/g;

    function round2(n) { return Math.round(n * 100) / 100; }
    function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 0.011 : tol); }
    function sum(arr, key) {
      var s = 0;
      for (var i = 0; i < arr.length; i++) s += key ? arr[i][key] : arr[i];
      return round2(s);
    }
    function hasLetters(s) { return LETTER_RE.test(s || ''); }

    function normaliseLine(raw) {
      return raw
        .replace(/[   ]/g, ' ')
        .replace(/\.{3,}|·{2,}|_{3,}/g, '  ')   // dot leaders
        .replace(/\s+$/, '');
    }

    function indentOf(raw) {
      var m = raw.match(/^[ \t]*/)[0];
      return m.replace(/\t/g, '    ').length;
    }

    // Returns [{value, start, strict}] for every money-looking token.
    // strict = has a currency symbol or decimals; bare integers only count in
    // loose mode (hand-typed notes) and only at the end of the line.
    function findAmounts(line, loose) {
      var out = [];
      var m;
      AMOUNT_RE.lastIndex = 0;
      while ((m = AMOUNT_RE.exec(line)) !== null) {
        var start = m.index;
        var end = start + m[0].length;
        var prev = start > 0 ? line.charAt(start - 1) : ' ';
        var next = line.charAt(end);
        if (/[A-Za-z0-9#\/:.,@]/.test(prev) && prev !== '@') continue;
        if (/[A-Za-z\/:]/.test(next)) continue;
        var open = m[1], signA = m[2], sym = m[3], signB = m[4];
        var intPart = m[5];
        var frac = m[7] != null ? m[7] : m[9];
        var close = m[10];
        var hasDecimal = frac != null;
        if (!sym && !hasDecimal) {
          if (!loose) continue;
          if (line.slice(end).trim()) continue;
          if (intPart.length > 4) continue;
        }
        var value = parseInt(intPart.replace(/,/g, ''), 10);
        if (hasDecimal) value += parseInt((frac + '0').slice(0, 2), 10) / 100;
        var negative = !!(signA || signB) || !!(open && close);
        if (open && !close) start += 1; // a stray "(" is not part of the amount
        out.push({ value: round2(negative ? -value : value), start: start, strict: !!(sym || hasDecimal) });
      }
      return out;
    }

    function findPercent(line) {
      var m = line.match(/(\d+(?:\.\d+)?)\s?%/);
      return m ? parseFloat(m[1]) : null;
    }

    function cleanLabel(s) {
      return s
        .replace(/[\t ]+/g, ' ')
        .replace(/^[\s*•·–—-]+/, '')
        .replace(/[\s:=*·•–—_.-]+$/, '')
        .trim();
    }

    function findDate(lines) {
      for (var i = 0; i < lines.length; i++) {
        for (var j = 0; j < DATE_RES.length; j++) {
          var m = lines[i].match(DATE_RES[j]);
          if (m) return m[0];
        }
      }
      return '';
    }

    // Pull a quantity out of an item label. Returns {name, qty}.
    function splitQty(label) {
      var m;
      var units = '(?!(?:oz|lb|lbs|g|kg|ml|cl|l|in|inch|pc|pcs|piece|pieces|ct)\\b)';
      if ((m = label.match(/^(\d{1,2})\s*[x×]\s*(.+)$/i))) return { qty: +m[1], name: m[2] };
      if ((m = label.match(new RegExp('^(\\d{1,2})\\s+' + units + '(?=\\D)(.+)$', 'i')))) return { qty: +m[1], name: m[2] };
      if ((m = label.match(/^(.+?)\s*[x×]\s*(\d{1,2})$/i))) return { qty: +m[2], name: m[1] };
      if ((m = label.match(/^(.+?)\s*\((\d{1,2})\)$/))) return { qty: +m[2], name: m[1] };
      return { qty: 1, name: label };
    }

    function parse(text) {
      var rawLines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
      var lines = rawLines.map(normaliseLine);

      var strictCount = 0;
      for (var s = 0; s < lines.length; s++) strictCount += findAmounts(lines[s], false).length;
      var loose = strictCount < 2;

      // ── Pass 1: build entries (a label plus the amounts on its line) ──────
      var entries = [];
      var orphan = null; // last unpriced text line, waiting for a price-only line
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var trimmed = line.trim();
        if (!trimmed) continue; // blank lines don't break a name/price pair

        var indent = indentOf(line);
        var amounts = findAmounts(trimmed, loose);
        var pct = findPercent(trimmed);
        var label = cleanLabel(amounts.length ? trimmed.slice(0, amounts[0].start) : trimmed);

        if (amounts.length && !hasLetters(label) && orphan) {
          if (orphan.noteEntry && entries[entries.length - 1] === orphan.noteEntry) entries.pop();
          entries.push({
            label: orphan.label, amounts: amounts, pct: pct != null ? pct : orphan.pct,
            indent: orphan.indent, raw: orphan.raw + ' ' + trimmed
          });
          orphan = null;
          continue;
        }

        if (!amounts.length) {
          var noteEntry = null;
          if (MOD_RE.test(label) || (pct != null && TIP_RE.test(label))) {
            noteEntry = { label: label, amounts: [], pct: pct, indent: indent, raw: trimmed };
            entries.push(noteEntry);
          }
          orphan = (hasLetters(label) && !NOISE_RE.test(label) && label.length <= 80)
            ? { label: label, pct: pct, indent: indent, raw: trimmed, noteEntry: noteEntry }
            : null;
          continue;
        }

        entries.push({ label: label, amounts: amounts, pct: pct, indent: indent, raw: trimmed });
        orphan = null;
      }

      // ── Pass 2: where does the totals section start? ──────────────────────
      var summaryStart = entries.length;
      for (var e = 0; e < entries.length; e++) {
        var en = entries[e];
        if (!en.amounts.length && en.pct == null) continue;
        if (SUBTOTAL_RE.test(en.label) || TAX_RE.test(en.label) || TIP_RE.test(en.label) || TOTAL_RE.test(en.label)) {
          summaryStart = e;
          break;
        }
      }

      var items = [];
      var ignored = [];
      var notes = [];
      var lastItem = null;

      function ignore(entry, reason) {
        if (!entry.amounts.length) return;
        ignored.push({
          text: entry.raw,
          label: entry.label,
          amount: entry.amounts[entry.amounts.length - 1].value,
          reason: reason
        });
      }

      // ── Pass 3a: item lines ───────────────────────────────────────────────
      for (var a = 0; a < summaryStart; a++) {
        var it = entries[a];
        if (!it.amounts.length) {
          if (lastItem && MOD_RE.test(it.label)) lastItem.mods.push({ name: it.label, price: 0, counted: true });
          continue;
        }
        var amt = it.amounts[it.amounts.length - 1].value;
        if (!hasLetters(it.label)) { ignore(it, 'no label'); continue; }
        if (NOISE_RE.test(it.label) && !DISCOUNT_RE.test(it.label)) { ignore(it, 'looks like payment or receipt info'); continue; }

        var isDiscount = amt < 0 || DISCOUNT_RE.test(it.label);
        var startsWithQty = /^\d{1,2}\s*[x×]?\s+\D/i.test(it.label);
        var isMod = MOD_RE.test(it.label) || (lastItem && !startsWithQty && it.indent >= lastItem.indent + 2);
        if (isDiscount) amt = -Math.abs(amt);

        if ((isMod || isDiscount) && lastItem) {
          lastItem.mods.push({ name: it.label, price: amt, counted: true });
          continue;
        }

        var q = splitQty(it.label.replace(/\s*@\s*$/, ''));
        var name = cleanLabel(q.name) || it.label;
        var item = {
          name: name, qty: q.qty || 1, basePrice: amt, unitKnown: false,
          mods: [], indent: it.indent, raw: it.raw
        };

        // "2 @ $4.50  $9.00" or "Beer 2 @ 4.50"
        var at = it.raw.match(/(\d{1,2})?\s*@\s*/);
        if (at && /@\s*$/.test(it.label)) {
          var lead = it.label.replace(/\s*@\s*$/, '').match(/(\d{1,2})$/);
          if (lead) { item.qty = +lead[1]; item.name = cleanLabel(it.label.replace(/\s*\d{1,2}\s*@\s*$/, '')); }
          var unit = it.amounts[0].value;
          item.basePrice = it.amounts.length > 1 ? amt : round2(unit * item.qty);
          item.unitKnown = true;
        } else if (it.amounts.length > 1 && item.qty > 1 && near(it.amounts[0].value * item.qty, amt)) {
          item.unitKnown = true; // "3 Beer  7.00  21.00"
        }

        items.push(item);
        lastItem = item;
      }

      // ── Pass 3b: totals section ───────────────────────────────────────────
      var subtotal = null, taxTotal = null;
      var taxes = [], tips = [], totals = [], fees = [], discounts = [];
      var tipPct = null;
      var seenTotal = false;

      for (var b = summaryStart; b < entries.length; b++) {
        var se = entries[b];
        var L = se.label;
        if (!se.amounts.length) {
          if (se.pct != null && TIP_RE.test(L) && tipPct == null) tipPct = se.pct;
          continue;
        }
        var v = se.amounts[se.amounts.length - 1].value;

        if (/suggest/i.test(L)) { ignore(se, 'suggested tip'); continue; }
        if (SUBTOTAL_RE.test(L)) {
          if (subtotal == null) subtotal = v; else ignore(se, 'second subtotal');
          continue;
        }
        if (TAX_RE.test(L) && !/\bincl/i.test(L)) {
          if (/total/i.test(L)) taxTotal = v; else taxes.push({ label: L, amount: v });
          continue;
        }
        if (TIP_RE.test(L)) { tips.push({ label: L, amount: v }); continue; }
        if (TOTAL_RE.test(L)) { totals.push({ label: L, amount: v }); seenTotal = true; continue; }
        if (DISCOUNT_RE.test(L) || v < 0) { discounts.push({ label: L, amount: Math.abs(v) }); continue; }
        if (!hasLetters(L)) { ignore(se, 'no label'); continue; }
        // A percentage whose amount matches the subtotal is almost always tax
        // (e.g. "New York, New York (10003) (8.875%)  $4.33").
        if (se.pct != null && subtotal != null && near(subtotal * se.pct / 100, v, 0.02) && !FEE_RE.test(L)) {
          taxes.push({ label: L, amount: v });
          continue;
        }
        if (FEE_RE.test(L) && !seenTotal) { fees.push({ label: L, amount: v }); continue; }
        if (NOISE_RE.test(L) || seenTotal) { ignore(se, 'after the total / payment info'); continue; }
        fees.push({ label: L, amount: v });
      }

      // ── Inference ─────────────────────────────────────────────────────────
      var inferred = {};
      function itemTotal(item) {
        var t = item.basePrice;
        for (var k = 0; k < item.mods.length; k++) if (item.mods[k].counted) t += item.mods[k].price;
        return round2(t);
      }
      function itemsSum() {
        var t = 0;
        for (var k = 0; k < items.length; k++) t += itemTotal(items[k]);
        return round2(t);
      }

      var tax = taxTotal != null ? taxTotal : sum(taxes, 'amount');
      var feeSum = sum(fees, 'amount');
      var discSum = sum(discounts, 'amount');

      if (subtotal == null && items.length) { subtotal = itemsSum(); inferred.subtotal = true; }

      var tip = 0;
      var total = null;
      var base = round2((subtotal || 0) + tax + feeSum - discSum);

      if (totals.length) {
        // Prefer a total that matches the breakdown with one of the tip candidates
        var tipOptions = tips.length ? tips.map(function (t) { return t.amount; }) : [0];
        outer:
        for (var ti = totals.length - 1; ti >= 0; ti--) {
          for (var tp = 0; tp < tipOptions.length; tp++) {
            if (near(base + tipOptions[tp], totals[ti].amount)) {
              total = totals[ti].amount; tip = tipOptions[tp];
              break outer;
            }
          }
        }
        if (total == null) {
          total = Math.max.apply(null, totals.map(function (t) { return t.amount; }));
          tip = tips.length ? tips[0].amount : 0;
        }
      } else if (tips.length) {
        tip = tips[0].amount;
      }

      if (!tips.length && tipPct != null && subtotal) {
        tip = round2(subtotal * tipPct / 100);
        inferred.tip = true;
        notes.push('Tip worked out as ' + tipPct + '% of the subtotal.');
      }
      if (total == null && subtotal) {
        total = round2(base + tip);
        inferred.total = true;
      } else if (total != null && !tips.length && tipPct == null) {
        var gap = round2(total - base);
        if (gap > 0.009) {
          tip = gap;
          inferred.tip = true;
          notes.push('No tip line found; the ' + '$' + gap.toFixed(2) + ' gap between the total and the rest is treated as tip.');
        }
      }

      // ── Reconcile items against the subtotal ──────────────────────────────
      // Each "toggle" is an alternative reading of one line; try the smallest
      // set of toggles that makes the items add up to the subtotal.
      var reconciled = null;
      if (items.length && subtotal != null && !inferred.subtotal && !near(itemsSum(), subtotal)) {
        var toggles = [];
        items.forEach(function (item) {
          if (item.qty > 1 && !item.unitKnown) {
            toggles.push({
              delta: round2(item.basePrice * (item.qty - 1)),
              apply: function () { item.basePrice = round2(item.basePrice * item.qty); item.unitKnown = true; },
              note: 'Read "' + item.name + '" as ' + item.qty + ' × $' + (item.basePrice).toFixed(2) + ' each.'
            });
          }
          item.mods.forEach(function (mod) {
            if (mod.price > 0) {
              toggles.push({
                delta: -mod.price,
                apply: function () { mod.counted = false; },
                note: 'Treated "' + mod.name + '" as already included in "' + item.name + '".'
              });
            }
          });
          if ((total != null && near(item.basePrice, total)) || near(item.basePrice, subtotal)) {
            toggles.push({
              delta: -itemTotal(item),
              apply: function () { item.dropped = true; },
              note: 'Dropped "' + item.name + '" because it repeats a total.'
            });
          }
        });
        ignored.forEach(function (ig) {
          if (ig.amount > 0 && hasLetters(ig.label)) {
            toggles.push({
              delta: ig.amount,
              apply: function () {
                ig.promoted = true;
                items.push({ name: ig.label, qty: 1, basePrice: ig.amount, unitKnown: false, mods: [], raw: ig.text });
              },
              note: 'Counted "' + ig.label + '" as an item.'
            });
          }
        });
        toggles = toggles.slice(0, 14);
        var need = round2(subtotal - itemsSum());
        var best = null;
        for (var mask = 1; mask < (1 << toggles.length); mask++) {
          var d = 0, count = 0;
          for (var t = 0; t < toggles.length; t++) if (mask & (1 << t)) { d += toggles[t].delta; count++; }
          if (near(d, need) && (!best || count < best.count)) best = { mask: mask, count: count };
        }
        if (best) {
          reconciled = [];
          for (var u = 0; u < toggles.length; u++) {
            if (best.mask & (1 << u)) { toggles[u].apply(); reconciled.push(toggles[u].note); }
          }
          items = items.filter(function (x) { return !x.dropped; });
          ignored = ignored.filter(function (x) { return !x.promoted; });
          notes = notes.concat(reconciled);
        }
      }

      var outItems = items.map(function (item) {
        return {
          name: item.name,
          qty: item.qty,
          price: itemTotal(item),
          mods: item.mods.map(function (m) { return { name: m.name, price: m.price, counted: m.counted }; })
        };
      });

      var finalItemsSum = round2(outItems.reduce(function (acc, x) { return acc + x.price; }, 0));
      var other = round2(feeSum - discSum);
      var checks = [];
      if (outItems.length && subtotal != null) {
        checks.push({
          ok: near(finalItemsSum, subtotal),
          text: inferred.subtotal
            ? 'No subtotal found; using the items sum $' + finalItemsSum.toFixed(2) + '.'
            : 'Items add up to $' + finalItemsSum.toFixed(2) + (near(finalItemsSum, subtotal) ? ' = subtotal.' : ', subtotal says $' + subtotal.toFixed(2) + '.')
        });
      }
      if (total != null && subtotal != null) {
        var expect = round2(subtotal + tax + tip + other);
        checks.push({
          ok: near(expect, total),
          text: 'Subtotal + tax + tip' + (other ? ' + other' : '') + ' = $' + expect.toFixed(2) +
            (near(expect, total) ? ' = total.' : ', total says $' + total.toFixed(2) + '.')
        });
      }

      return {
        date: findDate(lines),
        items: outItems,
        subtotal: subtotal,
        tax: round2(tax),
        tip: round2(tip),
        fees: fees,
        discounts: discounts,
        other: other,
        total: total,
        ignored: ignored.map(function (x) { return { text: x.text, label: x.label, amount: x.amount, reason: x.reason }; }),
        notes: notes,
        checks: checks,
        inferred: inferred
      };
    }

    // Largest-remainder rounding: amounts rounded to cents that sum exactly to target.
    function distributeCents(amounts, target) {
      if (!amounts.length) return [];
      var scaled = amounts.map(function (a) { return a * 100; });
      var floored = scaled.map(function (x) { return Math.floor(x + 1e-9); });
      var remainder = Math.round(target * 100) - floored.reduce(function (p, c) { return p + c; }, 0);
      var order = scaled.map(function (x, i) { return { i: i, f: x - floored[i] }; })
        .sort(function (p, q) { return q.f - p.f; });
      for (var r = 0; r < remainder; r++) floored[order[r % order.length].i] += 1;
      return floored.map(function (c) { return c / 100; });
    }

    return { parse: parse, findAmounts: findAmounts, distributeCents: distributeCents };
  })();

  if (typeof module !== 'undefined' && module.exports) module.exports = Parser;
  if (typeof document === 'undefined') return;

  // ═══════════════════════════════════════════════════════════════════════════
  //  UI
  // ═══════════════════════════════════════════════════════════════════════════

  var PERSON_COLORS = ['#4a8bd4', '#d95f5f', '#4fa86a', '#d98930', '#8b5ac8', '#3abcbc', '#d45f8b', '#7a9a30'];

  var SAMPLE = [
    'Corner Bistro',
    'Table 4   Guests: 3',
    '',
    '2 Margherita Pizza      $28.00',
    '1 Caesar Salad          $11.50',
    '   + add chicken          $4.00',
    '3 Lemonade @ $3.50     $10.50',
    '1 Tiramisu              $8.00',
    '',
    'Subtotal               $62.00',
    'Sales Tax 8.875%        $5.50',
    'Tip                    $12.40',
    'Total                  $79.90',
    '',
    'Visa ****1234          $79.90'
  ].join('\n');

  var state = {
    items: [],         // {id, name, qty, price, mods, assignedTo: [pid]}
    people: [],        // {id, name, color}
    ignored: [],
    notes: [],
    nextItemId: 0,
    nextPersonId: 0,
    totalManual: false,
    touchSelected: null
  };

  var el = {};

  function $(id) { return document.getElementById(id); }
  function num(input) {
    var n = parseFloat(input.value);
    return isNaN(n) ? 0 : n;
  }
  function money(n) {
    var neg = n < 0;
    return (neg ? '−$' : '$') + Math.abs(n).toFixed(2);
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function setNotice(node, type, msg) {
    node.className = 'notice' + (type ? ' ' + type : '');
    node.textContent = msg || '';
  }
  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmtInput(n) { return n == null || n === '' ? '' : (+n).toFixed(2); }

  // ── State helpers ─────────────────────────────────────────────────────────

  function addItem(data) {
    var item = {
      id: ++state.nextItemId,
      name: data.name || '',
      qty: data.qty || 1,
      price: data.price != null ? data.price : '',
      mods: data.mods || [],
      assignedTo: data.assignedTo ? data.assignedTo.slice() : []
    };
    state.items.push(item);
    return item;
  }

  function addPerson(name) {
    var p = { id: ++state.nextPersonId, name: name, color: PERSON_COLORS[(state.nextPersonId - 1) % PERSON_COLORS.length] };
    state.people.push(p);
    return p;
  }

  function priceOf(item) {
    var n = parseFloat(item.price);
    return isNaN(n) ? 0 : n;
  }

  function itemsSum() {
    return round2(state.items.reduce(function (s, it) { return s + priceOf(it); }, 0));
  }

  // ── Loading a receipt ─────────────────────────────────────────────────────

  function loadParsed(parsed) {
    state.items = [];
    state.ignored = parsed.ignored.slice();
    state.notes = parsed.notes.slice();
    parsed.items.forEach(function (it) { addItem(it); });
    if (!state.items.length) addItem({});

    el.subtotal.value = fmtInput(parsed.subtotal);
    el.tax.value = parsed.tax ? fmtInput(parsed.tax) : '';
    el.tip.value = parsed.tip ? fmtInput(parsed.tip) : '';
    el.other.value = parsed.other ? fmtInput(parsed.other) : '';
    el.total.value = fmtInput(parsed.total);
    var comp = round2((parsed.subtotal || 0) + parsed.tax + parsed.tip + parsed.other);
    state.totalManual = parsed.total != null && Math.abs(comp - parsed.total) > 0.005;

    el.receiptDate.textContent = parsed.date ? 'Receipt date: ' + parsed.date : '';
    ensurePeople();
    showReview();
  }

  function startManual() {
    state.items = [];
    state.ignored = [];
    state.notes = [];
    addItem({}); addItem({});
    ['subtotal', 'tax', 'tip', 'other', 'total'].forEach(function (k) { el[k].value = ''; });
    state.totalManual = false;
    el.receiptDate.textContent = '';
    ensurePeople();
    showReview();
  }

  function ensurePeople() {
    if (!state.people.length) { addPerson('Person 1'); addPerson('Person 2'); }
    state.items.forEach(function (it) {
      it.assignedTo = it.assignedTo.filter(function (pid) { return getPerson(pid); });
    });
  }

  function showReview() {
    el.reviewSection.hidden = false;
    renderItemRows();
    renderIgnored();
    refresh();
    el.reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Review: item rows ─────────────────────────────────────────────────────

  function renderItemRows() {
    el.itemRows.innerHTML = '';
    state.items.forEach(function (item) { el.itemRows.appendChild(makeItemRow(item)); });
  }

  function makeItemRow(item) {
    var row = make('div', 'item-row');

    var nameWrap = make('div', 'item-name-wrap');
    var name = make('input', 'item-name');
    name.type = 'text';
    name.placeholder = 'Item';
    name.setAttribute('aria-label', 'Item name');
    name.value = item.name;
    name.addEventListener('input', function () { item.name = name.value; refresh(); });
    nameWrap.appendChild(name);
    if (item.mods && item.mods.length) {
      var mods = make('div', 'item-mods');
      mods.textContent = item.mods.map(function (m) {
        var s = m.name;
        if (m.price) s += ' ' + money(m.price) + (m.counted ? '' : ' (included)');
        return s;
      }).join(' · ');
      nameWrap.appendChild(mods);
    }

    var qty = make('input', 'item-qty');
    qty.type = 'number';
    qty.min = '1';
    qty.step = '1';
    qty.inputMode = 'numeric';
    qty.setAttribute('aria-label', 'Quantity');
    qty.title = 'Quantity';
    qty.value = item.qty;
    qty.addEventListener('input', function () {
      item.qty = Math.max(1, parseInt(qty.value, 10) || 1);
      splitBtn.hidden = item.qty < 2;
      refresh();
    });

    var price = make('input', 'item-price');
    price.type = 'number';
    price.step = '0.01';
    price.inputMode = 'decimal';
    price.placeholder = '0.00';
    price.setAttribute('aria-label', 'Line price');
    price.value = item.price === '' ? '' : fmtInput(item.price);
    price.addEventListener('input', function () { item.price = price.value; refresh(); });

    var splitBtn = make('button', 'row-btn split', 'Split');
    splitBtn.type = 'button';
    splitBtn.title = 'Split into one line per unit so different people can take each';
    splitBtn.hidden = item.qty < 2;
    splitBtn.addEventListener('click', function () {
      var n = item.qty;
      var parts = Parser.distributeCents(new Array(n).fill(priceOf(item) / n), priceOf(item));
      var idx = state.items.indexOf(item);
      var fresh = parts.map(function (p) {
        return {
          id: ++state.nextItemId, name: item.name, qty: 1, price: p, mods: [],
          assignedTo: item.assignedTo.slice()
        };
      });
      state.items.splice.apply(state.items, [idx, 1].concat(fresh));
      renderItemRows();
      refresh();
    });

    var rm = make('button', 'row-btn remove');
    rm.type = 'button';
    rm.setAttribute('aria-label', 'Remove item');
    rm.title = 'Remove item';
    rm.textContent = '×';
    rm.addEventListener('click', function () {
      state.items.splice(state.items.indexOf(item), 1);
      if (!state.items.length) addItem({});
      renderItemRows();
      refresh();
    });

    row.appendChild(nameWrap);
    row.appendChild(qty);
    row.appendChild(price);
    row.appendChild(splitBtn);
    row.appendChild(rm);
    return row;
  }

  function renderIgnored() {
    el.ignoredList.innerHTML = '';
    el.ignoredBox.hidden = !state.ignored.length;
    el.ignoredCount.textContent = state.ignored.length;
    state.ignored.forEach(function (ig, idx) {
      var li = make('li');
      var txt = make('span', 'ign-text', ig.text);
      var why = make('span', 'ign-why', ig.reason);
      var btn = make('button', 'row-btn', '+ Add as item');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        addItem({ name: ig.label || 'Item', price: Math.abs(ig.amount) });
        state.ignored.splice(idx, 1);
        renderItemRows();
        renderIgnored();
        refresh();
      });
      li.appendChild(txt);
      li.appendChild(why);
      li.appendChild(btn);
      el.ignoredList.appendChild(li);
    });
  }

  // ── Review: totals + checks ───────────────────────────────────────────────

  function components() {
    return round2(num(el.subtotal) + num(el.tax) + num(el.tip) + num(el.other));
  }

  function onComponentInput() {
    if (!state.totalManual) {
      var c = components();
      el.total.value = c ? c.toFixed(2) : '';
    }
    refresh();
  }

  function onTotalInput() {
    state.totalManual = el.total.value !== '' && Math.abs(num(el.total) - components()) > 0.005;
    refresh();
  }

  function renderChecks() {
    el.checks.innerHTML = '';
    var sumItems = itemsSum();
    var subtotal = num(el.subtotal);
    var total = num(el.total);
    var lines = [];

    if (subtotal > 0) {
      var ok1 = Math.abs(sumItems - subtotal) < 0.011;
      lines.push({ ok: ok1, text: ok1
        ? 'Items add up to the subtotal (' + money(sumItems) + ').'
        : 'Items add up to ' + money(sumItems) + ' but the subtotal is ' + money(subtotal) + '. Shares still use each item\'s part of the items sum.' });
    }
    if (total > 0 && subtotal > 0) {
      var comp = components();
      var ok2 = Math.abs(comp - total) < 0.011;
      lines.push({ ok: ok2, text: ok2
        ? 'Subtotal + tax + tip' + (num(el.other) ? ' + other' : '') + ' = total (' + money(total) + ').'
        : 'Subtotal + tax + tip + other = ' + money(comp) + ', but the total is ' + money(total) + '. The total is what gets split.' });
    }
    state.notes.forEach(function (n) { lines.push({ ok: null, text: n }); });

    lines.forEach(function (c) {
      var li = make('li', c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'note');
      li.textContent = c.text;
      el.checks.appendChild(li);
    });
    el.itemsSum.textContent = money(sumItems);
  }

  // ── Split ─────────────────────────────────────────────────────────────────

  function getPerson(id) {
    for (var i = 0; i < state.people.length; i++) if (state.people[i].id === id) return state.people[i];
    return null;
  }
  function getItem(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }

  function computeSplit() {
    var base = itemsSum();
    var total = num(el.total);
    if (base <= 0 || total <= 0) return null;
    var raw = state.people.map(function (p) {
      return state.items.reduce(function (s, it) {
        return it.assignedTo.indexOf(p.id) !== -1 ? s + priceOf(it) / it.assignedTo.length : s;
      }, 0);
    });
    var assigned = raw.reduce(function (a, b) { return a + b; }, 0);
    var unassigned = Math.max(0, base - assigned);
    var shares = Parser.distributeCents(raw.concat([unassigned]).map(function (r) { return r / base * total; }), total);
    var tax = num(el.tax), tip = num(el.tip), other = num(el.other);
    var people = state.people.map(function (p, i) {
      var f = raw[i] / base;
      return {
        person: p,
        food: round2(raw[i]),
        tax: round2(f * tax),
        tip: round2(f * tip),
        other: round2(f * other),
        total: shares[i]
      };
    });
    return { base: base, total: total, people: people, unassigned: shares[shares.length - 1], unassignedFood: round2(unassigned) };
  }

  function refresh() {
    renderChecks();
    renderPool();
    renderLanes();
    renderSplitSummary();
    renderPerItem();
  }

  function itemLabel(item) {
    var n = item.name.trim() || 'Item';
    return item.qty > 1 ? item.qty + '× ' + n : n;
  }

  function renderPool() {
    el.pool.innerHTML = '';
    var any = false;
    state.items.forEach(function (item) {
      if (!priceOf(item) && !item.name.trim()) return;
      any = true;
      var card = make('div', 'pool-card' + (item.assignedTo.length ? ' assigned' : ''));
      card.draggable = true;
      card.dataset.itemId = item.id;
      if (state.touchSelected === item.id) card.classList.add('touch-selected');
      var nm = make('span', 'card-name', itemLabel(item));
      nm.title = itemLabel(item);
      card.appendChild(nm);
      card.appendChild(make('span', 'card-price', money(priceOf(item))));
      var dots = make('div', 'card-badges');
      item.assignedTo.forEach(function (pid) {
        var p = getPerson(pid);
        if (!p) return;
        var d = make('span', 'badge-dot');
        d.style.background = p.color;
        d.title = p.name;
        dots.appendChild(d);
      });
      card.appendChild(dots);

      card.addEventListener('dragstart', function (e) {
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'pool:' + item.id);
      });
      card.addEventListener('dragend', function () { card.classList.remove('dragging'); });
      card.addEventListener('click', function (e) {
        e.stopPropagation();
        state.touchSelected = state.touchSelected === item.id ? null : item.id;
        renderPool();
      });
      el.pool.appendChild(card);
    });
    if (!any) el.pool.appendChild(make('p', 'muted', 'Add items above to start assigning.'));
  }

  function renderLanes() {
    el.lanes.innerHTML = '';
    var split = computeSplit();
    state.people.forEach(function (p, idx) {
      el.lanes.appendChild(makeLane(p, split ? split.people[idx] : null));
    });
  }

  function makeLane(person, totals) {
    var lane = make('div', 'lane');
    lane.style.setProperty('--lane-color', person.color);

    var head = make('div', 'lane-header');
    head.appendChild(make('span', 'lane-color-dot'));
    var name = make('span', 'lane-name', person.name);
    name.contentEditable = 'true';
    name.spellcheck = false;
    name.addEventListener('blur', function () {
      var v = name.textContent.trim();
      if (v) { person.name = v; renderPool(); } else name.textContent = person.name;
    });
    name.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
    var del = make('button', 'lane-del', '×');
    del.type = 'button';
    del.title = 'Remove ' + person.name;
    del.addEventListener('click', function () {
      state.people = state.people.filter(function (p) { return p.id !== person.id; });
      state.items.forEach(function (it) {
        it.assignedTo = it.assignedTo.filter(function (pid) { return pid !== person.id; });
      });
      refresh();
    });
    head.appendChild(name);
    head.appendChild(del);

    var body = make('div', 'lane-body');
    var mine = state.items.filter(function (it) { return it.assignedTo.indexOf(person.id) !== -1; });
    if (!mine.length) body.appendChild(make('div', 'lane-empty', 'Drop or tap items here'));
    mine.forEach(function (item) {
      var card = make('div', 'lane-card');
      card.draggable = true;
      var main = make('div', 'card-main');
      var nm = make('span', 'card-name', itemLabel(item));
      nm.title = itemLabel(item);
      main.appendChild(nm);
      main.appendChild(make('span', 'card-price', money(priceOf(item))));
      card.appendChild(main);
      if (item.assignedTo.length > 1) {
        card.appendChild(make('div', 'card-share', '÷' + item.assignedTo.length + ' · ' + money(priceOf(item) / item.assignedTo.length)));
      }
      var rm = make('button', 'card-rm', '×');
      rm.type = 'button';
      rm.title = 'Remove from ' + person.name;
      rm.addEventListener('click', function (e) {
        e.stopPropagation();
        item.assignedTo = item.assignedTo.filter(function (pid) { return pid !== person.id; });
        refresh();
      });
      card.appendChild(rm);
      card.addEventListener('dragstart', function (e) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'lane:' + item.id + ':' + person.id);
      });
      body.appendChild(card);
    });

    body.addEventListener('dragover', function (e) {
      e.preventDefault();
      lane.classList.add('drag-over');
    });
    body.addEventListener('dragleave', function (e) {
      if (!body.contains(e.relatedTarget)) lane.classList.remove('drag-over');
    });
    body.addEventListener('drop', function (e) {
      e.preventDefault();
      lane.classList.remove('drag-over');
      var parts = (e.dataTransfer.getData('text/plain') || '').split(':');
      var item = getItem(parseInt(parts[1], 10));
      if (!item) return;
      if (parts[0] === 'lane') {
        var from = parseInt(parts[2], 10);
        if (from === person.id) return;
        item.assignedTo = item.assignedTo.filter(function (pid) { return pid !== from; });
      }
      if (item.assignedTo.indexOf(person.id) === -1) item.assignedTo.push(person.id);
      refresh();
    });
    body.addEventListener('click', function () {
      if (state.touchSelected == null) return;
      var item = getItem(state.touchSelected);
      state.touchSelected = null;
      if (item && item.assignedTo.indexOf(person.id) === -1) item.assignedTo.push(person.id);
      refresh();
    });

    var foot = make('div', 'lane-footer');
    function frow(label, val, cls) {
      var r = make('div', 'lane-frow' + (cls ? ' ' + cls : ''));
      r.appendChild(make('span', null, label));
      r.appendChild(make('span', 'lane-fval', money(val)));
      foot.appendChild(r);
    }
    var t = totals || { food: 0, tax: 0, tip: 0, other: 0, total: 0 };
    frow('Items', t.food);
    if (num(el.tax)) frow('Tax', t.tax);
    if (num(el.tip)) frow('Tip', t.tip);
    if (num(el.other)) frow('Other', t.other);
    frow('Owes', t.total, 'total');

    lane.appendChild(head);
    lane.appendChild(body);
    lane.appendChild(foot);
    return lane;
  }

  function renderSplitSummary() {
    var split = computeSplit();
    el.splitSummary.innerHTML = '';
    if (!split) {
      setNotice(el.splitNotice, 'info', 'Enter item prices and a total to see each person\'s share.');
      return;
    }
    setNotice(el.splitNotice, '', '');
    var ul = make('ul', 'owe-list');
    split.people.forEach(function (row) {
      var li = make('li');
      var dot = make('span', 'badge-dot');
      dot.style.background = row.person.color;
      li.appendChild(dot);
      li.appendChild(make('span', 'owe-name', row.person.name));
      li.appendChild(make('strong', 'owe-amt', money(row.total)));
      ul.appendChild(li);
    });
    if (split.unassigned > 0.004) {
      var li = make('li', 'unassigned');
      li.appendChild(make('span', 'owe-name', 'Not assigned yet'));
      li.appendChild(make('strong', 'owe-amt', money(split.unassigned)));
      ul.appendChild(li);
    }
    var tot = make('li', 'owe-total');
    tot.appendChild(make('span', 'owe-name', 'Bill total'));
    tot.appendChild(make('strong', 'owe-amt', money(split.total)));
    ul.appendChild(tot);
    el.splitSummary.appendChild(ul);
  }

  function renderPerItem() {
    el.perItemBody.innerHTML = '';
    var base = itemsSum();
    var total = num(el.total);
    if (base <= 0 || total <= 0) { el.perItemBox.hidden = true; return; }
    el.perItemBox.hidden = false;
    var rows = state.items.filter(function (it) { return priceOf(it) !== 0; });
    var shares = Parser.distributeCents(rows.map(function (it) { return priceOf(it) / base * total; }), total);
    rows.forEach(function (it, i) {
      var tr = make('tr');
      tr.appendChild(make('td', null, itemLabel(it)));
      tr.appendChild(make('td', null, money(priceOf(it))));
      tr.appendChild(make('td', null, (priceOf(it) / base * 100).toFixed(1) + '%'));
      tr.appendChild(make('td', 'request', money(shares[i])));
      el.perItemBody.appendChild(tr);
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function runParse() {
    var text = el.paste.value;
    if (!text.trim()) { setNotice(el.parseNotice, 'error', 'Paste some receipt text first.'); return; }
    var parsed = Parser.parse(text);
    if (!parsed.items.length) {
      setNotice(el.parseNotice, 'warn', 'No items with prices were found. You can add them by hand below.');
    } else {
      var bad = parsed.checks.filter(function (c) { return !c.ok; }).length;
      setNotice(el.parseNotice, bad ? 'warn' : 'ok',
        'Found ' + parsed.items.length + ' item' + (parsed.items.length === 1 ? '' : 's') +
        (bad ? '. Some numbers don\'t add up; check them below.' : ' and everything adds up.'));
    }
    loadParsed(parsed);
  }

  function promptAddPerson() {
    if ($('addPersonInput')) { $('addPersonInput').querySelector('input').focus(); return; }
    var wrap = make('span', 'add-person-inline');
    wrap.id = 'addPersonInput';
    var inp = make('input');
    inp.type = 'text';
    inp.placeholder = 'Name…';
    inp.maxLength = 40;
    var ok = make('button', null, 'Add');
    ok.type = 'button';
    function submit() {
      var v = inp.value.trim();
      wrap.remove();
      if (v) { addPerson(v); refresh(); }
    }
    ok.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') wrap.remove();
    });
    wrap.appendChild(inp);
    wrap.appendChild(ok);
    el.addPersonBtn.insertAdjacentElement('afterend', wrap);
    inp.focus();
  }

  function init() {
    ['paste', 'parseBtn', 'manualBtn', 'sampleBtn', 'parseNotice', 'reviewSection', 'receiptDate',
      'checks', 'itemRows', 'addItemBtn', 'itemsSum', 'ignoredBox', 'ignoredCount', 'ignoredList',
      'subtotal', 'tax', 'tip', 'other', 'total', 'useItemsSumBtn',
      'addPersonBtn', 'shareRestBtn', 'pool', 'lanes', 'splitNotice', 'splitSummary',
      'perItemBox', 'perItemBody'].forEach(function (id) { el[id] = $(id); });

    el.parseBtn.addEventListener('click', runParse);
    el.paste.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runParse();
    });
    el.manualBtn.addEventListener('click', startManual);
    el.sampleBtn.addEventListener('click', function () { el.paste.value = SAMPLE; runParse(); });

    el.addItemBtn.addEventListener('click', function () {
      addItem({});
      renderItemRows();
      refresh();
      var names = el.itemRows.querySelectorAll('.item-name');
      names[names.length - 1].focus();
    });
    el.useItemsSumBtn.addEventListener('click', function () {
      el.subtotal.value = itemsSum().toFixed(2);
      onComponentInput();
    });
    ['subtotal', 'tax', 'tip', 'other'].forEach(function (k) { el[k].addEventListener('input', onComponentInput); });
    el.total.addEventListener('input', onTotalInput);

    el.addPersonBtn.addEventListener('click', promptAddPerson);
    el.shareRestBtn.addEventListener('click', function () {
      if (!state.people.length) return;
      var ids = state.people.map(function (p) { return p.id; });
      state.items.forEach(function (it) { if (!it.assignedTo.length) it.assignedTo = ids.slice(); });
      refresh();
    });

    document.addEventListener('click', function (e) {
      if (state.touchSelected != null && !el.pool.contains(e.target) && !el.lanes.contains(e.target)) {
        state.touchSelected = null;
        renderPool();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
