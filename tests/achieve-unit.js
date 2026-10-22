#!/usr/bin/env node
/* Achievement badges: retroactive unlock, one-time coins, cloud union. */
'use strict';
const Ach = require('../js/achievements');
const sync = require('../js/save-sync');

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail && !pass ? ' — ' + detail : ''));
}

function save(over) {
  const data = {
    v: 1, coins: 0, unlocked: [1, 0, 0, 0, 0], levels: {},
    owned: { ball: ['classic'], paddle: ['classic'] },
    equipped: { ball: 'classic', paddle: 'classic' },
    settings: { sound: true, vibration: true, shake: true },
    daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
    stats: { bricks: 0, played: 0, cleared: 0 }, last: null, home: null, shop: null, dense: null
  };
  if (over) Object.keys(over).forEach(function (k) { data[k] = over[k]; });
  return data;
}

function fill(data, world, count, stars) {
  for (let i = 0; i < count; i++) data.levels[world + '-' + i] = { best: 100 + i, stars: stars };
}

try {
  const old = save();
  fill(old, 0, 7, 1);
  const first = Ach.settle(old, { now: 1000 });
  const names = first.map(function (row) { return row.name; });
  const again = Ach.settle(old, { now: 2000 });
  record('existing clears unlock the matching badges once and do not toast again',
    names.indexOf('First Clear') >= 0 && names.indexOf('Five Facets') >= 0 && names.indexOf('Ten Prisms') < 0 && again.length === 0 && old.achievements.unlocked['clear-1'] === 1000 && old.achievements.unlocked['clear-5'] === 1000);
  record('badge coins are granted once',
    old.coins === 35 && old.achievements.paid['clear-1'] === 1 && old.achievements.paid['clear-5'] === 1);
  old.coins = 4;
  Ach.settle(old, { now: 3000 });
  record('a second pass does not pay the badge coins again', old.coins === 4);
  const backfill = save();
  fill(backfill, 0, 1, 1);
  const silent = Ach.settle(backfill, { pay: false, now: 11 });
  record('a retroactive unlock does not change the coin balance',
    silent.length === 1 && backfill.coins === 0 && backfill.achievements.paid['clear-1'] === 1 && Ach.settle(backfill, { now: 12 }).length === 0 && backfill.coins === 0);

  const world = save({ coins: 10 });
  fill(world, 0, 20, 3);
  const unlocked = Ach.settle(world, { now: 5000 });
  const latest = Ach.latest(world);
  record('a finished world unlocks World Complete and that world badge',
    unlocked.some(function (row) { return row.name === 'World Complete'; }) && unlocked.some(function (row) { return row.name === 'Prism Nebula Complete'; }) && latest.name === 'No Life Lost');
  record('three-star clears also count as no life lost',
    world.achievements.unlocked['flawless'] === 5000 && world.achievements.unlocked['stars-1'] === 5000 && world.achievements.unlocked['stars-10'] === 5000);

  const soft = save();
  fill(soft, 1, 1, 1);
  const softFresh = Ach.settle(soft, { flawless: true, now: 42 });
  record('a no-life-lost clear unlocks that badge from the clear itself',
    softFresh.some(function (row) { return row.id === 'flawless'; }) && soft.achievements.flawless === true);

  const mass = save();
  mass.dense = { v: 1, unlocked: 6, levels: { '0': { best: 10, stars: 2 }, '1': { best: 10, stars: 1 }, '2': { best: 10, stars: 1 }, '3': { best: 10, stars: 1 }, '4': { best: 10, stars: 3 } } };
  const massFresh = Ach.settle(mass, { now: 77 });
  record('Crystal Mass is gone: no mass badges exist and an old dense record grants nothing',
    massFresh.length === 0 && !Ach.DEFS.some(function (row) { return /^mass-/.test(row.id) || row.kind === 'dense'; }) && mass.coins === 0);
  const oldCloud = sync.toCloudData(save({ coins: 9 }), '2026-10-01T00:00:00.000Z');
  oldCloud.dense = { v: 1, unlocked: 3, levels: { '0': { best: 10, stars: 2 } } };
  const oldOk = sync.validateCloudData(oldCloud, { worlds: 5, perWorld: 20 });
  record('a 1.3.5 cloud save with a dense record still loads and keeps it as plain JSON',
    oldOk.ok === true && oldOk.save.coins === 9 && oldOk.save.dense && oldOk.save.dense.unlocked === 3 && JSON.stringify(sync.toCloudData(oldOk.save, '2026-10-01T00:00:00.000Z')).indexOf('"dense"') >= 0);
  const oldLocal = sync.toLocalSave(Object.assign(save({ coins: 4 }), { dense: { v: 1, unlocked: 2, levels: {} } }));
  record('a 1.3.5 device save keeps its dense record on load', oldLocal.dense && oldLocal.dense.unlocked === 2 && oldLocal.coins === 4);

  const board = Ach.board(save());
  const five = board.filter(function (row) { return row.id === 'clear-10'; })[0];
  record('a locked badge reports progress as current out of the goal', five && five.current === 0 && five.need === 10 && five.unlocked === false && five.name.indexOf('<') < 0);

  const local = save({ coins: 80 });
  local.achievements = { v: 1, unlocked: { 'clear-1': 5, 'future-badge': 8 }, paid: { 'clear-1': 1 }, flawless: false, note: 'keep' };
  const remote = save({ coins: 15 });
  remote.achievements = { v: 1, unlocked: { 'mass-1': 9, flawless: 9 }, paid: { 'mass-1': 1, flawless: 1 }, flawless: true };
  const merged = sync.mergeProgress(local, remote, '2026-10-02T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  const ach = merged.save.achievements;
  record('cloud merge unions badges and paid gifts',
    merged.save.coins === 80 && ach.unlocked['clear-1'] === 5 && ach.unlocked['mass-1'] === 9 && ach.unlocked['future-badge'] === 8 && ach.paid['clear-1'] === 1 && ach.paid['mass-1'] === 1 && ach.flawless === true && ach.note === 'keep');
  const paid = save({ coins: 3, achievements: ach, levels: { '0-0': { best: 10, stars: 1 } }, dense: { v: 1, unlocked: 2, levels: { '0': { best: 10, stars: 1 } } } });
  const before = paid.coins;
  const replay = Ach.settle(paid, { now: 9000 });
  record('a merged paid badge is not granted again', before === 3 && paid.coins === 3 && !replay.some(function (row) { return row.id === 'clear-1' || row.id === 'mass-1'; }));

  const cloud = sync.toCloudData(save({ coins: 6, levels: { '0-0': { best: 15, stars: 2 } } }), '2026-10-01T00:00:00.000Z');
  delete cloud.achievements;
  const accepted = sync.validateCloudData(cloud, { worlds: 5, perWorld: 20 });
  record('an old cloud save without achievements still loads',
    accepted.ok === true && accepted.save.achievements.v === 1 && Object.keys(accepted.save.achievements.unlocked).length === 0);

  const bad = sync.toCloudData(save(), '2026-10-01T00:00:00.000Z');
  bad.achievements = { v: 1, unlocked: { '<script>': 1 }, paid: {}, flawless: false };
  record('a badge id with markup is rejected', sync.validateCloudData(bad, { worlds: 5, perWorld: 20 }).ok === false);

  record('badge names are plain text', Ach.plainText('Achievement <b>unlocked</b>') === 'Achievement bunlocked/b' && Ach.badgeSvg('#22e8ff').indexOf('<polygon') >= 0 && Ach.badgeSvg('#22e8ff').indexOf('<script') < 0);
  const packed = JSON.stringify(sync.toCloudData(world, '2026-10-03T00:00:00.000Z'));
  record('a save with every early badge stays under 64 KB', packed.length < 65536);
} catch (err) {
  record('achievement unit suite ran', false, err && err.stack ? err.stack : String(err));
}

const failed = results.filter(function (r) { return !r.pass; }).length;
console.log(failed ? failed + ' failed' : 'all ' + results.length + ' passed');
process.exit(failed ? 1 : 0);
