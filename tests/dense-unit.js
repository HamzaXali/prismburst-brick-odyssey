#!/usr/bin/env node
/* Unit tests for Crystal Mass levels, coin pickups, the ball cap,
 * and cloud save of the dense track. No browser and no network. */
'use strict';
const L = require('../levels.js');
const Dense = require('../js/dense.js');
const sync = require('../js/save-sync.js');

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail && !pass ? ' — ' + detail : ''));
}

function wallet(coins) {
  return {
    v: 1, coins: coins, unlocked: [1, 0, 0, 0, 0], levels: {},
    owned: { ball: ['classic'], paddle: ['classic'] },
    equipped: { ball: 'classic', paddle: 'classic' },
    settings: { sound: true, vibration: true, shake: true },
    daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
    stats: { bricks: 0, played: 0, cleared: 0 }, last: null, home: null
  };
}

function clearedCopy(grid) {
  const copy = new Uint8Array(grid);
  for (let i = 0; i < copy.length; i++) if (copy[i] !== Dense.STEEL) copy[i] = 0;
  return copy;
}

try {
  const sigs = new Map();
  const names = new Set();
  let thin = '';
  const audit = Dense.auditAll();
  audit.rows.forEach(function (row) {
    console.log('BOT L' + (row.index + 1) + ' ' + row.name + ' clear=' + (Math.round(row.pct * 1000) / 10) + '% steps=' + row.steps + ' ms=' + row.ms + ' steel=' + row.steel + ' mouths=' + row.mouths);
    if (!row.ok) thin += ' ' + row.name + ' bot ' + row.pct;
  });
  for (let i = 0; i < Dense.COUNT; i++) {
    const lv = Dense.level(i);
    const info = Dense.analyze(lv.grid);
    if (!lv || lv.grid.length !== Dense.COLS * Dense.ROWS) thin += ' bad grid ' + i;
    if (lv.breakable < 2000) thin += ' ' + lv.name + ' breakable ' + lv.breakable;
    if (i < 5 && lv.steel !== 0) thin += ' ' + lv.name + ' early steel ' + lv.steel;
    if (i >= 5 && lv.steel < 1) thin += ' ' + lv.name + ' missing steel';
    if (info.reached !== info.total) thin += ' ' + lv.name + ' reached ' + info.reached + '/' + info.total;
    if (info.mouths < Dense.MIN_MOUTHS) thin += ' ' + lv.name + ' mouths ' + info.mouths;
    if (!Dense.isCleared(clearedCopy(lv.grid))) thin += ' ' + lv.name + ' steel blocks clear';
    if (Dense.isCleared(lv.grid)) thin += ' ' + lv.name + ' empty';
    if (!Dense.countsForClear(1) || Dense.countsForClear(Dense.STEEL) || Dense.countsForClear(0)) thin += ' clear rule';
    if (names.has(lv.name)) thin += ' duplicate name ' + lv.name;
    names.add(lv.name);
    if (sigs.has(lv.signature)) thin += ' silhouette ' + lv.name + ' == ' + sigs.get(lv.signature);
    else sigs.set(lv.signature, lv.name);
    if (lv.name.indexOf('Dense') >= 0) thin += ' copied name ' + lv.name;
  }
  record('Crystal Mass has 20 distinct solvable levels with wide entrances',
    Dense.COUNT === 20 && sigs.size === 20 && names.size === 20 && L.worldCount() === 5 && L.LEVELS_PER_WORLD === 20 && audit.ok && !thin,
    thin || audit.errors.join('; '));
  record('the campaign track is still five worlds of twenty', L.worldCount() === 5 && L.LEVELS_PER_WORLD === 20);

  const poor = wallet(10);
  const drop = { kind: 'coin', value: Dense.COIN_VALUE, collected: false, id: 'c1' };
  const once = Dense.collectCoin(poor, drop);
  const twice = Dense.collectCoin(poor, drop);
  record('a coin pickup adds its coins once and a second catch adds nothing',
    once.ok === true && once.added === 2 && poor.coins === 12 && twice.ok === false && twice.reason === 'once' && poor.coins === 12 && poor.coins >= 0);

  const balls = [];
  let merged = false;
  for (let i = 0; i < Dense.BALL_CAP + 25; i++) {
    const res = Dense.addBall(balls, { x: i % 50, y: (i * 3) % 80, vx: 10, vy: -20 }, Dense.BALL_CAP);
    if (res.merged) merged = true;
    if (Dense.activeCount(balls) > Dense.BALL_CAP) {
      record('the ball cap stays at 300', false, String(Dense.activeCount(balls)));
      break;
    }
  }
  record('balls merge instead of passing the cap and the count stays non-negative',
    merged && Dense.activeCount(balls) === Dense.BALL_CAP && Dense.BALL_CAP === 300);

  const first = wallet(0);
  const clear = Dense.recordClear(first, 0, 5000, 2);
  const replay = Dense.recordClear(first, 0, 1000, 1);
  record('clearing a mass pays coins once per clear and does not go negative',
    clear.ok === true && clear.added === 45 && clear.coins === 45 && replay.added === 20 && replay.coins === 65 && first.coins === 65 && first.dense.unlocked === 2 && first.dense.levels['0'].stars === 2);

  const local = wallet(80);
  local.dense = { v: 1, unlocked: 3, levels: { '0': { best: 100, stars: 2 }, '1': { best: 40, stars: 1 } } };
  const remote = wallet(15);
  remote.dense = { v: 1, unlocked: 6, levels: { '1': { best: 90, stars: 3 }, '4': { best: 10, stars: 1 } } };
  const mergedSave = sync.mergeProgress(local, remote, '2026-10-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
  const dense = mergedSave.save.dense;
  record('cloud merge keeps the newer coins and unions dense records without duplicating them',
    mergedSave.save.coins === 80
    && dense.unlocked === 6
    && dense.levels['0'].best === 100 && dense.levels['0'].stars === 2
    && dense.levels['1'].best === 90 && dense.levels['1'].stars === 3
    && dense.levels['4'].stars === 1
    && Object.keys(dense.levels).length === 3);

  const plain = wallet(42);
  plain.levels = { '0-0': { best: 15, stars: 2 } };
  const oldCloud = sync.toCloudData(plain, '2026-10-01T00:00:00.000Z');
  delete oldCloud.dense;
  const accepted = sync.validateCloudData(oldCloud, { worlds: 5, perWorld: 20 });
  record('an old cloud save without dense still loads and the campaign level is unchanged',
    accepted.ok === true && accepted.save.coins === 42 && accepted.save.levels['0-0'].stars === 2 && accepted.save.dense.unlocked === 1 && Object.keys(accepted.save.dense.levels).length === 0,
    accepted.ok ? '' : accepted.error);

  const withDense = sync.toCloudData(wallet(7), '2026-10-02T00:00:00.000Z');
  withDense.dense = { v: 1, unlocked: 2, levels: { '0': { best: 80, stars: 3 } } };
  const denseOk = sync.validateCloudData(withDense, { worlds: 5, perWorld: 20 });
  record('a dense track on a cloud save is accepted',
    denseOk.ok === true && denseOk.save.dense.unlocked === 2 && denseOk.save.dense.levels['0'].stars === 3);

  withDense.dense.extra = { flag: true };
  withDense.dense.levels['0'].badge = 'mass';
  const kept = sync.validateCloudData(withDense, { worlds: 5, perWorld: 20 });
  const uploaded = sync.toCloudData(kept.save, '2026-10-02T00:00:00.000Z');
  record('an unknown dense field is kept',
    kept.ok === true && kept.save.dense.extra.flag === true && kept.save.dense.levels['0'].badge === 'mass' && kept.save.dense.levels['0'].stars === 3 && uploaded.dense.extra.flag === true && uploaded.dense.levels['0'].badge === 'mass');
} catch (err) {
  record('dense unit suite ran', false, err && err.stack ? err.stack : String(err));
}

const failed = results.filter(r => !r.pass).length;
console.log(failed ? failed + ' failed' : 'all ' + results.length + ' passed');
process.exit(failed ? 1 : 0);
