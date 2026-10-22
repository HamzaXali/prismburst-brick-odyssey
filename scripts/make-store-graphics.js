#!/usr/bin/env node
/*
 * Generates Google Play store graphics into store/. Not shipped with the game.
 *   store/icon-512.png              512x512 app icon (32-bit PNG, full square)
 *   store/feature-graphic-1024x500.png
 *   store/screenshots/0N-*.png      1080x1920 phone screenshots of the real game
 * The icon and feature graphic are original SVG art drawn here (prism, light
 * beams, glass bricks). Screenshots are captured from the running game with
 * Supabase mocked off, so no account or network is used.
 * Usage: PB_URL=http://127.0.0.1:8113/index.html node scripts/make-store-graphics.js
 */
'use strict';
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'store');
const PAGE_URL = process.env.PB_URL || 'http://127.0.0.1:8113/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });

const DEFS = `
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="#2a1660"/><stop offset="0.55" stop-color="#120c3a"/><stop offset="1" stop-color="#070a1f"/>
    </radialGradient>
    <linearGradient id="faceL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b48cff"/><stop offset="1" stop-color="#7b4dff"/></linearGradient>
    <linearGradient id="faceR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ff4ff"/><stop offset="1" stop-color="#18b8e8"/></linearGradient>
    <linearGradient id="faceB" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff3df0"/><stop offset="1" stop-color="#ff6bb0"/></linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5ff4ff"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="1" stop-color="#ff7af5"/></linearGradient>
  </defs>`;

function sparkle(x, y, s, c) {
  return `<path d="M${x} ${y - s} L${x + s * 0.25} ${y - s * 0.25} L${x + s} ${y} L${x + s * 0.25} ${y + s * 0.25} L${x} ${y + s} L${x - s * 0.25} ${y + s * 0.25} L${x - s} ${y} L${x - s * 0.25} ${y - s * 0.25} Z" fill="${c || '#ffffff'}" opacity="0.9"/>`;
}

