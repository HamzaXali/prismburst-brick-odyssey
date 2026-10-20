/*
 * PRISMBURST — BRICK ODYSSEY
 * game.js — gameplay scene (custom swept circle-vs-box physics with substeps),
 * power-ups, scoring, objectives, plus Phaser bootstrap and the test hook.
 */
(function () {
  'use strict';
  var PB = window.PB, L = window.PB_LEVELS, Save = PB.Save, Sfx = PB.Sfx;
  var W = PB.W, H = PB.H;
  var COLS = L.COLS, CW = 56, CH = 32, GX = 24, GY = 214, BW = 52, BH = 28;
  var TOP = 150;                         // top wall (HUD sits above it)
  var PADDLE_Y = 1100, PADDLE_H = 26, PADDLE_W = 150, BALL_R = 11, MAX_BALLS = 8;
  var STEP = 5;                          // max px a ball moves per physics substep
  var MIN_VY = 0.3, MIN_VX = 0.06;       // fractions of speed (anti-stuck)

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  class GameScene extends Phaser.Scene {
    constructor() { super('Game'); }

    init(data) {
      data = data || {};
      this.worldIdx = clamp(data.world | 0, 0, L.worldCount() - 1);
      this.levelIdx = clamp(data.level | 0, 0, L.LEVELS_PER_WORLD - 1);
    }

    create() {
      PB.enter(this);
      var lv = this.lv = L.getLevel(this.worldIdx, this.levelIdx);
      this.wd = L.WORLDS[this.worldIdx];
      Save.data.last = { world: this.worldIdx, level: this.levelIdx }; Save.data.stats.played++;
      this.add.image(W / 2, H / 2, 'bg' + this.worldIdx);

      // ---- state
      this.score = 0; this.shownScore = 0; this.lives = 3; this.livesLost = 0;
      this.combo = 0; this.maxCombo = 0; this.comboT = 0; this.elapsed = 0; this.t = 0;
      this.ended = false; this.started = false; this.freeze = 0; this.resumeGuard = 0;
      this.timeScale = 1; this.bot = false; this.botOffset = 0;
      this.speed = lv.speed;
      this.session = { bricks: 0, powerups: 0 }; this.committed = { bricks: 0, powerups: 0, score: 0 };
      this.timers = { fire: 0, laser: 0, explosive: 0, wide: 0 };
      this.laserCD = 0; this.magnet = false; this.sinceBrick = 0; this.assistN = 0; this.fxTint = 0xffffff; this._h = { pen: 0, nx: 0, ny: 0 };
      this.counters = { paddleHits: 0, brickHits: 0, destroyed: 0, fireKills: 0, blastHits: 0, laserHits: 0, steelHits: 0, nudges: 0, maxNoPaddle: 0 };

      this.buildBricks();
      this.createFx();
      this.createPaddle();
      this.createBalls();
      this.createPools();
      this.createHud();
      this.spawnBall(true);
      this.showIntro();

      // ---- input: paddle follows the finger, release = launch
      this.input.on('pointerdown', function (p, over) { if (!over.length) this.paddle.tx = p.x; }, this);
      this.input.on('pointermove', function (p) { if (!this.bot) this.paddle.tx = p.x; }, this);
      this.input.on('pointerup', function (p, over) {
        if (over.length || this.ended || performance.now() < this.resumeGuard) return;
        this.launch();
      }, this);
      this.events.on('resume', function () { this.resumeGuard = performance.now() + 250; this.freeze = 0.4; }, this);

      // ---- auto-pause when the app/tab loses focus
      var self = this;
      this._onHidden = function () { if (document.hidden) { self.commitStats(); self.autoPause(); Sfx.suspend(); } };
      this._onBlur = function () { self.autoPause(); };
      document.addEventListener('visibilitychange', this._onHidden);
      window.addEventListener('blur', this._onBlur);
      this.game.events.on('hidden', this._onHidden, this);
      this.events.once('shutdown', this.cleanup, this);
      PB.currentGame = this;
    }

    cleanup() {
      this.commitStats();
      document.removeEventListener('visibilitychange', this._onHidden);
      window.removeEventListener('blur', this._onBlur);
      this.game.events.off('hidden', this._onHidden, this);
      if (PB.currentGame === this) PB.currentGame = null;
    }

    // ================================================================ build
    buildBricks() {
      var lv = this.lv, wd = this.wd, grid = lv.grid;
      this.rows = grid.length; this.bricks = []; this.cells = new Array(this.rows * COLS).fill(null);
      this.movers = []; this.regens = []; this.bands = [];
      this.breakableLeft = 0; this.targetsLeft = 0; this.targetsTotal = 0;
      this.gridBottom = GY + this.rows * CH;
      var d = (this.worldIdx * L.LEVELS_PER_WORLD + this.levelIdx) / (L.worldCount() * L.LEVELS_PER_WORLD);
      for (var r = 0; r < this.rows; r++) {
        var band = null;
        for (var c = 0; c < COLS; c++) {
          var ch = grid[r][c], info = L.BRICK_INFO[ch];
          if (!info) continue;
          var x = GX + c * CW + CW / 2, y = GY + r * CH + CH / 2;
          var key = { steel: 'steel', explosive: 'explosive', target: 'target', regen: 'regen' }[info.type] || 'brick';
          var b = { r: r, c: c, x: x, y: y, baseX: x, type: info.type, hp: info.hp, maxHp: info.hp, alive: true, regenT: 0, glow: null, mark: null, crack: null };
          if (info.type !== 'steel') {
            b.glow = this.add.image(x, y, 'brick_glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55);
          }
          b.spr = this.add.image(x, y, key);
          if (info.type === 'prize') b.mark = this.add.image(x, y, 'prize_mark');
          if (info.type === 'moving') b.mark = this.add.image(x, y, 'move_mark').setAlpha(0.8);
          this.tintBrick(b);
          if (info.type !== 'steel') { this.breakableLeft++; }
          if (info.type === 'target') { this.targetsLeft++; this.targetsTotal++; }
          if (info.type === 'regen') this.regens.push(b);
          if (info.type === 'moving') {
            this.movers.push(b);
            if (!band) band = { bricks: [], minC: c, maxC: c, phase: r * 1.7, w: 0.7 + d * 0.9 };
            band.bricks.push(b); band.maxC = c;
          } else this.cells[r * COLS + c] = b;
          this.bricks.push(b);
          // entrance animation (visual only)
          var parts = [b.spr, b.glow, b.mark].filter(Boolean);
          parts.forEach(function (o) { o.y -= 260; o.alpha = 0; });
          this.tweens.add({ targets: parts, y: '+=260', alpha: { getEnd: function (t) { return t.texture.key === 'brick_glow' ? 0.55 : (t.texture.key === 'move_mark' ? 0.8 : 1); } }, duration: 420, delay: r * 35 + Math.abs(c - 5.5) * 12, ease: 'Back.out' });
        }
        if (band) {
          band.left = band.minC * CW - 14;              // free px to the left (keep a gap to the wall)
          band.right = (COLS - 1 - band.maxC) * CW - 14;
          this.bands.push(band);
        }
      }
    }

    hpColor(b) {
      if (b.type === 'regen') return 0x3dffa0;
      return this.wd.hp[clamp(b.hp, 1, 4) - 1];
    }
    tintBrick(b) {
      if (b.type === 'steel' || b.type === 'explosive' || b.type === 'target') {
        if (b.glow) b.glow.setTint(b.type === 'target' ? 0xffd166 : 0xff2e63);
        b.spr.clearTint(); return;
      }
      var col = this.hpColor(b);
      b.spr.setTint(col); if (b.glow) b.glow.setTint(col);
      if (b.maxHp > 1) {
        var lvl = Math.min(3, b.maxHp - b.hp);
        if (lvl > 0) {
          if (!b.crack) b.crack = this.add.image(b.x, b.y, 'crack' + lvl); else b.crack.setTexture('crack' + lvl).setVisible(true);
        } else if (b.crack) b.crack.setVisible(false);
      }
    }

    createFx() {
      var self = this;
      this.trailG = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      this.shardFx = this.add.particles(0, 0, 'shard', {
        emitting: false, speed: { min: 140, max: 460 }, angle: { min: 0, max: 360 }, rotate: { min: 0, max: 360 },
        scale: { start: 1.1, end: 0.15 }, alpha: { start: 1, end: 0 }, lifespan: { min: 380, max: 780 }, gravityY: 760,
        tint: { onEmit: function () { return self.fxTint; } }, blendMode: 'ADD', maxAliveParticles: 260
      }).setDepth(20);
      this.sparkFx = this.add.particles(0, 0, 'spark', {
        emitting: false, speed: { min: 60, max: 300 }, angle: { min: 0, max: 360 }, scale: { start: 1.4, end: 0 },
        alpha: { start: 1, end: 0 }, lifespan: { min: 200, max: 420 },
        tint: { onEmit: function () { return self.fxTint; } }, blendMode: 'ADD', maxAliveParticles: 180
      }).setDepth(21);
      this.rings = [];
      for (var i = 0; i < 6; i++) this.rings.push(this.add.image(0, 0, 'ring').setVisible(false).setBlendMode('ADD').setDepth(22));
      this.ringIdx = 0;
    }
    burst(x, y, color, shards, sparks) {
      this.fxTint = color;
      if (shards) this.shardFx.explode(shards, x, y);
      if (sparks) this.sparkFx.explode(sparks, x, y);
    }
    ring(x, y, color, size) {
      var r = this.rings[this.ringIdx++ % this.rings.length];
      this.tweens.killTweensOf(r);
      r.setPosition(x, y).setTint(color).setScale(0.2).setAlpha(1).setVisible(true);
      this.tweens.add({ targets: r, scale: size || 1.4, alpha: 0, duration: 380, ease: 'Cubic.out', onComplete: function () { r.setVisible(false); } });
    }
    shake(ms, k) { if (Save.data.settings.shake) this.cameras.main.shake(ms, k); }

    createPaddle() {
      var skin = Save.data.equipped.paddle;
      this.paddle = { x: W / 2, tx: W / 2, w: PADDLE_W, targetW: PADDLE_W };
      this.paddleSpr = this.add.image(W / 2, PADDLE_Y, 'paddle_' + skin).setDepth(10);
      this.cannonL = this.add.image(0, PADDLE_Y - 18, 'cannon').setVisible(false).setDepth(9);
      this.cannonR = this.add.image(0, PADDLE_Y - 18, 'cannon').setVisible(false).setDepth(9);
    }

    createBalls() {
      var skin = Save.data.equipped.ball;
      this.ballSkin = PB.BALL_SKINS.filter(function (s) { return s.id === skin; })[0] || PB.BALL_SKINS[0];
      this.balls = [];
      for (var i = 0; i < MAX_BALLS; i++) {
        var aura = this.add.image(0, 0, 'glow').setScale(0.55).setBlendMode('ADD').setVisible(false).setDepth(11);
        var spr = this.add.image(0, 0, 'ball_' + this.ballSkin.id).setVisible(false).setDepth(12);
        this.balls.push({ active: false, attached: false, x: 0, y: 0, vx: 0, vy: 0, spr: spr, aura: aura, offset: 0, noPaddle: 0, sinceHit: 0, trail: new Float32Array(20), tn: 0, ti: 0 });
      }
    }

    createPools() {
      this.capsules = [];
      for (var i = 0; i < 6; i++) this.capsules.push({ active: false, type: null, x: 0, y: 0, spr: this.add.image(0, 0, 'cap_multi').setVisible(false).setDepth(14) });
      this.bolts = [];
      for (var j = 0; j < 16; j++) this.bolts.push({ active: false, x: 0, y: 0, spr: this.add.image(0, 0, 'laser').setVisible(false).setBlendMode('ADD').setDepth(13) });
      this.floats = [];
      for (var k = 0; k < 12; k++) this.floats.push(PB.text(this, 0, 0, '', 26, '#ffffff').setVisible(false).setDepth(30));
      this.floatIdx = 0;
    }
    floatText(x, y, str, color, size) {
      var t = this.floats[this.floatIdx++ % this.floats.length];
      this.tweens.killTweensOf(t);
      t.setText(str).setColor(color || '#ffffff').setFontSize((size || 26) + 'px').setPosition(x, y).setAlpha(1).setScale(0.6).setVisible(true);
      this.tweens.add({ targets: t, y: y - 60, scale: 1, alpha: 0, duration: 700, ease: 'Cubic.out', onComplete: function () { t.setVisible(false); } });
    }

    // ================================================================ HUD
    createHud() {
      var g = this.add.graphics().setDepth(40);
      g.fillStyle(0x05061a, 0.82); g.fillRect(0, 0, W, TOP);
      g.fillStyle(this.wd.accent, 0.08); g.fillRect(0, TOP - 40, W, 40);
      g.lineStyle(3, this.wd.accent, 0.9); g.lineBetween(0, TOP, W, TOP);
      g.lineStyle(8, this.wd.accent, 0.15); g.lineBetween(0, TOP + 2, W, TOP + 2);
      // side rails
      g.lineStyle(2, this.wd.accent2, 0.35); g.lineBetween(1, TOP, 1, H); g.lineBetween(W - 1, TOP, W - 1, H);
      PB.text(this, 24, 30, 'SCORE', 20, '#9fa8e0', { ox: 0, strokeThickness: 0 }).setDepth(41);
      this.scoreText = PB.text(this, 24, 66, '0', 40, '#ffffff', { ox: 0, glow: PB.hex(this.wd.accent) }).setDepth(41);
      this.livesIcons = [];
      for (var i = 0; i < 5; i++) this.livesIcons.push(this.add.image(36 + i * 30, 116, 'life').setDepth(41).setVisible(i < this.lives));
      PB.text(this, W / 2, 30, this.wd.name.toUpperCase() + ' · ' + (this.levelIdx + 1), 22, PB.hex(this.wd.accent), { strokeThickness: 0 }).setDepth(41);
      this.objText = PB.text(this, W / 2, 70, '', 30, '#ffe7a3').setDepth(41);
      this.comboText = PB.text(this, W / 2, 112, '', 24, '#ff9cf6', { glow: '#ff3df0' }).setDepth(41);
      // pause button (big touch target)
      var self = this;
      var pb = PB.button(this, W - 64, 66, 96, 96, '', function () { self.pauseGame(); }, { color: 0x22e8ff });
      pb.add(this.add.image(0, 0, 'pause_icon')); pb.setDepth(42); pb.name = 'pauseBtn';
      this.pauseBtn = pb;
      // power-up indicators (just under the top wall)
      this.powIcons = {};
      var keys = PB.POWERUP_KEYS.filter(function (k) { return PB.POWERUPS[k].dur > 0; });
      keys.forEach(function (k, i) {
        var c = self.add.container(70 + i * 120, TOP + 30).setDepth(41).setVisible(false);
        var bar = self.add.graphics();
        c.add([self.add.image(0, 0, 'cap_' + k).setScale(0.9), bar]); c.bar = bar;
        self.powIcons[k] = c;
      });
      this.hint = PB.text(this, W / 2, PADDLE_Y - 120, 'TAP TO LAUNCH', 34, '#e8fdff', { glow: '#22e8ff' }).setDepth(30);
      this.tweens.add({ targets: this.hint, alpha: 0.35, yoyo: true, repeat: -1, duration: 700 });
      this.hud = { score: -1, obj: '', combo: -1, lives: -1 };
    }
    updateHud() {
      var s = Math.round(this.shownScore);
      if (s !== this.hud.score) { this.hud.score = s; this.scoreText.setText(s.toLocaleString('en-US')); }
      var o = this.lv.objective, str;
      if (o.type === 'score') str = 'Target ' + Math.min(this.score, o.target).toLocaleString('en-US') + ' / ' + o.target.toLocaleString('en-US');
      else if (o.type === 'targets') str = 'Cores ' + (this.targetsTotal - this.targetsLeft) + ' / ' + this.targetsTotal;
      else if (o.type === 'time') { var left = Math.max(0, Math.ceil(o.time - this.elapsed)); str = 'TIME ' + Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2) + '  ·  ' + this.breakableLeft + ' left'; }
      else str = 'Crystals left ' + this.breakableLeft;
      if (str !== this.hud.obj) {
        this.hud.obj = str; this.objText.setText(str);
        if (o.type === 'time') this.objText.setColor(o.time - this.elapsed < 15 ? '#ff6b8b' : '#ffe7a3');
      }
      var m = this.mult();
      var cs = this.combo >= 3 ? 'COMBO ' + this.combo + '  ×' + m.toFixed(1) : '';
      if (cs !== this.hud.combo) { this.hud.combo = cs; this.comboText.setText(cs); }
      if (this.lives !== this.hud.lives) { this.hud.lives = this.lives; for (var i = 0; i < 5; i++) this.livesIcons[i].setVisible(i < this.lives); }
      for (var k in this.powIcons) {
        var t = this.timers[k], ic = this.powIcons[k];
        if (t > 0) {
          ic.setVisible(true); ic.bar.clear(); ic.bar.fillStyle(0x0a0d26, 1); ic.bar.fillRect(-30, 20, 60, 6);
          ic.bar.fillStyle(PB.POWERUPS[k].color, 1); ic.bar.fillRect(-30, 20, 60 * Math.min(1, t / PB.POWERUPS[k].dur), 6);
          ic.setAlpha(t < 2 ? (Math.floor(this.t * 8) % 2 ? 0.4 : 1) : 1);
        } else if (ic.visible) ic.setVisible(false);
      }
    }
    showIntro() {
      var lv = this.lv;
      var c = this.add.container(W / 2, 760).setDepth(35);
      var g = this.add.graphics(); g.fillStyle(0x05061a, 0.75); g.fillRoundedRect(-300, -90, 600, 180, 30); g.lineStyle(3, this.wd.accent, 1); g.strokeRoundedRect(-300, -90, 600, 180, 30);
      c.add([g, PB.text(this, 0, -40, 'LEVEL ' + (this.levelIdx + 1) + ' · ' + lv.name.toUpperCase(), 34, '#ffffff', { glow: PB.hex(this.wd.accent) }),
        PB.text(this, 0, 22, L.describeObjective(lv.objective), 28, '#ffe7a3')]);
      c.setAlpha(0).setScale(0.8);
      this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 300, delay: 250, ease: 'Back.out' });
      this.tweens.add({ targets: c, alpha: 0, y: 720, duration: 400, delay: 2300, onComplete: function () { c.destroy(); } });
      this.introBox = c;
    }

    // ================================================================ balls
    spawnBall(attached, from) {
      for (var i = 0; i < this.balls.length; i++) {
        var b = this.balls[i]; if (b.active) continue;
        b.active = true; b.attached = attached; b.noPaddle = 0; b.sinceHit = 0; b.tn = 0;
        if (attached) { b.offset = 0; b.x = this.paddle.x; b.y = PADDLE_Y - PADDLE_H / 2 - BALL_R; b.vx = 0; b.vy = 0; }
        else if (from) { b.x = from.x; b.y = from.y; }
        b.spr.setVisible(true).setPosition(b.x, b.y);
        this.updateBallLook();
        return b;
      }
      return null;
    }
    activeBallCount() { var n = 0; for (var i = 0; i < this.balls.length; i++) if (this.balls[i].active) n++; return n; }
    launch() {
      var any = false;
      for (var i = 0; i < this.balls.length; i++) {
        var b = this.balls[i]; if (!b.active || !b.attached) continue;
        var off = clamp((b.x - this.paddle.x) / (this.paddle.w / 2), -1, 1);
        var a = off * 0.6 + (Math.random() - 0.5) * 0.5;
        b.vx = Math.sin(a) * this.speed; b.vy = -Math.cos(a) * this.speed; b.attached = false; b.noPaddle = 0; b.sinceHit = 0;
        this.normalize(b); any = true;
      }
      if (any) {
        this.started = true; this.hint.setVisible(false); Sfx.play('launch');
        if (this.introBox && this.introBox.active) this.tweens.add({ targets: this.introBox, alpha: 0, duration: 200 });
      }
      return any;
    }
    normalize(b) {
      var sp = this.speed, len = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (!(len > 1)) { var a = (Math.random() - 0.5) * 0.8; b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp; len = sp; }
      b.vx = b.vx / len * sp; b.vy = b.vy / len * sp;
      var minVy = sp * MIN_VY, minVx = sp * MIN_VX;
      if (Math.abs(b.vy) < minVy) { var sy = b.vy < 0 ? -1 : 1; b.vy = sy * minVy; b.vx = (b.vx < 0 ? -1 : 1) * Math.sqrt(sp * sp - minVy * minVy); }
      if (Math.abs(b.vx) < minVx) { var sx = b.vx < 0 ? -1 : (b.vx > 0 ? 1 : (Math.random() < 0.5 ? -1 : 1)); b.vx = sx * minVx; b.vy = (b.vy < 0 ? -1 : 1) * Math.sqrt(sp * sp - minVx * minVx); }
    }
    stepBall(b, dt) {
      var n = Math.max(1, Math.ceil(this.speed * dt / STEP)), sdt = dt / n, p = this.paddle;
      var ptop = PADDLE_Y - PADDLE_H / 2;
      for (var i = 0; i < n; i++) {
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); Sfx.play('wall'); }
        else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); Sfx.play('wall'); }
        if (b.y < TOP + BALL_R) { b.y = TOP + BALL_R; b.vy = Math.abs(b.vy); Sfx.play('wall'); }
        if (b.vy > 0 && b.y + BALL_R >= ptop && b.y < PADDLE_Y + 4 && Math.abs(b.x - p.x) <= p.w / 2 + BALL_R * 0.7) {
          this.paddleHit(b);
        }
        if (b.y - BALL_R < this.gridBottom + 2) this.collideBricks(b);
        if (b.y > H + BALL_R * 2) { this.loseBall(b); return; }
      }
      if (!isFinite(b.x) || !isFinite(b.y)) { b.attached = true; b.x = p.x; b.y = ptop - BALL_R; }
    }
    paddleHit(b) {
      var p = this.paddle, off = clamp((b.x - p.x) / (p.w / 2), -1, 1);
      var a = off * 1.05;  // up to ~60 degrees from vertical
      b.vx = Math.sin(a) * this.speed; b.vy = -Math.cos(a) * this.speed;
      b.y = PADDLE_Y - PADDLE_H / 2 - BALL_R; b.noPaddle = 0; this.counters.paddleHits++;
      this.normalize(b);
      if (this.combo >= 10) this.floatText(b.x, b.y - 40, 'COMBO ' + this.combo + '!', '#ff9cf6', 30);
      this.combo = 0;
      Sfx.play('paddle');
      this.burst(b.x, PADDLE_Y - 14, this.ballSkin.glow, 0, 5);
      this.tweens.killTweensOf(this.paddleSpr);
      this.paddleSpr.scaleY = 0.8;
      this.tweens.add({ targets: this.paddleSpr, scaleY: 1, duration: 140, ease: 'Back.out' });
      if (this.bot) this.botOffset = (Math.random() - 0.5) * 1.3;
    }
    testHit(b, br) {
      var hw = BW / 2, hh = BH / 2;
      var cx = clamp(b.x, br.x - hw, br.x + hw), cy = clamp(b.y, br.y - hh, br.y + hh);
      var dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy, h = this._h;
      if (d2 >= BALL_R * BALL_R) return false;
      if (d2 > 1e-6) { var d = Math.sqrt(d2); h.nx = dx / d; h.ny = dy / d; h.pen = BALL_R - d; }
      else {
        var ox = hw + BALL_R - Math.abs(b.x - br.x), oy = hh + BALL_R - Math.abs(b.y - br.y);
        if (ox < oy) { h.nx = b.x < br.x ? -1 : 1; h.ny = 0; h.pen = ox; } else { h.nx = 0; h.ny = b.y < br.y ? -1 : 1; h.pen = oy; }
      }
      return true;
    }
    collideBricks(b) {
      var fire = this.timers.fire > 0, best = null, bp = 0, bnx = 0, bny = 0, h = this._h;
      var c0 = Math.max(0, Math.floor((b.x - BALL_R - GX) / CW)), c1 = Math.min(COLS - 1, Math.floor((b.x + BALL_R - GX) / CW));
      var r0 = Math.max(0, Math.floor((b.y - BALL_R - GY) / CH)), r1 = Math.min(this.rows - 1, Math.floor((b.y + BALL_R - GY) / CH));
      for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
        var br = this.cells[r * COLS + c];
        if (!br || !br.alive || !this.testHit(b, br)) continue;
        if (fire && br.type !== 'steel') { if (br.hp > 1) this.counters.fireKills++; this.damage(br, br.hp, true); b.sinceHit = 0; continue; }
        if (h.pen > bp) { bp = h.pen; best = br; bnx = h.nx; bny = h.ny; }
      }
      for (var i = 0; i < this.movers.length; i++) {
        var m = this.movers[i];
        if (!m.alive || Math.abs(m.y - b.y) > CH || Math.abs(m.x - b.x) > CW || !this.testHit(b, m)) continue;
        if (fire) { if (m.hp > 1) this.counters.fireKills++; this.damage(m, m.hp, true); b.sinceHit = 0; continue; }
        if (h.pen > bp) { bp = h.pen; best = m; bnx = h.nx; bny = h.ny; }
      }
      if (!best) return;
      b.x += bnx * bp; b.y += bny * bp;
      var dot = b.vx * bnx + b.vy * bny;
      if (dot < 0) { b.vx -= 2 * dot * bnx; b.vy -= 2 * dot * bny; }
      this.normalize(b);
      b.sinceHit = 0;
      if (best.type === 'steel') {
        this.counters.steelHits++;
        Sfx.play('steel'); this.burst(b.x - bnx * BALL_R, b.y - bny * BALL_R, 0xc8d0ff, 0, 4);
        this.flash(best);
        return;
      }
      this.counters.brickHits++;
      this.damage(best, 1, true);
      if (this.timers.explosive > 0) { this.counters.blastHits++; this.blast(best.x, best.y, best, false); }
    }
    // endgame guidance: bend an upward-moving ball toward the nearest remaining crystal
    steer(b, dt) {
      var best = null, bd = 1e12, tOnly = this.lv.objective.type === 'targets';
      for (var i = 0; i < this.bricks.length; i++) {
        var br = this.bricks[i];
        if (!br.alive || br.type === 'steel' || (tOnly && br.type !== 'target')) continue;
        var dx = br.x - b.x, dy = br.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = br; }
      }
      if (!best) return;
      var want = Math.atan2(best.y - b.y, best.x - b.x), cur = Math.atan2(b.vy, b.vx), diff = want - cur;
      while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
      var turn = clamp(diff, -2.2 * dt, 2.2 * dt), a = cur + turn;
      b.vx = Math.cos(a) * this.speed; b.vy = Math.sin(a) * this.speed;
      this.counters.steered = (this.counters.steered || 0) + 1;
    }
    loseBall(b) {
      b.active = false; b.spr.setVisible(false); b.aura.setVisible(false);
      if (this.ended) return;
      if (this.activeBallCount() === 0) this.loseLife();
    }
    loseLife() {
      this.lives--; this.livesLost++; this.combo = 0;
      for (var k in this.timers) this.timers[k] = 0;
      this.paddle.targetW = PADDLE_W; this.updateBallLook();
      this.capsules.forEach(function (c) { c.active = false; c.spr.setVisible(false); });
      Sfx.play('lose'); PB.vibrate(120); this.shake(220, 0.01);
      this.cameras.main.flash(200, 255, 40, 90);
      if (this.lives <= 0) { this.gameOver('lives'); return; }
      this.spawnBall(true); this.hint.setVisible(true);
      this.floatText(W / 2, 800, this.lives === 1 ? 'LAST LIFE!' : this.lives + ' LIVES LEFT', '#ff6b8b', 40);
    }
    updateBallLook() {
      var fire = this.timers.fire > 0, ex = this.timers.explosive > 0;
      for (var i = 0; i < this.balls.length; i++) {
        var b = this.balls[i];
        if (fire) b.spr.setTint(0xffb36b); else if (ex) b.spr.setTint(0xfff08a); else b.spr.clearTint();
        b.aura.setVisible(b.active && (fire || ex)).setTint(fire ? 0xff7a1a : 0xffd166);
      }
    }

    // ================================================================ bricks
    mult() { return 1 + Math.min(6, Math.floor(this.combo / 5)) * 0.5; }
    addScore(n) { this.score += Math.round(n); }
    flash(br) {
      br.spr.setTintFill(0xffffff);
      var self = this;
      this.time.delayedCall(55, function () { if (br.alive) self.tintBrick(br); });
    }
    damage(br, amount, fromBall) {
      if (!br.alive || br.type === 'steel' || this.ended) return;
      var removed = Math.min(amount, br.hp);
      br.hp -= removed; br.regenT = 0; this.sinceBrick = 0;
      this.combo++; if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.comboT = 0;
      var m = this.mult();
      this.addScore(removed * L.PTS_HIT * m);
      if (br.hp <= 0) { this.destroyBrick(br, m); return; }
      this.tintBrick(br); this.flash(br);
      this.tweens.add({ targets: br.spr, scaleX: 1.1, scaleY: 0.8, yoyo: true, duration: 60 });
      Sfx.play('hit', Math.min(this.combo, 20));
      this.burst(br.x, br.y, this.hpColor(br), 3, 4);
    }
    destroyBrick(br, m) {
      br.alive = false;
      if (br.type !== 'moving') this.cells[br.r * COLS + br.c] = null;
      var col = br.type === 'explosive' ? 0xff6b3d : br.type === 'target' ? 0xffd166 : this.wd.hp[clamp(br.maxHp, 1, 4) - 1];
      if (br.type === 'regen') col = 0x3dffa0;
      br.spr.setVisible(false); if (br.glow) br.glow.setVisible(false); if (br.mark) br.mark.setVisible(false); if (br.crack) br.crack.setVisible(false);
      var pts = Math.round(L.PTS_BREAK * br.maxHp * m);
      this.addScore(pts);
      this.floatText(br.x, br.y, '+' + pts, m > 1 ? '#ff9cf6' : '#e8fdff', m > 1 ? 30 : 24);
      this.burst(br.x, br.y, col, 9, 6);
      Sfx.play('break', Math.min(this.combo, 20));
      this.session.bricks++; this.breakableLeft--; this.counters.destroyed++;
      if (br.type === 'target') { this.targetsLeft--; this.ring(br.x, br.y, 0xffd166, 1.2); }
      if (br.type === 'prize') this.dropPowerup(br.x, br.y);
      else if (Math.random() < this.lv.dropRate) this.dropPowerup(br.x, br.y);
      if (br.type === 'explosive') {
        var self = this; PB.vibrate(30);
        this.time.delayedCall(70, function () { self.blast(br.x, br.y, br, true); });
      }
      if (this.combo > 0 && this.combo % 10 === 0) { this.floatText(W / 2, TOP + 90, '×' + this.mult().toFixed(1) + ' COMBO!', '#ff9cf6', 38); }
      this.checkWin();
    }
    blast(x, y, src, big) {
      if (this.ended) return;
      this.ring(x, y, big ? 0xff6b3d : 0xffd166, big ? 1.6 : 1.1);
      this.burst(x, y, big ? 0xff8a3d : 0xffe066, big ? 8 : 3, big ? 12 : 6);
      Sfx.play('explode'); this.shake(big ? 160 : 90, big ? 0.008 : 0.004);
      for (var i = 0; i < this.bricks.length; i++) {
        var b = this.bricks[i];
        if (b === src || !b.alive || b.type === 'steel') continue;
        if (Math.abs(b.x - x) < CW * 1.5 && Math.abs(b.y - y) < CH * 1.5) this.damage(b, 1, false);
      }
    }
    checkWin() {
      if (this.ended) return;
      var o = this.lv.objective, won = false;
      if (o.type === 'targets') won = this.targetsLeft <= 0;
      else if (o.type === 'score') won = this.score >= o.target || this.breakableLeft <= 0;
      else won = this.breakableLeft <= 0;
      if (won) this.win();
    }

    // ================================================================ power-ups
    pickPowerup() {
      var r = Math.random(), acc = 0;
      for (var i = 0; i < PB.POWERUP_KEYS.length; i++) { acc += PB.POWERUP_WEIGHTS[i]; if (r < acc) return PB.POWERUP_KEYS[i]; }
      return 'multi';
    }
    dropPowerup(x, y, type) {
      for (var i = 0; i < this.capsules.length; i++) {
        var c = this.capsules[i]; if (c.active) continue;
        c.active = true; c.type = type || this.pickPowerup(); c.x = x; c.y = y;
        c.spr.setTexture('cap_' + c.type).setPosition(x, y).setVisible(true);
        return c;
      }
      return null;
    }
    applyPowerup(type) {
      if (this.ended) return;
      this.session.powerups++;
      var info = PB.POWERUPS[type];
      Sfx.play('power'); PB.vibrate(20);
      this.floatText(this.paddle.x, PADDLE_Y - 70, info.name.toUpperCase() + '!', PB.hex(info.color), 34);
      this.burst(this.paddle.x, PADDLE_Y, info.color, 6, 10);
      if (type === 'multi') {
        var src = [];
        for (var i = 0; i < this.balls.length; i++) if (this.balls[i].active) src.push(this.balls[i]);
        if (src.every(function (b) { return b.attached; })) this.launch();
        for (var j = 0; j < src.length; j++) {
          var s = src[j];
          for (var k = -1; k <= 1; k += 2) {
            var nb = this.spawnBall(false, s); if (!nb) break;
            var a = 0.45 * k, cs = Math.cos(a), sn = Math.sin(a);
            nb.vx = s.vx * cs - s.vy * sn; nb.vy = s.vx * sn + s.vy * cs; this.normalize(nb);
          }
        }
      } else {
        this.timers[type] = info.dur;
        if (type === 'wide') this.paddle.targetW = PADDLE_W * 1.5;
        if (type === 'laser') this.laserCD = 0;
      }
      this.updateBallLook();
    }
    fireLasers() {
      var p = this.paddle, xs = [p.x - p.w / 2 + 14, p.x + p.w / 2 - 14], fired = 0;
      for (var i = 0; i < this.bolts.length && fired < 2; i++) {
        var b = this.bolts[i]; if (b.active) continue;
        b.active = true; b.x = xs[fired]; b.y = PADDLE_Y - 30; b.spr.setPosition(b.x, b.y).setVisible(true); fired++;
      }
      if (fired) Sfx.play('laser');
    }
    stepBolt(b, dt) {
      var dist = 1100 * dt, n = Math.max(1, Math.ceil(dist / 14)), sd = dist / n;
      for (var s = 0; s < n; s++) {
        b.y -= sd;
        if (b.y < TOP) { this.killBolt(b); return; }
        var hit = null;
        if (b.y < this.gridBottom && b.y > GY) {
          var c = Math.floor((b.x - GX) / CW), r = Math.floor((b.y - 15 - GY) / CH);
          if (c >= 0 && c < COLS && r >= 0 && r < this.rows) {
            var br = this.cells[r * COLS + c];
            if (br && br.alive && Math.abs(br.x - b.x) <= BW / 2 + 3 && Math.abs(br.y - (b.y - 15)) <= BH / 2) hit = br;
          }
          for (var i = 0; !hit && i < this.movers.length; i++) {
            var m = this.movers[i];
            if (m.alive && Math.abs(m.x - b.x) <= BW / 2 + 3 && Math.abs(m.y - (b.y - 15)) <= BH / 2) hit = m;
          }
        }
        if (hit) {
          if (hit.type === 'steel') { this.burst(b.x, hit.y + BH / 2, 0xc8d0ff, 0, 3); this.flash(hit); }
          else { this.counters.laserHits++; this.damage(hit, 1, false); }
          this.killBolt(b); return;
        }
      }
      b.spr.setPosition(b.x, b.y);
    }
    killBolt(b) { b.active = false; b.spr.setVisible(false); }

    // ================================================================ flow
    autoPause() { if (!this.ended && this.scene.isActive()) this.pauseGame(); }
    pauseGame() {
      if (this.ended || !this.scene.isActive()) return;
      this.commitStats();
      this.scene.pause();
      this.scene.launch('Pause', { world: this.worldIdx, level: this.levelIdx });
      this.scene.bringToTop('Pause');
    }
    commitStats() {
      var s = this.session, c = this.committed;
      var db = s.bricks - c.bricks, dp = s.powerups - c.powerups, ds = this.score - c.score;
      if (db > 0) { Save.track('bricks', db); Save.data.stats.bricks += db; }
      if (dp > 0) Save.track('powerups', dp);
      if (ds > 0) Save.track('score', ds);
      Save.track('combo', this.maxCombo, true);
      c.bricks = s.bricks; c.powerups = s.powerups; c.score = this.score;
      Save.persist();
    }
    stopBalls() {
      for (var i = 0; i < this.balls.length; i++) { var b = this.balls[i]; b.vx = b.vy = 0; }
      this.trailG.clear();
    }
    win() {
      this.ended = true; this.stopBalls();
      var lv = this.lv, self = this;
      // shatter whatever is left for a satisfying finish (no extra score)
      var left = this.bricks.filter(function (b) { return b.alive && b.type !== 'steel'; });
      left.forEach(function (b, i) {
        self.time.delayedCall(40 * i, function () {
          b.alive = false; b.spr.setVisible(false); if (b.glow) b.glow.setVisible(false); if (b.mark) b.mark.setVisible(false); if (b.crack) b.crack.setVisible(false);
          self.burst(b.x, b.y, self.hpColor(b), 5, 2);
        });
      });
      for (var i = 0; i < 5; i++) this.time.delayedCall(i * 140, function () { self.burst(100 + Math.random() * 520, 300 + Math.random() * 400, [0x22e8ff, 0xff3df0, 0xffd166][Math.floor(Math.random() * 3)], 14, 10); self.ring(360, 600, 0xffffff, 2.5); });
      Sfx.play('win'); PB.vibrate([40, 40, 80]);
      var stars = 1 + (this.livesLost === 0 ? 1 : 0) + (this.score >= lv.star3 ? 1 : 0);
      var prev = Save.levelRec(this.worldIdx, this.levelIdx);
      var res = Save.recordResult(this.worldIdx, this.levelIdx, this.score, stars);
      var coins = 10 + stars * 5 + (res.first ? 20 : 0) + (prev && stars > prev.stars ? 10 : 0);
      Save.addCoins(coins);
      Save.track('clears', 1); if (stars === 3) Save.track('stars3', 1);
      this.commitStats();
      var unlockMsg = '';
      if (res.unlockedNext) unlockMsg = this.levelIdx + 1 < L.LEVELS_PER_WORLD ? 'Level ' + (this.levelIdx + 2) + ' unlocked!' : 'New world unlocked: ' + L.WORLDS[this.worldIdx + 1].name + '!';
      this.result = { world: this.worldIdx, level: this.levelIdx, name: lv.name, score: this.score, stars: stars, coins: coins, best: Save.levelRec(this.worldIdx, this.levelIdx).best, newBest: res.newBest || res.first, star3: lv.star3, unlockMsg: unlockMsg };
      this.time.delayedCall(1100, function () { self.scene.launch('Complete', self.result); self.scene.bringToTop('Complete'); });
    }
    gameOver(reason) {
      if (this.ended) return;
      this.ended = true; this.stopBalls(); this.commitStats();
      Sfx.play('over');
      var self = this;
      this.result = { world: this.worldIdx, level: this.levelIdx, score: this.score, reason: reason, left: this.breakableLeft };
      this.time.delayedCall(700, function () { self.scene.launch('GameOver', self.result); self.scene.bringToTop('GameOver'); });
    }

    // ================================================================ update
    botTarget() {
      // predict where the most urgent descending ball will cross the paddle line
      var best = null, bt = 1e9;
      for (var i = 0; i < this.balls.length; i++) {
        var b = this.balls[i]; if (!b.active || b.attached) continue;
        var t = b.vy > 0 ? (PADDLE_Y - b.y) / b.vy : 50 + (b.y - TOP) / 1000;
        if (t < bt) { bt = t; best = b; }
      }
      if (!best) return this.paddle.x;
      var x = best.x;
      if (best.vy > 0) {
        x = best.x + best.vx * (PADDLE_Y - PADDLE_H / 2 - BALL_R - best.y) / best.vy;
        var span = W - 2 * BALL_R, u = (x - BALL_R) % (2 * span); if (u < 0) u += 2 * span;
        x = BALL_R + (u > span ? 2 * span - u : u);
      }
      return x - this.botOffset * this.paddle.w / 2 * 0.8;
    }
    simulate(dt, rdt) {
      this.t += dt;
      var p = this.paddle;
      // moving bands (always animate, even before launch)
      for (var bi = 0; bi < this.bands.length; bi++) {
        var band = this.bands[bi], mid = (band.right - band.left) / 2, half = (band.right + band.left) / 2;
        var off = mid + half * Math.sin(this.t * band.w + band.phase);
        for (var k = 0; k < band.bricks.length; k++) {
          var mb = band.bricks[k]; mb.x = mb.baseX + off;
          if (mb.alive) { mb.spr.x = mb.x; if (mb.glow) mb.glow.x = mb.x; if (mb.mark) mb.mark.x = mb.x; if (mb.crack) mb.crack.x = mb.x; }
        }
      }
      // paddle
      if (this.bot && !this.ended) p.tx = this.botTarget();
      p.w += (p.targetW - p.w) * Math.min(1, rdt * 10);
      if (this.bot) p.x = p.tx; else p.x += (p.tx - p.x) * Math.min(1, rdt * 24);
      p.x = clamp(p.x, p.w / 2, W - p.w / 2);
      var las = this.timers.laser > 0;

      if (!this.ended) {
        if (this.freeze > 0) { this.freeze -= rdt; }
        else {
          if (this.started) this.elapsed += dt;
          this.speed = this.lv.speed * (1 + Math.min(0.1, this.elapsed / 300));
          var expired = false;
          for (var key in this.timers) if (this.timers[key] > 0) { this.timers[key] -= dt; if (this.timers[key] <= 0) { this.timers[key] = 0; expired = true; if (key === 'wide') p.targetW = PADDLE_W; } }
          if (expired) this.updateBallLook();
          // balls
          for (var i = 0; i < this.balls.length; i++) {
            var b = this.balls[i]; if (!b.active) continue;
            if (b.attached) { b.x = p.x + b.offset; b.y = PADDLE_Y - PADDLE_H / 2 - BALL_R; }
            else {
              this.stepBall(b, dt);
              if (!b.active) continue;
              if (this.magnet && b.vy < 0) this.steer(b, dt);
              b.noPaddle += dt; b.sinceHit += dt; if (b.noPaddle > this.counters.maxNoPaddle) this.counters.maxNoPaddle = b.noPaddle;
              // anti-stuck: no paddle touch and no brick hit for a while -> nudge the angle
              if (b.noPaddle > 10 && b.sinceHit > 4) {
                var a = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.3), cs = Math.cos(a), sn = Math.sin(a);
                var vx = b.vx * cs - b.vy * sn; b.vy = b.vx * sn + b.vy * cs; b.vx = vx;
                if (b.noPaddle > 24) b.vy = Math.abs(b.vy); // send it back toward the paddle
                this.normalize(b); b.noPaddle = 7; b.sinceHit = 0; this.counters.nudges++;
              }
            }
          }
          if (this.bot && this.activeBallCount() > 0 && !this.started && this.t > 0.6) this.launch();
          if (this.bot && this.started) { for (var q = 0; q < this.balls.length; q++) if (this.balls[q].active && this.balls[q].attached) { this.launch(); break; } }
          // capsules
          for (var ci = 0; ci < this.capsules.length; ci++) {
            var c = this.capsules[ci]; if (!c.active) continue;
            c.y += 250 * dt; c.spr.setPosition(c.x, c.y).setScale(1 + Math.sin(this.t * 10 + ci) * 0.06);
            if (Math.abs(c.y - PADDLE_Y) < PADDLE_H / 2 + 15 && Math.abs(c.x - p.x) < p.w / 2 + 30) { c.active = false; c.spr.setVisible(false); this.applyPowerup(c.type); }
            else if (c.y > H + 30) { c.active = false; c.spr.setVisible(false); }
          }
          // lasers
          if (las) { this.laserCD -= dt; if (this.laserCD <= 0) { this.laserCD = 0.3; this.fireLasers(); } }
          for (var li = 0; li < this.bolts.length; li++) if (this.bolts[li].active) this.stepBolt(this.bolts[li], dt);
          // regenerating crystals heal if left alone
          for (var ri = 0; ri < this.regens.length; ri++) {
            var rg = this.regens[ri]; if (!rg.alive || rg.hp >= rg.maxHp) continue;
            rg.regenT += dt;
            if (rg.regenT > 5) { rg.regenT = 0; rg.hp++; this.tintBrick(rg); this.burst(rg.x, rg.y, 0x3dffa0, 0, 5); }
          }
          // endgame assist: the last few crystals untouched for 10s -> drop a helpful power-up
          if (this.started) this.sinceBrick += dt;
          var fewLeft = this.lv.objective.type === 'targets' ? this.targetsLeft <= 2 : this.breakableLeft <= 5;
          var mag = fewLeft && this.sinceBrick > 15;
          if (mag && !this.magnet) this.floatText(W / 2, TOP + 160, 'PRISM GUIDANCE', '#9fe9ff', 30);
          this.magnet = mag;
          if (fewLeft && this.sinceBrick > 10 && !this.capsules.some(function (c) { return c.active; })) {
            var kind = ['laser', 'fire', 'multi'][this.assistN++ % 3];
            this.dropPowerup(clamp(p.x, 60, W - 60), TOP + 80, kind);
            this.floatText(W / 2, TOP + 120, 'PRISM ASSIST', '#9fe9ff', 30);
            this.sinceBrick = 0; this.counters.assists = (this.counters.assists || 0) + 1;
          }
          // combo decays after 3s without a hit
          this.comboT += dt; if (this.comboT > 3 && this.combo) this.combo = 0;
          // time objective
          if (this.lv.objective.type === 'time' && this.elapsed > this.lv.objective.time) this.gameOver('time');
        }
      }
    }

    update(time, delta) {
      var rdt = Math.min(delta, 50) / 1000, p = this.paddle;
      // fixed sub-steps keep collisions/capsule pickups exact even when time is scaled
      var remaining = rdt * this.timeScale, guard = 0;
      while (remaining > 1e-6 && guard++ < 64) { var h = Math.min(remaining, 1 / 60); this.simulate(h, rdt * h / Math.max(1e-6, rdt * this.timeScale)); remaining -= h; }
      this.paddleSpr.x = p.x; this.paddleSpr.scaleX = p.w / PADDLE_W;
      var las = this.timers.laser > 0;
      this.cannonL.setVisible(las).x = p.x - p.w / 2 + 14; this.cannonR.setVisible(las).x = p.x + p.w / 2 - 14;
      this.shownScore += (this.score - this.shownScore) * Math.min(1, rdt * 10);
      if (Math.abs(this.score - this.shownScore) < 1) this.shownScore = this.score;
      for (var i = 0; i < this.balls.length; i++) {
        var b = this.balls[i]; if (!b.active) continue;
        b.spr.setPosition(b.x, b.y); b.spr.rotation += rdt * 6;
        if (b.aura.visible) b.aura.setPosition(b.x, b.y);
        if (!b.attached) { b.trail[b.ti * 2] = b.x; b.trail[b.ti * 2 + 1] = b.y; b.ti = (b.ti + 1) % 10; if (b.tn < 10) b.tn++; }
        else b.tn = 0;
      }
      // trails
      var g = this.trailG; g.clear();
      if (!this.ended) {
        var tc = this.timers.fire > 0 ? 0xff7a1a : this.timers.explosive > 0 ? 0xffd166 : this.ballSkin.glow;
        for (var ti = 0; ti < this.balls.length; ti++) {
          var tb = this.balls[ti]; if (!tb.active || tb.attached) continue;
          for (var j = 1; j < tb.tn; j++) {
            var idx = ((tb.ti - 1 - j) % 10 + 10) % 10;
            g.fillStyle(tc, 0.32 * (1 - j / 10)); g.fillCircle(tb.trail[idx * 2], tb.trail[idx * 2 + 1], BALL_R * (1 - j / 12));
          }
        }
      }
      this.updateHud();
    }
  }

  // ================================================================ bootstrap
  var S = PB.MENU_SCENES; // [Boot, Menu, Worlds, Levels, Settings, Rewards, Pause, Complete, GameOver]
  var config = {
    type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#070a1f',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance' },
    input: { activePointers: 3 }, fps: { target: 60, min: 20 }, banner: false, disableContextMenu: true,
    scene: [S[0], S[1], S[2], S[3], S[5], GameScene, S[6], S[4], S[7], S[8]]
  };
  PB.game = new Phaser.Game(config);

  // ---- page guards: no zoom, no context menu, no pull-to-refresh
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  ['gesturestart', 'gesturechange', 'dblclick'].forEach(function (n) { document.addEventListener(n, function (e) { e.preventDefault(); }, { passive: false }); });
  document.addEventListener('touchmove', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
  var lastTouch = 0;
  document.addEventListener('touchend', function (e) { var now = Date.now(); if (now - lastTouch < 300 && e.cancelable) e.preventDefault(); lastTouch = now; }, { passive: false });

  // ---- test/debug hook (harmless in production; used by automated tests)
  window.__PB = {
    version: PB.VERSION, phaser: Phaser.VERSION,
    scenes: function () { return PB.game.scene.getScenes(true).map(function (s) { return s.scene.key; }); },
    game: function () { return PB.currentGame; },
    state: function () {
      var g = PB.currentGame; if (!g) return null;
      return {
        world: g.worldIdx, level: g.levelIdx, score: g.score, lives: g.lives, left: g.breakableLeft, targetsLeft: g.targetsLeft,
        balls: g.balls.filter(function (b) { return b.active; }).map(function (b) { return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, attached: b.attached }; }),
        paddle: { x: g.paddle.x, w: g.paddle.w }, timers: Object.assign({}, g.timers), ended: g.ended, started: g.started,
        counters: Object.assign({}, g.counters), elapsed: g.elapsed, combo: g.combo, maxCombo: g.maxCombo, objective: g.lv.objective, bolts: g.bolts.filter(function (b) { return b.active; }).length,
        capsules: g.capsules.filter(function (c) { return c.active; }).length, active: g.scene.isActive()
      };
    },
    start: function (w, l) { var sm = PB.game.scene; ['Pause', 'Complete', 'GameOver', 'Settings'].forEach(function (k) { if (sm.isActive(k) || sm.isPaused(k)) sm.stop(k); }); sm.getScenes(true).forEach(function (s) { if (s.scene.key !== 'Game') sm.stop(s.scene.key); }); if (sm.isActive('Game') || sm.isPaused('Game')) sm.stop('Game'); sm.start('Game', { world: w, level: l }); },
    powerup: function (t) { PB.currentGame.applyPowerup(t); },
    drop: function (t, dy) { var g = PB.currentGame; return !!g.dropPowerup(g.paddle.x, PADDLE_Y - (dy || 200), t); },
    launch: function () { return PB.currentGame.launch(); },
    clear: function () { var g = PB.currentGame; g.bricks.forEach(function (b) { if (b.alive && b.type !== 'steel' && !g.ended) g.destroyBrick(b, 1); }); },
    bot: function (on, scale) { var g = PB.currentGame; g.bot = !!on; g.timeScale = scale || 1; },
    unlockAll: function () { for (var i = 0; i < L.worldCount(); i++) Save.data.unlocked[i] = L.LEVELS_PER_WORLD; Save.persist(); },
    save: function () { return JSON.parse(JSON.stringify(Save.data)); },
    consts: { W: W, H: H, PADDLE_Y: PADDLE_Y, TOP: TOP, GX: GX, GY: GY, CW: CW, CH: CH }
  };
})();
