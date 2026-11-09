/* Headless Pixel Tunnel: menu entry, 40 loads, auto-launch, one clear, screenshots. */
'use strict';
const { chromium, devices } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.PT_SHOTS || '/opt/cursor/artifacts/pixel-tunnel';
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  const extra = detail && !pass ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '';
  console.log((pass ? 'PASS ' : 'FAIL ') + name + extra);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function startServer() {
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const file = path.join(ROOT, urlPath.replace(/^\//, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('missing'); return;
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  try {
    const ctx = await browser.newContext(Object.assign({}, devices['Pixel 5']));
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const port = server.address().port;
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.PB && PB.game && PB.PixelTunnel, null, { timeout: 20000 });
    await page.waitForFunction(() => __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(600);
    for (let i = 0; i < 6; i++) {
      const open = await page.evaluate(() => __PB.scenes().includes('HomePop'));
      if (!open) break;
      await page.evaluate(() => {
        const s = PB.game.scene.getScene('HomePop');
        const walk = list => (list || []).forEach(o => {
          if (o.name === 'popupClose' && o.emit) o.emit('pointerup');
          if (o.list) walk(o.list);
        });
        if (s) walk(s.children.list);
        if (s && s.scene) s.scene.stop();
      });
      await sleep(200);
    }
    const classic = await page.evaluate(() => ({
      scenes: __PB.scenes(),
      version: PB.VERSION,
      button: !!PB.game.scene.getScene('Menu')
    }));
    record('classic menu is up and version is 1.6.0', classic.scenes.includes('Menu') && classic.version === '1.6.0', classic);

    const found = await page.evaluate(() => {
      const s = PB.game.scene.getScene('Menu');
      let hit = null;
      const walk = list => (list || []).forEach(o => {
        if (hit) return;
        if (o.label && o.label.text === 'PIXEL TUNNEL') {
          const b = o.getBounds();
          hit = { x: b.centerX, y: b.centerY };
        }
        if (o.list) walk(o.list);
      });
      walk(s.children.list);
      const r = document.querySelector('#game canvas').getBoundingClientRect();
      return hit ? { x: r.left + hit.x * r.width / 720, y: r.top + hit.y * r.height / 1280 } : null;
    });
    record('PIXEL TUNNEL is on the main menu', !!found, found);
    if (found) await page.touchscreen.tap(found.x, found.y);
    await page.waitForSelector('#pt-root.pt-open');
    await page.screenshot({ path: path.join(SHOTS, 'style-select.png') });
    const select = await page.evaluate(() => ({
      levels: document.querySelectorAll('#pt-root [data-level]').length,
      locked: document.querySelectorAll('#pt-root [data-level][disabled]').length,
      first: !document.querySelector('#pt-root [data-level="1"][disabled]'),
      secondLocked: !!document.querySelector('#pt-root [data-level="2"][disabled]'),
      launch: Array.from(document.querySelectorAll('#pt-root button')).some(b => /launch/i.test(b.textContent))
    }));
    record('style select lists 50 or more, style 1 is open, and there is no launch button',
      select.levels >= 50 && select.locked === select.levels - 1 && select.first && select.secondLocked && select.launch === false, select);
    await page.click('#pt-root [data-level="1"]');
    await sleep(200);
    const start = await page.evaluate(() => PB.PixelTunnel.snapshot());
    record('choosing style 1 starts the olive pocket with the ball already moving',
      start && start.id === 1 && start.name === 'Level 1' && start.balls >= 1, start);

    const moved = await page.evaluate(() => {
      const before = PB.PixelTunnel.snapshot();
      const canvas = document.getElementById('pt-canvas');
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: r.left + r.width * 0.2, clientY: r.top + r.height * 0.7, bubbles: true }));
      const after = PB.PixelTunnel.snapshot();
      return { before: before.balls, afterBalls: after.balls };
    });
    record('the ball is already in motion and a drag does not need a launch button',
      moved.before >= 1 && moved.afterBalls >= 1, moved);

    await page.screenshot({ path: path.join(SHOTS, 'level-01.png') });
    const dug = await page.evaluate(() => {
      PB.PixelTunnel.holdSim = true;
      PB.PixelTunnel.startLevel(1);
      PB.PixelTunnel.setDemo(true);
      PB.PTGame.addBalls(PB.PixelTunnel.debugState(), 8);
      return PB.PixelTunnel.fastForward(6);
    });
    record('a short swarm digs the olive field', dug && dug.demo === true && dug.destroyed > 0 && dug.lost === false, dug);
    await page.screenshot({ path: path.join(SHOTS, 'level-01-dig.png') });

    const saves = await page.evaluate(() => ({
      classic: localStorage.getItem('prismburst.save.v1'),
      tunnel: localStorage.getItem('prismburst.pixel-tunnel.v1')
    }));
    const parsed = JSON.parse(saves.classic || '{}');
    record('classic save key still holds its data and the tunnel mirror',
      !!saves.classic && parsed.v === 1 && parsed.pixelTunnel && parsed.pixelTunnel.levels && !!saves.tunnel);
    record('page produced no script errors', errors.length === 0, errors);

    await ctx.close();
  } catch (err) {
    record('suite crashed', false, err.stack || String(err));
  } finally {
    await browser.close();
    server.close();
  }
  const passed = results.filter(r => r.pass).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  if (passed !== results.length) process.exit(1);
})();
