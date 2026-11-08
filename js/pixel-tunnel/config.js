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
    CANVAS_H: 616,
    CELL: 8,
    COLS: 50,
    FIELD_ROWS: 50,

    /* Footage v07: paddle ~10 x 0.8 cells, about 16 cells under the field.
     * Written spec was 9.5 x 0.75 at row ~67.5. */
    PADDLE_W_CELLS: 10,
    PADDLE_H_CELLS: 0.8,
    PADDLE_CELLS_BELOW_FIELD: 16,
    PADDLE_COLOR: '#FF4B45',
    PADDLE_MAX_ANGLE: 60,

    /* Footage: white dot about 0.6–0.8 cell. Midpoint. */
    BALL_DIAMETER_CELLS: 0.7,
    BALL_COLOR: '#FFFFFF',
    /* Speed was not measurable in the 1 fps review. Owner value. */
    BALL_SPEED: 210,
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
    BADGE_FALL_CELLS: 3.5,
    BADGE_SPAWN_INTERVAL: 12,
    BADGE_DIAMETER_CELLS: 2.4,

    TAP_COOLDOWN: 0.15,
    TAP_RANGE_CELLS: 1,

    /* Footage shows far more than 12 balls, released near the paddle.
     * 64 is high enough to swarm and still cheap with a fixed pool. */
    MAX_BALLS: 64,
    MULTIBALL_ADD: 3,
    MULTIBALL_SPREAD_DEG: 28,

    /* Footage: temporary red/orange bar, nearly the full lower width.
     * Duration was not readable; 10s is the owner's reward length. */
    SAFETY_SECONDS: 10,
    SAFETY_COLOR: '#FF5A32',
    SAFETY_WIDTH_RATIO: 0.96,
    SAFETY_H_CELLS: 0.45,
    SAFETY_CELLS_FROM_BOTTOM: 3.2,

    /* Grey lining shrugs off one hit (owner GRAY_BREAKABLE false) but
     * repeated contacts chew it, which is what the clips show. */
    GRAY_BREAKABLE: false,
    BORDER_HITS: 3,

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
    GAP_PX: 1,
    PARTICLE_POOL: 80,
    SUBSTEP_PX: 2.5,

    /* Wide-paddle seconds for the pink drop. Effect is an assumption. */
    WIDE_SECONDS: 8,
    WIDE_SCALE: 1.35,
    STAR_SCORE: 80,
    STAR_BALLS: 4,
    ORANGE_SCORE: 30
  };

  function paddleY() {
    return (CONFIG.FIELD_ROWS + CONFIG.PADDLE_CELLS_BELOW_FIELD) * CONFIG.CELL;
  }

  function safetyY() {
    return CONFIG.CANVAS_H - CONFIG.SAFETY_CELLS_FROM_BOTTOM * CONFIG.CELL;
  }

  return {
    CELL: CELL,
    CONFIG: CONFIG,
    paddleY: paddleY,
    safetyY: safetyY
  };
});
