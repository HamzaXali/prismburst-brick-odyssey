/* Pixel Tunnel: level-1 pocket, one-cell dig, immortal ring, pickups, save keys. */
'use strict';
const fs = require('fs');
const path = require('path');
const levels = require('../js/pixel-tunnel/levels.js');
const store = require('../js/pixel-tunnel/storage.js');
const game = require('../js/pixel-tunnel/game.js');
const physics = require('../js/pixel-tunnel/physics.js');
const sync = require('../js/save-sync.js');
const cfg = require('../js/pixel-tunnel/config.js');

const CELL = cfg.CELL;
const COLS = cfg.CONFIG.COLS;
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail && !pass ? ' — ' + detail : ''));
}

const level = levels.buildLevel(1);
const grid = level.grid;
function at(c, r) { return grid[r * COLS + c]; }

record('only level 1 is built', levels.count() === 1 && level.id === 1 && level.grid.length === 2500);
record('field is olive inside the ring', at(25, 10) === CELL.OLIVE && at(25, 25) === CELL.OLIVE);
record('outer ring is gray', at(0, 10) === CELL.GRAY && at(49, 10) === CELL.GRAY && at(25, 0) === CELL.GRAY && at(25, 49) === CELL.GRAY);
record('top cap is gray', [12, 13, 14, 15, 16].every(c => at(c, 39) === CELL.GRAY));
record('left wall, divider, and right wall match the pocket',
  at(12, 44) === CELL.GRAY && at(14, 44) === CELL.GRAY && at(16, 39) === CELL.GRAY && at(16, 48) === CELL.GRAY);
record('passages and the join are open',
  at(13, 40) === CELL.OPEN && at(14, 40) === CELL.OPEN && at(15, 40) === CELL.OPEN &&
  at(13, 46) === CELL.OPEN && at(15, 46) === CELL.OPEN);
record('entrance is only column 13 on the bottom row',
  at(13, 49) === CELL.OPEN && at(12, 49) === CELL.GRAY && at(14, 49) === CELL.GRAY && at(15, 49) === CELL.GRAY);
record('three yellow cells and one red target',
  at(16, 43) === CELL.YELLOW && at(16, 44) === CELL.YELLOW && at(16, 45) === CELL.YELLOW && at(17, 44) === CELL.RED);

record('GRAY_BREAKABLE is pocket+bottom', cfg.CONFIG.GRAY_BREAKABLE === 'pocket+bottom');
record('the outer ring never breaks',
  !levels.canBreak(grid, 0 * COLS + 25) &&
  !levels.canBreak(grid, 10 * COLS + 0) &&
  !levels.canBreak(grid, 10 * COLS + 49) &&
  !levels.canBreak(grid, 49 * COLS + 0));
record('pocket gray and the bottom row do break',
  levels.canBreak(grid, 44 * COLS + 14) && levels.canBreak(grid, 49 * COLS + 20) && levels.canBreak(grid, 39 * COLS + 13));

const L = cfg.layout();
record('canvas is 416×688 and the paddle is 15.2 cells under the field',
  L.canvasW === 416 && L.canvasH === 688 &&
  Math.abs(L.paddleTop - (L.blackTop + 15.2 * 8)) < 0.001 &&
  cfg.CONFIG.BALL_SPEED_CELLS === 37.3 &&
  cfg.CONFIG.PICKUP_FALL_CELLS === 7.5 &&
  cfg.CONFIG.MAX_BALLS >= 1000);

function countOpen(g) {
  let n = 0;
  for (let i = 0; i < g.length; i++) if (g[i] === CELL.OPEN) n++;
  return n;
}

function aim(match, c, r, vx, vy) {
  const b = match.state.balls;
  for (let i = 0; i < b.alive.length; i++) b.alive[i] = 0;
  match.state.live = 0;
  const i = physics.allocBall(match.state);
  physics.placeBall(
    match.state,
    i,
    L.fieldX + (c + 0.5) * 8,
    L.fieldY + (r + 0.5) * 8,
    vx,
    vy
  );
  return i;
}

