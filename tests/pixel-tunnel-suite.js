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
    await page.screenshot({ path: path.join(SHOTS, 'level-select.png') });
    const select = await page.evaluate(() => ({
      buttons: document.querySelectorAll('#pt-root [data-level]').length,
      locked: document.querySelectorAll('#pt-root [data-level][disabled]').length,
      launch: Array.from(document.querySelectorAll('#pt-root button')).some(b => /launch/i.test(b.textContent))
    }));
    record('level select has 40 levels, only the first is open, and there is no launch button',
      select.buttons === 40 && select.locked === 39 && select.launch === false, select);

    const loads = await page.evaluate(() => {
      const bad = [];
      for (let n = 1; n <= 40; n++) {
        PB.PixelTunnel.startLevel(n);
        const snap = PB.PixelTunnel.snapshot();
        if (!snap || snap.id !== n || !snap.mouths || !snap.mouths.length || snap.yellowLeft < 1) bad.push(n);
      }
      return { bad, sample: PB.PixelTunnel.snapshot() };
    });
    record('all 40 levels load with a mouth and a target', loads.bad.length === 0, loads);

    await page.evaluate(() => PB.PixelTunnel.startLevel(1));
    const before = await page.evaluate(() => PB.PixelTunnel.snapshot());
    await page.evaluate(() => {
      const m = PB.PixelTunnel;
      const snap = m.snapshot();
      const canvas = document.getElementById('pt-canvas');
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 40, clientY: r.top + r.height * 0.8, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + 80, clientY: r.top + r.height * 0.8, bubbles: true }));
    });
    await sleep(50);
    let launched = await page.evaluate(() => PB.PixelTunnel.snapshot().launched);
    if (!launched) {
      await page.evaluate(() => {
        const canvas = document.getElementById('pt-canvas');
        const r = canvas.getBoundingClientRect();
        canvas.setPointerCapture && canvas.setPointerCapture(1);
        canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: r.left + r.width / 2, clientY: r.bottom - 30, bubbles: true }));
        canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: r.left + r.width / 2 + 30, clientY: r.bottom - 30, bubbles: true }));
      });
      launched = await page.evaluate(() => PB.PixelTunnel.snapshot().launched);
    }
    if (!launched) {
      launched = await page.evaluate(() => {
        const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
        window.dispatchEvent(ev);
        return PB.PixelTunnel.snapshot().launched;
      });
    }
    record('first stick move auto-launches and no button is required', before.launched === false && launched === true, { before: before.launched, launched });

    await page.screenshot({ path: path.join(SHOTS, 'level-01.png') });
    for (const n of [8, 20, 38, 40]) {
      await page.evaluate(id => PB.PixelTunnel.startLevel(id), n);
      await page.evaluate(() => PB.PixelTunnel.fastForward(0.4));
      await page.screenshot({ path: path.join(SHOTS, 'level-' + String(n).padStart(2, '0') + '.png') });
    }
    const won = await page.evaluate(() => {
      PB.PixelTunnel.startLevel(1);
      PB.PixelTunnel.setDemo(true);
      return PB.PixelTunnel.fastForward(40);
    });
    record('auto demo clears level 1', won && won.won === true && won.yellowLeft === 0, won);
    await page.screenshot({ path: path.join(SHOTS, 'level-01-clear.png') });

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
