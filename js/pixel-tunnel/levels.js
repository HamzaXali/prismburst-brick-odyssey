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
    paintRow(grid, pocket.topCap.row, pocket.topCap.c0, pocket.topCap.c1, CELL.GRAY);
    paintCol(grid, pocket.leftWall.col, pocket.leftWall.r0, pocket.leftWall.r1, CELL.GRAY);
    paintCol(grid, pocket.rightWall.col, pocket.rightWall.r0, pocket.rightWall.r1, CELL.GRAY);
    paintCol(grid, pocket.divider.col, pocket.divider.r0, pocket.divider.r1, CELL.GRAY);
    paintRow(grid, pocket.join.row, pocket.join.c0, pocket.join.c1, CELL.OPEN);
    paintCol(grid, pocket.leftPassage.col, pocket.leftPassage.r0, pocket.leftPassage.r1, CELL.OPEN);
    paintCol(grid, pocket.rightPassage.col, pocket.rightPassage.r0, pocket.rightPassage.r1, CELL.OPEN);
    grid[pocket.entrance.row * COLS + pocket.entrance.col] = CELL.OPEN;

    var drops = new Array(COLS * ROWS);
    for (i = 0; i < def.targets.length; i++) {
      var t = def.targets[i];
      var index = t.r * COLS + t.c;
      grid[index] = t.type;
      drops[index] = t.drop;
    }
    var destructible = 0;
    for (i = 0; i < grid.length; i++) if (canBreak(grid, i)) destructible++;
    return {
      id: def.id,
      name: def.name,
      field: def.field,
      pocket: pocket,
      targets: def.targets,
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
    count: function () { return LEVELS.length; }
  };
});
