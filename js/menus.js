/*
 * PRISMBURST — menus.js
 * Boot, Menu, Worlds, Levels, Settings, Rewards and the in-game overlay
 * scenes (Pause, Complete, GameOver).
 */
(function () {
  'use strict';
  var PB = window.PB, L = window.PB_LEVELS, Save = PB.Save, Sfx = PB.Sfx;
  var W = PB.W, H = PB.H;
  PB.VERSION = '1.4.1';
  // Honest summary shown at the bottom of Settings. Update it when a real ad SDK is added.
  PB.SETTINGS_FOOTER = 'Demo ads only promote PRISMBURST itself. No third-party ad SDK and no tracking. Progress stays on this device; cloud save runs only when you sign in.';

  function backButton(scene, cb) {
    return PB.button(scene, 92, 70, 140, 76, '‹ Back', cb, { size: 30, color: 0x9b6bff });
  }

  // ================================================================ Boot
  class BootScene extends Phaser.Scene {
    constructor() { super('Boot'); }
    create() {
      PB.makeTextures(this);
      var el = document.getElementById('loading'); if (el) el.parentNode.removeChild(el);
      this.scene.start(PB.__startScene || 'Menu', PB.__startData);
    }
  }

  // ================================================================ Menu
  class MenuScene extends Phaser.Scene {
    constructor() { super('Menu'); }
    create() {
      PB.enter(this);
      PB.background(this, 'bg_menu');
      var cx = W / 2;
      // decorative prism
      var prism = this.add.container(cx, 360);
      var glow = this.add.image(0, 0, 'glow').setScale(4.2).setTint(0x7a3dff).setAlpha(0.45).setBlendMode('ADD');
      var h1 = this.add.image(0, 0, 'hex').setScale(1.9).setTint(0x22e8ff).setAlpha(0.22).setBlendMode('ADD');
      var h2 = this.add.image(0, 0, 'hex').setScale(1.35).setTint(0xff3df0).setAlpha(0.35).setBlendMode('ADD');
      var h3 = this.add.image(0, 0, 'hex').setScale(0.8).setTint(0xffffff).setAlpha(0.5).setBlendMode('ADD');
      prism.add([glow, h1, h2, h3]);
      this.tweens.add({ targets: h1, angle: 360, duration: 24000, repeat: -1 });
      this.tweens.add({ targets: h2, angle: -360, duration: 16000, repeat: -1 });
      this.tweens.add({ targets: h3, scale: 0.9, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.inOut' });
      this.orbit = [];
      for (var i = 0; i < 3; i++) this.orbit.push(this.add.image(cx, 360, 'ball_' + PB.BALL_SKINS[i * 2].id).setScale(0.8).setBlendMode('ADD'));
      // title
      PB.text(this, cx + 4, 236, 'PRISMBURST', 92, '#ff3df0', { strokeThickness: 0 }).setAlpha(0.6);
      PB.text(this, cx, 232, 'PRISMBURST', 92, '#e8fdff', { glow: '#22e8ff', stroke: '#1a0f4a', strokeThickness: 8 });
      PB.text(this, cx, 316, 'B R I C K   O D Y S S E Y', 30, '#ffb8f6', { glow: '#ff3df0' });

      var ct = Save.continueTarget(), has = Save.hasProgress();
      var self = this;
      var y0 = 640;
      this.btnContinue = PB.button(this, cx + 36, y0 - 40, 420, 100, has ? 'CONTINUE' : 'START', function () {
        PB.fadeTo(self, 'Game', { world: ct.world, level: ct.level });
      }, { color: 0xff3df0, size: 36 });
      PB.text(this, cx + 36, y0 + 24, (has ? 'Continue: ' : 'Begin: ') + L.WORLDS[ct.world].name + ' · Level ' + (ct.level + 1), 20, '#c9b8ff');
      PB.button(this, cx + 36, y0 + 100, 420, 88, 'PLAY', function () { PB.fadeTo(self, 'Worlds'); }, { color: 0x22e8ff, size: 34 });
      var nameText = PB.text(this, cx + 36, 1048, (PB.Cloud.snapshot && PB.Cloud.snapshot().displayName) || '', 20, '#9fe9ff', { strokeThickness: 0 });
      nameText.name = 'playerName';
      var acct = PB.button(this, cx + 36, 1096, 420, 60, PB.Cloud.badgeText(), function () { PB.Account.open(); }, { color: 0x22e8ff, size: 20 });
      acct.name = 'accountBadge';
      PB.Cloud.onChange(function () {
        if (nameText.scene) nameText.setText((PB.Cloud.snapshot && PB.Cloud.snapshot().displayName) || '');
        if (!acct.label || !acct.label.scene) return;
        acct.setLabel(PB.Cloud.badgeText());
      });

      var coins = PB.coinBadge(this, 418, 64);
      coins.name = 'coinBadge';
      if (PB.HomeUI) PB.HomeUI.gemBadge(this, W - 106, 64);
      if (PB.HomeUI) PB.HomeUI.decorate(this);
      var sb = this.add.container(110, 64);
      sb.name = 'starBadge';
      var g = this.add.graphics(); g.fillStyle(0x0c1030, 0.85); g.fillRoundedRect(-90, -26, 180, 52, 26); g.lineStyle(2, 0x22e8ff, 0.9); g.strokeRoundedRect(-90, -26, 180, 52, 26);
      sb.add([g, this.add.image(-60, 0, 'star').setScale(0.6).setTint(0xffd166), PB.text(this, 12, 0, String(Save.totalStars()), 30, '#e8fdff')]);
      var footer = PB.text(this, cx, H - 22, 'v' + PB.VERSION + ' · offline ready · progress saved on this device', 18, '#7a80b8', { strokeThickness: 0 });
      footer.name = 'versionFooter';
    }
    update(time) {
      for (var i = 0; i < this.orbit.length; i++) {
        var a = time / 1400 + i * Math.PI * 2 / 3;
        this.orbit[i].setPosition(W / 2 + Math.cos(a) * 230, 380 + Math.sin(a) * 70).setDepth(Math.sin(a) > 0 ? 2 : -0.5);
      }
    }
  }

  // ================================================================ Worlds
  class WorldsScene extends Phaser.Scene {
    constructor() { super('Worlds'); }
    create() {
      PB.enter(this);
      PB.background(this, 'bg_menu');
      var self = this;
      backButton(this, function () { PB.fadeTo(self, 'Menu'); });
      PB.text(this, W / 2 + 60, 70, 'SELECT WORLD', 46, '#e8fdff', { glow: '#22e8ff' });
      PB.coinBadge(this, W - 100, 150).setScale(0.8);
      var n = L.worldCount(), top = 230, gap = 202;
      for (var i = 0; i < n; i++) this.card(i, top + i * gap);
    }
    card(i, y) {
      var w = L.WORLDS[i], unlocked = Save.worldUnlocked(i), self = this;
      var c = this.add.container(W / 2, y + 80);
      var g = this.add.graphics();
      g.fillStyle(w.bg[1], unlocked ? 0.95 : 0.6); g.fillRoundedRect(-320, -86, 640, 172, 26);
      g.fillStyle(w.accent, unlocked ? 0.14 : 0.05); g.fillRoundedRect(-320, -86, 640, 80, { tl: 26, tr: 26, bl: 0, br: 0 });
      g.lineStyle(3, unlocked ? w.accent : 0x4a4f78, 1); g.strokeRoundedRect(-320, -86, 640, 172, 26);
      c.add(g);
      // mini brick preview
      for (var k = 0; k < 4; k++) {
        var b = this.add.image(-276 + (k % 2) * 46, -22 + Math.floor(k / 2) * 30, 'brick').setScale(0.8).setTint(w.hp[k]).setAlpha(unlocked ? 1 : 0.35);
        c.add(b);
      }
      c.add(PB.text(this, -170, -40, (i + 1) + '. ' + w.name, 40, unlocked ? '#ffffff' : '#7a80b8', { ox: 0, glow: unlocked ? PB.hex(w.accent) : null }));
      c.add(PB.text(this, -170, 4, w.tagline, 22, unlocked ? '#c9d4ff' : '#5a608a', { ox: 0, strokeThickness: 0 }));
      if (unlocked) {
        var cleared = 0; for (var l = 0; l < L.LEVELS_PER_WORLD; l++) if (Save.levelRec(i, l)) cleared++;
        c.add(this.add.image(-160, 48, 'star').setScale(0.5).setTint(0xffd166));
        c.add(PB.text(this, -136, 48, Save.worldStars(i) + ' / ' + (L.LEVELS_PER_WORLD * 3), 26, '#ffe7a3', { ox: 0 }));
        c.add(PB.text(this, 290, 48, cleared + ' / ' + L.LEVELS_PER_WORLD + ' cleared', 24, '#9fe9ff', { ox: 1 }));
        c.add(PB.text(this, 290, -40, w.intro, 18, PB.hex(w.accent2), { ox: 1, strokeThickness: 0 }).setVisible(false));
      } else {
        c.add(this.add.image(250, -10, 'lock'));
        c.add(PB.text(this, -170, 48, 'Clear ' + L.WORLDS[i - 1].name + ' level ' + L.LEVELS_PER_WORLD + ' to unlock', 20, '#8a90c0', { ox: 0, strokeThickness: 0 }));
      }
      var z = this.add.zone(0, 0, 640, 172).setInteractive({ useHandCursor: true });
      c.add(z);
      z.on('pointerdown', function () { self.tweens.add({ targets: c, scale: 0.97, duration: 60 }); });
      z.on('pointerout', function () { self.tweens.add({ targets: c, scale: 1, duration: 80 }); });
      z.on('pointerup', function () {
        self.tweens.add({ targets: c, scale: 1, duration: 80 });
        if (!unlocked) { Sfx.play('steel'); self.cameras.main.shake(120, 0.004); return; }
        Sfx.play('click'); PB.fadeTo(self, 'Levels', { world: i });
      });
    }
  }

  // ================================================================ Levels
  class LevelsScene extends Phaser.Scene {
    constructor() { super('Levels'); }
    init(data) { this.world = (data && data.world) || 0; }
    create() {
      PB.enter(this);
      var w = L.WORLDS[this.world], self = this;
      PB.background(this, 'bg' + this.world);
      backButton(this, function () { PB.fadeTo(self, 'Worlds'); });
      PB.text(this, W / 2 + 60, 64, w.name.toUpperCase(), 44, '#ffffff', { glow: PB.hex(w.accent) });
      PB.text(this, W / 2 + 60, 112, w.intro, 24, PB.hex(w.accent2), { strokeThickness: 0 });
      PB.text(this, W / 2, 176, '★ ' + Save.worldStars(this.world) + ' / ' + (L.LEVELS_PER_WORLD * 3), 30, '#ffe7a3');
      var cols = 4, size = 138, gapX = 160, gapY = 196, x0 = W / 2 - gapX * 1.5, y0 = 320;
      for (var i = 0; i < L.LEVELS_PER_WORLD; i++) this.tile(i, x0 + (i % cols) * gapX, y0 + Math.floor(i / cols) * gapY, size, w);
    }
    tile(i, x, y, s, w) {
      var unlocked = Save.isUnlocked(this.world, i), rec = Save.levelRec(this.world, i), self = this;
      var lv = L.getLevel(this.world, i);
      var c = this.add.container(x, y), g = this.add.graphics();
      var col = unlocked ? (rec ? w.accent : w.accent2) : 0x3a3f6a;
      g.fillStyle(0x000000, 0.3); g.fillRoundedRect(-s / 2 + 4, -s / 2 + 8, s, s, 24);
      g.fillStyle(unlocked ? 0x12163a : 0x0c0f28, 0.95); g.fillRoundedRect(-s / 2, -s / 2, s, s, 24);
      g.fillStyle(col, unlocked ? 0.22 : 0.08); g.fillRoundedRect(-s / 2 + 5, -s / 2 + 5, s - 10, s / 2 - 5, { tl: 20, tr: 20, bl: 4, br: 4 });
      g.lineStyle(3, col, 1); g.strokeRoundedRect(-s / 2, -s / 2, s, s, 24);
      c.add(g);
      if (unlocked) {
        c.add(PB.text(this, 0, -14, String(i + 1), 54, '#ffffff', { glow: PB.hex(col) }));
        var icon = { clear: '', score: 'PTS', time: 'TIME', targets: 'CORE' }[lv.objective.type];
        if (icon) c.add(PB.text(this, 0, -s / 2 + 16, icon, 15, '#ffe7a3', { strokeThickness: 0 }));
        var st = PB.stars(this, 0, 40, rec ? rec.stars : 0, 30, 34); c.add(st);
        if (rec) c.add(PB.text(this, 0, s / 2 + 18, String(rec.best), 20, '#9fa8e0', { strokeThickness: 0 }));
      } else {
        c.add(this.add.image(0, -6, 'lock').setScale(0.9));
        c.add(PB.text(this, 0, 44, String(i + 1), 24, '#5a608a', { strokeThickness: 0 }));
      }
      var z = this.add.zone(0, 0, s + 16, s + 16).setInteractive({ useHandCursor: true }); c.add(z);
      z.on('pointerdown', function () { if (unlocked) self.tweens.add({ targets: c, scale: 0.93, duration: 60 }); });
      z.on('pointerout', function () { self.tweens.add({ targets: c, scale: 1, duration: 80 }); });
      z.on('pointerup', function () {
        self.tweens.add({ targets: c, scale: 1, duration: 80 });
        if (!unlocked) { Sfx.play('steel'); return; }
        Sfx.play('click'); PB.fadeTo(self, 'Game', { world: self.world, level: i });
      });
      c.levelIndex = i;
    }
  }

  // ================================================================ Settings
  class SettingsScene extends Phaser.Scene {
    constructor() { super('Settings'); }
    init(data) { this.from = (data && data.from) || 'Menu'; this.overlay = this.from === 'Pause'; }
    create() {
      var self = this, s = Save.data.settings;
      if (this.overlay) {
        this.add.rectangle(W / 2, H / 2, W, H, 0x05061a, 0.75).setInteractive();
        PB.panel(this, W / 2, H / 2, 640, 900, 0x9b6bff);
      } else {
        PB.enter(this);
        PB.background(this, 'bg_menu');
        backButton(this, function () { self.close(); });
      }
      var top = this.overlay ? H / 2 - 360 : 200;
      PB.text(this, W / 2, top, 'SETTINGS', 52, '#ffffff', { glow: '#9b6bff' });
      function toggle(y, key, label) {
        var b = PB.button(self, W / 2, y, 540, 100, label + ': ' + (s[key] ? 'ON' : 'OFF'), function () {
          s[key] = !s[key]; Save.persist();
          if (key === 'sound') { if (s.sound) Sfx.unlock(); else Sfx.suspend(); }
          if (key === 'vibration' && s.vibration) PB.vibrate(30);
          b.setLabel(label + ': ' + (s[key] ? 'ON' : 'OFF'));
        }, { color: s[key] ? 0x22e8ff : 0x6a6f9a, size: 36 });
        b.name = 'toggle_' + key;
        return b;
      }
      toggle(top + 150, 'sound', 'Sound');
      toggle(top + 280, 'vibration', 'Vibration');
      toggle(top + 410, 'shake', 'Screen shake');
      var debugUnlock = !this.overlay && PB.BUILD && PB.BUILD.debugUnlock === true;
      if (debugUnlock) {
        var unlock = PB.button(self, W / 2, top + 540, 540, 100, 'Unlock all levels: ' + (PB.BUILD.levelsOpen === true ? 'ON' : 'OFF'), function () {
          PB.BUILD.levelsOpen = PB.BUILD.levelsOpen !== true;
          unlock.setLabel('Unlock all levels: ' + (PB.BUILD.levelsOpen === true ? 'ON' : 'OFF'));
        }, { color: PB.BUILD.levelsOpen === true ? 0xffd166 : 0x6a6f9a, size: 32 });
        unlock.name = 'toggle_unlock';
      }
      if (!this.overlay) {
        PB.text(this, W / 2, top + (debugUnlock ? 660 : 490), navigator.vibrate ? 'Vibration uses your phone\'s motor when supported.' : 'Vibration is not supported by this browser.', 20, '#8a90c0', { strokeThickness: 0, wrap: 540 });
        PB.button(this, W / 2, top + (debugUnlock ? 780 : 620), 540, 96, 'Reset progress', function () { self.confirmReset(); }, { color: 0xff2e63, size: 32 });
        var rowY = top + (debugUnlock ? 900 : 750);
        var del = PB.button(this, W / 2 - 140, rowY, 260, 80, 'Delete account', function () { self.openDelete(); }, { color: 0xff6b8a, size: 26 });
        del.name = 'btn_delete_account';
        var priv = PB.button(this, W / 2 + 140, rowY, 260, 80, 'Privacy policy', function () {
          if (PB.Cloud && PB.Cloud.openPage) PB.Cloud.openPage('privacy-policy.html');
        }, { color: 0x9b6bff, size: 26 });
        priv.name = 'btn_privacy';
        PB.text(this, W / 2, H - 120, 'PRISMBURST — BRICK ODYSSEY v' + PB.VERSION, 22, '#9fa8e0', { strokeThickness: 0 });
        var footer = PB.text(this, W / 2, H - 70, PB.SETTINGS_FOOTER, 18, '#8a90c0', { strokeThickness: 0, wrap: 640 });
        footer.name = 'settings_footer';
      } else {
        PB.button(this, W / 2, top + 640, 400, 96, 'Done', function () { self.close(); }, { color: 0x22e8ff, size: 34 });
      }
    }
    openDelete() {
      if (!PB.Cloud || !PB.Account) return;
      if (!PB.Cloud.hasCredentials()) {
        PB.Cloud.errorText = 'Accounts are not set up in this copy of the game. Nothing is stored online. Use Reset progress to clear this device.';
      } else if (!(PB.Cloud.session && PB.Cloud.session.user)) {
        PB.Cloud.errorText = 'Sign in to the account you want to delete. A guest has no online account: use Reset progress to clear this device.';
      } else {
        PB.Cloud.errorText = '';
      }
      PB.Account.open('delete');
    }
    close() {
      if (this.overlay) { this.scene.stop(); this.scene.resume('Pause'); }
      else PB.fadeTo(this, 'Menu');
    }
    confirmReset() {
      var self = this, layer = this.add.container(0, 0).setDepth(50);
      var dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setInteractive();
      layer.add([dim, PB.panel(this, W / 2, H / 2, 600, 480, 0xff2e63)]);
      layer.add(PB.text(this, W / 2, H / 2 - 150, 'Reset all progress?', 40, '#ffffff'));
      layer.add(PB.text(this, W / 2, H / 2 - 80, 'Levels, stars, coins, skins and missions on this device will be erased. A cloud save is not deleted.', 24, '#c9d4ff', { strokeThickness: 0, wrap: 520 }));
      layer.add(PB.button(this, W / 2 - 130, H / 2 + 120, 220, 96, 'Cancel', function () { layer.destroy(); }, { color: 0x22e8ff, size: 32 }));
      layer.add(PB.button(this, W / 2 + 130, H / 2 + 120, 220, 96, 'Reset', function () {
        Save.reset(); layer.destroy(); self.scene.restart({ from: self.from });
      }, { color: 0xff2e63, size: 32 }));
    }
  }

  // ================================================================ Rewards
  class RewardsScene extends Phaser.Scene {
    constructor() { super('Rewards'); }
    init(data) { this.tab = (data && data.tab) || 'daily'; }
    create() {
      PB.enter(this);
      PB.background(this, 'bg_menu');
      var self = this;
      backButton(this, function () { PB.fadeTo(self, 'Menu'); });
      PB.text(this, W / 2 + 40, 70, 'REWARDS', 48, '#ffffff', { glow: '#ffd166' });
      this.coins = PB.coinBadge(this, W - 100, 150).setScale(0.85);
      var tabs = [['daily', 'Daily'], ['ball', 'Balls'], ['paddle', 'Paddles']];
      this.tabBtns = {};
      tabs.forEach(function (t, i) {
        self.tabBtns[t[0]] = PB.button(self, 130 + i * 230, 240, 210, 84, t[1], function () { self.show(t[0]); },
          { color: t[0] === self.tab ? 0xffd166 : 0x4a5090, size: 30 });
      });
      this.content = this.add.container(0, 0);
      this.show(this.tab);
    }
    show(tab) {
      if (tab !== this.tab) { this.scene.restart({ tab: tab }); return; }
      this.content.removeAll(true);
      if (tab === 'daily') this.daily(); else this.skins(tab);
      this.coins.refresh();
    }
    daily() {
      var self = this, c = this.content, y = 330;
      c.add(PB.panel(this, W / 2, y + 170, 660, 340, 0xffd166));
      var avail = Save.dailyAvailable(), streak = avail ? Save.dailyNextStreak() : Save.data.daily.streak;
      c.add(PB.text(this, W / 2, y + 50, 'DAILY CRYSTAL CACHE', 34, '#ffe7a3', { glow: '#ffd166' }));
      c.add(PB.text(this, W / 2, y + 96, 'Streak: day ' + streak + (avail ? '' : ' (claimed)'), 24, '#c9d4ff', { strokeThickness: 0 }));
      for (var i = 0; i < 7; i++) {
        var x = W / 2 + (i - 3) * 86, cur = ((streak - 1) % 7) === i;
        var gg = this.add.graphics();
        gg.fillStyle(cur ? 0xffd166 : 0x1c2250, cur ? 0.35 : 0.9); gg.fillRoundedRect(x - 38, y + 126, 76, 92, 14);
        gg.lineStyle(2, cur ? 0xffd166 : 0x3a3f6a, 1); gg.strokeRoundedRect(x - 38, y + 126, 76, 92, 14);
        c.add(gg);
        c.add(PB.text(this, x, y + 146, 'D' + (i + 1), 18, '#9fa8e0', { strokeThickness: 0 }));
        c.add(this.add.image(x, y + 176, 'coin').setScale(0.55));
        c.add(PB.text(this, x, y + 204, String(PB.DAILY_REWARDS[i]), 18, '#ffe7a3', { strokeThickness: 0 }));
      }
      var amt = Save.dailyAmount(streak);
      var btn = PB.button(this, W / 2, y + 278, 420, 84, avail ? 'Claim ' + amt + ' coins' : 'Come back tomorrow', function () {
        var got = Save.claimDaily(); if (got) { Sfx.play('coin'); PB.vibrate(25); self.coinBurst(W / 2, y + 278); self.show('daily'); }
      }, { color: avail ? 0xffd166 : 0x4a4f78, size: 30, disabled: !avail });
      btn.name = 'claimDaily';
      c.add(btn);
      // missions
      Save.refreshMissions();
      var my = y + 400;
      c.add(PB.text(this, W / 2, my, 'TODAY\'S MISSIONS', 32, '#9fe9ff', { glow: '#22e8ff' }));
      c.add(PB.text(this, W / 2, my + 38, 'Reset at local midnight', 20, '#7a80b8', { strokeThickness: 0 }));
      Save.data.missions.list.forEach(function (m, i) {
        var yy = my + 120 + i * 150;
        c.add(PB.panel(self, W / 2, yy, 660, 130, m.claimed ? 0x3a3f6a : 0x22e8ff, 0.9));
        c.add(PB.text(self, 60, yy - 30, m.text, 28, m.claimed ? '#7a80b8' : '#ffffff', { ox: 0 }));
        var bar = self.add.graphics(), pct = Math.min(1, m.progress / m.target);
        bar.fillStyle(0x0a0d26, 1); bar.fillRoundedRect(60, yy + 10, 360, 22, 11);
        bar.fillStyle(m.claimed ? 0x4a4f78 : 0x22e8ff, 1); if (pct > 0) bar.fillRoundedRect(60, yy + 10, Math.max(22, 360 * pct), 22, 11);
        c.add(bar);
        c.add(PB.text(self, 240, yy + 48, m.progress.toLocaleString('en-US') + ' / ' + m.target.toLocaleString('en-US'), 18, '#9fa8e0', { strokeThickness: 0 }));
        var done = m.progress >= m.target;
        var b = PB.button(self, 560, yy + 4, 170, 76, m.claimed ? 'Done ✓' : (done ? '+' + m.reward : m.reward + ''), function () {
          var got = Save.claimMission(i); if (got) { Sfx.play('coin'); self.coinBurst(560, yy); self.show('daily'); }
        }, { color: done && !m.claimed ? 0xffd166 : 0x4a4f78, size: 26, disabled: !done || m.claimed, icon: m.claimed ? null : 'coin', iconScale: 0.6 });
        b.name = 'mission' + i; c.add(b);
      });
    }
    skins(kind) {
      var self = this, c = this.content, list = kind === 'ball' ? PB.BALL_SKINS : PB.PADDLE_SKINS;
      list.forEach(function (s, i) {
        var col = i % 2, row = Math.floor(i / 2), x = W / 2 + (col ? 165 : -165), y = 420 + row * 230;
        var owned = Save.owns(kind, s.id), eq = Save.data.equipped[kind] === s.id;
        c.add(PB.panel(self, x, y, 310, 210, eq ? 0xffd166 : owned ? 0x22e8ff : 0x4a4f78, 0.92));
        var img = self.add.image(x, y - 52, (kind === 'ball' ? 'ball_' : 'paddle_') + s.id).setScale(kind === 'ball' ? 1.6 : 1.2);
        c.add(img);
        if (kind === 'ball') self.tweens.add({ targets: img, y: y - 60, yoyo: true, repeat: -1, duration: 700 + i * 60, ease: 'Sine.inOut' });
        c.add(PB.text(self, x, y + 4, s.name, 26, '#ffffff'));
        var label = eq ? 'Equipped' : owned ? 'Equip' : String(s.price);
        var canBuy = Save.data.coins >= s.price;
        var b = PB.button(self, x, y + 64, 240, 68, label, function () {
          if (eq) return;
          if (!owned) {
            if (!Save.buy(kind, s)) { self.toast('Need ' + (s.price - Save.data.coins) + ' more coins'); return; }
            Sfx.play('coin'); PB.vibrate(20);
          }
          Save.equip(kind, s.id); self.show(kind);
        }, { color: eq ? 0xffd166 : owned ? 0x22e8ff : (canBuy ? 0xff3df0 : 0x4a4f78), size: 26, icon: owned ? null : 'coin', iconScale: 0.6 });
        b.name = kind + '_' + s.id; c.add(b);
      });
    }
    toast(msg) {
      var t = PB.text(this, W / 2, H - 120, msg, 28, '#ffb8c8').setDepth(40);
      this.tweens.add({ targets: t, alpha: 0, y: H - 170, delay: 900, duration: 500, onComplete: function () { t.destroy(); } });
    }
    coinBurst(x, y) {
      for (var i = 0; i < 10; i++) {
        var cimg = this.add.image(x, y, 'coin').setScale(0.6).setDepth(60);
        this.tweens.add({ targets: cimg, x: W - 160 + Math.random() * 20, y: 150, scale: 0.3, delay: i * 40, duration: 500, ease: 'Cubic.in', onComplete: function (tw, t) { t[0].destroy(); } });
      }
    }
  }

  // ================================================================ Pause overlay
  class PauseScene extends Phaser.Scene {
    constructor() { super('Pause'); }
    init(data) { this.data_ = data; }
    create() {
      var d = this.data_, self = this, lv = L.getLevel(d.world, d.level);
      this.add.rectangle(W / 2, H / 2, W, H, 0x05061a, 0.72).setInteractive();
      PB.panel(this, W / 2, H / 2, 600, 860, 0x22e8ff);
      PB.text(this, W / 2, H / 2 - 340, 'PAUSED', 64, '#ffffff', { glow: '#22e8ff' });
      PB.text(this, W / 2, H / 2 - 270, L.WORLDS[d.world].name + ' · Level ' + (d.level + 1), 26, '#c9d4ff', { strokeThickness: 0 });
      PB.text(this, W / 2, H / 2 - 232, L.describeObjective(lv.objective), 24, '#ffe7a3', { strokeThickness: 0 });
      PB.button(this, W / 2, H / 2 - 110, 440, 104, 'Resume', function () { self.resumeGame(); }, { color: 0x22e8ff, size: 38 }).name = 'resume';
      PB.button(this, W / 2, H / 2 + 20, 440, 96, 'Restart', function () { self.scene.stop('Settings'); self.scene.start('Game', { world: d.world, level: d.level }); }, { color: 0xff3df0, size: 34 }).name = 'restart';
      PB.button(this, W / 2, H / 2 + 140, 440, 96, 'Settings', function () { self.scene.pause(); self.scene.launch('Settings', { from: 'Pause' }); self.scene.bringToTop('Settings'); }, { color: 0x9b6bff, size: 34 }).name = 'settings';
      PB.button(this, W / 2, H / 2 + 260, 440, 96, 'Quit to levels', function () {
        var g = self.scene.get('Game'); if (g && g.commitStats) g.commitStats();
        self.scene.stop('Game'); self.scene.start('Levels', { world: d.world });
      }, { color: 0x6a6f9a, size: 32 }).name = 'quit';
    }
    resumeGame() { this.scene.stop(); this.scene.resume('Game'); }
  }

  // ================================================================ Level complete overlay
  class CompleteScene extends Phaser.Scene {
    constructor() { super('Complete'); }
    init(data) { this.d = data; }
    create() {
      var d = this.d, self = this;
      this.add.rectangle(W / 2, H / 2, W, H, 0x05061a, 0.6).setInteractive();
      var p = this.add.container(0, 0);
      p.add(PB.panel(this, W / 2, H / 2 + 20, 620, 1100, 0xffd166));
      p.add(PB.text(this, W / 2, H / 2 - 410, 'LEVEL CLEAR!', 64, '#ffffff', { glow: '#ffd166' }));
      p.add(PB.text(this, W / 2, H / 2 - 350, d.name, 28, '#c9d4ff', { strokeThickness: 0 }));
      if (d.achievement) {
        var tag = PB.text(this, W / 2, H / 2 - 308, d.achievement, 22, '#ffe7a3', { strokeThickness: 0 });
        tag.name = 'clearTag';
        p.add(tag);
      }
      if (d.achievementToast && PB.Achievements) PB.Achievements.showToast(this, d.achievementToast);
      var stars = PB.stars(this, W / 2, H / 2 - 230, 0, 120, 150);
      stars.forEach(function (s, i) {
        p.add(s);
        if (i < d.stars) {
          s.setScale(0);
          self.time.delayedCall(350 + i * 300, function () {
            s.setTint(0xffd166); Sfx.play('star', i);
            self.tweens.add({ targets: s, scale: 120 / 64, duration: 350, ease: 'Back.out' });
            var gl = self.add.image(s.x, s.y, 'glow').setTint(0xffd166).setBlendMode('ADD').setScale(0.5);
            self.tweens.add({ targets: gl, scale: 2.5, alpha: 0, duration: 600, onComplete: function () { gl.destroy(); } });
          });
        }
      });
      var tips = ['Clear the level', 'Lose no lives', 'Score ' + d.star3.toLocaleString('en-US') + '+'];
      tips.forEach(function (t, i) { p.add(PB.text(self, W / 2 + (i - 1) * 150, H / 2 - 150, t, 15, i < d.stars ? '#ffe7a3' : '#6a70a8', { strokeThickness: 0, wrap: 140 })); });
      p.add(PB.text(this, W / 2, H / 2 - 80, 'SCORE', 26, '#9fa8e0', { strokeThickness: 0 }));
      var sc = PB.text(this, W / 2, H / 2 - 30, '0', 64, '#ffffff', { glow: '#22e8ff' }); p.add(sc);
      this.tweens.addCounter({ from: 0, to: d.score, duration: 900, onUpdate: function (tw) { sc.setText(Math.round(tw.getValue()).toLocaleString('en-US')); } });
      p.add(PB.text(this, W / 2, H / 2 + 30, d.newBest ? 'NEW BEST!' : 'Best: ' + d.best.toLocaleString('en-US'), 26, d.newBest ? '#ff9cf6' : '#9fa8e0'));
      var cy = H / 2 + 90;
      p.add(this.add.image(W / 2 - 70, cy, 'coin'));
      var coinLine = PB.text(this, W / 2 + 10, cy, '+' + d.coins, 40, '#ffe7a3', { ox: 0 });
      coinLine.name = 'clearCoins';
      p.add(coinLine);
      var doubled = Save.doubledClear(d.world, d.level);
      if (!doubled && PB.Ads) {
        var hint = PB.text(this, W / 2, cy + 48, 'Doubles this clear\'s coin reward', 20, '#c9d4ff', { strokeThickness: 0 });
        hint.name = 'doubleHint';
        p.add(hint);
        var watch = PB.button(this, W / 2, cy + 110, 460, 84, 'Watch ad: 2x reward', function () {
          if (watch.disabled) return;
          watch.setDisabled(true);
          PB.Ads.showRewarded('double').then(function (res) {
            if (!res || !res.completed) { watch.setDisabled(false); return; }
            var gained = Save.grantDoubleCoins(d.world, d.level, d.coins);
            if (!gained) { watch.setVisible(false); return; }
            coinLine.setText('+' + (d.coins + gained));
            hint.setText('Coin reward doubled');
            watch.setVisible(false);
          });
        }, { color: 0xffd166, size: 28 });
        watch.name = 'watchDouble';
        p.add(watch);
      }
      if (d.unlockMsg) p.add(PB.text(this, W / 2, cy + (doubled ? 56 : 168), d.unlockMsg, 24, '#9fe9ff', { glow: '#22e8ff' }));
      var hasNext = d.level + 1 < L.LEVELS_PER_WORLD || d.world + 1 < L.worldCount();
      var nb = PB.button(this, W / 2, H / 2 + 360, 460, 96, hasNext ? 'Next level ›' : 'Back to worlds', function () {
        if (d.level + 1 < L.LEVELS_PER_WORLD) self.scene.start('Game', { world: d.world, level: d.level + 1 });
        else { self.scene.stop('Game'); self.scene.start('Worlds'); }
      }, { color: 0xffd166, size: 34 }); nb.name = 'next'; p.add(nb);
      p.add(PB.button(this, W / 2 - 118, H / 2 + 470, 220, 80, 'Retry', function () { self.scene.start('Game', { world: d.world, level: d.level }); }, { color: 0xff3df0, size: 28 }));
      p.add(PB.button(this, W / 2 + 118, H / 2 + 470, 220, 80, 'Levels', function () { self.scene.stop('Game'); self.scene.start('Levels', { world: d.world }); }, { color: 0x22e8ff, size: 28 }));
      p.y = 60; p.alpha = 0;
      this.tweens.add({ targets: p, y: 0, alpha: 1, duration: 320, ease: 'Cubic.out' });
    }
  }

  // ================================================================ Game over overlay
  class GameOverScene extends Phaser.Scene {
    constructor() { super('GameOver'); }
    init(data) { this.d = data; }
    create() {
      var d = this.d, self = this;
      this.add.rectangle(W / 2, H / 2, W, H, 0x05061a, 0.7).setInteractive();
      var p = this.add.container(0, 0);
      var livesOut = d.reason !== 'time';
      p.add(PB.panel(this, W / 2, H / 2 + 10, 620, 1080, 0xff2e63));
      var title = PB.text(this, W / 2, H / 2 - 440, livesOut ? 'OUT OF LIVES' : 'TIME\'S UP', 54, '#ffffff', { glow: '#ff2e63' });
      title.name = 'gameOverTitle';
      p.add(title);
      p.add(PB.text(this, W / 2, H / 2 - 380, livesOut ? 'You ran out of lives.' : 'The crystals held out this time.', 24, '#c9d4ff', { strokeThickness: 0 }));
      p.add(PB.text(this, W / 2, H / 2 - 310, 'SCORE', 24, '#9fa8e0', { strokeThickness: 0 }));
      p.add(PB.text(this, W / 2, H / 2 - 260, d.score.toLocaleString('en-US'), 52, '#ffffff', { glow: '#ff3df0' }));
      p.add(PB.text(this, W / 2, H / 2 - 200, 'Crystals left: ' + d.left, 22, '#9fa8e0', { strokeThickness: 0 }));
      var y = H / 2 - 110;
      if (livesOut && !d.lifeAdUsed && PB.Ads) {
        var watch = PB.button(this, W / 2, y, 460, 88, 'Watch ad: +3 lives', function () {
          if (watch.disabled) return;
          watch.setDisabled(true);
          PB.Ads.showRewarded('lives').then(function (res) {
            if (!res || !res.completed) { watch.setDisabled(false); return; }
            var g = self.scene.get('Game');
            if (g && g.grantLifeAd()) { self.scene.stop(); return; }
            watch.setVisible(false);
          });
        }, { color: 0xffd166, size: 28 });
        watch.name = 'watchLives';
        p.add(watch);
        y += 100;
      }
      if (livesOut && PB.Shop && PB.Shop.continuePrice(d.continuesUsed | 0)) {
        var price = PB.Shop.continuePrice(d.continuesUsed | 0);
        var afford = Save.data.coins >= price;
        var cont = PB.button(this, W / 2, y, 460, 88, 'Continue for ' + price + ' coins', function () {
          if (cont.disabled) return;
          cont.setDisabled(true);
          var g = self.scene.get('Game');
          if (g && g.grantContinue()) { self.scene.stop(); return; }
          cont.setDisabled(true);
        }, { color: afford ? 0x22e8ff : 0x4a4f78, size: 26, disabled: !afford });
        cont.name = 'continueCoins';
        p.add(cont);
        y += 100;
      }
      var rb = PB.button(this, W / 2, y, 460, 88, 'Retry', function () { self.scene.start('Game', { world: d.world, level: d.level }); }, { color: 0xff3df0, size: 32 });
      rb.name = 'retry'; p.add(rb);
      y += 96;
      p.add(PB.button(this, W / 2, y, 460, 80, 'Level select', function () { self.scene.stop('Game'); self.scene.start('Levels', { world: d.world }); }, { color: 0x22e8ff, size: 28 }));
      y += 90;
      var home = PB.button(this, W / 2, y, 460, 80, 'Home', function () { self.scene.stop('Game'); self.scene.start('Menu'); }, { color: 0x6a6f9a, size: 28 });
      home.name = 'home';
      p.add(home);
      p.y = 60; p.alpha = 0;
      this.tweens.add({ targets: p, y: 0, alpha: 1, duration: 320, ease: 'Cubic.out' });
    }
  }

  PB.MENU_SCENES = [BootScene, MenuScene, WorldsScene, LevelsScene, SettingsScene, RewardsScene, PauseScene, CompleteScene, GameOverScene];
})();
