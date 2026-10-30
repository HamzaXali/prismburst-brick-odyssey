/* TEST-ONLY. Firebase mock: login popup, forgot password, Facebook off, shop. Live: 0. */
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium, devices } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const mock = require('./mock-firebase');
const ROOT = path.join(__dirname, '..');
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail && !pass ? ' — ' + JSON.stringify(detail) : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function startServer() {
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const file = path.join(ROOT, urlPath.replace(/^\//, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('missing'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const state = mock.createState();
    const ctx = await browser.newContext(Object.assign({}, devices['Pixel 5'], { serviceWorkers: 'block' }));
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    await page.route(/googleapis\.com|identitytoolkit|securetoken|firebaseio/, r => r.abort());
    await page.addInitScript(new Function('state', '(' + mock.installMockSource() + ')(state);'), state);
    await page.route('**/js/firebase-config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: mock.configBody() }));
    await page.route('**/lib/firebase-*.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/*m*/' }));
    await page.goto('http://127.0.0.1:' + server.address().port + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.PB && PB.Cloud && PB.Cloud.readySettled, null, { timeout: 20000 });

    await page.evaluate(() => PB.Account.open());
    const popup = await page.evaluate(() => ({
      auth: !document.getElementById('pb-view-auth').hidden,
      guest: !!document.querySelector('[data-action="guest"]'),
      google: !!document.querySelector('[data-action="google"]'),
      facebook: !!document.querySelector('[data-action="facebook"]'),
      fbEnabled: PB.Cloud.providerEnabled('facebook')
    }));
    record('login popup shows guest, google, facebook (disabled)', popup.auth && popup.guest && popup.google && popup.facebook && !popup.fbEnabled, popup);

    await page.evaluate(() => { PB.Account.setTab('signup'); });
    await page.fill('#pb-email-input', 'pilot@example.com');
    await page.fill('#pb-password-input', 'secret12');
    await page.fill('#pb-password2-input', 'secret12');
    // existing via create then exists path: pre-seed
    await page.evaluate(() => {
      window.__PB_MOCK_STATE.users['pilot@example.com'] = { uid: 'p1', email: 'pilot@example.com', password: 'secret12', emailVerified: true, providerData: [{ providerId: 'password' }] };
    });
    await page.click('[data-action="signup"]');
    await sleep(500);
    const exists = await page.evaluate(() => ({
      tab: PB.Account.tab, email: document.getElementById('pb-email-input').value,
      outcome: PB.Cloud.lastSignupOutcome, msg: PB.Cloud.errorText
    }));
    record('existing email on signup switches to login prefilled', exists.tab === 'login' && exists.email === 'pilot@example.com' && exists.outcome === 'exists', exists);

    await page.click('[data-action="forgot"]');
    await sleep(200);
    await page.fill('#pb-forgot-email', 'ali@example.com');
    await page.click('[data-action="send-reset"]');
    await sleep(400);
    const reset = await page.evaluate(() => ({ msg: PB.Cloud.errorText, sent: window.__PB_MOCK_STATE.lastReset }));
    record('forgot password sends Firebase reset email', /Password reset email sent/i.test(reset.msg) && reset.sent === 'ali@example.com', reset);

    await page.evaluate(() => {
      PB.Cloud.recovery = true;
      PB.Cloud.recoveryOobCode = 'test-oob';
    });
    await page.evaluate(() => PB.Cloud.updatePassword('newpass99', 'newpass99'));
    await sleep(400);
    const updated = await page.evaluate(() => ({ msg: PB.Cloud.errorText, conf: window.__PB_MOCK_STATE.lastConfirmReset }));
    record('password update via oobCode works', /Password updated/i.test(updated.msg) && updated.conf && updated.conf.password === 'newpass99', updated);

    await page.evaluate(() => { PB.Cloud.errorText = ''; PB.Cloud.signInOAuth('facebook'); });
    const fb = await page.evaluate(() => PB.Cloud.errorText);
    record('Facebook stays off with friendly message', /coming soon|Not set up/i.test(fb), fb);

    // Shop still renders (no crash)
    const shop = await page.evaluate(() => !!(PB.Shop && typeof PB.Shop.catalog === 'function' || PB.Shop));
    record('shop module still present after auth migration', !!shop);

    // local save never cleared through forgot flow
    await page.evaluate(() => {
      localStorage.setItem('prismburst.save.v1', JSON.stringify({ v: 1, coins: 8, unlocked: [1,0,0,0,0], levels: {}, owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' }, settings: { sound: true, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] }, stats: { bricks: 0, played: 0, cleared: 0 }, last: null }));
    });
    await page.evaluate(() => PB.Cloud.forgotEmail('ali@example.com'));
    await sleep(300);
    const kept = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
    record('forgot password never clears local save', /"coins":8/.test(kept || ''));

    await ctx.close();
  } catch (e) {
    record('auth-shop crashed', false, e.stack || String(e));
  } finally {
    await browser.close();
    server.close();
  }
  const passed = results.filter(r => r.pass).length;
  console.log('\n' + passed + '/' + results.length + ' passed (mock)');
  console.log('live: 0/0 NOT VERIFIED');
  if (passed !== results.length) process.exit(1);
})();
