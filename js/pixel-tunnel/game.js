/*
 * PRISMBURST — Pixel Tunnel match.
 * Rules the clips never showed (combo clock, scores, lives, win) use the
 * written defaults. Visuals and the rewards the clips did show follow footage:
 * grey lining, paddle multiball, full-width safety bar, extra drop colors.
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
  if (!cfgApi && typeof window !== 'undefined' && window.PB) cfgApi = window.PB.PTConfig;
  if (!levelsApi && typeof window !== 'undefined' && window.PB) levelsApi = window.PB.PTLevels;
  if (!physics && typeof window !== 'undefined' && window.PB) physics = window.PB.PTPhysics;
  var CELL = cfgApi.CELL;
  var CONFIG = cfgApi.CONFIG;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var REWARD_KINDS = ['cyan', 'green', 'orange', 'pink', 'star'];

  function mouthCenters(grid) {
    var runs = levelsApi.mouths(grid);
    var out = [];
    for (var i = 0; i < runs.length; i++) {
      out.push(((runs[i].c0 + runs[i].c1 + 1) / 2) * CONFIG.CELL);
    }
    return out;
  }

  function countYellow(grid) {
    var n = 0;
    for (var i = 0; i < grid.length; i++) if (grid[i] === CELL.YELLOW) n++;
    return n;
  }

  function makeBalls() {
    var list = [];
    for (var i = 0; i < CONFIG.MAX_BALLS; i++) {
      list.push({ active: false, launched: false, x: 0, y: 0, vx: 0, vy: 0, r: 0 });
    }
    return list;
  }

  function createMatch(level, opts) {
    opts = opts || {};
    var grid = new Uint8Array(level.grid);
    var hp = new Uint8Array(grid.length);
    var stamp = new Float32Array(grid.length);
    var borderHits = CONFIG.GRAY_BREAKABLE ? 1 : CONFIG.BORDER_HITS;
    for (var i = 0; i < grid.length; i++) {
      if (grid[i] === CELL.BORDER) hp[i] = borderHits;
      else if (grid[i] === CELL.BRICK) hp[i] = 1;
    }
    var mouths = mouthCenters(grid);
    var paddleW = CONFIG.PADDLE_W_CELLS * CONFIG.CELL;
    var paddleH = CONFIG.PADDLE_H_CELLS * CONFIG.CELL;
    var ballR = CONFIG.BALL_DIAMETER_CELLS * CONFIG.CELL * 0.5;
    var speed = CONFIG.BALL_SPEED * (level.speed || 1);
    var state = {
      level: level,
      grid: grid,
      hp: hp,
      borderStamp: stamp,
      grayBreakable: !!CONFIG.GRAY_BREAKABLE,
      dirty: [],
      mouths: mouths,
      balls: makeBalls(),
      paddle: { x: CONFIG.CANVAS_W / 2, y: cfgApi.paddleY(), w: paddleW, h: paddleH, baseW: paddleW },
      ballR: ballR,
      speed: speed,
      launched: false,
      launchOrigin: 0,
      lives: CONFIG.LIVES,
      livesLost: 0,
      score: 0,
      combo: 0,
      lastBreak: -10,
      t: 0,
      idle: 0,
      tapReady: 0,
      yellowLeft: countYellow(grid),
      yellowTotal: countYellow(grid),
      bestRow: CONFIG.FIELD_ROWS,
      won: false,
      lost: false,
      demo: !!opts.demo,
      safety: 0,
      wide: 0,
      rewards: [],
      rewardWait: CONFIG.BADGE_SPAWN_INTERVAL,
      particles: [],
      popups: [],
      message: '',
      messageT: 0,
      hint: false,
      onBreak: null,
      audio: opts.audio || null
    };
    state.onBreak = function (index, kind) { broke(state, index, kind); };
    seat(state);
    return {
      state: state,
      step: function (dt) { step(state, dt); },
      snapshot: function () { return snapshot(state); },
      launch: function () { return launch(state); },
      movePaddle: function (x, fromPlayer) { movePaddle(state, x, fromPlayer); },
      tap: function (x, y) { return tap(state, x, y); },
      setDemo: function (on) { state.demo = !!on; },
      reset: function () { return createMatch(level, opts); }
    };
  }

  function seat(state) {
    var ball = state.balls[0];
    var x = launchX(state);
    state.paddle.x = x;
    state.launchOrigin = x;
    ball.active = true;
    ball.launched = false;
    ball.r = state.ballR;
    ball.vx = 0;
    ball.vy = 0;
    ball.x = x;
    ball.y = stickY(state);
    state.launched = false;
    state.idle = 0;
  }

  function stickY(state) {
    return state.paddle.y - state.paddle.h / 2 - state.ballR - 0.5;
  }

  function launchX(state) {
    var mouth = state.mouths[0] || CONFIG.CANVAS_W / 2;
    var mouthY = (CONFIG.FIELD_ROWS - 0.5) * CONFIG.CELL;
    var ballY = stickY(state);
    var mag = Math.abs(CONFIG.LAUNCH_ANGLE) * Math.PI / 180;
    var dir = mouth < CONFIG.CANVAS_W / 2 ? -1 : 1;
    if (Math.abs(mouth - CONFIG.CANVAS_W / 2) < 20) dir = 1;
    var theta = dir > 0 ? -mag : (-Math.PI + mag);
    var vx = Math.cos(theta);
    var vy = Math.sin(theta);
    var t = (mouthY - ballY) / vy;
    var x = mouth - vx * t;
    var half = state.paddle.baseW / 2;
    return clamp(x, half, CONFIG.CANVAS_W - half);
  }

  function launch(state) {
    if (state.launched || state.won || state.lost) return false;
    var ball = null;
    for (var i = 0; i < state.balls.length; i++) {
      if (state.balls[i].active && !state.balls[i].launched) ball = state.balls[i];
    }
    if (!ball) return false;
    var mouth = nearestMouth(state, ball.x);
    var mouthY = (CONFIG.FIELD_ROWS - 0.5) * CONFIG.CELL;
    var aim = aimVelocity(ball.x, ball.y, mouth, mouthY, state.speed);
    ball.vx = aim.vx;
    ball.vy = aim.vy;
    ball.launched = true;
    state.launched = true;
    state.hint = false;
    if (state.audio) state.audio.launch();
    return true;
  }

  function aimVelocity(x, y, tx, ty, speed) {
    var ang = Math.atan2(ty - y, tx - x);
    var up = -Math.PI / 2;
    var max = Math.abs(CONFIG.LAUNCH_ANGLE) * Math.PI / 180;
    var delta = ang - up;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    delta = clamp(delta, -max, max);
    ang = up + delta;
    return { vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed };
  }

  function nearestMouth(state, x) {
    var best = state.mouths[0] || CONFIG.CANVAS_W / 2;
    var d = Math.abs(best - x);
    for (var i = 1; i < state.mouths.length; i++) {
      var dd = Math.abs(state.mouths[i] - x);
      if (dd < d) { d = dd; best = state.mouths[i]; }
    }
    return best;
  }

  function movePaddle(state, x, fromPlayer) {
    if (state.won || state.lost) return;
    var half = state.paddle.w / 2;
    var prev = state.paddle.x;
    state.paddle.x = clamp(x, half, CONFIG.CANVAS_W - half);
    if (!state.launched) {
      var ball = stuckBall(state);
      if (ball) ball.x = state.paddle.x;
      if (fromPlayer && Math.abs(state.paddle.x - state.launchOrigin) > CONFIG.LAUNCH_MOVE_PX) launch(state);
    }
    if (fromPlayer && Math.abs(state.paddle.x - prev) > 0.5) state.idle = 0;
  }

  function stuckBall(state) {
    for (var i = 0; i < state.balls.length; i++) {
      if (state.balls[i].active && !state.balls[i].launched) return state.balls[i];
    }
    return null;
  }

  function broke(state, index, kind) {
    if (kind === 'border') kind = 'brick';
    var base = kind === 'yellow' ? CONFIG.SCORE_YELLOW : CONFIG.SCORE_CELL;
    if (state.t - state.lastBreak > CONFIG.COMBO_WINDOW) state.combo = 0;
    state.combo = Math.min(CONFIG.COMBO_MAX, state.combo + 1);
    state.lastBreak = state.t;
    state.score += base * state.combo;
    var label = 'x' + state.combo;
    if (state.combo >= CONFIG.COMBO_MAX) {
      label = 'x3! +3 DROP!';
      spawnReward(state, 'cyan');
      state.combo = 0;
    }
    popup(state, (index % CONFIG.COLS) * CONFIG.CELL, ((index / CONFIG.COLS) | 0) * CONFIG.CELL, label);
    burst(state, (index % CONFIG.COLS) * CONFIG.CELL + 4, ((index / CONFIG.COLS) | 0) * CONFIG.CELL + 4, kind === 'yellow' ? CONFIG.TARGET_COLOR : '#ffffff');
    if (kind === 'yellow') {
      state.yellowLeft = countYellow(state.grid);
      if (state.audio) state.audio.yellow();
      if (CONFIG.WIN_MODE === 'yellow' && state.yellowLeft <= 0) win(state);
    } else if (state.audio) state.audio.brick();
  }

  function win(state) {
    if (state.won) return;
    state.won = true;
    state.stars = state.livesLost <= 0 ? 3 : (state.livesLost === 1 ? 2 : 1);
    if (state.audio) state.audio.win();
  }

  function popup(state, x, y, text) {
    state.popups.push({ x: x, y: y, text: text, t: 0.8 });
    if (state.popups.length > 8) state.popups.shift();
  }

  function burst(state, x, y, color) {
    for (var i = 0; i < 6; i++) {
      if (state.particles.length >= CONFIG.PARTICLE_POOL) state.particles.shift();
      var a = Math.random() * Math.PI * 2;
      var s = 20 + Math.random() * 50;
      state.particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.35, color: color });
    }
  }

  function spawnReward(state, kind) {
    if (state.rewards.length >= 3) return;
    var col = (Math.random() * CONFIG.COLS) | 0;
    state.rewards.push({
      kind: kind,
      x: (col + 0.5) * CONFIG.CELL,
      y: CONFIG.BADGE_ROW * CONFIG.CELL,
      vy: CONFIG.BADGE_FALL_CELLS * CONFIG.CELL
    });
  }

  function catchReward(state, reward) {
    if (state.audio) state.audio.reward();
    if (reward.kind === 'cyan') {
      state.score += CONFIG.SCORE_BADGE;
      addBalls(state, CONFIG.MULTIBALL_ADD);
      state.safety = CONFIG.SAFETY_SECONDS;
      popup(state, state.paddle.x, state.paddle.y - 30, 'x3!');
    } else if (reward.kind === 'green') {
      if (state.lives < CONFIG.MAX_LIVES) state.lives++;
      popup(state, reward.x, reward.y, '+1');
    } else if (reward.kind === 'orange') {
      state.score += CONFIG.ORANGE_SCORE;
      popup(state, reward.x, reward.y, '+' + CONFIG.ORANGE_SCORE);
    } else if (reward.kind === 'pink') {
      state.wide = CONFIG.WIDE_SECONDS;
      popup(state, reward.x, reward.y, 'WIDE');
    } else if (reward.kind === 'star') {
      state.score += CONFIG.STAR_SCORE;
      addBalls(state, CONFIG.STAR_BALLS);
      state.safety = CONFIG.SAFETY_SECONDS;
      popup(state, reward.x, reward.y, 'STAR');
    }
  }

  function addBalls(state, count) {
    var made = 0;
    var origin = stuckOrPaddle(state);
    for (var i = 0; i < state.balls.length && made < count; i++) {
      var ball = state.balls[i];
      if (ball.active) continue;
      var t = count === 1 ? 0 : (made / (count - 1) - 0.5);
      var ang = -Math.PI / 2 + t * CONFIG.MULTIBALL_SPREAD_DEG * Math.PI / 180 * 2;
      ball.active = true;
      ball.launched = true;
      ball.r = state.ballR;
      ball.x = origin.x;
      ball.y = origin.y;
      ball.vx = Math.cos(ang) * state.speed;
      ball.vy = Math.sin(ang) * state.speed;
      made++;
    }
    state.launched = true;
  }

  function stuckOrPaddle(state) {
    return { x: state.paddle.x, y: stickY(state) };
  }

  function activeBalls(state) {
    var n = 0;
    for (var i = 0; i < state.balls.length; i++) if (state.balls[i].active) n++;
    return n;
  }

  function tap(state, x, y) {
    if (state.won || state.lost) return false;
    if (state.t < state.tapReady) return false;
    var c = Math.floor(x / CONFIG.CELL);
    var r = Math.floor(y / CONFIG.CELL);
    if (r < 0 || c < 0 || r >= CONFIG.FIELD_ROWS || c >= CONFIG.COLS) return false;
    var index = r * CONFIG.COLS + c;
    var type = state.grid[index];
    if (!state.launched && (isMouth(state, r, c) || isCapBrick(state, r, c))) {
      if (type === CELL.BRICK || type === CELL.BORDER || type === CELL.YELLOW) {
        state.grid[index] = CELL.OPEN;
        state.dirty.push(index);
        broke(state, index, type === CELL.YELLOW ? 'yellow' : 'brick');
      }
      launch(state);
      state.tapReady = state.t + CONFIG.TAP_COOLDOWN;
      return true;
    }
    if (type !== CELL.BRICK && type !== CELL.BORDER) {
      say(state, 'Tap a brick next to tunnel!');
      return false;
    }
    if (!nearTunnel(state, r, c)) {
      say(state, 'Tap a brick next to tunnel!');
      return false;
    }
    state.grid[index] = CELL.OPEN;
    state.hp[index] = 0;
    state.dirty.push(index);
    broke(state, index, 'brick');
    state.tapReady = state.t + CONFIG.TAP_COOLDOWN;
    return true;
  }

  function isMouth(state, r, c) {
    return r === CONFIG.FIELD_ROWS - 1 && state.grid[r * CONFIG.COLS + c] === CELL.OPEN;
  }

  function isCapBrick(state, r, c) {
    if (r !== CONFIG.FIELD_ROWS - 2) return false;
    var below = state.grid[(r + 1) * CONFIG.COLS + c];
    return below === CELL.OPEN;
  }

  function nearTunnel(state, r, c) {
    for (var rr = r - 1; rr <= r + 1; rr++) {
      for (var cc = c - 1; cc <= c + 1; cc++) {
        if (rr < 0 || cc < 0 || rr >= CONFIG.FIELD_ROWS || cc >= CONFIG.COLS) continue;
        var t = state.grid[rr * CONFIG.COLS + cc];
        if (t === CELL.OPEN || t === CELL.BORDER) return true;
      }
    }
    return false;
  }

  function say(state, text) {
    state.message = text;
    state.messageT = 1.4;
  }

  function step(state, dt) {
    if (state.won || state.lost) return;
    state.t += dt;
    state.dirty.length = 0;
    if (state.safety > 0) state.safety = Math.max(0, state.safety - dt);
    if (state.wide > 0) state.wide = Math.max(0, state.wide - dt);
    state.paddle.w = state.wide > 0 ? state.paddle.baseW * CONFIG.WIDE_SCALE : state.paddle.baseW;
    if (state.messageT > 0) state.messageT -= dt;
    if (!state.launched) {
      state.idle += dt;
      state.hint = state.idle >= CONFIG.HINT_DELAY;
      var stuck = stuckBall(state);
      if (stuck) {
        stuck.x = state.paddle.x;
        stuck.y = stickY(state);
      }
    } else state.hint = false;
    if (state.demo) driveDemo(state, dt);

    for (var i = 0; i < state.balls.length; i++) {
      var ball = state.balls[i];
      if (!ball.active || !ball.launched) continue;
      physics.integrateBall(ball, state, dt);
      physics.bouncePaddle(ball, state.paddle);
      var bar = safetyBar(state);
      physics.bounceSafety(ball, bar);
      if (ball.y < CONFIG.FIELD_ROWS * CONFIG.CELL) {
        var row = ball.y / CONFIG.CELL;
        if (row < state.bestRow) state.bestRow = row;
      }
      if (ball.y > CONFIG.CANVAS_H + ball.r) ball.active = false;
    }

    if (state.launched && activeBalls(state) === 0 && !state.won) {
      state.lives--;
      state.livesLost++;
      if (state.audio) state.audio.hurt();
      if (state.lives <= 0) {
        state.lost = true;
        if (state.audio) state.audio.lose();
      } else seat(state);
    }

    var fall = CONFIG.BADGE_FALL_CELLS * CONFIG.CELL;
    for (var r = state.rewards.length - 1; r >= 0; r--) {
      var reward = state.rewards[r];
      reward.y += fall * dt;
      var rr = CONFIG.BADGE_DIAMETER_CELLS * CONFIG.CELL * 0.5;
      if (Math.abs(reward.x - state.paddle.x) <= state.paddle.w / 2 + rr && Math.abs(reward.y - state.paddle.y) <= state.paddle.h / 2 + rr) {
        catchReward(state, reward);
        state.rewards.splice(r, 1);
      } else if (reward.y > CONFIG.CANVAS_H + 20) state.rewards.splice(r, 1);
    }
    state.rewardWait -= dt;
    if (state.rewardWait <= 0) {
      state.rewardWait = CONFIG.BADGE_SPAWN_INTERVAL;
      spawnReward(state, REWARD_KINDS[(Math.random() * REWARD_KINDS.length) | 0]);
    }

    for (var p = state.particles.length - 1; p >= 0; p--) {
      var bit = state.particles[p];
      bit.t -= dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      if (bit.t <= 0) state.particles.splice(p, 1);
    }
    for (var u = state.popups.length - 1; u >= 0; u--) {
      state.popups[u].t -= dt;
      state.popups[u].y -= 18 * dt;
      if (state.popups[u].t <= 0) state.popups.splice(u, 1);
    }
    if (state.combo > 0 && state.t - state.lastBreak > CONFIG.COMBO_WINDOW) state.combo = 0;
  }

  function safetyBar(state) {
    var w = CONFIG.CANVAS_W * CONFIG.SAFETY_WIDTH_RATIO;
    var y = cfgApi.safetyY();
    return {
      on: state.safety > 0,
      y: y,
      h: CONFIG.SAFETY_H_CELLS * CONFIG.CELL,
      x0: (CONFIG.CANVAS_W - w) / 2,
      x1: (CONFIG.CANVAS_W + w) / 2
    };
  }

  function driveDemo(state) {
    if (!state.launched) {
      movePaddle(state, state.paddle.x + CONFIG.LAUNCH_MOVE_PX + 1, true);
      return;
    }
    var ball = null;
    for (var i = 0; i < state.balls.length; i++) {
      var b = state.balls[i];
      if (!b.active || !b.launched) continue;
      if (!ball || b.y > ball.y) ball = b;
    }
    if (!ball) return;
    var mouth = nearestMouth(state, ball.x);
    var half = state.paddle.w / 2;
    if (ball.y > CONFIG.FIELD_ROWS * CONFIG.CELL) {
      var desired = Math.atan2((CONFIG.FIELD_ROWS - 0.5) * CONFIG.CELL - ball.y, mouth - ball.x);
      var fromUp = desired - (-Math.PI / 2);
      var max = CONFIG.PADDLE_MAX_ANGLE * Math.PI / 180;
      var offset = clamp(fromUp / max, -1, 1);
      movePaddle(state, ball.x - offset * half, false);
    } else {
      movePaddle(state, mouth, false);
    }
  }

  function tunnelPercent(state) {
    if (state.yellowTotal <= 0) return 100;
    var cleared = 1 - state.yellowLeft / state.yellowTotal;
    var goal = 8;
    for (var i = 0; i < state.level.grid.length; i++) {
      if (state.level.grid[i] === CELL.YELLOW) {
        var row = (i / CONFIG.COLS) | 0;
        if (row < goal) goal = row;
      }
    }
    var climb = (CONFIG.FIELD_ROWS - 1 - state.bestRow) / Math.max(1, CONFIG.FIELD_ROWS - 1 - goal);
    climb = clamp(climb, 0, 1);
    return Math.round(Math.max(cleared, climb * 0.85) * 100);
  }

  function snapshot(state) {
    var balls = 0;
    for (var i = 0; i < state.balls.length; i++) if (state.balls[i].active) balls++;
    var runs = levelsApi.mouths(state.level.grid);
    return {
      id: state.level.id,
      name: state.level.name,
      launched: state.launched,
      won: state.won,
      lost: state.lost,
      score: state.score,
      lives: state.lives,
      stars: state.stars || 0,
      combo: state.combo,
      yellowLeft: state.yellowLeft,
      balls: balls,
      safety: Math.ceil(state.safety),
      tunnel: tunnelPercent(state),
      hint: state.hint,
      mouths: runs,
      message: state.messageT > 0 ? state.message : ''
    };
  }

  function simulate(id, seconds) {
    var match = createMatch(levelsApi.buildLevel(id), { demo: true });
    var steps = Math.max(1, Math.round(seconds * 60));
    for (var i = 0; i < steps; i++) {
      match.step(1 / 60);
      if (match.state.won || match.state.lost) break;
    }
    return match.snapshot();
  }

  return {
    createMatch: createMatch,
    simulate: simulate,
    REWARD_KINDS: REWARD_KINDS
  };
});
