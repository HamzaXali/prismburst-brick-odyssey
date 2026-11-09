/*
 * PRISMBURST — Pixel Tunnel levels.
 * Forty original layouts for the owner's theme list. Geometry is not traced
 * from the reference clips. A level is solvable when every yellow target
 * touches the open tunnel that reaches a bottom mouth. Mouths are just open
 * cells; there is no green entrance and more than one mouth is allowed.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.PTLevels = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var cfgApi = null;
  if (typeof require === 'function') {
    try { cfgApi = require('./config.js'); } catch (e) { cfgApi = null; }
  }
  if (!cfgApi && typeof window !== 'undefined' && window.PB) cfgApi = window.PB.PTConfig;
  var CELL = cfgApi.CELL;
  var COLS = cfgApi.CONFIG.COLS;
  var ROWS = cfgApi.CONFIG.FIELD_ROWS;

  var THEMES = [
    [1, 'Zigzag', '#3A4FBE'],
    [2, 'Menorah', '#D3541A'],
    [3, 'Letter H', '#2E9B45'],
    [4, 'Letter M', '#C21884'],
    [5, 'Spiral', '#3A4FBE'],
    [6, 'Heart', '#C21884'],
    [7, 'Star', '#3A4FBE'],
    [8, 'U', '#2E9B45'],
    [9, 'S', '#D3541A'],
    [10, 'T', '#3A4FBE'],
    [11, 'E', '#2E9B45'],
    [12, 'A', '#C21884'],
    [13, 'R', '#D3541A'],
    [14, 'P', '#3A4FBE'],
    [15, 'L', '#2E9B45'],
    [16, 'C', '#C21884'],
    [17, 'Zigzag Double', '#3A4FBE'],
    [18, 'Maze 1', '#D3541A'],
    [19, 'Maze 2', '#2E9B45'],
    [20, 'Cross', '#3A4FBE'],
    [21, 'Diamond', '#C21884'],
    [22, 'Arrow Up', '#2E9B45'],
    [23, 'Staircase', '#D3541A'],
    [24, 'Wave', '#3A4FBE'],
    [25, 'Loop', '#2E9B45'],
    [26, 'Twin Zigzag', '#C21884'],
    [27, 'Menorah 2', '#D3541A'],
    [28, 'H Double', '#2E9B45'],
    [29, 'M Double', '#C21884'],
    [30, 'Crown', '#3A4FBE'],
    [31, 'Castle', '#D3541A'],
    [32, 'Tree', '#2E9B45'],
    [33, 'Rocket', '#3A4FBE'],
    [34, 'Key', '#C21884'],
    [35, 'Anchor', '#D3541A'],
    [36, 'Lightning', '#3A4FBE'],
    [37, 'Pyramid', '#2E9B45'],
    [38, 'Skull', '#C21884'],
    [39, 'Final Zigzag', '#3A4FBE'],
    [40, 'Master Maze', '#D3541A']
  ];

  function speedFor(id) {
    return Math.round((1 + (id - 1) * (0.6 / 39)) * 1000) / 1000;
  }

  /* Ops: V col r0 r1 (2 columns), H row c0 c1 (2 rows),
   * S r c steps dr dc (2x2 stairs), Y r c, A r c. */
  var OPS = {
    1: [
      ['V', 21, 38, 49], ['H', 38, 21, 30], ['V', 29, 26, 39],
      ['Y', 24, 29], ['Y', 25, 29], ['Y', 25, 30]
    ],
    2: [
      ['V', 24, 30, 49], ['H', 28, 8, 41],
      ['V', 8, 16, 29], ['V', 16, 16, 29], ['V', 30, 16, 29], ['V', 38, 16, 29],
      ['Y', 15, 8], ['Y', 15, 16], ['Y', 15, 30], ['Y', 15, 38],
      ['A', 10, 20], ['A', 10, 21], ['A', 10, 22], ['A', 10, 23], ['A', 10, 24],
      ['A', 10, 25], ['A', 10, 26], ['A', 10, 27], ['A', 10, 28]
    ],
    3: [
      ['V', 8, 14, 49], ['V', 36, 14, 49], ['H', 28, 8, 37],
      ['Y', 12, 36], ['Y', 12, 37], ['Y', 13, 37]
    ],
    4: [
      ['V', 24, 34, 49],
      ['S', 34, 22, 8, -2, -2],
      ['S', 34, 26, 8, -2, 2],
      ['Y', 18, 40], ['Y', 18, 41], ['Y', 19, 41]
    ],
    5: [
      ['V', 24, 40, 49], ['H', 40, 24, 42], ['V', 40, 18, 41],
      ['H', 18, 12, 42], ['V', 12, 18, 34], ['H', 32, 12, 32],
      ['V', 30, 24, 33],
      ['Y', 22, 30], ['Y', 22, 31], ['Y', 23, 31]
    ],
    6: [
      ['V', 24, 36, 49],
      ['H', 34, 12, 25], ['V', 12, 22, 35], ['H', 20, 12, 25],
      ['H', 18, 22, 28],
      ['H', 20, 26, 38], ['V', 34, 22, 39], ['H', 34, 26, 38],
      ['Y', 16, 24], ['Y', 16, 25], ['Y', 17, 25]
    ],
    7: [
      ['V', 24, 14, 49], ['H', 30, 8, 42],
      ['S', 30, 22, 4, -2, -2], ['S', 30, 26, 4, -2, 2],
      ['S', 32, 22, 3, 2, -2], ['S', 32, 26, 3, 2, 2],
      ['Y', 12, 24], ['Y', 12, 25], ['Y', 13, 24]
    ],
    8: [
      ['V', 10, 18, 49], ['H', 40, 10, 38], ['V', 36, 14, 41],
      ['Y', 12, 36], ['Y', 12, 37], ['Y', 13, 37]
    ],
    9: [
      ['V', 14, 40, 49], ['H', 38, 14, 36], ['V', 34, 26, 39],
      ['H', 24, 14, 36], ['V', 14, 14, 25], ['H', 12, 14, 34],
      ['Y', 11, 32], ['Y', 11, 33], ['Y', 11, 34]
    ],
    10: [
      ['V', 24, 16, 49], ['H', 16, 6, 40],
      ['Y', 16, 5], ['Y', 17, 4], ['Y', 17, 5]
    ],
    11: [
      ['V', 12, 14, 49], ['H', 14, 12, 36], ['H', 28, 12, 32], ['H', 42, 12, 36],
      ['Y', 42, 37], ['Y', 43, 36], ['Y', 43, 37]
    ],
    12: [
      ['V', 12, 34, 49],
      ['S', 34, 12, 12, -2, 1],
      ['S', 34, 36, 12, -2, -1],
      ['H', 26, 14, 34],
      ['Y', 8, 24], ['Y', 9, 23], ['Y', 9, 24]
    ],
    13: [
      ['V', 12, 14, 49], ['H', 14, 12, 32], ['V', 30, 16, 33],
      ['H', 28, 12, 30], ['S', 30, 30, 5, 2, 2],
      ['Y', 13, 30], ['Y', 13, 31], ['Y', 13, 32]
    ],
    14: [
      ['V', 14, 16, 49], ['H', 16, 14, 34], ['V', 32, 18, 35],
      ['Y', 15, 32], ['Y', 15, 33], ['Y', 15, 34]
    ],
    15: [
      ['V', 12, 16, 49], ['H', 44, 12, 36],
      ['Y', 14, 12], ['Y', 14, 13], ['Y', 15, 12]
    ],
    16: [
      ['V', 14, 16, 49], ['H', 16, 14, 36], ['H', 42, 14, 34],
      ['Y', 16, 37], ['Y', 17, 36], ['Y', 17, 37]
    ],
    17: [
      ['V', 16, 40, 49], ['H', 38, 16, 36], ['V', 32, 24, 39],
      ['H', 22, 14, 34], ['V', 14, 12, 23],
      ['Y', 11, 14], ['Y', 11, 15],
      ['Y', 37, 36], ['Y', 37, 35]
    ],
    18: [
      ['V', 20, 36, 49], ['H', 34, 20, 38], ['V', 36, 18, 35], ['H', 16, 14, 38],
      ['Y', 16, 12], ['Y', 17, 12], ['Y', 17, 13]
    ],
    19: [
      ['V', 16, 40, 49], ['H', 38, 16, 40], ['V', 38, 22, 41],
      ['H', 20, 10, 40], ['V', 10, 10, 21],
      ['Y', 8, 10], ['Y', 8, 11], ['Y', 9, 11]
    ],
    20: [
      ['V', 24, 16, 49], ['H', 30, 8, 42],
      ['H', 40, 26, 38],
      ['Y', 15, 24], ['Y', 15, 25],
      ['Y', 30, 7], ['Y', 31, 7],
      ['Y', 30, 43], ['Y', 31, 43],
      ['Y', 40, 39], ['Y', 41, 38]
    ],
    21: [
      ['V', 24, 34, 49],
      ['S', 34, 22, 6, -2, -2],
      ['S', 34, 26, 6, -2, 2],
      ['S', 22, 10, 4, -2, 2],
      ['Y', 12, 18], ['Y', 12, 19], ['Y', 13, 18]
    ],
    22: [
      ['V', 24, 14, 49],
      ['S', 24, 22, 4, -2, -2],
      ['S', 24, 26, 4, -2, 2],
      ['Y', 12, 24], ['Y', 12, 25], ['Y', 13, 24]
    ],
    23: [
      ['V', 8, 40, 49],
      ['H', 38, 8, 16], ['V', 14, 28, 39],
      ['H', 26, 14, 24], ['V', 22, 16, 27],
      ['H', 14, 22, 34], ['V', 32, 8, 15],
      ['Y', 6, 32], ['Y', 6, 33], ['Y', 7, 33]
    ],
    24: [
      ['V', 8, 42, 49], ['H', 40, 8, 18], ['V', 18, 30, 41],
      ['H', 28, 18, 32], ['V', 30, 16, 29], ['H', 14, 30, 42],
      ['V', 40, 8, 15],
      ['Y', 6, 40], ['Y', 6, 41], ['Y', 7, 41]
    ],
    25: [
      ['V', 24, 34, 49], ['H', 32, 12, 38], ['V', 36, 14, 33],
      ['H', 14, 12, 38], ['V', 12, 14, 32],
      ['H', 22, 14, 26],
      ['Y', 22, 27], ['Y', 23, 27], ['Y', 23, 28]
    ],
    26: [
      ['V', 10, 18, 49], ['V', 36, 18, 49], ['H', 42, 10, 37],
      ['H', 32, 10, 20], ['V', 18, 14, 33],
      ['H', 32, 28, 37], ['V', 34, 14, 33],
      ['Y', 13, 18], ['Y', 13, 19],
      ['Y', 13, 34], ['Y', 13, 35]
    ],
    27: [
      ['V', 24, 32, 49], ['H', 30, 6, 43],
      ['V', 6, 16, 31], ['V', 14, 16, 31], ['V', 24, 14, 31],
      ['V', 32, 16, 31], ['V', 40, 16, 31],
      ['Y', 15, 6], ['Y', 15, 14], ['Y', 13, 24], ['Y', 15, 32], ['Y', 15, 40]
    ],
    28: [
      ['V', 6, 16, 49], ['V', 18, 16, 49], ['H', 28, 6, 19],
      ['V', 30, 16, 49], ['V', 42, 16, 49], ['H', 28, 30, 43],
      ['Y', 15, 18], ['Y', 15, 19],
      ['Y', 15, 42], ['Y', 15, 43]
    ],
    29: [
      ['V', 16, 36, 49], ['S', 36, 14, 6, -2, -2], ['S', 36, 18, 6, -2, 2],
      ['V', 32, 36, 49], ['S', 36, 30, 6, -2, -2], ['S', 36, 34, 6, -2, 2],
      ['Y', 24, 30], ['Y', 24, 31],
      ['Y', 24, 46], ['Y', 24, 47]
    ],
    30: [
      ['H', 40, 8, 42], ['V', 24, 40, 49],
      ['V', 8, 18, 41], ['V', 22, 16, 41], ['V', 36, 18, 41],
      ['Y', 17, 8], ['Y', 17, 9],
      ['Y', 15, 22], ['Y', 15, 23],
      ['Y', 17, 36], ['Y', 17, 37]
    ],
    31: [
      ['H', 36, 8, 42], ['V', 24, 36, 49],
      ['V', 8, 24, 37], ['V', 22, 14, 37], ['V', 36, 24, 37],
      ['H', 28, 8, 12], ['H', 28, 36, 40],
      ['Y', 12, 22], ['Y', 12, 23], ['Y', 13, 23]
    ],
    32: [
      ['V', 24, 18, 49],
      ['H', 30, 8, 42],
      ['V', 8, 18, 31], ['V', 36, 18, 31],
      ['V', 22, 10, 31],
      ['Y', 9, 22], ['Y', 9, 23], ['Y', 9, 24]
    ],
    33: [
      ['V', 22, 24, 49], ['V', 26, 24, 49],
      ['V', 24, 14, 49],
      ['H', 40, 14, 34],
      ['S', 26, 20, 4, -2, -2], ['S', 26, 28, 4, -2, 2],
      ['Y', 12, 24], ['Y', 12, 25], ['Y', 13, 24]
    ],
    34: [
      ['V', 34, 20, 49], ['H', 18, 20, 36],
      ['V', 20, 12, 22], ['H', 12, 14, 24], ['V', 14, 12, 20], ['H', 20, 14, 22],
      ['Y', 12, 16], ['Y', 13, 15], ['Y', 14, 14]
    ],
    35: [
      ['V', 24, 16, 49], ['H', 18, 10, 40],
      ['S', 40, 20, 4, 2, -2], ['S', 40, 28, 4, 2, 2],
      ['Y', 14, 24], ['Y', 14, 25], ['Y', 15, 24]
    ],
    36: [
      ['V', 36, 40, 49],
      ['S', 40, 34, 5, -2, -2],
      ['S', 30, 24, 5, -3, -2],
      ['Y', 14, 14], ['Y', 14, 15], ['Y', 14, 16]
    ],
    37: [
      ['V', 24, 18, 49],
      ['H', 40, 14, 36], ['H', 32, 18, 32], ['H', 24, 20, 30],
      ['Y', 16, 24], ['Y', 16, 25], ['Y', 17, 24]
    ],
    38: [
      ['V', 24, 34, 49],
      ['H', 32, 12, 38], ['V', 36, 16, 33], ['H', 16, 12, 38], ['V', 12, 16, 32],
      ['H', 22, 14, 20], ['H', 22, 30, 36],
      ['H', 36, 16, 34],
      ['Y', 20, 18], ['Y', 21, 18],
      ['Y', 20, 32], ['Y', 21, 32]
    ],
    39: [
      ['V', 12, 42, 49], ['H', 40, 12, 24], ['V', 22, 28, 41],
      ['H', 26, 22, 36], ['V', 34, 16, 27], ['H', 14, 16, 40],
      ['V', 38, 8, 15],
      ['Y', 6, 38], ['Y', 6, 39], ['Y', 7, 38]
    ],
    40: [
      ['V', 8, 42, 49], ['H', 40, 8, 22], ['V', 20, 28, 41],
      ['H', 26, 20, 40], ['V', 38, 14, 27], ['H', 12, 10, 40],
      ['V', 10, 8, 13],
      ['Y', 7, 10], ['Y', 7, 11],
      ['Y', 26, 41], ['Y', 27, 41],
      ['Y', 36, 22], ['Y', 37, 22]
    ]
  };

  function carve(grid, r0, r1, c0, c1) {
    var ra = Math.min(r0, r1);
    var rb = Math.max(r0, r1);
    var ca = Math.min(c0, c1);
    var cb = Math.max(c0, c1);
    for (var r = ra; r <= rb; r++) {
      for (var c = ca; c <= cb; c++) {
        if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
        grid[r * COLS + c] = CELL.OPEN;
      }
    }
  }

  function paint(grid, r, c, type) {
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
    grid[r * COLS + c] = type;
    return true;
  }

  function applyOps(grid, ops) {
    var i, op, s, r, c;
    for (i = 0; i < ops.length; i++) {
      op = ops[i];
      if (op[0] === 'V') carve(grid, op[2], op[3], op[1], op[1] + 1);
      else if (op[0] === 'H') carve(grid, op[1], op[1] + 1, op[2], op[3]);
      else if (op[0] === 'S') {
        r = op[1];
        c = op[2];
        for (s = 0; s < op[3]; s++) {
          var nr = r + op[4];
          var nc = c + op[5];
          carve(grid, Math.min(r, nr), Math.max(r + 1, nr + 1), Math.min(c, nc), Math.max(c + 1, nc + 1));
          r = nr;
          c = nc;
        }
      }
    }
    for (i = 0; i < ops.length; i++) {
      op = ops[i];
      if (op[0] === 'Y') paint(grid, op[1], op[2], CELL.YELLOW);
      else if (op[0] === 'A') paint(grid, op[1], op[2], CELL.ACCENT);
    }
  }

  function lineBorder(grid) {
    var r, c, i, nr, nc, t, openNear;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        i = r * COLS + c;
        if (grid[i] !== CELL.BRICK) continue;
        openNear = false;
        for (t = 0; t < 4; t++) {
          nr = r + dirs[t][0];
          nc = c + dirs[t][1];
          if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
          if (grid[nr * COLS + nc] === CELL.OPEN) openNear = true;
        }
        if (openNear) grid[i] = CELL.BORDER;
      }
    }
  }

  function buildLevel(id) {
    var meta = null;
    var t;
    for (t = 0; t < THEMES.length; t++) if (THEMES[t][0] === id) meta = THEMES[t];
    var grid = new Uint8Array(COLS * ROWS);
    grid.fill(CELL.BRICK);
    applyOps(grid, OPS[id] || []);
    lineBorder(grid);
    return {
      id: id,
      name: meta ? meta[1] : ('Level ' + id),
      fieldColor: meta ? meta[2] : '#393F6B',
      speed: speedFor(id),
      grid: grid
    };
  }

  function buildAll() {
    var out = [];
    for (var id = 1; id <= 40; id++) out.push(buildLevel(id));
    return out;
  }

  function mouths(grid) {
    var runs = [];
    var c = 0;
    while (c < COLS) {
      if (grid[(ROWS - 1) * COLS + c] === CELL.OPEN) {
        var start = c;
        while (c < COLS && grid[(ROWS - 1) * COLS + c] === CELL.OPEN) c++;
        runs.push({ c0: start, c1: c - 1, width: c - start });
      } else c++;
    }
    return runs;
  }

  function neighbors(r, c) {
    return [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]];
  }

  function reachableYellow(grid) {
    var seen = new Uint8Array(COLS * ROWS);
    var q = [];
    var c, i, r, n, rr, cc;
    for (c = 0; c < COLS; c++) {
      i = (ROWS - 1) * COLS + c;
      if (grid[i] === CELL.OPEN) {
        seen[i] = 1;
        q.push(i);
      }
    }
    var qi = 0;
    while (qi < q.length) {
      i = q[qi++];
      r = (i / COLS) | 0;
      c = i % COLS;
      var nb = neighbors(r, c);
      for (n = 0; n < 4; n++) {
        rr = nb[n][0];
        cc = nb[n][1];
        if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
        var j = rr * COLS + cc;
        if (seen[j]) continue;
        if (grid[j] !== CELL.OPEN) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    var yellow = [];
    var missed = [];
    for (i = 0; i < grid.length; i++) {
      if (grid[i] !== CELL.YELLOW) continue;
      r = (i / COLS) | 0;
      c = i % COLS;
      yellow.push([r, c]);
      var ok = false;
      var touch = neighbors(r, c);
      for (n = 0; n < 4; n++) {
        rr = touch[n][0];
        cc = touch[n][1];
        if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
        if (seen[rr * COLS + cc]) ok = true;
      }
      if (!ok) {
        var yq = [[r, c]];
        var yseen = {};
        yseen[r + ',' + c] = 1;
        while (yq.length && !ok) {
          var cur = yq.pop();
          var around = neighbors(cur[0], cur[1]);
          for (n = 0; n < 4; n++) {
            rr = around[n][0];
            cc = around[n][1];
            if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
            if (seen[rr * COLS + cc]) ok = true;
            if (grid[rr * COLS + cc] === CELL.YELLOW && !yseen[rr + ',' + cc]) {
              yseen[rr + ',' + cc] = 1;
              yq.push([rr, cc]);
            }
          }
        }
      }
      if (!ok) missed.push([r, c]);
    }
    return { yellow: yellow, missed: missed, openVisited: q.length };
  }

  function hashGrid(grid) {
    var s = '';
    for (var i = 0; i < grid.length; i++) s += String.fromCharCode(grid[i] + 32);
    return s;
  }

  function validateLevel(level) {
    var errors = [];
    var grid = level.grid;
    if (!grid || grid.length !== COLS * ROWS) errors.push('grid size');
    var runs = mouths(grid);
    if (!runs.length) errors.push('no bottom mouth');
    for (var m = 0; m < runs.length; m++) {
      if (runs[m].width < 2) errors.push('mouth shorter than 2 at col ' + runs[m].c0);
    }
    var reach = reachableYellow(grid);
    if (!reach.yellow.length) errors.push('no yellow target');
    if (reach.missed.length) errors.push('unreachable yellow ' + JSON.stringify(reach.missed));
    var r, c, i, t;
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        i = r * COLS + c;
        t = grid[i];
        if ((r === 0 || c === 0 || c === COLS - 1) && t === CELL.OPEN) {
          errors.push('rim leak ' + r + ',' + c);
        }
      }
    }
    return { ok: errors.length === 0, errors: errors, mouths: runs, yellow: reach.yellow.length };
  }

  function validateAll(levels) {
    var list = levels || buildAll();
    var reports = [];
    var seen = {};
    var dup = [];
    for (var i = 0; i < list.length; i++) {
      var level = list[i];
      var report = validateLevel(level);
      report.id = level.id;
      report.name = level.name;
      reports.push(report);
      var h = hashGrid(level.grid);
      if (seen[h]) dup.push(level.id + ' matches ' + seen[h]);
      else seen[h] = level.id;
    }
    var ok = reports.every(function (r) { return r.ok; }) && dup.length === 0 && list.length === 40;
    return { ok: ok, reports: reports, duplicates: dup };
  }

  return {
    THEMES: THEMES,
    OPS: OPS,
    speedFor: speedFor,
    buildLevel: buildLevel,
    buildAll: buildAll,
    mouths: mouths,
    validateLevel: validateLevel,
    validateAll: validateAll,
    hashGrid: hashGrid
  };
});
