/*
 * PRISMBURST — delete-page.js
 * Public account deletion page (delete-account.html). Uses only the Supabase
 * URL and publishable key from config.js. Deletion is done by the server
 * function delete_my_account() through js/delete-core.js. All text is set
 * with textContent. The email address is never shown on the page.
 */
(function () {
  'use strict';
  var core = window.PB && window.PB.DeleteCore;
  function $(id) { return document.getElementById(id); }
  function say(text) { $('msg').textContent = text || ''; }
  function show(id, on) { var el = $(id); if (el) el.hidden = !on; }

  var cfg = window.PB_CONFIG || {};
  var url = String(cfg.supabaseUrl || '').trim();
  var key = String(cfg.supabaseAnonKey || '').trim();
  var providers = cfg.providers || {};
  var lib = window.supabase;
  var looksSecret = key.indexOf('sb_secret_') === 0;
  if (!core || !url || !key || looksSecret || !lib || typeof lib.createClient !== 'function') {
    show('del-off', true);
    return;
  }

  var client = lib.createClient(url, key, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
  });
  var session = null;
  var deleted = false;
  var busy = false;

  function providerLabel(user) {
    var name = user && user.app_metadata && user.app_metadata.provider;
    if (name === 'google') return 'Google';
    if (name === 'email') return 'email';
    return 'your account';
  }

  function render() {
    var signedIn = !!(session && session.user);
    show('del-signin', !signedIn && !deleted);
    show('del-confirm', signedIn && !deleted);
    show('del-done', deleted);
    $('del-google').disabled = busy || providers.google !== true;
    $('del-login').disabled = busy || providers.email !== true;
    $('del-go').disabled = busy || !core.matches($('del-typed').value);
    $('del-signout').disabled = busy;
    if (signedIn) $('del-who').textContent = 'Signed in with ' + providerLabel(session.user) + '.';
  }

  function friendly(err) {
    var msg = String(err && (err.message || err.error_description || err.msg) || '');
    var low = msg.toLowerCase();
    if (err && err.code === 'PGRST202' || low.indexOf('could not find the function') !== -1) return 'Account deletion is not switched on in the cloud yet. Nothing was deleted. Try again later.';
    if (low.indexOf('invalid login') !== -1) return 'That email or password is incorrect.';
    if (low.indexOf('failed to fetch') !== -1 || low.indexOf('network') !== -1) return 'You appear to be offline. Nothing was deleted.';
    return msg || 'Something went wrong. Nothing was deleted.';
  }

  function run(fn) {
    if (busy) return;
    busy = true; say('Working…'); render();
    Promise.resolve().then(fn).then(function () { busy = false; render(); }, function (err) { busy = false; say(friendly(err)); render(); });
  }

  client.auth.onAuthStateChange(function (event, s) {
    if (deleted) return;
    session = s && s.user ? s : null;
    render();
  });
  client.auth.getSession().then(function (res) {
    session = res && res.data && res.data.session || null;
    try { if (/[?&]code=/.test(location.search)) history.replaceState({}, '', location.pathname); } catch (e) { /* keep url */ }
    render();
  }, function () { render(); });

  $('del-google').addEventListener('click', function () {
    run(function () {
      return client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, scopes: 'openid email profile' } })
        .then(function (res) { if (res.error) throw res.error; });
    });
  });

  $('del-email-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var email = ($('del-email').value || '').trim();
    var pass = $('del-pass').value || '';
    if (!email || email.indexOf('@') < 1) { say('Enter a valid email address.'); return; }
    if (!pass) { say('Enter your password.'); return; }
    run(function () {
      return client.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
        if (res.error) throw res.error;
        $('del-pass').value = '';
        session = res.data && res.data.session || session;
        say('Signed in. Type DELETE below to confirm.');
      });
    });
  });

  $('del-typed').addEventListener('input', render);

  $('del-go').addEventListener('click', function () {
    var typed = $('del-typed').value;
    if (!core.matches(typed)) { say('Type DELETE in capitals to confirm. Nothing was deleted.'); return; }
    run(function () {
      return core.run(client, typed).then(function () {
        deleted = true;
        session = null;
        $('del-typed').value = '';
        try { localStorage.removeItem('prismburst.cloud.meta.v1'); } catch (e) { /* ignore */ }
        say('Account deleted.');
      });
    });
  });

  $('del-signout').addEventListener('click', function () {
    run(function () {
      return client.auth.signOut({ scope: 'local' }).then(function () { session = null; say('Signed out. Nothing was deleted.'); });
    });
  });

  $('del-keep').addEventListener('click', function () {
    say('Progress in this browser was kept.');
    show('del-keep', false); show('del-clear', false);
  });

  var armed = false;
  $('del-clear').addEventListener('click', function () {
    if (!armed) { armed = true; $('del-clear').textContent = 'Tap again to clear this device'; return; }
    core.clearDevice(window.localStorage);
    say('Progress in this browser was cleared.');
    show('del-keep', false); show('del-clear', false);
  });

  render();
})();
