#!/usr/bin/env node
/* Play Store prep (1.4.1): account deletion core, migration 004, honest
 * Settings footer, public pages, version bump, no innerHTML. No network. */
'use strict';
const fs = require('fs');
const path = require('path');
const Core = require('../js/delete-core');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail && !pass ? ' — ' + detail : ''));
}

function memStorage(init) {
  const map = new Map(Object.entries(init || {}));
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] || null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    dump() { return Object.fromEntries(map); }
  };
}

function fakeClient(opts) {
  const calls = [];
  return {
    calls,
    rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve(opts && opts.error ? { data: null, error: opts.error } : { data: null, error: null }); },
    auth: { signOut(o) { calls.push(['signOut', o && o.scope]); return Promise.resolve({ error: null }); } }
  };
}

(async () => {
  try {
    // --- confirmation phrase
    record('phrase is DELETE', Core.PHRASE === 'DELETE');
    record('matches exact DELETE (trimmed)', Core.matches('DELETE') && Core.matches('  DELETE '));
    record('rejects lowercase, partial, empty, null', !Core.matches('delete') && !Core.matches('DELET') && !Core.matches('') && !Core.matches(null) && !Core.matches('DELETE ME'));

    // --- run()
    {
      const c = fakeClient();
      let err = null;
      try { await Core.run(c, 'delete'); } catch (e) { err = e; }
      record('run without the phrase rejects and makes no call', err && c.calls.length === 0);
    }
    {
      const c = fakeClient();
      const ok = await Core.run(c, 'DELETE');
      record('run calls rpc delete_my_account with no arguments', ok === true && c.calls[0][0] === 'rpc' && c.calls[0][1] === 'delete_my_account' && c.calls[0][2] === undefined, JSON.stringify(c.calls));
      record('run then signs out locally only', c.calls[1] && c.calls[1][0] === 'signOut' && c.calls[1][1] === 'local');
    }
    {
      const c = fakeClient({ error: { code: 'PGRST202', message: 'Could not find the function public.delete_my_account' } });
      let err = null;
      try { await Core.run(c, 'DELETE'); } catch (e) { err = e; }
      record('server error propagates and session is kept', err && err.code === 'PGRST202' && c.calls.length === 1);
    }
    {
      const store = memStorage({ 'prismburst.save.v1': '{"coins":9}' });
      const c = fakeClient();
      await Core.run(c, 'DELETE');
      record('run never touches the device save', store.getItem('prismburst.save.v1') === '{"coins":9}');
    }

    // --- clearDevice()
    {
      const store = memStorage({
        'prismburst.save.v1': '{}', 'prismburst.cloud.meta.v1': '{}',
        'prismburst.save.backup.2026-01-01': '{}', 'prismburst.save.backup.2026-02-02': '{}',
        'prismburst.profile.v1': '{"name":"PrismPlayer1"}', 'other.app': 'x'
      });
      const removed = Core.clearDevice(store);
      const left = Object.keys(store.dump()).sort();
      record('clearDevice removes save, backups and sync meta', removed.length === 4 && store.getItem('prismburst.save.v1') === null);
      record('clearDevice keeps guest name and unrelated keys', JSON.stringify(left) === JSON.stringify(['other.app', 'prismburst.profile.v1']), JSON.stringify(left));
    }

    // --- migration 004
    const sql = read('supabase/migrations/004_delete_my_account.sql');
    const code = sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n').toLowerCase();
    record('004 defines public.delete_my_account()', /create or replace function public\.delete_my_account\(\)/.test(code));
    record('004 is security definer with empty search_path', code.includes('security definer') && /set search_path = ''/.test(code));
    record('004 uses auth.uid() and refuses anonymous callers', code.includes('auth.uid()') && code.includes("errcode = '42501'"));
    const deletes = code.match(/delete from [^;]+;/g) || [];
    record('004 deletes only rows of the caller', deletes.length === 3 && deletes.every(d => /where (user_id|id) = uid;$/.test(d.trim())), JSON.stringify(deletes));
    record('004 deletes player_saves, profiles and auth.users', code.includes('delete from public.player_saves') && code.includes('delete from public.profiles') && code.includes('delete from auth.users'));
    record('004 revokes public and anon, grants authenticated only', /revoke all on function public\.delete_my_account\(\) from public;/.test(code) && /revoke all on function public\.delete_my_account\(\) from anon;/.test(code) && /grant execute on function public\.delete_my_account\(\) to authenticated;/.test(code) && !/grant[^;]*to (anon|public)/.test(code));
    const allSql = fs.readdirSync(path.join(root, 'supabase/migrations')).map(f => read('supabase/migrations/' + f)).join('\n') + read('supabase/schema.sql');
    record('no migration disables row level security', !/disable row level security/i.test(allSql) && !/no force row level security/i.test(allSql));

    // --- client code
    const cloud = read('js/cloud.js');
    const account = read('js/account.js');
    const page = read('js/delete-page.js');
    const coreSrc = read('js/delete-core.js');
    record('client calls the RPC through DeleteCore only', coreSrc.includes("var RPC = 'delete_my_account'") && cloud.includes('core.run(self.client, typed)') && page.includes('core.run(client, typed)'));
    record('no innerHTML / outerHTML / insertAdjacentHTML / document.write in account, delete and cloud code',
      [cloud, account, page, coreSrc].every(s => !/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(s)));
    record('deleteAccount does not clear the device save', (() => {
      const body = cloud.slice(cloud.indexOf('deleteAccount: function'), cloud.indexOf('clearDeviceProgress: function'));
      return body.length > 100 && !/clearDevice|Save\.reset|removeItem\(SAVE_KEY/.test(body);
    })());
    record('device is cleared only from the explicit clear-device action', /action === 'clear-device'[\s\S]{0,400}clearDeviceProgress\(\)/.test(account) && (account.match(/clearDeviceProgress\(/g) || []).length === 1);
    record('delete page never reads user.email', !/user\.email|\.user\.email|session\.user\.email/.test(page));
    record('delete page has no Facebook sign-in', !/facebook/i.test(read('delete-account.html')) || /Facebook sign-in is not available/.test(read('delete-account.html')));
    record('no privileged key in new files', ![coreSrc, page, read('delete-account.html'), read('privacy-policy.html')].some(s => /sb_secret_[A-Za-z0-9]{8,}|service_role|eyJ[A-Za-z0-9_-]{10,}\./.test(s)));

    // --- footer
    const menus = read('js/menus.js');
    const m = menus.match(/PB\.SETTINGS_FOOTER = '([^']+)'/);
    const footer = m ? m[1] : '';
    record('old "No ads and no tracking" footer is gone', !/No ads and no tracking/.test(menus));
    record('footer says demo ads promote PRISMBURST itself', /Demo ads only promote PRISMBURST itself/.test(footer));
    record('footer says no third-party ad SDK and no tracking', /No third-party ad SDK/.test(footer) && /no tracking/.test(footer));
    record('footer says cloud save only when signed in', /cloud save runs only when you sign in/.test(footer));
    record('Settings has Delete account and Privacy policy buttons', menus.includes("'Delete account'") && menus.includes("openPage('privacy-policy.html')"));

    // --- pages and packaging
    const pp = read('privacy-policy.html');
    const da = read('delete-account.html');
    record('privacy policy lists email, display name, save, no ads SDK, no analytics', /Email address/.test(pp) && /display name/i.test(pp) && /game save/i.test(pp) && /no third-party advertising SDK/i.test(pp) && /no analytics/i.test(pp));
    record('privacy policy has retention and deletion link', /<h2>Retention<\/h2>/.test(pp) && pp.includes('href="delete-account.html"'));
    record('privacy policy has the developer contact email and no placeholder', !/\[CONTACT EMAIL/.test(pp) && /mailto:hamzaxali44@gmail\.com/.test(pp));
    record('delete page explains in-app and web deletion', /Option 1: in the game/.test(da) && /Option 2: on this page/.test(da) && /What is deleted/.test(da));
    record('delete page has no email address in it', !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/i.test(da));
    record('old privacy.html forwards to privacy-policy.html', /url=privacy-policy\.html/.test(read('privacy.html')));
    const pkg = JSON.parse(read('package.json'));
    record('version 1.4.1 / versionCode 3 everywhere', pkg.version === '1.4.1' && pkg.androidVersionCode === 3 && menus.includes("PB.VERSION = '1.4.1'") && read('sw.js').includes("prismburst-v1.4.1"));
    const sw = read('sw.js');
    record('service worker precaches new pages and scripts', ['./privacy-policy.html', './delete-account.html', './js/delete-core.js', './js/delete-page.js'].every(f => sw.includes("'" + f + "'")));
    const copyWeb = require('../scripts/copy-web.js');
    record('Android www copy includes the new pages', copyWeb.INCLUDE_FILES.includes('privacy-policy.html') && copyWeb.INCLUDE_FILES.includes('delete-account.html'));
    const pagesYml = read('.github/workflows/pages.yml');
    record('Pages workflow publishes the new pages and still validates', pagesYml.includes('privacy-policy.html') && pagesYml.includes('delete-account.html') && pagesYml.includes('check-secrets.js') && pagesYml.includes('deploy-pages'));
    record('index loads delete-core before cloud', read('index.html').indexOf('js/delete-core.js') > 0 && read('index.html').indexOf('js/delete-core.js') < read('index.html').indexOf('js/cloud.js'));
    record('save key prismburst.save.v1 unchanged', Core.SAVE_KEY === 'prismburst.save.v1' && read('js/core.js').includes("var SAVE_KEY = 'prismburst.save.v1'"));
    record('debug unlock still off in committed build flags', /debugUnlock: false, levelsOpen: false/.test(read('js/build-flags.js')));
    // --- store listing text and graphics
    const doc = read('docs/PLAY-STORE.md');
    const blocks = Array.from(doc.matchAll(/```\n([\s\S]*?)```/g)).map(x => x[1].trim());
    const [appName, shortDesc, fullDesc, notes] = blocks;
    record('store app name <= 30 chars', appName === 'PRISMBURST: Brick Odyssey' && appName.length <= 30, appName);
    record('store short description <= 80 chars', shortDesc && shortDesc.length <= 80, shortDesc && shortDesc.length);
    record('store full description <= 4000 chars and mentions account deletion', fullDesc && fullDesc.length <= 4000 && /delete your account/i.test(fullDesc));
    record('release notes <= 500 chars', notes && notes.length <= 500);
    record('Play guide covers payment, 12 testers / 14 days, AAB artifact, Play App Signing, secrets',
      /\$25/.test(doc) && /12/.test(doc) && /14 days/.test(doc) && /prismburst-release-aab/.test(doc) && /Play App Signing/.test(doc) && /KEYSTORE_BASE64/.test(doc) && /NOT VERIFIED/.test(doc));
    function png(file) {
      const b = fs.readFileSync(path.join(root, file));
      const sig = b.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
      return { sig, w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], colorType: b[25] };
    }
    const icon = png('store/icon-512.png');
    record('store icon is 512x512 32-bit PNG (RGBA 8-bit)', icon.sig && icon.w === 512 && icon.h === 512 && icon.depth === 8 && icon.colorType === 6, icon);
    const feat = png('store/feature-graphic-1024x500.png');
    record('feature graphic is 1024x500 PNG', feat.sig && feat.w === 1024 && feat.h === 500, feat);
    const shots = fs.readdirSync(path.join(root, 'store/screenshots')).filter(f => f.endsWith('.png'));
    const dims = shots.map(f => png('store/screenshots/' + f));
    record('at least 4 phone screenshots, all 1080x1920', shots.length >= 4 && dims.every(d => d.sig && d.w === 1080 && d.h === 1920), dims);
    record('store/ is not shipped with the game', !copyWeb.INCLUDE_DIRS.includes('store') && !pagesYml.includes(' store'));
    record('Facebook still off in config', /facebook: false/.test(read('config.js')));
  } catch (e) {
    record('unit run crashed', false, e && e.stack);
  }
  const passed = results.filter(r => r.pass).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  process.exit(passed === results.length ? 0 : 1);
})();
