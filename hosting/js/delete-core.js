/*
 * PRISMBURST — delete-core.js
 * Account deletion shared by the game (js/cloud.js) and delete-account.html.
 *
 * The browser only holds the public Firebase web config. Deletion removes the
 * caller's own Firestore docs (saves/{uid}, profiles/{uid}) then calls
 * user.delete(). No Admin SDK or service-account key is used here.
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

  // ctx: { auth, db, user } from Firebase Auth + Firestore.
  // Deletes Firestore docs first, then the Auth user. Resolves true on success.
  function run(ctx, typed) {
    if (!matches(typed)) return Promise.reject(new Error('Type ' + PHRASE + ' in capitals to confirm.'));
    if (!ctx || !ctx.user || !ctx.db || !ctx.auth) {
      return Promise.reject(new Error('Cloud is not set up on this device.'));
    }
    var uid = ctx.user.uid;
    if (!uid) return Promise.reject(new Error('Sign in to the account you want to delete first. Nothing was deleted.'));
    var saveRef = ctx.db.collection('saves').doc(uid);
    var profileRef = ctx.db.collection('profiles').doc(uid);
    return timeout(Promise.all([
      saveRef.delete().catch(function () { return null; }),
      profileRef.delete().catch(function () { return null; })
    ]).then(function () {
      return ctx.user.delete();
    }), 20000).then(function () {
      return true;
    }, function (err) {
      var code = String(err && err.code || '');
      if (code === 'auth/requires-recent-login') {
        throw new Error('For security, sign in again, then delete the account. Nothing was deleted.');
      }
      throw err;
    });
  }

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

  return { PHRASE: PHRASE, SAVE_KEY: SAVE_KEY, matches: matches, run: run, clearDevice: clearDevice };
});
