/*
 * PRISMBURST — Pixel Tunnel screens.
 * DOM chrome around the canvas: selector, HUD, pause, clear, and game over.
 * There is no launch button. The stick launches itself.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.PTUI = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(action, text) {
    var node = el('button', 'pt-btn', text);
    node.type = 'button';
    node.setAttribute('data-pt', action);
    return node;
  }

  function mount(handlers) {
    var root = el('div', 'pt-root');
    root.id = 'pt-root';
    var style = document.createElement('style');
    style.textContent = [
      '#pt-root{display:none;position:fixed;inset:0;z-index:40;background:#080808;color:#f3f3f3;font-family:Trebuchet MS,Segoe UI,sans-serif;touch-action:none}',
      '#pt-root [hidden]{display:none !important}',
      '#pt-root.pt-open{display:block}',
      '#pt-root *{box-sizing:border-box}',
      '.pt-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#080808}',
      '#pt-canvas{height:100%;width:auto;max-width:100%;background:#080808;touch-action:none;display:block}',
      '.pt-hud{position:absolute;top:4px;left:6px;right:40px;display:flex;gap:8px;font-size:11px;line-height:16px;color:#e8e8e8;text-shadow:0 1px 0 #000;pointer-events:none}',
      '.pt-pause{position:absolute;top:2px;right:4px;width:32px;height:22px;padding:0;font-size:12px}',
      '.pt-hint{position:absolute;left:0;right:0;bottom:18px;text-align:center;color:#cfcfcf;font-size:11px;pointer-events:none;text-shadow:0 1px 0 #000}',
      '.pt-controls{position:absolute;left:4px;right:4px;bottom:2px;display:none;gap:4px}',
      '#pt-root.pt-debug .pt-controls{display:flex}',
      '.pt-btn{background:#1a1a1a;color:#fff;border:1px solid #555;border-radius:6px;padding:4px;font-size:10px;font-weight:700}',
      '.pt-scroll{overflow:auto;touch-action:pan-y}',
      '.pt-mask{position:absolute;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:12px}',
      '.pt-card{width:min(360px,100%);background:#121212;border:1px solid #555;border-radius:12px;padding:14px;text-align:center}',
      '.pt-card h2{margin:0 0 8px;font-size:22px}',
      '.pt-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin-top:8px}',
      '.pt-lv{aspect-ratio:1;border-radius:6px;border:1px solid #444;background:#1b1b1b;color:#fff;font-weight:700}',
      '.pt-lv.lock{opacity:.35}',
      '.pt-lv.clear{border-color:#FFD900;color:#FFE98A}',
      '.pt-row{display:flex;gap:6px;justify-content:center;margin-top:10px;flex-wrap:wrap}',
      '.pt-help{display:none}'
    ].join('');
    document.head.appendChild(style);

    var top = el('div', 'pt-top');
    var classic = button('classic', '');
    classic.classList.add('pt-tab');
    classic.appendChild(document.createTextNode('Classic Odyssey'));
    classic.appendChild(el('small', '', 'Already Live'));
    var here = button('mode', '');
    here.classList.add('pt-tab', 'on');
    here.appendChild(document.createTextNode('Pixel Tunnel'));
    here.appendChild(el('small', '', '40 levels'));
    top.appendChild(classic);
    top.appendChild(here);

    var hud = el('div', 'pt-hud');
    var levelEl = el('b', '');
    levelEl.id = 'pt-level';
    var scoreEl = el('b', '');
    scoreEl.id = 'pt-score';
    var livesEl = el('b', '');
    livesEl.id = 'pt-lives';
    hud.appendChild(levelEl);
    hud.appendChild(scoreEl);
    hud.appendChild(livesEl);
    var pauseBtn = button('pause', 'II');
    pauseBtn.classList.add('pt-pause');

    var stage = el('div', 'pt-stage');
    var canvas = el('canvas', '');
    canvas.id = 'pt-canvas';
    stage.appendChild(canvas);
    var hint = el('div', 'pt-hint', '');

    var controls = el('div', 'pt-controls');
    controls.appendChild(button('entrance', 'FIND'));
    controls.appendChild(button('demo', 'DEMO'));
    if (window.PB && window.PB.BUILD && window.PB.BUILD.debugUnlock === true) root.classList.add('pt-debug');

    var help = el('div', 'pt-help');
    var details = el('details', '');
    details.appendChild(el('summary', '', 'How to play / kaise khelen'));
    details.appendChild(el('p', '', 'Move Stick to Auto Launch. Tap = 1 Brick. Combo 3 = +3 drop and extra balls from the stick. The safety bar covers the floor for 10 sec.'));
    details.appendChild(el('p', '', 'Stick hilao, ball khud launch hogi. Tap se sirf 1 brick tootta hai. Combo 3 par +3 girta hai aur nayi balls stick se nikalti hain. Safety bar 10 sec neeche ka raasta band karta hai.'));
    var ref = el('details', '');
    ref.appendChild(el('summary', '', 'Reference notes'));
    ref.appendChild(el('p', '', 'Look and rewards follow the studied clips (grey outlines, open mouths, paddle multiball, red safety bar). Combo timing, scores, and the yellow-target win are the written defaults. Nothing here is claimed to match a frame exactly. See docs/pixel-tunnel/REFERENCE-ANALYSIS.md.'));
    help.appendChild(details);
    help.appendChild(ref);

    root.appendChild(stage);
    root.appendChild(hud);
    root.appendChild(pauseBtn);
    root.appendChild(hint);
    root.appendChild(controls);

    var levels = mask('Choose a level');
    var grid = el('div', 'pt-grid');
    levels.card.appendChild(grid);
    levels.card.appendChild(el('p', '', 'Cleared levels show a gold edge. The next one unlocks when you clear.'));
    var back = button('close-levels', 'Back');
    levels.card.appendChild(back);
    root.appendChild(levels.mask);

    var pause = mask('Paused');
    var pauseRow = el('div', 'pt-row');
    pauseRow.appendChild(button('resume', 'Resume'));
    pauseRow.appendChild(button('reset', 'Reset'));
    pauseRow.appendChild(button('levels', 'Levels'));
    pauseRow.appendChild(button('classic', 'Classic'));
    pause.card.appendChild(pauseRow);
    root.appendChild(pause.mask);

    var win = mask('Level Clear');
    win.title.id = 'pt-win-title';
    var winBody = el('p', '');
    winBody.id = 'pt-win-body';
    win.card.appendChild(winBody);
    var winRow = el('div', 'pt-row');
    winRow.appendChild(button('next', 'Next'));
    winRow.appendChild(button('replay', 'Replay'));
    winRow.appendChild(button('menu', 'Menu'));
    win.card.appendChild(winRow);
    root.appendChild(win.mask);

    var lose = mask('Game Over');
    var loseRow = el('div', 'pt-row');
    loseRow.appendChild(button('retry', 'Retry'));
    loseRow.appendChild(button('menu', 'Menu'));
    lose.card.appendChild(loseRow);
    root.appendChild(lose.mask);

    function mask(title) {
      var cover = el('div', 'pt-mask');
      cover.hidden = true;
      var card = el('div', 'pt-card');
      var heading = el('h2', '', title);
      card.appendChild(heading);
      cover.appendChild(card);
      return { mask: cover, card: card, title: heading };
    }

    root.addEventListener('click', function (event) {
      var node = event.target.closest('[data-pt], [data-level]');
      if (!node) return;
      if (node.getAttribute('data-level')) handlers.level(+node.getAttribute('data-level'));
      else handlers.action(node.getAttribute('data-pt'));
    });
    root.addEventListener('touchmove', function (event) {
      var scroller = event.target.closest && event.target.closest('.pt-scroll, .pt-mask');
      if (!scroller && event.cancelable) event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    document.body.appendChild(root);

    function show(which) {
      levels.mask.hidden = which !== 'levels';
      pause.mask.hidden = which !== 'pause';
      win.mask.hidden = which !== 'win';
      lose.mask.hidden = which !== 'lose';
      if (which === 'levels') levels.mask.classList.add('pt-scroll');
    }

    function fillLevels(progress, openAll) {
      grid.textContent = '';
      for (var n = 1; n <= 40; n++) {
        var rec = progress.levels[String(n)];
        var locked = n > progress.unlocked && !openAll;
        var label = String(n);
        if (rec && rec.cleared) label += ' ' + starText(rec.stars);
        var node = el('button', 'pt-lv' + (locked ? ' lock' : '') + (rec && rec.cleared ? ' clear' : ''), label);
        node.type = 'button';
        node.setAttribute('data-level', String(n));
        if (locked) node.disabled = true;
        grid.appendChild(node);
      }
    }

    function starText(n) {
      var s = '';
      for (var i = 0; i < n; i++) s += '*';
      return s;
    }

    function sync(snap, flags) {
      levelEl.textContent = snap.id + ' ' + snap.name;
      scoreEl.textContent = String(snap.score);
      var dots = '';
      var shown = Math.min(3, snap.lives);
      for (var i = 0; i < shown; i++) dots += '\u25CF';
      if (snap.lives > 3) dots += '+' + (snap.lives - 3);
      livesEl.textContent = dots || '\u25CB';
      hint.textContent = snap.message || (snap.hint ? 'Move' : '');
      var demoBtn = root.querySelector('[data-pt="demo"]');
      if (demoBtn) demoBtn.textContent = flags.demo ? 'DEMO ON' : 'DEMO';
    }

    function setWin(snap) {
      winBody.textContent = 'Score ' + snap.score + '   ' + starText(snap.stars || 1);
    }

    return {
      root: root,
      canvas: canvas,
      show: show,
      fillLevels: fillLevels,
      sync: sync,
      setWin: setWin,
      open: function () { root.classList.add('pt-open'); },
      close: function () { root.classList.remove('pt-open'); }
    };
  }

  return { mount: mount };
});
