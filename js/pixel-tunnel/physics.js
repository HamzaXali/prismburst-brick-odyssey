/*
 * PRISMBURST — Pixel Tunnel physics.
 * Fixed 60 fps steps, two sub-steps, no ball–ball collisions.
 * Balls live in Float32Array columns. A hit destroys one cell and reflects.
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

  var cfgApi = null;
  var levelsApi = null;
  if (typeof require === 'function') {
    try { cfgApi = require('./config.js'); } catch (e) { cfgApi = null; }
    try { levelsApi = require('./levels.js'); } catch (e2) { levelsApi = null; }
  }
  if (!cfgApi && typeof window !== 'undefined' && window.PB) cfgApi = window.PB.PTConfig;
  if (!levelsApi && typeof window !== 'undefined' && window.PB) levelsApi = window.PB.PTLevels;
  var CELL = cfgApi.CELL;
  var CONFIG = cfgApi.CONFIG;
  var canBreak = levelsApi.canBreak;
  var COLS = CONFIG.COLS;
  var ROWS = CONFIG.ROWS;

  function createBalls(max) {
    return {
      x: new Float32Array(max),
      y: new Float32Array(max),
      vx: new Float32Array(max),
      vy: new Float32Array(max),
      py: new Float32Array(max),
      alive: new Uint8Array(max),
      stamp: new Uint16Array(max)
    };
  }

  function allocBall(state) {
    if (state.live >= CONFIG.MAX_BALLS) return -1;
    var alive = state.balls.alive;
    var i;
    for (i = 0; i < CONFIG.MAX_BALLS; i++) {
      if (alive[i]) continue;
      alive[i] = 1;
      state.live++;
      return i;
    }
    return -1;
  }

  function killBall(state, i) {
    if (!state.balls.alive[i]) return;
    state.balls.alive[i] = 0;
    state.live--;
  }

  function placeBall(state, i, x, y, vx, vy) {
    var b = state.balls;
    b.x[i] = x;
    b.y[i] = y;
    b.vx[i] = vx;
    b.vy[i] = vy;
    b.py[i] = y;
  }

  function weightedDrop() {
    var w = CONFIG.DROP_WEIGHTS;
    var x = Math.random();
    var a = w.plus3;
    var b = a + w.safety;
    var c = b + w.times3;
    if (x < a) return 'plus3';
    if (x < b) return 'safety';
    if (x < c) return 'times3';
    return 'heart';
  }

  function spawnPickup(state, kind, x, y) {
    var list = state.pickups;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].on) continue;
      var p = list[i];
      p.on = 1;
      p.kind = kind;
      p.x = x;
      p.y = y;
      p.caught = 0;
      p.scale = 1;
      return true;
    }
    return false;
  }

  function destroyCell(state, index) {
    var type = state.grid[index];
    if (!canBreak(state.grid, index)) return false;
    state.grid[index] = CELL.OPEN;
    if (state.dirtyN < state.dirty.length) state.dirty[state.dirtyN++] = index;
    else state.fullPaint = true;
    state.destroyed++;
    state.hit = 1;
    if (type === CELL.YELLOW || type === CELL.RED) state.score += CONFIG.SCORE_TARGET;
    else state.score += CONFIG.SCORE_CELL;
    var c = index % COLS;
    var r = (index / COLS) | 0;
    var L = state.L;
    var x = L.fieldX + (c + 0.5) * L.cell;
    var y = L.fieldY + (r + 0.5) * L.cell;
    var kind = state.drops && state.drops[index];
    if (kind) spawnPickup(state, kind, x, y);
    else if (Math.random() < CONFIG.DROP_CHANCE) spawnPickup(state, weightedDrop(), x, y);
    if (!state.won && state.destroyed >= state.destructible) {
      state.won = true;
      state.stars = CONFIG.WIN_STARS;
    }
    return true;
  }

  function circleHitsCell(nx, ny, rad, c, r, L) {
    var x0 = L.fieldX + c * L.cell;
    var y0 = L.fieldY + r * L.cell;
    var nearestX = nx < x0 ? x0 : (nx > x0 + L.cell ? x0 + L.cell : nx);
    var nearestY = ny < y0 ? y0 : (ny > y0 + L.cell ? y0 + L.cell : ny);
    var dx = nx - nearestX;
    var dy = ny - nearestY;
    return dx * dx + dy * dy <= rad * rad;
  }

  function firstSolid(state, nx, ny, vx, vy) {
    var L = state.L;
    var rad = state.ballR;
    var c0 = ((nx - rad - L.fieldX) / L.cell) | 0;
    var c1 = ((nx + rad - L.fieldX) / L.cell) | 0;
    var r0 = ((ny - rad - L.fieldY) / L.cell) | 0;
    var r1 = ((ny + rad - L.fieldY) / L.cell) | 0;
    if (c0 < 0) c0 = 0;
    if (r0 < 0) r0 = 0;
    if (c1 >= COLS) c1 = COLS - 1;
    if (r1 >= ROWS) r1 = ROWS - 1;
    if (c1 < c0 || r1 < r0) return -1;
    var best = -1;
    var bestDot = -1e9;
    var sp = Math.sqrt(vx * vx + vy * vy) || 1;
    var r, c, index, type, cx, cy, dot;
    for (r = r0; r <= r1; r++) {
      for (c = c0; c <= c1; c++) {
        index = r * COLS + c;
        type = state.grid[index];
        if (type === CELL.OPEN) continue;
        if (!circleHitsCell(nx, ny, rad, c, r, L)) continue;
        cx = L.fieldX + (c + 0.5) * L.cell - nx;
        cy = L.fieldY + (r + 0.5) * L.cell - ny;
        dot = (cx * vx + cy * vy) / sp;
        if (dot < 0) continue;
        if (dot > bestDot) {
          bestDot = dot;
          best = index;
        }
      }
    }
    return best;
  }

  function substepBall(state, i, dt) {
    var b = state.balls;
    var L = state.L;
    var x = b.x[i];
    var y = b.y[i];
    var vx = b.vx[i];
    var vy = b.vy[i];
    b.py[i] = y;
    var nx = x + vx * dt;
    var ny = y + vy * dt;
    var rad = state.ballR;
    var left = L.fieldX + rad;
    var right = L.fieldX + L.fieldW - rad;
    if (nx < left) { nx = left; vx = Math.abs(vx); }
    else if (nx > right) { nx = right; vx = -Math.abs(vx); }
    if (ny < rad) { ny = rad; vy = Math.abs(vy); }
    var floor = L.blackBottom - rad;
    if (state.safety > 0) floor -= L.safetyH;
    if (ny > floor) {
      if (state.safety > 0) {
        ny = floor;
        vy = -Math.abs(vy);
      } else {
        killBall(state, i);
        return;
      }
    }
    var hit = firstSolid(state, nx, ny, vx, vy);
    if (hit >= 0) {
      var broke = destroyCell(state, hit);
      var c = hit % COLS;
      var r = (hit / COLS) | 0;
      var cx = L.fieldX + (c + 0.5) * L.cell;
      var cy = L.fieldY + (r + 0.5) * L.cell;
      var half = L.cell * 0.5;
      if (!broke) {
        var side = Math.abs(x - cx) > Math.abs(y - cy);
        if (side) {
          vx = x < cx ? -Math.abs(vx) : Math.abs(vx);
          nx = x < cx ? cx - half - rad - 0.2 : cx + half + rad + 0.2;
          ny = y + vy * dt;
        } else {
          vy = y < cy ? -Math.abs(vy) : Math.abs(vy);
          ny = y < cy ? cy - half - rad - 0.2 : cy + half + rad + 0.2;
          nx = x + vx * dt;
        }
      } else {
        var glance = state.speed * 0.22;
        if (Math.abs(nx - cx) > Math.abs(ny - cy)) {
          vx = -vx;
          vy += ((ny - cy) / half) * glance;
        } else {
          vy = -vy;
          vx += ((nx - cx) / half) * glance;
        }
        nx = x;
        ny = y;
      }
    }
    var sp = Math.sqrt(vx * vx + vy * vy) || 1;
    var keep = state.speed;
    b.vx[i] = vx / sp * keep;
    b.vy[i] = vy / sp * keep;
    b.x[i] = nx;
    b.y[i] = ny;
  }

  function bouncePaddle(state, i) {
    var b = state.balls;
    if (!b.alive[i] || b.vy[i] <= 0) return;
    var top = state.paddleTop;
    var prev = b.py[i];
    var y = b.y[i];
    var rad = state.ballR;
    if (prev > top) return;
    if (y < top - rad) return;
    var half = state.paddleW / 2;
    if (Math.abs(b.x[i] - state.paddleX) > half + rad) return;
    var offset = (b.x[i] - state.paddleX) / half;
    if (offset < -1) offset = -1;
    else if (offset > 1) offset = 1;
    var max = CONFIG.PADDLE_MAX_ANGLE * Math.PI / 180;
    var ang = -Math.PI / 2 + offset * max;
    b.vx[i] = Math.cos(ang) * state.speed;
    b.vy[i] = Math.sin(ang) * state.speed;
    b.y[i] = top - rad - 0.25;
  }

  function stepBalls(state, dt) {
    var n = CONFIG.SUBSTEPS;
    var sub = dt / n;
    var s, i;
    var alive = state.balls.alive;
    for (s = 0; s < n; s++) {
      for (i = 0; i < CONFIG.MAX_BALLS; i++) {
        if (!alive[i]) continue;
        substepBall(state, i, sub);
        if (alive[i]) bouncePaddle(state, i);
      }
    }
  }

  return {
    createBalls: createBalls,
    allocBall: allocBall,
    killBall: killBall,
    placeBall: placeBall,
    destroyCell: destroyCell,
    stepBalls: stepBalls,
    spawnPickup: spawnPickup,
    weightedDrop: weightedDrop
  };
});
