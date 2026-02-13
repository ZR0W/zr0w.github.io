(function () {
  'use strict';

  function randomHex() {
    return '#' + Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0');
  }

  function luminance(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function textColor(hex) {
    return luminance(hex) > 0.5 ? '#000' : '#fff';
  }

  var state = {
    colors: [],
    kept: {}
  };

  function getCount() {
    var input = document.getElementById('colorCount');
    if (!input) return 5;
    var n = parseInt(input.value, 10);
    if (isNaN(n) || n < 2) return 2;
    if (n > 20) return 20;
    return n;
  }

  function ensureColors(count) {
    while (state.colors.length < count) {
      state.colors.push(randomHex());
    }
    if (state.colors.length > count) {
      state.colors = state.colors.slice(0, count);
      for (var i = count; i < 30; i++) {
        delete state.kept[i];
      }
    }
  }

  function regenerateIndex(i) {
    if (state.kept[i]) return;
    state.colors[i] = randomHex();
  }

  function generate() {
    var count = getCount();
    ensureColors(count);
    for (var i = 0; i < state.colors.length; i++) {
      if (!state.kept[i]) {
        state.colors[i] = randomHex();
      }
    }
    render();
  }

  function toggleKeep(i) {
    state.kept[i] = !state.kept[i];
    render();
  }

  function setColor(i, hex) {
    state.colors[i] = hex;
    render();
  }

  function render() {
    var grid = document.getElementById('colorGrid');
    if (!grid) return;

    var count = getCount();
    ensureColors(count);

    grid.innerHTML = '';

    for (var i = 0; i < state.colors.length; i++) {
      (function (idx) {
        var hex = state.colors[idx];
        var square = document.createElement('div');
        square.className = 'color-square';

        var swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.background = hex;
        swatch.style.color = textColor(hex);
        swatch.textContent = hex.toUpperCase();
        swatch.title = 'Click to copy hex';

        swatch.addEventListener('click', function () {
          navigator.clipboard && navigator.clipboard.writeText(hex).then(function () {
            swatch.textContent = 'Copied!';
            setTimeout(function () { swatch.textContent = hex.toUpperCase(); }, 600);
          });
        });

        var actions = document.createElement('div');
        actions.className = 'color-actions';

        var hexSpan = document.createElement('span');
        hexSpan.className = 'color-hex';
        hexSpan.textContent = hex.toUpperCase();

        var keepBtn = document.createElement('button');
        keepBtn.type = 'button';
        keepBtn.className = 'keep' + (state.kept[idx] ? ' kept' : '');
        keepBtn.textContent = state.kept[idx] ? 'Kept' : 'Keep';
        keepBtn.addEventListener('click', function () {
          toggleKeep(idx);
        });

        var regenBtn = document.createElement('button');
        regenBtn.type = 'button';
        regenBtn.textContent = 'Re-gen';
        regenBtn.addEventListener('click', function () {
          regenerateIndex(idx);
          render();
        });

        var pickerWrap = document.createElement('div');
        pickerWrap.className = 'color-picker-wrap';
        var picker = document.createElement('input');
        picker.type = 'color';
        picker.value = hex;
        picker.title = 'Override color';
        picker.addEventListener('input', function () {
          setColor(idx, picker.value);
        });

        pickerWrap.appendChild(picker);
        actions.appendChild(hexSpan);
        actions.appendChild(keepBtn);
        actions.appendChild(regenBtn);
        actions.appendChild(pickerWrap);

        square.appendChild(swatch);
        square.appendChild(actions);
        grid.appendChild(square);
      })(i);
    }
  }

  function init() {
    var generateBtn = document.getElementById('generateBtn');
    var countInput = document.getElementById('colorCount');

    if (generateBtn) {
      generateBtn.addEventListener('click', generate);
    }
    if (countInput) {
      countInput.addEventListener('change', function () {
        var c = getCount();
        countInput.value = c;
        ensureColors(c);
        render();
      });
    }

    generate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