const dig = game.createMatch(levels.buildLevel(1));
const digTarget = 20 * COLS + 25;
for (let rr = 19; rr <= 22; rr++) {
  for (let cc = 24; cc <= 26; cc++) {
    if (rr === 20 && cc === 25) continue;
    dig.state.grid[rr * COLS + cc] = CELL.OPEN;
  }
}
const openBefore = countOpen(dig.state.grid);
aim(dig, 25, 21, 0, -dig.state.speed);
let dug = false;
for (let s = 0; s < 8 && !dug; s++) {
  dig.step(1 / 60);
  dug = dig.state.grid[digTarget] === CELL.OPEN;
}
record('a hit digs exactly one olive cell and does not grow a gray edge',
  dug && dig.state.grid[digTarget] === CELL.OPEN &&
  countOpen(dig.state.grid) === openBefore + 1 &&
  dig.state.grid[digTarget - 1] !== CELL.GRAY &&
  dig.state.grid[digTarget + 1] !== CELL.GRAY);

const ring = game.createMatch(levels.buildLevel(1));
ring.state.grid[1 * COLS + 25] = CELL.OPEN;
aim(ring, 25, 1, 0, -ring.state.speed);
for (let s = 0; s < 12; s++) ring.step(1 / 60);
record('the top ring stays gray after a hit', ring.state.grid[25] === CELL.GRAY);

const side = game.createMatch(levels.buildLevel(1));
side.state.grid[10 * COLS + 1] = CELL.OPEN;
aim(side, 1, 10, -side.state.speed, 0);
for (let s = 0; s < 12; s++) side.step(1 / 60);
record('the left ring stays gray after a hit', side.state.grid[10 * COLS] === CELL.GRAY);

const bottom = game.createMatch(levels.buildLevel(1));
bottom.state.grid[48 * COLS + 20] = CELL.OPEN;
aim(bottom, 20, 48, 0, bottom.state.speed);
for (let s = 0; s < 12; s++) bottom.step(1 / 60);
record('a bottom gray cell opens and stays black', bottom.state.grid[49 * COLS + 20] === CELL.OPEN);

const yellow = game.createMatch(levels.buildLevel(1));
yellow.state.grid[42 * COLS + 16] = CELL.OPEN;
aim(yellow, 16, 42, 0, yellow.state.speed);
let saw = false;
for (let s = 0; s < 20 && !saw; s++) {
  yellow.step(1 / 60);
  saw = yellow.state.grid[43 * COLS + 16] === CELL.OPEN;
}
const kinds = yellow.state.pickups.filter(p => p.on).map(p => p.kind);
record('breaking the top yellow cell drops the orange safety pickup',
  saw && kinds.indexOf('safety') >= 0, kinds.join(','));

const cyan = game.createMatch(levels.buildLevel(1));
physics.destroyCell(cyan.state, 44 * COLS + 16);
record('the middle yellow cell drops a cyan +3 pickup',
  cyan.state.grid[44 * COLS + 16] === CELL.OPEN &&
  cyan.state.pickups.some(p => p.on && p.kind === 'plus3'));

const beforeBalls = cyan.state.live;
game.applyPickup(cyan.state, 'plus3');
record('catching cyan adds 3 balls', cyan.state.live === beforeBalls + 3);
game.applyPickup(cyan.state, 'safety');
record('catching orange starts the safety bar', Math.abs(cyan.state.safety - cfg.CONFIG.SAFETY_BAR_SEC) < 0.001);
const beforeMul = cyan.state.live;
game.applyPickup(cyan.state, 'times3');
record('lime multiplies the balls by 3', cyan.state.live === beforeMul * 3);
cyan.state.lives = 2;
game.applyPickup(cyan.state, 'heart');
record('pink adds a life', cyan.state.lives === 3);

