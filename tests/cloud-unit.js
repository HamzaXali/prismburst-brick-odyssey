#!/usr/bin/env node
/* Unit tests for the cloud merge rule, validation, shipped-file secret scan,
 * and the SQL/policy text. No browser and no network. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sync = require('../js/save-sync');
const profile = require('../js/profile');
const secrets = require('../scripts/check-secrets');

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
  const extra = sync.validateCloudData(Object.assign(cloudOf(local), { injected: true }), bounds);
  record('unknown field is rejected', extra.ok === false);
  const huge = cloudOf(local);
  huge.levels = {};
  for (let i = 0; i < 20; i++) huge.levels['0-' + i] = { best: 1, stars: 1 };
  huge.missions = { date: null, list: [] };
  const padded = 'x'.repeat(70000);
  const tooBig = sync.validateCloudData(Object.assign(cloudOf(base()), { missions: { date: null, list: [{ type: 'bricks', target: 1, reward: 0, text: padded, progress: 0, claimed: false }] } }), bounds);
  record('oversized cloud save is rejected', tooBig.ok === false);

  const cfg = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(cfg, sandbox);
  const shipped = sandbox.window.PB_CONFIG || {};
  const shippedUrl = String(shipped.supabaseUrl || '');
  const shippedKey = String(shipped.supabaseAnonKey || '');
  const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(shippedUrl);
  let anonJwt = false;
  const keyParts = shippedKey.split('.');
  if (keyParts.length === 3 && keyParts[0].indexOf('eyJ') === 0) {
    try {
      const payload = JSON.parse(Buffer.from(keyParts[1], 'base64url').toString('utf8'));
      anonJwt = !!(payload && payload.role === 'anon');
    } catch (e) { anonJwt = false; }
  }
  const publishable = shippedKey.indexOf('sb_publishable_') === 0 || anonJwt;
  const secret = shippedKey.indexOf('sb_secret_') === 0 || shippedKey.indexOf(secrets.FORBIDDEN_WORD) !== -1;
  const shippedProviders = shipped.providers || {};
  record('shipped config is a public Supabase URL and a publishable key',
    urlOk && publishable && !secret && shippedProviders.google === false && shippedProviders.facebook === false);
  record('email is allowed in config but google and facebook ship off', /email:\s*true/.test(cfg) && /google:\s*false/.test(cfg) && /facebook:\s*false/.test(cfg));
  record('config.js has no JWT', !/eyJ/.test(cfg));

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

  const sql = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8');
  record('schema enables RLS', /enable row level security/i.test(sql));
  record('schema restricts rows with auth.uid() = user_id', /auth\.uid\(\)\s*=\s*user_id/.test(sql));
  record('policies are for authenticated only', /to authenticated/.test(sql) && !/for (select|insert|update|delete|all)[\s\S]{0,120}to anon/i.test(sql));
  record('anon and public are revoked on the table', /revoke all on table public\.player_saves from public, anon/i.test(sql));
  record('no permissive using (true) policy', !/using\s*\(\s*true\s*\)/i.test(sql));
  record('functions are security invoker with a locked search_path', /security invoker/i.test(sql) && /set search_path = pg_catalog, public/i.test(sql) && !/security definer/i.test(sql));
  record('revision conflicts are explicit', /revision_conflict/.test(sql) && /p_expected_revision/.test(sql));
  record('save size is capped under 64 KB', /65536/.test(sql));

  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  record('service worker cache version was bumped and precaches supabase-js', sw.includes('prismburst-v1.2.0') && sw.includes('./lib/supabase.min.js') && sw.includes('./js/profile.js') && sw.includes('./config.js') && sw.includes('./privacy.html') && !sw.includes('prismburst-v1.1.0'));
  record('service worker keeps Supabase network-only and skips OAuth returns', sw.includes('supabase\\.co') && sw.includes("cache: 'no-store'") && sw.includes('code=') && sw.includes('access_token'));

  const yml = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
  record('Pages workflow validates secrets and publishes config and privacy', yml.includes('check-secrets.js') && yml.includes('config.js') && yml.includes('privacy.html') && yml.includes('cloud-unit.js'));

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const order = ['lib/phaser.min.js', 'lib/supabase.min.js', 'config.js', 'levels.js', 'js/core.js', 'js/save-sync.js', 'js/profile.js', 'js/cloud.js', 'js/account.js', 'js/menus.js', 'game.js'];
  let pos = -1;
  let orderOk = true;
  for (const file of order) {
    const at = html.indexOf(file);
    if (at <= pos) orderOk = false;
    pos = at;
  }
  record('page loads phaser, supabase, config, then the game scripts', orderOk);

  const lib = fs.readFileSync(path.join(root, 'lib/supabase.min.js'), 'utf8');
  record('vendored supabase-js is 2.118.0 and exposes createClient', lib.includes('2.118.0') && lib.includes('createClient'));

  const cloudSrc = fs.readFileSync(path.join(root, 'js/cloud.js'), 'utf8') + fs.readFileSync(path.join(root, 'js/account.js'), 'utf8');
  record('cloud code does not delete the local save or clear storage', !cloudSrc.includes("removeItem('prismburst.save.v1')") && !cloudSrc.includes('localStorage.clear'));
  record('cloud code does not ship a mock auth switch', !/PB_MOCK|fakeSupabase|skipBrowserRedirect:\s*true/.test(cloudSrc));

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

  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/002_profiles.sql'), 'utf8');
  const profileSql = sql.slice(sql.indexOf('create table if not exists public.profiles'));
  record('schema.sql contains the profiles migration', profileSql.length > 100 && migration.includes('create table if not exists public.profiles') && profileSql.includes('profiles_guard'));
  function profilesLocked(text) {
    return /alter table public\.profiles enable row level security/i.test(text)
      && /revoke all on table public\.profiles from public, anon/i.test(text)
      && /grant select, insert on table public\.profiles to authenticated/i.test(text)
      && /grant update \(display_name\) on table public\.profiles to authenticated/i.test(text)
      && /auth\.uid\(\)\s*=\s*id/.test(text)
      && /for update[\s\S]{0,180}using \(auth\.uid\(\) = id\)[\s\S]{0,80}with check \(auth\.uid\(\) = id\)/i.test(text)
      && /char_length\(display_name\) between 3 and 20/.test(text)
      && /security invoker/i.test(text)
      && /set search_path = pg_catalog, public/i.test(text)
      && !/security definer/i.test(text)
      && !/using\s*\(\s*true\s*\)/i.test(text)
      && !/to anon/i.test(text)
      && !/for delete/i.test(text)
      && !/grant\s+(select|insert|update|delete|all)[^;]*\bto\s+anon\b/i.test(text)
      && !/\bto anon\b/i.test(text);
  }
  record('profiles RLS allows only the signed-in owner and no anon access', profilesLocked(profileSql) && profilesLocked(migration));
  function timestampsOwned(text) {
    return /before insert or update on public\.profiles/i.test(text)
      && /drop trigger if exists profiles_guard on public\.profiles/i.test(text)
      && /if tg_op = 'INSERT' then[\s\S]*new\.created_at = pg_catalog\.now\(\);[\s\S]*new\.updated_at = pg_catalog\.now\(\);/.test(text)
      && /new\.created_at = old\.created_at/.test(text)
      && /tg_op = 'UPDATE'/.test(text);
  }
  record('profiles trigger sets insert and update timestamps', timestampsOwned(profileSql) && timestampsOwned(migration));
  const guardStart = migration.indexOf('create or replace function public.profiles_guard()');
  record('schema.sql profiles trigger matches the migration', guardStart > 0 && profileSql.includes(migration.slice(guardStart)));
  record('the profiles migration does not change player_saves', !/\b(insert into|update|delete from|drop table|alter table)\s+public\.player_saves\b/i.test(migration));

  const workflows = fs.readdirSync(path.join(root, '.github/workflows')).filter(name => !name.startsWith('.'));
  record('the repo has one Pages workflow', workflows.length === 1 && workflows[0] === 'pages.yml');

  const nameUi = fs.readFileSync(path.join(root, 'js/account.js'), 'utf8')
    + fs.readFileSync(path.join(root, 'js/profile.js'), 'utf8')
    + fs.readFileSync(path.join(root, 'js/cloud.js'), 'utf8');
  record('display names are assigned with textContent and never innerHTML', nameUi.includes('textContent') && !nameUi.includes('innerHTML'));
  record('the Google button is an inline SVG and is not fetched',
    html.includes('data-action="google"') && html.includes('<svg') && html.includes('#4285') === false && html.includes('#FFC107') && html.includes('Continue with Google') && !/googleusercontent|gstatic\.com|logo\.svg/.test(html));
} catch (err) {
  record('unit suite crashed', false, err.stack);
}

const passed = results.filter(r => r.pass).length;
console.log('\n' + passed + '/' + results.length + ' passed');
if (passed !== results.length) process.exit(1);
