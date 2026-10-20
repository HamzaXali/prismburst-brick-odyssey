/*
 * PRISMBURST — profile.js
 * Display names. No network. The game save prismburst.save.v1 is not used.
 * A guest name lives in prismburst.profile.v1. An account name lives in
 * public.profiles and is loaded by js/cloud.js.
 *
 * Names are 3–20 Unicode graphemes, also at most 20 code points so the
 * database char_length check agrees. Control and format characters, and
 * the markup characters < and >, are rejected. An email address or the
 * part before the @ is never used as a name.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.Profile = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var KEY = 'prismburst.profile.v1';
  var MIN = 3;
  var MAX = 20;

  function graphemeCount(value) {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      var count = 0;
      var segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value);
      var iterator = segments[Symbol.iterator]();
      while (!iterator.next().done) count += 1;
      return count;
    }
    return Array.from(value).length;
  }

  function forbiddenChar(value) {
    if (value.indexOf('<') !== -1 || value.indexOf('>') !== -1) return true;
    var i;
    for (i = 0; i < value.length; i++) {
      var code = value.charCodeAt(i);
      if (code <= 31 || (code >= 127 && code <= 159)) return true;
    }
    try {
      if (/\p{Cc}|\p{Cf}/u.test(value)) return true;
    } catch (e) { /* property escapes unavailable; the loop above still blocks C0/C1 */ }
    return false;
  }

  function validate(raw) {
    var name = String(raw == null ? '' : raw).trim();
    if (!name) return { ok: false, name: '', error: 'Enter a display name.' };
    if (forbiddenChar(name)) return { ok: false, name: '', error: 'That name has characters that are not allowed.' };
    var graphs = graphemeCount(name);
    var points = Array.from(name).length;
    if (graphs < MIN || graphs > MAX || points < MIN || points > MAX) {
      return { ok: false, name: '', error: 'Use 3 to 20 characters.' };
    }
    return { ok: true, name: name, error: '' };
  }

  function isEmailish(name, email) {
    if (!email) return false;
    var low = String(name).toLowerCase();
    var mail = String(email).trim().toLowerCase();
    if (!mail) return false;
    if (low === mail) return true;
    var at = mail.indexOf('@');
    return at > 0 && low === mail.slice(0, at);
  }

  function suggest(metadata, guestName, email) {
    var meta = metadata || {};
    var list = [];
    if (typeof meta.full_name === 'string') list.push(meta.full_name);
    if (typeof meta.name === 'string' && meta.name !== meta.full_name) list.push(meta.name);
    if (typeof guestName === 'string') list.push(guestName);
    var i;
    for (i = 0; i < list.length; i++) {
      var checked = validate(list[i]);
      if (!checked.ok) continue;
      if (isEmailish(checked.name, email)) continue;
      return checked.name;
    }
    return '';
  }

  function randomGuestName() {
    return 'PrismPlayer' + String(1000 + Math.floor(Math.random() * 9000));
  }

  function storage() {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage;
    } catch (e) { return null; }
  }

  function guestName() {
    var store = storage();
    if (!store) return '';
    try {
      var raw = store.getItem(KEY);
      if (!raw) return '';
      var parsed = JSON.parse(raw);
      var checked = validate(parsed && parsed.displayName);
      return checked.ok ? checked.name : '';
    } catch (e) { return ''; }
  }

  function writeGuest(name) {
    var checked = validate(name);
    if (!checked.ok) return checked;
    var store = storage();
    if (!store) return { ok: false, name: '', error: 'This browser cannot store a name.' };
    try {
      store.setItem(KEY, JSON.stringify({ v: 1, displayName: checked.name }));
    } catch (e) {
      return { ok: false, name: '', error: 'Could not store the name on this device.' };
    }
    return checked;
  }

  function ensureGuest() {
    var existing = guestName();
    if (existing) return existing;
    var created = writeGuest(randomGuestName());
    return created.ok ? created.name : '';
  }

  return {
    KEY: KEY,
    MIN: MIN,
    MAX: MAX,
    graphemeCount: graphemeCount,
    validate: validate,
    suggest: suggest,
    isEmailish: isEmailish,
    randomGuestName: randomGuestName,
    guestName: guestName,
    writeGuest: writeGuest,
    ensureGuest: ensureGuest
  };
});
