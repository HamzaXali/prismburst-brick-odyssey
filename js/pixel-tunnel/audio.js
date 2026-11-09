/*
 * PRISMBURST — Pixel Tunnel beeps. WebAudio only, no files.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.PTAudio = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function create(getOn) {
    var ctx = null;
    function ac() {
      if (ctx) return ctx;
      var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { ctx = null; }
      return ctx;
    }
    function tone(freq, dur, type, gain) {
      if (getOn && !getOn()) return;
      var audio = ac();
      if (!audio) return;
      if (audio.state === 'suspended') {
        try { audio.resume(); } catch (e) { /* ignore */ }
      }
      var t = audio.currentTime;
      var osc = audio.createOscillator();
      var g = audio.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain || 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    return {
      launch: function () { tone(520, 0.08, 'square', 0.05); },
      brick: function () { tone(180, 0.04, 'square', 0.03); },
      yellow: function () { tone(880, 0.1, 'square', 0.05); },
      reward: function () { tone(660, 0.12, 'triangle', 0.06); },
      hurt: function () { tone(110, 0.2, 'sawtooth', 0.04); },
      win: function () { tone(660, 0.12, 'square', 0.05); tone(880, 0.18, 'square', 0.05); },
      lose: function () { tone(160, 0.28, 'sawtooth', 0.05); }
    };
  }

  return { create: create };
});
