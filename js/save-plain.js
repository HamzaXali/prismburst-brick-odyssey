/*
 * PRISMBURST — save-plain.js
 * JSON bounds for saves. Known fields are checked by save-sync, home, and shop.
 * Anything else is kept so an older build does not drop data a newer build stored.
 * Values must be plain JSON: no functions, no non-finite numbers, and no
 * __proto__, constructor, or prototype keys. Depth and total size are capped.
 * These values are data only. Do not place them in page HTML.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.SavePlain = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var MAX_DEPTH = 12;
  var MAX_BYTES = 65536;
  var ENVELOPE = ['save_version', 'client_updated_at'];

  function fail(msg) { return { ok: false, error: msg }; }

  function byteLength(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    return text.length;
  }

  function danger(key) {
    return key === '__proto__' || key === 'constructor' || key === 'prototype';
  }

  function isObj(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function copyValue(value, depth) {
    if (depth > MAX_DEPTH) return fail('save is nested too deeply');
    if (value === null) return { ok: true, value: null };
    var t = typeof value;
    if (t === 'string' || t === 'boolean') return { ok: true, value: value };
    if (t === 'number') {
      if (!isFinite(value)) return fail('save has a non-JSON number');
      return { ok: true, value: value };
    }
    if (t !== 'object') return fail('save has a non-JSON value');
    if (Array.isArray(value)) {
      var arr = [];
      for (var i = 0; i < value.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(value, i)) return fail('save has a non-JSON value');
        var item = copyValue(value[i], depth + 1);
        if (!item.ok) return item;
        arr.push(item.value);
      }
      return { ok: true, value: arr };
    }
    var out = {};
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      if (danger(keys[k])) return fail('save has a forbidden key');
      var child = copyValue(value[keys[k]], depth + 1);
      if (!child.ok) return child;
      out[keys[k]] = child.value;
    }
    return { ok: true, value: out };
  }

  /* Copy keys the destination does not already have. Recurse into objects and
   * into arrays of objects that line up index by index. skip applies only here. */
  function absorb(dest, src, depth, skip) {
    if (depth > MAX_DEPTH) return fail('save is nested too deeply');
    if (Array.isArray(dest) && Array.isArray(src)) {
      if (dest.length !== src.length) return { ok: true };
      for (var i = 0; i < dest.length; i++) {
        if (isObj(dest[i]) && isObj(src[i])) {
          var row = absorb(dest[i], src[i], depth + 1);
          if (!row.ok) return row;
        }
      }
      return { ok: true };
    }
    if (!isObj(dest) || !isObj(src)) return { ok: true };
    var keys = Object.keys(src);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (danger(key)) return fail('save has a forbidden key');
      if (skip && skip.indexOf(key) >= 0) continue;
      if (!Object.prototype.hasOwnProperty.call(dest, key)) {
        var copied = copyValue(src[key], depth + 1);
        if (!copied.ok) return copied;
        dest[key] = copied.value;
        continue;
      }
      if (isObj(dest[key]) && isObj(src[key])) {
        var nested = absorb(dest[key], src[key], depth + 1);
        if (!nested.ok) return nested;
      } else if (Array.isArray(dest[key]) && Array.isArray(src[key])) {
        var arr = absorb(dest[key], src[key], depth + 1);
        if (!arr.ok) return arr;
      }
    }
    return { ok: true, dest: dest };
  }

  /* Union of keys the strict merge did not already decide. A key only one side
   * has is copied as stored. A scalar on both sides follows remoteNewer. */
  function mergeUnknown(dest, local, remote, remoteNewer, depth) {
    if (depth > MAX_DEPTH) return fail('save is nested too deeply');
    if (Array.isArray(dest)) {
      for (var i = 0; i < dest.length; i++) {
        if (!isObj(dest[i])) continue;
        var row = mergeUnknown(dest[i], local && isObj(local[i]) ? local[i] : null, remote && isObj(remote[i]) ? remote[i] : null, remoteNewer, depth + 1);
        if (!row.ok) return row;
      }
      return { ok: true };
    }
    if (!isObj(dest)) return { ok: true };
    var seen = {};
    function mark(side) {
      if (!isObj(side)) return;
      var ks = Object.keys(side);
      for (var n = 0; n < ks.length; n++) seen[ks[n]] = true;
    }
    mark(local);
    mark(remote);
    var keys = Object.keys(seen);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (danger(key)) return fail('save has a forbidden key');
      var hasL = isObj(local) && Object.prototype.hasOwnProperty.call(local, key);
      var hasR = isObj(remote) && Object.prototype.hasOwnProperty.call(remote, key);
      var lv = hasL ? local[key] : undefined;
      var rv = hasR ? remote[key] : undefined;
      if (Object.prototype.hasOwnProperty.call(dest, key)) {
        if (isObj(dest[key])) {
          var child = mergeUnknown(dest[key], isObj(lv) ? lv : null, isObj(rv) ? rv : null, remoteNewer, depth + 1);
          if (!child.ok) return child;
        } else if (Array.isArray(dest[key])) {
          var arr = mergeUnknown(dest[key], Array.isArray(lv) ? lv : null, Array.isArray(rv) ? rv : null, remoteNewer, depth + 1);
          if (!arr.ok) return arr;
        }
        continue;
      }
      if (hasL && hasR && isObj(lv) && isObj(rv)) {
        var box = {};
        var both = mergeUnknown(box, lv, rv, remoteNewer, depth + 1);
        if (!both.ok) return both;
        dest[key] = box;
      } else if (hasL || hasR) {
        var pick = hasL && hasR ? (remoteNewer ? rv : lv) : (hasL ? lv : rv);
        var copied = copyValue(pick, depth + 1);
        if (!copied.ok) return copied;
        dest[key] = copied.value;
      }
    }
    return { ok: true, dest: dest };
  }

  return {
    MAX_DEPTH: MAX_DEPTH,
    MAX_BYTES: MAX_BYTES,
    ENVELOPE: ENVELOPE,
    byteLength: byteLength,
    copyValue: copyValue,
    absorb: absorb,
    mergeUnknown: mergeUnknown
  };
});
