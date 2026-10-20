/*
 * TEST-ONLY. Playwright checks for the startup popup queue.
 * Not loaded by the game and not deployed.
 */
const { chromium, devices } = require('playwright-core');
const URL = process.env.PB_URL || 'http://127.0.0.1:8090/index.html';
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  const extra = detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '';
  console.log((pass ? 'PASS ' : 'FAIL ') + name + extra);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
  });
  const ctx = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const toPage = async (x, y) => page.evaluate(([x, y]) => {
    const r = document.querySelector('#game canvas').getBoundingClientRect();
    return { x: r.left + x * r.width / 720, y: r.top + y * r.height / 1280 };
  }, [x, y]);
  const tap = async (x, y) => { const p = await toPage(x, y); await page.touchscreen.tap(p.x, p.y); await sleep(150); };
  const findUI = (scene, q) => page.evaluate(([scene, q]) => {
    const s = PB.game.scene.getScene(scene);
    if (!s) return null;
    let found = null;
    const walk = list => (list || []).forEach(o => {
      if (found) return;
      if (o.name === q || (o.label && o.label.text === q)) {
        const b = o.getBounds();
        found = { x: b.centerX, y: b.centerY };
        return;
      }
      if (o.list) walk(o.list);
    });
    walk(s.children.list);
    return found;
  }, [scene, q]);
  const tapUI = async (scene, q) => {
    const p = await findUI(scene, q);
    if (!p) throw new Error('UI not found: ' + scene + '/' + q);
    await tap(p.x, p.y);
  };
  const boot = async () => {
    await page.goto(URL);
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(500);
  };
  const hasText = wanted => page.evaluate(wanted => {
    const s = PB.game.scene.getScene('HomePop');
    if (!s) return false;
    let found = false;
    const walk = list => (list || []).forEach(o => {
      if (o.text === wanted) found = true;
      if (o.list) walk(o.list);
    });
    walk(s.children.list);
    return found;
  }, wanted);

  try {
    await boot();
    const first = await page.evaluate(() => __PB.scenes().slice());
    record('startup opens the menu and the first popup together', first.includes('Menu') && first.includes('HomePop'), first);
    record('the first popup is the daily bonus', await hasText('DAILY BONUS'));
    const beforeDouble = await page.evaluate(() => __PB.save().coins);
    await tapUI('HomePop', 'claimDouble');
    await sleep(200);
    const note = await page.evaluate(() => {
      const s = PB.game.scene.getScene('HomePop');
      return s && s.noteText ? s.noteText.text : '';
    });
    const afterDouble = await page.evaluate(() => __PB.save().coins);
    record('2x Claim shows Coming soon and does not grant a reward', note === 'Coming soon' && afterDouble === beforeDouble, { note, beforeDouble, afterDouble });

    await tapUI('HomePop', 'popupClose');
    await sleep(300);
    record('X advances to the tasks reminder', await hasText('DAILY TASKS'));
    record('unbuilt tasks are labelled as not in the game yet', await hasText('Finish 1 challenge level  ·  Not in the game yet') && await hasText('Open a chest  ·  Not in the game yet'));
    await tapUI('HomePop', 'popupClose');
    await sleep(300);
    record('X advances to the lucky wheel', await hasText('LUCKY WHEEL'));
    await tapUI('HomePop', 'popupClose');
    await sleep(300);
    const closed = await page.evaluate(() => __PB.scenes().slice());
    record('the queue finishes and the menu stays open', !closed.includes('HomePop') && closed.includes('Menu'), closed);
    const top = await page.evaluate(() => {
      const s = PB.game.scene.getScene('Menu');
      const boxes = {};
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'starBadge' || o.name === 'coinBadge' || o.name === 'gemBadge') {
          let label = '';
          const read = nodes => (nodes || []).forEach(n => {
            if (typeof n.text === 'string' && n.text !== '') label = n.text;
            if (n.list) read(n.list);
          });
          read(o.list);
          boxes[o.name] = { x: o.x - 90, y: o.y - 26, r: o.x + 90, bot: o.y + 26, visible: o.visible && o.alpha > 0, label };
        }
        if (o.list) walk(o.list);
      });
      walk(s.children.list);
      const save = __PB.save();
      return { boxes, coins: String(save.coins), gems: String((save.home && save.home.gems) || 0) };
    });
    const star = top.boxes.starBadge, coin = top.boxes.coinBadge, gem = top.boxes.gemBadge;
    const apart = (a, b) => a && b && (a.r <= b.x + 0.5 || b.r <= a.x + 0.5 || a.bot <= b.y + 0.5 || b.bot <= a.y + 0.5);
    record('Home shows the coin badge and the gem badge without overlap',
      !!(star && coin && gem && coin.visible && gem.visible && star.visible
        && coin.label === top.coins && gem.label === top.gems
        && apart(star, coin) && apart(coin, gem) && apart(star, gem)
        && coin.x >= 0 && gem.r <= 720 && coin.y >= 0 && coin.bot <= 140 && gem.bot <= 140),
      top.boxes);
    await tapUI('Menu', 'PLAY');
    await page.waitForFunction(() => __PB.scenes().includes('Worlds'), null, { timeout: 8000 });
    record('gameplay is reachable after the popups close', (await page.evaluate(() => __PB.scenes().includes('Worlds'))));

    await page.evaluate(() => {
      const now = Date.now();
      PB.Home.claimBonus(PB.Save.data, now);
      PB.Home.note(PB.Save.data, 'clears', 10, now);
      PB.Home.note(PB.Save.data, 'spins', 3, now);
      PB.Home.note(PB.Save.data, 'powerups', 3, now);
      PB.Save.data.home.wheel.used = 3;
      PB.Save.data.home.wheel.pending = [];
      PB.Save.persist();
    });
    await page.reload();
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(400);
    const skipped = await page.evaluate(() => __PB.scenes().slice());
    record('an empty queue does not open a popup', skipped.includes('Menu') && !skipped.includes('HomePop'), skipped);

    await page.evaluate(() => localStorage.clear());
    await boot();
    const started = await page.evaluate(() => {
      const result = PB.Home.beginSpin(PB.Save.data, Date.now(), function () { return 0; });
      PB.Save.persist();
      return { id: result.spin && result.spin.id, segment: result.segment && result.segment.id, coins: PB.Save.data.coins, pending: PB.Save.data.home.wheel.pending.length };
    });
    await page.reload();
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(400);
    const once = await page.evaluate(() => ({ coins: __PB.save().coins, pending: __PB.save().home.wheel.pending.length, gems: __PB.save().home.gems }));
    await page.reload();
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(300);
    const twice = await page.evaluate(() => __PB.save().coins);
    record('refresh during a pending spin grants that reward once',
      started.segment === 'c25' && started.pending === 1 && started.coins === 0 && once.coins === 25 && once.pending === 0 && twice === 25,
      { started, once, twice });

    await page.evaluate(() => localStorage.clear());
    await boot();
    await page.evaluate(() => {
      PB.Home.mode = { type: 'one', items: ['wheel'], index: 0 };
      const menu = PB.game.scene.getScene('Menu');
      menu.scene.launch('HomePop');
      menu.scene.bringToTop('HomePop');
    });
    await sleep(300);
    const angleBefore = await page.evaluate(() => {
      const s = PB.game.scene.getScene('HomePop');
      return s && s.wheelGfx ? s.wheelGfx.angle : null;
    });
    await tapUI('HomePop', 'spinWheel');
    await sleep(200);
    const spinning = await page.evaluate(() => {
      const s = PB.game.scene.getScene('HomePop');
      return { angle: s && s.wheelGfx ? s.wheelGfx.angle : null, pending: PB.Save.data.home.wheel.pending.length, spinning: !!(s && s.spinning) };
    });
    await page.reload();
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(300);
    const afterSpin = await page.evaluate(() => ({ coins: __PB.save().coins, gems: __PB.save().home.gems, powers: __PB.save().home.powers, pending: __PB.save().home.wheel.pending.length }));
    const paid = afterSpin.coins > 0 || afterSpin.gems > 0 || afterSpin.powers.wide > 0 || afterSpin.powers.multi > 0;
    record('the wheel animates and a reload mid-spin grants the stored reward once',
      angleBefore === 0 && spinning.spinning === true && spinning.pending === 1 && spinning.angle !== 0 && paid && afterSpin.pending === 0,
      { angleBefore, spinning, afterSpin });

    const legacy = {
      v: 1, coins: 42, unlocked: [2, 0, 0, 0, 0], levels: { '0-0': { best: 15, stars: 2 } },
      owned: { ball: ['classic'], paddle: ['classic'] },
      equipped: { ball: 'classic', paddle: 'classic' },
      settings: { sound: true, vibration: true, shake: true },
      daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
      stats: { bricks: 3, played: 1, cleared: 1 }, last: { world: 0, level: 0 }
    };
    await page.evaluate(raw => localStorage.setItem('prismburst.save.v1', raw), JSON.stringify(legacy));
    await page.reload();
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(300);
    const loaded = await page.evaluate(() => __PB.save());
    record('an old save keeps its coins and levels and gains home version 1',
      loaded.coins === 42 && loaded.levels['0-0'].stars === 2 && loaded.unlocked[0] === 2 && loaded.home && loaded.home.v === 1 && loaded.home.bonus.lastClaim === null,
      { coins: loaded.coins, stars: loaded.levels['0-0'] && loaded.levels['0-0'].stars, home: loaded.home && loaded.home.v });

    await page.evaluate(() => { PB.game.scene.stop('HomePop'); PB.game.scene.start('Menu'); });
    await sleep(400);
    await tapUI('Menu', 'Shop');
    await sleep(200);
    const soon = await page.evaluate(() => {
      let text = '';
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'soonBody' && o.text) text = o.text;
        if (o.list) walk(o.list);
      });
      walk(PB.game.scene.getScene('Menu').children.list);
      return text;
    });
    record('Shop opens a Coming soon panel', soon === 'Coming soon', soon);
    await page.evaluate(() => { PB.Save.track('clears', 2); PB.Save.track('powerups', 1); });
    const hooked = await page.evaluate(() => __PB.save().home.tasks.progress);
    record('clearing a level and using a power-up advance the live tasks', hooked.clears === 2 && hooked.powerups === 1, hooked);
    record('popup run has no page errors', errors.length === 0, errors.slice(0, 5));
  } catch (err) {
    record('home suite crashed', false, err && err.stack ? err.stack : String(err));
  }
  console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed');
  await browser.close();
  if (results.some(r => !r.pass)) process.exit(1);
})();
