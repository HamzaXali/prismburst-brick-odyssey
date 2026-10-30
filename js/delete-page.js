/*
 * PRISMBURST — delete-page.js
 * Public account deletion page (delete-account.html). Uses only the public
 * Firebase web config from js/firebase-config.js. Deletion removes the
 * caller's Firestore docs then Auth user via js/delete-core.js. All text is
 * set with textContent. The email address is never shown on the page.
 */
(function () {
  'use strict';
  var core = window.PB && window.PB.DeleteCore;
  function $(id) { return document.getElementById(id); }
  function say(text) { $('msg').textContent = text || ''; }
  function show(id, on) { var el = $(id); if (el) el.hidden = !on; }

  function isPlaceholder(v) { return !v || /^PLACEHOLDER_/i.test(String(v)); }
  function usable(cfg) {
    if (!cfg) return false;
    return !['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId']
      .some(function (k) { return isPlaceholder(cfg[k]); });
  }

  var cfg = window.PB_FIREBASE || {};
  var providers = (window.PB_CONFIG && window.PB_CONFIG.providers) || {};
  var lib = window.firebase;
  if (!core || !usable(cfg) || !lib || typeof lib.initializeApp !== 'function') {
    show('del-off', true);
    return;
  }

  if (!lib.apps.length) lib.initializeApp(cfg);
  var auth = lib.auth();
  var db = lib.firestore();
  var user = null;
  var deleted = false;
  var busy = false;

  function providerLabel(u) {
    var data = u && u.providerData && u.providerData[0];
    var id = data && data.providerId;
    if (id === 'google.com') return 'Google';
    if (id === 'password') return 'email';
    return 'your account';
  }

  function render() {
    var signedIn = !!user;
    show('del-signin', !signedIn && !deleted);
    show('del-confirm', signedIn && !deleted);
    show('del-done', deleted);
    $('del-google').disabled = busy || providers.google !== true;
    $('del-login').disabled = busy || providers.email !== true;
    $('del-go').disabled = busy || !core.matches($('del-typed').value);
    $('del-signout').disabled = busy;
    if (signedIn) $('del-who').textContent = 'Signed in with ' + providerLabel(user) + '.';
  }

  function friendly(err) {
    var msg = String(err && (err.message || err.code) || '');
    var low = msg.toLowerCase();
    if (low.indexOf('requires-recent-login') !== -1) return 'For security, sign in again, then delete the account. Nothing was deleted.';
    if (low.indexOf('wrong-password') !== -1 || low.indexOf('invalid-credential') !== -1 || low.indexOf('user-not-found') !== -1) return 'That email or password is incorrect.';
    if (low.indexOf('failed to fetch') !== -1 || low.indexOf('network') !== -1) return 'You appear to be offline. Nothing was deleted.';
    return msg || 'Something went wrong. Nothing was deleted.';
  }

  function run(fn) {
    if (busy) return;
    busy = true; say('Working…'); render();
    Promise.resolve().then(fn).then(function () { busy = false; render(); }, function (err) { busy = false; say(friendly(err)); render(); });
  }

  auth.onAuthStateChanged(function (u) {
    if (deleted) return;
    user = u || null;
    render();
  });

  $('del-google').addEventListener('click', function () {
    run(function () {
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('openid');
      provider.addScope('email');
      provider.addScope('profile');
      return auth.signInWithPopup(provider);
    });
  });

  $('del-email-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var email = ($('del-email').value || '').trim();
    var pass = $('del-pass').value || '';
    if (!email || email.indexOf('@') < 1) { say('Enter a valid email address.'); return; }
    if (!pass) { say('Enter your password.'); return; }
    run(function () {
      return auth.signInWithEmailAndPassword(email, pass).then(function () {
        $('del-pass').value = '';
        say('Signed in. Type DELETE below to confirm.');
      });
    });
  });

  $('del-typed').addEventListener('input', render);
  $('del-go').addEventListener('click', function () {
    run(function () {
      return core.run({ auth: auth, db: db, user: auth.currentUser }, $('del-typed').value).then(function () {
        deleted = true;
        user = null;
        say('');
      });
    });
  });
  $('del-signout').addEventListener('click', function () {
    run(function () { return auth.signOut().then(function () { say('Signed out. Nothing was deleted.'); }); });
  });
  $('del-keep').addEventListener('click', function () {
    say('Progress on this device was kept.');
  });
  $('del-clear').addEventListener('click', function () {
    core.clearDevice(window.localStorage);
    say('Progress on this device was cleared.');
  });
  render();
})();
