/*
 * PRISMBURST — ads.js
 * Rewarded ads. DemoAdProvider is offline, draws its own art, and never
 * contacts a network. A future AdMob provider can replace it through
 * PB.Ads.setProvider({ showRewarded: function (placement) { return Promise } }).
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.PB) return;
  var PB = window.PB;

  var SCRIPTS = [
    [
      { at: 0, text: 'POV: you said one more level…' },
      { at: 0.34, text: 'then every prism brick shattered' },
      { at: 0.68, text: 'tap to play PRISMBURST' }
    ],
    [
      { at: 0, text: 'I only opened it for a second' },
      { at: 0.34, text: 'now the whole wall is prism' },
      { at: 0.68, text: 'tap to play' }
    ],
    [
      { at: 0, text: 'nobody warned me about the gold cores' },
      { at: 0.34, text: 'one more clear. just one.' },
      { at: 0.68, text: 'tap to play PRISMBURST' }
    ]
  ];

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function prismAvatar() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 200 220');
    svg.setAttribute('class', 'pb-ad-avatar');
    svg.setAttribute('aria-hidden', 'true');
    function shape(tag, attrs) {
      var node = document.createElementNS(ns, tag);
      Object.keys(attrs).forEach(function (key) { node.setAttribute(key, attrs[key]); });
      svg.appendChild(node);
    }
    shape('polygon', { points: '100,16 170,56 170,140 100,180 30,140 30,56', fill: '#1b1440', stroke: '#22e8ff', 'stroke-width': '6' });
    shape('polygon', { points: '100,46 142,70 142,120 100,144 58,120 58,70', fill: '#ff3df0' });
    shape('polygon', { points: '100,60 128,76 120,110 100,120 80,110 72,76', fill: '#ffe7a3' });
    shape('circle', { cx: '86', cy: '96', r: '6', fill: '#0b1028' });
    shape('circle', { cx: '114', cy: '96', r: '6', fill: '#0b1028' });
    shape('rect', { x: '76', y: '170', width: '48', height: '30', rx: '12', fill: '#22e8ff' });
    return svg;
  }

  function drawClip(ctx, w, h, seconds, still) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#120a28';
    ctx.fillRect(0, 0, w, h);
    var cols = 6, rows = 4, bw = 34, bh = 16;
    var gx = Math.round((w - cols * (bw + 6)) / 2);
    var phase = still ? 0.15 : (seconds % 2.4);
    var colors = ['#22e8ff', '#ff3df0', '#ffd166', '#9b6bff'];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var delay = (r * cols + c) * 0.07;
        var p = still ? 0 : Math.max(0, Math.min(1, (phase - delay) / 0.4));
        var x = gx + c * (bw + 6);
        var y = 28 + r * (bh + 8) + p * 46;
        ctx.globalAlpha = 1 - p * 0.9;
        ctx.fillStyle = colors[(r + c) % colors.length];
        ctx.fillRect(x, y, bw, bh);
        if (p > 0.15) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + p * 18, y - p * 14, 5, 5);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function DemoAdProvider() {}

  DemoAdProvider.prototype.showRewarded = function (placement) {
    var duration = PB.Ads.durationMs > 0 ? PB.Ads.durationMs : 15000;
    var index = PB.Ads.scriptIndex;
    if (index == null || index < 0 || index >= SCRIPTS.length) index = Math.floor(Math.random() * SCRIPTS.length);
    var script = SCRIPTS[index];
    var reduce = false;
    try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduce = false; }
    return new Promise(function (resolve) {
      var root = el('div');
      root.id = 'pb-ad';
      var frame = el('div', reduce ? 'pb-ad-frame' : 'pb-ad-frame is-live');
      frame.appendChild(el('div', 'pb-ad-badge', 'Demo ad'));
      var count = el('div', 'pb-ad-count', String(Math.ceil(duration / 1000)));
      frame.appendChild(count);
      frame.appendChild(prismAvatar());
      var canvas = el('canvas', 'pb-ad-clip');
      canvas.width = 320;
      canvas.height = 220;
      frame.appendChild(canvas);
      var caption = el('div', 'pb-ad-caption', script[0].text);
      frame.appendChild(caption);
      var close = el('button', 'pb-ad-close', 'Close');
      close.type = 'button';
      frame.appendChild(close);
      var word = el('div', 'pb-ad-word', 'PRISMBURST');
      frame.appendChild(word);
      if (placement) frame.setAttribute('data-placement', String(placement));
      root.appendChild(frame);
      document.body.appendChild(root);
      var ctx = canvas.getContext('2d');
      var started = Date.now();
      var settled = false;
      var raf = 0;
      function finish(completed) {
        if (settled) return;
        settled = true;
        if (raf) cancelAnimationFrame(raf);
        if (root.parentNode) root.parentNode.removeChild(root);
        resolve({ completed: !!completed });
      }
      function frameTick() {
        if (settled) return;
        var elapsed = Date.now() - started;
        var frac = Math.min(1, elapsed / duration);
        var line = script[0].text;
        for (var i = 0; i < script.length; i++) if (frac >= script[i].at) line = script[i].text;
        if (caption.textContent !== line) caption.textContent = line;
        var left = Math.max(0, Math.ceil((duration - elapsed) / 1000));
        count.textContent = left ? String(left) : 'Ready';
        if (ctx) drawClip(ctx, canvas.width, canvas.height, elapsed / 1000, reduce);
        if (elapsed >= duration) {
          close.textContent = 'Continue';
          return;
        }
        raf = requestAnimationFrame(frameTick);
      }
      if (reduce && ctx) drawClip(ctx, canvas.width, canvas.height, 0, true);
      close.addEventListener('click', function () {
        finish(Date.now() - started >= duration);
      });
      raf = requestAnimationFrame(frameTick);
    });
  };

  var provider = new DemoAdProvider();
  PB.Ads = {
    durationMs: 15000,
    scriptIndex: null,
    scripts: SCRIPTS,
    DemoAdProvider: DemoAdProvider,
    setProvider: function (next) { if (next && typeof next.showRewarded === 'function') provider = next; },
    showRewarded: function (placement) {
      return Promise.resolve(provider.showRewarded(placement)).then(function (result) {
        return { completed: !!(result && result.completed) };
      });
    }
  };
})();
