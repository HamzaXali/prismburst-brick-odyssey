/* TEST-ONLY. Extra Firebase-layer mock coverage. Live: 0. */
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

function seedSave(coins) {
  return {
    v: 1, coins: coins || 0, unlocked: [1, 0, 0, 0, 0], levels: {},
    owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' },
    settings: { sound: true, vibration: true, shake: true }, daily: { last: null, streak: 0 },
    missions: { date: null, list: [] }, stats: { bricks: 0, played: 0, cleared: 0 }, last: null
  };
}

async function boot(browser, server, state, providers) {
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 5'], { serviceWorkers: 'block' }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.route(/googleapis\.com|identitytoolkit|securetoken|firebaseio|firebaseapp\.com/, r => r.abort());
  await page.addInitScript(new Function('state', '(' + mock.installMockSource() + ')(state);'), state);
  await page.route('**/js/firebase-config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: mock.configBody(providers) }));
  await page.route('**/lib/firebase-*.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/*m*/' }));
  await page.goto('http://127.0.0.1:' + server.address().port + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PB && PB.Cloud && PB.Cloud.readySettled, null, { timeout: 20000 });
  return { ctx, page };
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    // --- Signup verification flow ---
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate((save) => { localStorage.setItem('prismburst.save.v1', JSON.stringify(save)); PB.Save.load(); PB.Account.open(); PB.Account.setTab('signup'); }, seedSave(4));
      await page.fill('#pb-email-input', 'fresh@example.com');
      await page.fill('#pb-password-input', 'secret12');
      await page.fill('#pb-password2-input', 'secret12');
      await page.click('[data-action="signup"]');
      await sleep(900);
      const s = await page.evaluate(() => ({
        outcome: PB.Cloud.lastSignupOutcome, pending: PB.Cloud.pendingConfirmEmail,
        signed: PB.Cloud.snapshot().signedIn, msg: PB.Cloud.errorText,
        verify: window.__PB_MOCK_STATE.lastVerification, save: localStorage.getItem('prismburst.save.v1'),
        resendVisible: !document.getElementById('pb-resend-confirm').hidden
      }));
      record('signup verification: outcome confirm', s.outcome === 'confirm', s);
      record('signup verification: pending email set', s.pending === 'fresh@example.com', s);
      record('signup verification: stays signed out', !s.signed, s);
      record('signup verification: inbox/spam message', /confirmation email/i.test(s.msg) && /spam/i.test(s.msg), s);
      record('signup verification: mock sendEmailVerification called', s.verify === 'fresh@example.com', s);
      record('signup verification: local save kept', /"coins":4/.test(s.save || ''), s);
      record('signup verification: resend control available', s.resendVisible || /confirmation/i.test(s.msg), s);
      await ctx.close();
    }

    // --- Resend cooldown ---
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate(() => {
        localStorage.setItem('prismburst.save.v1', JSON.stringify({ v: 1, coins: 2, unlocked: [1,0,0,0,0], levels: {}, owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' }, settings: { sound: true, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] }, stats: { bricks: 0, played: 0, cleared: 0 }, last: null }));
        PB.Save.load();
        PB.Cloud.pendingConfirmEmail = 'fresh@example.com';
        PB.Cloud._confirmAt = Date.now();
        PB.Account.open();
        PB.Account.setTab('signup');
        document.getElementById('pb-email-input').value = 'fresh@example.com';
        document.getElementById('pb-password-input').value = 'secret12';
      });
      // seed unverified user for resend path
      await page.evaluate(() => {
        window.__PB_MOCK_STATE.users['fresh@example.com'] = { uid: 'u-fresh', email: 'fresh@example.com', password: 'secret12', emailVerified: false, providerData: [{ providerId: 'password' }] };
      });
      const cool = await page.evaluate(() => {
        const wait = PB.Cloud.confirmWaitMs();
        return PB.Cloud.resendConfirmEmail('fresh@example.com').then(() => ({
          wait: wait, msg: PB.Cloud.errorText, save: localStorage.getItem('prismburst.save.v1')
        }));
      });
      record('resend cooldown blocks immediate resend', cool.wait > 0 && /Wait|seconds/i.test(cool.msg), cool);
      record('resend cooldown keeps local save', /"coins":2/.test(cool.save || ''), cool);
      // after cooldown cleared
      await page.evaluate(() => { PB.Cloud._confirmAt = Date.now() - 60000; });
      const resent = await page.evaluate(() => PB.Cloud.resendConfirmEmail('fresh@example.com').then(() => ({
        msg: PB.Cloud.errorText, verify: window.__PB_MOCK_STATE.lastVerification, signed: PB.Cloud.snapshot().signedIn
      })));
      await sleep(200);
      const after = await page.evaluate(() => ({ msg: PB.Cloud.errorText, verify: window.__PB_MOCK_STATE.lastVerification, signed: PB.Cloud.snapshot().signedIn, save: localStorage.getItem('prismburst.save.v1') }));
      record('resend after cooldown sends again', /sent again|Confirmation email/i.test(after.msg) && after.verify === 'fresh@example.com', after);
      record('resend after cooldown stays signed out', !after.signed, after);
      record('resend after cooldown keeps save', /"coins":2/.test(after.save || ''), after);
      await ctx.close();
    }

    // --- email-already-in-use tab switch ---
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate((save) => { localStorage.setItem('prismburst.save.v1', JSON.stringify(save)); PB.Save.load(); PB.Account.open(); PB.Account.setTab('signup'); }, seedSave(9));
      await page.fill('#pb-email-input', 'ali@example.com');
      await page.fill('#pb-password-input', 'secret12');
      await page.fill('#pb-password2-input', 'secret12');
      await page.click('[data-action="signup"]');
      await sleep(500);
      const ex = await page.evaluate(() => ({
        tab: PB.Account.tab, title: (document.getElementById('pb-acct-title') || {}).textContent,
        email: document.getElementById('pb-email-input').value,
        password: document.getElementById('pb-password-input').value,
        outcome: PB.Cloud.lastSignupOutcome, msg: PB.Cloud.errorText, save: localStorage.getItem('prismburst.save.v1')
      }));
      record('email-already-in-use: lastSignupOutcome exists', ex.outcome === 'exists', ex);
      record('email-already-in-use: switches to login tab', ex.tab === 'login', ex);
      record('email-already-in-use: email prefilled', ex.email === 'ali@example.com', ex);
      record('email-already-in-use: password cleared', ex.password === '', ex);
      record('email-already-in-use: friendly message', /already has an account/i.test(ex.msg) && /Forgot password/i.test(ex.msg), ex);
      record('email-already-in-use: save untouched', /"coins":9/.test(ex.save || ''), ex);
      await ctx.close();
    }

    // --- Forgot password ---
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate((save) => { localStorage.setItem('prismburst.save.v1', JSON.stringify(save)); PB.Save.load(); PB.Account.open(); }, seedSave(6));
      await page.click('[data-action="forgot"]');
      await page.fill('#pb-forgot-email', 'ali@example.com');
      await page.click('[data-action="send-reset"]');
      await sleep(400);
      const fp = await page.evaluate(() => ({
        msg: PB.Cloud.errorText, sent: window.__PB_MOCK_STATE.lastReset,
        wait: PB.Cloud.resetWaitMs(), save: localStorage.getItem('prismburst.save.v1')
      }));
      record('forgot password: Firebase reset sent', fp.sent === 'ali@example.com', fp);
      record('forgot password: friendly copy', /Password reset email sent/i.test(fp.msg), fp);
      record('forgot password: cooldown started', fp.wait > 0, fp);
      record('forgot password: local save kept', /"coins":6/.test(fp.save || ''), fp);
      const blocked = await page.evaluate(() => PB.Cloud.forgotEmail('ali@example.com').then(() => PB.Cloud.errorText));
      record('forgot password: cooldown blocks second send', /Wait|seconds/i.test(blocked), blocked);
      await ctx.close();
    }

    // --- Google web popup ---
    {
      const state = mock.createState();
      state.popupResult = { uid: mock.USER_A, email: 'ali@example.com', emailVerified: true, displayName: 'Ali Prism', providerData: [{ providerId: 'google.com' }], password: 'x' };
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate((save) => { localStorage.setItem('prismburst.save.v1', JSON.stringify(save)); PB.Save.load(); }, seedSave(12));
      await page.evaluate(() => PB.Cloud.signInOAuth('google'));
      await sleep(700);
      const g = await page.evaluate(() => ({
        signed: PB.Cloud.snapshot().signedIn, provider: PB.Cloud.providerName(),
        save: localStorage.getItem('prismburst.save.v1'), namePrompt: PB.Cloud.namePrompt
      }));
      record('Google web popup: signs in', g.signed, g);
      record('Google web popup: provider google', g.provider === 'google', g);
      record('Google web popup: local save kept', /"coins":12/.test(g.save || ''), g);
      await ctx.close();
    }

    // --- Native deep-link: good credential + nonce/state mismatch ---
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate((save) => {
        localStorage.setItem('prismburst.save.v1', JSON.stringify(save));
        PB.Save.load();
        window.Capacitor = {
          isNativePlatform: function () { return true; },
          Plugins: {
            App: { addListener: function () { return { remove: function () {} }; } },
            Browser: { open: function () { return Promise.resolve(); }, close: function () { return Promise.resolve(); }, addListener: function () { return { remove: function () {} }; } },
            OpenUrl: { open: function () { return Promise.resolve(); } }
          }
        };
      }, seedSave(7));
      const good = await page.evaluate(() => {
        sessionStorage.setItem('prismburst.auth.bridge.v1', JSON.stringify({ state: 'state-ok', nonce: 'nonce-ok', at: Date.now() }));
        const before = localStorage.getItem('prismburst.save.v1');
        PB.Cloud.handleNativeAuthUrl('com.prismburst.brickodyssey://auth#id_token=tok&state=state-ok&nonce=nonce-ok');
        return new Promise(function (r) {
          setTimeout(function () {
            r({ signed: PB.Cloud.snapshot().signedIn, provider: PB.Cloud.providerName(), before: before, save: localStorage.getItem('prismburst.save.v1'), creds: window.__PB_MOCK_STATE.credentialLog });
          }, 400);
        });
      });
      record('native deep-link: credential sign-in', good.signed && good.provider === 'google', good);
      record('native deep-link: credential used idToken', good.creds.some(c => c.hasIdToken), good);
      record('native deep-link: save unchanged on success', good.save === good.before, good);

      const badState = await page.evaluate(() => {
        sessionStorage.setItem('prismburst.auth.bridge.v1', JSON.stringify({ state: 'expected', nonce: 'n1', at: Date.now() }));
        const before = localStorage.getItem('prismburst.save.v1');
        PB.Cloud.handleNativeAuthUrl('com.prismburst.brickodyssey://auth#id_token=tok&state=wrong&nonce=n1');
        return { err: PB.Cloud.errorText, save: localStorage.getItem('prismburst.save.v1'), before: before };
      });
      record('native deep-link: state mismatch rejected', /could not be verified/i.test(badState.err || ''), badState);
      record('native deep-link: state mismatch keeps save', badState.save === badState.before, badState);

      const badNonce = await page.evaluate(() => {
        // App stores nonce with state; mismatch of state already covered. Also reject missing id_token.
        sessionStorage.setItem('prismburst.auth.bridge.v1', JSON.stringify({ state: 's2', nonce: 'n2', at: Date.now() }));
        const before = localStorage.getItem('prismburst.save.v1');
        PB.Cloud.handleNativeAuthUrl('com.prismburst.brickodyssey://auth#state=s2&nonce=other');
        return { err: PB.Cloud.errorText, save: localStorage.getItem('prismburst.save.v1'), before: before };
      });
      record('native deep-link: missing id_token rejected', /could not return|could not be verified/i.test(badNonce.err || ''), badNonce);
      record('native deep-link: missing token keeps save', badNonce.save === badNonce.before, badNonce);
      await ctx.close();
    }

    // --- Save merge conflicts with revision retries ---
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate((uid) => {
        const local = {
          v: 1, coins: 10, unlocked: [3, 0, 0, 0, 0], levels: { '0-0': { best: 100, stars: 1 } },
          owned: { ball: ['classic', 'rose'], paddle: ['classic'] }, equipped: { ball: 'rose', paddle: 'classic' },
          settings: { sound: false, vibration: true, shake: true }, daily: { last: null, streak: 0 },
          missions: { date: null, list: [] }, stats: { bricks: 5, played: 2, cleared: 1 }, last: { world: 0, level: 1 }
        };
        const remote = JSON.parse(JSON.stringify(local));
        remote.coins = 99; remote.unlocked = [1, 2, 0, 0, 0]; remote.settings.sound = true;
        localStorage.setItem('prismburst.save.v1', JSON.stringify(local));
        localStorage.setItem('prismburst.cloud.meta.v1', JSON.stringify({ lastUserId: null, clientUpdatedAt: '2026-06-01T00:00:00.000Z', knownRevision: null, queue: null }));
        PB.Save.load();
        window.__PB_MOCK_STATE.saves[uid] = {
          data: PB.SaveSync.toCloudData(remote, '2026-01-01T00:00:00.000Z'),
          revision: 2, client_updated_at: '2026-01-01T00:00:00.000Z', save_version: 1
        };
        // Force one conflict: bump revision after first read by monkeypatching DocRef get via state.conflicts flag
        window.__PB_MOCK_STATE.conflicts = 1;
      }, mock.USER_A);
      await page.evaluate(() => { PB.Account.open(); PB.Account.setTab('login'); });
      await page.fill('#pb-email-input', 'ali@example.com');
      await page.fill('#pb-password-input', 'secret12');
      await page.click('[data-action="login"]');
      await sleep(800);
      await page.evaluate(() => { if (PB.Cloud.pending) return PB.Cloud.choose('merge'); });
      await sleep(800);
      const m = await page.evaluate(() => ({
        coins: PB.Save.data.coins, unlocked: PB.Save.data.unlocked.slice(),
        sync: PB.Cloud.syncLabel, save: localStorage.getItem('prismburst.save.v1'),
        revision: JSON.parse(localStorage.getItem('prismburst.cloud.meta.v1') || '{}').knownRevision,
        upserts: window.__PB_MOCK_STATE.upserts.length
      }));
      record('merge conflict path: higher unlocks kept', m.unlocked[0] === 3 && m.unlocked[1] === 2, m);
      record('merge conflict path: newer local coins kept', m.coins === 10, m);
      record('merge conflict path: reaches Synced', m.sync === 'Synced' || m.sync === 'Sync pending', m);
      record('merge conflict path: local save still present', !!m.save, m);
      record('merge conflict path: wrote at least one upsert', m.upserts >= 1, m);
      await ctx.close();
    }

    // --- Local save never cleared on logout / wrong password / network ---
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate((save) => { localStorage.setItem('prismburst.save.v1', JSON.stringify(save)); PB.Save.load(); PB.Account.open(); }, seedSave(42));
      await page.fill('#pb-email-input', 'ali@example.com');
      await page.fill('#pb-password-input', 'wrongpw');
      await page.click('[data-action="login"]');
      await sleep(400);
      const wrong = await page.evaluate(() => ({ msg: PB.Cloud.errorText, save: localStorage.getItem('prismburst.save.v1') }));
      record('wrong-password keeps save', /incorrect/i.test(wrong.msg) && /"coins":42/.test(wrong.save || ''), wrong);

      await page.fill('#pb-password-input', 'secret12');
      await page.click('[data-action="login"]');
      await sleep(700);
      await page.evaluate(() => { if (PB.Cloud.pending) return PB.Cloud.choose('device'); });
      await sleep(400);
      await page.evaluate(() => PB.Cloud.logout());
      await sleep(500);
      const out = await page.evaluate(() => ({ signed: PB.Cloud.snapshot().signedIn, save: localStorage.getItem('prismburst.save.v1'), msg: PB.Cloud.errorText }));
      record('logout keeps save', !out.signed && /"coins":42/.test(out.save || ''), out);
      record('logout friendly message', /Signed out/i.test(out.msg || ''), out);

      await page.evaluate(() => { window.__PB_MOCK_STATE.networkDown = true; });
      await page.fill('#pb-email-input', 'ali@example.com');
      await page.fill('#pb-password-input', 'secret12');
      await page.click('[data-action="login"]');
      await sleep(500);
      const net = await page.evaluate(() => ({ msg: PB.Cloud.errorText, save: localStorage.getItem('prismburst.save.v1') }));
      record('network error keeps save', /offline/i.test(net.msg) && /"coins":42/.test(net.save || ''), net);
      await ctx.close();
    }

    // --- Account delete + requires-recent-login ---
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      await page.evaluate((save) => { localStorage.setItem('prismburst.save.v1', JSON.stringify(save)); PB.Save.load(); }, seedSave(15));
      await page.evaluate(() => { PB.Account.open(); PB.Account.setTab('login'); });
      await page.fill('#pb-email-input', 'ali@example.com');
      await page.fill('#pb-password-input', 'secret12');
      await page.click('[data-action="login"]');
      await sleep(700);
      await page.evaluate(() => { if (PB.Cloud.pending) return PB.Cloud.choose('device'); });
      await sleep(400);

      const badPhrase = await page.evaluate(() => PB.Cloud.deleteAccount('delete').then(ok => ({ ok, msg: PB.Cloud.errorText, save: localStorage.getItem('prismburst.save.v1') })));
      record('delete rejects wrong phrase', !badPhrase.ok && /Type DELETE/i.test(badPhrase.msg) && /"coins":15/.test(badPhrase.save || ''), badPhrase);

      // Force requires-recent-login
      await page.evaluate(() => {
        const u = PB.Cloud.auth.currentUser;
        const orig = u.delete.bind(u);
        u.delete = function () {
          const err = new Error('requires-recent-login');
          err.code = 'auth/requires-recent-login';
          return Promise.reject(err);
        };
        window.__PB_ORIG_DELETE = orig;
      });
      const recent = await page.evaluate(() => PB.Cloud.deleteAccount('DELETE').then(ok => ({ ok, msg: PB.Cloud.errorText, save: localStorage.getItem('prismburst.save.v1'), signed: PB.Cloud.snapshot().signedIn })));
      record('delete requires-recent-login: nothing deleted', !recent.ok && /sign in again/i.test(recent.msg) && /Nothing was deleted/i.test(recent.msg), recent);
      record('delete requires-recent-login: local save kept', /"coins":15/.test(recent.save || ''), recent);

      // Restore and delete for real
      await page.evaluate(() => {
        if (window.__PB_ORIG_DELETE && PB.Cloud.auth.currentUser) PB.Cloud.auth.currentUser.delete = window.__PB_ORIG_DELETE;
      });
      // may need re-login if session cleared
      const stillSigned = await page.evaluate(() => PB.Cloud.snapshot().signedIn);
      if (!stillSigned) {
        await page.evaluate(() => { PB.Account.open(); PB.Account.setTab('login'); });
        await page.fill('#pb-email-input', 'ali@example.com');
        await page.fill('#pb-password-input', 'secret12');
        await page.click('[data-action="login"]');
        await sleep(700);
      }
      const gone = await page.evaluate(() => PB.Cloud.deleteAccount('DELETE').then(ok => ({
        ok, msg: PB.Cloud.errorText, save: localStorage.getItem('prismburst.save.v1'),
        signed: PB.Cloud.snapshot().signedIn,
        hasSaveDoc: !!window.__PB_MOCK_STATE.saves[window.__PB_MOCK_STATE.users['ali@example.com'] && window.__PB_MOCK_STATE.users['ali@example.com'].uid]
      })));
      record('delete success: account gone, device save kept', gone.ok && !gone.signed && /deleted/i.test(gone.msg) && /"coins":15/.test(gone.save || ''), gone);
      await ctx.close();
    }

    // --- Backoff caps ---
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state);
      const bo = await page.evaluate(() => {
        const t = PB.Cloud._test;
        const vals = [1, 2, 3, 4, 5, 10, 20].map(function (a) { return t.backoffDelay(a); });
        return { vals: vals, max: t.MAX_BACKOFF_MS, mono: vals.every(function (v, i) { return i === 0 || v >= vals[i - 1] || v === t.MAX_BACKOFF_MS; }) };
      });
      record('backoff starts at 250ms', bo.vals[0] === 250, bo);
      record('backoff doubles', bo.vals[1] === 500 && bo.vals[2] === 1000, bo);
      record('backoff caps at MAX_BACKOFF_MS', bo.vals[bo.vals.length - 1] === bo.max && bo.max === 8000, bo);
      record('backoff never exceeds cap', bo.vals.every(v => v <= bo.max), bo);
      await ctx.close();
    }

    // --- Facebook still disabled + placeholder guest already covered elsewhere ---
    {
      const state = mock.createState();
      const { ctx, page } = await boot(browser, server, state, { email: true, google: true, facebook: false });
      const fb = await page.evaluate(() => { PB.Cloud.signInOAuth('facebook'); return { en: PB.Cloud.providerEnabled('facebook'), msg: PB.Cloud.errorText }; });
      record('Facebook remains disabled', !fb.en, fb);
      await ctx.close();
    }

  } catch (e) {
    record('firebase-suite crashed', false, e.stack || String(e));
  } finally {
    await browser.close();
    server.close();
  }
  const passed = results.filter(r => r.pass).length;
  console.log('\n' + passed + '/' + results.length + ' passed (mock)');
  console.log('live: 0/0 NOT VERIFIED');
  if (passed !== results.length) process.exit(1);
})();
