/*
 * PRISMBURST — home-ui.js
 * Home chrome and the startup popup queue. Drawn with the game's own
 * graphics and Phaser text. No external images.
 */
(function () {
  'use strict';
  var PB = window.PB;
  var Home = PB.Home;
  var Save = PB.Save;
  var Sfx = PB.Sfx;
  var W = PB.W;
  var H = PB.H;

  function gemBadge(scene, x, y) {
    var c = scene.add.container(x, y);
    var g = scene.add.graphics();
    g.fillStyle(0x0c1030, 0.85);
    g.fillRoundedRect(-90, -26, 180, 52, 26);
    g.lineStyle(2, 0xb06bff, 0.9);
    g.strokeRoundedRect(-90, -26, 180, 52, 26);
    g.fillStyle(0x22e8ff, 1);
    g.fillTriangle(-70, 6, -54, -12, -38, 6);
    g.fillStyle(0xff3df0, 0.95);
    g.fillTriangle(-70, 6, -38, 6, -54, 16);
    var gems = Save.data.home ? Save.data.home.gems : 0;
    var t = PB.text(scene, 18, 0, String(gems), 30, '#e8d7ff');
    c.add([g, t]);
    c.name = 'gemBadge';
    c.refresh = function () { t.setText(String((Save.data.home && Save.data.home.gems) || 0)); };
    return c;
  }

  function mark(scene, parent, on, name) {
    if (!on) return;
    var dot = scene.add.circle(48, -32, 9, 0xff2e63).setStrokeStyle(2, 0xffffff);
    dot.name = name;
    parent.add(dot);
  }

  function qty(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  var DOTS = { 'rail-bonus': 'dot-bonus', 'rail-tasks': 'dot-tasks', 'rail-wheel': 'dot-wheel' };

  function refreshMarks(scene) {
    if (!scene || !scene.children) return;
    var now = Date.now();
    var flags = {
      'rail-bonus': Home.bonusAvailable(Save.data, now),
      'rail-tasks': Home.tasksClaimable(Save.data, now) > 0,
      'rail-wheel': Home.spinsLeft(Save.data, now) > 0
    };
    var found = {};
    var walk = function (list) {
      (list || []).forEach(function (o) {
        if (flags[o.name] != null) found[o.name] = o;
        if (o.list) walk(o.list);
      });
    };
    walk(scene.children.list);
    Object.keys(flags).forEach(function (name) {
      var parent = found[name];
      if (!parent || !parent.list) return;
      var dotName = DOTS[name];
      var existing = null;
      parent.list.forEach(function (child) { if (child.name === dotName) existing = child; });
      if (existing && !flags[name]) existing.destroy();
      if (!existing && flags[name]) mark(scene, parent, true, dotName);
    });
  }

  function refreshBadges(scene) {
    if (!scene || !scene.children) return;
    var walk = function (list) {
      (list || []).forEach(function (o) {
        if ((o.name === 'coinBadge' || o.name === 'gemBadge') && o.refresh) o.refresh();
        if (o.list) walk(o.list);
      });
    };
    walk(scene.children.list);
  }

  function comingSoon(scene, title) {
    if (scene._soon) scene._soon.destroy();
    var layer = scene.add.container(0, 0).setDepth(40);
    layer.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05061a, 0.78).setInteractive());
    layer.add(PB.panel(scene, W / 2, H / 2, 560, 360, 0x9b6bff));
    layer.add(PB.text(scene, W / 2, H / 2 - 70, title, 40, '#ffffff', { glow: '#9b6bff' }));
    var body = PB.text(scene, W / 2, H / 2, 'Coming soon', 32, '#c9d4ff', { strokeThickness: 0 });
    body.name = 'soonBody';
    layer.add(body);
    var close = PB.button(scene, W / 2, H / 2 + 90, 220, 76, 'Close', function () {
      layer.destroy();
      scene._soon = null;
    }, { color: 0x22e8ff, size: 28 });
    close.name = 'soonClose';
    layer.add(close);
    scene._soon = layer;
  }

  function decorate(scene) {
    var now = Date.now();
    var bonusOn = Home.bonusAvailable(Save.data, now);
    var taskOn = Home.tasksClaimable(Save.data, now) > 0;
    var wheelOn = Home.spinsLeft(Save.data, now) > 0;
    function open(id) {
      Home.mode = { type: 'one', items: [id], index: 0 };
      if (scene.scene.isActive('HomePop')) scene.scene.stop('HomePop');
      scene.scene.launch('HomePop');
      scene.scene.bringToTop('HomePop');
    }
    var railX = 78;
    var bonus = PB.button(scene, railX, 620, 120, 88, 'Bonus', function () { open('bonus'); }, { size: 20, color: 0xffd166 });
    bonus.name = 'rail-bonus';
    mark(scene, bonus, bonusOn, 'dot-bonus');
    var tasks = PB.button(scene, railX, 724, 120, 88, 'Tasks', function () { open('tasks'); }, { size: 20, color: 0x22e8ff });
    tasks.name = 'rail-tasks';
    mark(scene, tasks, taskOn, 'dot-tasks');
    var wheel = PB.button(scene, railX, 828, 120, 88, 'Wheel', function () { open('wheel'); }, { size: 20, color: 0xff3df0 });
    wheel.name = 'rail-wheel';
    mark(scene, wheel, wheelOn, 'dot-wheel');

    var skins = PB.button(scene, W / 2 + 30, 900, 360, 72, 'SKINS', function () { PB.fadeTo(scene, 'Rewards'); }, { size: 26, color: 0xffd166 });
    skins.name = 'skins';

    var barY = 1168;
    var items = [
      ['Shop', function () {
        Home.mode = { type: 'one', items: ['shop'], index: 0 };
        if (scene.scene.isActive('HomePop')) scene.scene.stop('HomePop');
        scene.scene.launch('HomePop');
        scene.scene.bringToTop('HomePop');
      }],
      ['Achievements', function () { open('achievements'); }],
      ['Settings', function () { PB.fadeTo(scene, 'Settings', { from: 'Menu' }); }]
    ];
    items.forEach(function (item, i) {
      var b = PB.button(scene, 130 + i * 230, barY, 210, 78, item[0], item[1], { size: item[0].length > 8 ? 18 : 22, color: 0x9b6bff });
      b.name = 'bar-' + item[0];
    });

    var queue = Home.popupQueue(Save.data, now);
    if (Home.recovered && Home.recovered.length && queue.indexOf('wheel') < 0) queue.unshift('wheel');
    if (!Home.queueStarted && queue.length && !scene.scene.isActive('HomePop')) {
      Home.queueStarted = true;
      Home.mode = { type: 'queue', items: queue, index: 0 };
      scene.scene.launch('HomePop');
      scene.scene.bringToTop('HomePop');
    }
  }

  // ---- Prism Shop drawing helpers (original shapes, drawn with Graphics) ----
  var BOOST_TINT = { life: 0xff4d8d, wide: 0x22e8ff, multi: 0x9b6bff, slow: 0x7dffa6 };
  var BOOST_INFO = { life: '+1 life on the next level', wide: 'Wider paddle next level', multi: 'Start with three balls', slow: 'Slower ball next level' };

  function drawPrismCoin(scene, x, y, r) {
    var g = scene.add.graphics();
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 3;
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    g.fillStyle(0xffb627, 1); g.fillPoints(pts, true);
    g.fillStyle(0xffe7a3, 1);
    g.fillTriangle(x, y - r, x + r * 0.87, y - r * 0.5, x, y);
    g.fillStyle(0xfff6d8, 0.9);
    g.fillTriangle(x, y - r, x - r * 0.87, y - r * 0.5, x, y);
    g.lineStyle(2, 0x8a5a00, 1); g.strokePoints(pts, true);
    return g;
  }

  function shopCard(scene, x, y, w, h, tint, lit) {
    var g = scene.add.graphics();
    g.fillStyle(tint, lit ? 0.22 : 0.1); g.fillRoundedRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 26);
    g.fillStyle(0x0c1034, 0.96); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 22);
    g.fillStyle(0xffffff, 0.05); g.fillRoundedRect(x - w / 2 + 6, y - h / 2 + 6, w - 12, h * 0.38, { tl: 18, tr: 18, bl: 6, br: 6 });
    g.fillStyle(tint, 0.1); g.fillTriangle(x + w / 2 - 70, y - h / 2 + 2, x + w / 2 - 2, y - h / 2 + 2, x + w / 2 - 2, y - h / 2 + 70);
    g.lineStyle(lit ? 3 : 2, tint, lit ? 1 : 0.65); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 22);
    return g;
  }

  function shopTag(scene, right, y, label, color) {
    var c = scene.add.container(0, 0);
    var t = PB.text(scene, 0, 0, label, 14, '#0a0620', { strokeThickness: 0 });
    var w = Math.max(70, t.width + 20);
    var g = scene.add.graphics();
    g.fillStyle(color, 1); g.fillRoundedRect(-w / 2, -14, w, 28, 14);
    c.add([g, t]);
    c.label = t;
    c.setPosition(right - w / 2, y);
    return c;
  }

  function drawBoostIcon(scene, x, y, id, tint) {
    var g = scene.add.graphics();
    g.fillStyle(tint, 0.16); g.fillCircle(x, y, 46);
    g.lineStyle(2, tint, 0.8); g.strokeCircle(x, y, 46);
    if (id === 'life') {
      g.fillStyle(tint, 1);
      g.fillTriangle(x, y - 26, x + 22, y, x - 22, y);
      g.fillTriangle(x - 22, y, x + 22, y, x, y + 26);
      g.fillStyle(0xffffff, 1);
      g.fillRect(x - 3, y - 12, 6, 24); g.fillRect(x - 12, y - 3, 24, 6);
    } else if (id === 'wide') {
      g.fillStyle(tint, 1); g.fillRoundedRect(x - 34, y - 8, 68, 16, 8);
      g.fillStyle(0xffffff, 0.9);
      g.fillTriangle(x - 40, y - 22, x - 28, y - 30, x - 28, y - 14);
      g.fillTriangle(x + 40, y - 22, x + 28, y - 30, x + 28, y - 14);
    } else if (id === 'multi') {
      [[-16, 8], [16, 8], [0, -16]].forEach(function (o) {
        g.fillStyle(tint, 1); g.fillCircle(x + o[0], y + o[1], 11);
        g.fillStyle(0xffffff, 0.8); g.fillCircle(x + o[0] - 3, y + o[1] - 3, 4);
      });
    } else {
      g.fillStyle(tint, 1); g.fillCircle(x + 10, y, 12);
      g.lineStyle(4, tint, 0.55); g.beginPath(); g.arc(x + 10, y, 24, Math.PI * 0.75, Math.PI * 1.25); g.strokePath();
      g.lineStyle(4, tint, 0.3); g.beginPath(); g.arc(x + 10, y, 34, Math.PI * 0.8, Math.PI * 1.2); g.strokePath();
    }
    return g;
  }

  function drawLookIcon(scene, x, y, look) {
    var g = scene.add.graphics();
    if (look.kind === 'trail') {
      for (var i = 0; i < 6; i++) {
        g.fillStyle(look.color, 0.15 + i * 0.15);
        g.fillCircle(x - 50 + i * 18, y + 6 - i * 2, 4 + i * 1.6);
      }
      g.fillStyle(0xffffff, 1); g.fillCircle(x + 50, y - 6, 9);
      g.lineStyle(2, look.color, 1); g.strokeCircle(x + 50, y - 6, 12);
    } else {
      g.fillStyle(look.color, 0.25); g.fillRoundedRect(x - 66, y - 16, 132, 32, 16);
      g.fillStyle(look.color, 1); g.fillRoundedRect(x - 58, y - 10, 116, 20, 10);
      g.lineStyle(3, look.edge || 0xffffff, 1); g.strokeRoundedRect(x - 58, y - 10, 116, 20, 10);
      g.fillStyle(0xffffff, 0.5); g.fillRoundedRect(x - 48, y - 7, 60, 5, 3);
    }
    return g;
  }

  class HomePopScene extends Phaser.Scene {
    constructor() { super('HomePop'); }
    create() {
      PB.enter(this);
      this.add.rectangle(W / 2, H / 2, W, H, 0x05061a, 0.78).setInteractive();
      this.root = this.add.container(0, 0);
      this.shopTab = 'boosts';
      this.render();
    }
    current() {
      var mode = PB.Home.mode || { type: 'one', items: ['bonus'], index: 0 };
      return mode.items[mode.index] || 'bonus';
    }
    close() {
      var menu = this.scene.get('Menu');
      if (menu) refreshMarks(menu);
      var mode = PB.Home.mode;
      if (!mode || mode.type === 'one') { this.scene.stop(); return; }
      mode.index += 1;
      if (mode.index >= mode.items.length) { this.scene.stop(); return; }
      var self = this;
      this.time.delayedCall(20, function () { if (self.scene && self.scene.isActive()) self.render(); });
    }
    note(msg) {
      if (this.noteText) this.noteText.setText(msg);
    }
    render() {
      var self = this;
      this.root.removeAll(true);
      var id = this.current();
      var tall = id === 'shop';
      this.root.add(PB.panel(this, W / 2, H / 2 + 10, 640, tall ? 1140 : 980, id === 'wheel' ? 0xff3df0 : id === 'tasks' ? 0x22e8ff : id === 'shop' ? 0xffd166 : 0xffd166));
      var close = PB.button(this, W - 96, 196, 88, 72, 'X', function () { self.close(); }, { size: 32, color: 0xff2e63 });
      close.name = 'popupClose';
      this.root.add(close);
      if (id === 'shop') this.shop();
      else if (id === 'tasks') this.tasks();
      else if (id === 'wheel') this.wheel();
      else if (id === 'achievements') this.achievements();
      else this.bonus();
      var noteY = id === 'bonus' ? 940 : (id === 'wheel' ? 1000 : (id === 'shop' ? 1148 : 1096));
      this.noteText = PB.text(this, W / 2, noteY, '', 24, '#ffe7a3', { strokeThickness: 0 });
      this.noteText.name = 'popupNote';
      this.root.add(this.noteText);
    }
    achievements() {
      var self = this;
      var Ach = PB.Achievements;
      var title = PB.text(this, W / 2, 230, 'ACHIEVEMENTS', 42, '#f3e9ff', { glow: '#9b6bff' });
      title.name = 'achievementsTitle';
      this.root.add(title);
      if (!Ach) return;
      var rows = Ach.board(Save.data);
      rows.forEach(function (row) {
        var col = row.index % 2;
        var line = Math.floor(row.index / 2);
        var x = col ? W / 2 + 165 : W / 2 - 165;
        var y = 300 + line * 78;
        self.root.add(Ach.drawBadge(self, x - 108, y, row.index, row.unlocked));
        var name = PB.text(self, x - 72, y - 14, row.name, 16, row.unlocked ? '#ffffff' : '#9aa3c7', { ox: 0, strokeThickness: 0 });
        name.name = 'ach-name-' + row.id;
        self.root.add(name);
        var prog = PB.text(self, x - 72, y + 12, row.current + '/' + row.need, 16, '#ffe7a3', { ox: 0, strokeThickness: 0 });
        prog.name = 'ach-prog-' + row.id;
        self.root.add(prog);
        var state = PB.text(self, x + 108, y, row.unlocked ? 'Unlocked' : 'Locked', 14, row.unlocked ? '#7dffa6' : '#8d97c9', { strokeThickness: 0 });
        state.name = 'ach-state-' + row.id;
        self.root.add(state);
      });
    }
    bonus() {
      var self = this;
      var now = Date.now();
      var home = Save.data.home;
      var avail = Home.bonusAvailable(Save.data, now);
      var streak = avail ? (home.bonus.lastClaim && Home.addDays(home.bonus.lastClaim, 1) === Home.dateKey(new Date(now)) ? (home.bonus.streak >= 7 ? 1 : home.bonus.streak + 1) : 1) : (home.bonus.streak || 1);
      var panel = this.add.zone(W / 2, H / 2 + 10, 640, 980);
      panel.name = 'bonusPanel';
      this.root.add(panel);
      this.root.add(PB.text(this, W / 2, 250, 'DAILY BONUS', 46, '#ffe7a3', { glow: '#ffd166' }));
      this.root.add(PB.text(this, W / 2, 310, 'Day ' + streak + ' of 7', 26, '#c9d4ff', { strokeThickness: 0 }));
      var cardW = 124;
      var cardH = 118;
      var gap = 16;
      var rowW = cardW * 4 + gap * 3;
      var rowLeft = W / 2 - rowW / 2;
      var wideW = cardW * 2 + gap;
      function cardBox(day) {
        var y = day < 5 ? 470 : 630;
        var x;
        var w = cardW;
        if (day < 5) x = rowLeft + cardW / 2 + (day - 1) * (cardW + gap);
        else if (day === 5) x = rowLeft + cardW / 2;
        else if (day === 6) x = rowLeft + cardW / 2 + (cardW + gap);
        else {
          w = wideW;
          x = rowLeft + (cardW + gap) * 2 + wideW / 2;
        }
        return { x: x, y: y, w: w };
      }
      this.hotDay = streak;
      function claimToday() {
        var got = Home.claimBonus(Save.data, Date.now());
        if (!got.ok) {
          self.note('Day ' + streak + ' is already claimed');
          return;
        }
        Save.persist();
        Sfx.play('coin');
        var menu = self.scene.get('Menu');
        if (menu) {
          refreshMarks(menu);
          refreshBadges(menu);
        }
        self._burstDay = got.day;
        self.render();
        self.note('Day ' + got.streak + ' saved on this device.');
      }
      for (var i = 0; i < 7; i++) {
        var spec = Home.BONUS[i];
        var box = cardBox(spec.day);
        var today = spec.day === streak;
        var claimed = !avail && spec.day === streak;
        var finale = spec.day === 7;
        var g = this.add.graphics();
        g.fillStyle(today || finale ? 0xffd166 : 0x1c2250, today ? 0.45 : (finale ? 0.22 : 0.95));
        g.fillRoundedRect(box.x - box.w / 2, box.y - cardH / 2, box.w, cardH, 16);
        g.lineStyle(finale || today ? 4 : 3, today || finale ? 0xffd166 : 0x3a3f6a, 1);
        g.strokeRoundedRect(box.x - box.w / 2, box.y - cardH / 2, box.w, cardH, 16);
        this.root.add(g);
        var zone = this.add.zone(box.x, box.y, box.w, cardH).setInteractive({ useHandCursor: true });
        zone.name = 'dayCard' + spec.day;
        zone.on('pointerup', (function (day) {
          return function () {
            if (day !== streak) {
              self.note('Come back on Day ' + day);
              return;
            }
            claimToday();
          };
        })(spec.day));
        this.root.add(zone);
        this.root.add(PB.text(this, box.x, box.y - 28, 'Day ' + spec.day, finale ? 22 : 18, '#9fa8e0', { strokeThickness: 0 }));
        if (today) {
          var hot = PB.text(this, box.x, box.y + 36, claimed ? 'Claimed' : 'Today', 14, '#ffe7a3', { strokeThickness: 0 });
          hot.name = claimed ? 'dayClaimed' : 'dayHot';
          this.root.add(hot);
        }
        var lines = [];
        if (spec.coins) lines.push(qty(spec.coins, 'coin', 'coins'));
        if (spec.gems) lines.push(qty(spec.gems, 'gem', 'gems'));
        lines.forEach(function (line, n) {
          self.root.add(PB.text(self, box.x, box.y + (lines.length === 1 ? 8 : n * 22), line, 18, '#ffe7a3', { strokeThickness: 0 }));
        });
      }
      if (this._burstDay) {
        var burstBox = cardBox(this._burstDay);
        var origin = this.add.zone(burstBox.x, burstBox.y, 20, 20);
        origin.name = 'bonusBurst';
        this.root.add(origin);
        for (var b = 0; b < 8; b++) {
          var coin = this.add.image(burstBox.x, burstBox.y, 'coin').setScale(0.55);
          coin.name = 'coinBurst';
          this.root.add(coin);
          this.tweens.add({
            targets: coin,
            x: burstBox.x + Math.cos(b) * 70,
            y: burstBox.y - 40 - (b % 3) * 18,
            alpha: 0,
            duration: 700,
            onComplete: function (tw, targets) { targets[0].destroy(); }
          });
        }
        this._burstDay = 0;
      }
      var claim = PB.button(this, W / 2 - 150, 820, 260, 84, avail ? 'Claim' : 'Claimed', function () {
        claimToday();
      }, { color: avail ? 0xffd166 : 0x4a4f78, size: 30, disabled: !avail });
      claim.name = 'claimBonus';
      this.root.add(claim);
      var doubled = PB.button(this, W / 2 + 150, 820, 260, 84, '2x Claim', function () {
        self.note('Coming soon');
      }, { color: 0x9b6bff, size: 28 });
      doubled.name = 'claimDouble';
      this.root.add(doubled);
    }
    tasks() {
      var self = this;
      var now = Date.now();
      Home.ensure(Save.data, now);
      this.root.add(PB.text(this, W / 2, 250, 'DAILY TASKS', 46, '#e8fdff', { glow: '#22e8ff' }));
      this.root.add(PB.text(this, W / 2, 308, 'Resets in ' + Home.countdownLabel(now), 24, '#9fe9ff', { strokeThickness: 0 }));
      Home.TASKS.forEach(function (task, i) {
        var y = 348 + i * 100;
        var progress = Save.data.home.tasks.progress[task.id] | 0;
        self.root.add(PB.text(self, 80, y, task.text, 22, task.live ? '#ffffff' : '#c9d2f5', { ox: 0, strokeThickness: 0 }));
        var barY = y + 22;
        if (!task.live) {
          var stub = PB.text(self, 80, y + 24, 'Not in the game yet', 16, '#8d97c9', { ox: 0, strokeThickness: 0 });
          stub.name = 'stub-' + task.id;
          self.root.add(stub);
          barY = y + 48;
        }
        var bar = self.add.graphics();
        var pct = Math.min(1, progress / task.target);
        bar.fillStyle(0x0a0d26, 1);
        bar.fillRoundedRect(80, barY, 420, 16, 8);
        if (pct > 0) {
          bar.fillStyle(task.live ? 0x22e8ff : 0x4a4f78, 1);
          bar.fillRoundedRect(80, barY, Math.max(16, 420 * pct), 16, 8);
        }
        self.root.add(bar);
        var barZone = self.add.zone(80 + 210, barY + 8, 420, 16);
        barZone.name = 'taskBar-' + task.id;
        self.root.add(barZone);
        self.root.add(PB.text(self, 560, barY + 8, progress + '/' + task.target, 20, '#c9d4ff', { strokeThickness: 0 }));
      });
      Home.MILESTONES.forEach(function (mile, i) {
        var ready = Home.milestoneReady(Save.data, i, Date.now());
        var claimed = Save.data.home.tasks.milestones[i];
        var prize = mile.gems ? qty(mile.gems, 'gem', 'gems') : qty(mile.coins, 'coin', 'coins');
        var label = claimed ? 'Saved' : (qty(mile.need, 'task', 'tasks') + ' · ' + prize);
        var b = PB.button(self, W / 2, 900 + i * 64, 460, 56, label, function () {
          var got = Home.claimMilestone(Save.data, i, Date.now());
          if (!got.ok) return;
          Save.persist();
          Sfx.play('coin');
          self.time.delayedCall(30, function () { if (self.scene.isActive()) self.render(); });
        }, { color: ready ? 0xffd166 : 0x4a4f78, size: 24, disabled: !ready });
        b.name = 'milestone' + i;
        self.root.add(b);
      });
    }
    shop() {
      var self = this;
      var Shop = PB.Shop;
      Shop.ensure(Save.data);
      if (this.shopTab !== 'looks') this.shopTab = 'boosts';
      var tab = this.shopTab;
      var title = PB.text(this, W / 2 - 30, 196, 'PRISM SHOP', 42, '#ffe7a3', { glow: '#ffd166' });
      title.name = 'shopTitle';
      this.root.add(title);

      // Balance pill: drawn prism coin and the current Prism coin count.
      var pill = this.add.graphics();
      pill.fillStyle(0x0a0d2a, 0.95); pill.fillRoundedRect(W / 2 - 150, 238, 300, 58, 29);
      pill.lineStyle(2, 0xffd166, 0.9); pill.strokeRoundedRect(W / 2 - 150, 238, 300, 58, 29);
      pill.fillStyle(0xffd166, 0.14); pill.fillRoundedRect(W / 2 - 146, 242, 292, 24, { tl: 25, tr: 25, bl: 4, br: 4 });
      this.root.add(pill);
      this.root.add(drawPrismCoin(this, W / 2 - 108, 267, 17));
      var coins = PB.text(this, W / 2 + 14, 267, String(Save.data.coins | 0), 30, '#ffe7a3', { strokeThickness: 0 });
      coins.name = 'shopCoins';
      this.root.add(coins);
      this.root.add(PB.text(this, W / 2 + 14, 312, 'Prism coins', 15, '#c9a95c', { strokeThickness: 0 }));

      // Tabs.
      [['boosts', 'Boosts'], ['looks', 'Looks']].forEach(function (pair, i) {
        var on = tab === pair[0];
        var b = PB.button(self, W / 2 - 146 + i * 292, 372, 276, 64, pair[1], function () {
          if (self.shopTab === pair[0]) return;
          self.shopTab = pair[0];
          self.render();
        }, { size: 24, color: on ? 0x22e8ff : 0x4a4f78, fill: on ? 0x123a52 : 0x0e1234 });
        b.name = 'shop-tab-' + pair[0];
        self.root.add(b);
      });
      this.root.add(PB.text(this, W / 2, 428, tab === 'boosts' ? 'Boosts work on your next level only' : 'Buy once. Equip one trail and one paddle.', 18, '#c9d4ff', { strokeThickness: 0 }));

      function refreshCoins() {
        coins.setText(String(Save.data.coins | 0));
        var menu = self.scene.get('Menu');
        if (!menu) return;
        var walk = function (list) {
          (list || []).forEach(function (o) {
            if (o.name === 'coinBadge' && o.refresh) o.refresh();
            if (o.list) walk(o.list);
          });
        };
        walk(menu.children.list);
      }
      function guarded(id, fn) {
        return function () {
          var now = Date.now();
          self._buyAt = self._buyAt || {};
          if (self._buyAt[id] && now - self._buyAt[id] < 500) return;
          self._buyAt[id] = now;
          fn();
        };
      }
      var cardW = 292;
      function cardAt(i, h, top) {
        return { x: (i % 2) ? W / 2 + 152 : W / 2 - 152, y: top + h / 2 + Math.floor(i / 2) * (h + 16), h: h };
      }

      if (tab === 'boosts') {
        Shop.BOOSTS.forEach(function (boost, i) {
          var box = cardAt(i, 300, 456);
          var queued = Save.data.shop.boosts[boost.id].length;
          var afford = (Save.data.coins | 0) >= boost.price;
          var tint = BOOST_TINT[boost.id] || 0x22e8ff;
          self.root.add(shopCard(self, box.x, box.y, cardW, box.h, tint, queued > 0));
          self.root.add(drawBoostIcon(self, box.x, box.y - 88, boost.id, tint));
          self.root.add(PB.text(self, box.x, box.y - 12, boost.name, 24, '#ffffff', { strokeThickness: 0 }));
          self.root.add(PB.text(self, box.x, box.y + 22, BOOST_INFO[boost.id] || '', 16, '#aab3e6', { strokeThickness: 0, wrap: 250 }));
          if (queued) {
            var tag = shopTag(self, box.x + cardW / 2 - 18, box.y - box.h / 2 + 22, 'Ready x' + queued, 0x7dffa6);
            tag.name = 'boost-tag-' + boost.id;
            self.root.add(tag);
          }
          var b = PB.button(self, box.x, box.y + 98, 240, 66, String(boost.price), guarded('boost-' + boost.id, function () {
            var before = Save.data.coins | 0;
            var got = Shop.buyBoost(Save.data, boost.id);
            if (!got.ok) {
              self.note(got.reason === 'coins' ? 'Need ' + (boost.price - before) + ' more coins' : 'Cannot buy that');
              return;
            }
            Save.persist();
            Sfx.play('coin');
            refreshCoins();
            self.render();
            self.note(boost.name + ' ready for the next level');
          }), { color: afford ? 0xffd166 : 0x4a4f78, size: 26, icon: null });
          b.name = 'boost-' + boost.id;
          b.add(drawPrismCoin(self, -62, 0, 13));
          self.root.add(b);
        });
        return;
      }

      Shop.LOOKS.forEach(function (look, i) {
        var box = cardAt(i, 206, 456);
        var owned = Save.data.shop.owned.indexOf(look.id) >= 0;
        var eq = (look.kind === 'trail' ? Save.data.shop.trail : Save.data.shop.paddle) === look.id;
        var afford = (Save.data.coins | 0) >= look.price;
        self.root.add(shopCard(self, box.x, box.y, cardW, box.h, look.color, eq));
        self.root.add(drawLookIcon(self, box.x, box.y - 58, look));
        self.root.add(PB.text(self, box.x, box.y - 14, look.name, 22, '#ffffff', { strokeThickness: 0 }));
        self.root.add(PB.text(self, box.x, box.y + 14, look.kind === 'trail' ? 'Ball trail' : 'Paddle skin', 15, '#aab3e6', { strokeThickness: 0 }));
        if (owned) {
          var tag = shopTag(self, box.x + cardW / 2 - 18, box.y - box.h / 2 + 20, eq ? 'Equipped' : 'Owned', eq ? 0xffd166 : 0x22e8ff);
          tag.name = 'look-tag-' + look.id;
          self.root.add(tag);
        }
        var label = eq ? 'Equipped' : owned ? 'Equip' : String(look.price);
        var b = PB.button(self, box.x, box.y + 66, 240, 60, label, guarded('look-' + look.id, function () {
          if (!owned) {
            var before = Save.data.coins | 0;
            var got = Shop.buyLook(Save.data, look.id);
            if (!got.ok) {
              self.note(got.reason === 'coins' ? 'Need ' + (look.price - before) + ' more coins' : 'Already owned');
              return;
            }
            Save.persist();
            Sfx.play('coin');
            refreshCoins();
            self.render();
            self.note(look.name + ' unlocked');
            return;
          }
          if (eq) return;
          Shop.equip(Save.data, look.id);
          Save.persist();
          self.render();
          self.note(look.name + ' equipped');
        }), { color: eq ? 0xffd166 : owned ? 0x22e8ff : (afford ? 0xff3df0 : 0x4a4f78), size: 22 });
        b.name = 'look-' + look.id;
        if (!owned) b.add(drawPrismCoin(self, -56, 0, 12));
        self.root.add(b);
      });
    }
    wheel() {
      var self = this;
      var now = Date.now();
      var left = Home.spinsLeft(Save.data, now);
      this.root.add(PB.text(this, W / 2, 240, 'LUCKY WHEEL', 46, '#ffd6fb', { glow: '#ff3df0' }));
      var subtitle = left > 0 ? (qty(left, 'free spin', 'free spins') + ' left today') : 'Come back tomorrow';
      this.root.add(PB.text(this, W / 2, 296, subtitle, 24, '#c9d4ff', { strokeThickness: 0 }));
      if (Home.recovered && Home.recovered.length) {
        var saved = Home.recovered[0].reward && Home.recovered[0].reward.label;
        this.root.add(PB.text(this, W / 2, 340, 'Saved reward: ' + (saved || 'collected'), 22, '#ffe7a3', { strokeThickness: 0 }));
        Home.recovered = null;
      }
      var wheel = this.add.container(W / 2, 620);
      var g = this.add.graphics();
      var radius = 168;
      var slice = Math.PI * 2 / Home.SEGMENTS.length;
      for (var i = 0; i < Home.SEGMENTS.length; i++) {
        var a0 = -Math.PI / 2 + i * slice - slice / 2;
        var a1 = a0 + slice;
        g.fillStyle(i % 2 ? 0x24185a : 0x14183f, 1);
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, radius, a0, a1, false);
        g.closePath();
        g.fillPath();
        g.lineStyle(3, 0xff3df0, 0.85);
        g.strokePath();
        var mid = a0 + slice / 2;
        var tx = Math.cos(mid) * 108;
        var ty = Math.sin(mid) * 108;
        var seg = Home.SEGMENTS[i];
        var short = seg.kind === 'coins' ? String(seg.amount) : (seg.kind === 'gems' ? qty(seg.amount, 'gem', 'gems') : seg.label.split(' ')[0]);
        var label = PB.text(this, tx, ty, short, 18, '#ffffff', { strokeThickness: 0 });
        wheel.add(label);
      }
      g.lineStyle(4, 0x22e8ff, 1);
      g.strokeCircle(0, 0, radius);
      wheel.addAt(g, 0);
      var hub = this.add.graphics();
      hub.fillStyle(0xffd166, 1);
      hub.fillCircle(0, 0, 18);
      wheel.add(hub);
      if (self.wheelRest) wheel.angle = ((self.wheelRest % 360) + 360) % 360;
      this.root.add(wheel);
      this.wheelGfx = wheel;
      var pointer = this.add.graphics();
      pointer.fillStyle(0xffd166, 1);
      pointer.fillTriangle(W / 2 - 14, 430, W / 2 + 14, 430, W / 2, 462);
      this.root.add(pointer);
      var spin = PB.button(this, W / 2, 860, 320, 88, left ? 'Spin' : 'Come back tomorrow', function () {
        if (self.spinning || spin.disabled) return;
        self.spinning = true;
        spin.setDisabled(true);
        var result = Home.beginSpin(Save.data, Date.now(), Math.random);
        if (!result.ok) {
          self.spinning = false;
          spin.setDisabled(true);
          self.note(result.reason === 'clock' ? 'Clock changed. Spins stay as they were.' : 'No free spins left today.');
          return;
        }
        Save.persist();
        var index = 0;
        for (var s = 0; s < Home.SEGMENTS.length; s++) if (Home.SEGMENTS[s].id === result.segment.id) index = s;
        var slice = 360 / Home.SEGMENTS.length;
        var offset = (Math.random() - 0.5) * (slice - 16);
        var turn = Home.restAngle(index, offset, 5);
        self.tweens.add({
          targets: wheel,
          angle: turn,
          duration: 2400,
          ease: 'Cubic.out',
          onComplete: function () {
            self.wheelRest = turn;
            Home.applyPending(Save.data);
            Save.persist();
            self.spinning = false;
            var menu = self.scene.get('Menu');
            if (menu) refreshMarks(menu);
            if (!self.scene.isActive()) return;
            self.render();
            self.note(result.segment.label);
          }
        });
      }, { color: left ? 0xff3df0 : 0x4a4f78, size: 30, disabled: !left });
      spin.name = 'spinWheel';
      this.root.add(spin);
    }
  }

  PB.HomeUI = { decorate: decorate, gemBadge: gemBadge, comingSoon: comingSoon, refreshMarks: refreshMarks };
  PB.HomePopScene = HomePopScene;
})();
