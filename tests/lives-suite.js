const { chromium, devices } = require('playwright-core');
const fs = require('fs');
const URL = process.env.PB_URL || 'http://127.0.0.1:8090/index.html';
const SHOTS = process.env.SHOTS_DIR || '/opt/cursor/artifacts';
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
function record(name, pass, detail) { results.push({ name, pass: !!pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const toPage = async (x, y) => page.evaluate(([x, y]) => { const r = document.querySelector('#game canvas').getBoundingClientRect(); return { x: r.left + x * r.width / 720, y: r.top + y * r.height / 1280 }; }, [x, y]);
  const tap = async (x, y) => { const p = await toPage(x, y); await page.touchscreen.tap(p.x, p.y); await sleep(150); };
  const findUI = (scene, q) => page.evaluate(([scene, q]) => {
    const s = PB.game.scene.getScene(scene); if (!s) return null; let found = null;
    const walk = list => (list || []).forEach(o => {
      if (found) return;
      if (o.name === q || (o.label && o.label.text === q)) { const b = o.getBounds(); found = { x: b.centerX, y: b.centerY, text: (o.label && o.label.text) || o.text || '' }; return; }
      if (o.list) walk(o.list);
    });
    walk(s.children.list); return found;
  }, [scene, q]);
  const tapUI = async (scene, q) => { const p = await findUI(scene, q); if (!p) throw new Error('UI not found: ' + scene + '/' + q); await tap(p.x, p.y); };
  const dismissPopups = async () => {
    for (let i = 0; i < 6; i++) {
      const open = await page.evaluate(() => window.__PB && __PB.scenes().includes('HomePop'));
      if (!open) return;
      await tapUI('HomePop', 'popupClose');
      await sleep(200);
    }
  };
  const hud = () => page.evaluate(() => {
    const g = __PB.game();
    const box = g.livesHud.getBounds();
    const hearts = (g.livesIcons || []).map(icon => ({
      filled: !!icon.filled, w: icon.heartW, h: icon.heartH, x: icon.x, visible: icon.visible
    }));
    const heights = hearts.map(h => h.h);
    const widths = hearts.map(h => h.w);
    return {
      text: g.livesCount.text,
      countVisible: !!g.livesCount.visible,
      lives: g.lives,
      filled: hearts.filter(h => h.filled).length,
      outlined: hearts.filter(h => !h.filled).length,
      hearts,
      sameSize: hearts.length === 3 && Math.max.apply(null, heights) - Math.min.apply(null, heights) < 8 && Math.max.apply(null, widths) - Math.min.apply(null, widths) < 8,
      separated: hearts.length === 3 && hearts.slice().sort((a, b) => a.x - b.x).every((h, i, arr) => i === 0 || h.x - arr[i - 1].x >= h.w * 0.9),
      legible: hearts.length === 3 && hearts.every(h => h.visible && h.w >= 36 && h.h >= 32),
      visible: g.livesHud.visible && g.livesHud.alpha > 0,
      x: box.x, y: box.y, w: box.width, h: box.height
    };
  });
  const heartsMatch = (view) => {
    if (!view || !view.legible || !view.sameSize || !view.separated) return false;
    if (view.lives > 3) return view.filled === 3 && view.outlined === 0 && view.countVisible && view.text === '\u00d7' + view.lives;
    return view.filled === view.lives && view.outlined === 3 - view.lives && !view.countVisible;
  };
  const alive = () => page.evaluate(() => __PB.game().bricks.filter(b => b.alive).length);
  async function missLastBall() {
    await page.evaluate(() => { const g = __PB.game(); g.lives = 1; g.paddle.tx = 40; __PB.launch(); });
    await page.evaluate(() => { const g = __PB.game(); g.balls.forEach(b => { if (b.active) { b.x = 650; b.y = 1000; b.vx = 10; b.vy = 700; } }); g.paddle.x = 80; g.paddle.tx = 80; });
    await page.waitForFunction(() => __PB.scenes().includes('GameOver'), null, { timeout: 8000 });
    await sleep(400);
  }

  try {
    await page.goto(URL);
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(600);
    await dismissPopups();
    await page.evaluate(() => __PB.start(0, 0));
    await page.waitForFunction(() => __PB.scenes().includes('Game'), null, { timeout: 8000 });
    await sleep(400);
    const shown = await hud();
    record('lives counter is visible in the play HUD', shown.visible && heartsMatch(shown) && shown.y < 160 && shown.x >= 0 && shown.x + shown.w <= 720, shown);
    await page.screenshot({ path: SHOTS + '/hud-lives.png' });
    await page.evaluate(() => __PB.game().loseLife());
    await sleep(250);
    const dropped = await hud();
    record('the lives counter decrements when a life is lost', dropped.lives === 2 && heartsMatch(dropped), dropped);

    const before = await alive();
    await missLastBall();
    const over = await page.evaluate(() => {
      const s = PB.game.scene.getScene('GameOver');
      let title = '';
      const walk = list => (list || []).forEach(o => { if (o.name === 'gameOverTitle') title = o.text; if (o.list) walk(o.list); });
      walk(s.children.list);
      return { title, scenes: __PB.scenes(), lives: __PB.state().lives, ended: __PB.state().ended };
    });
    const retry = await findUI('GameOver', 'retry');
    const home = await findUI('GameOver', 'home');
    record('running out of lives opens Out of Lives with Retry and Home', over.title === 'OUT OF LIVES' && !!retry && !!home && over.scenes.includes('GameOver') && over.ended, over);
    await page.screenshot({ path: SHOTS + '/out-of-lives.png' });

    await page.evaluate(() => { PB.Ads.durationMs = 20000; PB.Ads.scriptIndex = 0; });
    await tapUI('GameOver', 'watchLives');
    await page.waitForSelector('#pb-ad .pb-ad-badge');
    await sleep(700);
    const mid = await page.evaluate(() => ({
      badge: document.querySelector('.pb-ad-badge').textContent,
      caption: document.querySelector('.pb-ad-caption').textContent,
      close: document.querySelector('.pb-ad-close').textContent
    }));
    await page.screenshot({ path: SHOTS + '/demo-ad.png' });
    record('the demo ad is a full-screen UGC card with a countdown', mid.badge === 'Demo ad' && mid.caption.indexOf('POV:') === 0 && mid.close === 'Close', mid);
    await page.evaluate(() => document.querySelector('#pb-ad .pb-ad-close').click());
    await page.waitForFunction(() => !document.getElementById('pb-ad'));
    const early = await page.evaluate(() => ({ lives: __PB.state().lives, over: __PB.scenes().includes('GameOver'), used: __PB.state().lifeAdUsed, bricks: __PB.game().bricks.filter(b => b.alive).length }));
    record('closing the ad early grants no lives and keeps the bricks', early.lives === 0 && early.over && early.used === false && early.bricks === before, early);

    await page.evaluate(() => { PB.Ads.durationMs = 400; });
    await tapUI('GameOver', 'watchLives');
    await page.waitForFunction(() => { const b = document.querySelector('#pb-ad .pb-ad-close'); return b && b.textContent === 'Continue'; }, null, { timeout: 5000 });
    await page.evaluate(() => document.querySelector('#pb-ad .pb-ad-close').click());
    await page.waitForFunction(() => !__PB.scenes().includes('GameOver'), null, { timeout: 4000 });
    await sleep(200);
    const resumed = await page.evaluate(() => ({ lives: __PB.state().lives, ended: __PB.state().ended, used: __PB.state().lifeAdUsed, bricks: __PB.game().bricks.filter(b => b.alive).length, attached: __PB.state().balls.some(b => b.attached) }));
    record('a finished ad grants 3 lives once and relaunches on the same bricks', resumed.lives === 3 && resumed.ended === false && resumed.used === true && resumed.bricks === before && resumed.attached, resumed);

    await page.evaluate(() => { PB.Save.data.coins = 100; PB.Save.persist(); });
    await missLastBall();
    const second = await findUI('GameOver', 'watchLives');
    record('the life ad is not offered again on the same attempt', second === null);
    const cont = await findUI('GameOver', 'continueCoins');
    record('continue shows the first coin price', cont && cont.text === 'Continue for 40 coins', cont);
    await tapUI('GameOver', 'continueCoins');
    await page.waitForFunction(() => !__PB.scenes().includes('GameOver'), null, { timeout: 4000 });
    const paid = await page.evaluate(() => ({ coins: __PB.save().coins, lives: __PB.state().lives, bricks: __PB.game().bricks.filter(b => b.alive).length }));
    record('continue spends 40 coins for one life and keeps the bricks', paid.coins === 60 && paid.lives === 1 && paid.bricks === before, paid);

    await missLastBall();
    const broke = await page.evaluate(() => {
      PB.Save.data.coins = 10;
      const pay = PB.Shop.payContinue(PB.Save.data, __PB.state().continuesUsed);
      return { ok: pay.ok, coins: PB.Save.data.coins, over: __PB.scenes().includes('GameOver'), lives: __PB.state().lives, price: PB.Shop.continuePrice(__PB.state().continuesUsed) };
    });
    record('continue at the next price does nothing when coins are short', broke.ok === false && broke.coins === 10 && broke.over && broke.lives === 0 && broke.price === 80, broke);

    await page.evaluate(() => { PB.Ads.durationMs = 400; PB.Ads.scriptIndex = 1; __PB.start(0, 0); });
    await page.waitForFunction(() => __PB.scenes().includes('Game') && !__PB.scenes().includes('GameOver'), null, { timeout: 8000 });
    await sleep(300);
    await page.evaluate(() => { __PB.launch(); __PB.clear(); });
    await page.waitForFunction(() => __PB.scenes().includes('Complete'), null, { timeout: 8000 });
    await sleep(500);
    const clear = await page.evaluate(() => {
      const s = PB.game.scene.getScene('Complete');
      return { coins: s.d.coins, save: PB.Save.data.coins, doubled: PB.Save.doubledClear(0, 0) };
    });
    const watch = await findUI('Complete', 'watchDouble');
    record('level clear offers a 2x coin reward once', !!watch && watch.text === 'Watch ad: 2x reward' && clear.doubled === false && clear.coins > 0, { watch, clear });
    await page.screenshot({ path: SHOTS + '/level-complete-2x.png' });
    await tapUI('Complete', 'watchDouble');
    await page.waitForFunction(() => { const b = document.querySelector('#pb-ad .pb-ad-close'); return b && b.textContent === 'Continue'; }, null, { timeout: 5000 });
    await page.evaluate(() => document.querySelector('#pb-ad .pb-ad-close').click());
    await sleep(400);
    const doubled = await page.evaluate(() => {
      let line = '';
      const walk = list => (list || []).forEach(o => { if (o.name === 'clearCoins') line = o.text; if (o.list) walk(o.list); });
      walk(PB.game.scene.getScene('Complete').children.list);
      return { line, coins: PB.Save.data.coins, doubled: PB.Save.data.levels['0-0'].doubled };
    });
    record('the 2x ad adds the same coin reward again and stores the claim', doubled.doubled === true && doubled.coins === clear.save + clear.coins && doubled.line === '+' + (clear.coins * 2), { clear, doubled });

    await page.reload();
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(400);
    await dismissPopups();
    const kept = await page.evaluate(() => __PB.save().levels['0-0'].doubled === true);
    await page.evaluate(() => __PB.start(0, 0));
    await page.waitForFunction(() => __PB.scenes().includes('Game'), null, { timeout: 8000 });
    await sleep(200);
    const coinsBefore = await page.evaluate(() => PB.Save.data.coins);
    await page.evaluate(() => { __PB.launch(); __PB.clear(); });
    await page.waitForFunction(() => __PB.scenes().includes('Complete'), null, { timeout: 8000 });
    await sleep(400);
    const replay = await page.evaluate(beforeCoins => {
      const s = PB.game.scene.getScene('Complete');
      let watch = false;
      const walk = list => (list || []).forEach(o => { if (o.name === 'watchDouble') watch = true; if (o.list) walk(o.list); });
      walk(s.children.list);
      return { watch, coins: PB.Save.data.coins, payout: s.d.coins, doubled: PB.Save.data.levels['0-0'].doubled, beforeCoins };
    }, coinsBefore);
    record('replaying after a reload cannot claim the double again', kept && replay.doubled === true && replay.watch === false && replay.coins === replay.beforeCoins + replay.payout, replay);

    await page.evaluate(() => { PB.game.scene.stop('Complete'); PB.game.scene.stop('Game'); PB.Save.data.coins = 500; PB.Save.persist(); PB.game.scene.start('Menu'); });
    await page.waitForFunction(() => __PB.scenes().includes('Menu'), null, { timeout: 8000 });
    await sleep(400);
    await dismissPopups();
    await tapUI('Menu', 'Shop');
    await page.waitForFunction(() => __PB.scenes().includes('HomePop'), null, { timeout: 4000 });
    await sleep(300);
    const shopTitle = await findUI('HomePop', 'shopTitle');
    record('Home opens the prism coin shop', shopTitle && shopTitle.text === 'PRISM SHOP', shopTitle);
    await page.screenshot({ path: SHOTS + '/shop.png' });
    await tapUI('HomePop', 'look-ion-wake');
    await sleep(300);
    const owned = await page.evaluate(() => ({ coins: __PB.save().coins, owned: __PB.save().shop.owned.slice() }));
    record('buying a trail spends coins once', owned.coins === 420 && owned.owned.indexOf('ion-wake') >= 0, owned);
    await tapUI('HomePop', 'look-ion-wake');
    await sleep(250);
    const equipped = await page.evaluate(() => __PB.save().shop.trail);
    record('equipping the trail is stored on the save', equipped === 'ion-wake', equipped);

    await page.evaluate(() => { PB.Save.data.coins = 10; PB.Save.persist(); PB.game.scene.getScene('HomePop').render(); });
    await sleep(200);
    const coinsShort = await page.evaluate(() => __PB.save().coins);
    await tapUI('HomePop', 'boost-life');
    await sleep(200);
    const stillShort = await page.evaluate(() => ({ coins: __PB.save().coins, queued: __PB.save().shop.boosts.life.length }));
    record('an unaffordable boost does not spend coins', coinsShort === 10 && stillShort.coins === 10 && stillShort.queued === 0, stillShort);

    await page.evaluate(() => { PB.Save.data.coins = 80; PB.Save.persist(); PB.game.scene.getScene('HomePop').render(); });
    await sleep(150);
    await tapUI('HomePop', 'boost-life');
    await tapUI('HomePop', 'boost-life');
    await sleep(200);
    const once = await page.evaluate(() => ({ coins: __PB.save().coins, queued: __PB.save().shop.boosts.life.length }));
    record('a double tap buys the life boost only once', once.coins === 40 && once.queued === 1, once);

    await page.evaluate(() => __PB.start(0, 1));
    await page.waitForFunction(() => __PB.scenes().includes('Game'), null, { timeout: 8000 });
    await sleep(300);
    const boosted = await page.evaluate(() => ({ lives: __PB.state().lives, queued: __PB.save().shop.boosts.life.length }));
    const boostedHud = await hud();
    record('the extra life is applied to the next level and then gone', boosted.lives === 4 && boosted.queued === 0 && heartsMatch(boostedHud), { boosted, boostedHud });
    await page.evaluate(() => __PB.start(0, 2));
    await page.waitForFunction(() => __PB.state() && __PB.state().level === 2, null, { timeout: 8000 });
    await sleep(200);
    const plain = await hud();
    record('the following level starts at 3 lives', plain.lives === 3 && heartsMatch(plain), plain);

    await page.reload();
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(300);
    const afterReload = await page.evaluate(() => ({ trail: __PB.save().shop.trail, coins: __PB.save().coins, doubled: __PB.save().levels['0-0'].doubled }));
    record('the equipped trail and the doubled claim survive reload', afterReload.trail === 'ion-wake' && afterReload.doubled === true, afterReload);
    record('no page errors', errors.length === 0, errors.join('; '));
  } catch (err) {
    record('lives suite crashed', false, err.stack || err.message);
  }
  await browser.close();
  const passed = results.filter(r => r.pass).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  if (passed !== results.length) process.exit(1);
})();
