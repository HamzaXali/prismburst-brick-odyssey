/*
 * TEST-ONLY. This file is not loaded by the game and is not deployed.
 * It mocks Supabase by intercepting HTTP with Playwright. The shipped game
 * has no fake auth path. Real Google, Facebook, and email auth are unverified
 * until config.js has a real project.
 */
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium, devices } = require('playwright-core');
const fs = require('fs');
const PAGE_URL = process.env.PB_URL || 'http://127.0.0.1:8090/index.html';
const ORIGIN = 'https://prismburst-test.supabase.co';
const REAL_ORIGIN = 'https://qogqnutpqzatxnbhcznc.supabase.co';
const realHits = [];
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  const extra = detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '';
  console.log((pass ? 'PASS ' : 'FAIL ') + name + extra);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function phoneContext(browser, opts) {
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 5'], { serviceWorkers: 'block' }, opts || {}));
  await ctx.route(REAL_ORIGIN + '/**', route => {
    realHits.push(route.request().method() + ' ' + route.request().url());
    return route.abort();
  });
  return ctx;
}

function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function jwt(payload) { return b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url(payload) + '.sig'; }
function decodeJwt(token) {
  const body = String(token || '').split('.')[1];
  if (!body) return null;
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

function configBody(providers) {
  return 'window.PB_CONFIG = ' + JSON.stringify({
    supabaseUrl: ORIGIN,
    supabaseAnonKey: 'sb_publishable_test_only_not_a_secret',
    providers: providers
  }) + ';';
}

function emptyConfigBody() {
  return 'window.PB_CONFIG = ' + JSON.stringify({
    supabaseUrl: '',
    supabaseAnonKey: '',
    providers: { email: true, google: false, facebook: false }
  }) + ';';
}

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function legacyObject() {
  return {
    v: 1,
    coins: 230,
    unlocked: [3, 1, 0, 0, 0],
    levels: { '0-0': { best: 12000, stars: 3 }, '0-1': { best: 8000, stars: 2 } },
    owned: { ball: ['classic', 'rose'], paddle: ['classic'] },
    equipped: { ball: 'rose', paddle: 'classic' },
    settings: { sound: true, vibration: false, shake: true },
    daily: { last: '2026-01-02', streak: 2 },
    missions: {
      date: today(),
      list: [
        { type: 'bricks', target: 200, reward: 60, text: 'Break 200 crystals', progress: 10, claimed: false },
        { type: 'powerups', target: 5, reward: 50, text: 'Collect 5 power-ups', progress: 0, claimed: false },
        { type: 'clears', target: 3, reward: 70, text: 'Clear 3 levels', progress: 1, claimed: false }
      ]
    },
    stats: { bricks: 40, played: 4, cleared: 3 },
    last: { world: 0, level: 1 }
  };
}

function createState() {
  return {
    users: {
      'ali@example.com': { id: USER_A, email: 'ali@example.com', password: 'secret12', confirmed: true },
      'other@example.com': { id: USER_B, email: 'other@example.com', password: 'secret12', confirmed: true }
    },
    saves: {},
    profiles: {},
    profileWrites: [],
    refreshes: {},
    n: 0,
    requests: [],
    upserts: [],
    conflicts: 0,
    networkDown: false,
    forceUnconfirmed: false,
    failNextUpsert: false,
    refreshFail: false
  };
}

function userObj(u) {
  const provider = (u.app_metadata && u.app_metadata.provider) || 'email';
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    email_confirmed_at: u.confirmed ? '2026-01-01T00:00:00Z' : null,
    app_metadata: u.app_metadata || { provider: 'email', providers: ['email'] },
    user_metadata: u.user_metadata || {},
    identities: [{ provider: provider, identity_id: u.id, id: u.id, user_id: u.id }],
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
  };
}

function sessionFor(state, u) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = jwt({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp, iat: exp - 3600 });
  const refresh = 'refresh-' + u.id + '-' + (++state.n);
  state.refreshes[refresh] = u;
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: refresh, user: userObj(u) };
}