// A prism centred at (cx, cy) with half-width w; beams leave to the right.
function prism(cx, cy, w, rays, spread) {
  spread = spread || [-14, 7.5];
  const h = w * 1.25;
  const top = [cx, cy - h * 0.62], left = [cx - w, cy + h * 0.38], right = [cx + w, cy + h * 0.38], mid = [cx, cy + h * 0.08];
  const P = p => p.join(',');
  const rayCols = ['#ff3d6e', '#ffb13d', '#ffe94d', '#3dff8b', '#3dc8ff', '#a05bff'];
  const rx = cx + w * 0.45, ry = cy + h * 0.02;
  const out = rays ? rayCols.map((c, i) => {
    const a = (spread[0] + i * spread[1]) * Math.PI / 180;
    const len = rays;
    return `<line x1="${rx}" y1="${ry}" x2="${rx + Math.cos(a) * len}" y2="${ry + Math.sin(a) * len + 30}" stroke="${c}" stroke-width="${w * 0.07}" stroke-linecap="round" filter="url(#glow)"/>`;
  }).join('') : '';
  return `
    <ellipse cx="${cx}" cy="${cy + h * 0.1}" rx="${w * 1.3}" ry="${h * 0.75}" fill="#7b4dff" opacity="0.35" filter="url(#soft)"/>
    ${out}
    <polygon points="${P(top)} ${P(left)} ${P(mid)}" fill="url(#faceL)"/>
    <polygon points="${P(top)} ${P(mid)} ${P(right)}" fill="url(#faceR)"/>
    <polygon points="${P(left)} ${P(mid)} ${P(right)}" fill="url(#faceB)"/>
    <polygon points="${P(top)} ${P(left)} ${P(right)}" fill="none" stroke="#ffffff" stroke-width="${w * 0.045}" stroke-linejoin="round" filter="url(#glow)"/>
    <line x1="${top[0]}" y1="${top[1]}" x2="${mid[0]}" y2="${mid[1]}" stroke="#ffffff" stroke-opacity="0.85" stroke-width="${w * 0.025}"/>
    <line x1="${left[0]}" y1="${left[1]}" x2="${mid[0]}" y2="${mid[1]}" stroke="#ffffff" stroke-opacity="0.6" stroke-width="${w * 0.02}"/>
    <line x1="${right[0]}" y1="${right[1]}" x2="${mid[0]}" y2="${mid[1]}" stroke="#ffffff" stroke-opacity="0.6" stroke-width="${w * 0.02}"/>`;
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${DEFS}
    <rect width="512" height="512" fill="url(#bg)"/>
    ${[[70, 70], [150, 40], [440, 90], [470, 300], [60, 330], [380, 470], [110, 450]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#ffffff" opacity="0.6"/>`).join('')}
    ${sparkle(105, 150, 20)}${sparkle(410, 128, 18)}${sparkle(80, 380, 13)}${sparkle(430, 400, 15, '#ffd166')}
    <line x1="30" y1="250" x2="215" y2="236" stroke="#ffffff" stroke-width="9" stroke-linecap="round" filter="url(#glow)"/>
    ${prism(256, 236, 132, 230)}
    <circle cx="256" cy="415" r="27" fill="#d9fbff" stroke="#5ff4ff" stroke-width="5" filter="url(#glow)"/>
    <circle cx="247" cy="406" r="8" fill="#ffffff" opacity="0.9"/>
    <rect x="166" y="456" width="180" height="20" rx="10" fill="#22e8ff" filter="url(#glow)"/>
  </svg>`;
}

function featureSvg() {
  const cols = ['#ff3df0', '#22e8ff', '#ffd166', '#9b6bff', '#3dff8b'];
  let bricks = '';
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      if ((r + c) % 5 === 4) continue;
      const x = 600 + c * 66 + (r % 2 ? 33 : 0), y = 70 + r * 44;
      if (x > 1000) continue;
      const col = cols[(r + c * 2) % cols.length];
      bricks += `<rect x="${x}" y="${y}" width="58" height="34" rx="8" fill="${col}" fill-opacity="0.28" stroke="${col}" stroke-width="3" filter="url(#glow)"/><rect x="${x + 6}" y="${y + 5}" width="46" height="9" rx="4" fill="#ffffff" opacity="0.35"/>`;
    }
  }
  const shards = [[640, 360, '#ff3df0'], [700, 395, '#22e8ff'], [720, 340, '#ffd166'], [950, 420, '#9b6bff'], [930, 350, '#3dff8b']]
    .map(([x, y, c], i) => `<polygon points="${x},${y} ${x + 16},${y + 8} ${x + 4},${y + 22}" fill="${c}" opacity="0.85" transform="rotate(${i * 37} ${x} ${y})"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">${DEFS}
    <rect width="1024" height="500" fill="url(#bg)"/>
    ${[[40, 40], [300, 30], [520, 60], [980, 40], [560, 470], [990, 470], [20, 470]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#ffffff" opacity="0.6"/>`).join('')}
    ${bricks}
    ${shards}
    <line x1="0" y1="185" x2="130" y2="176" stroke="#ffffff" stroke-width="7" stroke-linecap="round" filter="url(#glow)"/>
    ${prism(205, 165, 88, 370, [-12, 5])}
    <circle cx="840" cy="402" r="17" fill="#d9fbff" stroke="#5ff4ff" stroke-width="4" filter="url(#glow)"/>
    <rect x="770" y="436" width="140" height="15" rx="7" fill="#22e8ff" filter="url(#glow)"/>
    <text x="44" y="395" font-family="Roboto, 'DejaVu Sans', Arial, sans-serif" font-size="80" font-weight="900" letter-spacing="4" fill="url(#title)" filter="url(#glow)">PRISMBURST</text>
    <text x="50" y="448" font-family="Roboto, 'DejaVu Sans', Arial, sans-serif" font-size="32" font-weight="700" letter-spacing="10" fill="#ffd166">BRICK ODYSSEY</text>
    ${sparkle(330, 60, 14)}${sparkle(560, 330, 10, '#ffd166')}${sparkle(990, 380, 12)}
  </svg>`;
}

// Canvas export keeps an alpha channel, so the file is a 32-bit RGBA PNG as
// Play asks for the icon (a plain screenshot would be 24-bit RGB).
async function renderSvgRgba(browser, svg, w, h, file) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent('<!DOCTYPE html><html><body style="margin:0"></body></html>');
  const dataUrl = await page.evaluate(([src, w, h]) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('svg failed to load'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }), [svg, w, h]);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await page.close();
}

async function renderSvg(browser, svg, w, h, file) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await sleep(200);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h }, omitBackground: true });
  await page.close();
}

const SAVE = JSON.stringify({
  v: 1, coins: 860, unlocked: [20, 9, 1, 0, 0],
  levels: Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['0-' + i, { best: 9000 + i * 250, stars: i % 4 === 3 ? 2 : 3 }]).concat(Array.from({ length: 8 }, (_, i) => ['1-' + i, { best: 7000 + i * 200, stars: 2 + (i % 2) }]))),
  owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' },
  settings: { sound: false, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
  stats: { bricks: 4200, played: 40, cleared: 28 }, last: { world: 1, level: 8 }, home: null, shop: null, achievements: null
});

async function shots(browser) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  await ctx.route('https://*.supabase.co/**', r => r.abort());
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.PB_CONFIG = ' + JSON.stringify({ supabaseUrl: 'https://prismburst-store.supabase.co', supabaseAnonKey: 'sb_publishable_store_shots_not_a_key', providers: { email: true, google: true, facebook: false } }) + ';' }));
  await ctx.addInitScript(raw => { if (!sessionStorage.getItem('s')) { localStorage.clear(); localStorage.setItem('prismburst.save.v1', raw); localStorage.setItem('prismburst.profile.v1', JSON.stringify({ name: 'PrismPilot' })); sessionStorage.setItem('s', '1'); } }, SAVE);
  const page = await ctx.newPage();
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
  await sleep(1500);
  await page.evaluate(() => { const sm = PB.game.scene; if (sm.isActive('HomePop')) sm.stop('HomePop'); });
  await sleep(500);
  const shot = async name => { await page.screenshot({ path: path.join(OUT, 'screenshots', name) }); };
  await shot('01-home.png');

  // Gameplay: start a real level, launch, let it play briefly.
  await page.evaluate(() => __PB.start(1, 8));
  await page.waitForFunction(() => __PB.scenes().includes('Game'), null, { timeout: 8000 });
  await sleep(1200);
  await page.evaluate(() => { const g = PB.currentGame; if (g && g.launch) g.launch(); });
  for (let i = 0; i < 30; i++) {
    await sleep(100);
    await page.evaluate(() => { const g = PB.currentGame; if (!g || !g.balls) return; const b = g.balls.find(x => x.active); if (b) g.paddle.x = Math.max(80, Math.min(640, b.x)); });
  }
  await shot('02-gameplay.png');

  // Prism Shop.
  await page.evaluate(() => {
    const sm = PB.game.scene; sm.getScenes(true).forEach(s => sm.stop(s.scene.key)); sm.start('Menu');
  });
  await page.waitForFunction(() => __PB.scenes().includes('Menu'), null, { timeout: 8000 });
  await sleep(1000);
  await page.evaluate(() => {
    PB.game.scene.stop('HomePop');
    PB.Home.mode = { type: 'one', items: ['shop'], index: 0 };
    const m = PB.game.scene.getScene('Menu'); m.scene.launch('HomePop'); m.scene.bringToTop('HomePop');
  });
  await sleep(1200);
  await shot('03-prism-shop.png');
  await page.evaluate(() => { const s = PB.game.scene.getScene('HomePop'); s.shopTab = 'looks'; s.render(); });
  await sleep(600);
  await shot('04-prism-shop-looks.png');
  await page.evaluate(() => PB.game.scene.stop('HomePop'));

  // Levels map.
  await page.evaluate(() => { const sm = PB.game.scene; sm.getScenes(true).forEach(s => sm.stop(s.scene.key)); sm.start('Levels', { world: 1 }); });
  await sleep(1200);
  await shot('05-levels.png');

  // Login popup.
  await page.evaluate(() => { const sm = PB.game.scene; sm.getScenes(true).forEach(s => sm.stop(s.scene.key)); sm.start('Menu'); });
  await sleep(1200);
  await page.evaluate(() => { PB.game.scene.stop('HomePop'); PB.Cloud.errorText = ''; PB.Account.open('auth'); });
  await sleep(600);
  await shot('06-login.png');
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await renderSvgRgba(browser, iconSvg(), 512, 512, path.join(OUT, 'icon-512.png'));
    await renderSvg(browser, featureSvg(), 1024, 500, path.join(OUT, 'feature-graphic-1024x500.png'));
    if (process.argv.indexOf('--art-only') < 0) await shots(browser);
  } finally {
    await browser.close();
  }
  console.log('store graphics written to ' + OUT);
})();
