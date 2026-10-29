/*
 * TEST-ONLY. Not loaded by the game and not deployed.
 * Play Store prep (1.4.4): Settings footer and buttons, in-app account
 * deletion, the public delete-account and privacy pages. Supabase is mocked
 * by intercepting HTTP with Playwright: no account is created or deleted on
 * the real project. The real delete_my_account() is NOT VERIFIED here.
 */
const { chromium, devices } = require('playwright-core');
const fs = require('fs');
const PAGE_URL = process.env.PB_URL || 'http://127.0.0.1:8113/index.html';
const BASE = PAGE_URL.replace(/index\.html.*$/, '');
const SHOTS = process.env.PB_SHOTS || '/workspace/pr14shots';
fs.mkdirSync(SHOTS, { recursive: true });
const ORIGIN = 'https://prismburst-test.supabase.co';
const REAL_ORIGIN = 'https://qogqnutpqzatxnbhcznc.supabase.co';
const USER = '55555555-5555-4555-8555-555555555555';
const EMAIL = 'pilot@example.com';
const results = [];
const realHits = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  const extra = detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '';
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (pass ? '' : extra));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function jwt(payload) { return b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url(payload) + '.sig'; }
function decodeJwt(token) {
  const body = String(token || '').split('.')[1];
  if (!body) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
}
function configBody() {
  return 'window.PB_CONFIG = ' + JSON.stringify({ supabaseUrl: ORIGIN, supabaseAnonKey: 'sb_publishable_test_only_not_a_secret', providers: { email: true, google: true, facebook: false } }) + ';';
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
function newState(opts) {
  return Object.assign({ users: { [EMAIL]: { id: USER, email: EMAIL, password: 'prism123' } }, deletes: [], requests: [], deleted: false, rpcMissing: false, saves: {} }, opts || {});
}
async function phone(browser, init) {
  const ctx = await browser.newContext(Object.assign({}, devices['Pixel 5'], { serviceWorkers: 'block' }));
  await ctx.route(REAL_ORIGIN + '/**', route => { realHits.push(route.request().url()); return route.abort(); });
  await ctx.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: configBody() }));
  if (init) await ctx.addInitScript(init.fn, init.arg);
  return ctx;
}
function mock(ctx, state) {
  return ctx.route(ORIGIN + '/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    state.requests.push(method + ' ' + url.pathname);
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'content-type': 'application/json' };
    const send = (status, body) => route.fulfill({ status, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
    if (method === 'OPTIONS') return send(204, '');
    let posted = {};
    try { posted = req.postDataJSON() || {}; } catch (e) { posted = {}; }
    const tokenUser = decodeJwt((req.headers()['authorization'] || '').replace(/^Bearer\s+/i, ''));
    const p = url.pathname;
    if (p.endsWith('/auth/v1/authorize')) return route.abort();
    if (p.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password') {
      const u = state.users[String(posted.email || '').toLowerCase()];
      if (!u || u.password !== posted.password || state.deleted) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      return send(200, session(u));
    }
    if (p.endsWith('/auth/v1/user') && method === 'GET') {
      if (state.deleted) return send(401, { msg: 'User not found' });
      const u = Object.values(state.users).find(x => tokenUser && x.id === tokenUser.sub);
      return u ? send(200, userObj(u)) : send(401, { msg: 'invalid' });
    }
    if (p.endsWith('/auth/v1/logout')) return send(204, '');
    if (p.endsWith('/rest/v1/profiles')) {
      if (method === 'GET') return send(200, { id: USER, display_name: 'Glass Pilot' });
      return send(200, { id: USER, display_name: posted.display_name || 'Glass Pilot' });
    }
    if (p.endsWith('/rest/v1/player_saves')) {
      const row = tokenUser && state.saves[tokenUser.sub];
      if (row) return send(200, row);
      return send(406, { code: 'PGRST116', message: '0 rows', details: '0 rows' });
    }
    if (p.endsWith('/rest/v1/rpc/upsert_player_save')) {
      if (tokenUser) state.saves[tokenUser.sub] = { user_id: tokenUser.sub, data: posted.p_data, save_version: 1, revision: 1, client_updated_at: posted.p_client_updated_at, updated_at: new Date().toISOString() };
      return send(200, { revision: 1 });
    }
    if (p.endsWith('/rest/v1/rpc/delete_my_account')) {
      state.deletes.push({ sub: tokenUser && tokenUser.sub, role: tokenUser && tokenUser.role, body: posted, apikey: req.headers()['apikey'] || '' });
      if (state.rpcMissing) return send(404, { code: 'PGRST202', message: 'Could not find the function public.delete_my_account without parameters in the schema cache', details: null, hint: null });
      if (!tokenUser) return send(401, { code: '42501', message: 'not signed in' });
      state.deleted = true;
      delete state.saves[tokenUser.sub];
      return send(204, '');
    }
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
const SAVE = JSON.stringify({
  v: 1, coins: 321, unlocked: [6, 1, 0, 0, 0], levels: { '0-0': { best: 9000, stars: 3 }, '0-1': { best: 7000, stars: 2 } },
  owned: { ball: ['classic'], paddle: ['classic'] }, equipped: { ball: 'classic', paddle: 'classic' },
  settings: { sound: false, vibration: true, shake: true }, daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
  stats: { bricks: 50, played: 3, cleared: 2 }, last: { world: 0, level: 1 }, home: null, shop: null, achievements: null
});
const seed = { fn: (raw) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('prismburst.save.v1', raw); localStorage.setItem('prismburst.save.backup.2026-01-01T00:00:00.000Z', raw); sessionStorage.setItem('seeded', '1'); } }, arg: SAVE };

async function openSettings(page) {
  await page.evaluate(() => { const sm = PB.game.scene; sm.getScenes(true).forEach(s => sm.stop(s.scene.key)); sm.start('Settings', { from: 'Menu' }); });
  await page.waitForFunction(() => __PB.scenes().includes('Settings'), null, { timeout: 8000 });
  await sleep(500);
}
async function tapNamed(page, sceneKey, name) {
  const pos = await page.evaluate(([k, n]) => { const s = PB.game.scene.getScene(k); const o = s.children.getByName(n); if (!o) return null; const r = document.querySelector('#game canvas').getBoundingClientRect(); return { x: r.left + o.x * r.width / 720, y: r.top + o.y * r.height / 1280 }; }, [sceneKey, name]);
  if (!pos) throw new Error('not found ' + name);
  await page.touchscreen.tap(pos.x, pos.y);
  await sleep(250);
}
async function signIn(page) {
  await page.evaluate(() => PB.Account.open('auth'));
  await page.fill('#pb-email-input', EMAIL);
  await page.fill('#pb-password-input', 'prism123');
  await page.click('[data-action="login"]');
  await page.waitForFunction(() => PB.Cloud.session && PB.Cloud.session.user, null, { timeout: 10000 });
  await sleep(600);
  // A first sign-in with local progress asks what to keep; merge keeps both.
  if (await visible(page, '#pb-migrate')) { await page.click('[data-choice="merge"]'); await sleep(800); }
}
const sheetText = page => page.evaluate(() => document.getElementById('pb-account').innerText);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ------------------------------------------------ Settings footer and buttons
    {
      const state = newState();
      const ctx = await phone(browser, seed);
      await mock(ctx, state);
      const page = await ctx.newPage();
      const errors = await boot(page);
      await openSettings(page);
      const ui = await page.evaluate(() => {
        const s = PB.game.scene.getScene('Settings');
        const footer = s.children.getByName('settings_footer');
        const texts = s.children.list.filter(o => o.type === 'Text').map(o => o.text).join(' | ');
        const del = s.children.getByName('btn_delete_account');
        const priv = s.children.getByName('btn_privacy');
        return { footer: footer && footer.text, texts, del: !!del, priv: !!priv, footerBottom: footer ? footer.y + footer.height / 2 : 0, delBottom: del ? del.y + 40 : 0, footerTop: footer ? footer.y - footer.height / 2 : 0 };
      });
      record('Settings footer no longer says "No ads and no tracking"', ui.texts.indexOf('No ads and no tracking') < 0, ui.texts);
      record('Settings footer: demo ads promote PRISMBURST, no ad SDK, no tracking, cloud only signed in',
        /Demo ads only promote PRISMBURST itself/.test(ui.footer) && /No third-party ad SDK and no tracking/.test(ui.footer) && /cloud save runs only when you sign in/.test(ui.footer), ui.footer);
      record('Settings shows Delete account and Privacy policy buttons', ui.del && ui.priv);
      record('footer fits on screen and below the buttons', ui.footerBottom <= 1280 && ui.footerTop > ui.delBottom, ui);
      await page.screenshot({ path: SHOTS + '/settings.png' });
      // Privacy button opens the policy page (web: new tab).
      const popupP = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
      await tapNamed(page, 'Settings', 'btn_privacy');
      const popup = await popupP;
      if (popup) await popup.waitForLoadState('domcontentloaded').catch(() => {});
      record('Privacy policy button opens privacy-policy.html', popup && /privacy-policy\.html$/.test(popup.url()), popup && popup.url());
      if (popup) await popup.close();
      // Guest taps Delete account: asked to sign in, nothing deleted.
      await tapNamed(page, 'Settings', 'btn_delete_account');
      await sleep(300);
      const guest = await page.evaluate(() => ({ open: !document.getElementById('pb-account').hidden, msg: document.getElementById('pb-acct-msg').textContent, authShown: !document.getElementById('pb-view-auth').hidden, deleteShown: !document.getElementById('pb-view-delete').hidden }));
      record('guest Delete account asks to sign in first', guest.open && guest.authShown && !guest.deleteShown && /Sign in to the account you want to delete/.test(guest.msg), guest);
      record('guest Delete account calls no RPC', state.deletes.length === 0);
      // After signing in from that prompt, the delete screen appears.
      await page.fill('#pb-email-input', EMAIL);
      await page.fill('#pb-password-input', 'prism123');
      await page.click('[data-action="login"]');
      await page.waitForFunction(() => PB.Cloud.session && PB.Cloud.session.user, null, { timeout: 10000 });
      await sleep(600);
      if (await visible(page, '#pb-migrate')) { await page.click('[data-choice="merge"]'); await sleep(800); }
      record('after sign-in from Settings the delete screen opens', await visible(page, '#pb-view-delete'));
      await page.click('[data-action="delete-cancel"]');
      await sleep(200);
      record('Keep my account returns to the account view, nothing deleted', (await visible(page, '#pb-view-account')) && state.deletes.length === 0);
      record('no page errors (settings)', errors.length === 0, errors);
      await ctx.close();
    }

    // ------------------------------------------------ in-app delete, keep device progress
    {
      const state = newState();
      const ctx = await phone(browser, seed);
      await mock(ctx, state);
      const page = await ctx.newPage();
      const errors = await boot(page);
      await signIn(page);
      const before = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      await page.evaluate(() => PB.Account.open());
      await sleep(200);
      record('signed-in account sheet shows Delete account', await visible(page, '[data-action="delete-start"]'));
      record('account sheet shows no email address', !(await sheetText(page)).includes(EMAIL));
      await page.click('[data-action="delete-start"]');
      await sleep(200);
      record('delete screen shows typed confirmation', (await visible(page, '#pb-view-delete')) && (await visible(page, '#pb-delete-input')));
      record('Delete button disabled before typing', await page.evaluate(() => document.querySelector('[data-action="delete-confirm"]').disabled));
      await page.fill('#pb-delete-input', 'delete');
      record('lowercase "delete" keeps the button disabled', await page.evaluate(() => document.querySelector('[data-action="delete-confirm"]').disabled));
      await page.evaluate(() => PB.Cloud.deleteAccount('delete'));
      await sleep(200);
      record('wrong phrase through the API makes no RPC call', state.deletes.length === 0 && /Type DELETE/.test(await page.evaluate(() => PB.Cloud.errorText)));
      await page.fill('#pb-delete-input', 'DELETE');
      record('typing DELETE enables the button', await page.evaluate(() => !document.querySelector('[data-action="delete-confirm"]').disabled));
      await page.screenshot({ path: SHOTS + '/delete-confirm.png' });
      await page.click('[data-action="delete-confirm"]');
      await page.waitForFunction(() => PB.Cloud.accountDeleted === true, null, { timeout: 10000 }).catch(() => {});
      await sleep(500);
      record('RPC delete_my_account called once with the player\'s own token', state.deletes.length === 1 && state.deletes[0].sub === USER && state.deletes[0].role === 'authenticated', state.deletes);
      record('RPC used the publishable key only', state.deletes[0] && /^sb_publishable_/.test(state.deletes[0].apikey));
      const after = await page.evaluate(() => ({
        signedIn: !!(PB.Cloud.session && PB.Cloud.session.user), save: localStorage.getItem('prismburst.save.v1'),
        backups: Object.keys(localStorage).filter(k => k.indexOf('prismburst.save.backup.') === 0).length,
        msg: document.getElementById('pb-acct-msg').textContent, title: document.getElementById('pb-acct-title').textContent,
        authToken: Object.keys(localStorage).filter(k => /auth-token/.test(k)).length
      }));
      record('signed out on this device after deletion', !after.signedIn && after.authToken === 0, after);
      record('device save NOT cleared automatically', after.save === before && JSON.parse(after.save).coins === 321, after.save && after.save.slice(0, 60));
      record('backups not cleared automatically', after.backups >= 1);
      record('deleted view offers keep / clear choice', (await visible(page, '#pb-view-deleted')) && (await visible(page, '[data-action="keep-device"]')) && (await visible(page, '[data-action="clear-device"]')) && after.title === 'ACCOUNT DELETED');
      record('message says account deleted and device progress kept', /account and its cloud save were deleted/.test(after.msg) && /kept/.test(after.msg), after.msg);
      await page.screenshot({ path: SHOTS + '/deleted-choice.png' });
      await page.click('[data-action="keep-device"]');
      await sleep(400);
      const kept = await page.evaluate(() => ({ save: localStorage.getItem('prismburst.save.v1'), coins: PB.Save.data.coins, view: !document.getElementById('pb-view-auth').hidden }));
      record('Keep this device\'s progress keeps the save', kept.save === before && kept.coins === 321 && kept.view, kept);
      await sleep(1500);
      record('no cloud write after deletion', !state.saves[USER]);
      record('no page errors (delete keep)', errors.length === 0, errors);
      await ctx.close();
    }

    // ------------------------------------------------ in-app delete, then clear device
    {
      const state = newState();
      const ctx = await phone(browser, seed);
      await mock(ctx, state);
      const page = await ctx.newPage();
      const errors = await boot(page);
      await signIn(page);
      await page.evaluate(() => PB.Account.open('delete'));
      await page.fill('#pb-delete-input', 'DELETE');
      await page.click('[data-action="delete-confirm"]');
      await page.waitForFunction(() => PB.Cloud.accountDeleted === true, null, { timeout: 10000 }).catch(() => {});
      await page.click('[data-action="clear-device"]');
      await sleep(200);
      const armed = await page.evaluate(() => ({ save: localStorage.getItem('prismburst.save.v1'), label: document.querySelector('[data-action="clear-device"]').textContent }));
      record('first tap on clear only arms it (save still there)', armed.save && JSON.parse(armed.save).coins === 321 && /Tap again/.test(armed.label), armed.label);
      await page.click('[data-action="clear-device"]');
      await sleep(600);
      const cleared = await page.evaluate(() => ({ coins: PB.Save.data.coins, stored: JSON.parse(localStorage.getItem('prismburst.save.v1') || 'null'), backups: Object.keys(localStorage).filter(k => k.indexOf('prismburst.save.backup.') === 0).length, profile: localStorage.getItem('prismburst.profile.v1') }));
      record('second tap clears device progress and backups', cleared.coins === 0 && cleared.stored && cleared.stored.coins === 0 && cleared.backups === 0, cleared);
      record('guest display name is kept', !!cleared.profile);
      record('no page errors (delete clear)', errors.length === 0, errors);
      await ctx.close();
    }

    // ------------------------------------------------ migration not applied yet
    {
      const state = newState({ rpcMissing: true });
      const ctx = await phone(browser, seed);
      await mock(ctx, state);
      const page = await ctx.newPage();
      await boot(page);
      await signIn(page);
      await page.evaluate(() => PB.Account.open('delete'));
      await page.fill('#pb-delete-input', 'DELETE');
      await page.click('[data-action="delete-confirm"]');
      await sleep(1200);
      const r = await page.evaluate(() => ({ signedIn: !!(PB.Cloud.session && PB.Cloud.session.user), msg: document.getElementById('pb-acct-msg').textContent, deleted: PB.Cloud.accountDeleted, save: JSON.parse(localStorage.getItem('prismburst.save.v1')).coins }));
      record('missing RPC: clear message, still signed in, nothing cleared', r.signedIn && !r.deleted && r.save === 321 && /not switched on/.test(r.msg), r);
      await ctx.close();
    }

    // ------------------------------------------------ public delete-account page
    {
      const state = newState();
      const ctx = await phone(browser, seed);
      await mock(ctx, state);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE + 'delete-account.html', { waitUntil: 'load' });
      await sleep(600);
      record('delete page: sign-in card visible, confirm hidden', (await visible(page, '#del-signin')) && !(await visible(page, '#del-confirm')));
      record('delete page: no Facebook button', await page.evaluate(() => !document.querySelector('#del-signin button.facebook') && !/Continue with Facebook/.test(document.body.innerText)));
      await page.screenshot({ path: SHOTS + '/delete-page.png', fullPage: true });
      await page.fill('#del-email', EMAIL);
      await page.fill('#del-pass', 'prism123');
      await page.click('#del-login');
      await page.waitForSelector('#del-confirm:not([hidden])', { timeout: 8000 }).catch(() => {});
      record('delete page: confirm card after sign-in', await visible(page, '#del-confirm'));
      record('delete page: email never shown', !(await page.evaluate(() => document.body.innerText)).includes(EMAIL));
      record('delete page: button disabled until DELETE typed', await page.evaluate(() => document.getElementById('del-go').disabled));
      await page.fill('#del-typed', 'DELETE');
      await page.click('#del-go');
      await page.waitForSelector('#del-done:not([hidden])', { timeout: 8000 }).catch(() => {});
      record('delete page: RPC called with own token', state.deletes.length === 1 && state.deletes[0].sub === USER);
      const s1 = await page.evaluate(() => JSON.parse(localStorage.getItem('prismburst.save.v1') || 'null'));
      record('delete page: browser save not cleared automatically', s1 && s1.coins === 321);
      await page.click('#del-clear');
      const s2 = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      await page.click('#del-clear');
      const s3 = await page.evaluate(() => localStorage.getItem('prismburst.save.v1'));
      record('delete page: clear needs two taps, then clears', s2 !== null && s3 === null);
      record('no page errors (delete page)', errors.length === 0, errors);
      await ctx.close();
    }

    // ------------------------------------------------ privacy pages and links
    {
      const ctx = await phone(browser);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const res = await page.goto(BASE + 'privacy-policy.html', { waitUntil: 'load' });
      const txt = await page.evaluate(() => document.body.innerText);
      record('privacy-policy.html loads (200)', res && res.status() === 200);
      record('privacy policy covers email, display name, save, no ads SDK, no analytics, retention',
        /Email address/.test(txt) && /display name/i.test(txt) && /game save/i.test(txt) && /no third-party advertising SDK/i.test(txt) && /no analytics/i.test(txt) && /Retention/.test(txt));
      record('privacy policy shows the developer contact email, no placeholder', !/\[CONTACT EMAIL/.test(txt) && /hamzaxali44@gmail\.com/.test(txt));
      const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')));
      const local = links.filter(h => !/^(https?|mailto):/.test(h));
      let bad = [];
      for (const h of local) {
        const r = await ctx.request.get(new URL(h, BASE + 'privacy-policy.html').toString());
        if (r.status() !== 200) bad.push(h + ' ' + r.status());
      }
      record('privacy policy local links all return 200 (incl. delete-account.html)', local.includes('delete-account.html') && bad.length === 0, { local, bad });
      await page.goto(BASE + 'delete-account.html', { waitUntil: 'load' });
      const dlinks = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(h => !/^https?:/.test(h)));
      bad = [];
      for (const h of dlinks) {
        const r = await ctx.request.get(new URL(h, BASE + 'delete-account.html').toString());
        if (r.status() !== 200) bad.push(h + ' ' + r.status());
      }
      record('delete page local links all return 200', dlinks.includes('privacy-policy.html') && bad.length === 0, { dlinks, bad });
      await page.goto(BASE + 'privacy.html', { waitUntil: 'load' });
      await page.waitForURL(/privacy-policy\.html$/, { timeout: 5000 }).catch(() => {});
      record('old privacy.html forwards to privacy-policy.html', /privacy-policy\.html$/.test(page.url()), page.url());
      await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.PB && PB.Account, null, { timeout: 15000 });
      const sheetLinks = await page.evaluate(() => Array.from(document.querySelectorAll('#pb-account a[data-action="open-page"]')).map(a => a.getAttribute('data-page')));
      record('account sheet links privacy policy and delete page', sheetLinks.includes('privacy-policy.html') && sheetLinks.includes('delete-account.html'), sheetLinks);
      record('no page errors (pages)', errors.length === 0, errors);
      await ctx.close();
    }

    // ------------------------------------------------ Facebook still disabled
    {
      const state = newState();
      const ctx = await phone(browser);
      await mock(ctx, state);
      const page = await ctx.newPage();
      await boot(page);
      await page.evaluate(() => PB.Account.open('auth'));
      record('Facebook button still disabled', await page.evaluate(() => document.querySelector('[data-action="facebook"]').disabled));
      await ctx.close();
    }
  } catch (e) {
    record('suite crashed', false, e && e.stack);
  } finally {
    await browser.close();
  }
  record('no request reached the real Supabase project', realHits.length === 0, realHits);
  const passed = results.filter(r => r.pass).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  process.exit(passed === results.length ? 0 : 1);
})();
