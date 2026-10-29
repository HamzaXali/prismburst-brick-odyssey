/*
 * TEST-ONLY. Not loaded by the game and not deployed.
 * Login popup, password reset, Facebook off, Prism Shop cards, and the
 * absence of Crystal Mass. Supabase is mocked by intercepting HTTP with
 * Playwright, so no account is created and no email is sent. Real email
 * delivery and the real reset link are NOT VERIFIED here.
 */
const { chromium, devices } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const PAGE_URL = process.env.PB_URL || 'http://127.0.0.1:8090/index.html';
const SHOTS = process.env.PB_SHOTS || '/workspace/pr13shots';
fs.mkdirSync(SHOTS, { recursive: true });
const ORIGIN = 'https://prismburst-test.supabase.co';
const REAL_ORIGIN = 'https://qogqnutpqzatxnbhcznc.supabase.co';
const USER = '33333333-3333-4333-8333-333333333333';
const results = [];
const realHits = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  const extra = detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '';
  console.log((pass ? 'PASS ' : 'FAIL ') + name + extra);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function jwt(payload) { return b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url(payload) + '.sig'; }
function decodeJwt(token) {
  const body = String(token || '').split('.')[1];
  if (!body) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
}
function configBody(providers) {
  return 'window.PB_CONFIG = ' + JSON.stringify({ supabaseUrl: ORIGIN, supabaseAnonKey: 'sb_publishable_test_only_not_a_secret', providers }) + ';';
}
function userObj(u) {
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {}, identities: [{ provider: 'email', identity_id: u.id, id: u.id, user_id: u.id }],
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
  };
}
function session(u) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return { access_token: jwt({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp, iat: exp - 3600 }), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-' + u.id + '-' + Date.now(), user: userObj(u) };
}
function newState() {
  return { users: { 'pilot@example.com': { id: USER, email: 'pilot@example.com', password: 'oldpass1' } }, requests: [], recovers: [], signups: [], pkce: [], passwordPuts: [], authorize: [] };
}
async function phone(browser, providers, init) {
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 5'], { serviceWorkers: 'block' }));
  await ctx.route(REAL_ORIGIN + '/**', route => { realHits.push(route.request().url()); return route.abort(); });
  await ctx.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: configBody(providers) }));
  if (init) await ctx.addInitScript(init.fn, init.arg);
  return ctx;
}
function mock(ctx, state) {
  return ctx.route(ORIGIN + '/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    state.requests.push(method + ' ' + url.pathname + url.search);
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'content-type': 'application/json' };
    const send = (status, body) => route.fulfill({ status, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
    if (method === 'OPTIONS') return send(204, '');
    let posted = {};
    try { posted = req.postDataJSON() || {}; } catch (e) { posted = {}; }
    const tokenUser = decodeJwt((req.headers()['authorization'] || '').replace(/^Bearer\s+/i, ''));
    const p = url.pathname;
    if (p.endsWith('/auth/v1/authorize')) { state.authorize.push(url.searchParams.get('provider')); return route.abort(); }
    if (p.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password') {
      const u = state.users[String(posted.email || '').toLowerCase()];
      if (!u || u.password !== posted.password) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      return send(200, session(u));
    }
    if (p.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'pkce') {
      state.pkce.push({ code: posted.auth_code, verifier: !!posted.code_verifier });
      if (posted.auth_code === 'reset-code' && posted.code_verifier) return send(200, session(state.users['pilot@example.com']));
      return send(400, { error: 'invalid_grant', error_description: 'Invalid code', msg: 'Invalid code' });
    }
    if (p.endsWith('/auth/v1/signup')) {
      state.signups.push({ email: posted.email, redirect: url.searchParams.get('redirect_to') });
      return send(200, { user: userObj({ id: '44444444-4444-4444-8444-444444444444', email: posted.email }), session: null });
    }
    if (p.endsWith('/auth/v1/recover')) {
      state.recovers.push({ email: posted.email, redirect: url.searchParams.get('redirect_to'), pkce: !!posted.code_challenge });
      return send(200, {});
    }
    if (p.endsWith('/auth/v1/user') && method === 'GET') {
      const u = Object.values(state.users).find(x => tokenUser && x.id === tokenUser.sub);
      return u ? send(200, userObj(u)) : send(401, { msg: 'invalid' });
    }
    if (p.endsWith('/auth/v1/user') && method === 'PUT') {
      state.passwordPuts.push({ hasPassword: typeof posted.password === 'string', length: String(posted.password || '').length });
      const u = Object.values(state.users).find(x => tokenUser && x.id === tokenUser.sub);
      if (u) u.password = posted.password;
      return send(200, userObj(u || state.users['pilot@example.com']));
    }
    if (p.endsWith('/auth/v1/logout')) return send(204, '');
    if (p.endsWith('/rest/v1/profiles')) {
      if (method === 'GET') return send(200, { id: USER, display_name: 'Glass Pilot' });
      return send(200, { id: USER, display_name: posted.display_name || 'Glass Pilot' });
    }
    if (p.endsWith('/rest/v1/player_saves')) return send(406, { code: 'PGRST116', message: '0 rows', details: '0 rows' });
    if (p.endsWith('/rest/v1/rpc/upsert_player_save')) return send(200, { revision: 1 });
    return send(404, { message: 'unmocked ' + method + ' ' + p });
  });
}
async function boot(page, url) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url || PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
  await page.waitForFunction(() => window.PB && PB.Cloud && PB.Cloud.readySettled, null, { timeout: 15000 });
  await sleep(250);
  return errors;
}
const visible = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return !el.closest('[hidden]') && r.width > 0 && r.height > 0; }, sel);
const OLD_SAVE = JSON.stringify({
  v: 1, coins: 140, unlocked: [4, 1, 0, 0, 0], levels: { '0-0': { best: 9000, stars: 3 }, '0-1': { best: 7000, stars: 2 } },
  owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' },
  settings: { sound: true, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
  stats: { bricks: 50, played: 3, cleared: 2 }, last: { world: 0, level: 1 }, home: null, shop: null,
  dense: { v: 1, unlocked: 4, levels: { '0': { best: 500, stars: 2 }, '1': { best: 300, stars: 1 } } }, achievements: null
});

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ------------------------------------------------ login popup options
    {
      const state = newState();
      const ctx = await phone(browser, { email: true, google: true, facebook: false });
      await mock(ctx, state);
      const page = await ctx.newPage();
      const errors = await boot(page);
      await page.evaluate(() => PB.Account.open('auth'));
      await page.waitForSelector('#pb-account:not([hidden])');
      const ui = await page.evaluate(() => ({
        title: document.getElementById('pb-acct-title').textContent,
        tabs: Array.from(document.querySelectorAll('[data-tab]')).map(t => t.textContent.trim() + ':' + t.getAttribute('aria-selected')),
        guest: !!document.querySelector('#pb-view-auth [data-action="guest"]'),
        google: document.querySelector('[data-action="google"]').disabled,
        fbDisabled: document.querySelector('[data-action="facebook"]').disabled,
        fbSoon: !document.getElementById('pb-soon-facebook').hidden,
        fbNote: document.getElementById('pb-note-facebook').textContent,
        loginShown: !document.querySelector('[data-action="login"]').hidden,
        signupShown: !document.querySelector('[data-action="signup"]').hidden,
        forgot: !document.querySelector('#pb-email-form [data-action="forgot"]').hidden,
        accountView: !document.getElementById('pb-view-account').hidden
      }));
      await page.screenshot({ path: path.join(SHOTS, 'login-popup.png') });
      record('the login popup is its own section with Guest, Google, Facebook, email and Forgot password',
        ui.title === 'LOG IN' && ui.tabs.join() === 'Log in:true,Sign up:false' && ui.guest && ui.google === false && ui.loginShown && !ui.signupShown && ui.forgot && !ui.accountView, ui);
      record('Facebook shows Coming soon and is disabled while its flag is false', ui.fbDisabled && ui.fbSoon && /Coming soon/.test(ui.fbNote), ui);
      await page.evaluate(() => { const b = document.querySelector('[data-action="facebook"]'); b.disabled = false; b.click(); });
      await sleep(400);
      const fbMsg = await page.textContent('#pb-acct-msg');
      record('a forced Facebook tap never calls Supabase OAuth', state.authorize.length === 0 && !state.requests.some(r => /authorize/.test(r)) && /coming soon/i.test(fbMsg), { fbMsg, authorize: state.authorize });
      const fbAfter = await page.evaluate(() => document.querySelector('[data-action="facebook"]').disabled);
      record('Facebook goes back to disabled on the next render', fbAfter === true);

      // Sign up tab.
      await page.click('[data-tab="signup"]');
      await sleep(150);
      const su = await page.evaluate(() => ({
        title: document.getElementById('pb-acct-title').textContent,
        confirm: !document.getElementById('pb-password2-row').hidden,
        signupShown: !document.querySelector('[data-action="signup"]').hidden,
        loginShown: !document.querySelector('[data-action="login"]').hidden,
        autocomplete: document.getElementById('pb-password-input').getAttribute('autocomplete')
      }));
      record('the Sign up tab shows confirm password and a Create account button', su.title === 'SIGN UP' && su.confirm && su.signupShown && !su.loginShown && su.autocomplete === 'new-password', su);
      await page.fill('#pb-email-input', 'new.player@example.com');
      await page.fill('#pb-password-input', 'prism123');
      await page.fill('#pb-password2-input', 'prism124');
      await page.click('[data-action="signup"]');
      await sleep(300);
      const mismatch = await page.textContent('#pb-acct-msg');
      record('sign up with mismatched passwords is stopped on the device', /do not match/.test(mismatch) && state.signups.length === 0, mismatch);
      await page.click('[data-action="toggle-password"]');
      const shownType = await page.evaluate(() => [document.getElementById('pb-password-input').type, document.getElementById('pb-password2-input').type].join());
      await page.click('[data-action="toggle-password"]');
      record('Show password reveals both fields and Hide masks them again', shownType === 'text,text' && (await page.evaluate(() => document.getElementById('pb-password-input').type)) === 'password', shownType);
      await page.screenshot({ path: path.join(SHOTS, 'signup-popup.png') });
      await page.fill('#pb-password2-input', 'prism123');
      await page.click('[data-action="signup"]');
      await page.waitForFunction(() => /confirm the account/i.test(document.getElementById('pb-acct-msg').textContent || ''), null, { timeout: 8000 });
      const afterSignup = await page.evaluate(() => ({ tab: PB.Account.tab, title: document.getElementById('pb-acct-title').textContent }));
      record('sign up calls Supabase once with the page redirect and returns to the Log in tab',
        state.signups.length === 1 && state.signups[0].email === 'new.player@example.com' && /index\.html$/.test(state.signups[0].redirect || '') && afterSignup.tab === 'login', { signups: state.signups, afterSignup });

      // Wrong password then right password.
      await page.fill('#pb-email-input', 'pilot@example.com');
      await page.fill('#pb-password-input', 'wrongpass');
      await page.click('[data-action="login"]');
      await page.waitForFunction(() => /incorrect/i.test(document.getElementById('pb-acct-msg').textContent || ''), null, { timeout: 8000 });
      record('a wrong password shows a clear message', true);
      await page.fill('#pb-password-input', 'oldpass1');
      await page.press('#pb-password-input', 'Enter');
      await page.waitForFunction(() => PB.Cloud.snapshot().signedIn, null, { timeout: 10000 });
      await sleep(400);
      const signed = await page.evaluate(() => ({
        view: !document.getElementById('pb-view-account').hidden,
        auth: !document.getElementById('pb-view-auth').hidden,
        logout: !document.querySelector('[data-action="logout"]').hidden,
        title: document.getElementById('pb-acct-title').textContent,
        text: document.getElementById('pb-account').innerText
      }));
      record('email log in switches the popup to the signed-in account section', signed.view && !signed.auth && signed.logout && signed.title === 'ACCOUNT', { view: signed.view, title: signed.title });
      record('the signed-in sheet never shows the email address', signed.text.indexOf('pilot@example.com') === -1 && signed.text.indexOf('eyJ') === -1);
      await page.screenshot({ path: path.join(SHOTS, 'signed-in.png') });

      // Guest button closes the popup and leaves the save alone.
      await page.click('[data-action="logout"]');
      await page.click('[data-action="confirm-logout"]');
      await page.waitForFunction(() => !PB.Cloud.snapshot().signedIn, null, { timeout: 8000 });
      await sleep(200);
      const beforeGuest = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      await page.click('[data-action="guest"]');
      await sleep(200);
      const guest = await page.evaluate(() => ({ hidden: document.getElementById('pb-account').hidden, save: localStorage.getItem('prismburst.save.v1') }));
      record('Continue as Guest closes the popup and keeps the device save', guest.hidden && guest.save === beforeGuest);

      // Google still starts OAuth on the web.
      await page.evaluate(() => PB.Account.open('auth'));
      const authReq = page.waitForRequest(r => r.url().includes('/auth/v1/authorize'), { timeout: 8000 });
      await page.click('[data-action="google"]');
      const g = new URL((await authReq).url());
      record('Continue with Google still starts PKCE OAuth for google only', g.searchParams.get('provider') === 'google' && !!g.searchParams.get('code_challenge'), g.searchParams.get('provider'));
      record('login popup flow has no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // ------------------------------------------------ forgot password + web recovery link
    {
      const state = newState();
      const ctx = await phone(browser, { email: true, google: true, facebook: false }, {
        fn: raw => { if (!localStorage.getItem('prismburst.save.v1')) localStorage.setItem('prismburst.save.v1', raw); },
        arg: OLD_SAVE
      });
      await mock(ctx, state);
      const page = await ctx.newPage();
      const errors = await boot(page);
      await page.evaluate(() => PB.Account.open('auth'));
      await page.click('#pb-email-form [data-action="forgot"]');
      await page.waitForSelector('#pb-view-forgot:not([hidden])');
      const fv = await page.evaluate(() => ({ title: document.getElementById('pb-acct-title').textContent, auth: !document.getElementById('pb-view-auth').hidden }));
      await page.screenshot({ path: path.join(SHOTS, 'forgot-password.png') });
      record('Forgot password opens its own reset screen', fv.title === 'RESET PASSWORD' && !fv.auth, fv);
      await page.fill('#pb-forgot-email', 'nope');
      await page.click('[data-action="send-reset"]');
      await sleep(200);
      record('a bad email is stopped before any request', /Enter the email/.test(await page.textContent('#pb-acct-msg')) && state.recovers.length === 0);
      await page.fill('#pb-forgot-email', 'pilot@example.com');
      await page.click('[data-action="send-reset"]');
      await page.waitForFunction(() => /Password reset email sent/.test(document.getElementById('pb-acct-msg').textContent || ''), null, { timeout: 8000 });
      const sent = await page.evaluate(() => ({ label: document.querySelector('[data-action="send-reset"]').textContent, disabled: document.querySelector('[data-action="send-reset"]').disabled }));
      await page.screenshot({ path: path.join(SHOTS, 'forgot-password-sent.png') });
      const rec = state.recovers[0] || {};
      record('resetPasswordForEmail is called once with PKCE and a ?type=recovery redirect to the game',
        state.recovers.length === 1 && rec.email === 'pilot@example.com' && rec.pkce && /\/index\.html\?type=recovery$/.test(rec.redirect || ''), rec);
      record('the resend button waits before another email can be asked for', sent.disabled && /resend in \d+s/.test(sent.label), sent);
      const saveBefore = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));

      // The email link comes back to the game with a code.
      await page.goto(PAGE_URL + '?type=recovery&code=reset-code', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.PB && PB.Cloud && PB.Cloud.snapshot().signedIn && PB.Cloud.recovery, null, { timeout: 15000 });
      await page.waitForSelector('#pb-recovery:not([hidden])');
      await sleep(300);
      const rv = await page.evaluate(() => ({
        title: document.getElementById('pb-acct-title').textContent,
        form: !document.getElementById('pb-recovery-form').hidden,
        url: location.search
      }));
      await page.screenshot({ path: path.join(SHOTS, 'new-password.png') });
      record('the reset link opens the Choose a new password screen and clears the code from the URL',
        rv.title === 'NEW PASSWORD' && rv.form && rv.url.indexOf('code=') === -1 && rv.url.indexOf('type=recovery') === -1 && state.pkce.some(x => x.code === 'reset-code' && x.verifier), rv);
      await page.fill('#pb-new-password', 'newpass9');
      await page.fill('#pb-new-password2', 'newpass8');
      await page.click('[data-action="set-password"]');
      await sleep(300);
      record('mismatched new passwords are stopped on the device', /do not match/.test(await page.textContent('#pb-acct-msg')) && state.passwordPuts.length === 0);
      await page.fill('#pb-new-password', 'abc');
      await page.fill('#pb-new-password2', 'abc');
      await page.click('[data-action="set-password"]');
      await sleep(300);
      record('a too-short new password is stopped on the device', /at least 6/.test(await page.textContent('#pb-acct-msg')) && state.passwordPuts.length === 0);
      await page.fill('#pb-new-password', 'newpass9');
      await page.fill('#pb-new-password2', 'newpass9');
      await page.click('[data-action="set-password"]');
      await page.waitForFunction(() => /Password updated/.test(document.getElementById('pb-acct-msg').textContent || ''), null, { timeout: 8000 });
      const done = await page.evaluate(() => ({ recovery: PB.Cloud.recovery, account: !document.getElementById('pb-view-account').hidden, cleared: document.getElementById('pb-new-password').value === '', save: localStorage.getItem('prismburst.save.v1') }));
      record('saving the new password calls updateUser once and returns to the account section',
        state.passwordPuts.length === 1 && state.passwordPuts[0].length === 8 && state.users['pilot@example.com'].password === 'newpass9' && !done.recovery && done.account && done.cleared, { puts: state.passwordPuts, done: { recovery: done.recovery, account: done.account } });
      const after = JSON.parse(done.save);
      const before = JSON.parse(saveBefore);
      record('the reset flow keeps the local save prismburst.save.v1 progress', after.coins === before.coins && after.levels['0-0'].stars === 3 && JSON.stringify(after.unlocked) === JSON.stringify(before.unlocked));
      record('web reset flow has no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // ------------------------------------------------ expired or foreign reset links
    {
      const state = newState();
      const ctx = await phone(browser, { email: true, google: true, facebook: false });
      await mock(ctx, state);
      const page = await ctx.newPage();
      const errors = await boot(page, PAGE_URL + '?type=recovery&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
      await page.waitForSelector('#pb-recovery:not([hidden])');
      const ex = await page.evaluate(() => ({
        state: document.getElementById('pb-recovery-state').textContent,
        retry: !document.getElementById('pb-recovery-retry').hidden,
        form: !document.getElementById('pb-recovery-form').hidden,
        msg: document.getElementById('pb-acct-msg').textContent
      }));
      await page.screenshot({ path: path.join(SHOTS, 'reset-link-expired.png') });
      record('an expired reset link explains itself and offers a new link', /could not be used/.test(ex.state) && ex.retry && !ex.form && /expired/i.test(ex.msg), ex);
      await page.click('#pb-recovery-retry');
      await page.waitForSelector('#pb-view-forgot:not([hidden])');
      record('Ask for a new link opens the reset screen', true);

      const page2 = await ctx.newPage();
      const errors2 = await boot(page2, PAGE_URL + '?type=recovery&code=reset-code');
      await page2.waitForSelector('#pb-recovery:not([hidden])');
      await sleep(300);
      const foreign = await page2.evaluate(() => ({ signed: PB.Cloud.snapshot().signedIn, retry: !document.getElementById('pb-recovery-retry').hidden }));
      record('a reset link opened without this browser\'s PKCE verifier does not sign in and offers a new link', !foreign.signed && foreign.retry && !state.pkce.some(x => x.verifier), { foreign, pkce: state.pkce });
      await page2.click('[data-action="cancel-recovery"]');
      await sleep(200);
      record('Not now leaves the reset screen for the login popup', await page2.evaluate(() => !document.getElementById('pb-view-auth').hidden && !PB.Cloud.recovery));
      record('expired link pages have no page errors', errors.length === 0 && errors2.length === 0, errors.concat(errors2));
      await ctx.close();
    }

    // ------------------------------------------------ native Android reset link
    {
      const state = newState();
      const ctx = await phone(browser, { email: true, google: true, facebook: false }, {
        fn: raw => {
          if (!localStorage.getItem('prismburst.save.v1')) localStorage.setItem('prismburst.save.v1', raw);
          window.Capacitor = {
            isNativePlatform: function () { return true; },
            registerPlugin: function (name) {
              var bag = window.__cap || (window.__cap = { opened: [], listeners: {}, plugins: {} });
              if (!bag.plugins[name]) {
                bag.plugins[name] = {
                  open: function (o) { bag.opened.push(o && o.url); return Promise.resolve(); },
                  close: function () { return Promise.resolve(); },
                  addListener: function (ev, cb) { bag.listeners[name + ':' + ev] = cb; return Promise.resolve({ remove: function () {} }); }
                };
              }
              return bag.plugins[name];
            }
          };
        },
        arg: OLD_SAVE
      });
      await mock(ctx, state);
      const page = await ctx.newPage();
      const errors = await boot(page);
      await page.evaluate(() => PB.Account.open('forgot'));
      await page.fill('#pb-forgot-email', 'pilot@example.com');
      await page.click('[data-action="send-reset"]');
      await page.waitForFunction(() => /Password reset email sent/.test(document.getElementById('pb-acct-msg').textContent || ''), null, { timeout: 8000 });
      record('the Android app asks for the reset link with the app deep link', (state.recovers[0] || {}).redirect === 'com.prismburst.brickodyssey://auth?type=recovery', state.recovers[0]);
      await page.evaluate(() => PB.Account.close());
      await page.evaluate(() => __cap.listeners['App:appUrlOpen']({ url: 'com.prismburst.brickodyssey://auth?type=recovery&code=reset-code' }));
      await page.waitForFunction(() => PB.Cloud.snapshot().signedIn && PB.Cloud.recovery && !document.getElementById('pb-account').hidden && !document.getElementById('pb-recovery-form').hidden, null, { timeout: 10000 });
      record('the deep link opens the app on Choose a new password', true);
      await page.fill('#pb-new-password', 'droid123');
      await page.fill('#pb-new-password2', 'droid123');
      await page.click('[data-action="set-password"]');
      await page.waitForFunction(() => /Password updated/.test(document.getElementById('pb-acct-msg').textContent || ''), null, { timeout: 8000 });
      const keep = await page.evaluate(() => JSON.parse(localStorage.getItem('prismburst.save.v1')));
      record('native new password is saved and the device save keeps its progress', state.passwordPuts.length === 1 && keep.levels['0-0'].stars === 3, state.passwordPuts);
      record('native reset flow has no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // ------------------------------------------------ shop UI + no Crystal Mass + old dense save
    {
      const ctx = await phone(browser, { email: true, google: true, facebook: false }, {
        fn: raw => { if (!localStorage.getItem('prismburst.save.v1')) localStorage.setItem('prismburst.save.v1', raw); },
        arg: OLD_SAVE
      });
      await mock(ctx, newState());
      const page = await ctx.newPage();
      const errors = await boot(page);
      const loaded = await page.evaluate(() => ({ coins: PB.Save.data.coins, stars: PB.Save.data.levels['0-0'].stars, dense: PB.Save.data.dense, raw: JSON.parse(localStorage.getItem('prismburst.save.v1')) }));
      record('a 1.3.5 save with Crystal Mass progress still loads with its campaign progress', loaded.coins === 140 && loaded.stars === 3 && loaded.raw.dense && loaded.raw.dense.unlocked === 4, { coins: loaded.coins, dense: loaded.raw.dense });
      const mass = await page.evaluate(() => {
        const keys = PB.game.scene.scenes.map(s => s.scene.key);
        const texts = [];
        const walk = list => (list || []).forEach(o => { if (o.text) texts.push(o.text); if (o.label && o.label.text) texts.push(o.label.text); if (o.name) texts.push(o.name); if (o.list) walk(o.list); });
        walk(PB.game.scene.getScene('Menu').children.list);
        return { keys, dense: !!PB.Dense, startDense: !!(window.__PB && __PB.startDense), texts };
      });
      record('Crystal Mass is gone from the game: no scenes, no module, no menu entry',
        !mass.keys.some(k => /dense/i.test(k)) && !mass.dense && !mass.startDense && !mass.texts.some(t => /Crystal Mass|Modes|mode-mass/.test(t)), { keys: mass.keys });
      const shipped = ['index.html', 'game.js', 'sw.js', 'js/home-ui.js', 'js/menus.js', 'js/achievements.js', 'js/core.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
      record('shipped files no longer reference Crystal Mass code', !/dense\.js|dense-scene\.js|DenseSelect|startDense|Crystal Mass/.test(shipped) && !fs.existsSync(path.join(__dirname, '..', 'js/dense.js')));

      await page.evaluate(() => {
        PB.game.scene.stop('HomePop');
        PB.Shop.ensure(PB.Save.data);
        PB.Save.data.coins = 300;
        PB.Shop.buyLook(PB.Save.data, 'ion-wake');
        PB.Shop.equip(PB.Save.data, 'ion-wake');
        PB.Shop.buyLook(PB.Save.data, 'rose-ribbon');
        PB.Save.persist();
        PB.Home.mode = { type: 'one', items: ['shop'], index: 0 };
        const m = PB.game.scene.getScene('Menu');
        m.scene.launch('HomePop');
        m.scene.bringToTop('HomePop');
      });
      await sleep(900);
      const find = names => page.evaluate(names => {
        const s = PB.game.scene.getScene('HomePop');
        const out = {};
        const walk = list => (list || []).forEach(o => { if (names.indexOf(o.name) >= 0) out[o.name] = (o.label && o.label.text) || o.text || ''; if (o.list) walk(o.list); });
        walk(s.children.list);
        return out;
      }, names);
      const boosts = await find(['shopTitle', 'shopCoins', 'shop-tab-boosts', 'shop-tab-looks', 'boost-life', 'boost-wide', 'boost-multi', 'boost-slow', 'look-ion-wake']);
      await page.screenshot({ path: path.join(SHOTS, 'shop-boosts.png') });
      record('the shop shows the Prism coin balance at the top and Boosts and Looks tabs',
        boosts.shopTitle === 'PRISM SHOP' && boosts.shopCoins === '100' && boosts['shop-tab-boosts'] === 'Boosts' && boosts['shop-tab-looks'] === 'Looks', boosts);
      record('boost cards show their Prism coin price on the buy button',
        boosts['boost-life'] === '40' && boosts['boost-wide'] === '35' && boosts['boost-multi'] === '55' && boosts['boost-slow'] === '25' && !('look-ion-wake' in boosts), boosts);
      await page.evaluate(() => { const s = PB.game.scene.getScene('HomePop'); s.shopTab = 'looks'; s.render(); });
      await sleep(300);
      const looks = await find(['look-ion-wake', 'look-rose-ribbon', 'look-solar-flare', 'look-halo-rail', 'look-tag-ion-wake', 'look-tag-rose-ribbon', 'look-tag-solar-flare', 'shopCoins']);
      await page.screenshot({ path: path.join(SHOTS, 'shop-looks.png') });
      record('look cards show Equipped, Owned and price states',
        looks['look-ion-wake'] === 'Equipped' && looks['look-tag-ion-wake'] === 'Equipped' && looks['look-rose-ribbon'] === 'Equip' && looks['look-tag-rose-ribbon'] === 'Owned' && looks['look-solar-flare'] === '180' && !('look-tag-solar-flare' in looks), looks);
      await page.evaluate(() => PB.game.scene.stop('HomePop'));
      await sleep(300);
      await page.screenshot({ path: path.join(SHOTS, 'menu.png') });
      record('shop and old-save page has no page errors', errors.length === 0, errors);
      await ctx.close();
    }
    record('auth-shop suite never calls the real Supabase project', realHits.length === 0, realHits.slice(0, 3));
  } catch (err) {
    record('auth-shop suite crashed', false, err.stack || err.message);
  }
  await browser.close();
  const passed = results.filter(r => r.pass).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  if (passed !== results.length) process.exit(1);
})();
