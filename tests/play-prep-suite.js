/* TEST-ONLY. Firebase mock: Settings footer, delete account, privacy. Live: 0. */
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
    const port = server.address().port;
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.PB && PB.Cloud && PB.Cloud.readySettled, null, { timeout: 20000 });

    const ver = await page.evaluate(() => PB.VERSION);
    record('app version is 1.5.0', ver === '1.5.0', ver);

    await page.evaluate(() => {
      localStorage.setItem('prismburst.save.v1', JSON.stringify({ v: 1, coins: 15, unlocked: [1,0,0,0,0], levels: {}, owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' }, settings: { sound: true, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] }, stats: { bricks: 0, played: 0, cleared: 0 }, last: null }));
      PB.Save.load();
      PB.Account.open();
      PB.Account.setTab('login');
    });
    await page.fill('#pb-email-input', 'ali@example.com');
    await page.fill('#pb-password-input', 'secret12');
    await page.click('[data-action="login"]');
    await sleep(700);
    await page.evaluate(() => { if (PB.Cloud.pending) return PB.Cloud.choose('device'); });
    await sleep(400);

    const del = await page.evaluate(async () => {
      const before = localStorage.getItem('prismburst.save.v1');
      const ok = await PB.Cloud.deleteAccount('DELETE');
      return { ok, before, after: localStorage.getItem('prismburst.save.v1'), msg: PB.Cloud.errorText, signed: PB.Cloud.snapshot().signedIn };
    });
    record('delete account removes cloud user and keeps device save', del.ok && del.before === del.after && /deleted/i.test(del.msg) && !del.signed, del);

    // Privacy + delete pages mention Firebase
    const privacy = await page.goto('http://127.0.0.1:' + port + '/privacy-policy.html');
    const privacyText = await page.textContent('body');
    record('privacy policy names Firebase/Google', /Firebase/i.test(privacyText) && !/Supabase Auth/i.test(privacyText));

    await page.goto('http://127.0.0.1:' + port + '/delete-account.html');
    const delText = await page.textContent('body');
    record('delete-account page names Firebase hosting backups', /Firebase/i.test(delText));
    record('delete-account loads without supabase script', !(await page.content()).includes('supabase.min.js'));

    await ctx.close();
  } catch (e) {
    record('play-prep crashed', false, e.stack || String(e));
  } finally {
    await browser.close();
    server.close();
  }
  const passed = results.filter(r => r.pass).length;
  console.log('\n' + passed + '/' + results.length + ' passed (mock)');
  console.log('live: 0/0 NOT VERIFIED');
  if (passed !== results.length) process.exit(1);
})();
