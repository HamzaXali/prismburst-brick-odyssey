#!/usr/bin/env node
/* Unit tests for the cloud merge rule, validation, shipped-file secret scan,
 * and the SQL/policy text. No browser and no network. */
'use strict';
const fs = require('fs');
const path = require('path');
const sync = require('../js/save-sync');
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
  record('config ships empty URL and key', /supabaseUrl:\s*''/.test(cfg) && /supabaseAnonKey:\s*''/.test(cfg));
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
  record('service worker cache version was bumped and precaches supabase-js', sw.includes('prismburst-v1.1.0') && sw.includes('./lib/supabase.min.js') && sw.includes('./config.js') && sw.includes('./privacy.html'));
  record('service worker keeps Supabase network-only and skips OAuth returns', sw.includes('supabase\\.co') && sw.includes("cache: 'no-store'") && sw.includes('code=') && sw.includes('access_token'));

  const yml = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
  record('Pages workflow validates secrets and publishes config and privacy', yml.includes('check-secrets.js') && yml.includes('config.js') && yml.includes('privacy.html') && yml.includes('cloud-unit.js'));

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const order = ['lib/phaser.min.js', 'lib/supabase.min.js', 'config.js', 'levels.js', 'js/core.js', 'js/save-sync.js', 'js/cloud.js', 'js/account.js', 'js/menus.js', 'game.js'];
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
} catch (err) {
  record('unit suite crashed', false, err.stack);
}

const passed = results.filter(r => r.pass).length;
console.log('\n' + passed + '/' + results.length + ' passed');
if (passed !== results.length) process.exit(1);
