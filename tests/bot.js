const { chromium, devices } = require('playwright-core');
const fs = require('fs');
const world = +process.argv[2], levels = process.argv[3].split(',').map(Number), scale = +(process.argv[4] || 4);
const URL = process.env.PB_URL || 'http://127.0.0.1:8090/index.html';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
  const out = [];
  for (const l of levels) {
    await page.evaluate(([w, l]) => __PB.start(w, l), [world, l]);
    await page.waitForFunction(() => __PB.state() && __PB.state().active, null, { timeout: 8000 });
    await page.evaluate(s => __PB.bot(true, s), scale);
    const t0 = Date.now(); let st, res = 'timeout';
    while (Date.now() - t0 < 240000) {
      await new Promise(r => setTimeout(r, 1000));
      st = await page.evaluate(() => {
        const sc = __PB.scenes(); const s = __PB.state();
        if (sc.includes('Complete')) s.result = 'WIN'; else if (sc.includes('GameOver')) s.result = 'LOSE:' + PB.game.scene.getScene('GameOver').d.reason;
        return s;
      });
      if (st.result) { res = st.result; break; }
      if (st.elapsed > 900) { res = 'stalled'; break; }
    }
    const lvInfo = await page.evaluate(([w, l]) => { const v = PB_LEVELS.getLevel(w, l); return { name: v.name, obj: v.objective, hp: v.stats.totalHp }; }, [world, l]);
    const row = { id: `W${world + 1}-L${l + 1}`, name: lvInfo.name, objective: lvInfo.obj.type + (lvInfo.obj.time ? ' ' + lvInfo.obj.time + 's' : ''), hp: lvInfo.hp, result: res, gameSec: Math.round(st.elapsed), score: st.score, livesLost: 3 - st.lives, left: st.left, maxNoPaddleSec: +st.counters.maxNoPaddle.toFixed(1), nudges: st.counters.nudges, paddleHits: st.counters.paddleHits, realSec: Math.round((Date.now() - t0) / 1000) };
    out.push(row); console.log(JSON.stringify(row));
    if (l === levels[levels.length - 1] && world === 2) await page.screenshot({ path: 'bot-last.png' });
  }
  fs.writeFileSync(`bot-w${world}.json`, JSON.stringify({ out, errors }, null, 2));
  console.log('errors', errors);
  await browser.close();
})();
