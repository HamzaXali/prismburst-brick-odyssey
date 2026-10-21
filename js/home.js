/*
 * PRISMBURST — home.js
 * Startup rewards: 7-day Daily Bonus, Lucky Wheel, and Daily Tasks.
 * No network and no DOM. The device save stays prismburst.save.v1.
 * New state lives only in save.home (v: 1). Old saves omit that field
 * and load with their coins, levels, and unlocks unchanged.
 *
 * Challenge levels and chests are not in the game yet. Their task
 * counters exist so a future level can call PB.Home.note, and they
 * stay at zero until then.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.Home = api;
    if (root.PB.Save) api.attach(root.PB);
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var plain = null;
  if (typeof require === 'function') {
    try { plain = require('./save-plain.js'); } catch (e) { plain = null; }
  }
  function plainApi() {
    if (plain) return plain;
    var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    return g.PB && g.PB.SavePlain || null;
  }

  var HOME_VERSION = 1;
  var CLOCK_SKEW_MS = 120000;
  var CLOCK_WRITE_MS = 60000;
  var SPINS_PER_DAY = 1;
  var WHEEL_HISTORY_MAX = 3;
  var BONUS = [
    { day: 1, coins: 20, gems: 0 },
    { day: 2, coins: 0, gems: 1 },
    { day: 3, coins: 30, gems: 0 },
    { day: 4, coins: 0, gems: 2 },
    { day: 5, coins: 40, gems: 0 },
    { day: 6, coins: 0, gems: 3 },
    { day: 7, coins: 80, gems: 5 }
  ];
  var SEGMENTS = [
    { id: 'c25', kind: 'coins', amount: 25, weight: 28, label: '25 coins' },
    { id: 'c60', kind: 'coins', amount: 60, weight: 22, label: '60 coins' },
    { id: 'c120', kind: 'coins', amount: 120, weight: 12, label: '120 coins' },
    { id: 'g2', kind: 'gems', amount: 2, weight: 18, label: '2 gems' },
    { id: 'wide', kind: 'power', power: 'wide', amount: 1, weight: 12, label: 'Wide paddle' },
    { id: 'multi', kind: 'power', power: 'multi', amount: 1, weight: 8, label: 'Multi-ball' }
  ];
  var SEGMENT_IDS = SEGMENTS.map(function (s) { return s.id; });
  var TASKS = [
    { id: 'clears', target: 10, text: 'Clear 10 levels', live: true },
    { id: 'challenge', target: 1, text: 'Finish 1 challenge level', live: false },
    { id: 'chest', target: 1, text: 'Open a chest', live: false },
    { id: 'spins', target: 1, text: 'Spin the wheel', live: true },
    { id: 'powerups', target: 3, text: 'Use 3 power-ups', live: true }
  ];
  var MILESTONES = [
    { need: 1, coins: 0, gems: 15 },
    { need: 3, coins: 40, gems: 0 },
    { need: 5, coins: 100, gems: 0 }
  ];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function dateKey(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (!isFinite(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function addDays(key, days) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    if (!parts) return '';
    var dt = new Date(+parts[1], +parts[2] - 1, +parts[3] + days, 12, 0, 0, 0);
    return dateKey(dt);
  }

  function isDateKey(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && addDays(v, 0) === v; }

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  function clampInt(n, min, max, fallback) {
    if (!isInt(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function progressLimit(task) {
    return task.id === 'spins' ? Math.max(task.target, WHEEL_HISTORY_MAX) : task.target;
  }

  function emptyTasks(date) {
    return {
      date: date || null,
      progress: { clears: 0, challenge: 0, chest: 0, spins: 0, powerups: 0 },
      milestones: [false, false, false]
    };
  }

  function defaultHome() {
    return {
      v: HOME_VERSION,
      lastSeenMs: 0,
      lastSeenDate: null,
      gems: 0,
      powers: { wide: 0, multi: 0 },
      bonus: { lastClaim: null, streak: 0 },
      wheel: { date: null, used: 0, pending: [] },
      tasks: emptyTasks(null)
    };
  }

  function segmentById(id) {
    for (var i = 0; i < SEGMENTS.length; i++) if (SEGMENTS[i].id === id) return SEGMENTS[i];
    return null;
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function normalizePending(list) {
    var out = [];
    var seen = {};
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length && out.length < WHEEL_HISTORY_MAX; i++) {
      var item = list[i];
      if (!item || typeof item !== 'object') continue;
      var id = String(item.id || '');
      if (!/^\d{4}-\d{2}-\d{2}:[1-3]$/.test(id) || seen[id] || !segmentById(item.segment)) continue;
      seen[id] = true;
      out.push({ id: id, segment: item.segment });
    }
    return out;
  }

  function normalize(raw) {
    var base = defaultHome();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== HOME_VERSION) return base;
    base.lastSeenMs = clampInt(raw.lastSeenMs, 0, 1e15, 0);
    base.lastSeenDate = isDateKey(raw.lastSeenDate) ? raw.lastSeenDate : null;
    base.gems = clampInt(raw.gems, 0, 1000000000, 0);
    var powers = raw.powers || {};
    base.powers.wide = clampInt(powers.wide, 0, 99, 0);
    base.powers.multi = clampInt(powers.multi, 0, 99, 0);
    var bonus = raw.bonus || {};
    base.bonus.lastClaim = isDateKey(bonus.lastClaim) ? bonus.lastClaim : null;
    base.bonus.streak = clampInt(bonus.streak, 0, 10000, 0);
    if (!base.bonus.lastClaim) base.bonus.streak = 0;
    var wheel = raw.wheel || {};
    base.wheel.date = isDateKey(wheel.date) ? wheel.date : null;
    base.wheel.used = clampInt(wheel.used, 0, WHEEL_HISTORY_MAX, 0);
    base.wheel.pending = normalizePending(wheel.pending);
    var tasks = raw.tasks || {};
    base.tasks.date = isDateKey(tasks.date) ? tasks.date : null;
    var progress = tasks.progress || {};
    TASKS.forEach(function (task) {
      base.tasks.progress[task.id] = clampInt(progress[task.id], 0, progressLimit(task), 0);
      if (base.tasks.progress[task.id] > task.target) base.tasks.progress[task.id] = task.target;
    });
    var flags = Array.isArray(tasks.milestones) ? tasks.milestones : [];
    base.tasks.milestones = [0, 1, 2].map(function (i) { return flags[i] === true; });
    var highest = 0;
    for (var p = 0; p < base.wheel.pending.length; p++) {
      var n = +base.wheel.pending[p].id.split(':')[1];
      if (n > highest) highest = n;
    }
    if (base.wheel.date && highest > base.wheel.used) base.wheel.used = highest;
    var api = plainApi();
    if (api) {
      var kept = api.absorb(base, raw, 0);
      if (!kept.ok) return defaultHome();
    }
    return base;
  }

  function validateHome(raw) {
    if (raw == null) return { ok: true, home: defaultHome() };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'home must be an object' };
    var api = plainApi();
    if (api) {
      var checked = api.copyValue(raw, 0);
      if (!checked.ok) return { ok: false, error: checked.error };
      raw = checked.value;
    }
    if (raw.v !== HOME_VERSION) return { ok: false, error: 'home version must be 1' };
    if (!isInt(raw.lastSeenMs) || raw.lastSeenMs < 0 || raw.lastSeenMs > 1e15) return { ok: false, error: 'home clock is invalid' };
    if (!(raw.lastSeenDate === null || isDateKey(raw.lastSeenDate))) return { ok: false, error: 'home date is invalid' };
    if (!isInt(raw.gems) || raw.gems < 0 || raw.gems > 1000000000) return { ok: false, error: 'gems are invalid' };
    if (!raw.powers || typeof raw.powers !== 'object' || Array.isArray(raw.powers)) return { ok: false, error: 'power charges are invalid' };
    if (!isInt(raw.powers.wide) || !isInt(raw.powers.multi) || raw.powers.wide < 0 || raw.powers.multi < 0 || raw.powers.wide > 99 || raw.powers.multi > 99) return { ok: false, error: 'power charges are invalid' };
    if (!raw.bonus || typeof raw.bonus !== 'object') return { ok: false, error: 'daily bonus is invalid' };
    if (!(raw.bonus.lastClaim === null || isDateKey(raw.bonus.lastClaim))) return { ok: false, error: 'daily bonus date is invalid' };
    if (!isInt(raw.bonus.streak) || raw.bonus.streak < 0 || raw.bonus.streak > 10000) return { ok: false, error: 'daily bonus streak is invalid' };
    if (!raw.bonus.lastClaim && raw.bonus.streak !== 0) return { ok: false, error: 'daily bonus streak is invalid' };
    if (!raw.wheel || typeof raw.wheel !== 'object') return { ok: false, error: 'wheel is invalid' };
    if (!(raw.wheel.date === null || isDateKey(raw.wheel.date))) return { ok: false, error: 'wheel date is invalid' };
    if (!isInt(raw.wheel.used) || raw.wheel.used < 0 || raw.wheel.used > WHEEL_HISTORY_MAX) return { ok: false, error: 'wheel spins are invalid' };
    if (!Array.isArray(raw.wheel.pending) || raw.wheel.pending.length > WHEEL_HISTORY_MAX) return { ok: false, error: 'wheel reward is invalid' };
    var seen = {};
    for (var p = 0; p < raw.wheel.pending.length; p++) {
      var item = raw.wheel.pending[p];
      if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, error: 'wheel reward is invalid' };
      if (typeof item.id !== 'string' || !/^\d{4}-\d{2}-\d{2}:[1-3]$/.test(item.id) || seen[item.id]) return { ok: false, error: 'wheel reward is invalid' };
      if (SEGMENT_IDS.indexOf(item.segment) < 0) return { ok: false, error: 'wheel reward is invalid' };
      seen[item.id] = true;
    }
    if (!raw.tasks || typeof raw.tasks !== 'object') return { ok: false, error: 'tasks are invalid' };
    if (!(raw.tasks.date === null || isDateKey(raw.tasks.date))) return { ok: false, error: 'task date is invalid' };
    if (!raw.tasks.progress || typeof raw.tasks.progress !== 'object') return { ok: false, error: 'tasks are invalid' };
    for (var t = 0; t < TASKS.length; t++) {
      var task = TASKS[t];
      var value = raw.tasks.progress[task.id];
      if (!isInt(value) || value < 0 || value > progressLimit(task)) return { ok: false, error: 'task progress is invalid' };
    }
    if (!Array.isArray(raw.tasks.milestones) || raw.tasks.milestones.length !== 3) return { ok: false, error: 'task rewards are invalid' };
    for (var m = 0; m < 3; m++) if (typeof raw.tasks.milestones[m] !== 'boolean') return { ok: false, error: 'task rewards are invalid' };
    return { ok: true, home: normalize(raw) };
  }

  function clockBehind(home, now) {
    return home.lastSeenMs > 0 && now < home.lastSeenMs - CLOCK_SKEW_MS;
  }

  function dateBehind(home, now) {
    var today = dateKey(new Date(now));
    return !!(home.lastSeenDate && today && today < home.lastSeenDate);
  }

  function observe(home, now) {
    var today = dateKey(new Date(now));
    if (clockBehind(home, now) || dateBehind(home, now)) return;
    if (!home.lastSeenMs || now - home.lastSeenMs >= CLOCK_WRITE_MS) home.lastSeenMs = now;
    if (today && (!home.lastSeenDate || today > home.lastSeenDate)) home.lastSeenDate = today;
  }

  function rollDays(home, now) {
    if (clockBehind(home, now) || dateBehind(home, now)) return;
    var today = dateKey(new Date(now));
    if (!today) return;
    if (home.wheel.date && today > home.wheel.date && home.wheel.pending.length === 0) {
      home.wheel.date = today;
      home.wheel.used = 0;
    }
    if (!home.wheel.date) home.wheel.date = today;
    if (home.tasks.date && today > home.tasks.date) {
      var prevTasks = home.tasks;
      home.tasks = emptyTasks(today);
      var taskPlain = plainApi();
      if (taskPlain) taskPlain.absorb(home.tasks, prevTasks, 0);
    }
    if (!home.tasks.date) home.tasks.date = today;
  }

  function grantSegment(data, segmentId) {
    var seg = segmentById(segmentId);
    if (!seg) return null;
    if (seg.kind === 'coins') data.coins = Math.max(0, (data.coins | 0) + seg.amount);
    else if (seg.kind === 'gems') data.home.gems += seg.amount;
    else if (seg.kind === 'power' && data.home.powers[seg.power] != null) data.home.powers[seg.power] += seg.amount;
    return { id: seg.id, label: seg.label, kind: seg.kind, amount: seg.amount };
  }

  function applyPending(data) {
    var home = data.home;
    if (!home || !home.wheel || !home.wheel.pending.length) return [];
    var applied = [];
    var pending = home.wheel.pending.slice();
    home.wheel.pending = [];
    for (var i = 0; i < pending.length; i++) {
      var reward = grantSegment(data, pending[i].segment);
      if (reward) applied.push({ id: pending[i].id, reward: reward });
    }
    return applied;
  }

  function ensure(data, now) {
    data.home = normalize(data.home);
    var applied = applyPending(data);
    rollDays(data.home, now);
    observe(data.home, now);
    return applied;
  }

  function bonusAvailable(data, now) {
    ensure(data, now);
    var home = data.home;
    var today = dateKey(new Date(now));
    if (!today) return false;
    if (home.bonus.lastClaim && today <= home.bonus.lastClaim) return false;
    if (dateBehind(home, now)) return false;
    if (clockBehind(home, now)) return false;
    return true;
  }

  function nextStreak(home, today) {
    var last = home.bonus.lastClaim;
    if (last && addDays(last, 1) === today) return home.bonus.streak >= 7 ? 1 : home.bonus.streak + 1;
    return 1;
  }

  function claimBonus(data, now) {
    if (!bonusAvailable(data, now)) return { ok: false, coins: 0, gems: 0, streak: data.home.bonus.streak };
    var today = dateKey(new Date(now));
    var streak = nextStreak(data.home, today);
    var reward = BONUS[streak - 1];
    data.home.bonus = { lastClaim: today, streak: streak };
    data.coins = Math.max(0, (data.coins | 0) + reward.coins);
    data.home.gems += reward.gems;
    observe(data.home, now);
    return { ok: true, coins: reward.coins, gems: reward.gems, streak: streak, day: reward.day };
  }

  function spinsLeft(data, now) {
    ensure(data, now);
    if (clockBehind(data.home, now) || dateBehind(data.home, now)) return 0;
    return Math.max(0, SPINS_PER_DAY - data.home.wheel.used);
  }

  function pickSegment(rng) {
    var roll = typeof rng === 'function' ? rng() : Math.random();
    if (!(roll >= 0 && roll < 1)) roll = 0;
    var total = 0;
    for (var i = 0; i < SEGMENTS.length; i++) total += SEGMENTS[i].weight;
    var cursor = roll * total;
    for (var s = 0; s < SEGMENTS.length; s++) {
      cursor -= SEGMENTS[s].weight;
      if (cursor < 0) return SEGMENTS[s];
    }
    return SEGMENTS[SEGMENTS.length - 1];
  }

  function wheelSliceDeg() { return 360 / SEGMENTS.length; }

  function restAngle(index, offsetDeg, turns) {
    var slice = wheelSliceDeg();
    var limit = slice / 2 - 8;
    var off = typeof offsetDeg === 'number' && isFinite(offsetDeg) ? offsetDeg : 0;
    if (off > limit) off = limit;
    if (off < -limit) off = -limit;
    var spinTurns = turns == null ? 5 : turns;
    // Slices are drawn clockwise from the top. A positive container angle
    // turns clockwise, so segment i reaches the pointer by rotating back.
    return spinTurns * 360 - index * slice + off;
  }

  function labelOffset(index, angleDeg) {
    var slice = Math.PI * 2 / SEGMENTS.length;
    var mid = -Math.PI / 2 + index * slice;
    var x = Math.cos(mid) * 108;
    var y = Math.sin(mid) * 108;
    var a = angleDeg * Math.PI / 180;
    var cos = Math.cos(a);
    var sin = Math.sin(a);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  }

  function segmentAtPointer(angleDeg) {
    var best = 0;
    var bestScore = 1e9;
    for (var i = 0; i < SEGMENTS.length; i++) {
      var p = labelOffset(i, angleDeg);
      var score = p.y + Math.abs(p.x) * 0.02;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  function beginSpin(data, now, rng) {
    data.home = normalize(data.home);
    if (data.home.wheel.pending.length) return { ok: false, reason: 'pending' };
    var left = spinsLeft(data, now);
    if (clockBehind(data.home, now) || dateBehind(data.home, now)) return { ok: false, reason: 'clock' };
    if (left <= 0) return { ok: false, reason: 'none' };
    if (data.home.wheel.pending.length) return { ok: false, reason: 'pending' };
    var seg = pickSegment(rng);
    data.home.wheel.used += 1;
    var spin = { id: data.home.wheel.date + ':' + data.home.wheel.used, segment: seg.id };
    data.home.wheel.pending.push(spin);
    note(data, 'spins', 1, now);
    return { ok: true, spin: spin, segment: { id: seg.id, label: seg.label, kind: seg.kind, amount: seg.amount } };
  }

  function note(data, kind, amount, now) {
    if (!data) return false;
    data.home = normalize(data.home);
    if (now != null) rollDays(data.home, now);
    var task = null;
    for (var i = 0; i < TASKS.length; i++) if (TASKS[i].id === kind) task = TASKS[i];
    if (!task) return false;
    var n = amount | 0;
    if (n <= 0) return false;
    var cur = data.home.tasks.progress[kind] | 0;
    var next = Math.min(task.target, cur + n);
    if (next === cur) return false;
    data.home.tasks.progress[kind] = next;
    return true;
  }

  function tasksDone(home) {
    var n = 0;
    for (var i = 0; i < TASKS.length; i++) {
      var task = TASKS[i];
      if ((home.tasks.progress[task.id] | 0) >= task.target) n++;
    }
    return n;
  }

  function tasksIncomplete(data, now) {
    ensure(data, now);
    for (var i = 0; i < TASKS.length; i++) {
      var task = TASKS[i];
      if (!task.live) continue;
      if ((data.home.tasks.progress[task.id] | 0) < task.target) return true;
    }
    return false;
  }

  function milestoneReady(data, index, now) {
    ensure(data, now);
    var spec = MILESTONES[index];
    if (!spec) return false;
    if (data.home.tasks.milestones[index]) return false;
    return tasksDone(data.home) >= spec.need;
  }

  function claimMilestone(data, index, now) {
    if (!milestoneReady(data, index, now)) return { ok: false, coins: 0, gems: 0 };
    var spec = MILESTONES[index];
    data.home.tasks.milestones[index] = true;
    data.coins = Math.max(0, (data.coins | 0) + spec.coins);
    data.home.gems += spec.gems;
    return { ok: true, coins: spec.coins, gems: spec.gems };
  }

  function tasksClaimable(data, now) {
    var n = 0;
    for (var i = 0; i < MILESTONES.length; i++) if (milestoneReady(data, i, now)) n++;
    return n;
  }

  function popupQueue(data, now) {
    ensure(data, now);
    var queue = [];
    if (bonusAvailable(data, now)) queue.push('bonus');
    if (tasksIncomplete(data, now)) queue.push('tasks');
    if (spinsLeft(data, now) > 0) queue.push('wheel');
    return queue;
  }

  function msUntilMidnight(now) {
    var d = new Date(now);
    var next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
    var ms = next.getTime() - d.getTime();
    return ms > 0 ? ms : 0;
  }

  function countdownLabel(now) {
    var ms = msUntilMidnight(now);
    var hours = Math.floor(ms / 3600000);
    var mins = Math.floor((ms % 3600000) / 60000);
    return hours + 'h ' + pad(mins) + 'm';
  }

  function spinIndex(id) {
    var m = /:(\d+)$/.exec(String(id || ''));
    return m ? +m[1] : 0;
  }

  function sideHas(side, id) {
    for (var i = 0; i < side.pending.length; i++) if (side.pending[i].id === id) return true;
    return false;
  }

  function consumed(side, id) {
    if (side.date !== id.slice(0, 10)) return false;
    return side.used >= spinIndex(id) && !sideHas(side, id);
  }

  function pendingOwed(id, a, b) {
    var aHas = sideHas(a, id);
    var bHas = sideHas(b, id);
    if (!aHas && !bHas) return false;
    if (aHas && consumed(b, id)) return false;
    if (bHas && consumed(a, id)) return false;
    return true;
  }

  function mergeWheel(a, b, aWins) {
    var aDate = a.date || '';
    var bDate = b.date || '';
    var base;
    var other;
    if (aDate !== bDate) {
      base = aDate > bDate ? a : b;
      other = base === a ? b : a;
    } else {
      base = aWins ? a : b;
      other = aWins ? b : a;
    }
    var pending = [];
    var seen = {};
    function take(side) {
      for (var i = 0; i < side.pending.length; i++) {
        var item = side.pending[i];
        if (seen[item.id] || !pendingOwed(item.id, a, b)) continue;
        seen[item.id] = true;
        pending.push(clone(item));
      }
    }
    take(base);
    take(other);
    var used = aDate === bDate ? Math.max(a.used, b.used) : base.used;
    for (var p = 0; p < pending.length; p++) {
      if ((base.date || '') === pending[p].id.slice(0, 10)) used = Math.max(used, spinIndex(pending[p].id));
    }
    if (used > WHEEL_HISTORY_MAX) used = WHEEL_HISTORY_MAX;
    return { date: base.date, used: used, pending: pending };
  }

  function mergeTasks(a, b) {
    var aDate = a.date || '';
    var bDate = b.date || '';
    if (aDate !== bDate) return clone(aDate > bDate ? a : b);
    var progress = {};
    TASKS.forEach(function (task) {
      progress[task.id] = Math.max(a.progress[task.id] | 0, b.progress[task.id] | 0);
    });
    return {
      date: a.date,
      progress: progress,
      milestones: [0, 1, 2].map(function (i) { return !!(a.milestones[i] || b.milestones[i]); })
    };
  }

  function mergeBonus(a, b) {
    if (!a.lastClaim) return { lastClaim: b.lastClaim, streak: b.lastClaim ? b.streak : 0 };
    if (!b.lastClaim) return { lastClaim: a.lastClaim, streak: a.streak };
    if (a.lastClaim === b.lastClaim) return { lastClaim: a.lastClaim, streak: Math.max(a.streak, b.streak) };
    return a.lastClaim > b.lastClaim ? { lastClaim: a.lastClaim, streak: a.streak } : { lastClaim: b.lastClaim, streak: b.streak };
  }

  function mergeHome(localHome, remoteHome, localWinsState) {
    var local = normalize(localHome);
    var remote = normalize(remoteHome);
    var state = localWinsState ? local : remote;
    var lastSeenMs = Math.max(local.lastSeenMs, remote.lastSeenMs);
    var lastSeenDate = local.lastSeenDate && remote.lastSeenDate
      ? (local.lastSeenDate > remote.lastSeenDate ? local.lastSeenDate : remote.lastSeenDate)
      : (local.lastSeenDate || remote.lastSeenDate);
    return {
      v: HOME_VERSION,
      lastSeenMs: lastSeenMs,
      lastSeenDate: lastSeenDate,
      gems: state.gems,
      powers: { wide: state.powers.wide, multi: state.powers.multi },
      bonus: mergeBonus(local.bonus, remote.bonus),
      wheel: mergeWheel(local.wheel, remote.wheel, !!localWinsState),
      tasks: mergeTasks(local.tasks, remote.tasks)
    };
  }

  function hasHomeProgress(home) {
    var h = normalize(home);
    if (h.gems > 0) return true;
    if (h.powers.wide > 0 || h.powers.multi > 0) return true;
    if (h.bonus.lastClaim || h.bonus.streak > 0) return true;
    if (h.wheel.used > 0 || h.wheel.pending.length > 0) return true;
    var progress = h.tasks.progress;
    if (progress.clears || progress.challenge || progress.chest || progress.spins || progress.powerups) return true;
    if (h.tasks.milestones[0] || h.tasks.milestones[1] || h.tasks.milestones[2]) return true;
    return false;
  }

  function attach(PB) {
    var Save = PB.Save;
    if (!Save || Save._homeAttached) return;
    Save._homeAttached = true;
    var origLoad = Save.load;
    Save.load = function () {
      var data = origLoad.apply(this, arguments);
      var applied = ensure(data, Date.now());
      if (applied.length) {
        PB.Home.recovered = applied;
        this.persist();
      }
      return data;
    };
    var origReset = Save.reset;
    Save.reset = function () {
      var result = origReset.apply(this, arguments);
      this.data.home = defaultHome();
      this.persist();
      return result;
    };
    var origTrack = Save.track;
    Save.track = function (type, amount, isMax) {
      var result = origTrack.apply(this, arguments);
      if (!isMax && (type === 'clears' || type === 'powerups')) note(this.data, type, amount, Date.now());
      return result;
    };
    var appliedNow = ensure(Save.data, Date.now());
    if (appliedNow.length) {
      PB.Home.recovered = appliedNow;
      Save.persist();
    }
  }

  return {
    HOME_VERSION: HOME_VERSION,
    CLOCK_SKEW_MS: CLOCK_SKEW_MS,
    BONUS: BONUS,
    SEGMENTS: SEGMENTS,
    TASKS: TASKS,
    MILESTONES: MILESTONES,
    dateKey: dateKey,
    addDays: addDays,
    defaultHome: defaultHome,
    normalize: normalize,
    validateHome: validateHome,
    ensure: ensure,
    bonusAvailable: bonusAvailable,
    claimBonus: claimBonus,
    SPINS_PER_DAY: SPINS_PER_DAY,
    WHEEL_HISTORY_MAX: WHEEL_HISTORY_MAX,
    spinsLeft: spinsLeft,
    pickSegment: pickSegment,
    restAngle: restAngle,
    segmentAtPointer: segmentAtPointer,
    beginSpin: beginSpin,
    applyPending: applyPending,
    note: note,
    tasksDone: tasksDone,
    tasksIncomplete: tasksIncomplete,
    milestoneReady: milestoneReady,
    claimMilestone: claimMilestone,
    tasksClaimable: tasksClaimable,
    popupQueue: popupQueue,
    msUntilMidnight: msUntilMidnight,
    countdownLabel: countdownLabel,
    mergeHome: mergeHome,
    hasHomeProgress: hasHomeProgress,
    attach: attach
  };
});
