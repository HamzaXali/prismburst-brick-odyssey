/*
 * PRISMBURST — Pixel Tunnel progress.
 * Dedicated key prismburst.pixel-tunnel.v1, mirrored onto
 * prismburst.save.v1.pixelTunnel. Never removes or replaces the classic save.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.PTStorage = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var KEY = 'prismburst.pixel-tunnel.v1';
  var CLASSIC_KEY = 'prismburst.save.v1';
  var LEVELS = 40;

  function isObj(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function defaults() {
    return {
      v: 1,
      unlocked: 1,
      current: 1,
      levels: {},
      settings: { findEntrance: false, sound: true }
    };
  }

  function clampLevel(n) {
    n = n | 0;
    if (n < 1) return 1;
    if (n > LEVELS) return LEVELS;
    return n;
  }

  function normalize(raw) {
    var out = defaults();
    if (!isObj(raw)) return out;
    out.unlocked = clampLevel(raw.unlocked || 1);
    out.current = clampLevel(raw.current || 1);
    if (isObj(raw.settings)) {
      out.settings.findEntrance = !!raw.settings.findEntrance;
      out.settings.sound = raw.settings.sound !== false;
    }
    if (isObj(raw.levels)) {
      var keys = Object.keys(raw.levels);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (!/^\d+$/.test(key)) continue;
        var n = +key;
        if (n < 1 || n > LEVELS) continue;
        var rec = raw.levels[key];
        if (!isObj(rec)) continue;
        var best = rec.best | 0;
        var stars = rec.stars | 0;
        if (best < 0) best = 0;
        if (stars < 0) stars = 0;
        if (stars > 3) stars = 3;
        out.levels[key] = { best: best, stars: stars, cleared: !!rec.cleared };
      }
    }
    return out;
  }

  function merge(a, b) {
    if (!isObj(a) && !isObj(b)) return null;
    if (!isObj(a)) return normalize(b);
    if (!isObj(b)) return normalize(a);
    var A = normalize(a);
    var B = normalize(b);
    var levels = {};
    var keys = Object.keys(A.levels).concat(Object.keys(B.levels));
    var seen = {};
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (seen[key]) continue;
      seen[key] = true;
      var L = A.levels[key];
      var R = B.levels[key];
      if (!L) levels[key] = { best: R.best, stars: R.stars, cleared: R.cleared };
      else if (!R) levels[key] = { best: L.best, stars: L.stars, cleared: L.cleared };
      else levels[key] = {
        best: Math.max(L.best, R.best),
        stars: Math.max(L.stars, R.stars),
        cleared: !!(L.cleared || R.cleared)
      };
    }
    var settings = A.unlocked >= B.unlocked ? A.settings : B.settings;
    return {
      v: 1,
      unlocked: Math.max(A.unlocked, B.unlocked),
      current: Math.max(A.current, B.current),
      levels: levels,
      settings: {
        findEntrance: !!settings.findEntrance,
        sound: settings.sound !== false
      }
    };
  }

  function store() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) { /* private mode */ }
    return null;
  }

  function readKey(key) {
    var ls = store();
    if (!ls) return null;
    try {
      var raw = ls.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function classicMirror() {
    var save = (typeof window !== 'undefined' && window.PB && window.PB.Save) ? window.PB.Save : null;
    if (save && isObj(save.data) && isObj(save.data.pixelTunnel)) return save.data.pixelTunnel;
    var data = readKey(CLASSIC_KEY);
    if (isObj(data) && isObj(data.pixelTunnel)) return data.pixelTunnel;
    return null;
  }

  function writeClassic(progress) {
    var save = (typeof window !== 'undefined' && window.PB && window.PB.Save) ? window.PB.Save : null;
    if (save && isObj(save.data)) {
      save.data.pixelTunnel = normalize(progress);
      if (typeof save.persist === 'function') save.persist();
      return;
    }
    var ls = store();
    if (!ls) return;
    var raw = null;
    try { raw = ls.getItem(CLASSIC_KEY); } catch (e) { return; }
    if (!raw) return;
    var data = null;
    try { data = JSON.parse(raw); } catch (e2) { return; }
    if (!isObj(data)) return;
    data.pixelTunnel = normalize(progress);
    try {
      var next = JSON.stringify(data);
      if (next.length >= 65000) return;
      ls.setItem(CLASSIC_KEY, next);
    } catch (e3) { /* keep the previous classic save */ }
  }

  function load() {
    var dedicated = readKey(KEY);
    var merged = merge(dedicated, classicMirror());
    if (!merged) merged = defaults();
    return merged;
  }

  function save(progress) {
    var clean = normalize(progress);
    var ls = store();
    if (ls) {
      try { ls.setItem(KEY, JSON.stringify(clean)); } catch (e) { /* ignore quota */ }
    }
    writeClassic(clean);
    return clean;
  }

  function record(progress, id, score, stars, cleared) {
    var data = normalize(progress);
    var key = String(id);
    var prev = data.levels[key] || { best: 0, stars: 0, cleared: false };
    data.levels[key] = {
      best: Math.max(prev.best, score | 0),
      stars: Math.max(prev.stars, stars | 0),
      cleared: prev.cleared || !!cleared
    };
    if (cleared && id >= data.unlocked && id < LEVELS) data.unlocked = id + 1;
    data.current = clampLevel(id);
    return save(data);
  }

  return {
    KEY: KEY,
    CLASSIC_KEY: CLASSIC_KEY,
    LEVELS: LEVELS,
    defaults: defaults,
    normalize: normalize,
    merge: merge,
    load: load,
    save: save,
    record: record
  };
});
