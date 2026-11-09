/*
 * PRISMBURST — Pixel Tunnel renderer.
 * The 50x50 field lives on an offscreen canvas and only dirty cells are
 * repainted. Balls, the paddle, and rewards are drawn every frame.
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

  var cfgApi = (typeof window !== 'undefined' && window.PB && window.PB.PTConfig) || null;
  if (!cfgApi && typeof require === 'function') cfgApi = require('./config.js');
  var CELL = cfgApi.CELL;
  var CONFIG = cfgApi.CONFIG;

  function darken(hex, amount) {
    var n = parseInt(hex.slice(1), 16);
    function ch(shift) { return Math.max(0, ((n >> shift) & 255) - amount); }
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    canvas.width = CONFIG.CANVAS_W;
    canvas.height = CONFIG.CANVAS_H;
    var field = document.createElement('canvas');
    field.width = CONFIG.COLS * CONFIG.CELL;
    field.height = CONFIG.FIELD_ROWS * CONFIG.CELL;
    var fctx = field.getContext('2d');
    var color = '#393F6B';
    var ready = false;
    var img = fctx.createImageData(field.width, field.height);
    var pix = img.data;
    var fr = 58, fg = 79, fb = 190;
    var seen = new Uint8Array(CONFIG.COLS * CONFIG.FIELD_ROWS);

    function tone(hex) {
      var n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function writeCell(grid, index) {
      var cols = CONFIG.COLS;
      var size = CONFIG.CELL;
      var r = (index / cols) | 0;
      var c = index % cols;
      var type = grid[index];
      var R = 12, G = 12, B = 12;
      if (type === CELL.YELLOW) { R = 255; G = 217; B = 0; }
      else if (type === CELL.ACCENT) { R = 237; G = 41; B = 55; }
      else if (type === CELL.BRICK || type === CELL.BORDER) { R = fr; G = fg; B = fb; }
      var y0 = r * size;
      var x0 = c * size;
      var yy, xx, row, p;
      var shade = (type === CELL.BRICK || type === CELL.BORDER);
      var rim = r === 0 || c === 0 || r === CONFIG.FIELD_ROWS - 1 || c === cols - 1;
      for (yy = 0; yy < size; yy++) {
        row = ((y0 + yy) * field.width + x0) * 4;
        for (xx = 0; xx < size; xx++) {
          p = row + xx * 4;
          var er = R, eg = G, eb = B;
          if (shade && (xx === size - 1 || yy === size - 1)) {
            er = (R * 0.72) | 0;
            eg = (G * 0.72) | 0;
            eb = (B * 0.72) | 0;
          }
          if (rim && (xx === 0 && c === 0 || xx === size - 1 && c === cols - 1 || yy === 0 && r === 0 || yy === size - 1 && r === CONFIG.FIELD_ROWS - 1)) {
            er = 176; eg = 176; eb = 176;
          }
          pix[p] = er;
          pix[p + 1] = eg;
          pix[p + 2] = eb;
          pix[p + 3] = 255;
        }
      }
      if (type !== CELL.BRICK && type !== CELL.BORDER) return;
      var edge = tone(CONFIG.BORDER_COLOR);
      function lip(dc, dr, ex, ey, ew, eh) {
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= CONFIG.FIELD_ROWS || cc >= cols) return;
        if (grid[rr * cols + cc] !== CELL.OPEN) return;
        for (yy = 0; yy < eh; yy++) {
          row = ((y0 + ey + yy) * field.width + (x0 + ex)) * 4;
          for (xx = 0; xx < ew; xx++) {
            p = row + xx * 4;
            pix[p] = edge[0];
            pix[p + 1] = edge[1];
            pix[p + 2] = edge[2];
          }
        }
      }
      lip(0, -1, 0, 0, size, 1);
      lip(0, 1, 0, size - 1, size, 1);
      lip(-1, 0, 0, 0, 1, size);
      lip(1, 0, size - 1, 0, 1, size);
    }

    function flush(state) {
      var i;
      var painted = false;
      if (!ready || state.level.fieldColor !== color || state.fullPaint) {
        color = state.level.fieldColor;
        var rgb = tone(color);
        fr = rgb[0]; fg = rgb[1]; fb = rgb[2];
        for (i = 0; i < state.grid.length; i++) writeCell(state.grid, i);
        ready = true;
        state.fullPaint = false;
        painted = true;
      } else if (state.dirty.length) {
        seen.fill(0);
        var cols = CONFIG.COLS;
        for (i = 0; i < state.dirty.length; i++) {
          var index = state.dirty[i];
          var r = (index / cols) | 0;
          var c = index % cols;
          var rr, cc, j;
          for (rr = r - 1; rr <= r + 1; rr++) {
            for (cc = c - 1; cc <= c + 1; cc++) {
              if (rr < 0 || cc < 0 || rr >= CONFIG.FIELD_ROWS || cc >= cols) continue;
              j = rr * cols + cc;
              if (seen[j]) continue;
              seen[j] = 1;
              writeCell(state.grid, j);
            }
          }
        }
        painted = true;
      }
      state.dirty.length = 0;
      if (painted) fctx.putImageData(img, 0, 0);
    }

    function star(x, y, rad) {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5;
        var m = i % 2 ? rad * 0.45 : rad;
        var px = x + Math.cos(a) * m;
        var py = y + Math.sin(a) * m;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    function draw(state) {
      flush(state);
      ctx.fillStyle = CONFIG.BG;
      ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
      ctx.fillStyle = CONFIG.PLAYFIELD;
      ctx.fillRect(0, CONFIG.FIELD_ROWS * CONFIG.CELL, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
      ctx.drawImage(field, 0, 0);
      var fw = CONFIG.COLS * CONFIG.CELL;
      var fh = CONFIG.FIELD_ROWS * CONFIG.CELL;
      ctx.strokeStyle = '#9A9A9A';
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, fw - 3, fh - 3);
      ctx.strokeStyle = '#D0D0D0';
      ctx.lineWidth = 1;
      ctx.strokeRect(3.5, 3.5, fw - 7, fh - 7);
      if (CONFIG.ROSE_ENABLED) {
        ctx.fillStyle = CONFIG.ROSE_COLOR;
        ctx.fillRect(0, CONFIG.CELL, CONFIG.CANVAS_W, CONFIG.CELL * 0.5);
      }
      ctx.strokeStyle = CONFIG.OUTER_BORDER;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, CONFIG.CANVAS_W - 4, CONFIG.CANVAS_H - 4);

      if (state.findEntrance) {
        var pulse = 0.45 + 0.55 * Math.abs(Math.sin(state.t * 5));
        ctx.strokeStyle = CONFIG.ENTRANCE_HINT_COLOR;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 2;
        var cols = CONFIG.COLS;
        var row = CONFIG.FIELD_ROWS - 1;
        for (var c = 0; c < cols; c++) {
          if (state.grid[row * cols + c] !== CELL.OPEN) continue;
          ctx.strokeRect(c * CONFIG.CELL + 1, row * CONFIG.CELL + 1, CONFIG.CELL - 2, CONFIG.CELL - 2);
        }
        ctx.globalAlpha = 1;
      }

      var pad = state.paddle;
      ctx.fillStyle = CONFIG.PADDLE_COLOR;
      ctx.fillRect(pad.x - pad.w / 2, pad.y - pad.h / 2, pad.w, pad.h);
      if (state.safety > 0) {
        var bw = CONFIG.CANVAS_W * CONFIG.SAFETY_WIDTH_RATIO;
        var bh = Math.max(3, CONFIG.SAFETY_H_CELLS * CONFIG.CELL);
        var by = cfgApi.safetyY();
        ctx.fillStyle = CONFIG.SAFETY_COLOR;
        ctx.fillRect((CONFIG.CANVAS_W - bw) / 2, by - bh / 2, bw, bh);
      }

      ctx.fillStyle = CONFIG.BALL_COLOR;
      for (var b = 0; b < state.balls.length; b++) {
        var ball = state.balls[b];
        if (!ball.active) continue;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, Math.max(2.2, ball.r), 0, Math.PI * 2);
        ctx.fill();
      }

      for (var i = 0; i < state.rewards.length; i++) drawReward(state.rewards[i]);
      for (var p = 0; p < state.particles.length; p++) {
        var bit = state.particles[p];
        ctx.globalAlpha = Math.max(0, bit.t / 0.35);
        ctx.fillStyle = bit.color;
        ctx.fillRect(bit.x, bit.y, 2, 2);
      }
      ctx.globalAlpha = 1;
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      for (var u = 0; u < state.popups.length; u++) {
        var pop = state.popups[u];
        if (!pop.on || pop.t <= 0) continue;
        ctx.globalAlpha = Math.max(0, pop.t / CONFIG.POPUP_LIFE);
        ctx.fillText(pop.text, pop.x, pop.y);
      }
      ctx.globalAlpha = 1;
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

    function drawReward(reward) {
      var s = CONFIG.BADGE_DIAMETER_CELLS * CONFIG.CELL;
      var x = reward.x - s / 2;
      var y = reward.y - s / 2;
      if (reward.kind === 'star') {
        ctx.fillStyle = '#FFE14A';
        star(reward.x, reward.y, s * 0.55);
        return;
      }
      var colors = { cyan: '#21C6DB', green: '#3DDC6A', orange: '#FF8A3D', pink: '#FF5AD9' };
      ctx.fillStyle = colors[reward.kind] || '#21C6DB';
      ctx.beginPath();
      ctx.arc(reward.x, reward.y, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    return { draw: draw };
  }

  return { create: create };
});
