#!/usr/bin/env node
/* Unit tests for the cloud merge rule, validation, shipped-file secret scan,
 * and the SQL/policy text. No browser and no network. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync, execFileSync } = require('child_process');
const sync = require('../js/save-sync');
const profile = require('../js/profile');
const secrets = require('../scripts/check-secrets');
const copyWeb = require('../scripts/copy-web');

const root = path.join(__dirname, '..');
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail && !pass ? ' — ' + detail : ''));
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function base(over) {
  const save = {
    v: 1, coins: 0, unlocked: [1, 0, 0, 0, 0], levels: {},
    owned: { ball: ['classic'], paddle: ['classic'] },
    equipped: { ball: 'classic', paddle: 'classic' },
    settings: { sound: true, vibration: true, shake: true },
    daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
    stats: { bricks: 0, played: 0, cleared: 0 }, last: null
  };
  return Object.assign(save, over || {});
}

function cloudOf(save, iso) {
  const body = sync.toCloudData(save, iso || '2026-01-01T00:00:00.000Z');
  return body;
}

const bounds = { worlds: 5, perWorld: 20 };

try {
  const fresh = base();
  record('fresh save is not progress', sync.hasProgress(fresh) === false);
  record('coins count as progress', sync.hasProgress(base({ coins: 1 })) === true);
  record('a cleared level counts as progress', sync.hasProgress(base({ unlocked: [2, 0, 0, 0, 0] })) === true);

  const local = base({
    coins: 10,
    unlocked: [3, 0, 0, 0, 0],
    levels: { '0-0': { best: 100, stars: 1 } },
    owned: { ball: ['classic', 'rose'], paddle: ['classic'] },
    equipped: { ball: 'rose', paddle: 'classic' },
    settings: { sound: false, vibration: true, shake: true },
    stats: { bricks: 5, played: 2, cleared: 1 },
    last: { world: 0, level: 1 }
  });
  const remote = base({
    coins: 99,
    unlocked: [1, 2, 0, 0, 0],
    levels: { '0-0': { best: 50, stars: 3 }, '1-0': { best: 80, stars: 2 } },
    owned: { ball: ['classic'], paddle: ['classic', 'gold'] },
    equipped: { ball: 'classic', paddle: 'gold' },
    settings: { sound: true, vibration: false, shake: true },
    daily: { last: '2026-04-01', streak: 4 },
    stats: { bricks: 9, played: 1, cleared: 4 },
    last: { world: 1, level: 0 }
  });
  const merged = sync.mergeProgress(local, remote, '2026-06-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', bounds);
  record('merge keeps higher unlocks per world', eq(merged.save.unlocked, [3, 2, 0, 0, 0]), JSON.stringify(merged.save.unlocked));
  record('merge keeps max score and stars and unions level keys',
    merged.save.levels['0-0'].best === 100 && merged.save.levels['0-0'].stars === 3 && merged.save.levels['1-0'].stars === 2);
  record('merge unions skins', merged.save.owned.ball.indexOf('rose') >= 0 && merged.save.owned.paddle.indexOf('gold') >= 0);
  record('merge keeps max lifetime stats', merged.save.stats.bricks === 9 && merged.save.stats.played === 2 && merged.save.stats.cleared === 4);
  record('newer local timestamp keeps local coins and settings', merged.save.coins === 10 && merged.save.settings.sound === false && merged.save.equipped.ball === 'rose');
  record('merge keeps the furthest current level', merged.save.last.world === 1 && merged.save.last.level === 0);

  const remoteWins = sync.mergeProgress(local, remote, '2020-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', bounds);
  record('newer cloud timestamp supplies coins, settings, missions, and gear',
    remoteWins.save.coins === 99 && remoteWins.save.settings.vibration === false && remoteWins.save.equipped.paddle === 'gold' && remoteWins.save.daily.streak === 4);
  record('older local progress is still kept when cloud state wins',
    remoteWins.save.unlocked[0] === 3 && remoteWins.save.levels['0-0'].best === 100 && remoteWins.save.owned.ball.indexOf('rose') >= 0);

  const tied = sync.mergeProgress(local, remote, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', bounds);
  record('equal timestamps keep this device\'s coins', tied.save.coins === 10);

  const good = sync.validateCloudData(cloudOf(local, '2026-06-01T00:00:00.000Z'), bounds);
  record('valid cloud save is accepted', good.ok === true && good.save.coins === 10 && good.save.unlocked.length === 5);

  const badCoins = sync.validateCloudData(Object.assign(cloudOf(local), { coins: 'lots' }), bounds);
  record('non-numeric coins are rejected', badCoins.ok === false);
  const badStars = sync.validateCloudData(Object.assign(cloudOf(local), { levels: { '0-0': { best: 1, stars: 9 } } }), bounds);
  record('stars above 3 are rejected', badStars.ok === false);
  const badWorld = sync.validateCloudData(Object.assign(cloudOf(local), { levels: { '9-0': { best: 1, stars: 1 } } }), bounds);
  record('level outside the world bounds is rejected', badWorld.ok === false);
  const badVersion = sync.validateCloudData(Object.assign(cloudOf(local), { save_version: 2 }), bounds);
  record('unknown save_version is rejected', badVersion.ok === false);
  const newer = cloudOf(local, '2026-06-01T00:00:00.000Z');
  newer.future = { banner: 'prism', n: 1, list: [1, true, null], nest: { a: 'ok' } };
  newer.levels = { '0-0': { best: 10, stars: 2, badge: 'new' } };
  newer.settings.extra = { hud: 'hearts' };
  newer.missions.season = 4;
  const checked = sync.validateCloudData(newer, bounds);
  record('a newer save with unknown fields validates',
    checked.ok === true && checked.save.coins === 10 && checked.save.future.nest.a === 'ok' && checked.save.levels['0-0'].badge === 'new' && checked.save.levels['0-0'].stars === 2 && checked.save.settings.extra.hud === 'hearts' && checked.save.settings.sound === false && checked.save.missions.season === 4);
  const older = base();
  older.coins = 3;
  const kept = sync.mergeProgress(older, checked.save, '2026-12-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', bounds);
  const uploaded = sync.toCloudData(kept.save, kept.client_updated_at);
  record('unknown fields round-trip unchanged through merge and upload',
    kept.save.coins === 3 && JSON.stringify(uploaded.future) === JSON.stringify(newer.future) && uploaded.levels['0-0'].badge === 'new' && uploaded.levels['0-0'].best === 10 && uploaded.settings.extra.hud === 'hearts' && uploaded.missions.season === 4 && uploaded.save_version === 1 && !Object.prototype.hasOwnProperty.call(kept.save, 'save_version'));
  const otherWay = sync.mergeProgress(checked.save, older, '2026-06-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', bounds);
  record('a newer device that lacks the field still keeps it', otherWay.save.future.banner === 'prism' && otherWay.save.levels['0-0'].badge === 'new' && otherWay.save.coins === 3);
  const proto = JSON.parse(JSON.stringify(cloudOf(local)).slice(0, -1) + ',"__proto__":{"admin":true}}');
  record('__proto__ is rejected', sync.validateCloudData(proto, bounds).ok === false && !proto.admin);
  const nestedProto = JSON.parse(JSON.stringify(cloudOf(local)).slice(0, -1) + ',"future":{"__proto__":{"admin":true}}}');
  record('a nested __proto__ key is rejected', sync.validateCloudData(nestedProto, bounds).ok === false);
  const ctor = JSON.parse(JSON.stringify(cloudOf(local)).slice(0, -1) + ',"constructor":{"x":1}}');
  record('a constructor key is rejected', sync.validateCloudData(ctor, bounds).ok === false);
  const fnSave = cloudOf(local);
  fnSave.future = function () { return 1; };
  record('a function field is rejected', sync.validateCloudData(fnSave, bounds).ok === false);
  const infSave = cloudOf(local);
  infSave.future = Infinity;
  record('a non-finite number is rejected', sync.validateCloudData(infSave, bounds).ok === false);
  let deepNode = {};
  let deepCursor = deepNode;
  for (let d = 0; d < sync.MAX_DEPTH + 3; d++) { deepCursor.next = {}; deepCursor = deepCursor.next; }
  const deepSave = cloudOf(local);
  deepSave.future = deepNode;
  record('a save nested too deeply is rejected', sync.validateCloudData(deepSave, bounds).ok === false);
  const fat = cloudOf(local);
  fat.future = 'x'.repeat(70000);
  record('an oversized unknown field is rejected', sync.validateCloudData(fat, bounds).ok === false && sync.MAX_BYTES === 65536);
  const huge = cloudOf(local);
  huge.levels = {};
  for (let i = 0; i < 20; i++) huge.levels['0-' + i] = { best: 1, stars: 1 };
  huge.missions = { date: null, list: [] };
  const padded = 'x'.repeat(70000);
  const tooBig = sync.validateCloudData(Object.assign(cloudOf(base()), { missions: { date: null, list: [{ type: 'bricks', target: 1, reward: 0, text: padded, progress: 0, claimed: false }] } }), bounds);
  record('oversized cloud save is rejected', tooBig.ok === false);
  const plain = require('../js/save-plain');
  const loaded = { settings: { sound: false, vibration: true, shake: true }, home: null };
  plain.absorb(loaded, { settings: { sound: false, vibration: true, shake: true, theme: 'prism' }, future: { a: 1 }, home: null, save_version: 1 }, 0, plain.ENVELOPE);
  record('local load keeps unknown fields and skips the cloud envelope', loaded.future.a === 1 && loaded.settings.theme === 'prism' && loaded.settings.sound === false && !Object.prototype.hasOwnProperty.call(loaded, 'save_version'));
  const jsFiles = fs.readdirSync(path.join(root, 'js')).filter(name => name.endsWith('.js'));
  const htmlHits = jsFiles.filter(name => fs.readFileSync(path.join(root, 'js', name), 'utf8').includes('innerHTML'));
  record('unknown save fields are not written as HTML', htmlHits.length === 0, htmlHits.join(','));

  const cfg = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
  const fbCfgText = fs.readFileSync(path.join(root, 'js/firebase-config.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(fbCfgText + '\n' + cfg, sandbox);
  const shipped = sandbox.window.PB_CONFIG || {};
  const fb = sandbox.window.PB_FIREBASE || {};
  const shippedProviders = shipped.providers || {};
  record('shipped Firebase web config is complete (cloud ready) with Google on and Facebook off',
    fb.projectId === 'prismburst-brick-odyssey' && /firebaseapp\.com$/.test(fb.authDomain) &&
    String(fb.apiKey || '').indexOf('PLACEHOLDER_') !== 0 && String(fb.appId || '').indexOf('PLACEHOLDER_') !== 0 &&
    String(fb.messagingSenderId) === '1094215889946' && String(fb.measurementId || '').indexOf('G-') === 0 &&
    shippedProviders.google === true && shippedProviders.facebook === false && shippedProviders.email === true);
  record('email and google are enabled and facebook ships off', /email:\s*true/.test(cfg) && /google:\s*true/.test(cfg) && /facebook:\s*false/.test(cfg));
  record('config and firebase-config have no JWT or private key', !/eyJ/.test(cfg) && !/eyJ/.test(fbCfgText) && !/private_key/.test(fbCfgText));

  const problems = secrets.scanShipped();
  record('shipped files have no secret-role JWT or secret API key', problems.length === 0, problems.join('; '));
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const secretPayload = Buffer.from(JSON.stringify({ role: secrets.FORBIDDEN_WORD })).toString('base64url');
  const anonPayload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url');
  record('scanner flags a secret-role JWT', secrets.scanText('x.js', header + '.' + secretPayload + '.signature').length === 1);
  record('scanner allows an anon JWT', secrets.scanText('x.js', header + '.' + anonPayload + '.sig').length === 0);
  record('scanner flags a secret API key', secrets.scanText('x.js', 'sb_secret_' + 'abcdef123456').length === 1);
  record('docs are not part of the shipped set', secrets.isShipped('docs/CLOUD-SETUP.md') === false && secrets.isShipped('config.js') === true);
  record('schema.sql is not shipped', secrets.isShipped('supabase/schema.sql') === false);

  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  record('firestore rules require auth uid match for saves and profiles',
    rules.includes('request.auth.uid == uid') && rules.includes('match /saves/{uid}') && rules.includes('match /profiles/{uid}'));
  record('firestore rules deny public catch-all', /match \/\{document=\*\*\}/.test(rules) && /allow read, write: if false/.test(rules));
  record('firestore rules validate display_name and save fields',
    rules.includes('validDisplayName') && rules.includes('validSave') && rules.includes('revision'));
  record('supabase folder is marked legacy', fs.existsSync(path.join(root, 'supabase/README.md')) && /legacy/i.test(fs.readFileSync(path.join(root, 'supabase/README.md'), 'utf8')));
  const sql = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8');
  record('legacy schema.sql still mentions RLS for history', /enable row level security/i.test(sql));

  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const shippedVersion = require('../package.json').version;
  record('service worker cache version matches the semver and precaches the game',
    /^\d+\.\d+\.\d+$/.test(shippedVersion) && sw.includes('prismburst-v' + shippedVersion) && sw.includes('./js/achievements.js') && !sw.includes('dense') && sw.includes('./js/ads.js') && sw.includes('./js/shop.js') && sw.includes('./lib/firebase-app-compat.js') && sw.includes('./lib/firebase-auth-compat.js') && sw.includes('./lib/firebase-firestore-compat.js') && sw.includes('./js/firebase-config.js') && sw.includes('./auth-bridge.html') && sw.includes('./js/profile.js') && sw.includes('./js/home.js') && sw.includes('./js/home-ui.js') && sw.includes('./config.js') && sw.includes('./privacy.html') && !sw.includes('prismburst-v1.4.5') && !sw.includes('prismburst-v1.4.4') && !sw.includes('prismburst-v1.4.3') && !sw.includes('prismburst-v1.4.2') && !sw.includes('prismburst-v1.4.1') && !sw.includes('prismburst-v1.4.0'));
  const menusJs = fs.readFileSync(path.join(root, 'js/menus.js'), 'utf8');
  record('the menu footer version matches the service worker', menusJs.includes("PB.VERSION = '" + shippedVersion + "'") && sw.includes('prismburst-v' + shippedVersion));
  record('service worker keeps Firebase/Google APIs network-only and skips OAuth returns', (sw.includes('googleapis') || sw.includes('firebaseio') || sw.includes('identitytoolkit')) && sw.includes("cache: 'no-store'") && sw.includes('code=') && sw.includes('access_token'));

  const yml = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
  record('Pages workflow validates secrets and publishes config and privacy', yml.includes('check-secrets.js') && yml.includes('config.js') && yml.includes('privacy.html') && yml.includes('cloud-unit.js'));

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const order = ['lib/phaser.min.js', 'lib/firebase-app-compat.js', 'lib/firebase-auth-compat.js', 'lib/firebase-firestore-compat.js', 'js/firebase-config.js', 'config.js', 'levels.js', 'js/save-plain.js', 'js/build-flags.js', 'js/core.js', 'js/home.js', 'js/achievements.js', 'js/shop.js', 'js/save-sync.js', 'js/profile.js', 'js/cloud.js', 'js/account.js', 'js/ads.js', 'js/menus.js', 'js/home-ui.js', 'game.js'];
  let pos = -1;
  let orderOk = true;
  for (const file of order) {
    const at = html.indexOf(file);
    if (at <= pos) orderOk = false;
    pos = at;
  }
  record('page loads phaser, firebase, config, then the game scripts', orderOk);

  const libApp = fs.readFileSync(path.join(root, 'lib/firebase-app-compat.js'), 'utf8');
  const libAuth = fs.readFileSync(path.join(root, 'lib/firebase-auth-compat.js'), 'utf8');
  record('vendored Firebase compat SDK is present', libApp.includes('initializeApp') && libAuth.includes('FirebaseError') && fs.existsSync(path.join(root, 'lib/firebase-firestore-compat.js')));

  const cloudSrc = fs.readFileSync(path.join(root, 'js/cloud.js'), 'utf8') + fs.readFileSync(path.join(root, 'js/account.js'), 'utf8');
  record('cloud code does not delete the local save or clear storage', !cloudSrc.includes("removeItem('prismburst.save.v1')") && !cloudSrc.includes('localStorage.clear'));
  record('cloud code does not ship a mock auth switch', !/PB_MOCK|fakeSupabase|fakeFirebase/.test(cloudSrc));

  const core = fs.readFileSync(path.join(root, 'js/core.js'), 'utf8');
  const syncSrc = fs.readFileSync(path.join(root, 'js/save-sync.js'), 'utf8');
  const ids = ['classic', 'rose', 'venom', 'ember', 'solar', 'void', 'rainbow', 'magenta', 'emerald', 'gold', 'obsidian', 'prism'];
  record('skin ids in the merge rules match the game', ids.every(id => core.includes("'" + id + "'") && syncSrc.includes("'" + id + "'")));

  record('a normal unicode name is accepted', profile.validate('星の光').ok === true && profile.validate("O'Brien").ok === true && profile.validate('Ali').name === 'Ali');
  record('empty and short names are rejected', profile.validate('  ').ok === false && profile.validate('').error === 'Enter a display name.' && profile.validate('Ab').error === 'Use 3 to 20 characters.');
  record('names longer than 20 are rejected', profile.validate('a'.repeat(21)).ok === false && profile.validate('😀'.repeat(21)).ok === false);
  const family = '👨‍👩‍👧‍👦';
  record('code points are capped at 20 even when graphemes are fewer', profile.graphemeCount(family) === 1 && Array.from(family).length > 1 && profile.validate(family.repeat(4)).ok === false);
  record('control, format, and markup characters are rejected',
    profile.validate('Ali\nNova').ok === false && profile.validate('Ali\u200b').ok === false && profile.validate('<img src=x onerror=alert(1)>').ok === false && profile.validate('a<b>').error === 'That name has characters that are not allowed.');
  record('Google full_name is the first suggestion', profile.suggest({ full_name: 'Ali Prism', name: 'Other' }, 'PrismPlayer1000', 'ali@example.com') === 'Ali Prism');
  record('an email or its local part is never suggested',
    profile.suggest({ full_name: 'ali@example.com', name: 'ali' }, 'PrismPlayer1000', 'ali@example.com') === 'PrismPlayer1000' &&
    profile.suggest({ name: 'Ali@Example.com' }, '', 'ali@example.com') === '' &&
    profile.suggest({}, '', 'ali@example.com') === '');
  record('a guest name is suggested when Google gives none', profile.suggest({}, 'PrismPlayer4242', 'player@example.com') === 'PrismPlayer4242');
  record('guest names look like PrismPlayer and four digits', /^PrismPlayer\d{4}$/.test(profile.randomGuestName()) && profile.randomGuestName().length <= 20);

  const mem = new Map();
  global.localStorage = {
    getItem: function (k) { return mem.has(k) ? mem.get(k) : null; },
    setItem: function (k, v) { mem.set(k, String(v)); },
    removeItem: function (k) { mem.delete(k); }
  };
  const guest = profile.ensureGuest();
  record('a guest gets a default name outside the game save', /^PrismPlayer\d{4}$/.test(guest) && mem.has(profile.KEY) && !mem.has('prismburst.save.v1'));
  record('editing the guest name persists in the profile key', profile.writeGuest('星の光').ok === true && profile.guestName() === '星の光');
  record('a markup name is not stored', profile.writeGuest('<img src=x>').ok === false && profile.guestName() === '星の光');
  delete global.localStorage;

  const fbSetup = fs.readFileSync(path.join(root, 'docs/FIREBASE-SETUP.md'), 'utf8');
  record('FIREBASE-SETUP documents Spark, Email/Password, Google, authorized domains, and rules paste',
    /Spark/i.test(fbSetup) && /Email\/Password/i.test(fbSetup) && /Authorized domains/i.test(fbSetup)
    && fbSetup.includes('hamzaxali.github.io') && fbSetup.includes('firestore.rules')
    && fbSetup.includes('apiKey') && fbSetup.includes('PLACEHOLDER_'));
  const fbCfg = fs.readFileSync(path.join(root, 'js/firebase-config.js'), 'utf8');
  record('firebase-config.js ships PLACEHOLDER_ public fields only',
    fbCfg.includes("projectId: 'prismburst-brick-odyssey'") && fbCfg.includes('prismburst-brick-odyssey.firebaseapp.com') && fbCfg.includes('1094215889946') && fbCfg.includes('measurementId') && !/BEGIN [A-Z ]*PRIVATE KEY/.test(fbCfg)
    && !/BEGIN [A-Z ]*PRIVATE KEY/.test(fbCfg) && !/service_account/.test(fbCfg));
  const authBridge = fs.readFileSync(path.join(root, 'auth-bridge.html'), 'utf8');
  record('auth-bridge hosts Google popup/redirect and deep-links id_token with state',
    authBridge.includes('signInWithPopup') && authBridge.includes('com.prismburst.brickodyssey://auth')
    && authBridge.includes('id_token') && authBridge.includes('state') && authBridge.indexOf('console.log') === -1);

    const workflows = fs.readdirSync(path.join(root, '.github/workflows')).filter(name => !name.startsWith('.')).sort();
  record('Pages, the debug APK, and the release workflow are the only workflows', workflows.join(',') === 'android-debug.yml,android-release.yml,pages.yml');
  record('Pages deploy still publishes only the game files', yml.includes('no tests/, scripts/') && yml.includes('cp -r index.html') && yml.includes('auth-bridge.html') && !/\btests\//.test(yml.split('cp -r')[1] || '') && !yml.includes('android-debug'));
  const apk = fs.readFileSync(path.join(root, '.github/workflows/android-debug.yml'), 'utf8');
  const releaseYml = fs.readFileSync(path.join(root, '.github/workflows/android-release.yml'), 'utf8');
  record('debug APK workflow validates, syncs, and uploads the debug artifact',
    apk.includes('android-actions/setup-android@v4') && apk.includes('platforms;android-36') && apk.includes('npm run validate') && apk.includes('node scripts/copy-web.js') && apk.includes('npx cap sync android') && apk.includes('assembleDebug') && apk.includes('name: prismburst-debug-apk') && apk.includes('app-debug.apk') && !/\$\{\{\s*secrets\./.test(apk) && !/KEYSTORE_/.test(apk));
  const flagSrc = fs.readFileSync(path.join(root, 'js/build-flags.js'), 'utf8');
  const flagCtx = { window: {} };
  flagCtx.globalThis = flagCtx;
  flagCtx.window = flagCtx;
  vm.runInNewContext(flagSrc, flagCtx);
  const flagOff = flagCtx.PB.levelsOpen() === false;
  flagCtx.PB.BUILD.levelsOpen = true;
  const flagHalf = flagCtx.PB.levelsOpen() === false;
  flagCtx.PB.BUILD.debugUnlock = true;
  const flagOn = flagCtx.PB.levelsOpen() === true;
  const menusSrc = fs.readFileSync(path.join(root, 'js/menus.js'), 'utf8');
  const flagDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-flags-'));
  copyWeb.copyWeb(flagDir);
  const copiedFlag = fs.readFileSync(path.join(flagDir, 'js/build-flags.js'), 'utf8');
  const wrote = spawnSync(process.execPath, ['scripts/write-build-flag.js', path.join(flagDir, 'js/build-flags.js')], { cwd: root, encoding: 'utf8' });
  const stamped = fs.readFileSync(path.join(flagDir, 'js/build-flags.js'), 'utf8');
  const sourceAfter = fs.readFileSync(path.join(root, 'js/build-flags.js'), 'utf8');
  const refused = spawnSync(process.execPath, ['scripts/write-build-flag.js', path.join(root, 'js/build-flags.js')], { cwd: root, encoding: 'utf8' });
  fs.rmSync(flagDir, { recursive: true, force: true });
  const copyBeforeWriter = /debugUnlock:\s*false/.test(copiedFlag) && !/debugUnlock:\s*true/.test(copiedFlag);
  const writerOnlyWww = wrote.status === 0 && /debugUnlock:\s*true/.test(stamped) && /levelsOpen:\s*false/.test(stamped) && sourceAfter === flagSrc;
  record('the unlock toggle stays out of Pages and release builds',
    /debugUnlock:\s*false/.test(flagSrc) && /levelsOpen:\s*false/.test(flagSrc) && !/debugUnlock:\s*true/.test(flagSrc)
    && flagOff && flagHalf && flagOn
    && menusSrc.includes('PB.BUILD.debugUnlock === true') && menusSrc.includes("unlock.name = 'toggle_unlock'")
    && !yml.includes('write-build-flag') && !releaseYml.includes('write-build-flag')
    && apk.includes('node scripts/write-build-flag.js www/js/build-flags.js')
    && apk.indexOf('node scripts/copy-web.js') < apk.indexOf('write-build-flag')
    && apk.indexOf('write-build-flag') < apk.indexOf('npx cap sync android')
    && copyBeforeWriter && writerOnlyWww && refused.status !== 0,
    wrote.stderr || refused.stderr);
  const releaseSecrets = ['KEYSTORE_BASE64', 'KEYSTORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'];
  record('release workflow signs on demand and proves signing on pull requests with a throwaway key',
    releaseYml.includes('workflow_dispatch:') &&
    /tags:\s*\n\s*- ['"]v\*['"]/.test(releaseYml) &&
    releaseYml.includes('signed-build-smoke:') &&
    releaseYml.includes("github.event_name == 'pull_request'") &&
    releaseYml.includes("github.event_name == 'workflow_dispatch' || github.event_name == 'push'") &&
    releaseYml.includes('bundleRelease') &&
    releaseYml.includes('assembleRelease') &&
    releaseYml.includes('VERSION_NAME: ${{ inputs.versionName }}') &&
    releaseYml.includes('VERSION_CODE: ${{ inputs.versionCode }}') &&
    releaseYml.split('\n').filter(line => /\$\{\{\s*inputs\./.test(line)).every(line => /^\s+VERSION_(NAME|CODE):\s+\$\{\{\s*inputs\.version(Name|Code)\s*\}\}\s*$/.test(line)) &&
    releaseYml.includes('name: prismburst-release-aab') &&
    releaseYml.includes('name: prismburst-release-apk') &&
    releaseYml.includes('apksigner verify --print-certs') &&
    (releaseYml.match(/\$ANDROID_HOME"\/build-tools\/\*\//g) || []).length === 2 &&
    releaseYml.includes('jarsigner -verify') &&
    releaseYml.includes('sha256sum') &&
    releaseSecrets.every(name => releaseYml.includes(name)) &&
    releaseYml.includes('RUNNER_TEMP') &&
    releaseYml.includes('if: always()') &&
    releaseYml.includes('rm -f "$RUNNER_TEMP/prismburst-upload.jks"') &&
    releaseYml.includes('rm -f "$RUNNER_TEMP/prismburst-smoke.jks"') &&
    releaseYml.includes('Missing GitHub Actions secret(s):') &&
    !releaseYml.includes('echo "$KEYSTORE_BASE64"') &&
    !releaseYml.includes('echo "$KEYSTORE_PASSWORD"') &&
    !releaseYml.includes('echo "$KEY_ALIAS"') &&
    !releaseYml.includes('echo "$KEY_PASSWORD"') &&
    !/\.jks['"]?\s*$/m.test(releaseYml.split('\n').filter(line => /keystoreFile|storeFile/.test(line)).join('\n')));
  const pkg = require('../package.json');
  const appGradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
  const decodeScript = path.join(root, 'scripts/decode-upload-keystore.py');
  const sample = Buffer.from('throwaway-keystore-bytes');
  const sampleB64 = sample.toString('base64');
  const decodedPath = path.join(os.tmpdir(), 'pb-keystore-decode-test.bin');
  const decodeOut = execFileSync('python3', [decodeScript], {
    env: Object.assign({}, process.env, { KEYSTORE_BASE64: sampleB64, KEYSTORE_PATH: decodedPath }),
    encoding: 'utf8'
  });
  let emptyFailed = false;
  try {
    execFileSync('python3', [decodeScript], {
      env: Object.assign({}, process.env, { KEYSTORE_BASE64: '   ', KEYSTORE_PATH: decodedPath }),
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } catch (err) {
    emptyFailed = true;
  }
  record('keystore decoder writes the bytes and does not print the secret',
    releaseYml.includes('python3 scripts/decode-upload-keystore.py') &&
    fs.readFileSync(decodedPath).equals(sample) &&
    !decodeOut.includes(sampleB64) &&
    !decodeOut.includes(sample.toString()) &&
    emptyFailed);
  fs.rmSync(decodedPath, { force: true });
  record('release version, R8, and signing env come from package.json without printing secrets',
    /^\d+\.\d+\.\d+$/.test(pkg.version) && pkg.androidVersionCode === 8 &&
    appGradle.includes("new File(rootProject.projectDir.parentFile, 'package.json')") &&
    appGradle.includes('debuggable false') &&
    appGradle.includes('minifyEnabled true') &&
    appGradle.includes('shrinkResources true') &&
    appGradle.includes('proguard-rules.pro') &&
    appGradle.includes('PRISMBURST_KEYSTORE') &&
    appGradle.includes('v1SigningEnabled true') &&
    appGradle.includes('v2SigningEnabled true') &&
    appGradle.includes('Values are not printed'));
  const variables = fs.readFileSync(path.join(root, 'android/variables.gradle'), 'utf8');
  record('compile and target SDK meet the Play API 36 requirement and minSdk stays 24',
    /compileSdkVersion = 36/.test(variables) && /targetSdkVersion = 36/.test(variables) && /minSdkVersion = 24/.test(variables));
  const banned = ['tests', 'scripts', 'supabase', 'docs', 'node_modules', '.github'];
  record('Capacitor web copy is the shipped game only',
    copyWeb.INCLUDE_FILES.indexOf('index.html') >= 0 && copyWeb.INCLUDE_FILES.indexOf('config.js') >= 0 && copyWeb.INCLUDE_FILES.indexOf('auth-bridge.html') >= 0 && copyWeb.INCLUDE_FILES.indexOf('privacy.html') >= 0 && copyWeb.INCLUDE_DIRS.indexOf('js') >= 0 && copyWeb.INCLUDE_DIRS.indexOf('lib') >= 0 && copyWeb.INCLUDE_DIRS.indexOf('icons') >= 0 && banned.every(name => copyWeb.INCLUDE_FILES.indexOf(name) < 0 && copyWeb.INCLUDE_DIRS.indexOf(name) < 0));
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-www-'));
  copyWeb.copyWeb(dest);
  record('copied web dir has the game and omits repo-only folders',
    fs.existsSync(path.join(dest, 'index.html')) && fs.existsSync(path.join(dest, 'js/cloud.js')) && fs.existsSync(path.join(dest, 'js/home.js')) && fs.existsSync(path.join(dest, 'js/home-ui.js')) && fs.existsSync(path.join(dest, 'lib/firebase-app-compat.js')) && fs.existsSync(path.join(dest, 'js/firebase-config.js')) && fs.existsSync(path.join(dest, 'auth-bridge.html')) && banned.every(name => !fs.existsSync(path.join(dest, name))));
  fs.rmSync(dest, { recursive: true, force: true });
  record('service worker registration is skipped when Capacitor is present',
    html.includes('isNativePlatform') && html.includes("navigator.serviceWorker.register('sw.js')") &&
    html.includes('unregister') && html.includes('caches.delete'));
  const cloudJs = fs.readFileSync(path.join(root, 'js/cloud.js'), 'utf8');
  record('native Google sign-in uses auth-bridge + deep link credential (no WebView OAuth)',
    cloudJs.includes("var NATIVE_AUTH_URL = 'com.prismburst.brickodyssey://auth'") &&
    cloudJs.includes('auth-bridge.html') && cloudJs.includes('signInWithCredential') &&
    cloudJs.includes('GoogleAuthProvider.credential') && cloudJs.includes('isNativePlatform') &&
    cloudJs.includes('signInWithPopup'));
  record('native plugins prefer Capacitor.Plugins then registerPlugin, with openExternalUrl fallback',
    cloudJs.includes('window.Capacitor.Plugins') && cloudJs.includes('function openExternalUrl') &&
    cloudJs.includes("window.open(url, '_system')") && cloudJs.includes('openExternalUrl(bridge)') &&
    cloudJs.indexOf('bag[name]') < cloudJs.indexOf('registerPlugin(name)'));
  record('native open uses OpenUrl Intent fallback and diagnostic step codes',
    cloudJs.includes("nativePlugin('OpenUrl')") && cloudJs.includes('browserDiag') &&
    cloudJs.includes("APP_VERSION = '1.5.0'") && cloudJs.includes('purgeNativeServiceWorker') &&
    !cloudJs.includes('The system browser is unavailable'));
  record('nonce/state is checked on deep-link return and tokens are never logged',
    cloudJs.includes('readBridgeState') && cloudJs.includes('parsed.state !== expected.state') &&
    cloudJs.includes('Never log or display tokens') && !/console\.(log|debug|info)\([^)]*idToken/.test(cloudJs));
  record('network retries use capped exponential backoff',
    cloudJs.includes('function backoffDelay') && cloudJs.includes('withBackoff') &&
    cloudJs.includes('MAX_BACKOFF_MS') && cloudJs.includes('Cloud._test'));
  record('MainActivity registers OpenUrlPlugin before the bridge starts',
    fs.readFileSync(path.join(root, 'android/app/src/main/java/com/prismburst/brickodyssey/MainActivity.java'), 'utf8').includes('registerPlugin(OpenUrlPlugin.class)') &&
    fs.existsSync(path.join(root, 'android/app/src/main/java/com/prismburst/brickodyssey/OpenUrlPlugin.java')));
  record('app build.gradle pins androidx.browser and variables declare the version',
    fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8').includes('androidx.browser:browser:$androidxBrowserVersion') &&
    fs.readFileSync(path.join(root, 'android/variables.gradle'), 'utf8').includes("androidxBrowserVersion = '1.9.0'"));
  const cap = fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8');
  record('Capacitor app id and name match the debug app', cap.includes('"appId": "com.prismburst.brickodyssey"') && cap.includes('"appName": "PRISMBURST"') && cap.includes('"webDir": "www"'));
  const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  record('Android manifest accepts the auth return scheme', manifest.includes('android:scheme="com.prismburst.brickodyssey"') && manifest.includes('android:host="auth"'));
  record('Android manifest declares Custom Tabs and https/http VIEW package visibility queries',
    manifest.includes('android.support.customtabs.action.CustomTabsService') &&
    manifest.includes('android.intent.action.VIEW') &&
    manifest.includes('android.intent.category.BROWSABLE') &&
    manifest.includes('android:scheme="https"') &&
    manifest.includes('android:scheme="http"') &&
    manifest.includes('<queries>'));
  record('release manifest blocks backup and cleartext, and WebView debugging is not forced on',
    manifest.includes('android:allowBackup="false"') &&
    manifest.includes('android:usesCleartextTraffic="false"') &&
    !cap.includes('webContentsDebuggingEnabled'));

  const nameUi = fs.readFileSync(path.join(root, 'js/account.js'), 'utf8')
    + fs.readFileSync(path.join(root, 'js/profile.js'), 'utf8')
    + fs.readFileSync(path.join(root, 'js/cloud.js'), 'utf8');
  record('display names are assigned with textContent and never innerHTML', nameUi.includes('textContent') && !nameUi.includes('innerHTML'));
  record('account sheet shows app version and a resend confirmation control',
    html.includes('id="pb-acct-version"') && html.includes('data-action="resend-confirm"') &&
    html.includes('Resend confirmation email') &&
    fs.readFileSync(path.join(root, 'js/account.js'), 'utf8').includes("ver.textContent = 'v' + (PB.VERSION || '')") &&
    fs.readFileSync(path.join(root, 'js/account.js'), 'utf8').includes("outcome === 'exists'") &&
    fs.readFileSync(path.join(root, 'js/account.js'), 'utf8').includes('resendConfirmEmail'));
  record('signUp maps email-already-in-use to exists and never uses innerHTML for the notice',
    cloudJs.includes("lastSignupOutcome = 'exists'") &&
    cloudJs.includes('This email already has an account. Log in or use Forgot password.') &&
    cloudJs.includes('spam/junk folder') &&
    cloudJs.includes('sendEmailVerification') &&
    cloudJs.includes('resendConfirmEmail') &&
    cloudJs.includes('confirmWaitMs') &&
    cloudJs.includes('auth/email-already-in-use') &&
    cloudJs.includes('auth/too-many-requests') &&
    cloudJs.includes('auth/wrong-password') &&
    cloudJs.includes('Cloud save not set up yet') &&
    !/innerHTML\s*=/.test(cloudJs));
  // Runtime check of the friendly auth error mapper without loading Firebase.
  const feStart = cloudJs.indexOf('function friendlyError(err)');
  if (feStart < 0) throw new Error('friendlyError missing');
  let feEnd = feStart, depth = 0, started = false;
  for (; feEnd < cloudJs.length; feEnd++) {
    const ch = cloudJs[feEnd];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) { feEnd++; break; } }
  }
  const friendlyError = vm.runInNewContext(cloudJs.slice(feStart, feEnd) + '; friendlyError');
  record('friendlyError covers Firebase auth codes without leaking raw codes',
    friendlyError({ code: 'auth/email-already-in-use' }).indexOf('already has an account') >= 0 &&
    friendlyError({ code: 'auth/wrong-password' }).indexOf('incorrect') >= 0 &&
    friendlyError({ code: 'auth/too-many-requests' }).indexOf('Too many tries') >= 0 &&
    friendlyError({ code: 'auth/network-request-failed' }).indexOf('offline') >= 0 &&
    friendlyError({ code: 'auth/email-already-in-use' }).indexOf('auth/email-already-in-use') === -1);

  function extractFn(src, name) {
    const start = src.indexOf('function ' + name);
    if (start < 0) throw new Error('missing ' + name);
    let end = start, depth = 0, started = false;
    for (; end < src.length; end++) {
      const ch = src[end];
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') { depth--; if (started && depth === 0) { end++; break; } }
    }
    return src.slice(start, end);
  }
  const helpers = vm.runInNewContext(
    extractFn(cloudJs, 'isPlaceholder') + ';' +
    extractFn(cloudJs, 'looksLikeServiceAccount') + ';' +
    extractFn(cloudJs, 'usableFirebase') + ';' +
    '({ usableFirebase: usableFirebase, isPlaceholder: isPlaceholder, looksLikeServiceAccount: looksLikeServiceAccount })'
  );
  record('placeholder Firebase config is not usable',
    helpers.isPlaceholder('PLACEHOLDER_API_KEY') === true &&
    helpers.usableFirebase({
      apiKey: 'PLACEHOLDER_API_KEY', authDomain: 'PLACEHOLDER_AUTH_DOMAIN', projectId: 'PLACEHOLDER_PROJECT_ID',
      storageBucket: 'PLACEHOLDER_STORAGE_BUCKET', messagingSenderId: 'PLACEHOLDER_MESSAGING_SENDER_ID', appId: 'PLACEHOLDER_APP_ID'
    }) === false);
  record('filled Firebase web config is usable and service accounts are rejected',
    helpers.usableFirebase({
      apiKey: 'AIzaSyTestOnlyNotReal000', authDomain: 'demo.firebaseapp.com', projectId: 'demo',
      storageBucket: 'demo.appspot.com', messagingSenderId: '123', appId: '1:123:web:abc'
    }) === true &&
    helpers.looksLikeServiceAccount({ type: 'service_account', private_key: 'x' }) === true);

  const bdStart = cloudJs.indexOf('function backoffDelay(attempt)');
  let bdEnd = bdStart, d2 = 0, st2 = false;
  for (; bdEnd < cloudJs.length; bdEnd++) {
    const ch = cloudJs[bdEnd];
    if (ch === '{') { d2++; st2 = true; }
    else if (ch === '}') { d2--; if (st2 && d2 === 0) { bdEnd++; break; } }
  }
  const backoffDelay = vm.runInNewContext('var MAX_BACKOFF_MS = 8000; ' + cloudJs.slice(bdStart, bdEnd) + '; backoffDelay');
  record('backoff delay doubles and caps',
    backoffDelay(1) === 250 && backoffDelay(2) === 500 && backoffDelay(3) === 1000 && backoffDelay(10) === 8000);

  const parseStart = cloudJs.indexOf('function parseNativeAuthUrl(raw)');
  let parseEnd = parseStart, d3 = 0, st3 = false;
  for (; parseEnd < cloudJs.length; parseEnd++) {
    const ch = cloudJs[parseEnd];
    if (ch === '{') { d3++; st3 = true; }
    else if (ch === '}') { d3--; if (st3 && d3 === 0) { parseEnd++; break; } }
  }
  const parseNativeAuthUrl = vm.runInNewContext(cloudJs.slice(parseStart, parseEnd) + '; parseNativeAuthUrl', { URL: URL, URLSearchParams: URLSearchParams });
  const deep = parseNativeAuthUrl('com.prismburst.brickodyssey://auth#id_token=abc&state=xyz');
  record('deep-link parser extracts id_token and state without other schemes',
    deep && deep.idToken === 'abc' && deep.state === 'xyz' && parseNativeAuthUrl('https://evil.example/#id_token=x') === null);

    record('the Google button is an inline SVG and is not fetched',
    html.includes('data-action="google"') && html.includes('<svg') && html.includes('#4285') === false && html.includes('#FFC107') && html.includes('Continue with Google') && !/googleusercontent|gstatic\.com|logo\.svg/.test(html));
} catch (err) {
  record('unit suite crashed', false, err.stack);
}

const passed = results.filter(r => r.pass).length;
console.log('\n' + passed + '/' + results.length + ' passed');
if (passed !== results.length) process.exit(1);
