/*
 * PRISMBURST — Pixel Tunnel entry.
 * Isolated from Classic. Canvas 2D overlay, one data-driven level.
 */
(function () {
  'use strict';
  var PB = window.PB = window.PB || {};
  var cfg = PB.PTConfig;
  var levels = PB.PTLevels;
  var store = PB.PTStorage;
  var gameApi = PB.PTGame;
  var audioApi = PB.PTAudio;

  var ui = null;
  var match = null;
  var progress = null;
  var running = false;
  var paused = false;
  var raf = 0;
  var acc = 0;
  var last = 0;
  var unbind = null;

  function soundOn() {
    if (progress && progress.settings && progress.settings.sound === false) return false;
    var save = PB.Save && PB.Save.data;
    if (save && save.settings && save.settings.sound === false) return false;
    return true;
  }

  function ensure() {
    if (ui) return;
    ui = PB.PTUI.mount({
      action: onAction,
      level: function (n) { startLevel(n, false); }
    });
    unbind = PB.PTInput.bind(ui.canvas, {
      move: function (x) { if (match && !paused && !match.state.demo) match.movePaddle(x); }
    });
    PB.PTView = PB.PTRenderer.create(ui.canvas);
    window.addEventListener('keydown', onKey);
  }

  function onKey(event) {
    if (!ui || !ui.root.classList.contains('pt-open') || !match || paused) return;
    if (event.key === 'ArrowLeft') match.movePaddle(match.state.paddleX - 28);
    else if (event.key === 'ArrowRight') match.movePaddle(match.state.paddleX + 28);
    else return;
    event.preventDefault();
  }

  function onAction(name) {
    if (name === 'menu' || name === 'classic') { close(); return; }
    if (name === 'pause') { paused = true; ui.show('pause'); return; }
    if (name === 'resume') { paused = false; ui.show(''); return; }
    if (name === 'styles' || name === 'close-styles') {
      if (name === 'styles') {
        ui.fillStyles(progress, levels.list());
        ui.show('styles');
        paused = true;
      } else if (match) {
        ui.show('');
        paused = false;
      }
      return;
    }
    if (name === 'next' && match) {
      var nextId = match.state.level.id + 1;
      if (nextId <= levels.count() && progress.unlocked >= nextId) startLevel(nextId, false);
      else startLevel(match.state.level.id, true);
      return;
    }
    if (name === 'reset' || name === 'replay' || name === 'retry') {
      startLevel(match && match.state.level.id || 1, true);
      return;
    }
    if (name === 'demo' && match) {
      match.setDemo(!match.state.demo);
      ui.sync(match.snapshot());
    }
  }

  function startLevel(id, force) {
    id = id || 1;
    if (!force && id > progress.unlocked) return;
    var level = levels.buildLevel(id);
    match = gameApi.createMatch(level, { audio: audioApi.create(soundOn), demo: false });
    progress.current = level.id;
    progress = store.save(progress);
    paused = false;
    ui.show('');
    if (PB.PTView) PB.PTView.draw(match.state);
  }

  function frame(now) {
    if (!running) return;
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    var guard = 0;
    while (acc >= 1 / 60 && guard++ < 4) {
      if (match && !paused && !match.state.lost && !match.state.won && !PB.PixelTunnel.holdSim) match.step(1 / 60);
      acc -= 1 / 60;
    }
    if (match) {
      PB.PTView.draw(match.state);
      var snap = match.snapshot();
      ui.sync(snap);
      if (snap.won && !match.state._saved && !PB.PixelTunnel.holdOverlay) {
        match.state._saved = true;
        progress = store.record(progress, snap.id, snap.score, snap.stars || cfg.CONFIG.WIN_STARS, true);
        ui.setWin(snap);
        ui.show('win');
        paused = true;
      } else if (snap.lost && !match.state._saved) {
        match.state._saved = true;
        progress = store.record(progress, snap.id, snap.score, 0, false);
        ui.show('lose');
        paused = true;
      }
    }
    raf = window.requestAnimationFrame(frame);
  }

  function open() {
    ensure();
    progress = store.load();
    ui.open();
    ui.fillStyles(progress, levels.list());
    ui.show('styles');
    paused = true;
    if (!running) {
      running = true;
      last = 0;
      raf = window.requestAnimationFrame(frame);
    }
  }

  function close() {
    if (!ui) return;
    ui.close();
    ui.show('');
    paused = false;
  }

  PB.PixelTunnel = {
    open: open,
    close: close,
    startLevel: function (id) {
      ensure();
      progress = progress || store.load();
      ui.open();
      startLevel(id || 1, true);
      if (!running) {
        running = true;
        last = 0;
        raf = window.requestAnimationFrame(frame);
      }
    },
    snapshot: function () { return match ? match.snapshot() : null; },
    debugState: function () { return match ? match.state : null; },
    setDemo: function (on) { if (match) match.setDemo(on); },
    fastForward: function (seconds) {
      if (!match) return null;
      var steps = Math.max(1, Math.round(seconds * 60));
      var i;
      for (i = 0; i < steps; i++) {
        if (match.state.won || match.state.lost) break;
        match.step(1 / 60);
      }
      if (match.state.won && !match.state._saved && !PB.PixelTunnel.holdOverlay) {
        match.state._saved = true;
        progress = store.record(progress, match.state.level.id, match.state.score, match.state.stars || cfg.CONFIG.WIN_STARS, true);
        ui.setWin(match.snapshot());
        ui.show('win');
      }
      PB.PTView.draw(match.state);
      return match.snapshot();
    },
    config: cfg.CONFIG
  };
})();