const fin = game.createMatch(levels.buildLevel(1));
for (let i = 0; i < fin.state.grid.length; i++) {
  if (levels.canBreak(fin.state.grid, i)) physics.destroyCell(fin.state, i);
}
record('clearing every destructible cell wins with 3 stars and leaves the ring',
  fin.state.won === true && fin.state.stars === 3 && fin.state.grid[25] === CELL.GRAY && fin.state.grid[10 * COLS] === CELL.GRAY);

const crowd = game.createMatch(levels.buildLevel(1));
while (crowd.state.live < 700) game.addBalls(crowd.state, 3);
const t0 = Date.now();
for (let s = 0; s < 60; s++) crowd.step(1 / 60);
record('700 balls step for one second without dropping',
  crowd.state.live >= 700 && Date.now() - t0 < 2000, 'live ' + crowd.state.live + ' ms ' + (Date.now() - t0));

const mem = new Map();
global.localStorage = {
  getItem: function (k) { return mem.has(k) ? mem.get(k) : null; },
  setItem: function (k, v) { mem.set(k, String(v)); },
  removeItem: function (k) { mem.delete(k); }
};
const classic = { v: 1, coins: 42, unlocked: [1, 0, 0, 0, 0], levels: { '0-0': { best: 9, stars: 2 } }, pixelTunnel: { v: 1, unlocked: 3, current: 2, levels: { '1': { best: 10, stars: 1, cleared: true } }, settings: { findEntrance: false, sound: true } } };
mem.set('prismburst.save.v1', JSON.stringify(classic));
mem.set('prismburst.pixel-tunnel.v1', JSON.stringify({ v: 1, unlocked: 2, current: 2, levels: { '2': { best: 50, stars: 3, cleared: true } }, settings: { findEntrance: true, sound: true } }));
const loaded = store.load();
record('load merges dedicated key and classic mirror by max progress',
  loaded.unlocked === 3 && loaded.levels['1'].best === 10 && loaded.levels['2'].stars === 3);
const saved = store.save(loaded);
const after = JSON.parse(mem.get('prismburst.save.v1'));
record('mirror keeps classic coins and levels', after.coins === 42 && after.levels['0-0'].stars === 2 && after.pixelTunnel.unlocked === saved.unlocked);
record('dedicated key is prismburst.pixel-tunnel.v1', mem.get(store.KEY) && store.CLASSIC_KEY === 'prismburst.save.v1');
const src = fs.readFileSync(path.join(__dirname, '../js/pixel-tunnel/storage.js'), 'utf8');
record('tunnel storage never removes the classic save', !/removeItem\(\s*['"]prismburst\.save\.v1['"]\s*\)/.test(src) && !src.includes('localStorage.clear'));

const merged = sync.mergeProgress(
  { v: 1, coins: 1, unlocked: [1, 0, 0, 0, 0], levels: {}, owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' }, settings: { sound: true, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] }, stats: { bricks: 0, played: 0, cleared: 0 }, last: null, pixelTunnel: { unlocked: 4, current: 4, levels: { '3': { best: 80, stars: 2, cleared: true } }, settings: { sound: true, findEntrance: false } } },
  { v: 1, coins: 9, unlocked: [1, 0, 0, 0, 0], levels: {}, owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' }, settings: { sound: true, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] }, stats: { bricks: 0, played: 0, cleared: 0 }, last: null, pixelTunnel: { unlocked: 2, current: 1, levels: { '3': { best: 20, stars: 1, cleared: false } }, settings: { sound: true, findEntrance: false } } },
  '2026-01-01T00:00:00.000Z',
  '2026-06-01T00:00:00.000Z'
);
record('cloud merge keeps the better tunnel score and classic coins',
  merged.save.pixelTunnel.unlocked === 4 && merged.save.pixelTunnel.levels['3'].best === 80 && merged.save.pixelTunnel.levels['3'].cleared === true && merged.save.coins === 9);

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
record('version stays 1.6.0 / versionCode 9', pkg.version === '1.6.0' && pkg.androidVersionCode === 9);

const passed = results.filter(r => r.pass).length;
console.log('\n' + passed + '/' + results.length + ' passed');
if (passed !== results.length) process.exit(1);
