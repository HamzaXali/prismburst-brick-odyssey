/*
 * PRISMBURST — Pixel Tunnel pointer input.
 * A drag or touch moves the paddle. There is no launch button and no tap-to-break.
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
    var active = false;
    function go(event) {
      var p = point(canvas, event);
      if (handlers.move) handlers.move(p.x);
      if (event.cancelable) event.preventDefault();
    }
    function start(event) {
      active = true;
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
      }
      go(event);
    }
    function drag(event) {
      if (!active) return;
      go(event);
    }
    function end() { active = false; }
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', drag);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    return function () {
      canvas.removeEventListener('pointerdown', start);
      canvas.removeEventListener('pointermove', drag);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointercancel', end);
    };
  }

  return { bind: bind };
});
