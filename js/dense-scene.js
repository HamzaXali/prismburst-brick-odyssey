/*
 * PRISMBURST — dense-scene.js
 * Crystal Mass select screen and the micro-shard match.
 * Shards are one canvas texture. Balls are drawn in a single Graphics
 * object and capped by PB.Dense.addBall.
 */
(function () {
  'use strict';
  var PB = window.PB;
  var Dense = PB.Dense;
  var Save = PB.Save;
  var Sfx = PB.Sfx;
  var W = PB.W, H = PB.H;
  var COLS = Dense.COLS, ROWS = Dense.ROWS, CELL = Dense.CELL, OX = Dense.OX, OY = Dense.OY;
  var STEEL = Dense.STEEL, BALL_R = Dense.BALL_R, BALL_CAP = Dense.BALL_CAP;
  var TOP = 150, PADDLE_Y = 1100, PADDLE_H = 26, PADDLE_W = 150;
  var STRIDE = COLS * 2;
  var KIND = {
    1: [70, 232, 255, 255, 214, 255, 255, 255],
    2: [255, 64, 210, 255, 255, 186, 236, 255],
    3: [168, 124, 255, 255, 226, 214, 255, 255],
    4: [255, 208, 96, 255, 255, 244, 210, 255],
    8: [96, 122, 150, 255, 214, 240, 255, 255]
  };

  function gem(ctx, cx, cy, rx, ry, fill, edge) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx + rx, cy);
    ctx.lineTo(cx, cy + ry);
    ctx.lineTo(cx - rx, cy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  var POWER_LABEL = { multi: 'MULTI BALL', pierce: 'PIERCE', wide: 'WIDE PADDLE', bomb: 'PRISM BURST' };

  function paintCell(data, c, r, kind) {
    var colors = KIND[kind];
    var x = c * 2;
    var y = r * 2;
    var i = (y * STRIDE + x) * 4;
    var j = i + STRIDE * 4;
    if (!colors) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      data[i + 4] = data[i + 5] = data[i + 6] = data[i + 7] = 0;
      data[j] = data[j + 1] = data[j + 2] = data[j + 3] = 0;
      data[j + 4] = data[j + 5] = data[j + 6] = data[j + 7] = 0;
      return;
    }
    data[i] = colors[4]; data[i + 1] = colors[5]; data[i + 2] = colors[6]; data[i + 3] = colors[7];
    data[i + 4] = colors[0]; data[i + 5] = colors[1]; data[i + 6] = colors[2]; data[i + 7] = colors[3];
    data[j] = colors[0]; data[j + 1] = colors[1]; data[j + 2] = colors[2]; data[j + 3] = colors[3];
    data[j + 4] = colors[0]; data[j + 5] = colors[1]; data[j + 6] = colors[2]; data[j + 7] = colors[3];
  }

  class DenseSelectScene extends Phaser.Scene {
    constructor() { super('DenseSelect'); }
    create() {
      PB.enter(this);
      var self = this;
      this.add.image(W / 2, H / 2, 'bg2');
      var back = PB.button(this, 110, 78, 160, 72, '\u2039 Back', function () { PB.fadeTo(self, 'Menu'); }, { size: 28, color: 0x9b6bff });
      back.name = 'denseBack';
      var title = PB.text(this, W / 2 + 40, 78, Dense.TRACK.toUpperCase(), 40, '#e8fdff', { glow: '#22e8ff' });
      title.name = 'denseSelectTitle';
      PB.text(this, W / 2, 150, 'Micro-shard formations', 22, '#c9b8ff', { strokeThickness: 0 });
      var save = Dense.ensure(Save.data);
      var cols = 4;
      for (var i = 0; i < Dense.COUNT; i++) {
        var col = i % cols;
        var row = (i / cols) | 0;
        var x = 110 + col * 168;
        var y = 280 + row * 176;
      var open = (PB.levelsOpen && PB.levelsOpen()) || i < save.unlocked;
        var rec = save.levels[String(i)];
        (function (index, unlocked) {
          var b = PB.button(self, x, y, 148, 112, String(index + 1), function () {
            if (!unlocked) return;
            PB.fadeTo(self, 'Dense', { level: index });
          }, { size: 36, color: unlocked ? 0x22e8ff : 0x4a4f78, disabled: !unlocked });
          b.name = 'dense-' + index;
        })(i, open);
        var name = PB.text(this, x, y + 74, Dense.NAMES[i], 15, open ? '#d5e6ff' : '#6a7098', { strokeThickness: 0 });
        name.name = 'dense-name-' + i;
        var stars = rec ? rec.stars : 0;
        PB.text(this, x, y + 96, stars ? ('\u2605'.repeat(stars)) : (open ? 'open' : 'locked'), 16, stars ? '#ffe7a3' : '#7d86b0', { strokeThickness: 0 });
      }
    }
  }

  class DenseScene extends Phaser.Scene {
    constructor() { super('Dense'); }
    init(data) {
      data = data || {};
      var n = data.level | 0;
      if (n < 0) n = 0;
      if (n >= Dense.COUNT) n = Dense.COUNT - 1;
      this.levelIdx = n;
    }
    create() {
      PB.enter(this);
      PB.currentDense = this;
      var self = this;
      this.events.once('shutdown', function () { if (PB.currentDense === self) PB.currentDense = null; });
      this.lv = Dense.level(this.levelIdx);
      this.grid = new Uint8Array(this.lv.grid);
      this.breakableLeft = this.lv.breakable;
      this.score = 0;
      this.lives = 3;
      this.livesLost = 0;
      this.combo = 0;
      this.comboT = 0;
      this.speed = Dense.BALL_SPEED;
      this.started = false;
      this.ended = false;
      this.cleared = false;
      this.paused = false;
      this.over = false;
      this.bot = false;
      this.baseW = PADDLE_W;
      this.pierceT = 0;
      this.wideT = 0;
      this.seed = (this.levelIdx + 1) * 7919 + 13;
      this.budget = Dense.freshBudget();
      this.dropSeq = 0;
      this.sfxAt = 0;
      this.frameMs = [];
      this.warm = 0;
      this.fieldDirty = false;
      this.add.image(W / 2, H / 2, 'bg2');
      this.buildField();
      this.buildActors();
      this.buildHud();
      this.spawnAttached();
      this.onBreak = function (index) { Dense.breakShard(self, index); };
      this.onShard = function (index) { self.noteShard(index); };
      this.onClear = function (index) { self.noteShard(index); };
      this.onWin = function () { self.win(); };
      this.onDead = function () { self.loseLife(); };
      this.onCatch = function (drop) { self.catchDrop(drop); };
      this.input.on('pointerdown', function (p) {
        if (self.over || self.paused) return;
        self.paddle.tx = p.x;
        self.launch();
      });
      this.input.on('pointermove', function (p) {
        if (!self.over && !self.paused) self.paddle.tx = p.x;
      });
    }
    rng() {
      this.seed = (this.seed * 1103515245 + 12345) >>> 0;
      return this.seed / 4294967296;
    }
    buildField() {
      var canvas = document.createElement('canvas');
      canvas.width = COLS * 2;
      canvas.height = ROWS * 2;
      this.fieldCanvas = canvas;
      this.fieldCtx = canvas.getContext('2d', { alpha: true });
      this.imageData = this.fieldCtx.createImageData(canvas.width, canvas.height);
      this.pixels = this.imageData.data;
      if (this.textures.exists('dense-field')) this.textures.remove('dense-field');
      this.fieldTex = this.textures.addCanvas('dense-field', canvas);
      if (this.fieldTex.setFilter) this.fieldTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      var img = this.add.image(OX + (COLS * CELL) / 2, OY + (ROWS * CELL) / 2, 'dense-field');
      img.setDisplaySize(COLS * CELL, ROWS * CELL).setDepth(4);
      this.paintAll();
    }
    paintAll() {
      this.pixels.fill(0);
      var g = this.grid;
      for (var r = 0; r < ROWS; r++) {
        var row = r * COLS;
        for (var c = 0; c < COLS; c++) {
          var v = g[row + c];
          if (v) paintCell(this.pixels, c, r, v);
        }
      }
      this.flushField();
    }
    flushField() {
      this.fieldCtx.putImageData(this.imageData, 0, 0);
      this.fieldTex.refresh();
      this.fieldDirty = false;
    }
    buildActors() {
      var skin = Save.data.equipped.paddle || 'classic';
      var shopLook = PB.Shop ? PB.Shop.equipped(Save.data) : null;
      if (shopLook && shopLook.paddle) skin = shopLook.paddle.id;
      this.paddle = { x: W / 2, tx: W / 2, w: PADDLE_W };
      this.paddleSpr = this.add.image(W / 2, PADDLE_Y, 'paddle_' + skin).setDepth(16);
      var ballSkin = Save.data.equipped.ball || 'classic';
      var look = PB.BALL_SKINS[0];
      for (var s = 0; s < PB.BALL_SKINS.length; s++) if (PB.BALL_SKINS[s].id === ballSkin) look = PB.BALL_SKINS[s];
      this.ballColor = look.glow || look.color;
      this.balls = [];
      this.ballSpr = [];
      for (var i = 0; i < BALL_CAP; i++) {
        this.balls.push({ active: false, attached: false, x: 0, y: 0, vx: 0, vy: 0, merged: 1 });
        var spr = this.add.image(0, 0, 'ball_' + look.id).setVisible(false).setDepth(18);
        spr.setDisplaySize(BALL_R * 2, BALL_R * 2);
        spr._m = 1;
        this.ballSpr.push(spr);
      }
      this.makeDropTextures();
      this.drops = [];
      this.dropSpr = [];
      for (var d = 0; d < 24; d++) {
        this.drops.push({ active: false, kind: '', x: 0, y: 0, collected: false, value: 0, id: 0 });
        this.dropSpr.push(this.add.image(0, 0, 'coin').setVisible(false).setDepth(17).setDisplaySize(26, 26));
      }
      this.hit = { pen: 0, nx: 0, ny: 0, kind: 0, index: -1 };
    }
    makeDropTextures() {
      if (this.textures.exists('dense_bomb')) return;
      function canvas(w, h, draw) {
        var c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        draw(c.getContext('2d'));
        return c;
      }
      this.textures.addCanvas('dense_multi', canvas(40, 36, function (ctx) {
        gem(ctx, 12, 20, 8, 12, '#22e8ff', '#e8fdff');
        gem(ctx, 24, 12, 7, 10, '#ff3df0', '#ffe0f8');
        gem(ctx, 30, 24, 7, 10, '#ffd166', '#fff6d8');
      }));
      this.textures.addCanvas('dense_pierce', canvas(36, 36, function (ctx) {
        gem(ctx, 18, 18, 8, 16, '#ff7a1a', '#fff1d0');
        gem(ctx, 18, 16, 3, 8, '#fff6c0', '#ffffff');
      }));
      this.textures.addCanvas('dense_wide', canvas(44, 28, function (ctx) {
        ctx.fillStyle = '#3dffa0';
        ctx.beginPath();
        ctx.moveTo(6, 14);
        ctx.lineTo(14, 6);
        ctx.lineTo(30, 6);
        ctx.lineTo(38, 14);
        ctx.lineTo(30, 22);
        ctx.lineTo(14, 22);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#e8fff4';
        ctx.lineWidth = 2;
        ctx.stroke();
      }));
      this.textures.addCanvas('dense_bomb', canvas(36, 36, function (ctx) {
        gem(ctx, 18, 20, 12, 14, '#b06bff', '#ffe7ff');
        gem(ctx, 18, 18, 5, 7, '#ff3df0', '#ffffff');
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(16, 2, 4, 6);
      }));
    }
    buildHud() {
      var self = this;
      var g = this.add.graphics().setDepth(40);
      g.fillStyle(0x05061a, 0.88);
      g.fillRect(0, 0, W, TOP);
      g.lineStyle(3, 0x22e8ff, 0.9);
      g.lineBetween(0, TOP, W, TOP);
      var back = PB.button(this, 78, 46, 112, 64, '\u2039', function () {
        self.scene.start('DenseSelect');
      }, { size: 34, color: 0x9b6bff });
      back.setDepth(42);
      back.name = 'denseBack';
      var pause = PB.button(this, 78, 112, 112, 60, '', function () { self.pauseMatch(); }, { color: 0x22e8ff });
      pause.add(this.add.image(0, 0, 'pause_icon'));
      pause.setDepth(42);
      pause.name = 'densePause';
      this.titleText = PB.text(this, W / 2 + 20, 46, this.lv.name, 28, '#e8fdff', { glow: '#22e8ff' }).setDepth(41);
      this.titleText.name = 'denseTitle';
      this.scoreText = PB.text(this, W / 2 + 20, 100, '\u2605 0', 30, '#ffe7a3').setDepth(41);
      this.scoreText.name = 'denseScore';
      this.livesHud = PB.attachLifeHud(this, 600, 78);
      this.livesIcons = this.livesHud.livesIcons;
      this.livesCount = this.livesHud.livesCount;
      PB.syncLifeHud(this.livesHud, this.lives);
      this.hint = PB.text(this, W / 2, PADDLE_Y - 90, 'TAP TO LAUNCH', 28, '#e8fdff', { glow: '#22e8ff' }).setDepth(30);
      this.hudLives = -1;
      this.hudScore = -1;
    }
    spawnAttached() {
      var res = Dense.addBall(this.balls, { x: this.paddle.x, y: PADDLE_Y - PADDLE_H / 2 - BALL_R, vx: 0, vy: 0 }, BALL_CAP);
      if (!res.ball) return null;
      res.ball.attached = true;
      res.ball.merged = 1;
      return res.ball;
    }
    launch() {
      if (this.ended || this.paused || this.over) return false;
      var any = false;
      for (var i = 0; i < this.balls.length; i++) {
        var b = this.balls[i];
        if (!b.active || !b.attached) continue;
        var a = (this.rng() - 0.5) * 0.5;
        b.attached = false;
        b.vx = Math.sin(a) * this.speed;
        b.vy = -Math.cos(a) * this.speed;
        any = true;
      }
      if (any) {
        this.started = true;
        if (this.hint) this.hint.setVisible(false);
        Sfx.play('launch');
      }
      return any;
    }
    spawnDrop(kind, x, y) {
      for (var i = 0; i < this.drops.length; i++) {
        var d = this.drops[i];
        if (d.active) continue;
        d.active = true;
        d.kind = kind;
        d.x = x;
        d.y = y;
        d.collected = false;
        d.value = kind === 'coin' ? Dense.COIN_VALUE : 0;
        d.id = ++this.dropSeq;
        return d;
      }
      return null;
    }
    catchDrop(drop) {
      if (!drop || !drop.active) return false;
      drop.active = false;
      if (drop.kind === 'coin') {
        var got = Dense.collectCoin(Save.data, drop);
        if (got.ok) {
          Save.persist();
          Sfx.play('coin');
        }
        return got.ok;
      }
      if (drop.collected) return false;
      drop.collected = true;
      Dense.applyPower(this, drop.kind);
      this.flashPower(POWER_LABEL[drop.kind] || 'POWER');
      Sfx.play('power');
      return true;
    }
    noteShard(index) {
      var c = index % COLS;
      var r = (index / COLS) | 0;
      paintCell(this.pixels, c, r, 0);
      this.fieldDirty = true;
      this.combo = this.comboT < 1.2 ? this.combo + 1 : 1;
      this.comboT = 0;
      this.score += 10 + Math.min(20, this.combo);
    }
    flashPower(name) {
      if (this.powerLabel) this.powerLabel.destroy();
      this.powerLabel = PB.text(this, W / 2, 220, name, 28, '#ffe7a3', { glow: '#ff3df0' }).setDepth(45);
      this.powerLabel.name = 'densePower';
    }
    simulate(dt) {
      Dense.stepMatch(this, dt);
      this.comboT += dt;
      var p = this.paddle;
      this.paddleSpr.x = p.x;
      var sx = p.w / PADDLE_W;
      if (this.paddleSpr.scaleX !== sx) this.paddleSpr.setScale(sx, 1);
    }
    loseLife() {
      if (this.ended) return;
      this.lives--;
      this.livesLost++;
      if (this.lives <= 0) {
        this.lives = 0;
        this.ended = true;
        this.over = true;
        this.showEnd(false);
        return;
      }
      this.started = false;
      this.spawnAttached();
      if (this.hint) this.hint.setVisible(true);
    }
    win() {
      if (this.over) return;
      this.ended = true;
      this.over = true;
      var stars = 1;
      if (this.livesLost === 0) stars = 2;
      if (stars === 2 && this.score >= this.lv.star3 && this.combo >= 12) stars = 3;
      this.clearResult = Dense.recordClear(Save.data, this.levelIdx, this.score, stars);
      this._achTag = '';
      this._achToast = '';
      if (PB.Achievements) {
        var fresh = PB.Achievements.settle(Save.data, { flawless: this.livesLost === 0 });
        var latest = PB.Achievements.latest(Save.data);
        this._achTag = latest ? latest.name : '';
        if (fresh.length) this._achToast = fresh[fresh.length - 1].name;
      }
      Save.persist();
      this.showEnd(true);
    }
    showEnd(cleared) {
      var self = this;
      var root = this.add.container(0, 0).setDepth(60);
      root.add(this.add.rectangle(W / 2, H / 2, W, H, 0x05061a, 0.72).setInteractive());
      root.add(PB.panel(this, W / 2, H / 2, 600, 780, cleared ? 0xffd166 : 0xff4d8d));
      var title = PB.text(this, W / 2, H / 2 - 280, cleared ? 'MASS CLEARED' : 'OUT OF LIVES', 48, '#ffffff', { glow: cleared ? '#ffd166' : '#ff4d8d' });
      title.name = cleared ? 'denseClearTitle' : 'denseOverTitle';
      root.add(title);
      root.add(PB.text(this, W / 2, H / 2 - 210, this.lv.name, 28, '#d5e6ff', { strokeThickness: 0 }));
      if (cleared && this.clearResult) {
        root.add(PB.text(this, W / 2, H / 2 - 140, '+' + this.clearResult.added + ' coins', 32, '#ffe7a3'));
      }
      if (cleared && this._achTag) {
        var tag = PB.text(this, W / 2, H / 2 - 80, this._achTag, 22, '#ffe7a3', { strokeThickness: 0 });
        tag.name = 'denseClearTag';
        root.add(tag);
      }
      if (cleared && this._achToast && PB.Achievements) PB.Achievements.showToast(this, this._achToast);
      var retry = PB.button(this, W / 2, H / 2 + 20, 420, 88, 'Retry', function () {
        self.scene.start('Dense', { level: self.levelIdx });
      }, { size: 32, color: 0xff3df0 });
      retry.name = 'denseRetry';
      root.add(retry);
      if (cleared && this.levelIdx + 1 < Dense.COUNT) {
        var next = PB.button(this, W / 2, H / 2 + 130, 420, 88, 'Next mass', function () {
          self.scene.start('Dense', { level: self.levelIdx + 1 });
        }, { size: 32, color: 0x22e8ff });
        next.name = 'denseNext';
        root.add(next);
      }
      var home = PB.button(this, W / 2, H / 2 + (cleared ? 240 : 140), 420, 88, 'Levels', function () {
        self.scene.start('DenseSelect');
      }, { size: 32, color: 0x9b6bff });
      home.name = 'denseLevels';
      root.add(home);
    }
    pauseMatch() {
      if (this.ended || this.paused) return;
      this.paused = true;
      var self = this;
      var root = this.add.container(0, 0).setDepth(60);
      this.pauseRoot = root;
      root.add(this.add.rectangle(W / 2, H / 2, W, H, 0x05061a, 0.72).setInteractive());
      root.add(PB.panel(this, W / 2, H / 2, 560, 640, 0x22e8ff));
      var title = PB.text(this, W / 2, H / 2 - 220, 'PAUSED', 56, '#ffffff', { glow: '#22e8ff' });
      title.name = 'densePauseTitle';
      root.add(title);
      root.add(PB.text(this, W / 2, H / 2 - 150, this.lv.name, 26, '#d5e6ff', { strokeThickness: 0 }));
      var resume = PB.button(this, W / 2, H / 2 - 40, 400, 88, 'Resume', function () {
        self.paused = false;
        root.destroy();
        self.pauseRoot = null;
      }, { size: 32, color: 0x22e8ff });
      resume.name = 'denseResume';
      root.add(resume);
      var retry = PB.button(this, W / 2, H / 2 + 70, 400, 88, 'Retry', function () {
        self.scene.start('Dense', { level: self.levelIdx });
      }, { size: 32, color: 0xff3df0 });
      retry.name = 'denseRetry';
      root.add(retry);
      var quit = PB.button(this, W / 2, H / 2 + 180, 400, 88, 'Levels', function () {
        self.scene.start('DenseSelect');
      }, { size: 32, color: 0x9b6bff });
      quit.name = 'denseLevels';
      root.add(quit);
    }
    syncActors() {
      for (var i = 0; i < this.balls.length; i++) {
        var b = this.balls[i];
        var spr = this.ballSpr[i];
        if (!b.active) {
          if (spr.visible) spr.setVisible(false);
          continue;
        }
        spr.setPosition(b.x, b.y);
        if (!spr.visible) spr.setVisible(true);
        var tint = this.pierceT > 0 ? 0xffb15a : 0xffffff;
        if (spr._tint !== tint) {
          spr._tint = tint;
          spr.setTint(tint);
        }
        var merged = b.merged | 0;
        if (spr._m !== merged) {
          spr._m = merged;
          var rad = (BALL_R + Math.min(5, merged - 1)) * 2;
          spr.setDisplaySize(rad, rad);
        }
      }
      for (var d = 0; d < this.drops.length; d++) {
        var drop = this.drops[d];
        var icon = this.dropSpr[d];
        if (!drop.active) {
          if (icon.visible) icon.setVisible(false);
          continue;
        }
        var key = drop.kind === 'multi' ? 'dense_multi'
          : drop.kind === 'pierce' ? 'dense_pierce'
          : drop.kind === 'wide' ? 'dense_wide'
          : drop.kind === 'bomb' ? 'dense_bomb'
          : 'coin';
        if (icon.texture.key !== key) icon.setTexture(key);
        var size = drop.kind === 'coin' ? 26 : 36;
        if (icon._sz !== size) {
          icon._sz = size;
          icon.setDisplaySize(size, size);
        }
        icon.setPosition(drop.x, drop.y);
        if (!icon.visible) icon.setVisible(true);
      }
    }
    updateHud() {
      if (this.score !== this.hudScore) {
        this.hudScore = this.score;
        this.scoreText.setText('\u2605 ' + this.score.toLocaleString('en-US'));
      }
      if (this.lives !== this.hudLives) {
        this.hudLives = this.lives;
        PB.syncLifeHud(this.livesHud, this.lives);
      }
    }
    swarm(n) {
      this.launch();
      var target = n | 0;
      if (target < 1) target = 1;
      if (target > BALL_CAP) target = BALL_CAP;
      var guard = 0;
      while (Dense.activeCount(this.balls) < target && guard < BALL_CAP + 2) {
        var a = guard * 0.77;
        var res = Dense.addBall(this.balls, {
          x: 70 + (guard * 53) % 580,
          y: 240 + (guard * 37) % 620,
          vx: Math.sin(a) * this.speed,
          vy: Math.cos(a) * this.speed
        }, BALL_CAP);
        if (res.ball) res.ball.attached = false;
        if (!res.ok || res.merged) break;
        guard++;
      }
      this.started = true;
      if (this.hint) this.hint.setVisible(false);
      return Dense.activeCount(this.balls);
    }
    fallCoin() {
      var before = Save.data.coins | 0;
      var drop = this.spawnDrop('coin', this.paddle.x, PADDLE_Y - 6);
      if (!drop) return { before: before, after: before, again: before, ok: false };
      this.catchDrop(drop);
      var after = Save.data.coins | 0;
      this.catchDrop(drop);
      return { before: before, after: after, again: Save.data.coins | 0, ok: after === before + Dense.COIN_VALUE };
    }
    update(time, delta) {
      var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : time;
      if (this.lastFrame) {
        var wall = now - this.lastFrame;
        if (this.warm < 12) this.warm++;
        else if (!this.paused && wall > 0 && wall < 250) {
          this.frameMs.push(wall);
          if (this.frameMs.length > 180) this.frameMs.shift();
        }
      }
      this.lastFrame = now;
      var dt = Math.min(delta, 34) / 1000;
      var workStart = now;
      this.simulate(dt);
      this.syncActors();
      if (this.fieldDirty) this.flushField();
      this.updateHud();
      if (this.warm >= 12 && !this.paused) {
        var work = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : time) - workStart;
        if (!this.workMs) this.workMs = [];
        this.workMs.push(work);
        if (this.workMs.length > 180) this.workMs.shift();
      }
    }
  }

  PB.DENSE_SCENES = [DenseSelectScene, DenseScene];
})();
