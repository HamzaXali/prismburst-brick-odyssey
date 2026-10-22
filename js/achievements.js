/*
 * PRISMBURST — achievements.js
 * Badges unlocked from progress already in the save: campaign clears,
 * finished worlds, 3-star counts, and a no-life-lost
 * clear. Old saves gain the badges they already earned on first load.
 * That backfill does not toast and does not change the coin balance.
 * A toast and the one-time coin gift happen when a clear during this
 * session newly crosses a line. Cloud merge unions the unlocked set and
 * the paid set, so a gift is not paid twice.
 * Names are drawn with Phaser text. They are never written as HTML.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.Achievements = api;
    if (root.PB.Save) api.attach(root.PB);
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var plain = null;
  var levelsMod = null;
  if (typeof require === 'function') {
    try { plain = require('./save-plain.js'); } catch (e) { plain = null; }
    try { levelsMod = require('../levels.js'); } catch (e2) { levelsMod = null; }
  }
  function plainApi() {
    if (plain) return plain;
    var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    return g.PB && g.PB.SavePlain || null;
  }

  var ID_RE = /^[a-z0-9-]{1,32}$/;
  var MAX_FLAGS = 64;
  var COLORS = [0x22e8ff, 0xff3df0, 0xffd166, 0x9b6bff, 0x7dffa6];
  var DEFS = [
    { id: 'clear-1', name: 'First Clear', kind: 'clears', need: 1, coins: 15 },
    { id: 'clear-5', name: 'Five Facets', kind: 'clears', need: 5, coins: 20 },
    { id: 'clear-10', name: 'Ten Prisms', kind: 'clears', need: 10, coins: 25 },
    { id: 'clear-20', name: 'World Complete', kind: 'clears', need: 20, coins: 30 },
    { id: 'world-0', name: '', kind: 'world', world: 0, need: 20, coins: 25 },
    { id: 'world-1', name: '', kind: 'world', world: 1, need: 20, coins: 25 },
    { id: 'world-2', name: '', kind: 'world', world: 2, need: 20, coins: 25 },
    { id: 'world-3', name: '', kind: 'world', world: 3, need: 20, coins: 25 },
    { id: 'world-4', name: '', kind: 'world', world: 4, need: 20, coins: 25 },
    { id: 'stars-1', name: 'Perfect Break', kind: 'stars3', need: 1, coins: 15 },
    { id: 'stars-10', name: 'Ten Perfects', kind: 'stars3', need: 10, coins: 25 },
    { id: 'stars-25', name: 'Star Lattice', kind: 'stars3', need: 25, coins: 40 },
    { id: 'clear-50', name: 'Fifty Levels', kind: 'clears', need: 50, coins: 40 },
    { id: 'clear-100', name: 'Hundred Levels', kind: 'clears', need: 100, coins: 80 },
    { id: 'flawless', name: 'No Life Lost', kind: 'flawless', need: 1, coins: 20 }
  ];
  var BY_ID = {};
  for (var d = 0; d < DEFS.length; d++) BY_ID[DEFS[d].id] = DEFS[d];

  function levelsApi() {
    if (levelsMod) return levelsMod;
    var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    return g.PB_LEVELS || null;
  }

  function worldName(index) {
    var L = levelsApi();
    if (L && L.WORLDS && L.WORLDS[index] && L.WORLDS[index].name) return L.WORLDS[index].name;
    return 'World ' + (index + 1);
  }

  function plainText(value) {
    return String(value == null ? '' : value).replace(/[<>&]/g, '').replace(/[\u0000-\u001f]/g, '').slice(0, 64);
  }

  function displayName(def) {
    if (!def) return '';
    if (def.kind === 'world') return plainText(worldName(def.world) + ' Complete');
    return plainText(def.name);
  }

  function badgeSvg(fill) {
    var color = /^#[0-9a-fA-F]{6}$/.test(fill) ? fill : '#22e8ff';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">'
      + '<polygon points="32,4 58,20 58,44 32,60 6,44 6,20" fill="' + color + '" stroke="#e8fdff" stroke-width="2"/>'
      + '<polygon points="32,16 46,24 46,40 32,48 18,40 18,24" fill="none" stroke="#ffe7a3" stroke-width="2"/>'
      + '</svg>';
  }

  function hexOf(index) {
    var n = COLORS[index % COLORS.length];
    var s = n.toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s;
  }

  function drawBadge(scene, x, y, index, unlocked) {
    var g = scene.add.graphics();
    var color = COLORS[index % COLORS.length];
    var alpha = unlocked ? 1 : 0.28;
    g.fillStyle(color, unlocked ? 0.95 : 0.18);
    g.beginPath();
    g.moveTo(x, y - 26);
    g.lineTo(x + 22, y - 12);
    g.lineTo(x + 22, y + 12);
    g.lineTo(x, y + 26);
    g.lineTo(x - 22, y + 12);
    g.lineTo(x - 22, y - 12);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, unlocked ? 0xe8fdff : 0x6a7098, alpha);
    g.strokePath();
    g.lineStyle(2, 0xffe7a3, unlocked ? 0.9 : 0.25);
    g.beginPath();
    g.moveTo(x, y - 12);
    g.lineTo(x + 12, y - 5);
    g.lineTo(x + 12, y + 8);
    g.lineTo(x, y + 15);
    g.lineTo(x - 12, y + 8);
    g.lineTo(x - 12, y - 5);
    g.closePath();
    g.strokePath();
    return g;
  }

  function defaultAchievements() {
    return { v: 1, unlocked: {}, paid: {}, flawless: false };
  }

  function isStamp(n) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 1 && n <= 1e15;
  }

  function copyFlags(raw, into) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true;
    var keys = Object.keys(raw);
    if (keys.length > MAX_FLAGS) return false;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (!ID_RE.test(key) || !isStamp(raw[key])) return false;
      into[key] = raw[key];
    }
    return true;
  }

  function normalize(raw) {
    var out = defaultAchievements();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    if (!copyFlags(raw.unlocked, out.unlocked)) return defaultAchievements();
    if (!copyFlags(raw.paid, out.paid)) return defaultAchievements();
    out.flawless = raw.flawless === true;
    var api = plainApi();
    if (api) {
      var kept = api.absorb(out, raw, 0);
      if (!kept.ok) return defaultAchievements();
    }
    return out;
  }

  function validate(raw) {
    if (raw == null) return { ok: true, achievements: defaultAchievements() };
    var api = plainApi();
    if (api) {
      var checked = api.copyValue(raw, 0);
      if (!checked.ok) return { ok: false, error: 'achievements are invalid' };
      raw = checked.value;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'achievements are invalid' };
    if (raw.v !== 1) return { ok: false, error: 'achievements are invalid' };
    var unlocked = {};
    var paid = {};
    if (!copyFlags(raw.unlocked, unlocked) || !copyFlags(raw.paid, paid)) return { ok: false, error: 'achievements are invalid' };
    if (typeof raw.flawless !== 'boolean') return { ok: false, error: 'achievements are invalid' };
    var out = { v: 1, unlocked: unlocked, paid: paid, flawless: raw.flawless };
    if (api) {
      var kept = api.absorb(out, raw, 0);
      if (!kept.ok) return { ok: false, error: kept.error || 'achievements are invalid' };
    }
    return { ok: true, achievements: out };
  }

  function unionFlags(a, b) {
    var out = {};
    function take(src) {
      if (!src) return;
      Object.keys(src).forEach(function (key) {
        if (ID_RE.test(key) && isStamp(src[key]) && !out[key]) out[key] = src[key];
      });
    }
    take(a);
    take(b);
    return out;
  }

  function merge(a, b) {
    var la = normalize(a);
    var lb = normalize(b);
    var out = {
      v: 1,
      unlocked: unionFlags(la.unlocked, lb.unlocked),
      paid: unionFlags(la.paid, lb.paid),
      flawless: !!(la.flawless || lb.flawless)
    };
    var api = plainApi();
    if (api) api.mergeUnknown(out, la, lb, false, 0);
    return out;
  }

  function hasProgress(raw) {
    var a = normalize(raw);
    if (a.flawless) return true;
    if (Object.keys(a.unlocked).length) return true;
    return false;
  }

  function campaignRows(data) {
    var rows = [];
    var levels = data && data.levels;
    if (!levels || typeof levels !== 'object') return rows;
    Object.keys(levels).forEach(function (key) {
      var m = /^(\d+)-(\d+)$/.exec(key);
      if (!m) return;
      var rec = levels[key];
      if (!rec || typeof rec !== 'object') return;
      var stars = rec.stars | 0;
      if (stars < 1) return;
      rows.push({ world: +m[1], stars: stars });
    });
    return rows;
  }

  function tally(data) {
    var rows = campaignRows(data);
    var worlds = [0, 0, 0, 0, 0];
    var stars3 = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].world >= 0 && rows[i].world < worlds.length) worlds[rows[i].world]++;
      if (rows[i].stars >= 3) stars3++;
    }
    var ach = data && data.achievements;
    var flawless = !!(ach && ach.flawless) || stars3 > 0;
    return { clears: rows.length, worlds: worlds, stars3: stars3, flawless: flawless ? 1 : 0 };
  }

  function currentOf(data, def) {
    var t = tally(data);
    if (def.kind === 'clears') return t.clears;
    if (def.kind === 'world') return t.worlds[def.world] || 0;
    if (def.kind === 'stars3') return t.stars3;
    if (def.kind === 'flawless') return t.flawless;
    return 0;
  }

  function ensure(data) {
    if (!data || typeof data !== 'object') return defaultAchievements();
    data.achievements = normalize(data.achievements);
    return data.achievements;
  }

  function settle(data, opts) {
    opts = opts || {};
    var ach = ensure(data);
    if (opts.flawless) ach.flawless = true;
    var now = isStamp(opts.now) ? opts.now : Date.now();
    if (now < 1) now = 1;
    var fresh = [];
    for (var i = 0; i < DEFS.length; i++) {
      var def = DEFS[i];
      if (ach.unlocked[def.id]) continue;
      if (currentOf(data, def) < def.need) continue;
      ach.unlocked[def.id] = now;
      fresh.push({ id: def.id, name: displayName(def), coins: def.coins });
      if (!ach.paid[def.id]) {
        if (opts.pay !== false) {
          var add = def.coins | 0;
          data.coins = Math.max(0, (data.coins | 0) + add);
        }
        ach.paid[def.id] = 1;
      }
    }
    return fresh;
  }

  function latest(data) {
    var ach = data && data.achievements;
    if (!ach || !ach.unlocked) return null;
    var best = null;
    var bestT = -1;
    var bestI = -1;
    for (var i = 0; i < DEFS.length; i++) {
      var t = ach.unlocked[DEFS[i].id];
      if (!isStamp(t)) continue;
      if (t > bestT || (t === bestT && i > bestI)) {
        best = DEFS[i];
        bestT = t;
        bestI = i;
      }
    }
    if (!best) return null;
    return { id: best.id, name: displayName(best) };
  }

  function board(data) {
    ensure(data);
    var ach = data.achievements;
    var rows = [];
    for (var i = 0; i < DEFS.length; i++) {
      var def = DEFS[i];
      var current = currentOf(data, def);
      if (current > def.need) current = def.need;
      rows.push({
        id: def.id,
        name: displayName(def),
        current: current,
        need: def.need,
        unlocked: !!ach.unlocked[def.id],
        coins: def.coins,
        color: hexOf(i),
        index: i
      });
    }
    return rows;
  }

  function showToast(scene, name) {
    var PB = (typeof window !== 'undefined' && window.PB) ? window.PB : null;
    if (!PB || !scene || !scene.add) return null;
    var msg = 'Achievement unlocked: ' + plainText(name);
    var layer = scene.add.container(0, 0).setDepth(90);
    var g = scene.add.graphics();
    g.fillStyle(0x14082a, 0.94);
    g.fillRoundedRect(60, 148, 600, 92, 24);
    g.lineStyle(3, 0xffd166, 1);
    g.strokeRoundedRect(60, 148, 600, 92, 24);
    layer.add(g);
    var t = PB.text(scene, 360, 194, msg, 26, '#ffe7a3', { strokeThickness: 0 });
    t.name = 'achievementToast';
    layer.add(t);
    layer.name = 'achievementToastLayer';
    return layer;
  }

  function attach(PB) {
    var Save = PB.Save;
    if (!Save || Save._achAttached) return;
    Save._achAttached = true;
    var origLoad = Save.load;
    Save.load = function () {
      var data = origLoad.apply(this, arguments);
      settle(data, { pay: false });
      return data;
    };
    var origReset = Save.reset;
    Save.reset = function () {
      var result = origReset.apply(this, arguments);
      this.data.achievements = defaultAchievements();
      this.persist();
      return result;
    };
    if (Save.data) settle(Save.data, { pay: false });
  }

  return {
    DEFS: DEFS,
    plainText: plainText,
    badgeSvg: badgeSvg,
    drawBadge: drawBadge,
    displayName: displayName,
    defaultAchievements: defaultAchievements,
    normalize: normalize,
    validate: validate,
    merge: merge,
    hasProgress: hasProgress,
    ensure: ensure,
    settle: settle,
    latest: latest,
    board: board,
    tally: tally,
    showToast: showToast,
    attach: attach
  };
});
