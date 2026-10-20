/*
 * PRISMBURST — save-sync.js
 * Pure cloud-save helpers. No network and no DOM. Used by js/cloud.js and by
 * node tests (module.exports). Conflict rule (also in docs/CLOUD-SETUP.md):
 *
 * Progress is merged monotonically: unlocked level count per world is the max,
 * per-level best score and stars are the max, owned skins are the union,
 * lifetime stats are the max, and the furthest current level (save.last) is kept.
 * Spendable and state fields — coins, equipped skins, settings, daily reward,
 * and mission state — come from whichever side has the newer client_updated_at.
 * Equal timestamps keep this device's state fields.
 * save.home (Daily Bonus, Lucky Wheel, Daily Tasks) merges by its own dates:
 * the later claim or task day wins, task progress on the same day is the max,
 * a wheel reward still waiting is kept once, and gems follow the newer timestamp.
 * Rewards are not added together.
 * save.shop looks are the union, so a purchase is not lost. Pending boost
 * receipts are the union minus any receipt either side already spent, so a
 * boost is not granted twice and a spent one does not come back. Coins stay
 * on the newer timestamp and are never added together. A level's doubled
 * coin claim is kept if either side has it. Missing shop or doubled fields
 * on an older save stay absent until something new is stored.
* save.dense (Crystal Mass) keeps the higher unlock and the better best
 * score and stars per mass. It is not part of the 5 x 20 campaign. A save
 * that omits dense stays valid and loads as an empty track.
 * Fields this build does not know are not a reason to reject a save. Known
 * fields stay strict. Unknown JSON values are copied through load, merge, and
 * upload so an older build does not drop data a newer build wrote. Functions,
 * non-finite numbers, and __proto__ / constructor / prototype keys are rejected.
 * The whole save must stay under 64 KB and within the depth cap.
 * An explicit "use cloud" choice replaces the device save and is not this merge.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.SaveSync = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var plain = null;
  if (typeof require === 'function') {
    try { plain = require('./save-plain.js'); } catch (e) { plain = null; }
  }
  if (!plain) {
    var rootObj = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    plain = rootObj.PB && rootObj.PB.SavePlain;
  }

  var SAVE_VERSION = 1;
  var SAVE_KEY = 'prismburst.save.v1';
  var MAX_BYTES = 65536;
  var MAX_COINS = 1000000000;
  var MAX_STAT = 1000000000000;
  var MAX_SCORE = 1000000000000000;
  /* Keep these ids in sync with PB.BALL_SKINS and PB.PADDLE_SKINS in js/core.js. */
  var BALLS = ['classic', 'rose', 'venom', 'ember', 'solar', 'void', 'rainbow'];
  var PADDLES = ['classic', 'magenta', 'emerald', 'gold', 'obsidian', 'prism'];
  var LOCAL_KEYS = ['v', 'coins', 'unlocked', 'levels', 'owned', 'equipped', 'settings', 'daily', 'missions', 'stats', 'last', 'home', 'shop', 'dense'];

  function homeApi() {
    var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    if (g.PB && g.PB.Home && g.PB.Home.mergeHome) return g.PB.Home;
    if (typeof require === 'function') {
      try { return require('./home.js'); } catch (e) { return null; }
    }
    return null;
  }

  function shopApi() {
    var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    if (g.PB && g.PB.Shop && g.PB.Shop.merge) return g.PB.Shop;
    if (typeof require === 'function') {
      try { return require('./shop.js'); } catch (e) { return null; }
    }
    return null;
  }

  function shopOf(raw) {
    var api = shopApi();
    if (!api) return raw && typeof raw === 'object' ? raw : null;
    return api.normalize(raw);
  }

  function denseApi() {
    var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    if (g.PB && g.PB.Dense && g.PB.Dense.merge) return g.PB.Dense;
    if (typeof require === 'function') {
      try { return require('./dense.js'); } catch (e) { return null; }
    }
    return null;
  }

  function denseOf(raw) {
    var api = denseApi();
    if (!api) return raw && typeof raw === 'object' ? raw : null;
    return api.normalize(raw);
  }

  function homeOf(raw) {
    var api = homeApi();
    if (!api) return raw && typeof raw === 'object' ? raw : null;
    return api.normalize(raw);
  }

  function defaultBounds() {
    var L = (typeof window !== 'undefined') ? window.PB_LEVELS : null;
    return {
      worlds: L && typeof L.worldCount === 'function' ? L.worldCount() : 5,
      perWorld: L && L.LEVELS_PER_WORLD ? L.LEVELS_PER_WORLD : 20
    };
  }

  function boundsOf(opts) {
    var d = defaultBounds();
    if (!opts) return d;
    return {
      worlds: opts.worlds || d.worlds,
      perWorld: opts.perWorld || d.perWorld
    };
  }

  function isInt(n) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n;
  }

  function fail(msg) { return { ok: false, error: msg }; }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function padUnlocked(list, worlds) {
    var out = [];
    for (var i = 0; i < worlds; i++) {
      var n = list && isInt(list[i]) ? list[i] : 0;
      if (n < 0) n = 0;
      out.push(n);
    }
    if (!out[0]) out[0] = 1;
    return out;
  }

  function validateCloudData(data, opts) {
    var bounds = boundsOf(opts);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('save must be an object');
    if (!plain) return fail('save checker is missing');
    var checked = plain.copyValue(data, 0);
    if (!checked.ok) return checked;
    data = checked.value;
    var encoded;
    try { encoded = JSON.stringify(data); } catch (e) { return fail('save is not serializable'); }
    if (plain.byteLength(encoded) >= MAX_BYTES) return fail('save is larger than 64 KB');
    if (data.save_version !== SAVE_VERSION) return fail('save_version must be 1');
    if (data.v !== 1) return fail('v must be 1');
    if (!isInt(data.coins) || data.coins < 0 || data.coins > MAX_COINS) return fail('coins must be an integer from 0 to 1000000000');
    if (!Array.isArray(data.unlocked) || data.unlocked.length < 1 || data.unlocked.length > bounds.worlds) return fail('unlocked is out of range');
    for (var u = 0; u < data.unlocked.length; u++) {
      if (!isInt(data.unlocked[u]) || data.unlocked[u] < 0 || data.unlocked[u] > bounds.perWorld) return fail('unlocked level count is out of range');
    }
    if (!data.levels || typeof data.levels !== 'object' || Array.isArray(data.levels)) return fail('levels must be an object');
    var levelKeys = Object.keys(data.levels);
    var idCount = 0;
    for (var lc = 0; lc < levelKeys.length; lc++) if (/^\d+-\d+$/.test(levelKeys[lc])) idCount++;
    if (idCount > bounds.worlds * bounds.perWorld) return fail('too many level records');
    var levels = {};
    for (var li = 0; li < levelKeys.length; li++) {
      var key = levelKeys[li];
      var parts = /^(\d+)-(\d+)$/.exec(key);
      if (!parts) continue;
      var world = +parts[1], level = +parts[2];
      if (world >= bounds.worlds || level >= bounds.perWorld) return fail('level id out of bounds ' + key);
      var rec = data.levels[key];
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return fail('bad level record ' + key);
      if ('doubled' in rec && rec.doubled !== true) return fail('bad level record ' + key);
      if (!isInt(rec.best) || rec.best < 0 || rec.best > MAX_SCORE) return fail('bad best score ' + key);
      if (!isInt(rec.stars) || rec.stars < 0 || rec.stars > 3) return fail('bad stars ' + key);
      levels[key] = { best: rec.best, stars: rec.stars };
      if (rec.doubled === true) levels[key].doubled = true;
    }
    if (!data.owned || typeof data.owned !== 'object' || Array.isArray(data.owned)) return fail('owned skins are invalid');
    var owned = { ball: checkSkins(data.owned.ball, BALLS), paddle: checkSkins(data.owned.paddle, PADDLES) };
    if (!owned.ball || !owned.paddle) return fail('owned skins are invalid');
    if (!data.equipped || typeof data.equipped !== 'object' || Array.isArray(data.equipped)) return fail('equipped skins are invalid');
    if (BALLS.indexOf(data.equipped.ball) < 0 || owned.ball.indexOf(data.equipped.ball) < 0) return fail('equipped ball is invalid');
    if (PADDLES.indexOf(data.equipped.paddle) < 0 || owned.paddle.indexOf(data.equipped.paddle) < 0) return fail('equipped paddle is invalid');
    if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) return fail('settings are invalid');
    if (typeof data.settings.sound !== 'boolean' || typeof data.settings.vibration !== 'boolean' || typeof data.settings.shake !== 'boolean') return fail('settings are invalid');
    if (!data.daily || typeof data.daily !== 'object' || Array.isArray(data.daily)) return fail('daily state is invalid');
    if (!(data.daily.last === null || (typeof data.daily.last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.daily.last)))) return fail('daily date is invalid');
    if (!isInt(data.daily.streak) || data.daily.streak < 0 || data.daily.streak > 10000) return fail('daily streak is invalid');
    var missions = checkMissions(data.missions);
    if (!missions) return fail('missions are invalid');
    if (!data.stats || typeof data.stats !== 'object' || Array.isArray(data.stats)) return fail('stats are invalid');
    if (!isInt(data.stats.bricks) || !isInt(data.stats.played) || !isInt(data.stats.cleared)) return fail('stats are invalid');
    if (data.stats.bricks < 0 || data.stats.played < 0 || data.stats.cleared < 0) return fail('stats are invalid');
    if (data.stats.bricks > MAX_STAT || data.stats.played > MAX_STAT || data.stats.cleared > MAX_STAT) return fail('stats are invalid');
    var last = checkLast(data.last, bounds);
    if (last === false) return fail('current level is invalid');
    var shopChecked = null;
    if (data.shop !== undefined) {
      var shopRef = shopApi();
      shopChecked = shopRef ? shopRef.validate(data.shop) : { ok: false, error: 'shop is invalid' };
      if (!shopChecked.ok) return fail(shopChecked.error || 'shop is invalid');
    }
    var denseChecked = null;
    if (data.dense !== undefined) {
      var denseRef = denseApi();
      denseChecked = denseRef ? denseRef.validate(data.dense) : { ok: false, error: 'dense is invalid' };
      if (!denseChecked.ok) return fail(denseChecked.error || 'dense is invalid');
    }
    var homeApiRef = homeApi();
    var homeChecked = homeApiRef ? homeApiRef.validateHome(data.home === undefined ? null : data.home) : { ok: data.home == null, home: data.home || null, error: 'home is invalid' };
    if (!homeChecked.ok) return fail(homeChecked.error || 'home is invalid');
    var updated = data.client_updated_at;
    if (!(updated === null || typeof updated === 'string')) return fail('client_updated_at is invalid');
    if (typeof updated === 'string' && !isFinite(Date.parse(updated))) return fail('client_updated_at is invalid');
    var save = {
        v: 1,
        coins: data.coins,
        unlocked: padUnlocked(data.unlocked, bounds.worlds),
        levels: levels,
        owned: { ball: owned.ball, paddle: owned.paddle },
        equipped: { ball: data.equipped.ball, paddle: data.equipped.paddle },
        settings: { sound: data.settings.sound, vibration: data.settings.vibration, shake: data.settings.shake },
        daily: { last: data.daily.last, streak: data.daily.streak },
        missions: missions,
        stats: { bricks: data.stats.bricks, played: data.stats.played, cleared: data.stats.cleared },
        last: last,
        home: homeChecked.home,
        shop: shopChecked ? shopChecked.shop : shopOf(null),
        dense: denseChecked ? denseChecked.dense : denseOf(null)
    };
    var absorbed = plain.absorb(save, data, 0, plain.ENVELOPE);
    if (!absorbed.ok) return absorbed;
    return {
      ok: true,
      clientUpdatedAt: typeof updated === 'string' ? updated : null,
      save: save
    };
  }

  function checkSkins(list, known) {
    if (!Array.isArray(list) || list.length < 1 || list.length > known.length) return null;
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (known.indexOf(list[i]) < 0 || seen[list[i]]) return null;
      seen[list[i]] = true;
      out.push(list[i]);
    }
    if (!seen.classic) return null;
    return known.filter(function (id) { return seen[id]; });
  }

  function checkMissions(m) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    if (!(m.date === null || (typeof m.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date)))) return null;
    if (!Array.isArray(m.list) || m.list.length > 6) return null;
    var list = [];
    for (var i = 0; i < m.list.length; i++) {
      var item = m.list[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      if (typeof item.type !== 'string' || item.type.length < 1 || item.type.length > 40) return null;
      if (typeof item.text !== 'string' || item.text.length > 80) return null;
      if (!isInt(item.target) || item.target < 1 || item.target > MAX_STAT) return null;
      if (!isInt(item.reward) || item.reward < 0 || item.reward > MAX_COINS) return null;
      if (!isInt(item.progress) || item.progress < 0 || item.progress > item.target) return null;
      if (typeof item.claimed !== 'boolean') return null;
      list.push({ type: item.type, target: item.target, reward: item.reward, text: item.text, progress: item.progress, claimed: item.claimed });
    }
    return { date: m.date, list: list };
  }

  function checkLast(last, bounds) {
    if (last === null) return null;
    if (!last || typeof last !== 'object' || Array.isArray(last)) return false;
    if (!isInt(last.world) || !isInt(last.level)) return false;
    if (last.world < 0 || last.world >= bounds.worlds || last.level < 0 || last.level >= bounds.perWorld) return false;
    return { world: last.world, level: last.level };
  }

  function toCloudData(save, clientUpdatedAt) {
    var body = clone(toLocalSave(save));
    body.save_version = SAVE_VERSION;
    body.client_updated_at = clientUpdatedAt || null;
    return body;
  }

  function toLocalSave(save) {
    var src = save || {};
    var bounds = defaultBounds();
    var out = {
      v: 1,
      coins: isInt(src.coins) ? src.coins : 0,
      unlocked: padUnlocked(src.unlocked, bounds.worlds),
      levels: clone(src.levels || {}),
      owned: {
        ball: (src.owned && src.owned.ball) ? src.owned.ball.slice() : ['classic'],
        paddle: (src.owned && src.owned.paddle) ? src.owned.paddle.slice() : ['classic']
      },
      equipped: {
        ball: src.equipped && src.equipped.ball || 'classic',
        paddle: src.equipped && src.equipped.paddle || 'classic'
      },
      settings: {
        sound: !(src.settings && src.settings.sound === false),
        vibration: !(src.settings && src.settings.vibration === false),
        shake: !(src.settings && src.settings.shake === false)
      },
      daily: {
        last: src.daily && src.daily.last || null,
        streak: src.daily && isInt(src.daily.streak) ? src.daily.streak : 0
      },
      missions: clone(src.missions || { date: null, list: [] }),
      stats: {
        bricks: src.stats && isInt(src.stats.bricks) ? src.stats.bricks : 0,
        played: src.stats && isInt(src.stats.played) ? src.stats.played : 0,
        cleared: src.stats && isInt(src.stats.cleared) ? src.stats.cleared : 0
      },
      last: src.last ? { world: src.last.world | 0, level: src.last.level | 0 } : null,
      home: homeOf(src.home),
      shop: shopOf(src.shop),
      dense: denseOf(src.dense)
    };
    if (plain) plain.absorb(out, src, 0, plain.ENVELOPE);
    return out;
  }

  function sameSave(a, b) {
    return JSON.stringify(toLocalSave(a)) === JSON.stringify(toLocalSave(b));
  }

  function hasProgress(save) {
    if (!save || typeof save !== 'object') return false;
    if ((save.coins | 0) > 0) return true;
    if (save.levels && Object.keys(save.levels).length > 0) return true;
    var stats = save.stats || {};
    if ((stats.bricks | 0) > 0 || (stats.played | 0) > 0 || (stats.cleared | 0) > 0) return true;
    var unlocked = save.unlocked || [];
    for (var i = 0; i < unlocked.length; i++) {
      if (i === 0 ? unlocked[i] > 1 : unlocked[i] > 0) return true;
    }
    var balls = (save.owned && save.owned.ball) || [];
    var pads = (save.owned && save.owned.paddle) || [];
    for (var b = 0; b < balls.length; b++) if (balls[b] !== 'classic') return true;
    for (var p = 0; p < pads.length; p++) if (pads[p] !== 'classic') return true;
    var settings = save.settings || {};
    if (settings.sound === false || settings.vibration === false || settings.shake === false) return true;
    var daily = save.daily || {};
    if ((daily.streak | 0) > 0 || daily.last) return true;
    var missions = (save.missions && save.missions.list) || [];
    for (var m = 0; m < missions.length; m++) if (missions[m] && ((missions[m].progress | 0) > 0 || missions[m].claimed)) return true;
    if (save.last && ((save.last.world | 0) > 0 || (save.last.level | 0) > 0)) return true;
    var api = homeApi();
    if (api && api.hasHomeProgress(save.home)) return true;
    var shop = shopApi();
    if (shop && shop.hasProgress(save.shop)) return true;
    var dense = denseApi();
    if (dense && dense.hasProgress(save.dense)) return true;
    return false;
  }

  function timeMs(iso) {
    if (!iso || typeof iso !== 'string') return 0;
    var t = Date.parse(iso);
    return isFinite(t) ? t : 0;
  }

  function unionSkins(kind, known, a, b) {
    var seen = { classic: true };
    [a, b].forEach(function (side) {
      var list = side && side.owned && side.owned[kind] || [];
      for (var i = 0; i < list.length; i++) if (known.indexOf(list[i]) >= 0) seen[list[i]] = true;
    });
    return known.filter(function (id) { return seen[id]; });
  }

  function furtherLast(a, b, bounds) {
    function ok(pos) {
      return pos && isInt(pos.world) && isInt(pos.level) && pos.world >= 0 && pos.level >= 0 && pos.world < bounds.worlds && pos.level < bounds.perWorld;
    }
    if (!ok(a)) return ok(b) ? { world: b.world, level: b.level } : null;
    if (!ok(b)) return { world: a.world, level: a.level };
    if (a.world !== b.world) return a.world > b.world ? { world: a.world, level: a.level } : { world: b.world, level: b.level };
    return a.level >= b.level ? { world: a.world, level: a.level } : { world: b.world, level: b.level };
  }

  function mergeProgress(localSave, remoteSave, localUpdatedAt, remoteUpdatedAt, opts) {
    var bounds = boundsOf(opts);
    var local = toLocalSave(localSave);
    var remote = toLocalSave(remoteSave);
    var remoteNewer = timeMs(remoteUpdatedAt) > timeMs(localUpdatedAt);
    var state = remoteNewer ? remote : local;
    var unlocked = [];
    for (var i = 0; i < bounds.worlds; i++) {
      var av = local.unlocked[i] || 0;
      var bv = remote.unlocked[i] || 0;
      var n = Math.max(av, bv);
      if (n > bounds.perWorld) n = bounds.perWorld;
      unlocked.push(n);
    }
    if (!unlocked[0]) unlocked[0] = 1;
    var levels = {};
    var keys = Object.keys(local.levels).concat(Object.keys(remote.levels));
    var seen = {};
    for (var k = 0; k < keys.length; k++) {
      var id = keys[k];
      if (seen[id]) continue;
      seen[id] = true;
      var parts = /^(\d+)-(\d+)$/.exec(id);
      if (!parts || +parts[1] >= bounds.worlds || +parts[2] >= bounds.perWorld) {
        if (parts) { delete local.levels[id]; delete remote.levels[id]; }
        continue;
      }
      var lr = local.levels[id] || { best: 0, stars: 0 };
      var rr = remote.levels[id] || { best: 0, stars: 0 };
      var row = { best: Math.max(lr.best | 0, rr.best | 0), stars: Math.max(0, Math.min(3, Math.max(lr.stars | 0, rr.stars | 0))) };
      if (lr.doubled === true || rr.doubled === true) row.doubled = true;
      levels[id] = row;
    }
    var owned = {
      ball: unionSkins('ball', BALLS, local, remote),
      paddle: unionSkins('paddle', PADDLES, local, remote)
    };
    var equipped = {
      ball: owned.ball.indexOf(state.equipped.ball) >= 0 ? state.equipped.ball : 'classic',
      paddle: owned.paddle.indexOf(state.equipped.paddle) >= 0 ? state.equipped.paddle : 'classic'
    };
    var clientUpdatedAt = remoteNewer ? (remoteUpdatedAt || null) : (localUpdatedAt || remoteUpdatedAt || null);
    var merged = {
      client_updated_at: clientUpdatedAt,
      save: {
        v: 1,
        coins: state.coins,
        unlocked: unlocked,
        levels: levels,
        owned: owned,
        equipped: equipped,
        settings: clone(state.settings),
        daily: clone(state.daily),
        missions: clone(state.missions),
        stats: {
          bricks: Math.max(local.stats.bricks, remote.stats.bricks),
          played: Math.max(local.stats.played, remote.stats.played),
          cleared: Math.max(local.stats.cleared, remote.stats.cleared)
        },
        last: furtherLast(local.last, remote.last, bounds),
        shop: (function () {
          var api = shopApi();
          if (!api) return shopOf(remoteNewer ? remote.shop : local.shop);
          return api.merge(local.shop, remote.shop, !remoteNewer);
        })(),
        home: (function () {
          var api = homeApi();
          if (!api) return homeOf(state.home);
          return api.mergeHome(local.home, remote.home, !remoteNewer);
        })(),
        dense: (function () {
          var api = denseApi();
          if (!api) return denseOf(remoteNewer ? remote.dense : local.dense);
          return api.merge(local.dense, remote.dense);
        })()
      }
    };
    if (plain) plain.mergeUnknown(merged.save, local, remote, remoteNewer, 0);
    return merged;
  }

  return {
    SAVE_VERSION: SAVE_VERSION,
    SAVE_KEY: SAVE_KEY,
    MAX_BYTES: MAX_BYTES,
    MAX_DEPTH: plain ? plain.MAX_DEPTH : 12,
    BALLS: BALLS,
    PADDLES: PADDLES,
    validateCloudData: validateCloudData,
    toCloudData: toCloudData,
    toLocalSave: toLocalSave,
    sameSave: sameSave,
    hasProgress: hasProgress,
    mergeProgress: mergeProgress
  };
});
