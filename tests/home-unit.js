#!/usr/bin/env node
/* Unit tests for Daily Bonus, Lucky Wheel, Daily Tasks, and save.home merge.
 * No browser and no network. */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const home = require('../js/home');
const sync = require('../js/save-sync');

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail && !pass ? ' — ' + detail : ''));
}
function at(y, m, d, h) { return new Date(y, m - 1, d, h == null ? 12 : h, 0, 0, 0).getTime(); }
function save(over) {
  const data = {
    v: 1, coins: 0, unlocked: [1, 0, 0, 0, 0], levels: { '0-0': { best: 10, stars: 1 } },
    owned: { ball: ['classic'], paddle: ['classic'] },
    equipped: { ball: 'classic', paddle: 'classic' },
    settings: { sound: true, vibration: true, shake: true },
    daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
    stats: { bricks: 0, played: 0, cleared: 0 }, last: null, home: null
  };
  if (over) Object.keys(over).forEach(function (k) { data[k] = over[k]; });
  return data;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

try {
  const today = home.dateKey(new Date(at(2026, 10, 20)));
  record('local date key uses the calendar day', today === '2026-10-20' && home.dateKey(new Date(at(2026, 10, 20, 0))) === '2026-10-20' && home.dateKey(new Date(at(2026, 10, 20, 23))) === '2026-10-20');
  record('adding a day crosses month and year ends', home.addDays('2026-10-31', 1) === '2026-11-01' && home.addDays('2026-12-31', 1) === '2027-01-01' && home.addDays('2026-03-07', 1) === '2026-03-08');
  record('midnight countdown stays on the local calendar', home.msUntilMidnight(at(2026, 10, 20, 23)) > 0 && home.msUntilMidnight(at(2026, 10, 20, 23)) <= 3600000);

  const fresh = save();
  record('a save without home migrates to home version 1', home.normalize(null).v === 1 && home.normalize({ coins: 5 }).v === 1 && home.normalize({ v: 2, gems: 9 }).gems === 0);
  const migrated = sync.toLocalSave(fresh);
  record('old save coins and levels stay put when home is added', migrated.coins === 0 && migrated.levels['0-0'].stars === 1 && migrated.home.v === 1 && migrated.home.bonus.lastClaim === null);
  const oldCloud = sync.toCloudData(fresh, '2026-10-20T12:00:00.000Z');
  delete oldCloud.home;
  const accepted = sync.validateCloudData(oldCloud, { worlds: 5, perWorld: 20 });
  record('a cloud save from before home still validates', accepted.ok === true && accepted.save.home.v === 1 && accepted.save.coins === 0);
  const junk = sync.toCloudData(fresh, '2026-10-20T12:00:00.000Z');
  junk.home.extra = { flag: true };
  junk.home.powers.nova = 2;
  const keptHome = sync.validateCloudData(junk, { worlds: 5, perWorld: 20 });
  record('an unknown home field is kept', keptHome.ok === true && keptHome.save.home.extra.flag === true && keptHome.save.home.powers.nova === 2 && keptHome.save.home.powers.wide === 0 && keptHome.save.home.v === 1);

  const bonus = save();
  const first = home.claimBonus(bonus, at(2026, 10, 20, 12));
  record('day 1 bonus pays once', first.ok === true && first.streak === 1 && bonus.coins === 20 && bonus.home.gems === 0);
  const again = home.claimBonus(bonus, at(2026, 10, 20, 18));
  record('the same local day cannot claim again', again.ok === false && bonus.coins === 20);
  const next = home.claimBonus(bonus, at(2026, 10, 21, 12));
  record('the next calendar day continues the streak', next.ok === true && next.streak === 2 && bonus.home.gems === 1 && bonus.coins === 20);
  const skipped = save();
  home.claimBonus(skipped, at(2026, 10, 18, 12));
  const reset = home.claimBonus(skipped, at(2026, 10, 20, 12));
  record('a missed day resets the streak to day 1', reset.ok === true && reset.streak === 1 && skipped.home.bonus.streak === 1);
  const week = save();
  let cursor = at(2026, 10, 10, 12);
  for (let i = 0; i < 7; i++) {
    home.claimBonus(week, cursor);
    cursor = at(2026, 10, 11 + i, 12);
  }
  const eighth = home.claimBonus(week, at(2026, 10, 17, 12));
  record('after day 7 the next claim starts day 1 again', week.home.bonus.streak === 1 && eighth.streak === 1 && eighth.coins === 20);

  const rolled = save();
  home.claimBonus(rolled, at(2026, 10, 20, 12));
  const coinsBefore = rolled.coins;
  const back = home.claimBonus(rolled, at(2026, 10, 20, 8));
  const earlierDay = home.claimBonus(rolled, at(2026, 10, 19, 12));
  record('a clock moved backwards cannot claim again', back.ok === false && earlierDay.ok === false && rolled.coins === coinsBefore && rolled.home.bonus.lastClaim === '2026-10-20');
  const later = home.claimBonus(rolled, at(2026, 10, 21, 12));
  record('a claim works again once the calendar passes the last claim', later.ok === true && later.streak === 2 && rolled.coins === coinsBefore);

  const rng = mulberry(7);
  const counts = {};
  home.SEGMENTS.forEach(function (s) { counts[s.id] = 0; });
  const samples = 20000;
  for (let i = 0; i < samples; i++) counts[home.pickSegment(rng).id]++;
  const weightTotal = home.SEGMENTS.reduce(function (sum, s) { return sum + s.weight; }, 0);
  let spreadOk = true;
  home.SEGMENTS.forEach(function (s) {
    const expected = s.weight / weightTotal;
    const got = counts[s.id] / samples;
    if (Math.abs(got - expected) > 0.02) spreadOk = false;
  });
  record('weighted wheel picks stay near their weights', spreadOk, JSON.stringify(counts));

  const spinSave = save();
  const started = home.beginSpin(spinSave, at(2026, 10, 20, 12), function () { return 0; });
  const pendingId = started.spin.id;
  const segment = started.segment;
  record('a spin stores the reward before it is granted', started.ok === true && spinSave.home.wheel.pending.length === 1 && spinSave.home.wheel.used === 1 && spinSave.coins === 0 && spinSave.home.gems === 0);
  const copy = JSON.parse(JSON.stringify(spinSave));
  const applied = home.ensure(copy, at(2026, 10, 20, 12));
  const appliedAgain = home.applyPending(copy);
  const rewardCoins = segment.kind === 'coins' ? segment.amount : 0;
  const rewardGems = segment.kind === 'gems' ? segment.amount : 0;
  record('a pending wheel reward is granted once on the next load',
    applied.length === 1 && applied[0].id === pendingId && copy.home.wheel.pending.length === 0 && appliedAgain.length === 0 && copy.coins === rewardCoins && copy.home.gems === rewardGems);
  const third = home.ensure(JSON.parse(JSON.stringify(copy)), at(2026, 10, 20, 13));
  record('reloading after the grant does not pay again', third.length === 0 && true);
  let spins = 1;
  while (home.spinsLeft(spinSave, at(2026, 10, 20, 15)) > 0 && spins < 6) {
    home.beginSpin(spinSave, at(2026, 10, 20, 15), function () { return 0.99; });
    home.applyPending(spinSave);
    spins++;
  }
  const blocked = home.beginSpin(spinSave, at(2026, 10, 20, 16), function () { return 0; });
  record('only 1 free spin is stored for one local day', spins === 1 && blocked.ok === false && spinSave.home.wheel.used === 1 && blocked.reason === 'none');
  const tomorrowSpins = home.spinsLeft(spinSave, at(2026, 10, 21, 12));
  record('the free spin returns on the next local day', tomorrowSpins === 1 && spinSave.home.wheel.used === 0);

  const doubleSave = save();
  const firstTap = home.beginSpin(doubleSave, at(2026, 10, 20, 12), function () { return 0; });
  const secondTap = home.beginSpin(doubleSave, at(2026, 10, 20, 12), function () { return 0.5; });
  const grantedOnce = home.applyPending(doubleSave);
  const grantedTwice = home.applyPending(doubleSave);
  record('a second spin in the same day is refused and the reward is paid once',
    firstTap.ok === true && secondTap.ok === false && secondTap.reason === 'pending' && doubleSave.home.wheel.used === 1 && grantedOnce.length === 1 && grantedTwice.length === 0 && doubleSave.coins === 25);

  const samples10k = 10000;
  const rng10 = mulberry(11);
  const counts10 = {};
  home.SEGMENTS.forEach(function (s) { counts10[s.id] = 0; });
  for (let n = 0; n < samples10k; n++) counts10[home.pickSegment(rng10).id] += 1;
  const everySegment = home.SEGMENTS.every(function (s) {
    const expected = s.weight / weightTotal;
    return counts10[s.id] > 0 && Math.abs(counts10[s.id] / samples10k - expected) < 0.03;
  });
  record('every wheel segment appears in 10000 seeded rolls near its weight', everySegment, JSON.stringify(counts10));

  let restOk = true;
  home.SEGMENTS.forEach(function (seg, index) {
    [-18, 0, 18].forEach(function (off) {
      const angle = home.restAngle(index, off, 5);
      if (home.segmentAtPointer(angle) !== index) restOk = false;
    });
  });
  record('each segment rests under the pointer', restOk);

  let grantOk = true;
  const weightCursor = [];
  let weightAt = 0;
  home.SEGMENTS.forEach(function (seg) { weightCursor.push(weightAt); weightAt += seg.weight; });
  home.SEGMENTS.forEach(function (seg, index) {
    const data = save();
    const roll = (weightCursor[index] + seg.weight / 2) / weightTotal;
    const spun = home.beginSpin(data, at(2026, 10, 20, 12), function () { return roll; });
    const before = { coins: data.coins, gems: data.home.gems, wide: data.home.powers.wide, multi: data.home.powers.multi };
    home.applyPending(data);
    const delta = {
      coins: data.coins - before.coins,
      gems: data.home.gems - before.gems,
      wide: data.home.powers.wide - before.wide,
      multi: data.home.powers.multi - before.multi
    };
    const expect = {
      coins: seg.kind === 'coins' ? seg.amount : 0,
      gems: seg.kind === 'gems' ? seg.amount : 0,
      wide: seg.power === 'wide' ? seg.amount : 0,
      multi: seg.power === 'multi' ? seg.amount : 0
    };
    if (!spun.ok || spun.segment.id !== seg.id || delta.coins !== expect.coins || delta.gems !== expect.gems || delta.wide !== expect.wide || delta.multi !== expect.multi) grantOk = false;
  });
  record('the granted reward equals the chosen segment', grantOk);

  const legacyWheel = home.defaultHome();
  legacyWheel.wheel = { date: '2026-10-20', used: 3, pending: [{ id: '2026-10-20:2', segment: 'c60' }, { id: '2026-10-20:3', segment: 'g2' }] };
  legacyWheel.tasks.date = '2026-10-20';
  legacyWheel.tasks.progress.spins = 3;
  const legacyCheck = home.validateHome(legacyWheel);
  const legacySave = save({ home: JSON.parse(JSON.stringify(legacyWheel)), coins: 0 });
  const legacyApplied = home.ensure(legacySave, at(2026, 10, 20, 18));
  const legacyAgain = home.ensure(JSON.parse(JSON.stringify(legacySave)), at(2026, 10, 20, 19));
  record('old wheel saves with used 3 and pending :2/:3 still validate',
    legacyCheck.ok === true && legacyCheck.home.wheel.used === 3 && legacyCheck.home.wheel.pending.length === 2 && legacyCheck.home.tasks.progress.spins === 1);
  record('old pending rewards are granted once and do not unlock another spin',
    legacyApplied.length === 2 && legacySave.coins === 60 && legacySave.home.gems === 2 && legacySave.home.wheel.pending.length === 0 && home.spinsLeft(legacySave, at(2026, 10, 20, 18)) === 0 && legacyAgain.length === 0);
  const spent = home.defaultHome();
  spent.wheel = { date: '2026-10-20', used: 3, pending: [] };
  const stillPending = home.defaultHome();
  stillPending.wheel = { date: '2026-10-20', used: 2, pending: [{ id: '2026-10-20:2', segment: 'c60' }] };
  const mergedOld = home.mergeHome(spent, stillPending, true);
  const mergedPay = save({ home: mergedOld, coins: 5 });
  home.ensure(mergedPay, at(2026, 10, 20, 12));
  record('a historical spin already used on one device is not granted again', mergedOld.wheel.used === 3 && mergedOld.wheel.pending.length === 0 && mergedPay.coins === 5);

  const tasks = save();
  home.note(tasks, 'clears', 4, at(2026, 10, 20, 12));
  home.note(tasks, 'clears', 20, at(2026, 10, 20, 12));
  home.note(tasks, 'powerups', 3, at(2026, 10, 20, 12));
  home.note(tasks, 'challenge', 1, at(2026, 10, 20, 12));
  record('task progress caps at the target', tasks.home.tasks.progress.clears === 10 && tasks.home.tasks.progress.powerups === 3 && tasks.home.tasks.progress.challenge === 1);
  record('challenge and chest tasks are marked as not live yet', home.TASKS.filter(function (t) { return t.id === 'challenge' || t.id === 'chest'; }).every(function (t) { return t.live === false; }));
  const early = home.claimMilestone(tasks, 0, at(2026, 10, 20, 12));
  record('a milestone pays once when enough tasks are done', early.ok === true && early.gems === 15 && tasks.home.gems === 15);
  const earlyAgain = home.claimMilestone(tasks, 0, at(2026, 10, 20, 13));
  record('a milestone cannot be claimed twice', earlyAgain.ok === false && tasks.home.gems === 15);
  home.ensure(tasks, at(2026, 10, 21, 12));
  record('tasks reset after the local day changes', tasks.home.tasks.progress.clears === 0 && tasks.home.tasks.date === '2026-10-21');

  const queueSave = save();
  const queue = home.popupQueue(queueSave, at(2026, 10, 20, 12));
  record('startup queue is bonus, then tasks, then wheel', queue.join(',') === 'bonus,tasks,wheel');
  home.claimBonus(queueSave, at(2026, 10, 20, 12));
  home.note(queueSave, 'clears', 10, at(2026, 10, 20, 12));
  home.note(queueSave, 'spins', 3, at(2026, 10, 20, 12));
  home.note(queueSave, 'powerups', 3, at(2026, 10, 20, 12));
  queueSave.home.wheel.used = 3;
  const quiet = home.popupQueue(queueSave, at(2026, 10, 20, 18));
  record('finished bonus, live tasks, and spins leave the queue empty', quiet.length === 0);

  const local = save();
  const remote = save();
  home.claimBonus(local, at(2026, 10, 20, 12));
  remote.home = home.defaultHome();
  local.home.gems = 4;
  local.home.wheel = { date: '2026-10-20', used: 1, pending: [{ id: '2026-10-20:1', segment: 'c25' }] };
  local.home.tasks = { date: '2026-10-20', progress: { clears: 6, challenge: 0, chest: 0, spins: 1, powerups: 0 }, milestones: [true, false, false] };
  remote.home.gems = 9;
  remote.home.bonus = { lastClaim: '2026-10-19', streak: 3 };
  remote.home.wheel = { date: '2026-10-20', used: 1, pending: [{ id: '2026-10-20:1', segment: 'g2' }] };
  remote.home.tasks = { date: '2026-10-20', progress: { clears: 2, challenge: 0, chest: 0, spins: 0, powerups: 2 }, milestones: [false, false, false] };
  const merged = home.mergeHome(local.home, remote.home, true);
  record('home merge keeps the later bonus day and does not add gems', merged.bonus.lastClaim === '2026-10-20' && merged.bonus.streak === 1 && merged.gems === 4);
  record('the same wheel spin stays pending once', merged.wheel.pending.length === 1 && merged.wheel.pending[0].id === '2026-10-20:1');
  record('same-day task progress is the max and a claimed milestone stays claimed', merged.tasks.progress.clears === 6 && merged.tasks.progress.powerups === 2 && merged.tasks.milestones[0] === true);
  const owed = save({ home: merged, coins: 0 });
  home.ensure(owed, at(2026, 10, 20, 19));
  const after = owed.coins;
  home.ensure(owed, at(2026, 10, 20, 20));
  record('a merged pending reward is granted once', owed.home.wheel.pending.length === 0 && after > 0 && owed.coins === after);

  const granted = home.defaultHome();
  granted.wheel = { date: '2026-10-20', used: 1, pending: [] };
  const waiting = home.defaultHome();
  waiting.wheel = { date: '2026-10-20', used: 1, pending: [{ id: '2026-10-20:1', segment: 'c120' }] };
  const noDouble = home.mergeHome(granted, waiting, true);
  const paid = save({ home: noDouble, coins: 10 });
  home.ensure(paid, at(2026, 10, 20, 12));
  record('a spin already granted on one device is not paid again', noDouble.wheel.pending.length === 0 && paid.coins === 10);

  const olderTasks = home.defaultHome();
  olderTasks.tasks = { date: '2026-10-19', progress: { clears: 9, challenge: 0, chest: 0, spins: 0, powerups: 0 }, milestones: [false, false, false] };
  const newerTasks = home.defaultHome();
  newerTasks.tasks = { date: '2026-10-20', progress: { clears: 1, challenge: 0, chest: 0, spins: 0, powerups: 0 }, milestones: [false, false, false] };
  const taskMerge = home.mergeHome(olderTasks, newerTasks, false);
  record('a newer task day replaces the previous day', taskMerge.tasks.date === '2026-10-20' && taskMerge.tasks.progress.clears === 1);

  const cloudLocal = sync.toLocalSave(local);
  const cloudRemote = sync.toLocalSave(remote);
  const cloudMerged = sync.mergeProgress(cloudLocal, cloudRemote, '2026-10-20T18:00:00.000Z', '2026-10-19T18:00:00.000Z', { worlds: 5, perWorld: 20 });
  record('cloud merge keeps level progress and applies the home rule',
    cloudMerged.save.levels['0-0'].stars === 1 && cloudMerged.save.home.bonus.lastClaim === '2026-10-20' && cloudMerged.save.home.gems === 4 && cloudMerged.save.coins === 20);

  const dst = execFileSync(process.execPath, ['-e', `
    const home = require(${JSON.stringify(path.join(__dirname, '../js/home.js'))});
    const springEve = new Date('2026-03-08T06:30:00.000Z');
    const springAfter = new Date('2026-03-08T07:30:00.000Z');
    const fallFirst = new Date('2026-11-01T05:30:00.000Z');
    const fallSecond = new Date('2026-11-01T06:30:00.000Z');
    const out = {
      eve: home.dateKey(springEve),
      after: home.dateKey(springAfter),
      next: home.addDays('2026-03-07', 1),
      fallA: home.dateKey(fallFirst),
      fallB: home.dateKey(fallSecond),
      fallNext: home.addDays('2026-10-31', 1)
    };
    if (out.eve !== '2026-03-08' || out.after !== '2026-03-08' || out.next !== '2026-03-08') process.exit(2);
    if (out.fallA !== '2026-11-01' || out.fallB !== '2026-11-01' || out.fallNext !== '2026-11-01') process.exit(3);
  `], { env: Object.assign({}, process.env, { TZ: 'America/New_York' }), encoding: 'utf8' });
  record('New York DST dates stay on the local calendar', dst === '');
} catch (err) {
  record('home unit suite crashed', false, err && err.stack ? err.stack : String(err));
}

const failed = results.filter(function (r) { return !r.pass; }).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
