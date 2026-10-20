/*
 * PRISMBURST — BRICK ODYSSEY
 * levels.js — world data, hand-authored level templates and a deterministic
 * level generator. Works in the browser (window.PB_LEVELS) and in Node
 * (module.exports) so scripts/validate-levels.js can check every level.
 *
 * GRID LEGEND (12 columns per row, max 16 rows)
 *   .  empty            1-4  crystal brick with that many hit points
 *   S  steel (indestructible, never required for completion)
 *   X  explosive (1 HP, damages the 8 neighbours when it breaks)
 *   M  moving brick (1 HP)      N  moving brick (2 HP)
 *   R  regenerating crystal (3 HP, heals 1 HP if left alone for a few seconds)
 *   P  prize brick (1 HP, always drops a power-up)
 *   T  target core (2 HP, used by the "targets" objective)
 *
 * Rows that contain M/N must contain only M, N and '.', so the moving band
 * never overlaps other bricks.
 *
 * OBJECTIVES
 *   clear   – break every breakable brick
 *   score   – reach a score target (target is always below the score you get
 *             just by clearing the level, and clearing also wins)
 *   time    – clear every breakable brick before a (generous) time limit
 *   targets – break every T core
 *
 * ADDING A WORLD: push another object into WORLDS (name, palette, hand levels).
 * The generator fills any level index that has no hand-authored template.
 */
