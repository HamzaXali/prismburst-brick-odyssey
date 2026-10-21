/*
 * PRISMBURST — dense.js
 * Crystal Mass: a separate track of original micro-shard levels.
 * No network and no DOM. Campaign worlds stay 5 x 20.
 * Progress is save.dense. Old saves omit it and load unchanged.
 *
 * The field is a cell grid (not one sprite per shard). Steel is a sparse
 * separator on later masses, with openings wide enough for the ball.
 * Early masses have no steel. Balls cap at 300; extras merge into the
 * nearest live ball instead of going past the cap. A mass is clear when
 * every breakable cell is gone. Steel never counts.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.Dense = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var plain = null;
  if (typeof require === 'function') {
    try { plain = require('./save-plain.js'); } catch (e) { plain = null; }
  }
  function plainApi() {
    if (plain) return plain;
    var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    return g.PB && g.PB.SavePlain || null;
  }

  var COLS = 160;
  var ROWS = 188;
  var CELL = 4;
  var OX = 40;
  var OY = 164;
  var COUNT = 20;
  var BALL_CAP = 300;
  var BALL_R = 7;
  var STEEL = 8;
  var COIN_VALUE = 2;
  var TRACK = 'Crystal Mass';
  var NAMES = [
    'Quartz Spines', 'Halo Gate', 'Facet Bloom', 'Nested Prism', 'Vein Maze',
    'Carved Core', 'Twin Keels', 'Iris Wheel', 'Offset Well', 'Tide Ribs',
    'Shard Cloister', 'Weave Lattice', 'Stacked Arches', 'Twin Cogs', 'Hollow Spire',
    'Garden Maze', 'Prism Aqueduct', 'Spiral Vault', 'Helix Tunnel', 'Crown Diamond'
  ];

  function isInt(n) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n;
  }

  function at(g, c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return 0;
    return g[r * COLS + c];
  }

  function put(g, c, r, v) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
    g[r * COLS + c] = v;
  }

  function rect(g, x, y, w, h, v) {
    var x0 = x < 0 ? 0 : x;
    var y0 = y < 0 ? 0 : y;
    var x1 = x + w; if (x1 > COLS) x1 = COLS;
    var y1 = y + h; if (y1 > ROWS) y1 = ROWS;
    for (var r = y0; r < y1; r++) {
      var row = r * COLS;
      for (var c = x0; c < x1; c++) g[row + c] = v;
    }
  }

  function ellipse(g, cx, cy, rx, ry, v) {
    if (rx < 1 || ry < 1) return;
    var y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    var x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    for (var y = y0; y <= y1; y++) {
      if (y < 0 || y >= ROWS) continue;
      var row = y * COLS;
      var dy = (y + 0.5 - cy) / ry;
      for (var x = x0; x <= x1; x++) {
        if (x < 0 || x >= COLS) continue;
        var dx = (x + 0.5 - cx) / rx;
        if (dx * dx + dy * dy <= 1) g[row + x] = v;
      }
    }
  }

  function diamond(g, cx, cy, rad, v) {
    for (var y = -rad; y <= rad; y++) {
      var span = rad - Math.abs(y);
      rect(g, cx - span, cy + y, span * 2 + 1, 1, v);
    }
  }

  function band(g, v1, v2) {
    for (var r = 0; r < ROWS; r++) {
      var row = r * COLS;
      for (var c = 0; c < COLS; c++) {
        var v = g[row + c];
        if (!v || v === STEEL) continue;
        g[row + c] = ((r >> 3) + (c >> 4)) & 1 ? v1 : v2;
      }
    }
  }

  function arch(g, cx, base, rx, ry, thick, v) {
    ellipse(g, cx, base, rx, ry, v);
    ellipse(g, cx, base, Math.max(1, rx - thick), Math.max(1, ry - thick), 0);
    rect(g, cx - rx, base, rx * 2 + 1, ry, 0);
  }

  function gear(g, cx, cy, rad, teeth, reach, v) {
    ellipse(g, cx, cy, rad, rad, v);
    for (var i = 0; i < teeth; i++) {
      var a = (i / teeth) * Math.PI * 2;
      ellipse(g, cx + Math.cos(a) * (rad + reach * 0.35), cy + Math.sin(a) * (rad + reach * 0.35), reach * 0.55, reach * 0.34, v);
    }
    ellipse(g, cx, cy, rad * 0.34, rad * 0.34, 0);
  }

  function maze(g, x0, y0, cols, rows, pitch, gap, seed, v) {
    rect(g, x0, y0, cols * pitch, rows * pitch, v);
    var seen = new Uint8Array(cols * rows);
    var stack = [0];
    seen[0] = 1;
    function rnd() { seed = (seed * 1103515245 + 12345) >>> 0; return seed; }
    function carveRoom(cx, cy) {
      rect(g, x0 + cx * pitch + 1, y0 + cy * pitch + 1, gap, gap, 0);
    }
    carveRoom(0, 0);
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var cx = cur % cols;
      var cy = (cur / cols) | 0;
      var opts = [];
      for (var d = 0; d < 4; d++) {
        var nx = cx + dirs[d][0], ny = cy + dirs[d][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[ny * cols + nx]) continue;
        opts.push(ny * cols + nx);
      }
      if (!opts.length) { stack.pop(); continue; }
      var pick = opts[rnd() % opts.length];
      var px = pick % cols, py = (pick / cols) | 0;
      var mx = x0 + Math.min(cx, px) * pitch + 1;
      var my = y0 + Math.min(cy, py) * pitch + 1;
      rect(g, mx, my, gap + Math.abs(px - cx) * pitch, gap + Math.abs(py - cy) * pitch, 0);
      seen[pick] = 1;
      stack.push(pick);
    }
  }

  function sineTunnel(g, amp, period, width, phase) {
    rect(g, 6, 8, COLS - 12, ROWS - 16, 1);
    for (var r = 10; r < ROWS - 6; r++) {
      var cx = (COLS / 2) + Math.sin(r / period + phase) * amp;
      var c0 = Math.round(cx - width / 2);
      rect(g, c0, r, width, 1, 0);
    }
  }

  function rectSpiral(g) {
    rect(g, 8, 8, COLS - 16, ROWS - 16, 2);
    var left = 14, top = 14, right = COLS - 15, bottom = ROWS - 15, dir = 0, guard = 0;
    while (right - left > 18 && bottom - top > 18 && guard++ < 40) {
      if (dir === 0) { rect(g, left, top, right - left, 6, 0); top += 14; }
      else if (dir === 1) { rect(g, right - 6, top, 6, bottom - top, 0); right -= 14; }
      else if (dir === 2) { rect(g, left, bottom - 6, right - left, 6, 0); bottom -= 14; }
      else { rect(g, left, top, 6, bottom - top, 0); left += 14; }
      dir = (dir + 1) & 3;
    }
  }

  function spines(g) {
    for (var i = 0; i < 7; i++) {
      var x = 6 + i * 22;
      rect(g, x, 8, 15, 168, i & 1 ? 1 : 2);
      rect(g, x, 8, 15, 4, 4);
    }
  }

  function halo(g) {
    arch(g, 80, 150, 68, 78, 16, 1);
    rect(g, 18, 120, 18, 56, 2);
    rect(g, 124, 108, 20, 68, 3);
    ellipse(g, 80, 78, 10, 10, 4);
  }

  function bloom(g) {
    diamond(g, 78, 96, 72, 3);
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2 + 0.2;
      ellipse(g, 82 + Math.cos(a) * 34, 96 + Math.sin(a) * 40, 26, 14, i & 1 ? 1 : 2);
    }
    ellipse(g, 82, 96, 16, 16, 4);
    ellipse(g, 82, 96, 7, 7, 0);
  }

  function nested(g) {
    for (var i = 0; i < 6; i++) {
      var m = 8 + i * 10;
      frame(g, m, 10 + i * 8, COLS - m * 2, ROWS - 24 - i * 14, 7, (i % 3) + 1);
      rect(g, (COLS >> 1) - 4, ROWS - 28 - i * 14, 8, 8, 0);
    }
  }

  function frame(g, x, y, w, h, t, v) {
    rect(g, x, y, w, t, v);
    rect(g, x, y + h - t, w, t, v);
    rect(g, x, y, t, h, v);
    rect(g, x + w - t, y, t, h, v);
  }

  function vein(g) {
    maze(g, 4, 6, 13, 15, 12, 6, 44021, 1);
    rect(g, 4, 6, 156, 6, 2);
  }

  function carved(g) { sineTunnel(g, 46, 16, 7, 0.4); }

  function keels(g) {
    for (var row = 0; row < 150; row++) {
      var span = 8 + ((row * 28) / 150) | 0;
      rect(g, 8, 12 + row, span, 1, 1);
      rect(g, COLS - 14 - span, 20 + (row * 0.92) | 0, span, 1, 2);
    }
    rect(g, 70, 40, 10, 120, 4);
  }

  function ringClear(g, cx, cy, rad, thick) {
    var outer = rad + thick * 0.5;
    var inner = rad - thick * 0.5;
    var y0 = Math.floor(cy - outer), y1 = Math.ceil(cy + outer);
    for (var y = y0; y <= y1; y++) {
      if (y < 0 || y >= ROWS) continue;
      for (var x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
        if (x < 0 || x >= COLS) continue;
        var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d >= inner && d <= outer) g[y * COLS + x] = 0;
      }
    }
  }

  function iris(g) {
    ellipse(g, 86, 100, 74, 70, 1);
    for (var i = 1; i <= 6; i++) {
      var rad = 12 + i * 9;
      ringClear(g, 86, 100, rad, 2.2);
      var a = i * 0.9;
      rect(g, 86 + Math.cos(a) * rad - 3, 100 + Math.sin(a) * rad - 3, 7, 7, 0);
    }
    ellipse(g, 86, 100, 6, 6, 0);
  }

  function well(g) {
    for (var i = 0; i < 5; i++) {
      var x = 10 + i * 6;
      var y = 12 + i * 10;
      frame(g, x, y, 120 - i * 8, 150 - i * 12, 6, (i % 3) + 1);
      rect(g, x + 6, y + 150 - i * 12 - 8, 10, 8, 0);
    }
  }

  function ribs(g) {
    var y = 8;
    var n = 0;
    while (y < ROWS - 12) {
      rect(g, 18, y, 136, 9, n & 1 ? 1 : 3);
      y += 14;
      n++;
    }
    rect(g, 4, 8, 8, ROWS - 16, 0);
  }

  function cloister(g) {
    for (var r = 0; r < 6; r++) {
      for (var c = 0; c < 5; c++) {
        var x = 8 + c * 30;
        var y = 8 + r * 28;
        frame(g, x, y, 26, 24, 5, ((r + c) & 1) ? 2 : 1);
        rect(g, x + 8, y + 19, 8, 5, 0);
      }
    }
  }

  function weave(g) {
    for (var i = -ROWS; i < COLS + ROWS; i += 10) {
      for (var r = 0; r < ROWS; r++) {
        var c = i + r;
        rect(g, c, r, 4, 1, 1);
        rect(g, i + (ROWS - r), r, 4, 1, 3);
      }
    }
  }

  function arches(g) {
    for (var i = 0; i < 4; i++) {
      arch(g, 70 + i * 8, 40 + i * 36, 58 - i * 4, 28, 8, (i % 3) + 1);
      rect(g, 16 + i * 6, 28 + i * 36, 12, 24, 4);
      rect(g, 112 + i * 4, 28 + i * 36, 14, 26, 2);
    }
  }

  function cogs(g) {
    gear(g, 52, 78, 28, 8, 14, 1);
    gear(g, 112, 118, 36, 11, 16, 3);
    rect(g, 52, 108, 60, 8, 4);
    ellipse(g, 52, 78, 6, 6, 0);
    ellipse(g, 112, 118, 8, 8, 0);
  }

  function spire(g) {
    frame(g, 28, 10, 104, 166, 18, 2);
    for (var i = 0; i < 5; i++) {
      var y = 28 + i * 28;
      rect(g, 46, y, 68, 6, i & 1 ? 1 : 4);
      if (i & 1) rect(g, 46, y, 14, 6, 0);
      else rect(g, 100, y, 14, 6, 0);
    }
    rect(g, 70, 158, 16, 18, 0);
  }

  function garden(g) {
    maze(g, 6, 8, 10, 12, 14, 6, 9901, 3);
    ellipse(g, 80, 96, 22, 18, 1);
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2;
      ellipse(g, 80 + Math.cos(a) * 16, 96 + Math.sin(a) * 14, 8, 6, 4);
    }
  }

  function aqueduct(g) {
    for (var i = 0; i < 5; i++) {
      var y = 16 + i * 32;
      arch(g, 80, y + 22, 64, 20, 7, i & 1 ? 1 : 2);
      rect(g, 14 + (i % 3) * 4, y, 12, 26, 4);
      rect(g, 132 - (i % 2) * 6, y, 12, 26, 3);
    }
  }

  function spiralVault(g) {
    diamond(g, 80, 100, 78, 2);
    for (var i = 0; i < 42; i++) {
      var a = i * 0.55;
      var rad = 8 + i * 1.45;
      ellipse(g, 80 + Math.cos(a) * rad, 100 + Math.sin(a) * rad * 0.8, 8, 6, i & 1 ? 1 : 4);
    }
    ellipse(g, 80, 100, 8, 8, 0);
  }

  function helix(g) { rectSpiral(g); }

  function crown(g) {
    diamond(g, 80, 108, 70, 1);
    rect(g, 74, 40, 12, 130, 0);
    rect(g, 20, 102, 120, 10, 0);
    rect(g, 73, 101, 14, 12, 4);
    for (var i = 0; i < 3; i++) rect(g, 48 + i * 22, 18, 10, 28, 3);
  }

  var BUILDERS = [spines, halo, bloom, nested, vein, carved, keels, iris, well, ribs, cloister, weave, arches, cogs, spire, garden, aqueduct, spiralVault, helix, crown];

  var ERODE = 2;
  var WIDE = 12;
  var MIN_MOUTHS = 1;
  var SIM_STEPS = 420;

  function accentSteel(g, i) {
    if (i < 5) return;
    var bands = i < 10 ? 1 : (i < 15 ? 2 : 3);
    var gap = WIDE + 4;
    for (var b = 0; b < bands; b++) {
      var y = 28 + b * 48;
      if (y < 8 || y >= ROWS - 24) continue;
      var hole = 18 + ((i * 17 + b * 23) % (COLS - gap - 36));
      for (var c = 8; c < COLS - 8; c++) {
        if (c >= hole && c < hole + gap) continue;
        g[y * COLS + c] = STEEL;
      }
    }
  }

  function dilateSteel(g) {
    var wall = new Uint8Array(g.length);
    for (var i = 0; i < g.length; i++) {
      if (g[i] !== STEEL) continue;
      var r = (i / COLS) | 0;
      var c = i - r * COLS;
      var r0 = r - ERODE; if (r0 < 0) r0 = 0;
      var r1 = r + ERODE; if (r1 >= ROWS) r1 = ROWS - 1;
      var c0 = c - ERODE; if (c0 < 0) c0 = 0;
      var c1 = c + ERODE; if (c1 >= COLS) c1 = COLS - 1;
      for (var rr = r0; rr <= r1; rr++) {
        var row = rr * COLS;
        for (var cc = c0; cc <= c1; cc++) wall[row + cc] = 1;
      }
    }
    return wall;
  }

  function floodPassable(wall) {
    var vis = new Uint8Array(wall.length);
    var q = new Int32Array(wall.length);
    var h = 0, t = 0;
    function push(i) {
      if (vis[i] || wall[i]) return;
      vis[i] = 1;
      q[t++] = i;
    }
    var base = (ROWS - 1) * COLS;
    for (var c = 0; c < COLS; c++) push(base + c);
    while (h < t) {
      var i = q[h++];
      var r = (i / COLS) | 0;
      var col = i - r * COLS;
      if (col > 0) push(i - 1);
      if (col + 1 < COLS) push(i + 1);
      if (r > 0) push(i - COLS);
      if (r + 1 < ROWS) push(i + COLS);
    }
    return vis;
  }

  function floodEmpty(grid, wall) {
    var vis = new Uint8Array(grid.length);
    var q = new Int32Array(grid.length);
    var h = 0, t = 0;
    function push(i) {
      if (vis[i] || wall[i] || grid[i]) return;
      vis[i] = 1;
      q[t++] = i;
    }
    var base = (ROWS - 1) * COLS;
    for (var c = 0; c < COLS; c++) push(base + c);
    while (h < t) {
      var i = q[h++];
      var r = (i / COLS) | 0;
      var col = i - r * COLS;
      if (col > 0) push(i - 1);
      if (col + 1 < COLS) push(i + 1);
      if (r > 0) push(i - COLS);
      if (r + 1 < ROWS) push(i + COLS);
    }
    return vis;
  }

  function cellReached(vis, i) {
    if (vis[i]) return true;
    var r = (i / COLS) | 0;
    var c = i - r * COLS;
    for (var dy = -ERODE; dy <= ERODE; dy++) {
      var rr = r + dy;
      if (rr < 0 || rr >= ROWS) continue;
      var row = rr * COLS;
      for (var dx = -ERODE; dx <= ERODE; dx++) {
        var cc = c + dx;
        if (cc < 0 || cc >= COLS) continue;
        if (vis[row + cc]) return true;
      }
    }
    return false;
  }

  function countMouths(wall) {
    var n = 0;
    function runs(at) {
      var run = 0;
      var last = at(-1);
      var len = last;
      for (var i = 0; i <= len; i++) {
        var open = i < len && !wall[at(i)];
        if (open) run++;
        else {
          if (run >= WIDE) n++;
          run = 0;
        }
      }
    }
    runs(function (c) { return c < 0 ? COLS : (ROWS - 1) * COLS + c; });
    runs(function (r) { return r < 0 ? ROWS : r * COLS; });
    runs(function (r) { return r < 0 ? ROWS : r * COLS + COLS - 1; });
    return n;
  }

  function analyze(g) {
    var wall = dilateSteel(g);
    var vis = floodPassable(wall);
    var total = 0;
    var reached = 0;
    var steel = 0;
    for (var i = 0; i < g.length; i++) {
      if (g[i] === STEEL) { steel++; continue; }
      if (!g[i]) continue;
      total++;
      if (cellReached(vis, i)) reached++;
    }
    return {
      total: total,
      reached: reached,
      steel: steel,
      mouths: countMouths(wall),
      wide: WIDE,
      erode: ERODE
    };
  }

  function nearBall(i, vis, grid, wall) {
    var r = (i / COLS) | 0;
    var c = i - r * COLS;
    if (ROWS - r <= ERODE) {
      var blocked = false;
      for (var rr = r + 1; rr < ROWS; rr++) {
        var below = rr * COLS + c;
        if (wall[below] || grid[below]) { blocked = true; break; }
      }
      if (!blocked) return true;
    }
    for (var dy = -ERODE; dy <= ERODE; dy++) {
      var rr2 = r + dy;
      if (rr2 < 0 || rr2 >= ROWS) continue;
      var row = rr2 * COLS;
      for (var dx = -ERODE; dx <= ERODE; dx++) {
        var cc = c + dx;
        if (cc < 0 || cc >= COLS) continue;
        if (vis[row + cc]) return true;
      }
    }
    return false;
  }

  function simulate(g) {
    var wall = dilateSteel(g);
    var grid = new Uint8Array(g);
    var vis = floodEmpty(grid, wall);
    var total = 0;
    for (var n = 0; n < grid.length; n++) if (grid[n] && grid[n] !== STEEL) total++;
    var left = total;
    var steps = 0;
    var t0 = Date.now();
    while (left > 0 && steps < SIM_STEPS) {
      var waves = (steps % 6 === 5) ? 3 : 1;
      var progressed = false;
      for (var w = 0; w < waves && left > 0; w++) {
        var hit = [];
        for (var i = 0; i < grid.length; i++) {
          if (!grid[i] || grid[i] === STEEL) continue;
          if (nearBall(i, vis, grid, wall)) hit.push(i);
        }
        if (!hit.length) break;
        progressed = true;
        for (var h = 0; h < hit.length; h++) {
          grid[hit[h]] = 0;
          left--;
        }
        vis = floodEmpty(grid, wall);
      }
      steps++;
      if (!progressed) break;
    }
    var ms = Date.now() - t0;
    return {
      total: total,
      removed: total - left,
      pct: total ? (total - left) / total : 1,
      steps: steps,
      ms: ms
    };
  }

  function isCleared(g) {
    for (var i = 0; i < g.length; i++) if (g[i] && g[i] !== STEEL) return false;
    return true;
  }

  function countsForClear(kind) {
    return !!kind && kind !== STEEL;
  }

  function auditLevel(i) {
    var lv = level(i);
    var info = analyze(lv.grid);
    var sim = simulate(lv.grid);
    var early = i < 5;
    var ok = info.total >= 2000
      && info.reached === info.total
      && info.mouths >= MIN_MOUTHS
      && sim.pct >= 0.95
      && sim.steps <= SIM_STEPS
      && (early ? info.steel === 0 : info.steel > 0)
      && isCleared(clearedGrid(lv.grid));
    return {
      index: i,
      name: lv.name,
      breakable: info.total,
      steel: info.steel,
      reached: info.reached,
      mouths: info.mouths,
      pct: sim.pct,
      steps: sim.steps,
      ms: sim.ms,
      ok: ok
    };
  }

  function clearedGrid(g) {
    var copy = new Uint8Array(g);
    for (var i = 0; i < copy.length; i++) if (copy[i] !== STEEL) copy[i] = 0;
    return copy;
  }

  function auditAll() {
    var rows = [];
    var errors = [];
    for (var i = 0; i < COUNT; i++) {
      var row = auditLevel(i);
      rows.push(row);
      if (!row.ok) errors.push(row.name + ' reached ' + row.reached + '/' + row.breakable + ' steel ' + row.steel + ' mouths ' + row.mouths + ' clear ' + Math.round(row.pct * 1000) / 10 + '%');
    }
    return { ok: errors.length === 0, rows: rows, errors: errors };
  }

  function signature(g) {
    var minR = ROWS, maxR = -1, minC = COLS, maxC = -1;
    for (var r = 0; r < ROWS; r++) {
      var row = r * COLS;
      for (var c = 0; c < COLS; c++) {
        if (!g[row + c]) continue;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
    if (maxR < 0) return '';
    function pack(flipH, flipV) {
      var lines = [];
      for (var y = minR; y <= maxR; y++) {
        var s = '';
        var rr = flipV ? (minR + maxR - y) : y;
        for (var x = minC; x <= maxC; x++) {
          var cc = flipH ? (minC + maxC - x) : x;
          var v = g[rr * COLS + cc];
          s += v === 0 ? '.' : (v === STEEL ? 'S' : '#');
        }
        lines.push(s);
      }
      return lines.join('/');
    }
    var packs = [pack(false, false), pack(true, false), pack(false, true), pack(true, true)];
    packs.sort();
    return packs[0];
  }

  var cache = new Array(COUNT);

  function build(i) {
    var g = new Uint8Array(COLS * ROWS);
    BUILDERS[i](g);
    band(g, (i % 3) + 1, ((i + 1) % 3) + 1);
    accentSteel(g, i);
    var breakable = 0, steel = 0;
    for (var n = 0; n < g.length; n++) {
      if (g[n] === STEEL) steel++;
      else if (g[n]) breakable++;
    }
    return {
      index: i,
      name: NAMES[i],
      grid: g,
      breakable: breakable,
      steel: steel,
      star3: breakable * 14,
      signature: signature(g)
    };
  }

  function level(i) {
    i = i | 0;
    if (i < 0 || i >= COUNT) return null;
    if (!cache[i]) cache[i] = build(i);
    return cache[i];
  }

  function defaultDense() {
    return { v: 1, unlocked: 1, levels: {} };
  }

  function finishDense(out, raw) {
  var api = plainApi();
  if (!api || !raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  var src = {};
  Object.keys(raw).forEach(function (key) { src[key] = raw[key]; });
  if (raw.levels && typeof raw.levels === 'object' && out.levels) {
    var levels = {};
    Object.keys(raw.levels).forEach(function (key) {
      if (/^\d+$/.test(key) && !out.levels[key]) return;
      levels[key] = raw.levels[key];
    });
    src.levels = levels;
  }
  var kept = api.absorb(out, src, 0);
  return kept.ok ? out : defaultDense();
}

  function normalize(raw) {
    var out = defaultDense();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    var unlocked = isInt(raw.unlocked) ? raw.unlocked : 1;
    if (unlocked < 1) unlocked = 1;
    if (unlocked > COUNT) unlocked = COUNT;
    out.unlocked = unlocked;
    var levels = raw.levels;
    if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return finishDense(out, raw);
    Object.keys(levels).forEach(function (key) {
      if (!/^\d+$/.test(key)) return;
      var id = +key;
      if (id < 0 || id >= COUNT) return;
      var rec = levels[key];
      if (!rec || typeof rec !== 'object') return;
      var best = isInt(rec.best) && rec.best > 0 ? rec.best : 0;
      var stars = isInt(rec.stars) ? rec.stars : 0;
      if (stars < 0) stars = 0;
      if (stars > 3) stars = 3;
      if (best || stars) out.levels[String(id)] = { best: best, stars: stars };
    });
    return finishDense(out, raw);
  }

  function validate(raw) {
    if (raw == null) return { ok: true, dense: defaultDense() };
    if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'dense is invalid' };
    var api = plainApi();
    if (api) {
      var checked = api.copyValue(raw, 0);
      if (!checked.ok) return { ok: false, error: checked.error };
      raw = checked.value;
    }
    if (raw.v !== 1) return { ok: false, error: 'dense is invalid' };
    if (!isInt(raw.unlocked) || raw.unlocked < 1 || raw.unlocked > COUNT) return { ok: false, error: 'dense is invalid' };
    if (!raw.levels || typeof raw.levels !== 'object' || Array.isArray(raw.levels)) return { ok: false, error: 'dense is invalid' };
    var keys = Object.keys(raw.levels);
    var idCount = 0;
    for (var c = 0; c < keys.length; c++) if (/^\d+$/.test(keys[c]) && +keys[c] < COUNT) idCount++;
    if (idCount > COUNT) return { ok: false, error: 'dense is invalid' };
    var levels = {};
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (!/^\d+$/.test(key)) continue;
      if (+key >= COUNT) return { ok: false, error: 'dense is invalid' };
      var rec = raw.levels[key];
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return { ok: false, error: 'dense is invalid' };
      if (!isInt(rec.best) || rec.best < 0 || rec.best > 1e15) return { ok: false, error: 'dense is invalid' };
      if (!isInt(rec.stars) || rec.stars < 0 || rec.stars > 3) return { ok: false, error: 'dense is invalid' };
      levels[String(+key)] = { best: rec.best, stars: rec.stars };
    }
    return { ok: true, dense: finishDense({ v: 1, unlocked: raw.unlocked, levels: levels }, raw) };
  }

  function ensure(data) {
    if (!data || typeof data !== 'object') return defaultDense();
    if (data.dense == null) data.dense = defaultDense();
    else data.dense = normalize(data.dense);
    return data.dense;
  }

  function merge(a, b) {
    var la = normalize(a), lb = normalize(b);
    var levels = {};
    function take(src) {
      Object.keys(src.levels).forEach(function (key) {
        var rec = src.levels[key];
        var prev = levels[key] || { best: 0, stars: 0 };
        levels[key] = { best: Math.max(prev.best, rec.best), stars: Math.max(prev.stars, rec.stars) };
      });
    }
    take(la); take(lb);
    return { v: 1, unlocked: Math.max(la.unlocked, lb.unlocked), levels: levels };
  }

  function hasProgress(raw) {
    var d = normalize(raw);
    if (d.unlocked > 1) return true;
    return Object.keys(d.levels).length > 0;
  }

  function recordClear(data, index, score, stars) {
    var d = ensure(data);
    index = index | 0;
    if (index < 0 || index >= COUNT) return { ok: false, coins: data.coins | 0, added: 0 };
    var key = String(index);
    var rec = d.levels[key];
    var first = !rec;
    if (!rec) rec = d.levels[key] = { best: 0, stars: 0 };
    var sc = score | 0; if (sc < 0) sc = 0;
    var st = stars | 0; if (st < 1) st = 1; if (st > 3) st = 3;
    rec.best = Math.max(rec.best | 0, sc);
    rec.stars = Math.max(rec.stars | 0, st);
    if (d.unlocked < index + 2 && index + 1 < COUNT) d.unlocked = index + 2;
    if (d.unlocked < 1) d.unlocked = 1;
    var added = 15 + st * 5 + (first ? 20 : 0);
    var next = (data.coins | 0) + added;
    if (next < 0) return { ok: false, coins: data.coins | 0, added: 0 };
    data.coins = next;
    return { ok: true, first: first, coins: next, added: added, best: rec.best, stars: rec.stars };
  }

  function collectCoin(wallet, drop) {
    var coins = wallet && isInt(wallet.coins) ? wallet.coins : 0;
    if (!drop || drop.kind !== 'coin') return { ok: false, reason: 'kind', coins: coins, added: 0 };
    if (drop.collected) return { ok: false, reason: 'once', coins: coins, added: 0 };
    var value = drop.value | 0;
    if (value <= 0) return { ok: false, reason: 'value', coins: coins, added: 0 };
    var next = coins + value;
    if (next < 0 || next > 1000000000) return { ok: false, reason: 'range', coins: coins, added: 0 };
    drop.collected = true;
    if (wallet) wallet.coins = next;
    return { ok: true, coins: next, added: value };
  }

  function activeCount(list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].active) n++;
    return n;
  }

  function addBall(list, ball, cap) {
    cap = cap || BALL_CAP;
    var n = activeCount(list);
    if (n < cap) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && !list[i].active) {
          var slot = list[i];
          slot.active = true;
          slot.x = ball.x; slot.y = ball.y; slot.vx = ball.vx; slot.vy = ball.vy;
          slot.merged = 1;
          return { ok: true, merged: false, count: n + 1, ball: slot };
        }
      }
      var spawned = { active: true, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, merged: 1 };
      list.push(spawned);
      return { ok: true, merged: false, count: n + 1, ball: spawned };
    }
    var best = null, bestD = 1e18;
    for (var j = 0; j < list.length; j++) {
      var b = list[j];
      if (!b || !b.active) continue;
      var dx = b.x - ball.x, dy = b.y - ball.y, dist = dx * dx + dy * dy;
      if (dist < bestD) { bestD = dist; best = b; }
    }
    if (!best) return { ok: false, merged: false, count: n };
    best.vx = best.vx * 0.65 + ball.vx * 0.35;
    best.vy = best.vy * 0.65 + ball.vy * 0.35;
    best.merged = (best.merged | 0) + 1;
    return { ok: true, merged: true, count: n, ball: best };
  }

  return {
    COLS: COLS,
    ROWS: ROWS,
    CELL: CELL,
    OX: OX,
    OY: OY,
    COUNT: COUNT,
    BALL_CAP: BALL_CAP,
    BALL_R: BALL_R,
    STEEL: STEEL,
    COIN_VALUE: COIN_VALUE,
    TRACK: TRACK,
    NAMES: NAMES,
    ERODE: ERODE,
    WIDE: WIDE,
    MIN_MOUTHS: MIN_MOUTHS,
    level: level,
    signature: signature,
    analyze: analyze,
    simulate: simulate,
    isCleared: isCleared,
    countsForClear: countsForClear,
    auditAll: auditAll,
    defaultDense: defaultDense,
    normalize: normalize,
    validate: validate,
    ensure: ensure,
    merge: merge,
    hasProgress: hasProgress,
    recordClear: recordClear,
    collectCoin: collectCoin,
    addBall: addBall,
    activeCount: activeCount
  };
});
