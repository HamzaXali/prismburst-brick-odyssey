/*
 * PRISMBURST — Pixel Tunnel level 1.
 * One olive field and the gray starting pocket from the video rebuild.
 * Field colour, pocket, and targets are data so later levels can be added
 * without inventing them here.
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
  var CONFIG = cfgApi.CONFIG;
  var COLS = CONFIG.COLS;
  var ROWS = CONFIG.ROWS;

  /* Field cell coordinates. 0,0 is the top-left wall cell. */
  var LEVELS = [
    {
      id: 1,
      name: 'Level 1',
      field: CONFIG.COLORS.field,
      pocket: {
        topCap: { row: 39, c0: 12, c1: 16 },
        leftWall: { col: 12, r0: 39, r1: 48 },
        rightWall: { col: 16, r0: 39, r1: 48 },
        divider: { col: 14, r0: 41, r1: 48 },
        join: { row: 40, c0: 13, c1: 15 },
        leftPassage: { col: 13, r0: 41, r1: 48 },
        rightPassage: { col: 15, r0: 41, r1: 48 },
        entrance: { col: 13, row: 49 }
      },
      targets: [
        { c: 16, r: 43, type: CELL.YELLOW, drop: 'safety' },
        { c: 16, r: 44, type: CELL.YELLOW, drop: 'plus3' },
        { c: 16, r: 45, type: CELL.YELLOW, drop: 'times3' },
        { c: 17, r: 44, type: CELL.RED, drop: 'heart' }
      ]
    }
  ];

  function isOuterRing(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    if (r === 0) return true;
    if (c === 0 || c === COLS - 1) return true;
    return false;
  }

  function canBreak(grid, index) {
    var type = grid[index];
    if (type === CELL.GRAY) return false;
    if (type === CELL.OLIVE || type === CELL.YELLOW || type === CELL.RED) return true;
    return false;
  }

  function paintRow(grid, row, c0, c1, type) {
    var c;
    for (c = c0; c <= c1; c++) grid[row * COLS + c] = type;
  }

  function paintCol(grid, col, r0, r1, type) {
    var r;
    for (r = r0; r <= r1; r++) grid[r * COLS + col] = type;
  }

  function hexMix(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    function ch(v) {
      var x = (v * 0.28 + 196 * 0.72) | 0;
      var s = x.toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return '#' + ch(r) + ch(g) + ch(b);
  }

  function openAt(grid, c, r) {
    if (r === ROWS - 1) {
      if (c > 0 && c < COLS - 1) grid[r * COLS + c] = CELL.OPEN;
      return;
    }
    if (c <= 0 || r <= 0 || c >= COLS - 1 || r >= ROWS - 1) return;
    grid[r * COLS + c] = CELL.OPEN;
  }

  function mark(grid, drops, c, r, type, drop) {
    if (c <= 0 || r <= 0 || c >= COLS - 1 || r >= ROWS - 1) return;
    grid[r * COLS + c] = type;
    drops[r * COLS + c] = drop;
  }

  function span(grid, c, r0, r1) {
    var r, a = Math.min(r0, r1), b = Math.max(r0, r1);
    for (r = a; r <= b; r++) openAt(grid, c, r);
  }

  function box(grid, c0, c1, r0, r1) {
    var c, r, ca = Math.min(c0, c1), cb = Math.max(c0, c1);
    var ra = Math.min(r0, r1), rb = Math.max(r0, r1);
    for (r = ra; r <= rb; r++) for (c = ca; c <= cb; c++) openAt(grid, c, r);
  }

  function fit(col, width) {
    if (col < 2) col = 2;
    if (col + width >= COLS - 1) col = COLS - 2 - width;
    if (col < 2) col = 2;
    return col;
  }

  var STYLE_NAMES = [
    'Pine', 'Tide', 'Ember', 'Plum', 'Sand', 'Glacier', 'Moss', 'Copper', 'Iris', 'Cocoa',
    'Lagoon', 'Amber', 'Fern', 'Wine', 'Pebble', 'Coral', 'Kelp', 'Honey', 'Violet', 'Brick',
    'Oasis', 'Saffron', 'Spruce', 'Magenta', 'Flint', 'Aqua', 'Marigold', 'Ivy', 'Rose', 'Ash',
    'Teal', 'Gold', 'Clover', 'Berry', 'Mist', 'Sky', 'Apricot', 'Laurel', 'Grape', 'Rust',
    'Sea', 'Wheat', 'Jade', 'Crimson', 'Dune', 'Ink', 'Lilac', 'Cedar', 'Navy', 'Ochre'
  ];
  var STYLE_FIELDS = [
    '#1F7A4D', '#1C6B8A', '#C4512A', '#7A3E8C', '#C4A15A', '#4E88B5', '#3E7A32', '#B86A3A', '#5C4EAD', '#8A5A3A',
    '#1A8A78', '#D0892A', '#2F8A55', '#8E2E4A', '#6E7C86', '#E06A5C', '#2C6B52', '#E0B03A', '#6A4A9A', '#A34B3A',
    '#2A9A8A', '#E0A020', '#245C3A', '#C43A78', '#5C656C', '#2AA0B8', '#E09A28', '#3A7A28', '#D45A78', '#7A746C',
    '#1A7A7A', '#D4A017', '#4A9A3A', '#A33A58', '#8AA0A8', '#3A78C4', '#E08A48', '#4A7A32', '#7A4A88', '#B85A28',
    '#2A6A9A', '#D4C06A', '#2A8A62', '#C43838', '#C4A878', '#3A4A6A', '#B07AC4', '#6A4A2A', '#2A3A7A', '#C48A28'
  ];

  function carveStyle(grid, drops, n) {
    var i = n - 2;
    var kind = i % 10;
    var h = 6 + (i % 9);
    var w = 1 + ((i * 3) % 5);
    var bend = 2 + ((i * 5) % 7);
    var neck = 2 + (i % 6);
    var col = fit(3 + ((i * 4) % 28), Math.max(w, bend) + 4);
    var spur = 1 + (i % 8);
    var top = 48 - h;
    if (top < 2) top = 2;
    var k, c, r, arm;

    if (kind === 0) {
      span(grid, col, top, 49);
      for (k = 0; k < 2 + (i % 3); k++) mark(grid, drops, col + 1, top + 2 + k, CELL.YELLOW, k === 0 ? 'safety' : 'plus3');
      mark(grid, drops, col + 2, top + 2, CELL.RED, 'heart');
      box(grid, col + 1, col + spur, top + h - 2, top + h - 2);
    } else if (kind === 1) {
      span(grid, col, top, 49);
      span(grid, col + 2, top, 48);
      box(grid, col, col + 2, top, top);
      mark(grid, drops, col + 3, top + 2, CELL.YELLOW, 'safety');
      mark(grid, drops, col + 3, top + 3, CELL.YELLOW, 'plus3');
      mark(grid, drops, col + 3, top + 4, CELL.RED, 'heart');
      if (i % 2) box(grid, col - spur, col - 1, top + 1, top + 1);
      else box(grid, col + 3, col + 2 + spur, 48 - (i % 3), 48 - (i % 3));
    } else if (kind === 2) {
      box(grid, col, col + w + 1, top, 48);
      openAt(grid, col + ((i % 2) ? w : 0), 49);
      for (k = 0; k < w; k++) mark(grid, drops, col + k, top - 1, k === w - 1 ? CELL.RED : CELL.YELLOW, k === 0 ? 'safety' : 'plus3');
    } else if (kind === 3) {
      span(grid, col, 48 - neck, 49);
      box(grid, col, col + bend, 48 - neck, 48 - neck);
      span(grid, col + bend, 48 - neck - (2 + (i % 3)), 48 - neck);
      mark(grid, drops, col + bend + 1, 48 - neck - 1, CELL.YELLOW, 'safety');
      mark(grid, drops, col + bend + 1, 48 - neck, CELL.RED, 'heart');
      box(grid, col, col, 47, 47 - (i % 4));
    } else if (kind === 4) {
      span(grid, col, top + 3, 49);
      span(grid, col - bend, top, top + 3);
      span(grid, col + bend + 1, top + (i % 3), top + 3);
      box(grid, col - bend, col + bend + 1, top + 3, top + 3);
      mark(grid, drops, col - bend - 1, top + 1, CELL.YELLOW, 'plus3');
      mark(grid, drops, col + bend + 2, top + 1 + (i % 2), CELL.RED, 'heart');
    } else if (kind === 5) {
      c = col;
      r = 48;
      openAt(grid, c, 49);
      for (k = 0; k < 3 + (i % 4); k++) {
        box(grid, c, c + 1, r - 1, r);
        c += 2;
        r -= 2;
      }
      mark(grid, drops, c, r + 2, CELL.YELLOW, 'safety');
      mark(grid, drops, c, r + 3, CELL.RED, 'times3');
    } else if (kind === 6) {
      span(grid, col, 48 - neck, 49);
      box(grid, col - 1, col + w, top, 48 - neck);
      mark(grid, drops, col + w + 1, top + 1, CELL.YELLOW, 'safety');
      mark(grid, drops, col + w + 1, top + 2, CELL.YELLOW, 'plus3');
      mark(grid, drops, col - 2, top + 1 + (i % 2), CELL.RED, 'heart');
    } else if (kind === 7) {
      span(grid, col, top, 49);
      span(grid, col + bend, top + 2, 49);
      box(grid, col, col + bend, top, top);
      mark(grid, drops, col + 1, top - 1, CELL.YELLOW, 'safety');
      mark(grid, drops, col + bend - 1, top - 1, CELL.YELLOW, 'plus3');
      mark(grid, drops, col + bend + 1, top + 3, CELL.RED, 'heart');
    } else if (kind === 8) {
      arm = 2 + (i % 3);
      for (k = 0; k < arm; k++) span(grid, col + k * 2, top, 48);
      openAt(grid, col, 49);
      box(grid, col, col + (arm - 1) * 2, top, top);
      mark(grid, drops, col + 1, top + 2, CELL.YELLOW, 'safety');
      mark(grid, drops, col + 1, top + 3 + (i % 2), CELL.RED, 'heart');
    } else {
      span(grid, col, 48 - neck, 49);
      box(grid, col - w, col + w, top, 48 - neck - 1);
      wallSafe(grid, col, 48 - neck);
      mark(grid, drops, col + w + 1, top + 1, CELL.YELLOW, 'plus3');
      mark(grid, drops, col - w - 1, top + 2, CELL.YELLOW, 'safety');
      mark(grid, drops, col, top - 1, CELL.RED, 'heart');
      box(grid, col + 1, col + spur, 47, 47);
    }
    var armA = 1 + (i % 17);
    var armB = 1 + (i % 7);
    box(grid, col + 1, col + armA, 46, 46);
    box(grid, col + 1, col + armB, 44, 44);
  }

  function wallSafe(grid, c, r) {
    if (c <= 0 || r <= 0 || c >= COLS - 1 || r >= ROWS - 1) return;
    grid[r * COLS + c] = CELL.GRAY;
  }

  (function addStyles() {
    var n;
    for (n = 0; n < STYLE_NAMES.length; n++) {
      (function (index) {
        var field = STYLE_FIELDS[index];
        LEVELS.push({
          id: index + 2,
          name: STYLE_NAMES[index],
          field: field,
          wall: hexMix(field),
          carve: function (grid, drops) { carveStyle(grid, drops, index + 2); }
        });
      })(n);
    }
  })();

  function buildLevel(id) {
    var def = null;
    var i;
    for (i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) def = LEVELS[i];
    if (!def) def = LEVELS[0];
    var grid = new Uint8Array(COLS * ROWS);
    grid.fill(CELL.OLIVE);
    var c, r;
    for (c = 0; c < COLS; c++) {
      grid[c] = CELL.GRAY;
      grid[(ROWS - 1) * COLS + c] = CELL.GRAY;
    }
    for (r = 0; r < ROWS; r++) {
      grid[r * COLS] = CELL.GRAY;
      grid[r * COLS + COLS - 1] = CELL.GRAY;
    }
    var pocket = def.pocket;
    if (pocket) {
      paintRow(grid, pocket.topCap.row, pocket.topCap.c0, pocket.topCap.c1, CELL.GRAY);
      paintCol(grid, pocket.leftWall.col, pocket.leftWall.r0, pocket.leftWall.r1, CELL.GRAY);
      paintCol(grid, pocket.rightWall.col, pocket.rightWall.r0, pocket.rightWall.r1, CELL.GRAY);
      paintCol(grid, pocket.divider.col, pocket.divider.r0, pocket.divider.r1, CELL.GRAY);
      paintRow(grid, pocket.join.row, pocket.join.c0, pocket.join.c1, CELL.OPEN);
      paintCol(grid, pocket.leftPassage.col, pocket.leftPassage.r0, pocket.leftPassage.r1, CELL.OPEN);
      paintCol(grid, pocket.rightPassage.col, pocket.rightPassage.r0, pocket.rightPassage.r1, CELL.OPEN);
      grid[pocket.entrance.row * COLS + pocket.entrance.col] = CELL.OPEN;
    }

    var drops = new Array(COLS * ROWS);
    if (def.carve) def.carve(grid, drops);
    if (def.targets) {
      for (i = 0; i < def.targets.length; i++) {
        var t = def.targets[i];
        var index = t.r * COLS + t.c;
        grid[index] = t.type;
        drops[index] = t.drop;
      }
    }
    var destructible = 0;
    var entrance = pocket ? pocket.entrance.col : 13;
    for (i = 0; i < grid.length; i++) if (canBreak(grid, i)) destructible++;
    if (!pocket) {
      for (c = 1; c < COLS - 1; c++) {
        if (grid[(ROWS - 1) * COLS + c] === CELL.OPEN) { entrance = c; break; }
      }
    }
    return {
      id: def.id,
      name: def.name,
      field: def.field,
      wall: def.wall || '#7B7B7B',
      entrance: entrance,
      pocket: pocket,
      targets: def.targets || [],
      grid: grid,
      drops: drops,
      destructible: destructible
    };
  }

  return {
    LEVELS: LEVELS,
    buildLevel: buildLevel,
    isOuterRing: isOuterRing,
    canBreak: canBreak,
    count: function () { return LEVELS.length; },
    list: function () {
      var out = [];
      var i;
      for (i = 0; i < LEVELS.length; i++) {
        out.push({
          id: LEVELS[i].id,
          name: LEVELS[i].name,
          field: LEVELS[i].field,
          wall: LEVELS[i].wall || '#7B7B7B'
        });
      }
      return out;
    }
  };
});
