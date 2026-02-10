(function () {
  'use strict';

  var VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var CARDS_PER_VALUE = 4;
  var DECK_SIZE = 52;

  var state = {
    drawn: {},      // { 'A': 2, '7': 1, ... }
    drawnOrder: []  // ['A','A','7'] for undo
  };

  function getDrawnCount(value) {
    return state.drawn[value] || 0;
  }

  function getTotalDrawn() {
    return state.drawnOrder.length;
  }

  function getCardsLeft() {
    return DECK_SIZE - getTotalDrawn();
  }

  function canDraw(value) {
    return getDrawnCount(value) < CARDS_PER_VALUE;
  }

  function markDrawn(value) {
    if (!canDraw(value)) return false;
    state.drawn[value] = (state.drawn[value] || 0) + 1;
    state.drawnOrder.push(value);
    return true;
  }

  function undoLast() {
    if (state.drawnOrder.length === 0) return false;
    var value = state.drawnOrder.pop();
    state.drawn[value] = (state.drawn[value] || 1) - 1;
    if (state.drawn[value] <= 0) delete state.drawn[value];
    return true;
  }

  function probabilityNextCard(value) {
    var left = getCardsLeft();
    if (left <= 0) return 0;
    var remaining = CARDS_PER_VALUE - getDrawnCount(value);
    return remaining / left;
  }

  function clearNotice() {
    var el = document.getElementById('notice');
    if (el) {
      el.textContent = '';
      el.className = 'notice';
    }
  }

  function showNotice(msg, isError) {
    var el = document.getElementById('notice');
    if (!el) return;
    el.textContent = msg;
    el.className = 'notice ' + (isError ? 'error' : 'info');
  }

  function renderCardRow() {
    var row = document.getElementById('cardRow');
    if (!row) return;
    row.innerHTML = '';
    VALUES.forEach(function (value) {
      var count = getDrawnCount(value);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-btn' + (count > 0 ? ' drawn' : '') + (count >= CARDS_PER_VALUE ? ' full' : '');
      btn.setAttribute('data-value', value);
      btn.innerHTML = value + (count > 0 ? ' <span class="count">' + count + '/' + CARDS_PER_VALUE + '</span>' : '');
      btn.disabled = count >= CARDS_PER_VALUE;
      btn.addEventListener('click', function () {
        if (!canDraw(value)) {
          showNotice('Maximum 4 of each card value.', true);
          return;
        }
        clearNotice();
        markDrawn(value);
        render();
      });
      row.appendChild(btn);
    });
  }

  function renderUndo() {
    var btn = document.getElementById('undoBtn');
    if (btn) btn.disabled = state.drawnOrder.length === 0;
  }

  function probToStyle(prob, cardsLeft) {
    var maxProb = cardsLeft > 0 ? CARDS_PER_VALUE / cardsLeft : 0;
    var ratio = maxProb > 0 ? prob / maxProb : 0;
    var hue = 120 * ratio;
    return 'background: hsl(' + hue + ', 70%, 92%); color: hsl(' + hue + ', 50%, 22%);';
  }

  function renderTable() {
    var cardsLeftEl = document.getElementById('cardsLeft');
    var tbody = document.getElementById('probBody');
    if (cardsLeftEl) cardsLeftEl.textContent = getCardsLeft();
    if (!tbody) return;

    var left = getCardsLeft();
    tbody.innerHTML = '';
    VALUES.forEach(function (value) {
      var remaining = CARDS_PER_VALUE - getDrawnCount(value);
      var prob = left > 0 ? probabilityNextCard(value) : 0;
      var style = probToStyle(prob, left);
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' + value + '</strong></td>' +
        '<td>' + remaining + '</td>' +
        '<td class="prob-pct" style="' + style + '">' + (prob * 100).toFixed(2) + '%</td>';
      tbody.appendChild(tr);
    });
  }

  function render() {
    renderCardRow();
    renderUndo();
    renderTable();
  }

  function init() {
    render();
    var undoBtn = document.getElementById('undoBtn');
    if (undoBtn) {
      undoBtn.addEventListener('click', function () {
        if (state.drawnOrder.length === 0) return;
        clearNotice();
        undoLast();
        render();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
