(function () {
  'use strict';

  var CANVAS_SIZE = 512;
  var EXPORT_CELLS = 8;

  var state = {
    color: '#000000',
    brushSize: 5,
    configIndex: 0,
    guidesVisible: true,
    undoStack: [],
    redoStack: [],
    panX: 0,
    panY: 0,
    isDrawing: false,
    lastX: 0,
    lastY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panStartOffsetX: 0,
    panStartOffsetY: 0
  };

  var configLayouts = [
    [0, 1, 2, 3],
    [3, 2, 1, 0],
    [1, 0, 3, 2],
    [2, 3, 0, 1]
  ];

  var designCanvas, designCtx, guidesCanvas, guidesCtx, viewCanvas, viewCtx;
  var designWrap, viewWrap, designPanel, viewPanel;
  var colorInput, brushSizeInput, brushSizeValue, guidesCheckbox;
  var undoBtn, redoBtn, configSelect, generateBtn, backBtn, exportBtn;

  function getCanvasCoords(canvas, clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function drawGuides() {
    if (!guidesCtx) return;
    var w = guidesCanvas.width;
    var h = guidesCanvas.height;
    guidesCtx.clearRect(0, 0, w, h);
    if (!state.guidesVisible) return;
    guidesCtx.save();
    guidesCtx.strokeStyle = 'rgba(0,0,0,0.25)';
    guidesCtx.lineWidth = 1;
    guidesCtx.setLineDash([4, 4]);
    guidesCtx.beginPath();
    guidesCtx.moveTo(w / 2, 0);
    guidesCtx.lineTo(w / 2, h);
    guidesCtx.moveTo(0, h / 2);
    guidesCtx.lineTo(w, h / 2);
    guidesCtx.stroke();
    guidesCtx.restore();
  }

  function pushUndo() {
    try {
      var imageData = designCtx.getImageData(0, 0, designCanvas.width, designCanvas.height);
      state.undoStack.push(imageData);
      state.redoStack = [];
      undoBtn.disabled = state.undoStack.length === 0;
      redoBtn.disabled = true;
    } catch (e) {}
  }

  function undo() {
    if (state.undoStack.length === 0) return;
    var prev = state.undoStack.pop();
    state.redoStack.push(designCtx.getImageData(0, 0, designCanvas.width, designCanvas.height));
    designCtx.putImageData(prev, 0, 0);
    undoBtn.disabled = state.undoStack.length === 0;
    redoBtn.disabled = state.redoStack.length === 0;
  }

  function redo() {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(designCtx.getImageData(0, 0, designCanvas.width, designCanvas.height));
    var next = state.redoStack.pop();
    designCtx.putImageData(next, 0, 0);
    undoBtn.disabled = state.undoStack.length === 0;
    redoBtn.disabled = state.redoStack.length === 0;
  }

  function applyConfig(index) {
    var w = designCanvas.width;
    var h = designCanvas.height;
    var hw = w / 2;
    var hh = h / 2;
    var layout = configLayouts[index];
    var src = [
      designCtx.getImageData(0, 0, hw, hh),
      designCtx.getImageData(hw, 0, hw, hh),
      designCtx.getImageData(0, hh, hw, hh),
      designCtx.getImageData(hw, hh, hw, hh)
    ];
    var off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    var offCtx = off.getContext('2d');
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, w, h);
    var positions = [[0, 0], [hw, 0], [0, hh], [hw, hh]];
    for (var i = 0; i < 4; i++) {
      offCtx.putImageData(src[layout[i]], positions[i][0], positions[i][1]);
    }
    designCtx.fillStyle = '#ffffff';
    designCtx.fillRect(0, 0, w, h);
    designCtx.drawImage(off, 0, 0);
    state.configIndex = index;
  }

  function drawDesignStroke(x, y) {
    designCtx.lineTo(x, y);
    designCtx.stroke();
  }

  function onDesignPointerDown(e) {
    e.preventDefault();
    var coords = getCanvasCoords(designCanvas, e.clientX, e.clientY);
    state.isDrawing = true;
    state.lastX = coords.x;
    state.lastY = coords.y;
    designCanvas.setPointerCapture(e.pointerId);
    designCtx.strokeStyle = state.color;
    designCtx.lineWidth = state.brushSize;
    designCtx.lineCap = 'round';
    designCtx.lineJoin = 'round';
    designCtx.beginPath();
    designCtx.moveTo(coords.x, coords.y);
    drawDesignStroke(coords.x, coords.y);
  }

  function onDesignPointerMove(e) {
    if (!state.isDrawing) return;
    e.preventDefault();
    var coords = getCanvasCoords(designCanvas, e.clientX, e.clientY);
    drawDesignStroke(coords.x, coords.y);
    state.lastX = coords.x;
    state.lastY = coords.y;
  }

  function onDesignPointerUp(e) {
    if (!state.isDrawing) return;
    e.preventDefault();
    state.isDrawing = false;
    designCanvas.releasePointerCapture(e.pointerId);
    pushUndo();
  }

  function onDesignPointerCancel(e) {
    state.isDrawing = false;
  }

  function drawPatternView() {
    if (!viewCtx || !designCanvas) return;
    var cw = viewCanvas.width;
    var ch = viewCanvas.height;
    var cellW = designCanvas.width;
    var cellH = designCanvas.height;
    var ox = state.panX % cellW;
    var oy = state.panY % cellH;
    if (ox > 0) ox -= cellW;
    if (oy > 0) oy -= cellH;
    viewCtx.save();
    viewCtx.translate(ox, oy);
    var startCol = Math.floor(-ox / cellW);
    var startRow = Math.floor(-oy / cellH);
    var cols = Math.ceil(cw / cellW) + 2;
    var rows = Math.ceil(ch / cellH) + 2;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        viewCtx.drawImage(designCanvas, (startCol + c) * cellW, (startRow + r) * cellH, cellW, cellH);
      }
    }
    viewCtx.restore();
  }

  function onViewPointerDown(e) {
    e.preventDefault();
    state.isPanning = true;
    state.panStartX = e.clientX;
    state.panStartY = e.clientY;
    state.panStartOffsetX = state.panX;
    state.panStartOffsetY = state.panY;
    viewCanvas.setPointerCapture(e.pointerId);
  }

  function onViewPointerMove(e) {
    if (!state.isPanning) return;
    e.preventDefault();
    state.panX = state.panStartOffsetX + (e.clientX - state.panStartX);
    state.panY = state.panStartOffsetY + (e.clientY - state.panStartY);
    drawPatternView();
  }

  function onViewPointerUp(e) {
    if (!state.isPanning) return;
    state.isPanning = false;
    viewCanvas.releasePointerCapture(e.pointerId);
  }

  function onViewPointerCancel(e) {
    state.isPanning = false;
  }

  function resizeViewCanvas() {
    if (!viewCanvas || !viewWrap) return;
    var rect = viewWrap.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.floor(rect.width * dpr));
    var h = Math.max(1, Math.floor(rect.height * dpr));
    if (viewCanvas.width !== w || viewCanvas.height !== h) {
      viewCanvas.width = w;
      viewCanvas.height = h;
      viewCanvas.style.width = rect.width + 'px';
      viewCanvas.style.height = rect.height + 'px';
      drawPatternView();
    }
  }

  function showPatternView() {
    designPanel.style.display = 'none';
    viewPanel.classList.add('active');
    state.panX = 0;
    state.panY = 0;
    resizeViewCanvas();
    drawPatternView();
  }

  function showDesignView() {
    viewPanel.classList.remove('active');
    designPanel.style.display = 'block';
  }

  function exportPng() {
    var cellW = designCanvas.width;
    var cellH = designCanvas.height;
    var totalW = cellW * EXPORT_CELLS;
    var totalH = cellH * EXPORT_CELLS;
    var exportCanvas = document.createElement('canvas');
    exportCanvas.width = totalW;
    exportCanvas.height = totalH;
    var exportCtx = exportCanvas.getContext('2d');
    for (var r = 0; r < EXPORT_CELLS; r++) {
      for (var c = 0; c < EXPORT_CELLS; c++) {
        exportCtx.drawImage(designCanvas, c * cellW, r * cellH, cellW, cellH);
      }
    }
    var dataUrl = exportCanvas.toDataURL('image/png');
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'pattern.png';
    a.click();
  }

  function init() {
    designCanvas = document.getElementById('patternCanvas');
    guidesCanvas = document.getElementById('patternGuidesOverlay');
    viewCanvas = document.getElementById('patternViewCanvas');
    designWrap = document.querySelector('.pattern-canvas-wrap');
    viewWrap = document.querySelector('.pattern-view-canvas-wrap');
    designPanel = document.getElementById('patternDesign');
    viewPanel = document.getElementById('patternView');

    designCtx = designCanvas.getContext('2d');
    guidesCtx = guidesCanvas.getContext('2d');
    viewCtx = viewCanvas.getContext('2d');

    colorInput = document.getElementById('patternColor');
    brushSizeInput = document.getElementById('patternBrushSize');
    brushSizeValue = document.getElementById('brushSizeValue');
    guidesCheckbox = document.getElementById('patternGuides');
    undoBtn = document.getElementById('patternUndo');
    redoBtn = document.getElementById('patternRedo');
    configSelect = document.getElementById('patternConfig');
    generateBtn = document.getElementById('patternGenerate');
    backBtn = document.getElementById('patternBackToDesign');
    exportBtn = document.getElementById('patternExportPng');

    designCtx.fillStyle = '#ffffff';
    designCtx.fillRect(0, 0, designCanvas.width, designCanvas.height);
    drawGuides();

    colorInput.addEventListener('input', function () {
      state.color = colorInput.value;
    });

    brushSizeInput.addEventListener('input', function () {
      state.brushSize = parseInt(brushSizeInput.value, 10);
      brushSizeValue.textContent = state.brushSize;
    });

    guidesCheckbox.addEventListener('change', function () {
      state.guidesVisible = guidesCheckbox.checked;
      drawGuides();
    });

    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);

    configSelect.addEventListener('change', function () {
      var idx = parseInt(configSelect.value, 10);
      applyConfig(idx);
      configSelect.value = String(idx);
    });

    generateBtn.addEventListener('click', showPatternView);

    backBtn.addEventListener('click', function (e) {
      e.preventDefault();
      showDesignView();
    });

    exportBtn.addEventListener('click', exportPng);

    designCanvas.addEventListener('pointerdown', onDesignPointerDown);
    designCanvas.addEventListener('pointermove', onDesignPointerMove);
    designCanvas.addEventListener('pointerup', onDesignPointerUp);
    designCanvas.addEventListener('pointercancel', onDesignPointerCancel);

    viewCanvas.addEventListener('pointerdown', onViewPointerDown);
    viewCanvas.addEventListener('pointermove', onViewPointerMove);
    viewCanvas.addEventListener('pointerup', onViewPointerUp);
    viewCanvas.addEventListener('pointercancel', onViewPointerCancel);

    designCanvas.addEventListener('touchmove', function (e) {
      if (state.isDrawing) e.preventDefault();
    }, { passive: false });

    viewPanel.addEventListener('touchmove', function (e) {
      if (state.isPanning) e.preventDefault();
    }, { passive: false });

    window.addEventListener('resize', function () {
      if (viewPanel.classList.contains('active')) resizeViewCanvas();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
