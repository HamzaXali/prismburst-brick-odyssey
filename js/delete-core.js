/*
 * PRISMBURST — delete-core.js
 * Account deletion shared by the game (js/cloud.js) and delete-account.html.
 *
 * The browser only holds the publishable key. Deletion runs on the server in
 * public.delete_my_account() (supabase/migrations/004_delete_my_account.sql),
 * a SECURITY DEFINER function that removes only the caller's own rows
 * (auth.uid()) and the caller's auth user. No privileged key is used here.
 *
 * The device save prismburst.save.v1 is never cleared by run(). clearDevice()
 * runs only when the player taps "Also clear this device's progress".
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.DeleteCore = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var PHRASE = 'DELETE';
  var RPC = 'delete_my_account';
  var SAVE_KEY = 'prismburst.save.v1';
  var META_KEY = 'prismburst.cloud.meta.v1';
  var BACKUP_PREFIX = 'prismburst.save.backup.';

  function matches(typed) {
    return String(typed == null ? '' : typed).trim() === PHRASE;
  }

  function timeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('The server did not answer. Nothing was deleted on this device. Try again.')); }, ms);
      Promise.resolve(promise).then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  // Calls the server function, then forgets the session on this device only.
  // Resolves true when the server confirmed the deletion.
  function run(client, typed) {
    if (!matches(typed)) return Promise.reject(new Error('Type ' + PHRASE + ' in capitals to confirm.'));
    if (!client || typeof client.rpc !== 'function') return Promise.reject(new Error('Cloud is not set up on this device.'));
    return timeout(client.rpc(RPC), 20000).then(function (res) {
      if (res && res.error) throw res.error;
      var auth = client.auth;
      if (!auth || typeof auth.signOut !== 'function') return true;
      return Promise.resolve(auth.signOut({ scope: 'local' })).then(function () { return true; }, function () { return true; });
    });
  }

  // Removes this device's game progress, its backups, and the cloud sync
  // bookkeeping. The guest display name (prismburst.profile.v1) is kept.
  function clearDevice(storage) {
    var removed = [];
    if (!storage) return removed;
    var keys = [];
    try {
      for (var i = 0; i < storage.length; i++) {
        var k = storage.key(i);
        if (k === SAVE_KEY || k === META_KEY || (k && k.indexOf(BACKUP_PREFIX) === 0)) keys.push(k);
      }
    } catch (e) { return removed; }
    keys.forEach(function (k) {
      try { storage.removeItem(k); removed.push(k); } catch (e) { /* ignore */ }
    });
    return removed;
  }

  return { PHRASE: PHRASE, RPC: RPC, SAVE_KEY: SAVE_KEY, matches: matches, run: run, clearDevice: clearDevice };
});