function installMock(page, state) {
  return page.context().route(ORIGIN + '/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    state.requests.push(method + ' ' + url.pathname + url.search);
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'content-type': 'application/json'
    };
    const send = (status, body) => route.fulfill({ status, headers: cors, body: typeof body === 'string' ? body : JSON.stringify(body) });
    if (method === 'OPTIONS') return send(204, '');
    if (state.networkDown) return route.abort('failed');
    let posted = {};
    try { posted = req.postDataJSON() || {}; } catch (e) { posted = {}; }
    const auth = req.headers()['authorization'] || '';
    const bearer = auth.replace(/^Bearer\s+/i, '');
    const tokenUser = decodeJwt(bearer);

    if (url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password') {
      const u = state.users[String(posted.email || '').toLowerCase()];
      if (state.forceUnconfirmed) return send(400, { error: 'email_not_confirmed', error_description: 'Email not confirmed', msg: 'Email not confirmed' });
      if (!u || u.password !== posted.password) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      return send(200, sessionFor(state, u));
    }
    if (url.pathname.endsWith('/auth/v1/signup')) {
      const email = String(posted.email || '').toLowerCase();
      if (state.users[email]) return send(400, { error: 'user_already_exists', msg: 'User already registered', error_description: 'User already registered' });
      const created = { id: USER_B, email, password: posted.password, confirmed: false };
      state.users[email] = created;
      return send(200, { user: userObj(created), session: null });
    }
    if (url.pathname.endsWith('/auth/v1/recover')) {
      state.lastRecover = posted;
      return send(200, {});
    }
    if (url.pathname.endsWith('/auth/v1/logout')) return send(204, '');
    if (url.pathname.endsWith('/auth/v1/user') && method === 'GET') {
      const u = Object.values(state.users).find(user => tokenUser && user.id === tokenUser.sub);
      if (!u) return send(401, { msg: 'invalid claim: missing sub claim' });
      return send(200, userObj(u));
    }
    if (url.pathname.endsWith('/auth/v1/user') && (method === 'PUT' || method === 'PATCH')) {
      state.passwordUpdated = posted.password || null;
      const u = Object.values(state.users).find(user => tokenUser && user.id === tokenUser.sub) || state.users['ali@example.com'];
      return send(200, userObj(u));
    }
    if (url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'refresh_token') {
      if (state.refreshFail) return send(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token', msg: 'Invalid Refresh Token' });
      const u = state.refreshes[posted.refresh_token];
      if (!u) return send(400, { msg: 'Invalid Refresh Token' });
      return send(200, sessionFor(state, u));
    }
    if (url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'pkce') {
      if (posted.auth_code === 'good-code') {
        const existing = state.users['ali@example.com'] || { id: USER_A, email: 'ali@example.com', password: 'secret12', confirmed: true };
        existing.user_metadata = { full_name: 'Ali Prism', name: 'Ali Prism' };
        existing.app_metadata = { provider: 'google', providers: ['google'] };
        state.users['ali@example.com'] = existing;
        return send(200, sessionFor(state, existing));
      }
      return send(400, { error: 'invalid_grant', msg: 'Invalid code', error_description: 'Invalid code' });
    }
    if (url.pathname.endsWith('/auth/v1/settings')) return send(200, { external: { google: true, facebook: false }, disable_signup: false });
    if (url.pathname.endsWith('/auth/v1/health')) return send(200, { ok: true });

    if (url.pathname.endsWith('/rest/v1/profiles')) {
      const uid = tokenUser && tokenUser.sub;
      if (!uid) return send(401, { message: 'not authenticated' });
      if (method === 'GET') {
        if (!state.profiles[uid]) return send(406, { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object', details: '0 rows' });
        return send(200, { id: uid, display_name: state.profiles[uid] });
      }
      if (method === 'PATCH' || method === 'PUT') {
        state.profileWrites.push({ method, id: uid, body: posted });
        if (!state.profiles[uid]) return send(406, { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object', details: '0 rows' });
        state.profiles[uid] = posted.display_name;
        return send(200, { id: uid, display_name: posted.display_name });
      }
      if (method === 'POST') {
        state.profileWrites.push({ method, id: uid, body: posted });
        if (posted.id && posted.id !== uid) return send(401, { message: 'not allowed' });
        state.profiles[uid] = posted.display_name;
        return send(201, { id: uid, display_name: posted.display_name });
      }
    }
    if (url.pathname.endsWith('/rest/v1/player_saves') && method === 'GET') {
      const uid = (tokenUser && tokenUser.sub) || (url.searchParams.get('user_id') || '').replace(/^eq\./, '');
      const row = state.saves[uid];
      if (!row) return send(406, { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object', details: '0 rows' });
      return send(200, { user_id: uid, data: row.data, save_version: 1, revision: row.revision, client_updated_at: row.client_updated_at });
    }
    if (url.pathname.endsWith('/rest/v1/rpc/upsert_player_save') && method === 'POST') {
      const uid = tokenUser && tokenUser.sub;
      const expected = posted.p_expected_revision || 0;
      state.upserts.push({ user: uid, expected, coins: posted.p_data && posted.p_data.coins });
      if (!uid) return send(401, { message: 'not authenticated' });
      if (state.failNextUpsert) {
        state.failNextUpsert = false;
        state.conflicts += 1;
        const row = state.saves[uid] || { revision: expected, data: posted.p_data, client_updated_at: posted.p_client_updated_at };
        row.revision = (row.revision || expected) + 3;
        row.data = Object.assign({}, row.data, {
          levels: Object.assign({}, row.data.levels, { '0-2': { best: 500, stars: 2 } })
        });
        state.saves[uid] = row;
        return send(409, { code: '40001', message: 'revision_conflict' });
      }
      const existing = state.saves[uid];
      if (!existing) {
        if (expected !== 0) return send(409, { code: '40001', message: 'revision_conflict' });
        state.saves[uid] = { revision: 1, data: posted.p_data, client_updated_at: posted.p_client_updated_at };
        return send(200, { revision: 1, data: posted.p_data, user_id: uid, save_version: 1, client_updated_at: posted.p_client_updated_at });
      }
      if (expected !== existing.revision) return send(409, { code: '40001', message: 'revision_conflict' });
      existing.revision += 1;
      existing.data = posted.p_data;
      existing.client_updated_at = posted.p_client_updated_at;
      return send(200, { revision: existing.revision, data: existing.data, user_id: uid, save_version: 1, client_updated_at: existing.client_updated_at });
    }
    return send(404, { message: 'unmocked ' + method + ' ' + url.pathname });
  });
}

async function boot(page) {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
  await page.waitForFunction(() => window.PB && PB.Cloud && PB.Cloud.readySettled, null, { timeout: 15000 });
  await sleep(200);
  return errors;
}

async function openAccount(page) {
  await page.evaluate(() => PB.Account.open());
  await page.waitForSelector('#pb-account:not([hidden])');
}

async function signIn(page, email, password) {
  await openAccount(page);
  await page.fill('#pb-email-input', email);
  await page.fill('#pb-password-input', password);
  await page.click('[data-action="login"]');
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
  });
  try {
    // -------------------------------------------------- empty config
    {
      const ctx = await phoneContext(browser);
      const page = await ctx.newPage();
      await page.context().route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: emptyConfigBody()
      }));
      const errors = await boot(page);
      await openAccount(page);
      const notes = await page.locator('.pb-note').allTextContents();
      const disabled = await page.evaluate(() => ({
        google: document.querySelector('[data-action="google"]').disabled,
        facebook: document.querySelector('[data-action="facebook"]').disabled,
        email: document.getElementById('pb-email-input').disabled,
        guest: document.querySelector('[data-action="guest"]').disabled
      }));
      record('empty config keeps provider buttons disabled with not-set-up note',
        disabled.google && disabled.facebook && disabled.email && !disabled.guest && notes.filter(t => t.includes('Not set up yet')).length >= 3,
        { disabled, notes });
      record('guest status is not signed in', (await page.textContent('#pb-acct-sync')) === 'Not signed in');
      await page.evaluate(() => __PB.start(0, 0));
      await page.waitForFunction(() => __PB.scenes().includes('Game'));
      const st = await page.evaluate(() => __PB.state());
      record('empty config does not block gameplay', st && st.world === 0 && st.level === 0 && st.lives === 3, st && { level: st.level, lives: st.lives });
      record('empty config boot has no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // -------------------------------------------------- secret key refused, providers off
    {
      const ctx = await phoneContext(browser);
      const page = await ctx.newPage();
      const bad = jwt({ role: 'service_role', iss: 'test' });
      let leaked = 0;
      await page.context().route(ORIGIN + '/**', route => { leaked += 1; return route.abort(); });
      await page.context().route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'window.PB_CONFIG = ' + JSON.stringify({
          supabaseUrl: ORIGIN,
          supabaseAnonKey: bad,
          providers: { email: true, google: true, facebook: true }
        }) + ';'
      }));
      const errors = await boot(page);
      await openAccount(page);
      const msg = await page.textContent('#pb-acct-msg');
      const googleOff = await page.evaluate(() => document.querySelector('[data-action="google"]').disabled);
      record('a secret-role key is refused and never sent', googleOff && /publishable anon key/i.test(msg) && leaked === 0, { msg, leaked });
      record('secret-key boot has no page errors', errors.length === 0, errors);
      await ctx.close();

      const ctx2 = await phoneContext(browser);
      const page2 = await ctx2.newPage();
      await page2.context().route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: configBody({ email: false, google: false, facebook: false })
      }));
      await boot(page2);
      await openAccount(page2);
      const flags = await page2.evaluate(() => ({
        google: document.querySelector('[data-action="google"]').disabled,
        facebook: document.querySelector('[data-action="facebook"]').disabled,
        email: document.getElementById('pb-email-input').disabled
      }));
      const note = await page2.textContent('#pb-note-facebook');
      record('URL and key with every provider flag false stays disabled', flags.google && flags.facebook && flags.email && note.includes('Not set up yet'), flags);
      await ctx2.close();
    }

    // -------------------------------------------------- legacy save survives auth
    {
      const legacy = JSON.stringify(legacyObject());
      const ctx = await phoneContext(browser);
      const page = await ctx.newPage();
      const state = createState();
      await page.addInitScript(raw => localStorage.setItem('prismburst.save.v1', raw), legacy);
      await page.context().route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: configBody({ email: true, google: true, facebook: false })
      }));
      await installMock(page, state);
      const errors = await boot(page);
      const raw0 = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      record('pre-update save loads byte-for-byte', raw0 === legacy);
      await signIn(page, 'ali@example.com', 'wrong-password');
      await page.waitForFunction(() => (document.getElementById('pb-acct-msg').textContent || '').includes('incorrect'));
      const raw1 = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      const backups1 = await page.evaluate(() => __PB.cloud().backups);
      record('bad password does not rewrite the local save', raw1 === legacy && backups1.length === 0);

      state.networkDown = true;
      await signIn(page, 'ali@example.com', 'secret12');
      await page.waitForFunction(() => /offline/i.test(document.getElementById('pb-acct-msg').textContent || ''));
      state.networkDown = false;
      const raw2 = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      record('network failure does not rewrite the local save', raw2 === legacy);

      state.forceUnconfirmed = true;
      await signIn(page, 'ali@example.com', 'secret12');
      await page.waitForFunction(() => /Confirm your email/i.test(document.getElementById('pb-acct-msg').textContent || ''));
      state.forceUnconfirmed = false;
      record('unconfirmed email does not rewrite the local save', (await page.evaluate(() => localStorage.getItem('prismburst.save.v1'))) === legacy);

      await signIn(page, 'ali@example.com', 'secret12');
      await page.waitForFunction(() => PB.Cloud.snapshot().sync === 'Synced' || PB.Cloud.snapshot().pending, null, { timeout: 10000 });
      const snap = await page.evaluate(() => PB.Cloud.snapshot());
      const raw3 = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      record('login with an empty cloud uploads and does not rewrite the local save',
        snap.sync === 'Synced' && snap.signedIn && raw3 === legacy && state.upserts.length >= 1 && state.upserts[0].coins === 230,
        { sync: snap.sync, upserts: state.upserts.length, coins: state.upserts[0] && state.upserts[0].coins });

      state.refreshFail = true;
      await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const raw = localStorage.getItem(key);
          if (!raw || raw.indexOf('refresh_token') === -1) continue;
          try {
            const data = JSON.parse(raw);
            if (!data || !data.refresh_token) continue;
            data.expires_at = Math.floor(Date.now() / 1000) - 120;
            data.expires_in = -120;
            localStorage.setItem(key, JSON.stringify(data));
          } catch (e) { /* not the session */ }
        }
      });
      await page.evaluate(() => PB.Cloud.getClient().auth.refreshSession());
      await page.waitForFunction(() => /expired/i.test(document.getElementById('pb-acct-msg').textContent || ''), null, { timeout: 8000 });
      state.refreshFail = false;
      const raw4 = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      record('expired session does not clear the local save', raw4 === legacy && /expired/i.test(await page.evaluate(() => PB.Cloud.snapshot().error)));

      await signIn(page, 'ali@example.com', 'secret12');
      await page.waitForFunction(() => PB.Cloud.snapshot().signedIn, null, { timeout: 10000 });
      await openAccount(page);
      await page.click('[data-action="logout"]');
      await page.click('[data-action="confirm-logout"]');
      await page.waitForFunction(() => !PB.Cloud.snapshot().signedIn && /kept/i.test(PB.Cloud.snapshot().error || ''), null, { timeout: 8000 });
      const raw5 = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      const cloud = await page.evaluate(() => __PB.save());
      record('logout keeps the pre-update save and its progress fields',
        raw5 === legacy && cloud.coins === 230 && cloud.equipped.ball === 'rose' && cloud.unlocked[0] === 3 && cloud.settings.vibration === false,
        { bytes: raw5 === legacy, coins: cloud.coins, ball: cloud.equipped && cloud.equipped.ball, unlocked: cloud.unlocked, vibration: cloud.settings && cloud.settings.vibration, disk: raw5 && JSON.parse(raw5).settings, cloudSettings: state.saves[USER_A] && state.saves[USER_A].data.settings });
      record('legacy auth flow has no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // -------------------------------------------------- sync, merge, offline, conflict
    {
      const ctx = await phoneContext(browser);
      const page = await ctx.newPage();
      const state = createState();
      await page.context().route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: configBody({ email: true, google: true, facebook: false })
      }));
      await installMock(page, state);
      const errors = await boot(page);
      await openAccount(page);
      const fb = await page.evaluate(() => ({
        disabled: document.querySelector('[data-action="facebook"]').disabled,
        note: document.getElementById('pb-note-facebook').textContent,
        google: document.querySelector('[data-action="google"]').disabled,
        email: document.getElementById('pb-email-input').disabled
      }));
      record('facebook stays disabled while email and google are enabled', fb.disabled && fb.note.includes('Not set up yet') && !fb.google && !fb.email, fb);

      const local = legacyObject();
      local.coins = 10;
      local.levels = { '0-0': { best: 100, stars: 1 } };
      local.unlocked = [2, 0, 0, 0, 0];
      const localRaw = JSON.stringify(local);
      await page.evaluate(raw => { localStorage.setItem('prismburst.save.v1', raw); PB.Save.load(); }, localRaw);
      state.saves[USER_A] = {
        revision: 4,
        client_updated_at: '2020-01-01T00:00:00.000Z',
        data: {
          save_version: 1, client_updated_at: '2020-01-01T00:00:00.000Z', v: 1, coins: 99,
          unlocked: [1, 2, 0, 0, 0],
          levels: { '0-0': { best: 40, stars: 3 }, '1-0': { best: 80, stars: 2 } },
          owned: { ball: ['classic'], paddle: ['classic', 'gold'] },
          equipped: { ball: 'classic', paddle: 'gold' },
          settings: { sound: true, vibration: true, shake: true },
          daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
          stats: { bricks: 1, played: 1, cleared: 1 }, last: { world: 1, level: 0 }
        }
      };
      await page.evaluate(() => localStorage.setItem('prismburst.cloud.meta.v1', JSON.stringify({
        lastUserId: null, clientUpdatedAt: new Date().toISOString(), knownRevision: null, queue: null
      })));
      await signIn(page, 'ali@example.com', 'secret12');
      await page.waitForSelector('#pb-migrate:not([hidden])', { timeout: 10000 });
      const title = await page.textContent('#pb-migrate-title');
      const rawBeforeChoice = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      record('both sides having progress asks before merging', /both have progress/i.test(title) && rawBeforeChoice === localRaw, title);

      await page.click('[data-choice="merge"]');
      await page.waitForFunction(() => PB.Cloud.snapshot().sync === 'Synced', null, { timeout: 10000 });
      const merged = await page.evaluate(() => __PB.save());
      const backups = await page.evaluate(() => PB.Cloud.snapshot().backups);
      record('merge keeps best progress and the newer coins',
        merged.coins === 10 && merged.unlocked[0] === 2 && merged.unlocked[1] === 2 && merged.levels['0-0'].stars === 3 && merged.levels['0-0'].best === 100 && merged.levels['1-0'].stars === 2 && merged.owned.paddle.indexOf('gold') >= 0 && backups.length >= 1,
        { coins: merged.coins, unlocked: merged.unlocked, stars: merged.levels['0-0'] });

      await page.evaluate(() => PB.Cloud.logout());
      await page.waitForFunction(() => !PB.Cloud.snapshot().signedIn);
      await page.evaluate(raw => {
        localStorage.setItem('prismburst.save.v1', raw);
        localStorage.removeItem('prismburst.cloud.meta.v1');
        PB.Save.load();
      }, localRaw);
      state.saves[USER_A].revision = 4;
      state.saves[USER_A].data.coins = 99;
      await signIn(page, 'ali@example.com', 'secret12');
      await page.waitForSelector('#pb-migrate:not([hidden])');
      await page.click('[data-choice="cloud"]');
      await page.waitForFunction(() => PB.Cloud.snapshot().sync === 'Synced');
      const usedCloud = await page.evaluate(() => __PB.save());
      const backupRaw = await page.evaluate(() => {
        const keys = PB.Cloud.snapshot().backups;
        return localStorage.getItem(keys[keys.length - 1]);
      });
      let backedCoins = null;
      try { backedCoins = JSON.parse(JSON.parse(backupRaw).prismburstSaveV1).coins; } catch (e) { backedCoins = null; }
      record('use cloud replaces this device and keeps a backup', usedCloud.coins === 99 && backedCoins === 10, { coins: usedCloud.coins, backedCoins });

      await page.evaluate(() => PB.Cloud.logout());
      await page.waitForFunction(() => !PB.Cloud.snapshot().signedIn);
      await page.evaluate(({ raw, other }) => {
        localStorage.setItem('prismburst.save.v1', raw);
        localStorage.setItem('prismburst.cloud.meta.v1', JSON.stringify({ lastUserId: other, clientUpdatedAt: new Date().toISOString(), knownRevision: 1, queue: null }));
        PB.Save.load();
      }, { raw: localRaw, other: USER_B });
      await signIn(page, 'ali@example.com', 'secret12');
      await page.waitForSelector('#pb-migrate:not([hidden])');
      const switched = await page.textContent('#pb-migrate-title');
      const untouched = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      record('a different account prompts instead of merging', /different account/i.test(switched) && untouched === localRaw, switched);
      await page.click('[data-choice="device"]');
      await page.waitForFunction(() => PB.Cloud.snapshot().sync === 'Synced', null, { timeout: 10000 });
      const kept = await page.evaluate(() => __PB.save());
      record('keep device keeps coins and still keeps better cloud stars', kept.coins === 10 && kept.levels['0-0'].stars === 3 && kept.levels['1-0'].stars === 2, { coins: kept.coins, stars: kept.levels['0-0'].stars });

      await ctx.setOffline(true);
      await page.evaluate(() => { PB.Save.addCoins(5); PB.Save.persist(); });
      await sleep(100);
      const queued = await page.evaluate(() => PB.Cloud.snapshot());
      record('offline changes queue on device', queued.sync === 'Offline' && queued.queue && queued.queue.userId === USER_A && queued.save.includes('"coins":15'), { sync: queued.sync, queue: queued.queue });
      await ctx.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.evaluate(() => PB.Cloud.flush());
      await page.waitForFunction(() => PB.Cloud.snapshot().sync === 'Synced', null, { timeout: 10000 });
      record('reconnect flushes the queued save', state.saves[USER_A].data.coins === 15, { coins: state.saves[USER_A].data.coins });

      state.failNextUpsert = true;
      const beforeUpserts = state.upserts.length;
      await page.evaluate(() => { PB.Save.addCoins(1); PB.Save.persist(); return PB.Cloud.flush(); });
      await page.waitForFunction(() => PB.Cloud.snapshot().sync === 'Synced', null, { timeout: 10000 });
      const after = await page.evaluate(() => __PB.save());
      record('revision conflict re-fetches, merges, and retries',
        state.conflicts === 1 && state.upserts.length >= beforeUpserts + 2 && after.levels['0-2'] && after.levels['0-2'].stars === 2 && after.coins === 16,
        { conflicts: state.conflicts, upserts: state.upserts.length - beforeUpserts, coins: after.coins, level: after.levels['0-2'] });

      await page.evaluate(() => PB.Cloud.logout());
      await page.waitForFunction(() => !PB.Cloud.snapshot().signedIn);
      const beforeBad = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      state.saves[USER_B] = { revision: 1, client_updated_at: '2026-01-01T00:00:00.000Z', data: { save_version: 1, coins: 'lots' } };
      await signIn(page, 'other@example.com', 'secret12');
      await page.waitForFunction(() => PB.Cloud.snapshot().sync === 'Error', null, { timeout: 10000 });
      const afterBad = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      const err = await page.evaluate(() => PB.Cloud.snapshot().error);
      record('invalid cloud data is rejected and the local save stays', afterBad === beforeBad && /rejected/i.test(err), err);

      const linkVisible = await page.evaluate(() => {
        PB.Cloud.logout();
        return true;
      });
      await page.waitForFunction(() => !PB.Cloud.snapshot().signedIn);
      await openAccount(page);
      const linkText = await page.textContent('[data-action="link"]');
      record('guest with progress can open link-to-account', linkVisible && /Link this guest progress/.test(linkText || ''), linkText);
      record('sync flow has no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // -------------------------------------------------- service worker, oauth, cancelled return
    {
      const ctx = await phoneContext(browser, { serviceWorkers: 'allow' });
      const page = await ctx.newPage();
      const state = createState();
      await page.context().route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: configBody({ email: true, google: true, facebook: false })
      }));
      await installMock(page, state);
      const errors = await boot(page);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
      const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
      await page.evaluate(() => fetch('https://prismburst-test.supabase.co/auth/v1/health').then(r => r.text()));
      const cached = await page.evaluate(async () => {
        const out = [];
        for (const name of await caches.keys()) {
          const cache = await caches.open(name);
          for (const req of await cache.keys()) out.push(req.url);
        }
        return out;
      });
      const hitsBefore = state.requests.filter(r => r.includes('/auth/v1/health')).length;
      state.networkDown = true;
      const second = await page.evaluate(async () => {
        try {
          const res = await fetch('https://prismburst-test.supabase.co/auth/v1/health');
          return { status: res.status };
        } catch (err) { return { error: String(err) }; }
      });
      state.networkDown = false;
      const noSupabaseCache = cached.every(u => !/supabase\.(co|in)/.test(u));
      const reachedNetworkAgain = state.requests.filter(r => r.includes('/auth/v1/health')).length > hitsBefore;
      record('service worker does not cache Supabase calls', controlled && noSupabaseCache && !!second.error && reachedNetworkAgain, { controlled, cached: cached.length, second, hitsBefore });

      await page.goto(PAGE_URL + '?code=test-code', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
      record('OAuth ?code= return still boots the game', (await page.evaluate(() => __PB.scenes())).includes('Menu'));
      await page.goto(PAGE_URL + '#access_token=test-token', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
      record('access_token hash return still boots the game', (await page.evaluate(() => location.hash + ' ' + __PB.scenes().join(','))).includes('Menu'));

      await page.goto(PAGE_URL + '?error=access_denied&error_description=User%20cancelled', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.PB && PB.Cloud && PB.Cloud.readySettled, null, { timeout: 15000 });
      await page.waitForSelector('#pb-account:not([hidden])');
      const cancelled = await page.textContent('#pb-acct-msg');
      record('cancelled OAuth shows a clear message', /cancelled/i.test(cancelled || ''), cancelled);

      await openAccount(page);
      const authRequest = page.waitForRequest(req => req.url().includes('/auth/v1/authorize'), { timeout: 10000 });
      await page.click('[data-action="google"]');
      const req = await authRequest;
      const authUrl = new URL(req.url());
      const redirect = decodeURIComponent(authUrl.searchParams.get('redirect_to') || '');
      record('Google uses PKCE and redirects to the current page',
        authUrl.searchParams.get('provider') === 'google' && !!authUrl.searchParams.get('code_challenge') && /s256/i.test(authUrl.searchParams.get('code_challenge_method') || '') && redirect.indexOf('/index.html') !== -1,
        { provider: authUrl.searchParams.get('provider'), method: authUrl.searchParams.get('code_challenge_method'), redirect });

      await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
      await openAccount(page);
      await page.fill('#pb-email-input', 'ali@example.com');
      await page.click('[data-action="forgot"]');
      await page.waitForSelector('#pb-view-forgot:not([hidden])');
      const prefilled = await page.inputValue('#pb-forgot-email');
      await page.click('[data-action="send-reset"]');
      await page.waitForFunction(() => /Password reset email sent/i.test(document.getElementById('pb-acct-msg').textContent || ''));
      const recoverReq = state.requests.find(r => r.includes('/auth/v1/recover')) || '';
      const recoverRedirect = decodeURIComponent((recoverReq.split('redirect_to=')[1] || '').split('&')[0]);
      record('forgot password calls recover with this page as redirect',
        prefilled === 'ali@example.com' && state.lastRecover && state.lastRecover.email === 'ali@example.com' && /\/index\.html\?type=recovery$/.test(recoverRedirect), { prefilled, recoverRedirect });
      record('oauth and service-worker flow has no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // -------------------------------------------------- names, Google flag off, email still works
    {
      const ctx = await phoneContext(browser);
      const page = await ctx.newPage();
      const state = createState();
      await page.context().route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: configBody({ email: true, google: false, facebook: false })
      }));
      await installMock(page, state);
      const errors = await boot(page);
      await openAccount(page);
      const flags = await page.evaluate(() => ({
        google: document.querySelector('[data-action="google"]').disabled,
        note: document.getElementById('pb-note-google').textContent,
        email: document.getElementById('pb-email-input').disabled,
        svg: !!document.querySelector('[data-action="google"] svg')
      }));
      record('Google button is disabled with an inline logo when the flag is false', flags.google && flags.note.includes('Not set up yet') && flags.svg && !flags.email, flags);
      const guest = await page.evaluate(() => ({
        name: PB.Cloud.snapshot().displayName,
        profile: localStorage.getItem('prismburst.profile.v1'),
        save: localStorage.getItem('prismburst.save.v1'),
        menu: PB.game.scene.getScene('Menu').children.getByName('playerName').text
      }));
      record('a guest gets a PrismPlayer name outside the save', /^PrismPlayer\d{4}$/.test(guest.name) && guest.menu === guest.name && guest.profile.includes(guest.name) && (guest.save == null || guest.save.indexOf(guest.name) === -1), guest);

      await page.fill('#pb-name-input', '<img src=x onerror=alert(1)>');
      await page.click('[data-action="save-name"]');
      const xss = await page.evaluate(() => ({
        msg: document.getElementById('pb-name-msg').textContent,
        shown: document.getElementById('pb-name-shown').textContent,
        html: document.getElementById('pb-name-shown').innerHTML,
        img: document.querySelectorAll('#pb-account img').length
      }));
      record('a markup name is rejected and the sheet renders text', /not allowed/i.test(xss.msg) && xss.shown === guest.name && xss.html.indexOf('<img') === -1 && xss.img === 0, xss);

      await page.fill('#pb-name-input', '星の光');
      await page.click('[data-action="save-name"]');
      await page.waitForFunction(() => document.getElementById('pb-name-msg').textContent === 'Name saved on this device.');
      const savedGuest = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        if (!window.PB || !PB.Cloud || !PB.Cloud.readySettled || !PB.game) return false;
        if (PB.Cloud.snapshot().displayName !== '星の光') return false;
        const menu = PB.game.scene.getScene('Menu');
        const label = menu && menu.children.getByName('playerName');
        return !!(label && label.text === '星の光');
      }, null, { timeout: 20000 });
      const afterReload = await page.evaluate(() => ({
        name: PB.Cloud.snapshot().displayName,
        menu: PB.game.scene.getScene('Menu').children.getByName('playerName').text,
        save: localStorage.getItem('prismburst.save.v1')
      }));
      record('a guest name survives reload and does not rewrite the save', afterReload.name === '星の光' && afterReload.menu === '星の光' && afterReload.save === savedGuest);

      const beforeEmail = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      await openAccount(page);
      await signIn(page, 'ali@example.com', 'secret12');
      await page.waitForFunction(() => PB.Cloud.snapshot().signedIn && PB.Cloud.namePrompt === true, null, { timeout: 10000 });
      const suggested = await page.evaluate(() => ({
        input: document.getElementById('pb-name-input').value,
        email: PB.Cloud.snapshot().email
      }));
      record('email sign-in suggests the guest name and never the email', suggested.input === '星の光' && suggested.input !== 'ali' && suggested.input.indexOf('@') === -1, suggested);
      await page.fill('#pb-name-input', 'Star Pilot');
      await page.click('[data-action="save-name"]');
      await page.waitForFunction(() => document.getElementById('pb-name-msg').textContent === 'Name saved.');
      const named = await page.evaluate(() => ({
        shown: document.getElementById('pb-name-shown').textContent,
        who: document.getElementById('pb-acct-who').textContent,
        save: localStorage.getItem('prismburst.save.v1')
      }));
      record('the account name renders as text and the save is untouched', named.shown === 'Star Pilot' && named.who.indexOf('Star Pilot') === 0 && named.save === beforeEmail && state.profiles[USER_A] === 'Star Pilot', named.who);
      record('a name update sends only display_name', state.profileWrites.some(w => w.method === 'POST' && w.body.display_name === 'Star Pilot' && w.body.id === USER_A) && state.profileWrites.every(w => w.method !== 'PATCH' || Object.keys(w.body).join() === 'display_name'));
      await page.fill('#pb-name-input', 'Nova Star');
      await page.click('[data-action="save-name"]');
      await page.waitForFunction(() => document.getElementById('pb-name-shown').textContent === 'Nova Star');
      const patched = state.profileWrites.filter(w => w.body && w.body.display_name === 'Nova Star');
      record('editing a saved name updates only display_name', patched.length === 1 && patched[0].method === 'PATCH' && !('id' in patched[0].body) && state.profiles[USER_A] === 'Nova Star');

      await page.click('[data-action="logout"]');
      await page.click('[data-action="confirm-logout"]');
      await page.waitForFunction(() => !PB.Cloud.snapshot().signedIn && PB.Cloud.snapshot().displayName === '星の光');
      await signIn(page, 'ali@example.com', 'secret12');
      await page.waitForFunction(() => PB.Cloud.snapshot().displayName === 'Nova Star' && PB.Cloud.namePrompt === false, null, { timeout: 10000 });
      record('the account name comes back after logout and login', (await page.evaluate(() => document.getElementById('pb-name-shown').textContent)) === 'Nova Star');
      record('email still works when Google is not configured', errors.length === 0, errors);
      await ctx.close();
    }

    // -------------------------------------------------- Google OAuth return, suggestion, merge
    {
      const ctx = await phoneContext(browser);
      const page = await ctx.newPage();
      const state = createState();
      await page.context().route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: configBody({ email: true, google: true, facebook: false })
      }));
      await installMock(page, state);
      const errors = await boot(page);
      await openAccount(page);
      const enabled = await page.evaluate(() => ({
        disabled: document.querySelector('[data-action="google"]').disabled,
        note: document.getElementById('pb-note-google').textContent
      }));
      record('Google button is enabled when the flag is true', enabled.disabled === false && enabled.note === '', enabled);

      const local = legacyObject();
      local.coins = 10;
      local.levels = { '0-0': { best: 100, stars: 1 } };
      local.unlocked = [2, 0, 0, 0, 0];
      const localRaw = JSON.stringify(local);
      await page.evaluate(raw => { localStorage.setItem('prismburst.save.v1', raw); PB.Save.load(); }, localRaw);
      state.saves[USER_A] = {
        revision: 4,
        client_updated_at: '2020-01-01T00:00:00.000Z',
        data: {
          save_version: 1, client_updated_at: '2020-01-01T00:00:00.000Z', v: 1, coins: 99,
          unlocked: [1, 2, 0, 0, 0],
          levels: { '0-0': { best: 40, stars: 3 }, '1-0': { best: 80, stars: 2 } },
          owned: { ball: ['classic'], paddle: ['classic', 'gold'] },
          equipped: { ball: 'classic', paddle: 'gold' },
          settings: { sound: true, vibration: true, shake: true },
          daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
          stats: { bricks: 1, played: 1, cleared: 1 }, last: { world: 1, level: 0 }
        }
      };
      await page.evaluate(() => localStorage.setItem('prismburst.cloud.meta.v1', JSON.stringify({
        lastUserId: null, clientUpdatedAt: new Date().toISOString(), knownRevision: null, queue: null
      })));
      const here = await page.evaluate(() => location.origin + location.pathname);
      const authWait = page.waitForRequest(req => req.url().includes('/auth/v1/authorize'), { timeout: 10000 });
      await page.evaluate(() => {
        PB.Cloud.signInOAuth('google');
        PB.Cloud.signInOAuth('google');
      });
      const authReq = await authWait;
      await sleep(400);
      const authUrl = new URL(authReq.url());
      const authHits = state.requests.filter(r => r.includes('/auth/v1/authorize'));
      record('a double tap starts one Google authorize request',
        authHits.length === 1 && authUrl.searchParams.get('provider') === 'google' && authUrl.searchParams.get('scopes') === 'openid email profile' && authUrl.searchParams.get('redirect_to') === here && !!authUrl.searchParams.get('code_challenge') && /s256/i.test(authUrl.searchParams.get('code_challenge_method') || ''),
        { hits: authHits.length, provider: authUrl.searchParams.get('provider'), scopes: authUrl.searchParams.get('scopes'), redirect: authUrl.searchParams.get('redirect_to'), method: authUrl.searchParams.get('code_challenge_method') });

      await page.goto(PAGE_URL + '?code=good-code', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.PB && PB.Cloud && PB.Cloud.snapshot().signedIn, null, { timeout: 20000 });
      await page.waitForSelector('#pb-migrate:not([hidden])', { timeout: 10000 });
      await page.waitForFunction(() => PB.Cloud.nameSuggestion === 'Ali Prism');
      const returned = await page.evaluate(() => ({
        provider: PB.Cloud.snapshot().provider,
        suggestion: document.getElementById('pb-name-input').value,
        shown: document.getElementById('pb-name-shown').textContent,
        search: location.search,
        profile: localStorage.getItem('prismburst.profile.v1')
      }));
      record('the code callback restores Google and suggests full_name',
        returned.provider === 'google' && returned.suggestion === 'Ali Prism' && returned.shown !== 'Ali Prism' && returned.search.indexOf('code=') === -1 && state.profiles[USER_A] == null,
        returned);
      const rawBefore = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      await page.click('[data-choice="merge"]');
      await page.waitForFunction(() => PB.Cloud.snapshot().sync === 'Synced', null, { timeout: 10000 });
      const merged = await page.evaluate(() => __PB.save());
      record('guest progress is merged into the Google account instead of being replaced',
        rawBefore === localRaw && merged.coins === 10 && merged.levels['0-0'].best === 100 && merged.levels['0-0'].stars === 3 && merged.unlocked[1] === 2,
        { coins: merged.coins, unlocked: merged.unlocked });
      await page.click('[data-action="save-name"]');
      await page.waitForFunction(() => document.getElementById('pb-name-msg').textContent === 'Name saved.');
      record('confirming the Google suggestion writes one profile row', state.profiles[USER_A] === 'Ali Prism' && state.profileWrites.filter(w => w.method === 'POST').length === 1);
      record('Google sign-in flow has no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // -------------------------------------------------- cancelled OAuth leaves the guest save
    {
      const ctx = await phoneContext(browser);
      const page = await ctx.newPage();
      const legacy = JSON.stringify(legacyObject());
      await ctx.addInitScript(raw => { localStorage.setItem('prismburst.save.v1', raw); }, legacy);
      await page.context().route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: configBody({ email: true, google: true, facebook: false })
      }));
      const state = createState();
      await installMock(page, state);
      await page.goto(PAGE_URL + '?error=access_denied&error_description=' + encodeURIComponent('User cancelled'), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.PB && PB.Cloud && PB.Cloud.readySettled, null, { timeout: 20000 });
      await page.waitForSelector('#pb-account:not([hidden])');
      const cancelled = await page.evaluate(() => ({
        msg: document.getElementById('pb-acct-msg').textContent,
        save: localStorage.getItem('prismburst.save.v1'),
        search: location.search,
        signedIn: PB.Cloud.snapshot().signedIn
      }));
      record('a cancelled Google return keeps the guest save byte-identical',
        cancelled.save === legacy && /cancelled/i.test(cancelled.msg) && cancelled.search.indexOf('error') === -1 && cancelled.signedIn === false,
        { msg: cancelled.msg, search: cancelled.search, same: cancelled.save === legacy });

      await page.goto(PAGE_URL + '?error=server_error&error_description=' + encodeURIComponent('redirect URL not allowed'), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.PB && PB.Cloud && PB.Cloud.readySettled, null, { timeout: 20000 });
      const blocked = await page.evaluate(() => ({
        msg: document.getElementById('pb-acct-msg').textContent,
        save: localStorage.getItem('prismburst.save.v1'),
        search: location.search
      }));
      record('a blocked redirect explains the failure and keeps the save',
        /could not return/i.test(blocked.msg) && blocked.save === legacy && blocked.search.indexOf('error') === -1, blocked.msg);
      await ctx.close();
    }

    // -------------------------------------------------- native Capacitor auth
    {
      const ctx = await phoneContext(browser, { serviceWorkers: 'allow' });
      const page = await ctx.newPage();
      const legacy = JSON.stringify(legacyObject());
      await ctx.addInitScript(raw => {
        localStorage.setItem('prismburst.save.v1', raw);

          var bag = window.__cap || (window.__cap = { opened: [], listeners: {}, plugins: {} });
          function makePlugin(name) {
            if (!bag.plugins[name]) {
              bag.plugins[name] = {
                open: function (opts) { bag.opened.push(opts && opts.url); return Promise.resolve(); },
                close: function () { bag.closed = true; return Promise.resolve(); },
                addListener: function (eventName, cb) {
                  bag.listeners[name + ':' + eventName] = cb;
                  return Promise.resolve({ remove: function () {} });
                }
              };
            }
            return bag.plugins[name];
          }
          // Mirrors Capacitor Android JSExport.getPluginJS: Plugins.X only.
          // No registerPlugin — that API is not injected into the WebView.
          window.Capacitor = {
            isNativePlatform: function () { return true; },
            Plugins: {
              App: makePlugin('App'),
              Browser: makePlugin('Browser'),
              OpenUrl: makePlugin('OpenUrl')
            }
          };
      }, legacy);
      await page.context().route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: configBody({ email: true, google: true, facebook: false })
      }));
      const state = createState();
      await installMock(page, state);
      const errors = await boot(page);
      const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
      record('the service worker is not registered inside Capacitor', regs === 0, String(regs));
      await openAccount(page);
      const before = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      await page.evaluate(() => {
        PB.Cloud.signInOAuth('google');
        PB.Cloud.signInOAuth('google');
      });
      await page.waitForFunction(() => window.__cap && __cap.opened.length === 1, null, { timeout: 10000 });
      const opened = await page.evaluate(() => ({ url: __cap.opened[0], href: location.href }));
      const authUrl = new URL(opened.url);
      record('native Google opens the system browser once with the app redirect',
        opened.href.indexOf('authorize') === -1 && authUrl.searchParams.get('provider') === 'google' && authUrl.searchParams.get('scopes') === 'openid email profile' && authUrl.searchParams.get('redirect_to') === 'com.prismburst.brickodyssey://auth' && !!authUrl.searchParams.get('code_challenge'),
        { href: opened.href, redirect: authUrl.searchParams.get('redirect_to'), scopes: authUrl.searchParams.get('scopes') });
      await page.evaluate(() => {
        const cb = __cap.listeners['Browser:browserFinished'];
        if (cb) cb();
      });
      await page.waitForFunction(() => /cancelled/i.test(document.getElementById('pb-acct-msg').textContent || ''), null, { timeout: 5000 });
      const afterCancel = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      record('a cancelled native sign-in keeps the local save byte-identical', afterCancel === before && before === legacy);

      await page.evaluate(() => { PB.Cloud.loading = false; return PB.Cloud.signInOAuth('google'); });
      await page.waitForFunction(() => window.__cap && __cap.opened.length === 2, null, { timeout: 10000 });
      await page.evaluate(() => __cap.listeners['App:appUrlOpen']({ url: 'com.prismburst.brickodyssey://auth?code=good-code' }));
      await page.waitForFunction(() => PB.Cloud.snapshot().signedIn && PB.Cloud.snapshot().provider === 'google' && PB.Cloud.nameSuggestion === 'Ali Prism', null, { timeout: 10000 });
      const returned = await page.evaluate(() => ({
        save: localStorage.getItem('prismburst.save.v1'),
        suggestion: PB.Cloud.nameSuggestion
      }));
      record('the native auth return exchanges the code and keeps the save', returned.suggestion === 'Ali Prism' && returned.save === legacy, returned.suggestion);

      await page.evaluate(() => PB.Account.open('forgot'));
      await page.fill('#pb-forgot-email', 'ali@example.com');
      await page.click('[data-action="send-reset"]');
      await page.waitForFunction(() => /Password reset email sent/i.test(document.getElementById('pb-acct-msg').textContent || ''));
      record('native password reset uses the app redirect', state.requests.some(r => r.includes('/auth/v1/recover') && decodeURIComponent(r).includes('com.prismburst.brickodyssey://auth?type=recovery')));
      record('native auth flow has no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // -------------------------------------------------- Browser.open missing → OpenUrl Intent fallback
    {
      const ctx = await phoneContext(browser, { serviceWorkers: 'block' });
      const page = await ctx.newPage();
      await ctx.addInitScript(() => {
        window.__cap = { opened: [], openUrl: [], listeners: {}, plugins: {} };
        function make(name, bagKey) {
          return {
            open: function (opts) {
              window.__cap[bagKey].push(opts && opts.url);
              return Promise.resolve();
            },
            close: function () { return Promise.resolve(); },
            addListener: function (eventName, cb) {
              window.__cap.listeners[name + ':' + eventName] = cb;
              return Promise.resolve({ remove: function () {} });
            }
          };
        }
        window.Capacitor = {
          isNativePlatform: function () { return true; },
          Plugins: {
            App: make('App', 'opened'),
            Browser: { /* open intentionally missing */ },
            OpenUrl: make('OpenUrl', 'openUrl')
          }
        };
      });
      await page.context().route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: configBody({ email: true, google: true, facebook: false })
      }));
      const state = createState();
      await installMock(page, state);
      const errors = await boot(page);
      await openAccount(page);
      await page.evaluate(() => { PB.Cloud.signInOAuth('google'); });
      await page.waitForFunction(() => window.__cap && __cap.openUrl.length >= 1, null, { timeout: 10000 });
      const hit = await page.evaluate(() => __cap.openUrl[0]);
      record('native Google falls back to OpenUrl Intent when Browser.open is missing',
        typeof hit === 'string' && /authorize|supabase|google/i.test(hit), hit && String(hit).slice(0, 80));
      const msg = await page.evaluate(() => document.getElementById('pb-acct-msg') && document.getElementById('pb-acct-msg').textContent);
      record('OpenUrl fallback does not show a browser-error diagnostic', !/Could not open the browser/i.test(String(msg || '')), msg);
      record('OpenUrl fallback native auth has no page errors', errors.length === 0, errors);
      await ctx.close();
    }

    // -------------------------------------------------- no native openers → diagnostic includes version+step
    {
      const ctx = await phoneContext(browser, { serviceWorkers: 'block' });
      const page = await ctx.newPage();
      await ctx.addInitScript(() => {
        window.__capFallback = { opened: [] };
        window.open = function (url, target) {
          window.__capFallback.opened.push({ url: String(url || ''), target: String(target || '') });
          return null; // Capacitor WebView style: window.open returns null
        };
        window.Capacitor = {
          isNativePlatform: function () { return true; },
          Plugins: {
            App: { addListener: function () { return Promise.resolve({ remove: function () {} }); } },
            Browser: {},
            OpenUrl: {}
          }
        };
      });
      await page.context().route('**/config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: configBody({ email: true, google: true, facebook: false })
      }));
      const state = createState();
      await installMock(page, state);
      const errors = await boot(page);
      await openAccount(page);
      await page.evaluate(() => { PB.Cloud.signInOAuth('google'); });
      await page.waitForFunction(() => /Could not open the browser \[v1\.4\.4 step=/.test(document.getElementById('pb-acct-msg').textContent || ''), null, { timeout: 10000 });
      const msg = await page.evaluate(() => document.getElementById('pb-acct-msg').textContent);
      record('total open failure shows versioned diagnostic step code',
        /\[v1\.4\.4 step=/.test(msg) && /Progress on this device is unchanged/.test(msg) && !/The system browser is unavailable/.test(msg), msg);
      record('diagnostic failure has no page errors', errors.length === 0, errors);
      await ctx.close();
    }
    record('cloud suite never calls the real Supabase project', realHits.length === 0, realHits.slice(0, 5));
  } catch (err) {
    record('cloud suite crashed', false, err.stack);
    record('cloud suite never calls the real Supabase project', realHits.length === 0, realHits.slice(0, 5));
  }
  const passed = results.filter(r => r.pass).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  fs.writeFileSync(require('path').join(__dirname, 'cloud-results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  if (passed !== results.length) process.exit(1);
})();
