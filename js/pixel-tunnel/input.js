/*
 * PRISMBURST — Pixel Tunnel pointer and key input.
 * A drag moves the stick. The first move past the threshold launches.
 * A small tap is not a launch unless it hits a mouth or a neighbouring brick.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.PTInput = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function point(canvas, event) {
    var src = event.touches && event.touches[0] ? event.touches[0] : event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : event;
    var box = canvas.getBoundingClientRect();
    var sx = box.width || canvas.width;
    var sy = box.height || canvas.height;
    return {
      x: (src.clientX - box.left) * canvas.width / sx,
      y: (src.clientY - box.top) * canvas.height / sy
    };
  }

  function bind(canvas, handlers) {
    var down = null;
    var moved = 0;
    function start(event) {
      down = point(canvas, event);
      moved = 0;
    }
    function drag(event) {
      if (!down) return;
      var p = point(canvas, event);
      moved = Math.max(moved, Math.abs(p.x - down.x));
      if (handlers.move) handlers.move(p.x);
      if (event.cancelable) event.preventDefault();
    }
    function end(event) {
      if (!down) return;
      var p = point(canvas, event);
      if (moved < 6 && handlers.tap) handlers.tap(p.x, p.y);
      down = null;
    }
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', drag);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', function () { down = null; });
    return function () {
      canvas.removeEventListener('pointerdown', start);
      canvas.removeEventListener('pointermove', drag);
      canvas.removeEventListener('pointerup', end);
    };
  }

  return { bind: bind };
});
