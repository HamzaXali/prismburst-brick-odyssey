/* Pixel Tunnel: 40 solvable unique levels, save mirror, demo clear. No network. */
'use strict';
const fs = require('fs');
const path = require('path');
const levels = require('../js/pixel-tunnel/levels.js');
const store = require('../js/pixel-tunnel/storage.js');
const game = require('../js/pixel-tunnel/game.js');
const sync = require('../js/save-sync.js');
const cfg = require('../js/pixel-tunnel/config.js');

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail && !pass ? ' — ' + detail : ''));
}

const all = levels.buildAll();
const report = levels.validateAll(all);
record('forty levels build', all.length === 40);
record('every level is solvable and has a mouth', report.ok, JSON.stringify(report.reports.filter(r => !r.ok).map(r => [r.id, r.errors])));
record('no duplicate layouts', report.duplicates.length === 0, report.duplicates.join(','));
record('single green entrance is not required', report.reports.filter(r => r.mouths.length > 1).length >= 2);
record('speed runs from 1 to 1.6', all[0].speed === 1 && all[39].speed === 1.6);
var fieldShare = (cfg.CONFIG.FIELD_ROWS * cfg.CONFIG.CELL) / cfg.CONFIG.CANVAS_H;
record('ball pool is large and the paddle is a thin bar',
  cfg.CONFIG.MAX_BALLS >= 300 && cfg.CONFIG.PADDLE_H_CELLS < 0.5 && cfg.CONFIG.BALL_DIAMETER_CELLS >= 0.6 && cfg.CONFIG.BALL_DIAMETER_CELLS <= 0.8 && cfg.CONFIG.BADGE_DIAMETER_CELLS >= 1.6 && cfg.CONFIG.GAP_PX === 0 && fieldShare >= 0.65 && fieldShare <= 0.7);
record('safety bar is wide and red, border is grey',
  cfg.CONFIG.SAFETY_WIDTH_RATIO >= 0.9 && cfg.CONFIG.BORDER_COLOR !== '#FF2D2D' && cfg.CONFIG.SAFETY_COLOR[1] === 'F');

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

const demo = game.simulate(1, 40);
record('auto demo can clear level 1', demo.won === true && demo.yellowLeft === 0 && demo.lost === false, JSON.stringify(demo));
const other = game.simulate(3, 20);
record('a second level runs without throwing', other.launched === true && other.yellowLeft >= 0, JSON.stringify(other));

const passed = results.filter(r => r.pass).length;
console.log('\n' + passed + '/' + results.length + ' passed');
if (passed !== results.length) process.exit(1);
