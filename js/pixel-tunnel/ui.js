/*
 * PRISMBURST — Pixel Tunnel chrome.
 * Hearts, ball count, and buttons sit in the bottom band, outside the field.
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
      '#pt-root{display:none;position:fixed;inset:0;z-index:40;background:#363636;color:#f3f3f3;font-family:Trebuchet MS,Segoe UI,sans-serif;touch-action:none}',
      '#pt-root [hidden]{display:none !important}',
      '#pt-root.pt-open{display:block}',
      '#pt-root *{box-sizing:border-box}',
      '.pt-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#363636}',
      '#pt-canvas{height:100%;width:auto;max-width:100%;background:#363636;touch-action:none;display:block;image-rendering:pixelated}',
      '.pt-hud{position:absolute;left:0;right:0;bottom:0;height:11%;display:flex;align-items:center;justify-content:space-between;gap:4px;padding:0 6px;background:#363636;color:#f3f3f3;font-size:11px}',
      '.pt-stats{display:flex;gap:8px;white-space:nowrap}',
      '.pt-actions{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}',
      '.pt-btn{background:#2A2A2A;color:#fff;border:1px solid #666;border-radius:6px;padding:4px 6px;font-size:10px;font-weight:700}',
      '.pt-btn.on{border-color:#F0C84A;color:#F0C84A}',
      '.pt-mask{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px}',
      '.pt-card{width:min(320px,100%);background:#3A3A3A;border-radius:16px;padding:16px;text-align:center}',
      '.pt-card h2{margin:0 0 6px;font-size:22px}',
      '.pt-row{display:flex;gap:6px;justify-content:center;margin-top:10px;flex-wrap:wrap}'
    ].join('');
    document.head.appendChild(style);

    var stage = el('div', 'pt-stage');
    var canvas = el('canvas', '');
    canvas.id = 'pt-canvas';
    stage.appendChild(canvas);

    var hud = el('div', 'pt-hud');
    var stats = el('div', 'pt-stats');
    var livesEl = el('b', '');
    livesEl.id = 'pt-lives';
    var ballsEl = el('b', '');
    ballsEl.id = 'pt-balls';
    var pctEl = el('b', '');
    pctEl.id = 'pt-pct';
    stats.appendChild(livesEl);
    stats.appendChild(ballsEl);
    stats.appendChild(pctEl);
    var actions = el('div', 'pt-actions');
    actions.appendChild(button('pause', 'Pause'));
    actions.appendChild(button('reset', 'Reset'));
    var demoBtn = button('demo', 'Auto Demo');
    demoBtn.id = 'pt-demo';
    actions.appendChild(demoBtn);
    actions.appendChild(button('menu', 'Menu'));
    hud.appendChild(stats);
    hud.appendChild(actions);

    var pause = mask('Paused');
    var pauseRow = el('div', 'pt-row');
    pauseRow.appendChild(button('resume', 'Resume'));
    pauseRow.appendChild(button('reset', 'Reset'));
    pauseRow.appendChild(button('menu', 'Menu'));
    pause.card.appendChild(pauseRow);

    var win = mask('Congratulations');
    var winSub = el('p', '', 'You win!');
    winSub.id = 'pt-win-body';
    win.card.appendChild(winSub);
    var winRow = el('div', 'pt-row');
    winRow.appendChild(button('next', 'Next'));
    winRow.appendChild(button('replay', 'Replay'));
    winRow.appendChild(button('menu', 'Menu'));
    win.card.appendChild(winRow);

    var lose = mask('Out of lives');
    var loseRow = el('div', 'pt-row');
    loseRow.appendChild(button('retry', 'Retry'));
    loseRow.appendChild(button('menu', 'Menu'));
    lose.card.appendChild(loseRow);

    root.appendChild(stage);
    root.appendChild(hud);
    root.appendChild(pause.mask);
    root.appendChild(win.mask);
    root.appendChild(lose.mask);

    root.addEventListener('click', function (event) {
      var node = event.target.closest('[data-pt]');
      if (!node) return;
      handlers.action(node.getAttribute('data-pt'));
    });

    document.body.appendChild(root);

    function show(which) {
      pause.mask.hidden = which !== 'pause';
      win.mask.hidden = which !== 'win';
      lose.mask.hidden = which !== 'lose';
    }

    function hearts(n) {
      var s = '';
      var i;
      var shown = n < 0 ? 0 : n;
      for (i = 0; i < shown && i < 5; i++) s += '\u2665';
      if (!s) s = '\u2661';
      return s;
    }

    function sync(snap) {
      livesEl.textContent = hearts(snap.lives);
      ballsEl.textContent = snap.balls + ' balls';
      pctEl.textContent = snap.percent + '%';
      demoBtn.textContent = snap.demo ? 'Demo on' : 'Auto Demo';
      demoBtn.classList.toggle('on', !!snap.demo);
    }

    function setWin(snap) {
      winSub.textContent = 'You win!    ' + (snap.stars || 3) + ' stars    ' + snap.score;
    }

    return {
      root: root,
      canvas: canvas,
      show: show,
      sync: sync,
      setWin: setWin,
      open: function () { root.classList.add('pt-open'); },
      close: function () { root.classList.remove('pt-open'); }
    };
  }

  function mask(title) {
    var cover = el('div', 'pt-mask');
    cover.hidden = true;
    var card = el('div', 'pt-card');
    card.appendChild(el('h2', '', title));
    cover.appendChild(card);
    return { mask: cover, card: card };
  }

  return { mount: mount };
});
