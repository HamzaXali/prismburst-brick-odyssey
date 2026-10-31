/*
 * TEST-ONLY. Mocks Firebase Auth + Firestore in the browser via an injected SDK.
 * The shipped game has no fake auth path. Live Firebase is NOT VERIFIED (0 live).
 */
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
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail && !pass ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function startServer() {
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };
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

async function boot(browser, server, state, providers) {
  const port = server.address().port;
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 5'], { serviceWorkers: 'block' }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  // Block any real Google/Firebase network
  await page.route(/googleapis\.com|firebaseio\.com|firebaseapp\.com|identitytoolkit|securetoken/, route => route.abort());
  await page.addInitScript(new Function('state', '(' + mock.installMockSource() + ')(state);'), state);
  await page.route('**/js/firebase-config.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: mock.configBody(providers) }));
  await page.route('**/config.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* providers in firebase-config route */' }));
  // Skip real firebase SDK; mock already installed
  await page.route('**/lib/firebase-*.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* mocked */' }));
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PB && PB.Cloud && PB.Cloud.readySettled, null, { timeout: 15000 });
  return { ctx, page, port };
}

function legacyObject() {
  return {
    v: 1, coins: 230, unlocked: [3, 1, 0, 0, 0],
    levels: { '0-0': { best: 12000, stars: 3 }, '0-1': { best: 8000, stars: 2 } },
    owned: { ball: ['classic', 'rose'], paddle: ['classic'] },
    equipped: { ball: 'rose', paddle: 'classic' },
    settings: { sound: true, vibration: false, shake: true },
    daily: { last: '2026-01-02', streak: 2 },
    missions: { date: null, list: [] },
    stats: { bricks: 40, played: 4, cleared: 3 },
    last: { world: 0, level: 1 }
  };
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    // 1. Placeholder config -> guest mode
    {
      const state = mock.createState();
      const ctx = await browser.newContext(Object.assign({}, devices['Pixel 5'], { serviceWorkers: 'block' }));
      const page = await ctx.newPage();
      await page.addInitScript(new Function('state', '(' + mock.installMockSource() + ')(state);'), state);
      await page.route('**/js/firebase-config.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: mock.emptyConfigBody() }));
      await page.route('**/lib/firebase-*.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* mocked */' }));
      await page.goto('http://127.0.0.1:' + server.address().port + '/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.PB && PB.Cloud && PB.Cloud.readySettled, null, { timeout: 20000 });
      const snap = await page.evaluate(() => {
        localStorage.setItem('prismburst.save.v1', JSON.stringify({ v: 1, coins: 5, unlocked: [1,0,0,0,0], levels: {}, owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' }, settings: { sound: true, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] }, stats: { bricks: 0, played: 0, cleared: 0 }, last: null }));
        PB.Save.load();
        return { signed: PB.Cloud.snapshot().signedIn, hasCred: PB.Cloud.hasCredentials(), save: localStorage.getItem('prismburst.save.v1') };
      });
      await page.evaluate(() => { if (PB.Account && PB.Account.open) PB.Account.open(); });
      await page.evaluate(() => { PB.Cloud.signInOAuth('google'); });
      const msg = await page.evaluate(() => PB.Cloud.errorText || '');
      record('placeholder config stays guest/local and shows cloud not set up', !snap.signed && !snap.hasCred && !!snap.save && /Cloud save not set up yet/i.test(msg), { msg, snap });
      const after = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      record('placeholder mode never clears local save', after === snap.save);
      await ctx.close();
    }

    // 2. Email signup exists -> login tab
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate(() => {
        localStorage.setItem('prismburst.save.v1', JSON.stringify({ v: 1, coins: 11, unlocked: [2,0,0,0,0], levels: {}, owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' }, settings: { sound: true, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] }, stats: { bricks: 0, played: 0, cleared: 0 }, last: null }));
        PB.Save.load();
        PB.Account.open();
        PB.Account.setTab('signup');
      });
      await page.fill('#pb-email-input', 'ali@example.com');
      await page.fill('#pb-password-input', 'secret12');
      await page.fill('#pb-password2-input', 'secret12');
      await page.click('[data-action="signup"]');
      await sleep(400);
      const existsUi = await page.evaluate(() => ({
        tab: PB.Account.tab,
        title: document.querySelector('#pb-auth-title') ? document.querySelector('#pb-auth-title').textContent : '',
        email: document.getElementById('pb-email-input').value,
        password: document.getElementById('pb-password-input').value,
        outcome: PB.Cloud.lastSignupOutcome,
        msg: PB.Cloud.errorText,
        save: localStorage.getItem('prismburst.save.v1')
      }));
      record('email-already-in-use switches to login with email prefilled',
        existsUi.outcome === 'exists' && existsUi.tab === 'login' && existsUi.email === 'ali@example.com' && existsUi.password === '' && /already has an account/i.test(existsUi.msg),
        existsUi);
      record('exists signup does not clear local save', /"coins":11/.test(existsUi.save || ''));
      await ctx.close();
    }

    // 3. Fresh signup -> confirm pending, local save kept
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate(() => {
        localStorage.setItem('prismburst.save.v1', JSON.stringify({ v: 1, coins: 3, unlocked: [1,0,0,0,0], levels: {}, owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' }, settings: { sound: true, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] }, stats: { bricks: 0, played: 0, cleared: 0 }, last: null }));
        PB.Save.load();
        PB.Account.open();
        PB.Account.setTab('signup');
      });
      await page.fill('#pb-email-input', 'newbie@example.com');
      await page.fill('#pb-password-input', 'secret12');
      await page.fill('#pb-password2-input', 'secret12');
      await page.click('[data-action="signup"]');
      await sleep(900);
      const out = await page.evaluate(() => ({
        outcome: PB.Cloud.lastSignupOutcome,
        pending: PB.Cloud.pendingConfirmEmail,
        signed: PB.Cloud.snapshot().signedIn,
        msg: PB.Cloud.errorText,
        save: localStorage.getItem('prismburst.save.v1'),
        verify: window.__PB_MOCK_STATE.lastVerification
      }));
      record('new email signup sends verification and stays signed out',
        out.outcome === 'confirm' && out.pending === 'newbie@example.com' && !out.signed && /confirmation email/i.test(out.msg) && out.verify === 'newbie@example.com', out);
      record('signup does not clear local save', /"coins":3/.test(out.save || ''));
      await ctx.close();
    }

    // 4. Login + cloud save merge / sync
    {
      const state = mock.createState();
      const remote = legacyObject();
      state.saves[mock.USER_A] = {
        data: { save_version: 1, client_updated_at: '2026-01-01T00:00:00.000Z', ...(() => {
          // cloud envelope via save-sync shape approx
          return null;
        })() },
        revision: 2,
        client_updated_at: '2026-01-01T00:00:00.000Z'
      };
      // Build proper cloud data in page after load
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate((uid) => {
        const save = {
          v: 1, coins: 10, unlocked: [3, 0, 0, 0, 0], levels: { '0-0': { best: 100, stars: 1 } },
          owned: { ball: ['classic', 'rose'], paddle: ['classic'] }, equipped: { ball: 'rose', paddle: 'classic' },
          settings: { sound: false, vibration: true, shake: true }, daily: { last: null, streak: 0 },
          missions: { date: null, list: [] }, stats: { bricks: 5, played: 2, cleared: 1 }, last: { world: 0, level: 1 }
        };
        localStorage.setItem('prismburst.save.v1', JSON.stringify(save));
        localStorage.setItem('prismburst.cloud.meta.v1', JSON.stringify({ lastUserId: null, clientUpdatedAt: '2026-06-01T00:00:00.000Z', knownRevision: null, queue: null }));
        PB.Save.load();
        const cloud = PB.SaveSync.toCloudData(save, '2026-06-01T00:00:00.000Z');
        // put a different remote
        const remoteSave = JSON.parse(JSON.stringify(save));
        remoteSave.coins = 99;
        remoteSave.unlocked = [1, 2, 0, 0, 0];
        window.__PB_MOCK_STATE.saves[uid] = {
          data: PB.SaveSync.toCloudData(remoteSave, '2026-01-01T00:00:00.000Z'),
          revision: 2,
          client_updated_at: '2026-01-01T00:00:00.000Z',
          save_version: 1
        };
        PB.Account.open();
        PB.Account.setTab('login');
      }, mock.USER_A);
      await page.fill('#pb-email-input', 'ali@example.com');
      await page.fill('#pb-password-input', 'secret12');
      await page.click('[data-action="login"]');
      await sleep(800);
      const afterLogin = await page.evaluate(() => ({
        signed: PB.Cloud.snapshot().signedIn,
        sync: PB.Cloud.syncLabel,
        pending: PB.Cloud.pending,
        coins: PB.Save.data.coins,
        unlocked: PB.Save.data.unlocked,
        saveKey: localStorage.getItem('prismburst.save.v1') != null
      }));
      record('email login signs in without clearing local save', afterLogin.signed && afterLogin.saveKey, afterLogin);
      if (afterLogin.pending) {
        await page.click('[data-choice="merge"]');
        await sleep(600);
      } else {
        await sleep(400);
      }
      const merged = await page.evaluate(() => ({
        coins: PB.Save.data.coins,
        unlocked: PB.Save.data.unlocked.slice(),
        sync: PB.Cloud.syncLabel,
        revision: JSON.parse(localStorage.getItem('prismburst.cloud.meta.v1') || '{}').knownRevision
      }));
      record('merge keeps higher unlocks and newer local coins',
        merged.unlocked[0] === 3 && merged.unlocked[1] === 2 && merged.coins === 10 && (merged.sync === 'Synced' || merged.sync === 'Sync pending'),
        merged);
      await ctx.close();
    }

    // 5. Deep-link Google credential path
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate(() => {
        localStorage.setItem('prismburst.save.v1', JSON.stringify({ v: 1, coins: 7, unlocked: [1,0,0,0,0], levels: {}, owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' }, settings: { sound: true, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] }, stats: { bricks: 0, played: 0, cleared: 0 }, last: null }));
        PB.Save.load();
        // Simulate native bridge state + deep link
        const stateTok = 'abc123state';
        sessionStorage.setItem('prismburst.auth.bridge.v1', JSON.stringify({ state: stateTok, nonce: 'n1', at: Date.now() }));
        window.Capacitor = {
          isNativePlatform: function () { return true; },
          Plugins: {
            App: { addListener: function () { return { remove: function () {} }; } },
            Browser: { open: function () { return Promise.resolve(); }, close: function () { return Promise.resolve(); }, addListener: function () { return { remove: function () {} }; } },
            OpenUrl: { open: function () { return Promise.resolve(); } }
          }
        };
      });
      // Re-init native listener is already attached if isNative was true at init — force handle
      const handled = await page.evaluate(() => {
        const before = localStorage.getItem('prismburst.save.v1');
        PB.Cloud._nativeAuthState = 'abc123state';
        PB.Cloud.handleNativeAuthUrl('com.prismburst.brickodyssey://auth#id_token=fake-id-token&state=abc123state');
        return new Promise(function (resolve) {
          setTimeout(function () {
            resolve({
              signed: PB.Cloud.snapshot().signedIn,
              provider: PB.Cloud.providerName(),
              save: localStorage.getItem('prismburst.save.v1'),
              before: before,
              creds: window.__PB_MOCK_STATE.credentialLog,
              err: PB.Cloud.errorText
            });
          }, 400);
        });
      });
      record('deep-link id_token signs in via credential and never clears save',
        handled.signed && handled.provider === 'google' && handled.save === handled.before && handled.creds.some(c => c.hasIdToken),
        handled);
      const bad = await page.evaluate(() => {
        sessionStorage.setItem('prismburst.auth.bridge.v1', JSON.stringify({ state: 'good', nonce: 'n', at: Date.now() }));
        const saveBefore = localStorage.getItem('prismburst.save.v1');
        PB.Cloud.handleNativeAuthUrl('com.prismburst.brickodyssey://auth#id_token=x&state=bad');
        return { signed: PB.Cloud.snapshot().signedIn, err: PB.Cloud.errorText, save: localStorage.getItem('prismburst.save.v1'), saveBefore: saveBefore };
      });
      record('deep-link with bad state is rejected and save kept', /could not be verified/i.test(bad.err || '') && bad.save === bad.saveBefore, bad);
      await ctx.close();
    }

    // 6. Logout / auth error never clears save; wrong password message
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate(() => {
        localStorage.setItem('prismburst.save.v1', JSON.stringify({ v: 1, coins: 42, unlocked: [1,0,0,0,0], levels: {}, owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' }, settings: { sound: true, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] }, stats: { bricks: 0, played: 0, cleared: 0 }, last: null }));
        PB.Save.load();
        PB.Account.open();
      });
      await page.fill('#pb-email-input', 'ali@example.com');
      await page.fill('#pb-password-input', 'wrong-pass');
      await page.click('[data-action="login"]');
      await sleep(400);
      const wrong = await page.evaluate(() => ({ msg: PB.Cloud.errorText, save: localStorage.getItem('prismburst.save.v1') }));
      record('wrong-password is friendly and keeps save', /incorrect/i.test(wrong.msg) && /"coins":42/.test(wrong.save || ''), wrong);

      await page.fill('#pb-password-input', 'secret12');
      await page.click('[data-action="login"]');
      await sleep(600);
      await page.evaluate(() => PB.Cloud.logout());
      await sleep(400);
      const afterOut = await page.evaluate(() => ({ signed: PB.Cloud.snapshot().signedIn, save: localStorage.getItem('prismburst.save.v1'), msg: PB.Cloud.errorText }));
      record('logout keeps local save', !afterOut.signed && /"coins":42/.test(afterOut.save || '') && /Signed out/i.test(afterOut.msg || ''), afterOut);
      await ctx.close();
    }

    // 7. Escaping: display name uses textContent
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate(() => {
        PB.Account.open();
        PB.Account.setTab('login');
      });
      await page.fill('#pb-email-input', 'ali@example.com');
      await page.fill('#pb-password-input', 'secret12');
      await page.click('[data-action="login"]');
      await sleep(700);
      await page.evaluate(() => {
        if (PB.Cloud.pending) PB.Cloud.choose('device');
      });
      await sleep(400);
      const nameResult = await page.evaluate(() => {
        return PB.Cloud.saveDisplayName('<img src=x onerror=alert(1)>').then(function () {
          const note = PB.Cloud.nameNote;
          const root = document.getElementById('pb-account') || document.getElementById('pb-overlay') || document.body;
          const html = root ? root.innerHTML : '';
          return { note: note, leaked: /onerror\s*=/.test(html), display: PB.Cloud.accountName };
        });
      });
      record('markup display name is rejected and not injected as HTML',
        /not allowed|characters/i.test(nameResult.note || '') && nameResult.display == null && !nameResult.leaked,
        nameResult);
      await ctx.close();
    }

    // 8. Backoff helper exposed
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      const bo = await page.evaluate(() => ({
        d1: PB.Cloud._test.backoffDelay(1),
        d2: PB.Cloud._test.backoffDelay(2),
        cap: PB.Cloud._test.backoffDelay(20),
        max: PB.Cloud._test.MAX_BACKOFF_MS
      }));
      record('capped exponential backoff is wired', bo.d1 === 250 && bo.d2 === 500 && bo.cap === bo.max && bo.max === 8000, bo);
      await ctx.close();
    }

    // 9. Facebook stays disabled
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state, { email: true, google: true, facebook: false });
      await page.evaluate(() => PB.Account.open());
      const fb = await page.evaluate(() => {
        PB.Cloud.signInOAuth('facebook');
        return { enabled: PB.Cloud.providerEnabled('facebook'), msg: PB.Cloud.errorText };
      });
      record('Facebook login stays disabled', !fb.enabled && /coming soon|Not set up/i.test(fb.msg || 'coming soon'), fb);
      await ctx.close();
    }

  } catch (err) {
    record('cloud-suite crashed', false, err.stack || String(err));
  } finally {
    await browser.close();
    server.close();
  }
  const passed = results.filter(r => r.pass).length;
  console.log('\n' + passed + '/' + results.length + ' passed (mock)');
  console.log('live: 0/0 (no Firebase project yet) NOT VERIFIED');
  if (passed !== results.length) process.exit(1);
})();
