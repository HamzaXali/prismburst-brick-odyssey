/*
 * PRISMBURST — Pixel Tunnel config.
 * Values marked [?] in the video rebuild prompt live here and in
 * docs/pixel-tunnel/ASSUMPTIONS.md. Nothing in this file is a measured
 * fact unless the prompt marked it [C].
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
    OPEN: 0,
    OLIVE: 1,
    YELLOW: 2,
    RED: 3,
    GRAY: 4
  };

  var CONFIG = {
    CELL: 8,
    COLS: 50,
    ROWS: 50,
    /* Canvas is 52×86 cells: 1 cell margin, the field, 25 black rows, 9 band rows. */
    CANVAS_COLS: 52,
    CANVAS_ROWS: 86,
    FIELD_TOP: 1.5,
    BLACK_ROWS: 25,
    BOTTOM_ROWS: 9,
    MARGIN_COLS: 1,

    BALL_SPEED_CELLS: 37.3,
    BALL_DIAMETER_CELLS: 0.77,
    PADDLE_W_CELLS: 10,
    PADDLE_H_CELLS: 1,
    PADDLE_MAX_ANGLE: 60,
    PADDLE_BELOW_FIELD: 15.2,

    PICKUP_FALL_CELLS: 7.5,
    PICKUP_DIAMETER_CELLS: 2.4,
    SAFETY_BAR_SEC: 3.8,
    SAFETY_H_CELLS: 0.5,
    PLUS_BALLS: 3,
    MULTIPLY: 3,
    MAX_BALLS: 1000,
    SUBSTEPS: 2,

    /* [?] Chance an ordinary olive cell drops a pickup. */
    DROP_CHANCE: 0.02,
    /* [?] +3 is the most common. The rest share the remainder. */
    DROP_WEIGHTS: { plus3: 0.5, safety: 0.2, times3: 0.2, heart: 0.1 },

    /* pocket walls and the bottom row can break. The outer ring cannot. */
    GRAY_BREAKABLE: 'pocket+bottom',
    ROSE_BAR_MODE: 'ball-loss',
    /* [?] Hearts, and the rose bar, shrink when the last ball is lost. */
    LIVES: 5,
    /* [?] Clearing the destructible field always awards this many stars. */
    WIN_STARS: 3,
    /* [?] Score is not on screen in the prompt. */
    SCORE_CELL: 10,
    SCORE_TARGET: 100,

    ROSE_Y: 0.6,
    ROSE_H: 0.5,
    /* [?] Light gray under the rose bar. The video colour was not sampled. */
    PROGRESS_COLOR: '#C8C8C8',
    /* [?] 1px gap. No video file was attached, so this is a darker sample. */
    GAP_OLIVE: '#33350D',
    GAP_GRAY: '#4E4E4E',
    GAP_YELLOW: '#8A7610',
    GAP_RED: '#7A1014',
    STAR_COLOR: '#F0C84A',
    PANEL_COLOR: '#3A3A3A',
    CATCH_SEC: 0.18,

    COLORS: {
      field: '#5D6018',
      wall: '#7B7B7B',
      black: '#181818',
      frame: '#363636',
      paddle: '#F06366',
      rose: '#964B54',
      yellow: '#EACF18',
      red: '#E11E24',
      plus3: '#21C6DB',
      times3: '#B4D243',
      heart: '#F2A0B5',
      safetyOrb: '#EE9B45'
    }
  };

  function layout() {
    var cell = CONFIG.CELL;
    var fieldX = CONFIG.MARGIN_COLS * cell;
    var fieldY = CONFIG.FIELD_TOP * cell;
    var fieldW = CONFIG.COLS * cell;
    var fieldH = CONFIG.ROWS * cell;
    var blackTop = fieldY + fieldH;
    return {
      cell: cell,
      fieldX: fieldX,
      fieldY: fieldY,
      fieldW: fieldW,
      fieldH: fieldH,
      blackTop: blackTop,
      blackBottom: blackTop + CONFIG.BLACK_ROWS * cell,
      canvasW: CONFIG.CANVAS_COLS * cell,
      canvasH: CONFIG.CANVAS_ROWS * cell,
      paddleTop: blackTop + CONFIG.PADDLE_BELOW_FIELD * cell,
      paddleW: CONFIG.PADDLE_W_CELLS * cell,
      paddleH: CONFIG.PADDLE_H_CELLS * cell,
      speed: CONFIG.BALL_SPEED_CELLS * cell,
      ballR: CONFIG.BALL_DIAMETER_CELLS * cell * 0.5,
      pickupR: CONFIG.PICKUP_DIAMETER_CELLS * cell * 0.5,
      roseY: CONFIG.ROSE_Y * cell,
      roseH: CONFIG.ROSE_H * cell,
      safetyH: CONFIG.SAFETY_H_CELLS * cell
    };
  }

  return {
    CELL: CELL,
    CONFIG: CONFIG,
    layout: layout
  };
});
