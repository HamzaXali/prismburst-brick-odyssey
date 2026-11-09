/*
 * PRISMBURST — Pixel Tunnel collision.
 * A ball that breaks a cell stays inside that cell and keeps most of its
 * speed, so swarms burrow and rattle inside the cavity instead of skating
 * along the outside. No per-step allocations.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.PTPhysics = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var api = null;
  if (typeof require === 'function') {
    try { api = require('./config.js'); } catch (e) { api = null; }
  }
  if (!api && typeof window !== 'undefined' && window.PB) api = window.PB.PTConfig;
  var CELL = api.CELL;
  var CONFIG = api.CONFIG;

  function cellIndex(px, py) {
    var size = CONFIG.CELL;
    var c = (px / size) | 0;
    var r = (py / size) | 0;
    if (c < 0 || r < 0 || c >= CONFIG.COLS || r >= CONFIG.FIELD_ROWS) return -1;
    return r * CONFIG.COLS + c;
  }

  function eat(state, index, ball) {
    var type = state.grid[index];
    if (type === CELL.BRICK || type === CELL.BORDER || type === CELL.YELLOW) {
      state.grid[index] = CELL.OPEN;
      state.hp[index] = 0;
      if (state.mark) state.mark(index);
      if (state.onBreak) state.onBreak(index, type === CELL.YELLOW ? 'yellow' : 'brick');
      ball.kink = (ball.kink + 1) | 0;
      var row = (index / CONFIG.COLS) | 0;
      if (row >= CONFIG.FIELD_ROWS - 6) ball.vy = Math.abs(ball.vy);
      if ((ball.kink & 3) === 0) {
        var vx = ball.vx * 0.82 - ball.vy * 0.42;
        var vy = ball.vy * 0.82 + ball.vx * 0.42;
        var sp = Math.sqrt(vx * vx + vy * vy) || 1;
        var keep = state.speed || CONFIG.BALL_SPEED;
        ball.vx = vx / sp * keep;
        ball.vy = vy / sp * keep;
      }
      return true;
    }
    return false;
  }

  function bounceSolid(ball, nx, ny) {
    var size = CONFIG.CELL;
    var c = (nx / size) | 0;
    var r = (ny / size) | 0;
    var cx = (c + 0.5) * size;
    var cy = (r + 0.5) * size;
    if (Math.abs(nx - cx) > Math.abs(ny - cy)) ball.vx = -ball.vx;
    else ball.vy = -ball.vy;
    ball.x = ball.x;
    ball.y = ball.y;
  }

  function integrateBall(ball, state, dt) {
    var dist = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * dt;
    var steps = (dist / CONFIG.SUBSTEP_PX) | 0;
    if (steps < 1) steps = 1;
    if (steps > 8) steps = 8;
    var h = dt / steps;
    var size = CONFIG.CELL;
    var i;
    for (var s = 0; s < steps; s++) {
      var nx = ball.x + ball.vx * h;
      var ny = ball.y + ball.vy * h;
      if (ny >= 0 && ny < CONFIG.FIELD_ROWS * size) {
        var id = cellIndex(nx, ny);
        if (id >= 0) {
          var type = state.grid[id];
          if (type === CELL.ACCENT) {
            bounceSolid(ball, nx, ny);
            nx = ball.x;
            ny = ball.y + ball.vy * h;
          } else if (type === CELL.BRICK || type === CELL.BORDER || type === CELL.YELLOW) {
            eat(state, id, ball);
            var c = id % CONFIG.COLS;
            var r = (id / CONFIG.COLS) | 0;
            nx = (c + 0.5) * size;
            ny = (r + 0.5) * size;
          }
        }
        var rad = ball.r;
        var probes = 4;
        for (i = 0; i < probes; i++) {
          var ox = i === 0 ? rad : i === 1 ? -rad : 0;
          var oy = i === 2 ? rad : i === 3 ? -rad : 0;
          if (!ox && !oy) continue;
          var pid = cellIndex(nx + ox, ny + oy);
          if (pid >= 0 && pid !== id) eat(state, pid, ball);
        }
      }
      ball.x = nx;
      ball.y = ny;
      if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
      if (ball.x > CONFIG.CANVAS_W - ball.r) { ball.x = CONFIG.CANVAS_W - ball.r; ball.vx = -Math.abs(ball.vx); }
      if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }
    }
  }

  function bouncePaddle(ball, paddle) {
    var top = paddle.y - paddle.h / 2;
    if (ball.vy <= 0) return false;
    var prev = ball._py == null ? ball.y : ball._py;
    var crossed = prev <= top && ball.y >= top - ball.r;
    var overlap = ball.y >= top - ball.r && ball.y <= top + paddle.h + ball.r;
    if (!crossed && !overlap) return false;
    if (Math.abs(ball.x - paddle.x) > paddle.w / 2 + ball.r) return false;
    var offset = (ball.x - paddle.x) / (paddle.w / 2 || 1);
    if (offset < -1) offset = -1;
    else if (offset > 1) offset = 1;
    var max = CONFIG.PADDLE_MAX_ANGLE * Math.PI / 180;
    var ang = -Math.PI / 2 + offset * max;
    var sp = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) || CONFIG.BALL_SPEED;
    ball.vx = Math.cos(ang) * sp;
    ball.vy = Math.sin(ang) * sp;
    ball.y = top - ball.r - 0.2;
    return true;
  }

  function bounceSafety(ball, bar) {
    if (!bar.on || ball.vy <= 0) return false;
    var top = bar.y - bar.h / 2;
    var prev = ball._py == null ? ball.y : ball._py;
    var crossed = prev <= top && ball.y >= top - ball.r;
    var overlap = ball.y >= top - ball.r && ball.y <= bar.y + bar.h;
    if (!crossed && !overlap) return false;
    if (ball.x < bar.x0 || ball.x > bar.x1) return false;
    ball.vy = -Math.abs(ball.vy);
    ball.y = top - ball.r - 0.2;
    return true;
  }

  return {
    integrateBall: integrateBall,
    bouncePaddle: bouncePaddle,
    bounceSafety: bounceSafety
  };
});