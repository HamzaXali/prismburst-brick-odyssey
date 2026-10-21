/*
 * PRISMBURST — core.js
 * Shared constants, save system, WebAudio synth, haptics, procedural textures
 * and UI helpers. Loaded before menus.js and game.js.
 */
(function () {
  'use strict';
  var PB = window.PB = window.PB || {};
  var L = window.PB_LEVELS;

  PB.W = 720; PB.H = 1280;
  PB.FONT = '"Trebuchet MS", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  PB.COLORS = { navy: 0x070a1f, cyan: 0x22e8ff, magenta: 0xff3df0, violet: 0x9b6bff, gold: 0xffd166, white: 0xffffff, panel: 0x141a44 };
  PB.hex = function (n) { return '#' + ('000000' + n.toString(16)).slice(-6); };

  // ------------------------------------------------------------ cosmetics
  PB.BALL_SKINS = [
    { id: 'classic', name: 'Prism Core', price: 0, color: 0xbff8ff, glow: 0x22e8ff },
    { id: 'rose', name: 'Rose Quartz', price: 150, color: 0xffd0f4, glow: 0xff3df0 },
    { id: 'venom', name: 'Venom Opal', price: 250, color: 0xd8ffd0, glow: 0x3dff7a },
    { id: 'ember', name: 'Ember Pearl', price: 400, color: 0xffe0c0, glow: 0xff7a1a },
    { id: 'solar', name: 'Solar Gem', price: 600, color: 0xfff6c0, glow: 0xffd166 },
    { id: 'void', name: 'Void Eye', price: 900, color: 0x2a0a40, glow: 0xb06bff },
    { id: 'rainbow', name: 'Spectrum', price: 1400, color: 0xffffff, glow: 0xffffff, rainbow: true }
  ];
  PB.PADDLE_SKINS = [
    { id: 'classic', name: 'Cyan Blade', price: 0, color: 0x22e8ff, edge: 0xffffff },
    { id: 'magenta', name: 'Magenta Arc', price: 200, color: 0xff3df0, edge: 0xffd0f4 },
    { id: 'emerald', name: 'Emerald Rail', price: 350, color: 0x3dffa0, edge: 0xd0ffe8 },
    { id: 'gold', name: 'Gilded Bar', price: 600, color: 0xffc43d, edge: 0xfff2c0 },
    { id: 'obsidian', name: 'Obsidian Edge', price: 900, color: 0x3a2a66, edge: 0xff2e63 },
    { id: 'prism', name: 'Prism Wing', price: 1500, color: 0xffffff, edge: 0xffffff, rainbow: true }
  ];
  PB.POWERUPS = {
    multi: { name: 'Multi-ball', color: 0x22e8ff, dur: 0 },
    fire: { name: 'Fireball', color: 0xff7a1a, dur: 10 },
    laser: { name: 'Laser', color: 0xff2e63, dur: 10 },
    explosive: { name: 'Blast ball', color: 0xffd166, dur: 10 },
    wide: { name: 'Wide paddle', color: 0x3dffa0, dur: 15 }
  };
  PB.POWERUP_KEYS = ['multi', 'fire', 'laser', 'explosive', 'wide'];
  PB.POWERUP_WEIGHTS = [0.24, 0.14, 0.18, 0.2, 0.24];

  // ------------------------------------------------------------ dates
  PB.today = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  };
  PB.yesterday = function () { var d = new Date(); d.setDate(d.getDate() - 1); return PB.today(d); };

  // ------------------------------------------------------------ save
  var SAVE_KEY = 'prismburst.save.v1';
  var MISSION_POOL = [
    { type: 'bricks', target: 200, reward: 60, text: 'Break 200 crystals' },
    { type: 'powerups', target: 5, reward: 50, text: 'Collect 5 power-ups' },
    { type: 'clears', target: 3, reward: 70, text: 'Clear 3 levels' },
    { type: 'combo', target: 15, reward: 60, text: 'Reach a 15-hit combo' },
    { type: 'stars3', target: 2, reward: 80, text: 'Earn 3 stars on 2 levels' },
    { type: 'score', target: 20000, reward: 60, text: 'Score 20,000 points total' }
  ];
  PB.DAILY_REWARDS = [50, 75, 100, 125, 150, 200, 300];

  function defaults() {
    var unlocked = []; for (var i = 0; i < L.worldCount(); i++) unlocked.push(i === 0 ? 1 : 0);
    return {
      v: 1, coins: 0, unlocked: unlocked, levels: {},
      owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' },
      settings: { sound: true, vibration: true, shake: true },
      daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
      stats: { bricks: 0, played: 0, cleared: 0 }, last: null, home: null, shop: null, dense: null, achievements: null
    };
  }
  function merge(base, src) {
    if (!src || typeof src !== 'object') return base;
    Object.keys(base).forEach(function (k) {
      if (!(k in src)) return;
      var b = base[k], s = src[k];
      if (Array.isArray(b)) { if (Array.isArray(s)) base[k] = s; }
      else if (b && typeof b === 'object') base[k] = (s && typeof s === 'object') ? (Object.keys(b).length ? merge(b, s) : s) : b;
      else if (s === null || typeof s === typeof b || b === null) base[k] = s;
    });
    return base;
  }
  var Save = PB.Save = {
    data: null,
    load: function () {
      var raw = null;
      try { raw = window.localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
      var parsed = null;
      var checker = window.PB && window.PB.SavePlain;
      if (raw && (!checker || checker.byteLength(raw) < checker.MAX_BYTES)) {
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      }
      if (parsed && checker) {
        var checked = checker.copyValue(parsed, 0);
        if (!checked.ok) parsed = null;
        else parsed = checked.value;
      }
      this.data = merge(defaults(), parsed);
      if (parsed && checker) checker.absorb(this.data, parsed, 0, checker.ENVELOPE);
      // keep unlocked array in sync with world count (worlds may be added later)
      while (this.data.unlocked.length < L.worldCount()) this.data.unlocked.push(0);
      if (!this.data.unlocked[0]) this.data.unlocked[0] = 1;
      this.refreshMissions();
      return this.data;
    },
    persist: function () {
      try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); return true; } catch (e) { return false; }
    },
    reset: function () {
      try { window.localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      this.data = defaults(); this.refreshMissions(); this.persist();
    },
    levelRec: function (w, l) { return this.data.levels[w + '-' + l] || null; },
    isUnlocked: function (w, l) { return (this.data.unlocked[w] || 0) > l; },
    worldUnlocked: function (w) { return (this.data.unlocked[w] || 0) > 0; },
    worldStars: function (w) {
      var s = 0; for (var l = 0; l < L.LEVELS_PER_WORLD; l++) { var r = this.levelRec(w, l); if (r) s += r.stars; } return s;
    },
    totalStars: function () { var s = 0; for (var w = 0; w < L.worldCount(); w++) s += this.worldStars(w); return s; },
    continueTarget: function () {
      // highest unlocked level of the furthest unlocked world
      for (var w = L.worldCount() - 1; w >= 0; w--) {
        var u = this.data.unlocked[w] || 0;
        if (u > 0) return { world: w, level: Math.min(u, L.LEVELS_PER_WORLD) - 1 };
      }
      return { world: 0, level: 0 };
    },
    hasProgress: function () { return Object.keys(this.data.levels).length > 0; },
    recordResult: function (w, l, score, stars) {
      var key = w + '-' + l, rec = this.data.levels[key], first = !rec;
      if (!rec) rec = this.data.levels[key] = { best: 0, stars: 0 };
      var newBest = score > rec.best;
      rec.best = Math.max(rec.best, score); rec.stars = Math.max(rec.stars, stars);
      var unlockedNext = false;
      if (l + 1 < L.LEVELS_PER_WORLD) {
        if ((this.data.unlocked[w] || 0) < l + 2) { this.data.unlocked[w] = l + 2; unlockedNext = true; }
      } else if (w + 1 < L.worldCount() && !(this.data.unlocked[w + 1] > 0)) {
        this.data.unlocked[w + 1] = 1; unlockedNext = true;
      }
      this.data.stats.cleared++;
      return { first: first, newBest: newBest, unlockedNext: unlockedNext };
    },
    addCoins: function (n) { this.data.coins = Math.max(0, (this.data.coins | 0) + n); },
    doubledClear: function (w, l) {
      var rec = this.levelRec(w, l);
      return !!(rec && rec.doubled);
    },
    // Adds the same coin amount again. Stars, best score, and unlocks stay put.
    grantDoubleCoins: function (w, l, coins) {
      var rec = this.levelRec(w, l);
      var n = coins | 0;
      if (!rec || rec.doubled || n <= 0) return 0;
      rec.doubled = true;
      this.addCoins(n);
      this.persist();
      return n;
    },
    // ---- daily reward
    dailyAvailable: function () { return this.data.daily.last !== PB.today(); },
    dailyNextStreak: function () {
      var d = this.data.daily; return d.last === PB.yesterday() ? d.streak + 1 : 1;
    },
    dailyAmount: function (streak) { return PB.DAILY_REWARDS[(Math.max(1, streak) - 1) % PB.DAILY_REWARDS.length]; },
    claimDaily: function () {
      if (!this.dailyAvailable()) return 0;
      var streak = this.dailyNextStreak(), amt = this.dailyAmount(streak);
      this.data.daily = { last: PB.today(), streak: streak };
      this.addCoins(amt); this.persist(); return amt;
    },
    // ---- missions (reset by local date)
    refreshMissions: function () {
      var m = this.data.missions, t = PB.today();
      if (m.date === t && m.list && m.list.length === 3) return;
      var seed = 0; for (var i = 0; i < t.length; i++) seed = (seed * 31 + t.charCodeAt(i)) >>> 0;
      var pool = MISSION_POOL.slice(), list = [];
      while (list.length < 3) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        var pick = pool.splice(seed % pool.length, 1)[0];
        list.push({ type: pick.type, target: pick.target, reward: pick.reward, text: pick.text, progress: 0, claimed: false });
      }
      this.data.missions = { date: t, list: list };
    },
    track: function (type, amount, isMax) {
      this.refreshMissions();
      var list = this.data.missions.list;
      for (var i = 0; i < list.length; i++) {
        var m = list[i]; if (m.type !== type || m.claimed) continue;
        m.progress = isMax ? Math.max(m.progress, amount) : m.progress + amount;
        if (m.progress > m.target) m.progress = m.target;
      }
    },
    claimMission: function (i) {
      var m = this.data.missions.list[i];
      if (!m || m.claimed || m.progress < m.target) return 0;
      m.claimed = true; this.addCoins(m.reward); this.persist(); return m.reward;
    },
    missionsClaimable: function () {
      this.refreshMissions(); return this.data.missions.list.filter(function (m) { return !m.claimed && m.progress >= m.target; }).length;
    },
    // ---- skins
    owns: function (kind, id) { return this.data.owned[kind].indexOf(id) >= 0; },
    buy: function (kind, skin) {
      if (this.owns(kind, skin.id)) return true;
      if (this.data.coins < skin.price) return false;
      this.data.coins -= skin.price; this.data.owned[kind].push(skin.id); this.persist(); return true;
    },
    equip: function (kind, id) { if (this.owns(kind, id)) { this.data.equipped[kind] = id; this.persist(); } }
  };
  Save.load();

  // ------------------------------------------------------------ haptics
  PB.vibrate = function (pattern) {
    if (!Save.data.settings.vibration) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
  };

  // ------------------------------------------------------------ audio (WebAudio synthesis)
  var Sfx = PB.Sfx = {
    ctx: null, master: null, noise: null, last: {},
    unlock: function () {
      if (!Save.data.settings.sound) return;
      try {
        if (!this.ctx) {
          var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
          this.ctx = new AC();
          this.master = this.ctx.createGain(); this.master.gain.value = 0.45; this.master.connect(this.ctx.destination);
          var len = this.ctx.sampleRate * 0.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), ch = buf.getChannelData(0);
          for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
          this.noise = buf;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { this.ctx = null; }
    },
    suspend: function () { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) { /* */ } },
    tone: function (freq, dur, type, vol, slide, delay) {
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    },
    burst: function (dur, vol, freq, q, delay) {
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = freq || 2000; f.Q.value = q || 1;
      g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
    },
    play: function (name, p) {
      if (!Save.data.settings.sound || !this.ctx || this.ctx.state !== 'running') return;
      var now = this.ctx.currentTime;
      if (this.last[name] && now - this.last[name] < 0.035) return; // throttle bursts
      this.last[name] = now; p = p || 0;
      try {
        switch (name) {
          case 'paddle': this.tone(220, 0.12, 'triangle', 0.35, 330); break;
          case 'wall': this.tone(520, 0.05, 'sine', 0.12); break;
          case 'hit': this.tone(660 + p * 40, 0.08, 'square', 0.1, 900 + p * 40); break;
          case 'break':
            this.tone(1200 + p * 60, 0.18, 'sine', 0.18, 2400 + p * 60);
            this.tone(1800 + p * 80, 0.12, 'triangle', 0.08, 3200, 0.02);
            this.burst(0.12, 0.12, 5000, 2); break;
          case 'steel': this.tone(180, 0.09, 'square', 0.1, 120); this.burst(0.05, 0.08, 3000, 6); break;
          case 'explode': this.burst(0.45, 0.5, 400, 0.6); this.tone(120, 0.35, 'sawtooth', 0.2, 40); break;
          case 'power': [523, 659, 784, 1046].forEach(function (f, i) { Sfx.tone(f, 0.12, 'triangle', 0.18, 0, i * 0.05); }); break;
          case 'laser': this.tone(1400, 0.1, 'sawtooth', 0.06, 300); break;
          case 'launch': this.tone(300, 0.15, 'triangle', 0.25, 700); break;
          case 'lose': this.tone(440, 0.5, 'sawtooth', 0.18, 90); break;
          case 'win': [523, 659, 784, 1046, 1318].forEach(function (f, i) { Sfx.tone(f, 0.25, 'triangle', 0.2, 0, i * 0.09); }); break;
          case 'over': [392, 330, 262, 196].forEach(function (f, i) { Sfx.tone(f, 0.3, 'triangle', 0.18, 0, i * 0.14); }); break;
          case 'click': this.tone(880, 0.05, 'sine', 0.15, 1200); break;
          case 'coin': this.tone(1318, 0.08, 'square', 0.08); this.tone(1760, 0.14, 'square', 0.08, 0, 0.07); break;
          case 'star': this.tone(880 + p * 220, 0.3, 'triangle', 0.2, 1760 + p * 220); break;
        }
      } catch (e) { /* audio errors must never break the game */ }
    }
  };
  var unlockAudio = function () { Sfx.unlock(); };
  window.addEventListener('pointerdown', unlockAudio, true);
  window.addEventListener('touchend', unlockAudio, true);

  // ------------------------------------------------------------ procedural textures
  function radial(g, cx, cy, r, color, alpha, steps) {
    steps = steps || 12;
    for (var i = steps; i >= 1; i--) { g.fillStyle(color, alpha * (1 - i / (steps + 1)) * 0.5); g.fillCircle(cx, cy, r * i / steps); }
  }
  function hsvToInt(h, s, v) { var c = Phaser.Display.Color.HSVToRGB(h, s, v); return (c.r << 16) | (c.g << 8) | c.b; }
  PB.hsv = hsvToInt;

  PB.makeTextures = function (scene) {
    var g = scene.make.graphics({ x: 0, y: 0, add: false });
    function tex(key, w, h, draw) { if (scene.textures.exists(key)) return; g.clear(); draw(g, w, h); g.generateTexture(key, w, h); }
    var BW = 52, BH = 28;
    // tintable crystal brick (white/grey so tint shows the colour)
    tex('brick', BW, BH, function (g) {
      g.fillStyle(0x8a8a8a, 1); g.fillRoundedRect(0, 0, BW, BH, 6);
      g.fillStyle(0xd4d4d4, 1); g.fillRoundedRect(2, 2, BW - 4, BH - 4, 5);
      g.fillStyle(0xffffff, 1); g.fillTriangle(4, 4, BW - 4, 4, BW / 2, BH / 2);       // top facet
      g.fillStyle(0x9e9e9e, 1); g.fillTriangle(4, BH - 4, BW - 4, BH - 4, BW / 2, BH / 2); // bottom facet
      g.fillStyle(0xbdbdbd, 1); g.fillTriangle(4, 4, 4, BH - 4, BW / 2, BH / 2);
      g.fillStyle(0xe8e8e8, 1); g.fillTriangle(BW - 4, 4, BW - 4, BH - 4, BW / 2, BH / 2);
      g.fillStyle(0xffffff, 0.9); g.fillRect(8, 5, 14, 2);
      g.lineStyle(2, 0xffffff, 0.95); g.strokeRoundedRect(1, 1, BW - 2, BH - 2, 6);
    });
    tex('brick_glow', BW + 24, BH + 24, function (g) {
      for (var i = 6; i >= 1; i--) { g.fillStyle(0xffffff, 0.035 * (7 - i)); g.fillRoundedRect(12 - i * 2, 12 - i * 2, BW + i * 4, BH + i * 4, 8 + i); }
    });
    tex('steel', BW, BH, function (g) {
      g.fillStyle(0x3a4060, 1); g.fillRoundedRect(0, 0, BW, BH, 4);
      g.fillStyle(0x5d6690, 1); g.fillRoundedRect(2, 2, BW - 4, BH - 4, 3);
      g.fillStyle(0x8c96c4, 1); g.fillRect(4, 4, BW - 8, 5);
      g.fillStyle(0x2a2f48, 1); g.fillRect(4, BH - 8, BW - 8, 4);
      g.fillStyle(0xc8d0ff, 1); [[7, 14], [BW - 7, 14]].forEach(function (p) { g.fillCircle(p[0], p[1], 2.5); });
      g.lineStyle(2, 0x9aa6e0, 1); g.strokeRoundedRect(1, 1, BW - 2, BH - 2, 4);
      g.lineStyle(2, 0x2a2f48, 0.8); g.lineBetween(14, BH - 6, BW - 14, 6);
    });
    tex('explosive', BW, BH, function (g) {
      g.fillStyle(0x5a0a1a, 1); g.fillRoundedRect(0, 0, BW, BH, 6);
      g.fillStyle(0xff2e63, 1); g.fillRoundedRect(2, 2, BW - 4, BH - 4, 5);
      g.fillStyle(0xff8a3d, 1); g.fillRoundedRect(4, 4, BW - 8, 8, 3);
      var cx = BW / 2, cy = BH / 2, pts = [];
      for (var i = 0; i < 16; i++) { var a = i / 16 * Math.PI * 2, r = i % 2 ? 4 : 10; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.85 }); }
      g.fillStyle(0xffe066, 1); g.fillPoints(pts, true);
      g.fillStyle(0xffffff, 1); g.fillCircle(cx, cy, 2.5);
      g.lineStyle(2, 0xffd0d8, 1); g.strokeRoundedRect(1, 1, BW - 2, BH - 2, 6);
    });
    tex('target', BW, BH, function (g) {
      g.fillStyle(0x6a4a00, 1); g.fillRoundedRect(0, 0, BW, BH, 6);
      g.fillStyle(0xffc43d, 1); g.fillRoundedRect(2, 2, BW - 4, BH - 4, 5);
      g.fillStyle(0xfff2b0, 1); g.fillTriangle(4, 4, BW - 4, 4, BW / 2, BH / 2);
      g.fillStyle(0xffffff, 1); g.fillPoints([{ x: BW / 2, y: 5 }, { x: BW / 2 + 9, y: BH / 2 }, { x: BW / 2, y: BH - 5 }, { x: BW / 2 - 9, y: BH / 2 }], true);
      g.fillStyle(0xff3df0, 1); g.fillPoints([{ x: BW / 2, y: 9 }, { x: BW / 2 + 5, y: BH / 2 }, { x: BW / 2, y: BH - 9 }, { x: BW / 2 - 5, y: BH / 2 }], true);
      g.lineStyle(2, 0xffffff, 1); g.strokeRoundedRect(1, 1, BW - 2, BH - 2, 6);
    });
    tex('regen', BW, BH, function (g) {
      g.fillStyle(0x0a4a3a, 1); g.fillRoundedRect(0, 0, BW, BH, 6);
      g.fillStyle(0xd4d4d4, 1); g.fillRoundedRect(2, 2, BW - 4, BH - 4, 5);
      g.fillStyle(0xffffff, 1);
      var cx = BW / 2, cy = BH / 2, hex = [];
      for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2 + Math.PI / 6; hex.push({ x: cx + Math.cos(a) * 10, y: cy + Math.sin(a) * 10 }); }
      g.fillPoints(hex, true);
      g.fillStyle(0x777777, 1); g.fillRect(cx - 1.5, cy - 6, 3, 12); g.fillRect(cx - 6, cy - 1.5, 12, 3);
      g.lineStyle(2, 0xffffff, 1); g.strokeRoundedRect(1, 1, BW - 2, BH - 2, 6);
    });
    tex('prize_mark', 20, 20, function (g) {
      var pts = []; for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4 : 9; pts.push({ x: 10 + Math.cos(a) * r, y: 10 + Math.sin(a) * r }); }
      g.fillStyle(0xffffff, 1); g.fillPoints(pts, true);
    });
    tex('move_mark', 30, 12, function (g) {
      g.fillStyle(0xffffff, 0.95); g.fillTriangle(0, 6, 8, 0, 8, 12); g.fillTriangle(30, 6, 22, 0, 22, 12); g.fillRect(8, 4, 14, 4);
    });
    for (var k = 1; k <= 3; k++) (function (k) {
      tex('crack' + k, BW, BH, function (g) {
        g.lineStyle(2, 0x0a0820, 0.75);
        var lines = [[[26, 0], [22, 10], [30, 16], [24, 28]], [[0, 10], [12, 13], [18, 20]], [[52, 18], [40, 14], [34, 4]]];
        for (var i = 0; i < k; i++) { var p = lines[i]; for (var j = 0; j < p.length - 1; j++) g.lineBetween(p[j][0], p[j][1], p[j + 1][0], p[j + 1][1]); }
      });
    })(k);
    // particles
    tex('shard', 12, 16, function (g) { g.fillStyle(0xffffff, 1); g.fillTriangle(6, 0, 12, 10, 2, 16); g.fillStyle(0xdddddd, 1); g.fillTriangle(6, 0, 2, 16, 0, 6); });
    tex('spark', 16, 16, function (g) { radial(g, 8, 8, 8, 0xffffff, 1, 6); g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 2.5); });
    tex('glow', 128, 128, function (g) { radial(g, 64, 64, 64, 0xffffff, 1, 16); });
    tex('ring', 128, 128, function (g) { g.lineStyle(6, 0xffffff, 1); g.strokeCircle(64, 64, 58); g.lineStyle(14, 0xffffff, 0.25); g.strokeCircle(64, 64, 52); });
    tex('laser', 8, 30, function (g) { g.fillStyle(0xff2e63, 0.5); g.fillRoundedRect(0, 0, 8, 30, 4); g.fillStyle(0xffffff, 1); g.fillRoundedRect(2, 2, 4, 26, 2); });
    tex('cannon', 14, 22, function (g) { g.fillStyle(0xff2e63, 1); g.fillRoundedRect(0, 4, 14, 18, 3); g.fillStyle(0xffffff, 1); g.fillRect(5, 0, 4, 10); });
    tex('star', 64, 64, function (g) {
      var pts = []; for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 13 : 30; pts.push({ x: 32 + Math.cos(a) * r, y: 33 + Math.sin(a) * r }); }
      g.fillStyle(0xffffff, 1); g.fillPoints(pts, true);
    });
    tex('coin', 40, 40, function (g) {
      g.fillStyle(0xb07a00, 1); g.fillCircle(20, 20, 19); g.fillStyle(0xffd166, 1); g.fillCircle(20, 20, 16);
      g.fillStyle(0xfff2b0, 1); g.fillPoints([{ x: 20, y: 8 }, { x: 28, y: 20 }, { x: 20, y: 32 }, { x: 12, y: 20 }], true);
      g.fillStyle(0xffc43d, 1); g.fillPoints([{ x: 20, y: 13 }, { x: 24, y: 20 }, { x: 20, y: 27 }, { x: 16, y: 20 }], true);
    });
    tex('lock', 40, 48, function (g) {
      g.lineStyle(6, 0x8a90c0, 1); g.beginPath(); g.arc(20, 20, 11, Math.PI, 0); g.strokePath();
      g.lineBetween(9, 20, 9, 24); g.lineBetween(31, 20, 31, 24);
      g.fillStyle(0x8a90c0, 1); g.fillRoundedRect(4, 22, 32, 24, 5); g.fillStyle(0x2a2f58, 1); g.fillCircle(20, 32, 4); g.fillRect(18, 33, 4, 8);
    });
    tex('pause_icon', 40, 40, function (g) { g.fillStyle(0xffffff, 1); g.fillRoundedRect(8, 6, 9, 28, 3); g.fillRoundedRect(23, 6, 9, 28, 3); });
    tex('life', 26, 26, function (g) { radial(g, 13, 13, 13, 0x22e8ff, 1, 6); g.fillStyle(0xbff8ff, 1); g.fillCircle(13, 13, 7); g.fillStyle(0xffffff, 1); g.fillCircle(10, 10, 2.5); });
    tex('hex', 92, 104, function (g) {
      var hex = []; for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2 - Math.PI / 2; hex.push({ x: 46 + Math.cos(a) * 44, y: 52 + Math.sin(a) * 50 }); }
      g.fillStyle(0xffffff, 1); g.fillPoints(hex, true);
    });
    // power-up capsules
    PB.POWERUP_KEYS.forEach(function (key) {
      var col = PB.POWERUPS[key].color;
      tex('cap_' + key, 64, 30, function (g) {
        g.fillStyle(col, 0.35); g.fillRoundedRect(0, 0, 64, 30, 15);
        g.fillStyle(col, 1); g.fillRoundedRect(3, 3, 58, 24, 12);
        g.fillStyle(0xffffff, 0.35); g.fillRoundedRect(8, 5, 48, 6, 3);
        g.fillStyle(0x10102a, 1);
        var cx = 32, cy = 15;
        if (key === 'multi') { g.fillCircle(cx - 10, cy + 2, 4); g.fillCircle(cx, cy - 2, 4); g.fillCircle(cx + 10, cy + 2, 4); }
        if (key === 'fire') { g.fillTriangle(cx, cy - 9, cx + 7, cy + 7, cx - 7, cy + 7); g.fillStyle(col, 1); g.fillTriangle(cx, cy - 1, cx + 3, cy + 6, cx - 3, cy + 6); }
        if (key === 'laser') { g.fillRect(cx - 9, cy - 8, 4, 16); g.fillRect(cx + 5, cy - 8, 4, 16); g.fillTriangle(cx - 11, cy - 6, cx - 7, cy - 11, cx - 3, cy - 6); g.fillTriangle(cx + 3, cy - 6, cx + 7, cy - 11, cx + 11, cy - 6); }
        if (key === 'explosive') { var pts = []; for (var i = 0; i < 14; i++) { var a = i / 14 * Math.PI * 2, r = i % 2 ? 4 : 10; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } g.fillPoints(pts, true); }
        if (key === 'wide') { g.fillTriangle(cx - 16, cy, cx - 8, cy - 7, cx - 8, cy + 7); g.fillTriangle(cx + 16, cy, cx + 8, cy - 7, cx + 8, cy + 7); g.fillRect(cx - 8, cy - 3, 16, 6); }
        g.lineStyle(2, 0xffffff, 0.9); g.strokeRoundedRect(3, 3, 58, 24, 12);
      });
    });
    PB.BALL_SKINS.forEach(function (s) { PB.makeBallTexture(scene, s); });
    PB.PADDLE_SKINS.forEach(function (s) { PB.makePaddleTexture(scene, s); });
    if (PB.SHOP_LOOKS) PB.SHOP_LOOKS.forEach(function (s) { if (s.kind === 'paddle') PB.makePaddleTexture(scene, s); });
    g.destroy();
    // background gradients (canvas)
    L.WORLDS.forEach(function (w, i) { PB.makeBg(scene, 'bg' + i, w.bg[0], w.bg[1], w.accent, i * 97 + 13); });
    PB.makeBg(scene, 'bg_menu', 0x080a26, 0x2c0a4c, 0x22e8ff, 7);
  };

  PB.makeBallTexture = function (scene, s) {
    var key = 'ball_' + s.id; if (scene.textures.exists(key)) return;
    var g = scene.make.graphics({ x: 0, y: 0, add: false });
    radial(g, 24, 24, 24, s.glow, 1, 10);
    if (s.rainbow) {
      for (var i = 0; i < 12; i++) { g.fillStyle(hsvToInt(i / 12, 0.75, 1), 1); g.slice(24, 24, 11, i / 12 * Math.PI * 2, (i + 1) / 12 * Math.PI * 2, false); g.fillPath(); }
    } else { g.fillStyle(s.glow, 1); g.fillCircle(24, 24, 11); g.fillStyle(s.color, 1); g.fillCircle(24, 24, 8.5); }
    g.fillStyle(0xffffff, 0.95); g.fillCircle(20, 20, 3.5);
    g.lineStyle(1.5, 0xffffff, 0.8); g.strokeCircle(24, 24, 11);
    g.generateTexture(key, 48, 48); g.destroy();
  };
  PB.makePaddleTexture = function (scene, s) {
    var key = 'paddle_' + s.id; if (scene.textures.exists(key)) return;
    var g = scene.make.graphics({ x: 0, y: 0, add: false }), W = 168, H = 44, x0 = 9, y0 = 9, w = 150, h = 26;
    for (var i = 5; i >= 1; i--) { g.fillStyle(s.rainbow ? 0xff9cf6 : s.color, 0.06 * (6 - i)); g.fillRoundedRect(x0 - i * 1.6, y0 - i * 1.6, w + i * 3.2, h + i * 3.2, 13 + i); }
    if (s.rainbow) {
      for (var k = 0; k < 15; k++) { g.fillStyle(hsvToInt(k / 15, 0.7, 1), 1); g.fillRect(x0 + 8 + k * ((w - 16) / 15), y0, (w - 16) / 15 + 1, h); }
      g.fillStyle(hsvToInt(0, 0.7, 1), 1); g.fillCircle(x0 + 13, y0 + 13, 13); g.fillStyle(hsvToInt(14 / 15, 0.7, 1), 1); g.fillCircle(x0 + w - 13, y0 + 13, 13);
    } else { g.fillStyle(s.color, 1); g.fillRoundedRect(x0, y0, w, h, 13); }
    g.fillStyle(0xffffff, 0.45); g.fillRoundedRect(x0 + 10, y0 + 4, w - 20, 6, 3);
    g.fillStyle(0x000000, 0.25); g.fillRoundedRect(x0 + 10, y0 + h - 8, w - 20, 4, 2);
    g.fillStyle(s.edge, 1); g.fillRoundedRect(x0 + 2, y0 + 5, 8, h - 10, 4); g.fillRoundedRect(x0 + w - 10, y0 + 5, 8, h - 10, 4);
    g.lineStyle(2, s.edge, 0.95); g.strokeRoundedRect(x0, y0, w, h, 13);
    g.generateTexture(key, W, H); g.destroy();
  };
  PB.makeBg = function (scene, key, c1, c2, accent, seed) {
    if (scene.textures.exists(key)) return;
    var t = scene.textures.createCanvas(key, PB.W, PB.H), ctx = t.getContext();
    var gr = ctx.createLinearGradient(0, 0, 0, PB.H);
    gr.addColorStop(0, PB.hex(c1)); gr.addColorStop(0.6, PB.hex(c2)); gr.addColorStop(1, PB.hex(c1));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, PB.W, PB.H);
    var rnd = seed;
    function r() { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; }
    // soft nebula blobs
    for (var i = 0; i < 6; i++) {
      var x = r() * PB.W, y = r() * PB.H, rad = 150 + r() * 260;
      var rg = ctx.createRadialGradient(x, y, 0, x, y, rad), col = i % 2 ? accent : 0xff3df0;
      rg.addColorStop(0, 'rgba(' + (col >> 16 & 255) + ',' + (col >> 8 & 255) + ',' + (col & 255) + ',0.13)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // faint crystal lattice
    ctx.strokeStyle = 'rgba(160,200,255,0.05)'; ctx.lineWidth = 1;
    for (var k = -PB.H; k < PB.W + PB.H; k += 80) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + PB.H * 0.58, PB.H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k - PB.H * 0.58, PB.H); ctx.stroke(); }
    // stars
    for (var s = 0; s < 140; s++) {
      var a = 0.2 + r() * 0.7; ctx.fillStyle = 'rgba(220,235,255,' + a.toFixed(2) + ')';
      var sz = r() < 0.9 ? 1.5 : 3; ctx.fillRect(r() * PB.W, r() * PB.H, sz, sz);
    }
    t.refresh();
  };

  // ------------------------------------------------------------ UI helpers
  // Three full hearts. Filled ones are lives still in hand. Lost ones are a dim outline.
  // More than three lives keeps three filled hearts and shows ×N.
  function paintLifeHeart(g, filled) {
    g.clear();
    var lobe = 13;
    var left = -10;
    var right = 10;
    var lobeY = -8;
    var tri = [-22, -3, 22, -3, 0, 20];
    var minX = Math.min(left - lobe, right - lobe, tri[0], tri[2], tri[4]);
    var maxX = Math.max(left + lobe, right + lobe, tri[0], tri[2], tri[4]);
    var minY = Math.min(lobeY - lobe, tri[1], tri[3], tri[5]);
    var maxY = Math.max(lobeY + lobe, tri[1], tri[3], tri[5]);
    g.heartW = maxX - minX;
    g.heartH = maxY - minY;
    if (filled) {
      g.fillStyle(0xff2e63, 1);
      g.fillCircle(left, lobeY, lobe);
      g.fillCircle(right, lobeY, lobe);
      g.fillTriangle(tri[0], tri[1], tri[2], tri[3], tri[4], tri[5]);
      return;
    }
    g.fillStyle(0xff8aab, 0.16);
    g.fillCircle(left, lobeY, lobe);
    g.fillCircle(right, lobeY, lobe);
    g.fillTriangle(tri[0], tri[1], tri[2], tri[3], tri[4], tri[5]);
    g.lineStyle(3, 0xffb4c8, 0.95);
    g.strokeCircle(left, lobeY, lobe);
    g.strokeCircle(right, lobeY, lobe);
    g.strokeTriangle(tri[0], tri[1], tri[2], tri[3], tri[4], tri[5]);
  }

  PB.attachLifeHud = function (scene, x, y) {
    var root = scene.add.container(x, y).setDepth(45);
    root.name = 'livesHud';
    var bg = scene.add.graphics();
    root.add(bg);
    root.lifeBg = bg;
    root.livesIcons = [];
    for (var i = 0; i < 3; i++) {
      var heart = scene.add.graphics();
      heart.name = 'lifeHeart';
      root.add(heart);
      root.livesIcons.push(heart);
    }
    var count = PB.text(scene, 0, 0, '', 28, '#ffffff');
    count.name = 'livesCount';
    root.add(count);
    root.livesCount = count;
    return root;
  };

  PB.syncLifeHud = function (root, lives) {
    lives = lives | 0;
    if (lives < 0) lives = 0;
    var showCount = lives > 3;
    var gap = 52;
    var start = -gap;
    var filled = lives > 3 ? 3 : lives;
    var icons = root.livesIcons;
    for (var i = 0; i < icons.length; i++) {
      var heart = icons[i];
      heart.setPosition(start + i * gap, 0);
      paintLifeHeart(heart, i < filled);
      heart.filled = i < filled;
      heart.setVisible(true);
    }
    var count = root.livesCount;
    count.setText('\u00d7' + lives);
    count.setVisible(showCount);
    count.setPosition(start + (icons.length - 1) * gap + 40, 0);
    var bg = root.lifeBg;
    bg.clear();
    var left = start - 30;
    var right = showCount ? count.x + 26 : start + (icons.length - 1) * gap + 30;
    var top = -32;
    var h = 64;
    bg.fillStyle(0x140814, 0.94);
    bg.fillRoundedRect(left, top, right - left, h, 32);
    bg.lineStyle(3, 0xff4d8d, 1);
    bg.strokeRoundedRect(left, top, right - left, h, 32);
    return root;
  };

  PB.text = function (scene, x, y, str, size, color, opts) {
    opts = opts || {};
    var t = scene.add.text(x, y, str, {
      fontFamily: PB.FONT, fontSize: size + 'px', fontStyle: opts.weight || 'bold', color: color || '#ffffff',
      align: opts.align || 'center', stroke: opts.stroke || '#0a0620', strokeThickness: opts.strokeThickness != null ? opts.strokeThickness : Math.max(2, size / 9),
      wordWrap: opts.wrap ? { width: opts.wrap } : undefined
    }).setOrigin(opts.ox != null ? opts.ox : 0.5, opts.oy != null ? opts.oy : 0.5);
    if (opts.glow) t.setShadow(0, 0, opts.glow, 14, true, true);
    return t;
  };

  // Large rounded neon button. Fires cb on release inside the button.
  PB.button = function (scene, x, y, w, h, label, cb, opts) {
    opts = opts || {};
    var color = opts.color != null ? opts.color : PB.COLORS.cyan;
    var c = scene.add.container(x, y);
    var g = scene.add.graphics();
    function draw(pressed) {
      g.clear();
      var dis = c.disabled;
      var col = dis ? 0x4a4f78 : color;
      g.fillStyle(col, dis ? 0.12 : 0.18); g.fillRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, h / 2 + 4 > 30 ? 30 : h / 2 + 4);
      g.fillStyle(opts.fill != null ? opts.fill : 0x12163a, dis ? 0.8 : 0.95); g.fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(26, h / 2));
      g.fillStyle(col, pressed ? 0.45 : 0.22); g.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h / 2 - 4, { tl: Math.min(22, h / 2 - 4), tr: Math.min(22, h / 2 - 4), bl: 4, br: 4 });
      g.lineStyle(3, col, dis ? 0.6 : 1); g.strokeRoundedRect(-w / 2, -h / 2, w, h, Math.min(26, h / 2));
    }
    var t = PB.text(scene, 0, 0, label, opts.size || Math.min(40, Math.round(h * 0.42)), opts.textColor || '#ffffff', { glow: opts.disabled ? null : PB.hex(color) });
    c.add([g, t]);
    function placeLabel(str) {
      if (str != null) t.setText(str);
      if (opts.icon) {
        t.setOrigin(0.5, 0.5);
        t.setPosition(14, 0);
        return;
      }
      t.setStyle({ align: 'center', fixedWidth: w });
      t.setOrigin(0, 0.5);
      t.setPosition(-w / 2, 0);
    }
    placeLabel();
    if (opts.icon) { var ic = scene.add.image(-t.width / 2 - 10, 0, opts.icon).setScale(opts.iconScale || 0.8); c.add(ic); c.icon = ic; }
    var zone = scene.add.zone(0, 0, w + 12, h + 12).setInteractive({ useHandCursor: true });
    c.add(zone);
    c.label = t; c.zone = zone; c.disabled = !!opts.disabled; c.redraw = draw;
    c.setDisabled = function (d) { c.disabled = d; t.setAlpha(d ? 0.5 : 1); placeLabel(); draw(false); return c; };
    c.setLabel = function (s) { placeLabel(s); return c; };
    zone.on('pointerdown', function () { if (c.disabled) return; draw(true); scene.tweens.add({ targets: c, scale: 0.95, duration: 60 }); });
    zone.on('pointerout', function () { draw(false); scene.tweens.add({ targets: c, scale: 1, duration: 90 }); });
    zone.on('pointerup', function () {
      draw(false); scene.tweens.add({ targets: c, scale: 1, duration: 90 });
      if (c.disabled) { Sfx.play('steel'); return; }
      Sfx.play('click'); if (cb) cb();
    });
    draw(false); if (c.disabled) t.setAlpha(0.5);
    return c;
  };

  PB.panel = function (scene, x, y, w, h, color, alpha) {
    var g = scene.add.graphics();
    g.fillStyle(0x000000, 0.35); g.fillRoundedRect(x - w / 2 + 6, y - h / 2 + 10, w, h, 28);
    g.fillStyle(PB.COLORS.panel, alpha != null ? alpha : 0.94); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 28);
    g.lineStyle(3, color || PB.COLORS.cyan, 0.9); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 28);
    g.lineStyle(1, 0xffffff, 0.15); g.strokeRoundedRect(x - w / 2 + 8, y - h / 2 + 8, w - 16, h - 16, 22);
    return g;
  };

  PB.background = function (scene, key) {
    scene.add.image(PB.W / 2, PB.H / 2, key || 'bg_menu');
    // slow drifting crystal motes (cheap ambient particles)
    var e = scene.add.particles(0, 0, 'shard', {
      x: { min: 0, max: PB.W }, y: PB.H + 20, lifespan: 9000, speedY: { min: -120, max: -60 }, speedX: { min: -15, max: 15 },
      scale: { min: 0.4, max: 1.1 }, alpha: { start: 0.5, end: 0 }, rotate: { min: 0, max: 360 }, frequency: 400, maxAliveParticles: 30,
      tint: [0x22e8ff, 0xff3df0, 0x9b6bff], blendMode: 'ADD'
    });
    e.setDepth(-1);
    return e;
  };

  PB.fadeTo = function (scene, key, data) {
    if (scene._leaving) return; scene._leaving = true;
    scene.input.enabled = false;
    scene.cameras.main.fadeOut(220, 7, 10, 31);
    scene.cameras.main.once('camerafadeoutcomplete', function () { scene.scene.start(key, data); });
  };
  PB.enter = function (scene) { scene._leaving = false; scene.input.enabled = true; scene.cameras.main.fadeIn(260, 7, 10, 31); };

  PB.coinBadge = function (scene, x, y) {
    var c = scene.add.container(x, y);
    var g = scene.add.graphics(); g.fillStyle(0x0c1030, 0.85); g.fillRoundedRect(-90, -26, 180, 52, 26); g.lineStyle(2, 0xffd166, 0.9); g.strokeRoundedRect(-90, -26, 180, 52, 26);
    var ic = scene.add.image(-62, 0, 'coin').setScale(0.9);
    var t = PB.text(scene, 10, 0, String(Save.data.coins), 30, '#ffe7a3');
    c.add([g, ic, t]); c.refresh = function () { t.setText(String(Save.data.coins)); };
    return c;
  };

  PB.stars = function (scene, x, y, n, size, gap) {
    var arr = [];
    for (var i = 0; i < 3; i++) {
      var s = scene.add.image(x + (i - 1) * gap, y, 'star').setScale(size / 64);
      s.setTint(i < n ? 0xffd166 : 0x3a3f6a); arr.push(s);
    }
    return arr;
  };
})();
