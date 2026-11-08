/*
 * PRISMBURST — Pixel Tunnel collision.
 * Fixed substeps so a ball cannot skip a one-cell wall.
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

  function dep() {
    if (typeof require === 'function') {
      try { return require('./config.js'); } catch (e) { /* browser */ }
    }
    return (typeof window !== 'undefined' && window.PB && window.PB.PTConfig) || null;
  }

  var api = dep();
  var CELL = api.CELL;
  var CONFIG = api.CONFIG;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function overlaps(ball, c, r) {
    var size = CONFIG.CELL;
    var x0 = c * size;
    var y0 = r * size;
    var nx = clamp(ball.x, x0, x0 + size);
    var ny = clamp(ball.y, y0, y0 + size);
    var dx = ball.x - nx;
    var dy = ball.y - ny;
    return dx * dx + dy * dy <= ball.r * ball.r + 0.01;
  }

  function touching(ball, state) {
    var size = CONFIG.CELL;
    var cols = CONFIG.COLS;
    var rows = CONFIG.FIELD_ROWS;
    var c0 = Math.floor(ball.x / size);
    var r0 = Math.floor(ball.y / size);
    var out = [];
    for (var r = r0 - 1; r <= r0 + 1; r++) {
      for (var c = c0 - 1; c <= c0 + 1; c++) {
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
        if (overlaps(ball, c, r)) out.push(r * cols + c);
      }
    }
    return out;
  }

  /* Returns 'bounce' if the ball should reverse this axis. */
  function strike(index, state, ball) {
    var type = state.grid[index];
    if (type === CELL.OPEN || type === 0) return 'free';
    if (type === CELL.ACCENT) return 'bounce';
    if (type === CELL.BRICK || type === CELL.YELLOW || type === CELL.BORDER) {
      if (type === CELL.BORDER && !state.grayBreakable) {
        var ready = state.t - (state.borderStamp[index] || 0) >= 0.2;
        if (ready && state.hp[index] > 0) {
          state.hp[index]--;
          state.borderStamp[index] = state.t;
        }
        if (state.hp[index] > 0) return 'bounce';
        state.grid[index] = CELL.OPEN;
        state.dirty.push(index);
        if (state.onBreak) state.onBreak(index, 'border');
        return 'free';
      }
      state.grid[index] = CELL.OPEN;
      state.hp[index] = 0;
      state.dirty.push(index);
      if (state.onBreak) state.onBreak(index, type === CELL.YELLOW ? 'yellow' : 'brick');
      return 'bounce';
    }
    return 'free';
  }

  function moveAxis(ball, axis, delta, state) {
    if (!delta) return;
    ball[axis] += delta;
    var hits = touching(ball, state);
    var bounce = false;
    for (var i = 0; i < hits.length; i++) {
      if (strike(hits[i], state, ball) === 'bounce') bounce = true;
    }
    if (bounce) {
      ball[axis] -= delta;
      var key = axis === 'x' ? 'vx' : 'vy';
      ball[key] = -ball[key];
    }
  }

  function integrateBall(ball, state, dt) {
    var speed = Math.hypot(ball.vx, ball.vy);
    var dist = speed * dt;
    var steps = Math.max(1, Math.ceil(dist / CONFIG.SUBSTEP_PX));
    var h = dt / steps;
    for (var s = 0; s < steps; s++) {
      moveAxis(ball, 'x', ball.vx * h, state);
      moveAxis(ball, 'y', ball.vy * h, state);
      var r = ball.r;
      if (ball.x < r) { ball.x = r; ball.vx = Math.abs(ball.vx); }
      if (ball.x > CONFIG.CANVAS_W - r) { ball.x = CONFIG.CANVAS_W - r; ball.vx = -Math.abs(ball.vx); }
      if (ball.y < r) { ball.y = r; ball.vy = Math.abs(ball.vy); }
    }
  }

  function bouncePaddle(ball, paddle) {
    var top = paddle.y - paddle.h / 2;
    if (ball.vy <= 0) return false;
    if (ball.y < top - ball.r || ball.y > top + paddle.h + ball.r) return false;
    if (Math.abs(ball.x - paddle.x) > paddle.w / 2 + ball.r) return false;
    var offset = (ball.x - paddle.x) / (paddle.w / 2 || 1);
    offset = clamp(offset, -1, 1);
    var max = CONFIG.PADDLE_MAX_ANGLE * Math.PI / 180;
    var ang = -Math.PI / 2 + offset * max;
    var sp = Math.hypot(ball.vx, ball.vy) || CONFIG.BALL_SPEED;
    ball.vx = Math.cos(ang) * sp;
    ball.vy = Math.sin(ang) * sp;
    ball.y = top - ball.r - 0.25;
    return true;
  }

  function bounceSafety(ball, bar) {
    if (!bar.on || ball.vy <= 0) return false;
    var top = bar.y - bar.h / 2;
    if (ball.y < top - ball.r || ball.y > bar.y + bar.h) return false;
    if (ball.x < bar.x0 || ball.x > bar.x1) return false;
    ball.vy = -Math.abs(ball.vy);
    ball.y = top - ball.r - 0.25;
    return true;
  }

  return {
    integrateBall: integrateBall,
    bouncePaddle: bouncePaddle,
    bounceSafety: bounceSafety,
    touching: touching
  };
});
