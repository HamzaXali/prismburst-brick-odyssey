/*
 * PRISMBURST — Pixel Tunnel renderer.
 * The field is an offscreen image. Only cells that changed are rewritten.
 * Dug cells are flat #181818 with no new gray edge.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.PTRenderer = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var cfgApi = null;
  if (typeof require === 'function') {
    try { cfgApi = require('./config.js'); } catch (e) { cfgApi = null; }
  }
  if (!cfgApi && typeof window !== 'undefined' && window.PB) cfgApi = window.PB.PTConfig;
  var CELL = cfgApi.CELL;
  var CONFIG = cfgApi.CONFIG;

  function create(canvas) {
    var L = cfgApi.layout();
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    canvas.width = L.canvasW;
    canvas.height = L.canvasH;
    var field = document.createElement('canvas');
    field.width = L.fieldW;
    field.height = L.fieldH;
    var fctx = field.getContext('2d');
    var img = fctx.createImageData(field.width, field.height);
    var pix = img.data;
    var colors = CONFIG.COLORS;
    var ready = false;
    var paintKey = '';
    var fieldRGB = [93, 96, 24];
    var fieldGap = [51, 53, 13];
    var wallRGB = [123, 123, 123];
    var wallGap = [78, 78, 78];

    function parseHex(hex) {
      var n = parseInt(String(hex || '').slice(1), 16);
      if (!isFinite(n)) n = 0;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function shade(rgb, scale) {
      return [(rgb[0] * scale) | 0, (rgb[1] * scale) | 0, (rgb[2] * scale) | 0];
    }

    function useTheme(level) {
      var field = (level && level.field) || CONFIG.COLORS.field;
      var wall = (level && level.wall) || '#7B7B7B';
      var key = field + '|' + wall;
      if (key === paintKey) return false;
      paintKey = key;
      if (field === '#5D6018') {
        fieldRGB = [93, 96, 24];
        fieldGap = [51, 53, 13];
      } else {
        fieldRGB = parseHex(field);
        fieldGap = shade(fieldRGB, 0.55);
      }
      if (wall === '#7B7B7B') {
        wallRGB = [123, 123, 123];
        wallGap = [78, 78, 78];
      } else {
        wallRGB = parseHex(wall);
        wallGap = shade(wallRGB, 0.63);
      }
      return true;
    }

    function writeCell(grid, index) {
      var cols = CONFIG.COLS;
      var size = CONFIG.CELL;
      var r = (index / cols) | 0;
      var c = index % cols;
      var type = grid[index];
      var R = 24, G = 24, B = 24;
      var gap = false;
      var gR = 0, gG = 0, gB = 0;
      if (type === CELL.OLIVE) { R = fieldRGB[0]; G = fieldRGB[1]; B = fieldRGB[2]; gap = true; gR = fieldGap[0]; gG = fieldGap[1]; gB = fieldGap[2]; }
      else if (type === CELL.GRAY) { R = wallRGB[0]; G = wallRGB[1]; B = wallRGB[2]; gap = true; gR = wallGap[0]; gG = wallGap[1]; gB = wallGap[2]; }
      else if (type === CELL.YELLOW) { R = 234; G = 207; B = 24; gap = true; gR = 138; gG = 118; gB = 16; }
      else if (type === CELL.RED) { R = 225; G = 30; B = 36; gap = true; gR = 122; gG = 16; gB = 20; }
      var y0 = r * size;
      var x0 = c * size;
      var yy, xx, row, p, er, eg, eb;
      for (yy = 0; yy < size; yy++) {
        row = ((y0 + yy) * field.width + x0) * 4;
        for (xx = 0; xx < size; xx++) {
          p = row + xx * 4;
          er = R; eg = G; eb = B;
          if (gap && (xx === size - 1 || yy === size - 1)) { er = gR; eg = gG; eb = gB; }
          pix[p] = er;
          pix[p + 1] = eg;
          pix[p + 2] = eb;
          pix[p + 3] = 255;
        }
      }
    }

    function flush(state) {
      var i;
      if (useTheme(state.level)) state.fullPaint = true;
      if (!ready || state.fullPaint) {
        for (i = 0; i < state.grid.length; i++) writeCell(state.grid, i);
        ready = true;
        state.fullPaint = false;
        state.dirtyN = 0;
        fctx.putImageData(img, 0, 0);
        return;
      }
      if (!state.dirtyN) return;
      for (i = 0; i < state.dirtyN; i++) writeCell(state.grid, state.dirty[i]);
      state.dirtyN = 0;
      fctx.putImageData(img, 0, 0);
    }

    function star(x, y, rad) {
      ctx.beginPath();
      var i, a, m, px, py;
      for (i = 0; i < 10; i++) {
        a = -Math.PI / 2 + i * Math.PI / 5;
        m = i % 2 ? rad * 0.42 : rad;
        px = x + Math.cos(a) * m;
        py = y + Math.sin(a) * m;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    function drawPickup(p) {
      var kind = p.kind;
      var col = colors.plus3;
      var label = '+3';
      if (kind === 'times3') { col = colors.times3; label = '×3'; }
      else if (kind === 'safety') { col = colors.safetyOrb; label = '–'; }
      else if (kind === 'heart') { col = colors.heart; label = '♥'; }
      var rad = L.pickupR * (p.scale || 1);
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.scale || 1);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold ' + Math.max(8, (rad * 0.9) | 0) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, p.x, p.y + 0.5);
      ctx.restore();
    }

    function draw(state) {
      flush(state);
      ctx.fillStyle = colors.frame;
      ctx.fillRect(0, 0, L.canvasW, L.canvasH);
      ctx.fillStyle = colors.black;
      ctx.fillRect(L.fieldX, L.blackTop, L.fieldW, L.blackBottom - L.blackTop);
      ctx.drawImage(field, L.fieldX, L.fieldY);

      var share = state.destructible ? state.destroyed / state.destructible : 0;
      var roseW = L.fieldW * (state.maxLives ? state.lives / state.maxLives : 0);
      if (roseW < 0) roseW = 0;
      ctx.fillStyle = colors.rose;
      ctx.fillRect(L.fieldX, L.roseY, roseW, L.roseH);
      ctx.fillStyle = CONFIG.PROGRESS_COLOR;
      ctx.fillRect(L.fieldX, L.roseY + L.roseH + 1, L.fieldW * share, 3);

      ctx.fillStyle = colors.paddle;
      ctx.fillRect(state.paddleX - state.paddleW / 2, state.paddleTop, state.paddleW, state.paddleH);
      if (state.safety > 0) {
        ctx.fillStyle = colors.paddle;
        ctx.fillRect(L.fieldX, L.blackBottom - L.safetyH, L.fieldW, L.safetyH);
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      var b = state.balls;
      var i, rad;
      rad = state.ballR;
      for (i = 0; i < CONFIG.MAX_BALLS; i++) {
        if (!b.alive[i]) continue;
        ctx.moveTo(b.x[i] + rad, b.y[i]);
        ctx.arc(b.x[i], b.y[i], rad, 0, Math.PI * 2);
      }
      ctx.fill();

      for (i = 0; i < state.pickups.length; i++) {
        if (state.pickups[i].on) drawPickup(state.pickups[i]);
      }

      if (state.won) drawWin();
    }

    function roundRect(x, y, w, h, rad) {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
      ctx.fill();
    }

    function drawWin() {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(L.fieldX, L.fieldY, L.fieldW, L.fieldH);
      var w = 280;
      var h = 168;
      var x = L.fieldX + (L.fieldW - w) / 2;
      var y = L.fieldY + (L.fieldH - h) / 2;
      ctx.fillStyle = CONFIG.PANEL_COLOR;
      roundRect(x, y, w, h, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('Congratulations', x + w / 2, y + 42);
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('You win!', x + w / 2, y + 78);
      ctx.fillStyle = CONFIG.STAR_COLOR;
      var i;
      for (i = 0; i < CONFIG.WIN_STARS; i++) star(x + w / 2 + (i - 1) * 36, y + 122, 14);
    }

    return { draw: draw, layout: L };
  }

  return { create: create };
});
