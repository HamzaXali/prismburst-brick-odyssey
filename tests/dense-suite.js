const { chromium, devices } = require('playwright-core');
const fs = require('fs');
const URL = process.env.PB_URL || 'http://127.0.0.1:8090/index.html';
const SHOTS = process.env.SHOTS_DIR || '/opt/cursor/artifacts';
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
  });
  const ctx = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const toPage = async (x, y) => page.evaluate(([x, y]) => {
    const r = document.querySelector('#game canvas').getBoundingClientRect();
    return { x: r.left + x * r.width / 720, y: r.top + y * r.height / 1280 };
  }, [x, y]);
  const tap = async (x, y) => { const p = await toPage(x, y); await page.touchscreen.tap(p.x, p.y); await sleep(180); };
  const findUI = (scene, q) => page.evaluate(([scene, q]) => {
    const s = PB.game.scene.getScene(scene);
    if (!s) return null;
    let found = null;
    const walk = list => (list || []).forEach(o => {
      if (found) return;
      if (o.name === q || (o.label && o.label.text === q)) {
        const b = o.getBounds();
        found = { x: b.centerX, y: b.centerY, text: (o.label && o.label.text) || o.text || '', disabled: !!o.disabled };
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
  const dismissPopups = async () => {
    for (let i = 0; i < 6; i++) {
      const open = await page.evaluate(() => window.__PB && __PB.scenes().includes('HomePop'));
      if (!open) return;
      await tapUI('HomePop', 'popupClose');
      await sleep(200);
    }
  };

  try {
    await page.goto(URL);
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(500);
    await dismissPopups();
    await tapUI('Menu', 'bar-Modes');
    await sleep(300);
    const modes = await findUI('HomePop', 'modesTitle');
    record('Home Modes opens Crystal Mass', modes && modes.text === 'MODES', modes);
    await tapUI('HomePop', 'mode-mass');
    await page.waitForFunction(() => __PB.scenes().includes('DenseSelect'), null, { timeout: 8000 });
    await sleep(300);
    const select = await findUI('DenseSelect', 'denseSelectTitle');
    const first = await findUI('DenseSelect', 'dense-0');
    const locked = await findUI('DenseSelect', 'dense-1');
    record('Crystal Mass lists the first mass and locks the next',
      select && select.text === 'CRYSTAL MASS' && first && !first.disabled && locked && locked.disabled, { select, first, locked });
    await tapUI('DenseSelect', 'dense-0');
    await page.waitForFunction(() => __PB.scenes().includes('Dense') && __PB.dense() && __PB.dense().name === 'Quartz Spines', null, { timeout: 8000 });
    await sleep(400);
    const hud = await page.evaluate(() => {
      const g = PB.currentDense;
      const hearts = (g.livesIcons || []).map(icon => ({
        filled: !!icon.filled, w: icon.heartW, h: icon.heartH, x: icon.x, visible: icon.visible
      }));
      const left = g.livesHud.x + Math.min.apply(null, hearts.map(h => h.x - h.w / 2));
      const right = g.livesHud.x + Math.max.apply(null, hearts.map(h => h.x + h.w / 2));
      return {
        lives: g.lives,
        text: g.livesCount.text,
        countVisible: !!g.livesCount.visible,
        title: g.titleText.text,
        score: g.scoreText.text,
        visible: g.livesHud.visible && g.livesHud.alpha > 0,
        y: g.livesHud.y,
        left, right,
        breakable: g.breakableLeft,
        filled: hearts.filter(h => h.filled).length,
        hearts
      };
    });
    record('a dense level shows the name, star score, and three hearts',
      hud.title === 'Quartz Spines' && hud.score === '\u2605 0' && hud.lives === 3 && hud.text === '\u00d73' && hud.filled === 3 && !hud.countVisible && hud.visible && hud.y < 160 && hud.left >= 0 && hud.right <= 720 && hud.hearts.every(h => h.visible && h.w >= 36 && h.h >= 32) && hud.breakable >= 2000, hud);
    await page.screenshot({ path: SHOTS + '/dense-spines.png' });
    await page.evaluate(() => { const g = PB.currentDense; g.loseLife(); g.updateHud(); });
    await sleep(200);
    const lostHeart = await page.evaluate(() => {
      const g = PB.currentDense;
      return {
        lives: g.lives,
        filled: g.livesIcons.filter(icon => icon.filled).length,
        outlined: g.livesIcons.filter(icon => !icon.filled).length
      };
    });
    record('losing a life in Crystal Mass outlines that heart', lostHeart.lives === 2 && lostHeart.filled === 2 && lostHeart.outlined === 1, lostHeart);

    await page.evaluate(() => __PB.startDense(2));
    await page.waitForFunction(() => __PB.dense() && __PB.dense().name === 'Facet Bloom', null, { timeout: 8000 });
    await sleep(350);
    await page.screenshot({ path: SHOTS + '/dense-bloom.png' });
    const bloom = await page.evaluate(() => __PB.dense());
    record('Facet Bloom loads as its own mass', bloom && bloom.name === 'Facet Bloom' && bloom.breakable >= 2000 && bloom.lives === 3, bloom);

    await page.evaluate(() => __PB.startDense(5));
    await page.waitForFunction(() => __PB.dense() && __PB.dense().name === 'Carved Core', null, { timeout: 8000 });
    await sleep(350);
    await page.screenshot({ path: SHOTS + '/dense-core.png' });
    const core = await page.evaluate(() => __PB.dense());
    record('Carved Core loads a tunneled mass', core && core.name === 'Carved Core' && core.breakable >= 2000, core);

    await page.evaluate(() => __PB.startDense(0));
    await page.waitForFunction(() => __PB.dense() && __PB.dense().name === 'Quartz Spines', null, { timeout: 8000 });
    await sleep(200);
    const coin = await page.evaluate(() => __PB.denseCoin());
    record('the paddle collects a coin drop once', coin && coin.ok && coin.after === coin.before + 2 && coin.again === coin.after && coin.after >= 0, coin);

    const swarm = await page.evaluate(() => __PB.denseSwarm(300));
    record('a swarm fills the ball cap and does not pass it', swarm === 300, swarm);
    await sleep(200);
    await page.screenshot({ path: SHOTS + '/dense-swarm.png' });
    await page.waitForFunction(() => {
      const p = __PB.densePerf();
      return p && p.samples >= 30 && p.balls >= 200;
    }, null, { timeout: 8000 });
    const perf = await page.evaluate(() => __PB.densePerf());
    record('a 300-ball swarm stays inside a 60fps CPU budget on Pixel 5 emulation',
      perf && perf.samples >= 30 && perf.balls >= 200 && perf.workAvg <= 8 && perf.avg <= 50 && perf.fps >= 24,
      perf);
    record('dense scene produced no page errors', errors.length === 0, errors);
  } catch (err) {
    record('dense playwright suite ran', false, err && err.stack ? err.stack : String(err));
  }

  await browser.close();
  const failed = results.filter(r => !r.pass).length;
  console.log(failed ? failed + ' failed' : 'all ' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
