/*
 * PRISMBURST — Pixel Tunnel match.
 * The ball is already moving. It digs one olive cell per hit.
 * Pickups fall. The field is clear when every destructible cell is gone.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.PTGame = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var cfgApi = null;
  var levelsApi = null;
  var physics = null;
  if (typeof require === 'function') {
    try { cfgApi = require('./config.js'); } catch (e) { cfgApi = null; }
    try { levelsApi = require('./levels.js'); } catch (e2) { levelsApi = null; }
    try { physics = require('./physics.js'); } catch (e3) { physics = null; }
  }
  if (typeof window !== 'undefined' && window.PB) {
    cfgApi = cfgApi || window.PB.PTConfig;
    levelsApi = levelsApi || window.PB.PTLevels;
    physics = physics || window.PB.PTPhysics;
  }
  var CONFIG = cfgApi.CONFIG;
  var CELL = cfgApi.CELL;

  function emptyPickups() {
    var list = [];
    var i;
    for (i = 0; i < 48; i++) {
      list.push({ on: 0, kind: '', x: 0, y: 0, caught: 0, scale: 1 });
    }
    return list;
  }

  function createMatch(level, opts) {
    opts = opts || {};
    var L = cfgApi.layout();
    var grid = new Uint8Array(level.grid);
    var drops = level.drops;
    var state = {
      level: level,
      grid: grid,
      drops: drops,
      destructible: level.destructible,
      destroyed: 0,
      L: L,
      balls: physics.createBalls(CONFIG.MAX_BALLS),
      live: 0,
      gen: 1,
      pickups: emptyPickups(),
      paddleX: L.fieldX + L.fieldW / 2,
      paddleTop: L.paddleTop,
      paddleW: L.paddleW,
      paddleH: L.paddleH,
      ballR: L.ballR,
      speed: L.speed,
      lives: CONFIG.LIVES,
      maxLives: CONFIG.LIVES,
      safety: 0,
      score: 0,
      stars: 0,
      won: false,
      lost: false,
      demo: !!opts.demo,
      t: 0,
      audio: opts.audio || null,
      dirty: new Int16Array(grid.length),
      dirtyN: 0,
      fullPaint: true,
      hit: 0,
      soundWait: 0
    };
    serveOpening(state);
    return {
      state: state,
      step: function (dt) { step(state, dt); },
      movePaddle: function (x) { movePaddle(state, x); },
      setDemo: function (on) { state.demo = !!on; },
      snapshot: function () { return snapshot(state); }
    };
  }

  function serveOpening(state) {
    var L = state.L;
    var pocket = state.level.pocket;
    var mouth = state.level.entrance != null ? state.level.entrance : (pocket && pocket.entrance ? pocket.entrance.col : 13);
    var x = L.fieldX + (mouth + 0.5) * L.cell;
    var y = L.blackTop + 1.2 * L.cell;
    var vx = state.speed * 0.12;
    var vy = -Math.sqrt(state.speed * state.speed - vx * vx);
    var i = physics.allocBall(state);
    physics.placeBall(state, i, x, y, vx, vy);
  }

  function serveOnPaddle(state) {
    var i = physics.allocBall(state);
    if (i < 0) return;
    var L = state.L;
    var mouthCol = state.level.entrance != null ? state.level.entrance : 13;
    var mouth = L.fieldX + (mouthCol + 0.5) * L.cell;
    var ang = Math.atan2(L.blackTop - state.paddleTop, mouth - state.paddleX);
    var max = CONFIG.PADDLE_MAX_ANGLE * Math.PI / 180;
    var delta = ang + Math.PI / 2;
    if (delta > max) delta = max;
    else if (delta < -max) delta = -max;
    ang = -Math.PI / 2 + delta;
    physics.placeBall(state, i, state.paddleX, state.paddleTop - state.ballR - 1, Math.cos(ang) * state.speed, Math.sin(ang) * state.speed);
  }

  function movePaddle(state, x) {
    if (state.lost) return;
    var half = state.paddleW / 2;
    var L = state.L;
    var min = L.fieldX + half;
    var max = L.fieldX + L.fieldW - half;
    if (x < min) x = min;
    else if (x > max) x = max;
    state.paddleX = x;
  }

  function addBalls(state, count) {
    var i, k, t, ang;
    var made = 0;
    for (k = 0; k < count; k++) {
      i = physics.allocBall(state);
      if (i < 0) return made;
      t = count === 1 ? 0 : (k / (count - 1) - 0.5);
      ang = -Math.PI / 2 + t * 0.7;
      physics.placeBall(
        state,
        i,
        state.paddleX,
        state.paddleTop - state.ballR - 1,
        Math.cos(ang) * state.speed,
        Math.sin(ang) * state.speed
      );
      made++;
    }
    return made;
  }

  function multiplyBalls(state) {
    var b = state.balls;
    var factor = CONFIG.MULTIPLY;
    if (factor < 2) return 0;
    state.gen = (state.gen + 1) & 65535;
    if (state.gen === 0) state.gen = 1;
    var mark = state.gen;
    var i, k, born, j, ang;
    var originals = 0;
    for (i = 0; i < CONFIG.MAX_BALLS; i++) {
      if (!b.alive[i]) continue;
      b.stamp[i] = mark;
      originals++;
    }
    born = 0;
    var want = originals * (factor - 1);
    for (i = 0; i < CONFIG.MAX_BALLS && born < want; i++) {
      if (b.stamp[i] !== mark || !b.alive[i]) continue;
      for (k = 1; k < factor && born < want; k++) {
        j = physics.allocBall(state);
        if (j < 0) return born;
        ang = Math.atan2(b.vy[i], b.vx[i]) + (k === 1 ? 0.4 : -0.4);
        physics.placeBall(state, j, b.x[i], b.y[i], Math.cos(ang) * state.speed, Math.sin(ang) * state.speed);
        born++;
      }
    }
    return born;
  }

  function applyPickup(state, kind) {
    if (kind === 'plus3') addBalls(state, CONFIG.PLUS_BALLS);
    else if (kind === 'times3') multiplyBalls(state);
    else if (kind === 'safety') state.safety = CONFIG.SAFETY_BAR_SEC;
    else if (kind === 'heart') {
      if (state.lives < state.maxLives) state.lives++;
    }
    if (state.audio) state.audio.reward();
  }

  function stepPickups(state, dt) {
    var fall = CONFIG.PICKUP_FALL_CELLS * state.L.cell * dt;
    var rad = state.L.pickupR;
    var list = state.pickups;
    var i, p, mid;
    mid = state.paddleTop + state.paddleH / 2;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p.on) continue;
      if (p.caught) {
        p.scale -= dt / CONFIG.CATCH_SEC;
        p.y += (mid - p.y) * 0.35;
        p.x += (state.paddleX - p.x) * 0.35;
        if (p.scale <= 0) {
          p.on = 0;
          applyPickup(state, p.kind);
        }
        continue;
      }
      p.y += fall;
      if (Math.abs(p.x - state.paddleX) <= state.paddleW / 2 + rad && Math.abs(p.y - mid) <= state.paddleH / 2 + rad) {
        p.caught = 1;
      } else if (p.y > state.L.canvasH + rad) p.on = 0;
    }
  }

  function driveDemo(state) {
    var list = state.pickups;
    var best = 1e9;
    var x = null;
    var i, p, dist, b, low;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p.on || p.caught) continue;
      dist = Math.abs(p.x - state.paddleX) + Math.abs(p.y - state.paddleTop);
      if (dist < best) { best = dist; x = p.x; }
    }
    if (x == null) {
      low = -1;
      b = state.balls;
      for (i = 0; i < CONFIG.MAX_BALLS; i++) {
        if (!b.alive[i] || b.y[i] < low) continue;
        low = b.y[i];
        x = b.x[i];
      }
    }
    if (x != null) movePaddle(state, x);
  }

  function step(state, dt) {
    if (state.won || state.lost) return;
    state.t += dt;
    state.hit = 0;
    if (state.safety > 0) state.safety = Math.max(0, state.safety - dt);
    if (state.demo) driveDemo(state);
    physics.stepBalls(state, dt);
    stepPickups(state, dt);
    if (state.live <= 0 && !state.won) {
      if (CONFIG.ROSE_BAR_MODE === 'ball-loss') state.lives--;
      if (state.audio) state.audio.hurt();
      if (state.lives <= 0) {
        state.lost = true;
        if (state.audio) state.audio.lose();
      } else serveOnPaddle(state);
    }
    if (state.won && state.audio) state.audio.win();
    if (state.hit && state.audio) {
      state.soundWait -= dt;
      if (state.soundWait <= 0) {
        state.audio.brick();
        state.soundWait = 0.05;
      }
    }
  }

  function countPickups(state) {
    var n = 0;
    var i;
    for (i = 0; i < state.pickups.length; i++) if (state.pickups[i].on) n++;
    return n;
  }

  function snapshot(state) {
    var total = state.destructible || 1;
    return {
      id: state.level.id,
      name: state.level.name,
      won: state.won,
      lost: state.lost,
      score: state.score,
      lives: state.lives,
      stars: state.stars,
      balls: state.live,
      safety: state.safety,
      destroyed: state.destroyed,
      total: state.destructible,
      percent: Math.round(state.destroyed / total * 100),
      pickups: countPickups(state),
      demo: state.demo
    };
  }

  return {
    createMatch: createMatch,
    addBalls: addBalls,
    multiplyBalls: multiplyBalls,
    applyPickup: applyPickup,
    CELL: CELL
  };
});
