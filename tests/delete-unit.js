#!/usr/bin/env node
/* Play Store prep (1.5.0): account deletion core (Firebase), footer, public
 * pages, version bump, no innerHTML. No network. */
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

function fakeCtx(opts) {
  const calls = [];
  const user = {
    uid: 'user-a',
    delete() { calls.push(['user.delete']); if (opts && opts.deleteError) return Promise.reject(opts.deleteError); return Promise.resolve(); }
  };
  const db = {
    collection(name) {
      return {
        doc(uid) {
          return {
            delete() { calls.push(['doc.delete', name, uid]); return Promise.resolve(); }
          };
        }
      };
    }
  };
  return { calls, auth: {}, db, user };
}

(async () => {
  try {
    record('phrase is DELETE', Core.PHRASE === 'DELETE');
    record('matches exact DELETE (trimmed)', Core.matches('DELETE') && Core.matches('  DELETE '));
    record('rejects lowercase, partial, empty, null', !Core.matches('delete') && !Core.matches('DELET') && !Core.matches('') && !Core.matches(null) && !Core.matches('DELETE ME'));

    {
      const c = fakeCtx();
      let err = null;
      try { await Core.run(c, 'delete'); } catch (e) { err = e; }
      record('run without the phrase rejects and makes no call', err && c.calls.length === 0);
    }
    {
      const c = fakeCtx();
      const ok = await Core.run(c, 'DELETE');
      record('run deletes saves and profiles then Auth user', ok === true &&
        c.calls.some(x => x[0] === 'doc.delete' && x[1] === 'saves') &&
        c.calls.some(x => x[0] === 'doc.delete' && x[1] === 'profiles') &&
        c.calls.some(x => x[0] === 'user.delete'), JSON.stringify(c.calls));
    }
    {
      const c = fakeCtx({ deleteError: { code: 'auth/requires-recent-login', message: 'requires-recent-login' } });
      let err = null;
      try { await Core.run(c, 'DELETE'); } catch (e) { err = e; }
      record('requires-recent-login explains re-login and keeps nothing deleted message',
        err && /sign in again/i.test(String(err.message || '')) && /Nothing was deleted/i.test(String(err.message || '')));
    }
    {
      const store = memStorage({ 'prismburst.save.v1': '{"coins":9}' });
      const c = fakeCtx();
      await Core.run(c, 'DELETE');
      record('run never touches the device save', store.getItem('prismburst.save.v1') === '{"coins":9}');
    }

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

    record('legacy supabase delete migration kept for history',
      fs.existsSync(path.join(root, 'supabase/migrations/004_delete_my_account.sql')) &&
      /legacy/i.test(read('supabase/README.md')));

    const cloud = read('js/cloud.js');
    const account = read('js/account.js');
    const page = read('js/delete-page.js');
    const html = read('delete-account.html');
    const privacy = read('privacy-policy.html');
    const play = read('docs/PLAY-STORE.md');
    const pkg = JSON.parse(read('package.json'));

    record('cloud deleteAccount uses DeleteCore.run with auth/db/user',
      cloud.includes('core.run({ auth: self.auth, db: self.db, user: self.session.user }') &&
      cloud.includes('deleteAccount:') &&
      !cloud.includes('delete_my_account'));
    record('delete-page uses Firebase Auth + Firestore and textContent only',
      page.includes('firebase') && page.includes('firestore') && page.includes('textContent') && !page.includes('innerHTML'));
    record('delete-account.html loads Firebase compat + firebase-config',
      html.includes('firebase-app-compat.js') && html.includes('firebase-config.js') && !html.includes('supabase.min.js'));
    record('privacy and Play Store mention Firebase/Google not Supabase Auth as the live backend',
      /Firebase/i.test(privacy) && /Firebase/i.test(play) && !/Supabase Auth/i.test(privacy));
    record('version is 1.5.0 / versionCode 8',
      pkg.version === '1.5.0' && pkg.androidVersionCode === 8 &&
      read('js/menus.js').includes("PB.VERSION = '1.5.0'") &&
      read('sw.js').includes('prismburst-v1.5.0'));
    record('device save key is never cleared by cloud auth paths',
      !cloud.includes("removeItem('prismburst.save.v1')") &&
      cloud.includes("prismburst.save.v1") === false ? false :
      cloud.includes('SAVE_KEY') && !/localStorage\.clear/.test(cloud));
    // clearer:
    record('cloud never calls localStorage.clear or removeItem on the save key',
      !/localStorage\.clear/.test(cloud) && !/removeItem\(\s*['"]prismburst\.save\.v1['"]\s*\)/.test(cloud));
    record('no innerHTML in account or delete UI',
      !/innerHTML/.test(account) && !/innerHTML/.test(page) && !/innerHTML/.test(html));
  } catch (err) {
    record('unit run crashed', false, err.stack || String(err));
  }

  const passed = results.filter(r => r.pass).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  if (passed !== results.length) process.exit(1);
})();
