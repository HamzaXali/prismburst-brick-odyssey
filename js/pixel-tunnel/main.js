/*
 * PRISMBURST — Pixel Tunnel entry.
 * Isolated from Classic. The repo is plain JavaScript and Phaser, so this
 * mode is a Canvas 2D overlay instead of a TypeScript/Vite bundle.
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

  function levelsOpen() {
    return !!(PB.levelsOpen && PB.levelsOpen());
  }

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
      move: function (x) { if (match && !paused) match.movePaddle(x, true); },
      tap: function (x, y) { if (match && !paused) match.tap(x, y); }
    });
    PB.PTView = PB.PTRenderer.create(ui.canvas);
    window.addEventListener('keydown', onKey);
  }

  function onKey(event) {
    if (!ui || !ui.root.classList.contains('pt-open') || !match || paused) return;
    if (event.key === 'ArrowLeft') match.movePaddle(match.state.paddle.x - 28, true);
    else if (event.key === 'ArrowRight') match.movePaddle(match.state.paddle.x + 28, true);
    else return;
    event.preventDefault();
  }

  function onAction(name) {
    if (name === 'classic' || name === 'menu' || name === 'close-levels') {
      if (name === 'classic' || name === 'menu') close();
      else if (match) ui.show('');
      return;
    }
    if (name === 'levels') { ui.fillLevels(progress, levelsOpen()); ui.show('levels'); return; }
    if (name === 'pause') { paused = true; ui.show('pause'); return; }
    if (name === 'resume') { paused = false; ui.show(''); return; }
    if (name === 'reset' || name === 'replay' || name === 'retry') {
      if (match) startLevel(match.state.level.id, true);
      return;
    }
    if (name === 'next' && match) {
      startLevel(Math.min(40, match.state.level.id + 1), false);
      return;
    }
    if (name === 'entrance') {
      progress.settings.findEntrance = !progress.settings.findEntrance;
      progress = store.save(progress);
      if (match) match.state.findEntrance = progress.settings.findEntrance;
      return;
    }
    if (name === 'demo') {
      if (match) match.setDemo(!match.state.demo);
    }
  }

  function startLevel(id, force) {
    if (id < 1 || id > 40) return;
    if (!force && id > progress.unlocked && !levelsOpen()) return;
    var level = levels.buildLevel(id);
    match = gameApi.createMatch(level, { audio: audioApi.create(soundOn), demo: false });
    match.state.findEntrance = !!(progress.settings && progress.settings.findEntrance);
    progress.current = id;
    progress = store.save(progress);
    paused = false;
    ui.show('');
    ui.fillLevels(progress, levelsOpen());
    PB.PTView.draw(match.state);
  }

  function frame(now) {
    if (!running) return;
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    var guard = 0;
    while (acc >= 1 / 60 && guard++ < 4) {
      if (match && !paused && !match.state.lost) match.step(1 / 60);
      acc -= 1 / 60;
    }
    if (match) {
      PB.PTView.draw(match.state);
      var snap = match.snapshot();
      ui.sync(snap, { demo: match.state.demo, find: !!match.state.findEntrance });
      if (snap.won && !match.state._saved && !PB.PixelTunnel.holdOverlay) {
        match.state._saved = true;
        progress = store.record(progress, snap.id, snap.score, snap.stars, true);
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
    if (!match) startLevel(progress.current || 1, true);
    ui.fillLevels(progress, levelsOpen());
    ui.show('levels');
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
      startLevel(id, true);
      if (!running) {
        running = true;
        last = 0;
        raf = window.requestAnimationFrame(frame);
      }
    },
    snapshot: function () { return match ? match.snapshot() : null; },
    debugState: function () {
      if (!match) return null;
      return {
        demo: match.state.demo,
        paddle: { x: match.state.paddle.x, y: match.state.paddle.y, w: match.state.paddle.w, h: match.state.paddle.h },
        rewards: match.state.rewards.map(function (r) { return { k: r.kind, x: r.x, y: r.y }; }),
        safety: match.state.safety
      };
    },
    stream: function () { if (match) match.stream(); },
    tick: function () {
      if (match && !paused && !match.state.lost) match.step(1 / 60);
      if (match && PB.PTView) PB.PTView.draw(match.state);
      return match ? match.snapshot() : null;
    },
    bench: function (seconds) {
      return new Promise(function (resolve) {
        if (!match) return resolve(null);
        match.stream();
        var start = 0;
        var frames = 0;
        function tick(now) {
          if (!start) start = now;
          frames++;
          if (now - start >= seconds * 1000) {
            var snap = match.snapshot();
            resolve({ fps: frames / ((now - start) / 1000), balls: snap.balls, score: snap.score, won: snap.won });
          } else window.requestAnimationFrame(tick);
        }
        window.requestAnimationFrame(tick);
      });
    },
    fastForward: function (seconds) {
      if (!match) return null;
      var steps = Math.max(1, Math.round(seconds * 60));
      for (var i = 0; i < steps; i++) {
        if (match.state.won || match.state.lost) break;
        match.step(1 / 60);
      }
      if (match.state.won && !match.state._saved) {
        match.state._saved = true;
        progress = store.record(progress, match.state.level.id, match.state.score, match.state.stars || 1, true);
      }
      if (match.state.won && ui) {
        ui.setWin(match.snapshot());
        ui.show('win');
      }
      PB.PTView.draw(match.state);
      return match.snapshot();
    },
    setDemo: function (on) { if (match) match.setDemo(on); },
    config: cfg.CONFIG
  };
})();