(function (root) {
  'use strict';

  var COLS = 12;
  var MAX_ROWS = 16;
  var LEVELS_PER_WORLD = 20;
  var PTS_HIT = 10;     // per hit point removed
  var PTS_BREAK = 50;   // per max HP when a brick is destroyed

  var BRICK_INFO = {
    '1': { type: 'normal', hp: 1 }, '2': { type: 'normal', hp: 2 },
    '3': { type: 'normal', hp: 3 }, '4': { type: 'normal', hp: 4 },
    'S': { type: 'steel', hp: 0 }, 'X': { type: 'explosive', hp: 1 },
    'M': { type: 'moving', hp: 1 }, 'N': { type: 'moving', hp: 2 },
    'R': { type: 'regen', hp: 3 }, 'P': { type: 'prize', hp: 1 },
    'T': { type: 'target', hp: 2 }
  };

  // ---------------------------------------------------------------- worlds
  var WORLDS = [
    {
      id: 'nebula', name: 'Prism Nebula', tagline: 'Where the first light shatters',
      bg: [0x0a0f2e, 0x2a0b4a], accent: 0x22e8ff, accent2: 0xff3df0,
      hp: [0x22e8ff, 0xff3df0, 0x9b6bff, 0xffd166],
      intro: 'Crystal bricks & explosives',
      hand: {
        0: { name: 'First Light', objective: { type: 'clear' }, grid: [
          '............',
          '..11111111..',
          '.1111PP1111.',
          '.1111111111.',
          '..22222222..',
          '............',
          '...111111...'
        ] },
        9: { name: 'Nebula Heart', objective: { type: 'score' }, grid: [
          '............',
          '..22....22..',
          '.2332..2332.',
          '.2333223332.',
          '.2333333332.',
          '..23X33X32..',
          '...233332...',
          '....2PP2....',
          '.....22.....',
          '............',
          '.1.1.1.1.1.1'
        ] },
        19: { name: 'Prism Sovereign', objective: { type: 'targets' }, grid: [
          '.....TT.....',
          '....3443....',
          '...344443...',
          '..3X4224X3..',
          '.3342222433.',
          '.T32P11P23T.',
          '..33211233..',
          '...332233...',
          '....3333....',
          '............',
          '.2.2.XX.2.2.',
          '............',
          '1111....1111'
        ] }
      }
    },
    {
      id: 'caverns', name: 'Crystal Caverns', tagline: 'Steel veins in frozen stone',
      bg: [0x061a2e, 0x1c0f40], accent: 0x6ff7ff, accent2: 0xb388ff,
      hp: [0x6ff7ff, 0xb388ff, 0x3d8bff, 0xff66c4],
      intro: 'Steel walls block your path',
      hand: {
        0: { name: 'Cave Mouth', objective: { type: 'clear' }, grid: [
          '............',
          '.S22222222S.',
          '.S21111112S.',
          '.S21PXX112S.',
          '.S21111112S.',
          '.SS......SS.',
          '............',
          '..11111111..'
        ] },
        9: { name: 'Geode Vault', objective: { type: 'time' }, grid: [
          '............',
          '..SS3333SS..',
          '..S333333S..',
          '..33PTTP33..',
          '..S322223S..',
          '..S3X22X3S..',
          '..SS3..3SS..',
          '............',
          '22........22',
          '33S......S33',
          '............',
          '...2.22.2...'
        ] },
        19: { name: 'Frozen Throne', objective: { type: 'clear' }, grid: [
          'S..........S',
          '.3333333333.',
          '.3SSS44SSS3.',
          '.3444444443.',
          '.3X4PTTP4X3.',
          '.3444444443.',
          '.3SS.33.SS3.',
          '.3........3.',
          '.2222..2222.',
          '............',
          'SS..2222..SS',
          '............',
          '..11111111..'
        ] }
      }
    },
    {
      id: 'reef', name: 'Neon Reef', tagline: 'Living light that drifts and sways',
      bg: [0x03202e, 0x2c0a3e], accent: 0x3dffc5, accent2: 0xff5fa8,
      hp: [0x3dffc5, 0xff5fa8, 0x37b6ff, 0xfff15c],
      intro: 'Moving bricks ride the current',
      hand: {
        0: { name: 'Tide Pool', objective: { type: 'clear' }, grid: [
          '............',
          '.2222222222.',
          '.1111PP1111.',
          '.2222222222.',
          '............',
          '....MMMM....',
          '............',
          '.11......11.'
        ] },
        9: { name: 'Coral Spiral', objective: { type: 'targets' }, grid: [
          '............',
          '.3333333333.',
          '.3........3.',
          '.3.222222.3.',
          '.3.2TPPT2.3.',
          '.3.2....2.3.',
          '.3.22..22.3.',
          '.33......33.',
          '............',
          '...NNNNNN...',
          '............',
          '..MM....MM..'
        ] },
        19: { name: 'Leviathan Bloom', objective: { type: 'clear' }, grid: [
          '............',
          '..44....44..',
          '.4X44..44X4.',
          '.4444PP4444.',
          '..43333334..',
          '...3TTTT3...',
          '....3333....',
          '............',
          '..NNNNNNNN..',
          '............',
          '...MMMMMM...',
          '............',
          '.2.2.22.2.2.'
        ] }
      }
    },
    {
      id: 'forge', name: 'Solar Forge', tagline: 'Crystals reborn in molten light',
      bg: [0x1e0a1c, 0x3c0d26], accent: 0xffa53d, accent2: 0xff3d8b,
      hp: [0xffd23d, 0xff8a3d, 0xff3d8b, 0xc44dff],
      intro: 'Regenerating crystals heal over time',
      hand: {
        0: { name: 'Ember Gate', objective: { type: 'clear' }, grid: [
          '............',
          '..RR....RR..',
          '.2222222222.',
          '.2X222222X2.',
          '.3333PP3333.',
          '............',
          '..S......S..',
          '.1111111111.'
        ] },
        9: { name: 'Crucible', objective: { type: 'score' }, grid: [
          '............',
          'S.RRRRRRRR.S',
          '..R444444R..',
          '..R4XPPX4R..',
          '..R444444R..',
          '..RRR..RRR..',
          '............',
          '.SS..33..SS.',
          '............',
          '..MMM..MMM..',
          '............',
          '3333....3333'
        ] },
        19: { name: 'Heart of the Sun', objective: { type: 'targets' }, grid: [
          '.....44.....',
          '...444444...',
          '..44RRRR44..',
          '.44R3TT3R44.',
          '.4R3X44X3R4.',
          '.4R3PTTP3R4.',
          '.44R3333R44.',
          '..44RRRR44..',
          '...444444...',
          'SS........SS',
          '.....NN.....',
          '............',
          '..22222222..'
        ] }
      }
    },
    {
      id: 'void', name: 'Void Citadel', tagline: 'The last prism at the edge of night',
      bg: [0x05040f, 0x220640], accent: 0xd0b8ff, accent2: 0xff2e63,
      hp: [0xd0b8ff, 0xff2e63, 0x7a5cff, 0x00f0ff],
      intro: 'Every crystal trick at once',
      hand: {
        0: { name: 'Outer Wall', objective: { type: 'clear' }, grid: [
          '............',
          'SS.SS..SS.SS',
          '.2222222222.',
          '.3X3RPPR3X3.',
          '.2222222222.',
          '............',
          '...MMMMMM...',
          '............',
          '.11.1111.11.'
        ] },
        9: { name: 'Gravity Well', objective: { type: 'time' }, grid: [
          '............',
          '.S22222222S.',
          '.S4RRRRRR4S.',
          '.S4R3TT3R4S.',
          '.S4RX33XR4S.',
          '.S4RRPPRR4S.',
          '.SS4....4SS.',
          '............',
          '..NNN..NNN..',
          '............',
          '.2222..2222.',
          '............',
          '..MM....MM..'
        ] },
        19: { name: 'Prism Eternal', objective: { type: 'targets' }, grid: [
          '.....TT.....',
          '....S44S....',
          '...S4RR4S...',
          '..S4R44R4S..',
          '.S4RX44XR4S.',
          '.4RPT44TPR4.',
          '.S4RX44XR4S.',
          '..S4R44R4S..',
          '...S4..4S...',
          '............',
          '..NNNNNNNN..',
          '............',
          'SS..3333..SS',
          '............',
          '.MMM....MMM.'
        ] }
      }
    }
  ];

  // ------------------------------------------------------------ utilities
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function emptyMask(R) {
    var m = [];
    for (var r = 0; r < R; r++) { var row = []; for (var c = 0; c < COLS; c++) row.push('.'); m.push(row); }
    return m;
  }
  function mirror(m) { // copy left half onto right half
    for (var r = 0; r < m.length; r++) for (var c = 0; c < COLS / 2; c++) m[r][COLS - 1 - c] = m[r][c];
    return m;
  }
  function fromBitmap(rows) { return rows.map(function (s) { return s.split('').map(function (ch) { return ch === '#' ? '#' : ch === 'S' ? 'S' : '.'; }); }); }

  // ------------------------------------------------------------ patterns
  // Each pattern returns a mask: '#' = brick slot, 'S' = steel, '.' = empty.
  var PATTERNS = {
    pyramid: function (R) {
      var m = emptyMask(R);
      for (var r = 0; r < R; r++) { var hw = Math.max(1, Math.ceil((r + 1) * 6 / R)); for (var c = 6 - hw; c < 6 + hw; c++) m[r][c] = '#'; }
      return m;
    },
    invPyramid: function (R) { return PATTERNS.pyramid(R).reverse(); },
    diamond: function (R) {
      var m = emptyMask(R), mid = (R - 1) / 2;
      for (var r = 0; r < R; r++) { var hw = Math.max(1, Math.round(6 * (1 - Math.abs(r - mid) / (mid + 1)))); for (var c = 6 - hw; c < 6 + hw; c++) m[r][c] = '#'; }
      return m;
    },
    rings: function (R) {
      var m = emptyMask(R);
      for (var r = 0; r < R; r++) for (var c = 1; c < COLS - 1; c++) {
        var d = Math.min(r, R - 1 - r, c - 1, COLS - 2 - c); if (d % 2 === 0) m[r][c] = '#';
      }
      return m;
    },
    stripes: function (R) {
      var m = emptyMask(R);
      for (var r = 0; r < R; r++) if (r % 2 === 0) for (var c = 1; c < COLS - 1; c++) m[r][c] = '#';
      return m;
    },
    columns: function (R) {
      var m = emptyMask(R);
      for (var r = 0; r < R; r++) for (var c = 0; c < COLS; c++) if (c % 3 !== 2 || r === 0) m[r][c] = '#';
      return m;
    },
    checker: function (R) {
      var m = emptyMask(R);
      for (var r = 0; r < R; r++) for (var c = 0; c < COLS; c++) if ((r + c) % 2 === 0) m[r][c] = '#';
      return mirror(m);
    },
    wave: function (R, rnd) {
      var m = emptyMask(R), ph = rnd() * Math.PI * 2;
      for (var c = 0; c < COLS; c++) {
        var center = (R - 1) / 2 + Math.sin(c / (COLS - 1) * Math.PI * 2 + ph) * (R / 3);
        for (var r = 0; r < R; r++) if (Math.abs(r - center) <= 1.3) m[r][c] = '#';
      }
      return m;
    },
    chevron: function (R) {
      var m = emptyMask(R);
      for (var r = 0; r < R; r++) for (var c = 0; c < COLS; c++) {
        var k = r - Math.abs(c - 5.5) * 0.8 + 6; if (((Math.floor(k) % 4) + 4) % 4 < 2) m[r][c] = '#';
      }
      return m;
    },
    hourglass: function (R) {
      var m = emptyMask(R), mid = (R - 1) / 2;
      for (var r = 0; r < R; r++) { var hw = Math.round(1 + 5 * Math.abs(r - mid) / Math.max(1, mid)); for (var c = 6 - hw; c < 6 + hw; c++) m[r][c] = '#'; }
      return m;
    },
    cross: function (R) {
      var m = emptyMask(R), mid = (R - 1) / 2;
      for (var r = 0; r < R; r++) for (var c = 0; c < COLS; c++) if (Math.abs(c - 5.5) < 2 || Math.abs(r - mid) < 1.2 || (Math.abs(c - 5.5) + Math.abs(r - mid)) % 5 < 1) m[r][c] = '#';
      return m;
    },
    frame: function (R) {
      var m = emptyMask(R);
      for (var r = 0; r < R; r++) for (var c = 1; c < COLS - 1; c++) {
        var edge = r === 0 || r === R - 1 || c === 1 || c === COLS - 2;
        var core = r >= 2 && r <= R - 3 && c >= 3 && c <= COLS - 4;
        if (edge || core) m[r][c] = '#';
      }
      return m;
    },
    scatter: function (R, rnd, d) {
      var m = emptyMask(R), dens = 0.45 + d * 0.3;
      for (var r = 0; r < R; r++) for (var c = 0; c < COLS / 2; c++) if (rnd() < dens) m[r][c] = '#';
      return mirror(m);
    },
    invader: function () {
      return fromBitmap([
        '...#....#...', '....#..#....', '...######...', '..##.##.##..', '.##########.',
        '.#.######.#.', '.#.#....#.#.', '...##..##...'
      ]);
    },
    heart: function () {
      return fromBitmap([
        '.###....###.', '#####..#####', '############', '############',
        '.##########.', '..########..', '...######...', '....####....', '.....##.....'
      ]);
    },
    gem: function () {
      return fromBitmap([
        '...######...', '..########..', '.##########.', '############', '.##########.',
        '..########..', '...######...', '....####....', '.....##.....'
      ]);
    },
    crown: function () {
      return fromBitmap([
        '#....##....#', '##..####..##', '###.####.###', '############', '############',
        '.##########.', '.##########.'
      ]);
    },
    // ---- steel-structured patterns (used from world 2 onward)
    fortress: function (R) {
      var m = emptyMask(R);
      for (var r = 0; r < R; r++) for (var c = 1; c < COLS - 1; c++) {
        var shell = (r === 0 || c === 1 || c === COLS - 2 || r === R - 1);
        m[r][c] = shell ? 'S' : '#';
      }
      m[R - 1][5] = '.'; m[R - 1][6] = '.'; // gate
      m[0][5] = '#'; m[0][6] = '#';
      return m;
    },
    maze: function (R, rnd) {
      var m = emptyMask(R), side = rnd() < 0.5;
      for (var r = 0; r < R; r++) {
        if (r % 3 === 2) { // steel shelf with a gap that alternates side
          for (var c = 0; c < COLS; c++) m[r][c] = 'S';
          var g = side ? 1 : COLS - 3; m[r][g] = '.'; m[r][g + 1] = '.'; side = !side;
        } else for (var c2 = 0; c2 < COLS; c2++) m[r][c2] = '#';
      }
      return m;
    },
    bunkers: function (R) {
      var m = emptyMask(R);
      for (var r = 0; r < R; r++) for (var c = 0; c < COLS; c++) {
        var block = Math.floor(c / 4), inner = c % 4;
        if (inner === 3) continue;
        if (r % 4 === 0 && inner !== 1) m[r][c] = (block === 1) ? '#' : 'S';
        else if (r % 4 !== 3) m[r][c] = '#';
      }
      return m;
    },
    pillars: function (R) {
      var m = emptyMask(R);
      for (var r = 0; r < R; r++) for (var c = 0; c < COLS; c++) {
        if ((c === 2 || c === 9) && r > 0 && r < R - 1) m[r][c] = 'S';
        else if (c !== 0 && c !== 11) m[r][c] = '#';
      }
      return m;
    }
  };
  var OPEN_PATTERNS = ['pyramid', 'diamond', 'rings', 'stripes', 'columns', 'checker', 'wave', 'chevron', 'hourglass', 'cross', 'frame', 'scatter', 'invader', 'heart', 'gem', 'crown', 'invPyramid'];
  var STEEL_PATTERNS = ['fortress', 'maze', 'bunkers', 'pillars'];

  var NAME_A = ['Shard', 'Glimmer', 'Halo', 'Echo', 'Lumen', 'Quartz', 'Flare', 'Drift', 'Cipher', 'Pulse', 'Facet', 'Aurora', 'Vortex', 'Mirage', 'Spectra', 'Ion'];
  var NAME_B = ['Bloom', 'Gate', 'Spire', 'Garden', 'Lattice', 'Cascade', 'Orbit', 'Bastion', 'Hollow', 'Rift', 'Crown', 'Maze', 'Tide', 'Array', 'Veil', 'Engine'];

  // ------------------------------------------------------------ reachability
  // Flood fill (4-neighbour) from the open space below the formation,
  // treating steel as walls. Returns list of unreachable breakable cells.
  function unreachableBreakables(grid) {
    var R = grid.length, seen = [], q = [], out = [];
    for (var r = 0; r <= R; r++) { seen.push(new Array(COLS).fill(false)); }
    function open(r, c) { return r === R || grid[r][c] !== 'S'; }
    for (var c = 0; c < COLS; c++) { seen[R][c] = true; q.push([R, c]); }
    while (q.length) {
      var p = q.pop(), pr = p[0], pc = p[1];
      var nb = [[pr - 1, pc], [pr + 1, pc], [pr, pc - 1], [pr, pc + 1]];
      for (var i = 0; i < 4; i++) {
        var nr = nb[i][0], nc = nb[i][1];
        if (nr < 0 || nr > R || nc < 0 || nc >= COLS || seen[nr][nc] || !open(nr, nc)) continue;
        seen[nr][nc] = true; q.push([nr, nc]);
      }
    }
    for (var r2 = 0; r2 < R; r2++) for (var c2 = 0; c2 < COLS; c2++) {
      var ch = grid[r2][c2]; if (BRICK_INFO[ch] && ch !== 'S' && !seen[r2][c2]) out.push([r2, c2]);
    }
    return out;
  }

  // ------------------------------------------------------------ generator
  // A "pocket" is a non-steel cell boxed in on 3+ sides by steel or the side
  // walls: technically reachable but almost impossible to hit, so we forbid it.
  function pockets(grid) {
    var R = grid.length, out = [];
    function blocked(r, c) { if (c < 0 || c >= COLS) return true; if (r < 0 || r >= R) return false; return grid[r][c] === 'S'; }
    for (var r = 0; r < R; r++) for (var c = 0; c < COLS; c++) {
      if (grid[r][c] === 'S') continue;
      var n = (blocked(r - 1, c) ? 1 : 0) + (blocked(r + 1, c) ? 1 : 0) + (blocked(r, c - 1) ? 1 : 0) + (blocked(r, c + 1) ? 1 : 0);
      if (n >= 3) out.push([r, c]);
    }
    return out;
  }

  function decorate(mask, wi, li, d, rnd, objectiveType, steelPattern) {
    var R = mask.length, g = [], r, c;
    for (r = 0; r < R; r++) {
      var row = [];
      for (c = 0; c < COLS; c++) {
        var m = mask[r][c];
        if (m === 'S') { row.push('S'); continue; }
        if (m !== '#') { row.push('.'); continue; }
        var top = R > 1 ? 1 - r / (R - 1) : 1;
        var hpf = 0.75 + d * 1.7 + top * (0.5 + d * 0.9) + (rnd() - 0.5) * 0.9 - (objectiveType === 'time' ? 0.8 : 0);
        row.push(String(clamp(Math.floor(hpf), 1, 4)));
      }
      g.push(row);
    }
    // specials — chosen on the left half and mirrored where symmetric
    var pExp = (wi > 0 || li >= 3) ? 0.025 + 0.035 * d : 0;
    var pSteel = (wi >= 1 && !steelPattern) ? 0.02 + 0.04 * d : 0;
    var pRegen = wi >= 3 ? 0.05 + 0.06 * d : 0;
    for (r = 0; r < R; r++) for (c = 0; c < COLS / 2; c++) {
      if (!/[1-4]/.test(g[r][c])) continue;
      var x = rnd(), ch = null;
      if (x < pExp) ch = 'X';
      else if (x < pExp + pSteel && r < R * 0.7) ch = 'S';
      else if (x < pExp + pSteel + pRegen && g[r][c] >= '2') ch = 'R';
      if (ch) { g[r][c] = ch; if (/[1-4]/.test(g[r][COLS - 1 - c])) g[r][COLS - 1 - c] = ch; }
    }
    // remove steel that seals anything off
    var guard = 0, bad;
    while ((bad = unreachableBreakables(g)).length && guard++ < 50) {
      // open the steel cell nearest to the first unreachable brick
      var br = bad[0][0], bc = bad[0][1], best = null, bd = 1e9;
      for (r = 0; r < R; r++) for (c = 0; c < COLS; c++) if (g[r][c] === 'S') {
        var dd = Math.abs(r - br) + Math.abs(c - bc) + (r < br ? 0.5 : 0);
        if (dd < bd) { bd = dd; best = [r, c]; }
      }
      if (!best) break; g[best[0]][best[1]] = '1';
    }
    // break open dead-end pockets (turn one neighbouring steel into a crystal)
    guard = 0;
    while ((bad = pockets(g)).length && guard++ < 80) {
      var pr = bad[0][0], pc = bad[0][1], opts = [[pr - 1, pc], [pr + 1, pc], [pr, pc - 1], [pr, pc + 1]].filter(function (q) { return q[0] >= 0 && q[0] < R && q[1] >= 0 && q[1] < COLS && g[q[0]][q[1]] === 'S'; });
      if (!opts.length) break;
      var o = opts[Math.floor(rnd() * opts.length)]; g[o[0]][o[1]] = '1';
    }
    // prize bricks
    var slots = [];
    for (r = 0; r < R; r++) for (c = 0; c < COLS; c++) if (/[1-3]/.test(g[r][c])) slots.push([r, c]);
    var prizes = Math.min(slots.length, 2 + Math.floor(rnd() * 3));
    for (var i = 0; i < prizes; i++) { var s = slots.splice(Math.floor(rnd() * slots.length), 1)[0]; g[s[0]][s[1]] = 'P'; }
    // target cores
    if (objectiveType === 'targets') {
      var k = Math.min(slots.length, 3 + Math.floor(d * 4));
      for (var j = 0; j < k; j++) { var t = slots.splice(Math.floor(rnd() * slots.length), 1)[0]; g[t[0]][t[1]] = 'T'; }
    }
    // moving band (Neon Reef and later)
    if (wi >= 2 && li % 3 !== 0 && R + 2 <= MAX_ROWS) {
      var len = 3 + Math.floor(rnd() * 4), start = Math.floor(rnd() * (COLS - len - 3)) + 1;
      var band = []; for (c = 0; c < COLS; c++) band.push(c >= start && c < start + len ? (d > 0.6 && rnd() < 0.5 ? 'N' : 'M') : '.');
      g.push('............'.split('')); g.push(band);
    }
    return g.map(function (row) { return row.join(''); });
  }

  var OBJECTIVE_CYCLE = ['clear', 'clear', 'score', 'clear', 'targets', 'clear', 'time'];

  function generateLevel(wi, li) {
    var seed = (wi + 1) * 7919 + (li + 1) * 104729;
    var rnd = mulberry32(seed);
    var d = (wi * LEVELS_PER_WORLD + li) / (WORLDS.length * LEVELS_PER_WORLD - 1);
    var R = clamp(6 + Math.round(d * 5 + (li / LEVELS_PER_WORLD) * 1.5 + rnd() * 1.5), 5, 12);
    var useSteel = wi >= 1 && (li % 4 === 2);
    var list = useSteel ? STEEL_PATTERNS : OPEN_PATTERNS;
    var pname = list[(li * 5 + wi * 3) % list.length];
    var obj = OBJECTIVE_CYCLE[(li + wi * 2) % OBJECTIVE_CYCLE.length];
    if (wi === 0 && li < 6 && obj === 'time') obj = 'clear';
    if (obj === 'time') R = Math.min(R, 9);      // time trials use compact layouts
    var mask = PATTERNS[pname](R, rnd, d);
    var grid = decorate(mask, wi, li, d, rnd, obj, useSteel);
    var n = wi * LEVELS_PER_WORLD + li, q = Math.floor(n / 16);
    var name = NAME_A[n % 16] + ' ' + NAME_B[(q + 3 * (n % 16)) % 16]; // unique pair for n < 256
    return { name: name, pattern: pname, objective: { type: obj }, grid: grid };
  }

  // ------------------------------------------------------------ normalise
  function analyse(grid) {
    var s = { breakable: 0, totalHp: 0, steel: 0, targets: 0, baseScore: 0, moving: 0, regen: 0 };
    for (var r = 0; r < grid.length; r++) for (var c = 0; c < grid[r].length; c++) {
      var info = BRICK_INFO[grid[r][c]]; if (!info) continue;
      if (info.type === 'steel') { s.steel++; continue; }
      s.breakable++; s.totalHp += info.hp; s.baseScore += info.hp * PTS_HIT + info.hp * PTS_BREAK;
      if (info.type === 'target') s.targets++;
      if (info.type === 'moving') s.moving++;
      if (info.type === 'regen') s.regen++;
    }
    return s;
  }

  // Occupancy silhouette: empty, steel, or any breakable. Trimmed so a
  // shifted copy matches, then folded with horizontal and vertical mirrors.
  function shapeSignature(grid) {
    var occ = [];
    for (var r = 0; r < grid.length; r++) {
      var row = '';
      for (var c = 0; c < grid[r].length; c++) {
        var ch = grid[r][c];
        row += ch === '.' ? '.' : (ch === 'S' ? 'S' : '#');
      }
      occ.push(row);
    }
    var top = 0, bot = occ.length - 1;
    while (top <= bot && occ[top].indexOf('#') < 0 && occ[top].indexOf('S') < 0) top++;
    while (bot >= top && occ[bot].indexOf('#') < 0 && occ[bot].indexOf('S') < 0) bot--;
    if (top > bot) return '';
    var left = COLS, right = -1, r2, c2;
    for (r2 = top; r2 <= bot; r2++) {
      for (c2 = 0; c2 < occ[r2].length; c2++) {
        if (occ[r2][c2] !== '.') {
          if (c2 < left) left = c2;
          if (c2 > right) right = c2;
        }
      }
    }
    var core = [];
    for (r2 = top; r2 <= bot; r2++) core.push(occ[r2].slice(left, right + 1));
    function mirrorH(g) { return g.map(function (row) { return row.split('').reverse().join(''); }); }
    function mirrorV(g) { var out = []; for (var i = g.length - 1; i >= 0; i--) out.push(g[i]); return out; }
    var variants = [core, mirrorH(core), mirrorV(core), mirrorH(mirrorV(core))];
    var best = null;
    for (var i = 0; i < variants.length; i++) {
      var sig = variants[i].join('/');
      if (best === null || sig < best) best = sig;
    }
    return best;
  }

  function rowHasMover(rows, r) {
    for (var c = 0; c < COLS; c++) if (rows[r][c] === 'M' || rows[r][c] === 'N') return true;
    return false;
  }

  function repairLayout(g) {
    var R = g.length, guard = 0, bad, r, c;
    while ((bad = unreachableBreakables(g)).length && guard++ < 50) {
      var br = bad[0][0], bc = bad[0][1], best = null, bd = 1e9;
      for (r = 0; r < R; r++) for (c = 0; c < COLS; c++) if (g[r][c] === 'S') {
        var dd = Math.abs(r - br) + Math.abs(c - bc);
        if (dd < bd) { bd = dd; best = [r, c]; }
      }
      if (!best) break;
      g[best[0]][best[1]] = '1';
    }
    guard = 0;
    while ((bad = pockets(g)).length && guard++ < 80) {
      var pr = bad[0][0], pc = bad[0][1];
      var opts = [[pr - 1, pc], [pr + 1, pc], [pr, pc - 1], [pr, pc + 1]].filter(function (q) {
        return q[0] >= 0 && q[0] < R && q[1] >= 0 && q[1] < COLS && g[q[0]][q[1]] === 'S';
      });
      if (!opts.length) {
        if (g[pr][pc] !== '.' && g[pr][pc] !== 'S') g[pr][pc] = '.';
        else break;
        continue;
      }
      g[opts[0][0]][opts[0][1]] = '1';
    }
    return g;
  }

  // Generated levels reused the same pattern at the same row count, so the
  // occupied silhouette matched across worlds (including mirrors). Two
  // occupancy edits on the left half make each layout distinct without
  // mirroring into another level's edit.
  function notch(grid, n) {
    var rows = [];
    for (var r = 0; r < grid.length; r++) rows.push(grid[r].split(''));
    var R = rows.length, done = 0, guard = 0, seed = (n + 1) * 17 + 11;
    while (done < 2 && guard++ < 160) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      var rr = seed % R;
      var cc = 1 + ((seed >>> 8) % 4);
      if (rowHasMover(rows, rr)) continue;
      var ch = rows[rr][cc];
      var next = null;
      if (ch === '.' ) {
        var blocked = 0, dirs = [[rr - 1, cc], [rr + 1, cc], [rr, cc - 1], [rr, cc + 1]];
        for (var d = 0; d < 4; d++) {
          var nr = dirs[d][0], nc = dirs[d][1];
          if (nc < 0 || nc >= COLS || (nr >= 0 && nr < R && rows[nr][nc] === 'S')) blocked++;
        }
        if (blocked >= 3) continue;
        next = '1';
      } else if (ch === 'S' || ch === '1' || ch === '2' || ch === '3' || ch === '4' || ch === 'X' || ch === 'R' || ch === 'P' || ch === 'T') {
        next = '.';
      }
      if (!next) continue;
      rows[rr][cc] = next;
      done++;
    }
    repairLayout(rows);
    return rows.map(function (line) { return line.join(''); });
  }

  function buildLevel(wi, li) {
    var w = WORLDS[wi];
    var hand = w.hand && w.hand[li];
    var src = hand || generateLevel(wi, li);
    var grid = hand ? src.grid.slice() : notch(src.grid, wi * LEVELS_PER_WORLD + li);
    var st = analyse(grid);
    var d = (wi * LEVELS_PER_WORLD + li) / (WORLDS.length * LEVELS_PER_WORLD - 1);
    var obj = { type: src.objective.type };
    if (obj.type === 'score') obj.target = Math.max(200, Math.floor(st.baseScore * 0.8 / 50) * 50);
    if (obj.type === 'time') obj.time = Math.round((150 + st.totalHp * 5 + st.steel * 3 + st.moving * 3 + st.regen * 6) / 5) * 5;
    if (obj.type === 'targets' && st.targets === 0) obj.type = 'clear';
    return {
      id: wi + '-' + li, world: wi, index: li, name: src.name, hand: !!(w.hand && w.hand[li]),
      pattern: src.pattern || 'hand', grid: grid, objective: obj, stats: st,
      star3: Math.floor(st.baseScore * 1.25 / 50) * 50,
      speed: Math.round(560 + d * 200),          // ball speed px/s at 720px logical width
      dropRate: 0.11 + (1 - d) * 0.05
    };
  }

  var cache = {};
  function getLevel(wi, li) { var k = wi + '-' + li; return cache[k] || (cache[k] = buildLevel(wi, li)); }

  function describeObjective(obj) {
    switch (obj.type) {
      case 'score': return 'Reach ' + obj.target.toLocaleString('en-US') + ' points';
      case 'time': return 'Clear all crystals in ' + obj.time + 's';
      case 'targets': return 'Shatter every golden core';
      default: return 'Clear all crystals';
    }
  }

  var api = {
    COLS: COLS, MAX_ROWS: MAX_ROWS, LEVELS_PER_WORLD: LEVELS_PER_WORLD,
    PTS_HIT: PTS_HIT, PTS_BREAK: PTS_BREAK, BRICK_INFO: BRICK_INFO, WORLDS: WORLDS,
    getLevel: getLevel, generateLevel: generateLevel, analyse: analyse,
    shapeSignature: shapeSignature,
    unreachableBreakables: unreachableBreakables, pockets: pockets, describeObjective: describeObjective,
    worldCount: function () { return WORLDS.length; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PB_LEVELS = api;
})(typeof window !== 'undefined' ? window : globalThis);
