/*
 * PRISMBURST — dense.js
 * Crystal Mass: a separate track of original micro-shard levels.
 * No network and no DOM. Campaign worlds stay 5 x 20.
 * Progress is save.dense. Old saves omit it and load unchanged.
 *
 * The field is a cell grid (not one sprite per shard). Every mass has a
 * steel border: solid left and right walls, and top and bottom bars with
 * openings wide enough for the ball. The ball enters, stays inside, and
 * chews the shards. Balls cap at 300; extras merge into the nearest live
 * ball. A mass is clear when every breakable cell is gone. Steel never counts.
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
  var FRAME = 3;
  var GAP = 28;
  var TOP_GAP_X = 16;
  var BOTTOM_GAPS = [14, 66, 118];
  var MIN_MOUTHS = 4;
  var WORLD_W = 720;
  var WORLD_H = 1280;
  var PHYS_TOP = 150;
  var PADDLE_Y = 1100;
  var PADDLE_H = 26;
  var PADDLE_W = 150;
  var BALL_SPEED = 540;
  var DROP_FALL = 340;
  var SIM_SECONDS = 120;
  var SIM_LIVES = 3;
  var SPLIT_CAP = 16;
  var DROPS = {
    bomb: 0.06,
    multi: 0.04,
    pierce: 0.035,
    wide: 0.02,
    coin: 0.02,
    caps: { bomb: 48, multi: 28, pierce: 24, wide: 12, coin: 8 },
    pierceSeconds: 8,
    wideSeconds: 14,
    wideScale: 1.62,
    bombRadius: 30
  };

  function borderFrame(g) {
    var t = FRAME;
    rect(g, 0, 0, t, ROWS, STEEL);
    rect(g, COLS - t, 0, t, ROWS, STEEL);
    rect(g, 0, 0, COLS, t, STEEL);
    rect(g, 0, ROWS - t, COLS, t, STEEL);
    rect(g, TOP_GAP_X, 0, GAP, t, 0);
    for (var i = 0; i < BOTTOM_GAPS.length; i++) rect(g, BOTTOM_GAPS[i], ROWS - t, GAP, t, 0);
  }

  function frameOk(g) {
    var t = FRAME;
    var r, k, c, y, i, x0, c2, y2;
    for (r = 0; r < ROWS; r++) {
      for (k = 0; k < t; k++) {
        if (g[r * COLS + k] !== STEEL) return false;
        if (g[r * COLS + (COLS - 1 - k)] !== STEEL) return false;
      }
    }
    for (c = TOP_GAP_X; c < TOP_GAP_X + GAP; c++) {
      for (y = 0; y < t; y++) if (g[y * COLS + c]) return false;
    }
    for (i = 0; i < BOTTOM_GAPS.length; i++) {
      x0 = BOTTOM_GAPS[i];
      for (c2 = x0; c2 < x0 + GAP; c2++) {
        for (y2 = ROWS - t; y2 < ROWS; y2++) if (g[y2 * COLS + c2]) return false;
      }
    }
    return GAP * CELL >= BALL_R * 2 + 8;
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
    runs(function (c) { return c < 0 ? COLS : c; });
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

  function worldX(index) { return OX + (index % COLS) * CELL + CELL / 2; }
  function worldY(index) { return OY + ((index / COLS) | 0) * CELL + CELL / 2; }

  function hitCell(grid, b, hit) {
    hit.pen = 0;
    hit.index = -1;
    var c0 = Math.floor((b.x - BALL_R - OX) / CELL);
    var c1 = Math.floor((b.x + BALL_R - OX) / CELL);
    var r0 = Math.floor((b.y - BALL_R - OY) / CELL);
    var r1 = Math.floor((b.y + BALL_R - OY) / CELL);
    if (c0 < 0) c0 = 0;
    if (r0 < 0) r0 = 0;
    if (c1 >= COLS) c1 = COLS - 1;
    if (r1 >= ROWS) r1 = ROWS - 1;
    if (c1 < c0 || r1 < r0) return false;
    for (var r = r0; r <= r1; r++) {
      var row = r * COLS;
      var top = OY + r * CELL;
      for (var c = c0; c <= c1; c++) {
        var kind = grid[row + c];
        if (!kind) continue;
        var left = OX + c * CELL;
        var cx = b.x < left ? left : (b.x > left + CELL ? left + CELL : b.x);
        var cy = b.y < top ? top : (b.y > top + CELL ? top + CELL : b.y);
        var dx = b.x - cx;
        var dy = b.y - cy;
        var d2 = dx * dx + dy * dy;
        if (d2 >= BALL_R * BALL_R) continue;
        var pen, nx, ny;
        if (d2 > 1e-4) {
          var dist = Math.sqrt(d2);
          nx = dx / dist;
          ny = dy / dist;
          pen = BALL_R - dist;
        } else {
          var ox = CELL / 2 + BALL_R - Math.abs(b.x - (left + CELL / 2));
          var oy = CELL / 2 + BALL_R - Math.abs(b.y - (top + CELL / 2));
          if (ox < oy) { nx = b.x < left + CELL / 2 ? -1 : 1; ny = 0; pen = ox; }
          else { nx = 0; ny = b.y < top + CELL / 2 ? -1 : 1; pen = oy; }
        }
        if (pen > hit.pen) {
          hit.pen = pen;
          hit.nx = nx;
          hit.ny = ny;
          hit.kind = kind;
          hit.index = row + c;
        }
      }
    }
    return hit.index >= 0;
  }

  function integrateBall(env, b, dt, onBreak) {
    var speed = env.speed;
    var n = Math.ceil((speed * dt) / 8);
    if (n < 1) n = 1;
    if (n > 4) n = 4;
    var sdt = dt / n;
    var p = env.paddle;
    var ptop = PADDLE_Y - PADDLE_H / 2;
    var hit = env.hit;
    var pierce = !!env.pierce;
    var grid = env.grid;
    for (var s = 0; s < n; s++) {
      if (!b.active) return false;
      b.x += b.vx * sdt;
      b.y += b.vy * sdt;
      if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
      else if (b.x > WORLD_W - BALL_R) { b.x = WORLD_W - BALL_R; b.vx = -Math.abs(b.vx); }
      if (b.y < PHYS_TOP + BALL_R) { b.y = PHYS_TOP + BALL_R; b.vy = Math.abs(b.vy); }
      if (b.vy > 0 && b.y + BALL_R >= ptop && b.y < PADDLE_Y + 8 && Math.abs(b.x - p.x) <= p.w / 2 + BALL_R) {
        var off = (b.x - p.x) / (p.w / 2);
        if (off < -1) off = -1;
        else if (off > 1) off = 1;
        var ang = off * 1.05;
        b.vx = Math.sin(ang) * speed;
        b.vy = -Math.cos(ang) * speed;
        b.y = ptop - BALL_R;
      }
      if (b.y > OY - BALL_R && b.y < OY + ROWS * CELL + BALL_R && hitCell(grid, b, hit)) {
        var steel = hit.kind === STEEL;
        if (pierce && !steel) {
          if (onBreak) onBreak(hit.index, hit.kind, worldX(hit.index), worldY(hit.index));
        } else {
          b.x += hit.nx * hit.pen;
          b.y += hit.ny * hit.pen;
          var dot = b.vx * hit.nx + b.vy * hit.ny;
          if (dot < 0) {
            b.vx -= 2 * dot * hit.nx;
            b.vy -= 2 * dot * hit.ny;
          }
          var len = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
          b.vx = b.vx / len * speed;
          b.vy = b.vy / len * speed;
          if (Math.abs(b.vy) < speed * 0.22) b.vy = (b.vy < 0 ? -1 : 1) * speed * 0.22;
          if (!steel && onBreak) onBreak(hit.index, hit.kind, worldX(hit.index), worldY(hit.index));
        }
      }
      if (b.y > WORLD_H + 30) {
        b.active = false;
        return false;
      }
    }
    return !!b.active;
  }

  function clearDisk(grid, x, y, radius, mark) {
    var cc = Math.floor((x - OX) / CELL);
    var rr = Math.floor((y - OY) / CELL);
    var r2 = radius * radius;
    var n = 0;
    var dy, dx, r, c, i, kind;
    for (dy = -radius; dy <= radius; dy++) {
      r = rr + dy;
      if (r < 0 || r >= ROWS) continue;
      for (dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        c = cc + dx;
        if (c < 0 || c >= COLS) continue;
        i = r * COLS + c;
        kind = grid[i];
        if (!kind || kind === STEEL || mark[i]) continue;
        mark[i] = 1;
        grid[i] = 0;
        n++;
      }
    }
    if (rr >= 0 && rr < ROWS) {
      var row = rr * COLS;
      for (c = 0; c < COLS; c++) {
        i = row + c;
        kind = grid[i];
        if (!kind || kind === STEEL || mark[i]) continue;
        mark[i] = 1;
        grid[i] = 0;
        n++;
      }
    }
    return n;
  }

  function detonate(state) {
    var mark = new Uint8Array(state.grid.length);
    var balls = state.balls;
    var n = 0;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b || !b.active) continue;
      n += clearDisk(state.grid, b.x, b.y, DROPS.bombRadius, mark);
    }
    if (n && state.breakableLeft != null) state.breakableLeft -= n;
    if (n && state.onClear) {
      for (var k = 0; k < mark.length; k++) if (mark[k]) state.onClear(k);
    }
    settleClear(state);
    return n;
  }

  function settleClear(state) {
    if (state.breakableLeft > 0) return;
    state.breakableLeft = 0;
    state.cleared = true;
    if (state.ended) return;
    state.ended = true;
    if (state.onWin) state.onWin();
  }

  function splitBalls(state) {
    var live = [];
    var balls = state.balls;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b && b.active && !b.attached) live.push(b);
    }
    if (!live.length) return 0;
    var target = Math.min(SPLIT_CAP, live.length * 3);
    var guard = 0;
    var made = 0;
    while (activeCount(balls) < target && guard < SPLIT_CAP) {
      var src = live[guard % live.length];
      var ang = guard % 2 === 0 ? 0.5 : -0.5;
      var cs = Math.cos(ang);
      var sn = Math.sin(ang);
      var res = addBall(balls, {
        x: src.x,
        y: src.y,
        vx: src.vx * cs - src.vy * sn,
        vy: src.vx * sn + src.vy * cs,
        attached: false
      }, BALL_CAP);
      if (!res.ok || res.merged) break;
      if (res.ball) res.ball.attached = false;
      made++;
      guard++;
    }
    return made;
  }

  function applyPower(state, kind) {
    if (kind === 'multi') splitBalls(state);
    else if (kind === 'pierce') state.pierceT = DROPS.pierceSeconds;
    else if (kind === 'wide') state.wideT = DROPS.wideSeconds;
    else if (kind === 'bomb') detonate(state);
  }

  function rollDrop(rng, budget) {
    var roll = rng();
    var order = ['bomb', 'multi', 'pierce', 'wide', 'coin'];
    var acc = 0;
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      acc += DROPS[key];
      if (roll < acc && budget[key] > 0) {
        budget[key]--;
        return key;
      }
    }
    return '';
  }

  function stepDrops(drops, paddle, dt, onCatch) {
    for (var d = 0; d < drops.length; d++) {
      var drop = drops[d];
      if (!drop || !drop.active) continue;
      drop.y += DROP_FALL * dt;
      if (drop.y > WORLD_H + 20) drop.active = false;
      else if (Math.abs(drop.y - PADDLE_Y) < 24 && Math.abs(drop.x - paddle.x) < paddle.w / 2 + 18) {
        if (onCatch) onCatch(drop);
      }
    }
  }

  function stepMatch(state, dt) {
    var p = state.paddle;
    if (state.bot && state.aim) p.tx = state.aim(state);
    if (state.bot) p.x = p.tx;
    else p.x += (p.tx - p.x) * Math.min(1, dt * 24);
    var half = p.w / 2;
    if (p.x < half) p.x = half;
    if (p.x > WORLD_W - half) p.x = WORLD_W - half;
    if (state.ended || state.paused) return;
    if (state.pierceT > 0) {
      state.pierceT -= dt;
      if (state.pierceT < 0) state.pierceT = 0;
    }
    if (state.wideT > 0) {
      state.wideT -= dt;
      if (state.wideT < 0) state.wideT = 0;
    }
    p.w = state.wideT > 0 ? PADDLE_W * DROPS.wideScale : (state.baseW || PADDLE_W);
    var env = {
      grid: state.grid,
      paddle: p,
      speed: state.speed,
      pierce: state.pierceT > 0,
      hit: state.hit
    };
    var alive = 0;
    var balls = state.balls;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b || !b.active) continue;
      if (b.attached) {
        b.x = p.x;
        b.y = PADDLE_Y - PADDLE_H / 2 - BALL_R;
        alive++;
        continue;
      }
      integrateBall(env, b, dt, state.onBreak);
      if (b.active) alive++;
    }
    stepDrops(state.drops, p, dt, state.onCatch);
    if (state.started && alive === 0 && !state.ended && state.onDead) state.onDead();
  }

  function gapCenter(cell) {
    return OX + (cell + GAP / 2) * CELL;
  }

  function foldX(land) {
    var span = WORLD_W - 2 * BALL_R;
    var u = (land - BALL_R) % (2 * span);
    if (u < 0) u += 2 * span;
    return BALL_R + (u > span ? 2 * span - u : u);
  }

  function nearestGapX(x) {
    var best = gapCenter(BOTTOM_GAPS[0]);
    var bestD = Math.abs(x - best);
    for (var i = 1; i < BOTTOM_GAPS.length; i++) {
      var gx = gapCenter(BOTTOM_GAPS[i]);
      var d = Math.abs(x - gx);
      if (d < bestD) { bestD = d; best = gx; }
    }
    return best;
  }

  function aimIntoGap(ballX, halfW, gapX) {
    var dy = (PADDLE_Y - PADDLE_H / 2 - BALL_R) - (OY + (ROWS - FRAME) * CELL);
    if (dy < 48) dy = 48;
    var ang = Math.atan2(gapX - ballX, dy);
    if (ang > 0.9) ang = 0.9;
    if (ang < -0.9) ang = -0.9;
    var px = ballX - (ang / 1.05) * halfW;
    var limit = halfW * 0.92;
    if (px < ballX - limit) px = ballX - limit;
    if (px > ballX + limit) px = ballX + limit;
    return px;
  }

  function aimPaddle(state) {
    var bestT = 1e9;
    var x = gapCenter(BOTTOM_GAPS[1]);
    var balls = state.balls;
    var lowest = null;
    var mouthY = OY + (ROWS - FRAME) * CELL;
    var halfW = (state.paddle.w || PADDLE_W) / 2;
    var i, b, t, land, gapX;
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (!b || !b.active || b.attached) continue;
      if (!lowest || b.y > lowest.y) lowest = b;
    }
    if (lowest && lowest.y < mouthY) state.aimedServe = false;
    if (lowest) {
      if (lowest.y >= mouthY && lowest.vy > 40) {
        if (!state.aimedServe) {
          state.serveGap = ((state.serveGap | 0) + 1) % BOTTOM_GAPS.length;
          state.aimedServe = true;
        }
        t = (PADDLE_Y - lowest.y) / lowest.vy;
        if (t < 0) t = 0;
        land = foldX(lowest.x + lowest.vx * Math.min(t, 0.5));
        gapX = gapCenter(BOTTOM_GAPS[state.serveGap]);
        x = aimIntoGap(land, halfW, gapX);
        bestT = t;
      } else if (lowest.y >= mouthY) {
        gapX = gapCenter(BOTTOM_GAPS[(state.serveGap | 0) % BOTTOM_GAPS.length]);
        x = aimIntoGap(lowest.x, halfW, gapX);
        bestT = 0.25;
      } else {
        x = nearestGapX(lowest.x);
        bestT = 0.75;
      }
    }
    var drops = state.drops;
    for (i = 0; i < drops.length; i++) {
      var drop = drops[i];
      if (!drop || !drop.active) continue;
      t = (PADDLE_Y - drop.y) / DROP_FALL;
      if (t >= 0 && t < bestT) { bestT = t; x = drop.x; }
    }
    return x;
  }

  function isCleared(g) {
    for (var i = 0; i < g.length; i++) if (g[i] && g[i] !== STEEL) return false;
    return true;
  }

  function countsForClear(kind) {
    return !!kind && kind !== STEEL;
  }

  function freshBudget() {
    return {
      bomb: DROPS.caps.bomb,
      multi: DROPS.caps.multi,
      pierce: DROPS.caps.pierce,
      wide: DROPS.caps.wide,
      coin: DROPS.caps.coin
    };
  }

  function breakFor(state, index) {
    var kind = state.grid[index];
    if (!kind || kind === STEEL) return;
    state.grid[index] = 0;
    if (state.breakableLeft != null) state.breakableLeft--;
    if (state.onShard) state.onShard(index);
    var kindDrop = rollDrop(function () { return state.rng(); }, state.budget);
    if (kindDrop) spawnDrop(state, kindDrop, worldX(index), worldY(index));
    settleClear(state);
  }

  function spawnDrop(state, kind, x, y) {
    var drops = state.drops;
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      if (d.active) continue;
      d.active = true;
      d.kind = kind;
      d.x = x;
      d.y = y;
      d.collected = false;
      d.value = kind === 'coin' ? COIN_VALUE : 0;
      return d;
    }
    return null;
  }

  function launchAttached(state) {
    var balls = state.balls;
    var any = false;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.active || !b.attached) continue;
      var ang = (state.rng() - 0.5) * 0.5;
      b.attached = false;
      b.vx = Math.sin(ang) * state.speed;
      b.vy = -Math.cos(ang) * state.speed;
      any = true;
    }
    if (any) state.started = true;
    return any;
  }

  function createMatch(index) {
    var lv = level(index);
    var state = {
      grid: new Uint8Array(lv.grid),
      balls: [],
      drops: [],
      paddle: { x: WORLD_W / 2, tx: WORLD_W / 2, w: PADDLE_W },
      baseW: PADDLE_W,
      speed: BALL_SPEED,
      seed: (index + 1) * 7919 + 13,
      budget: freshBudget(),
      breakableLeft: lv.breakable,
      ended: false,
      cleared: false,
      started: false,
      paused: false,
      bot: true,
      lives: SIM_LIVES,
      livesLost: 0,
      pierceT: 0,
      wideT: 0,
      serveGap: 0,
      aimedServe: false,
      hit: { pen: 0, nx: 0, ny: 0, kind: 0, index: -1 },
      aim: aimPaddle
    };
    state.rng = function () {
      state.seed = (state.seed * 1103515245 + 12345) >>> 0;
      return state.seed / 4294967296;
    };
    for (var d = 0; d < 24; d++) state.drops.push({ active: false, kind: '', x: 0, y: 0, collected: false, value: 0 });
    state.onBreak = function (cell) { breakFor(state, cell); };
    state.onCatch = function (drop) {
      if (!drop || !drop.active) return;
      drop.active = false;
      if (drop.kind === 'coin') { drop.collected = true; return; }
      if (drop.collected) return;
      drop.collected = true;
      applyPower(state, drop.kind);
    };
    state.onDead = function () {
      if (state.ended) return;
      state.lives--;
      state.livesLost++;
      if (state.lives <= 0) {
        state.lives = 0;
        state.ended = true;
        return;
      }
      state.started = false;
      var res = addBall(state.balls, {
        x: state.paddle.x,
        y: PADDLE_Y - PADDLE_H / 2 - BALL_R,
        vx: 0,
        vy: 0,
        attached: true
      }, BALL_CAP);
      if (res.ball) res.ball.attached = true;
    };
    addBall(state.balls, {
      x: state.paddle.x,
      y: PADDLE_Y - PADDLE_H / 2 - BALL_R,
      vx: 0,
      vy: 0,
      attached: true
    }, BALL_CAP);
    state.balls[0].attached = true;
    return state;
  }

  function playLevel(index) {
    var state = createMatch(index);
    var total = state.breakableLeft;
    var dt = 1 / 60;
    var maxSteps = SIM_SECONDS * 60;
    var steps = 0;
    var t0 = Date.now();
    while (!state.ended && state.breakableLeft > 0 && steps < maxSteps) {
      if (!state.started) launchAttached(state);
      stepMatch(state, dt);
      steps++;
    }
    var left = state.breakableLeft;
    return {
      index: index,
      total: total,
      left: left,
      removed: total - left,
      pct: total ? (total - left) / total : 1,
      cleared: left <= 0,
      seconds: steps / 60,
      steps: steps,
      ms: Date.now() - t0,
      livesLost: state.livesLost,
      livesLeft: state.lives
    };
  }

  function auditLevel(i) {
    var lv = level(i);
    var info = analyze(lv.grid);
    var sim = playLevel(i);
    var ok = info.total >= 2000
      && info.reached === info.total
      && info.mouths >= MIN_MOUTHS
      && frameOk(lv.grid)
      && info.steel > 0
      && sim.cleared
      && sim.seconds <= SIM_SECONDS
      && sim.livesLost < SIM_LIVES
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
      seconds: sim.seconds,
      ms: sim.ms,
      livesLost: sim.livesLost,
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
    borderFrame(g);
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
          slot.attached = !!ball.attached;
          return { ok: true, merged: false, count: n + 1, ball: slot };
        }
      }
      var spawned = { active: true, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, merged: 1, attached: !!ball.attached };
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
    FRAME: FRAME,
    GAP: GAP,
    MIN_MOUTHS: MIN_MOUTHS,
    DROPS: DROPS,
    PADDLE_W: PADDLE_W,
    PADDLE_Y: PADDLE_Y,
    PADDLE_H: PADDLE_H,
    BALL_SPEED: BALL_SPEED,
    SIM_SECONDS: SIM_SECONDS,
    SIM_LIVES: SIM_LIVES,
    level: level,
    signature: signature,
    analyze: analyze,
    frameOk: frameOk,
    playLevel: playLevel,
    stepMatch: stepMatch,
    integrateBall: integrateBall,
    applyPower: applyPower,
    rollDrop: rollDrop,
    freshBudget: freshBudget,
    breakShard: breakFor,
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
