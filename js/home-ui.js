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
      ['Shop', function () { comingSoon(scene, 'Shop'); }],
      ['Achievements', function () { comingSoon(scene, 'Achievements'); }],
      ['Modes', function () { comingSoon(scene, 'Modes'); }],
      ['Settings', function () { PB.fadeTo(scene, 'Settings', { from: 'Menu' }); }]
    ];
    items.forEach(function (item, i) {
      var b = PB.button(scene, 110 + i * 168, barY, 156, 78, item[0], item[1], { size: item[0].length > 8 ? 16 : 20, color: 0x9b6bff });
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

  class HomePopScene extends Phaser.Scene {
    constructor() { super('HomePop'); }
    create() {
      PB.enter(this);
      this.add.rectangle(W / 2, H / 2, W, H, 0x05061a, 0.78).setInteractive();
      this.root = this.add.container(0, 0);
      this.render();
    }
    current() {
      var mode = PB.Home.mode || { type: 'one', items: ['bonus'], index: 0 };
      return mode.items[mode.index] || 'bonus';
    }
    close() {
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
      this.root.add(PB.panel(this, W / 2, H / 2 + 10, 640, 980, id === 'wheel' ? 0xff3df0 : id === 'tasks' ? 0x22e8ff : 0xffd166));
      var close = PB.button(this, W - 96, 196, 88, 72, 'X', function () { self.close(); }, { size: 32, color: 0xff2e63 });
      close.name = 'popupClose';
      this.root.add(close);
      if (id === 'tasks') this.tasks();
      else if (id === 'wheel') this.wheel();
      else this.bonus();
      this.noteText = PB.text(this, W / 2, H - 150, '', 24, '#ffe7a3', { strokeThickness: 0 });
      this.noteText.name = 'popupNote';
      this.root.add(this.noteText);
    }
    bonus() {
      var self = this;
      var now = Date.now();
      var home = Save.data.home;
      var avail = Home.bonusAvailable(Save.data, now);
      var streak = avail ? (home.bonus.lastClaim && Home.addDays(home.bonus.lastClaim, 1) === Home.dateKey(new Date(now)) ? (home.bonus.streak >= 7 ? 1 : home.bonus.streak + 1) : 1) : (home.bonus.streak || 1);
      this.root.add(PB.text(this, W / 2, 250, 'DAILY BONUS', 46, '#ffe7a3', { glow: '#ffd166' }));
      this.root.add(PB.text(this, W / 2, 310, 'Day ' + streak + ' of 7', 26, '#c9d4ff', { strokeThickness: 0 }));
      for (var i = 0; i < 7; i++) {
        var spec = Home.BONUS[i];
        var x = 96 + (i % 4) * 140;
        var y = i < 4 ? 430 : 560;
        if (i === 6) x = W / 2;
        var today = spec.day === streak;
        var g = this.add.graphics();
        g.fillStyle(today ? 0xffd166 : 0x1c2250, today ? 0.4 : 0.95);
        g.fillRoundedRect(x - 58, y - 48, 116, 110, 16);
        g.lineStyle(3, today ? 0xffd166 : 0x3a3f6a, 1);
        g.strokeRoundedRect(x - 58, y - 48, 116, 110, 16);
        this.root.add(g);
        this.root.add(PB.text(this, x, y - 24, 'Day ' + spec.day, 18, '#9fa8e0', { strokeThickness: 0 }));
        var prize = spec.gems ? (spec.gems + ' gems') : (spec.coins + ' coins');
        this.root.add(PB.text(this, x, y + 12, prize, 18, '#ffe7a3', { strokeThickness: 0, wrap: 100 }));
      }
      var claim = PB.button(this, W / 2 - 140, 760, 250, 84, avail ? 'Claim' : 'Claimed', function () {
        var got = Home.claimBonus(Save.data, Date.now());
        if (!got.ok) return;
        Save.persist();
        Sfx.play('coin');
        self.render();
        self.note('Day ' + got.streak + ' saved on this device.');
      }, { color: avail ? 0xffd166 : 0x4a4f78, size: 30, disabled: !avail });
      claim.name = 'claimBonus';
      this.root.add(claim);
      var doubled = PB.button(this, W / 2 + 140, 760, 250, 84, '2x Claim', function () {
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
        var y = 390 + i * 92;
        var progress = Save.data.home.tasks.progress[task.id] | 0;
        var label = task.text + (task.live ? '' : '  ·  Not in the game yet');
        self.root.add(PB.text(self, 70, y - 16, label, 22, task.live ? '#ffffff' : '#9aa3d6', { ox: 0, strokeThickness: 0, wrap: 500 }));
        var bar = self.add.graphics();
        var pct = Math.min(1, progress / task.target);
        bar.fillStyle(0x0a0d26, 1);
        bar.fillRoundedRect(70, y + 12, 420, 16, 8);
        if (pct > 0) {
          bar.fillStyle(task.live ? 0x22e8ff : 0x4a4f78, 1);
          bar.fillRoundedRect(70, y + 12, Math.max(16, 420 * pct), 16, 8);
        }
        self.root.add(bar);
        self.root.add(PB.text(self, 560, y + 8, progress + '/' + task.target, 20, '#c9d4ff', { strokeThickness: 0 }));
      });
      Home.MILESTONES.forEach(function (mile, i) {
        var ready = Home.milestoneReady(Save.data, i, Date.now());
        var claimed = Save.data.home.tasks.milestones[i];
        var prize = mile.gems ? (mile.gems + ' gems') : (mile.coins + ' coins');
        var label = claimed ? 'Saved' : (mile.need + ' tasks · ' + prize);
        var b = PB.button(self, W / 2, 900 + i * 86, 460, 72, label, function () {
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
    wheel() {
      var self = this;
      var now = Date.now();
      var left = Home.spinsLeft(Save.data, now);
      this.root.add(PB.text(this, W / 2, 240, 'LUCKY WHEEL', 46, '#ffd6fb', { glow: '#ff3df0' }));
      this.root.add(PB.text(this, W / 2, 296, left + ' free spin' + (left === 1 ? '' : 's') + ' left today', 24, '#c9d4ff', { strokeThickness: 0 }));
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
        var short = Home.SEGMENTS[i].kind === 'coins' ? String(Home.SEGMENTS[i].amount) : (Home.SEGMENTS[i].kind === 'gems' ? (Home.SEGMENTS[i].amount + ' gems') : Home.SEGMENTS[i].label.split(' ')[0]);
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
      this.root.add(wheel);
      this.wheelGfx = wheel;
      var pointer = this.add.graphics();
      pointer.fillStyle(0xffd166, 1);
      pointer.fillTriangle(W / 2 - 14, 430, W / 2 + 14, 430, W / 2, 462);
      this.root.add(pointer);
      var spin = PB.button(this, W / 2, 900, 320, 88, left ? 'Spin' : 'Come back tomorrow', function () {
        if (self.spinning) return;
        var result = Home.beginSpin(Save.data, Date.now(), Math.random);
        if (!result.ok) {
          self.note(result.reason === 'clock' ? 'Clock changed. Spins stay as they were.' : 'No free spins left today.');
          return;
        }
        Save.persist();
        self.spinning = true;
        var index = 0;
        for (var s = 0; s < Home.SEGMENTS.length; s++) if (Home.SEGMENTS[s].id === result.segment.id) index = s;
        var turn = 360 * 5 - index * (360 / Home.SEGMENTS.length);
        self.tweens.add({
          targets: wheel,
          angle: turn,
          duration: 2400,
          ease: 'Cubic.out',
          onComplete: function () {
            Home.applyPending(Save.data);
            Save.persist();
            self.spinning = false;
            if (!self.scene.isActive()) return;
            self.note(result.segment.label);
            self.time.delayedCall(30, function () { if (self.scene.isActive()) self.render(); });
          }
        });
      }, { color: left ? 0xff3df0 : 0x4a4f78, size: 30, disabled: !left });
      spin.name = 'spinWheel';
      this.root.add(spin);
    }
  }

  PB.HomeUI = { decorate: decorate, gemBadge: gemBadge, comingSoon: comingSoon };
  PB.HomePopScene = HomePopScene;
})();
