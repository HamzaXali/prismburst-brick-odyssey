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
    var gap = '#101018';
    var ready = false;

    function paint(grid, index) {
      var cols = CONFIG.COLS;
      var size = CONFIG.CELL;
      var r = (index / cols) | 0;
      var c = index % cols;
      var x = c * size;
      var y = r * size;
      var type = grid[index];
      fctx.fillStyle = type === CELL.OPEN ? CONFIG.CAVITY : gap;
      fctx.fillRect(x, y, size, size);
      if (type === CELL.BRICK) {
        fctx.fillStyle = color;
        fctx.fillRect(x + 1, y + 1, size - 2, size - 2);
      } else if (type === CELL.BORDER) {
        fctx.fillStyle = CONFIG.BORDER_COLOR;
        fctx.fillRect(x + 1, y + 1, size - 2, size - 2);
        fctx.fillStyle = CONFIG.BORDER_EDGE;
        fctx.fillRect(x + 1, y + 1, size - 2, 1);
      } else if (type === CELL.YELLOW) {
        fctx.fillStyle = CONFIG.TARGET_COLOR;
        fctx.fillRect(x + 1, y + 1, size - 2, size - 2);
        fctx.fillStyle = CONFIG.TARGET_PIP;
        fctx.fillRect(x + 3, y + 3, 2, 2);
      } else if (type === CELL.ACCENT) {
        fctx.fillStyle = CONFIG.ACCENT_COLOR;
        fctx.fillRect(x + 1, y + 1, size - 2, size - 2);
      } else if (type === CELL.OPEN) {
        fctx.fillStyle = CONFIG.BORDER_COLOR;
        var dirs = [[0, -1, 0, 0, size, 1], [0, 1, 0, size - 1, size, 1], [-1, 0, 0, 0, 1, size], [1, 0, size - 1, 0, 1, size]];
        for (var d = 0; d < dirs.length; d++) {
          var rr = r + dirs[d][1];
          var cc = c + dirs[d][0];
          var edge = rr < 0 || cc < 0 || rr >= CONFIG.FIELD_ROWS || cc >= cols || grid[rr * cols + cc] !== CELL.OPEN;
          if (edge) fctx.fillRect(x + dirs[d][2], y + dirs[d][3], dirs[d][4], dirs[d][5]);
        }
      }
    }

    function paintAll(grid) {
      for (var i = 0; i < grid.length; i++) paint(grid, i);
      ready = true;
    }

    function flush(state) {
      if (!ready || state.level.fieldColor !== color) {
        color = state.level.fieldColor;
        gap = darken(color, 28);
        paintAll(state.grid);
        state.dirty.length = 0;
        return;
      }
      var seen = {};
      var cols = CONFIG.COLS;
      for (var i = 0; i < state.dirty.length; i++) {
        var index = state.dirty[i];
        var r = (index / cols) | 0;
        var c = index % cols;
        for (var rr = r - 1; rr <= r + 1; rr++) {
          for (var cc = c - 1; cc <= c + 1; cc++) {
            if (rr < 0 || cc < 0 || rr >= CONFIG.FIELD_ROWS || cc >= cols) continue;
            var j = rr * cols + cc;
            if (seen[j]) continue;
            seen[j] = 1;
            paint(state.grid, j);
          }
        }
      }
      state.dirty.length = 0;
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
      roundRect(pad.x - pad.w / 2, pad.y - pad.h / 2, pad.w, pad.h, 2);
      if (state.safety > 0) {
        var bw = CONFIG.CANVAS_W * CONFIG.SAFETY_WIDTH_RATIO;
        var bh = CONFIG.SAFETY_H_CELLS * CONFIG.CELL;
        var by = cfgApi.safetyY();
        ctx.fillStyle = CONFIG.SAFETY_COLOR;
        ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, state.safety / CONFIG.SAFETY_SECONDS);
        roundRect((CONFIG.CANVAS_W - bw) / 2, by - bh / 2, bw, bh, 2);
        ctx.globalAlpha = 1;
      }

      for (var b = 0; b < state.balls.length; b++) {
        var ball = state.balls[b];
        if (!ball.active) continue;
        ctx.fillStyle = CONFIG.BALL_COLOR;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
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
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      for (var u = 0; u < state.popups.length; u++) {
        var pop = state.popups[u];
        ctx.globalAlpha = Math.max(0, pop.t);
        ctx.fillStyle = '#ffffff';
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
      var rad = CONFIG.BADGE_DIAMETER_CELLS * CONFIG.CELL * 0.5;
      if (reward.kind === 'star') {
        ctx.fillStyle = '#FFE14A';
        star(reward.x, reward.y, rad);
        return;
      }
      var colors = { cyan: '#21C6DB', green: '#3DDC6A', orange: '#FF8A3D', pink: '#FF5AD9' };
      ctx.fillStyle = colors[reward.kind] || '#21C6DB';
      ctx.beginPath();
      ctx.arc(reward.x, reward.y, rad, 0, Math.PI * 2);
      ctx.fill();
      if (reward.kind === 'cyan') {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+3', reward.x, reward.y + 1);
        ctx.textBaseline = 'alphabetic';
      }
    }

    return { draw: draw };
  }

  return { create: create };
});
