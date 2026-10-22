/*
 * PRISMBURST — build-flags.js
 * Debug-only switches. The committed file stays off, so GitHub Pages and the
 * release bundle never show the unlock toggle. The debug APK workflow rewrites
 * the www copy after copy-web and before cap sync.
 */
(function (root) {
  'use strict';
  var PB = root.PB = root.PB || {};
  PB.BUILD = { debugUnlock: false, levelsOpen: false };
  PB.levelsOpen = function () {
    var build = PB.BUILD;
    return !!(build && build.debugUnlock === true && build.levelsOpen === true);
  };
})(typeof window !== 'undefined' ? window : globalThis);
