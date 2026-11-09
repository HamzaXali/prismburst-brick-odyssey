/*
 * PRISMBURST — Pixel Tunnel config.
 * Plain JS (this repo is Phaser + script tags, not TypeScript/Vite).
 * Every tunable is here so footage and the written spec can be adjusted
 * without hunting through the mode. See docs/pixel-tunnel/REFERENCE-ANALYSIS.md.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.PTConfig = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var CELL = {
    BRICK: 1,
    OPEN: 2,
    YELLOW: 3,
    BORDER: 4,
    ACCENT: 5
  };

  /* Footage wins where it was actually visible. Written Part 6 stays the
   * default only for values the clips never established (combo timing,
   * spawn row, fall speed, scores, lives, launch angle, win rule). */
  var CONFIG = {
    CANVAS_W: 400,
    /* 50*8 field is 400px, so 588px canvas puts the field at 68% of the height. */
    CANVAS_H: 588,
    CELL: 8,
    COLS: 50,
    FIELD_ROWS: 50,

    /* Thin flat orange bar. It sits in the lower band, just above the floor line. */
    PADDLE_W_CELLS: 11,
    PADDLE_H_CELLS: 0.42,
    /* Sits in the short band under the field, just above the safety line. */
    PADDLE_FROM_BOTTOM: 22,
    PADDLE_COLOR: '#FF6A3A',
    PADDLE_MAX_ANGLE: 55,

    /* Clips read as white dots about 0.6–0.8 of a cell. */
    BALL_DIAMETER_CELLS: 0.7,
    BALL_COLOR: '#FFFFFF',
    /* Phone test: 210 felt floaty. Clips are snappy. */
    BALL_SPEED: 680,
    /* Aim cone. Sign is chosen so the first shot points at a mouth. */
    LAUNCH_ANGLE: -65,
    LAUNCH_MOVE_PX: 4,
    HINT_DELAY: 3,

    LIVES: 3,
    MAX_LIVES: 6,
    SCORE_CELL: 10,
    SCORE_YELLOW: 100,
    SCORE_BADGE: 50,

    /* Combo timing was not on screen. Owner clock. */
    COMBO_WINDOW: 2.5,
    COMBO_MAX: 3,

    /* Spawn row, fall speed, and the 12s interval were not tracked.
     * Owner defaults. The +3 disc itself is visible in v07. */
    BADGE_ROW: 2,
    BADGE_FALL_CELLS: 6,
    BADGE_SPAWN_INTERVAL: 4.5,
    BADGE_DIAMETER_CELLS: 2,

    TAP_COOLDOWN: 0.15,
    TAP_RANGE_CELLS: 1,

    /* Clips fill the screen with hundreds of dots. One catch fires a stream. */
    MAX_BALLS: 420,
    MULTIBALL_ADD: 80,
    MULTIBALL_SPREAD_DEG: 26,

    /* Footage: temporary red/orange bar, nearly the full lower width.
     * Duration was not readable; 10s is the owner's reward length. */
    SAFETY_SECONDS: 10,
    SAFETY_COLOR: '#FF5C33',
    SAFETY_WIDTH_RATIO: 1,
    SAFETY_H_CELLS: 0.4,
    SAFETY_FROM_BOTTOM: 8,

    /* Lining is drawn, not a wall that kicks the ball back outside. */
    GRAY_BREAKABLE: true,
    BORDER_HITS: 1,

    /* Clips never state the win rule. Owner: clear every yellow target. */
    WIN_MODE: 'yellow',

    BORDER_COLOR: '#B5B5B5',
    BORDER_EDGE: '#6E6E6E',
    INTERIOR: '#141414',
    CAVITY: '#0C0C0C',
    TARGET_COLOR: '#FFD900',
    TARGET_PIP: '#FFF4A8',
    ACCENT_COLOR: '#ED2937',
    /* Hint pulse is neutral. Footage has no green mouth. */
    ENTRANCE_HINT_COLOR: '#F2F2F2',
    ROSE_ENABLED: true,
    ROSE_COLOR: '#944E56',
    OUTER_BORDER: '#333333',
    PLAYFIELD: '#101010',
    BG: '#080808',
    GAP_PX: 0,
    PARTICLE_POOL: 48,
    POPUP_LIFE: 0.42,
    POPUP_CAP: 3,
    SUBSTEP_PX: 4,

    /* Wide-paddle seconds for the pink drop. Effect is an assumption. */
    WIDE_SECONDS: 8,
    WIDE_SCALE: 1.35,
    STAR_SCORE: 80,
    STAR_BALLS: 4,
    ORANGE_SCORE: 30
  };

  function paddleY() {
    return CONFIG.CANVAS_H - CONFIG.PADDLE_FROM_BOTTOM;
  }

  function safetyY() {
    return CONFIG.CANVAS_H - CONFIG.SAFETY_FROM_BOTTOM;
  }

  return {
    CELL: CELL,
    CONFIG: CONFIG,
    paddleY: paddleY,
    safetyY: safetyY
  };
});
