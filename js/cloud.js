/*
 * PRISMBURST — cloud.js
 * Real Supabase Auth and cloud save. There is no fake or simulated sign-in
 * in this file. With an empty config.js the game never creates a client.
 * Automated tests intercept the network; they do not turn on a back door here.
 *
 * The device save prismburst.save.v1 is never removed by login, logout,
 * account switch, or an auth error. Before a cloud copy overwrites it, a
 * timestamped backup is written under prismburst.save.backup.<time>.
 */
(function () {
  'use strict';
  var PB = window.PB = window.PB || {};
  var Sync = PB.SaveSync;
  var SAVE_KEY = Sync.SAVE_KEY;
  var META_KEY = 'prismburst.cloud.meta.v1';

  function emptyMeta() {
    return { lastUserId: null, clientUpdatedAt: null, knownRevision: null, queue: null };
  }

  function readMeta() {
    try {
      var raw = localStorage.getItem(META_KEY);
      if (!raw) return emptyMeta();
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyMeta();
      return {
        lastUserId: typeof parsed.lastUserId === 'string' ? parsed.lastUserId : null,
        clientUpdatedAt: typeof parsed.clientUpdatedAt === 'string' ? parsed.clientUpdatedAt : null,
        knownRevision: typeof parsed.knownRevision === 'number' ? parsed.knownRevision : null,
        queue: parsed.queue && typeof parsed.queue === 'object' ? parsed.queue : null
      };
    } catch (e) { return emptyMeta(); }
  }

  function writeMeta(meta) {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* keep playing */ }
  }

  function pageUrl() {
    var u = new URL(window.location.href);
    u.hash = '';
    u.search = '';
    return u.toString();
  }

  var NATIVE_AUTH_URL = 'com.prismburst.brickodyssey://auth';
  var nativePlugins = {};

  function isNativeApp() {
    try {
      return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    } catch (e) { return false; }
  }

  // Capacitor Android injects plugins on window.Capacitor.Plugins (see
  // JSExport.getPluginJS). registerPlugin() only exists when @capacitor/core
  // is also bundled into the page, which this static game does not do. Prefer
  // Plugins[name], then registerPlugin, so Google OAuth can open Custom Tabs.
  function nativePlugin(name) {
    if (nativePlugins[name]) return nativePlugins[name];
    if (!isNativeApp()) return null;
    try {
      var bag = window.Capacitor && window.Capacitor.Plugins;
      var fromBag = bag && bag[name];
      if (fromBag && typeof fromBag === 'object') {
        nativePlugins[name] = fromBag;
        return fromBag;
      }
      if (typeof window.Capacitor.registerPlugin === 'function') {
        var registered = window.Capacitor.registerPlugin(name);
        if (registered) {
          nativePlugins[name] = registered;
          return registered;
        }
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  // Open a URL outside the WebView. Browser plugin first (Custom Tabs), then
  // window.open / anchor fallbacks so OAuth is not blocked if the plugin
  // handle is missing.
  function openExternalUrl(url) {
    var target = String(url || '');
    if (!target) return Promise.reject(new Error('Sign-in could not start. Progress on this device is unchanged.'));
    var browser = nativePlugin('Browser');
    if (browser && typeof browser.open === 'function') {
      return Promise.resolve(browser.open({ url: target })).catch(function (err) {
        return openExternalUrlFallback(target, err);
      });
    }
    return openExternalUrlFallback(target, null);
  }

  function openExternalUrlFallback(url, priorErr) {
    try {
      var opened = window.open(url, '_system');
      if (opened) return Promise.resolve();
    } catch (e1) { /* try next */ }
    try {
      var blank = window.open(url, '_blank', 'noopener');
      if (blank) return Promise.resolve();
    } catch (e2) { /* try next */ }
    try {
      var a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { try { document.body.removeChild(a); } catch (e3) { /* gone */ } }, 0);
      return Promise.resolve();
    } catch (e4) {
      var detail = priorErr && (priorErr.message || priorErr);
      return Promise.reject(new Error(
        detail
          ? ('Could not open the system browser (' + detail + '). Progress on this device is unchanged.')
          : 'The system browser is unavailable. Progress on this device is unchanged.'
      ));
    }
  }

  function authRedirectUrl() {
    return isNativeApp() ? NATIVE_AUTH_URL : pageUrl();
  }

  // Password reset links come back with ?type=recovery so the game opens the
  // "set a new password" screen. Supabase appends &code=... to this URL.
  // The URL must be in Supabase Auth > URL Configuration > Redirect URLs.
  function recoveryRedirectUrl() {
    return authRedirectUrl() + '?type=recovery';
  }

  var RESET_COOLDOWN_MS = 30000;
  var PUBLIC_SITE = 'https://hamzaxali.github.io/prismburst-brick-odyssey/';
  var DELETED_TEXT = 'Your account and its cloud save were deleted. Progress on this device was kept.';

  function parseNativeAuthUrl(raw) {
    var url;
    try { url = new URL(String(raw)); } catch (e) { return null; }
    if (String(url.protocol || '').toLowerCase() !== 'com.prismburst.brickodyssey:') return null;
    if (String(url.hostname || '').toLowerCase() !== 'auth') return null;
    var hash = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    return {
      code: url.searchParams.get('code') || hash.get('code') || '',
      error: url.searchParams.get('error_description') || url.searchParams.get('error') || hash.get('error_description') || hash.get('error') || '',
      type: url.searchParams.get('type') || hash.get('type') || '',
      accessToken: url.searchParams.get('access_token') || hash.get('access_token') || '',
      refreshToken: url.searchParams.get('refresh_token') || hash.get('refresh_token') || ''
    };
  }

  function config() {
    var cfg = window.PB_CONFIG || {};
    return {
      supabaseUrl: String(cfg.supabaseUrl || '').trim(),
      supabaseAnonKey: String(cfg.supabaseAnonKey || '').trim(),
      providers: {
        email: !!(cfg.providers && cfg.providers.email === true),
        google: !!(cfg.providers && cfg.providers.google === true),
        facebook: !!(cfg.providers && cfg.providers.facebook === true)
      }
    };
  }

  function forbiddenKey(key) {
    if (String(key).indexOf('sb_secret_') === 0) return true;
    var parts = String(key).split('.');
    if (parts.length !== 3) return false;
    try {
      var mid = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (mid.length % 4) mid += '=';
      var json = JSON.parse(atob(mid));
      var role = json && json.role ? String(json.role) : '';
      if (role.indexOf('service') !== -1 && role.indexOf('role') !== -1) return true;
    } catch (e) { /* not a JWT */ }
    return false;
  }

  function usableConfig(cfg) {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return false;
    if (forbiddenKey(cfg.supabaseAnonKey)) return false;
    try {
      var u = new URL(cfg.supabaseUrl);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    } catch (e) { return false; }
    return true;
  }

  function friendlyError(err) {
    var msg = err && (err.message || err.error_description || err.msg) || '';
    var low = String(msg).toLowerCase();
    var name = err && err.name || '';
    if (!err) return 'Something went wrong. Progress on this device is unchanged.';
    if (low === 'timeout' || low.indexOf('failed to fetch') !== -1 || low.indexOf('network') !== -1 || name === 'AuthRetryableFetchError') {
      return 'You appear to be offline. Your progress stays on this device.';
    }
    if (low.indexOf('invalid login') !== -1 || low.indexOf('invalid credentials') !== -1) return 'That email or password is incorrect.';
    if (low.indexOf('not confirmed') !== -1) return 'Confirm your email before signing in. Check your inbox.';
    if (low.indexOf('already registered') !== -1 || low.indexOf('already been registered') !== -1) return 'An account with that email already exists. Log in instead.';
    if (low.indexOf('refresh') !== -1 || low.indexOf('session expired') !== -1 || low.indexOf('jwt expired') !== -1) {
      return 'Your session expired. Sign in again. Progress on this device is unchanged.';
    }
    if (low.indexOf('denied') !== -1 || low.indexOf('cancel') !== -1) return 'Sign-in was cancelled.';
    if (low.indexOf('redirect') !== -1 || low.indexOf('unauthorized') !== -1) {
      return 'Sign-in could not return to this page. Progress on this device is unchanged.';
    }
    if (low.indexOf('different from the old') !== -1 || low.indexOf('same_password') !== -1) return 'Choose a password you have not used for this account.';
    if (low.indexOf('rate limit') !== -1 || low.indexOf('security purposes') !== -1 || err.status === 429) return 'Too many tries. Wait a minute, then try again. Progress on this device is unchanged.';
    if (low.indexOf('code verifier') !== -1 || low.indexOf('flow state') !== -1 || low.indexOf('otp_expired') !== -1 || low.indexOf('expired or is invalid') !== -1 || (low.indexOf('link') !== -1 && low.indexOf('expired') !== -1)) {
      return 'This link has expired or was opened in a different browser. Ask for a new reset link and open it on this phone. Progress on this device is unchanged.';
    }
    if (low.indexOf('weak') !== -1 || (low.indexOf('password') !== -1 && low.indexOf('at least') !== -1)) return 'Use at least 6 characters in the password.';
    if (err.status >= 500) return 'The account server had a problem. Your progress stays on this device.';
    return msg || 'Sign-in failed. Progress on this device is unchanged.';
  }

  function isConflict(error) {
    if (!error) return false;
    var msg = String(error.message || error.details || error.hint || error.code || '').toLowerCase();
    return error.code === '40001' || msg.indexOf('revision_conflict') !== -1;
  }

  function isOfflineError(error) {
    var msg = String(error && error.message || error || '').toLowerCase();
    return msg.indexOf('failed to fetch') !== -1 || msg.indexOf('network') !== -1 || msg === 'timeout' || (error && error.name === 'AuthRetryableFetchError');
  }

  function backupLocal(reason, cloud) {
    var raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
    if (raw == null) return null;
    var stamp = new Date().toISOString().replace(/[:.]/g, '-');
    var key = 'prismburst.save.backup.' + stamp + '-' + Math.floor(Math.random() * 10000);
    try {
      localStorage.setItem(key, JSON.stringify({
        reason: reason,
        savedAt: new Date().toISOString(),
        prismburstSaveV1: raw,
        cloud: cloud || null
      }));
    } catch (e) { return null; }
    return key;
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('timeout'));
      }, ms);
      Promise.resolve(promise).then(function (value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function stripOAuthParams() {
    var u;
    try { u = new URL(window.location.href); } catch (e) { return; }
    var hash = new URLSearchParams((u.hash || '').replace(/^#/, ''));
    var dirty = false;
    ['code', 'state', 'error', 'error_description', 'error_code'].forEach(function (key) {
      if (u.searchParams.has(key)) { u.searchParams.delete(key); dirty = true; }
    });
    if (u.searchParams.get('type') === 'recovery') { u.searchParams.delete('type'); dirty = true; }
    if (hash.has('access_token') || hash.has('error') || hash.has('error_description') || hash.has('refresh_token')) {
      u.hash = '';
      dirty = true;
    }
    if (!dirty) return;
    try { history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e2) { /* keep the url */ }
  }

  function consumeOAuthError() {
    var u;
    try { u = new URL(window.location.href); } catch (e) { return null; }
    var hash = new URLSearchParams((u.hash || '').replace(/^#/, ''));
    var msg = u.searchParams.get('error_description') || u.searchParams.get('error') || hash.get('error_description') || hash.get('error');
    if (!msg) return null;
    ['error', 'error_description', 'error_code', 'code', 'state'].forEach(function (key) {
      u.searchParams.delete(key);
    });
    if (hash.has('error') || hash.has('error_description') || hash.has('access_token')) u.hash = '';
    try { history.replaceState({}, '', u.pathname + u.search + u.hash); } catch (e) { /* keep the url */ }
    return msg;
  }

  var Cloud = PB.Cloud = {
    client: null,
    session: null,
    syncLabel: 'Not signed in',
    errorText: '',
    loading: false,
    pending: null,
    recovery: false,
    accountName: null,
    nameSuggestion: '',
    namePrompt: false,
    nameNote: '',
    readySettled: false,
    _hadSession: false,
    _loggingOut: false,
    _applying: false,
    _suppress: false,
    _timer: null,
    _listeners: [],
    _reconcilePromise: null,
    _reconcileUser: null,
    _chain: Promise.resolve(),

    ready: null,

    init: function () {
      var self = this;
      if (this._started) return;
      this._started = true;
      try { if (PB.Profile) PB.Profile.ensureGuest(); } catch (e) { /* a name must not block play */ }
      this.ready = new Promise(function (resolve) { self._resolveReady = resolve; });
      var oauthErr = null;
      try { oauthErr = consumeOAuthError(); } catch (e) { oauthErr = null; }
      try {
        if (/type=recovery/.test(window.location.href)) this.recovery = true;
      } catch (e) { /* ignore */ }
      if (oauthErr) {
        this.errorText = friendlyError({ message: oauthErr });
        this.syncLabel = 'Not signed in';
      }
      var cfg = config();
      if (forbiddenKey(cfg.supabaseAnonKey)) {
        this.errorText = 'That key looks like a secret key. The game only accepts the publishable anon key. Nothing was sent. Progress on this device is unchanged.';
        this.syncLabel = 'Error';
        this.settleReady();
        this.emit();
        return;
      }
      if (!usableConfig(cfg)) {
        this.syncLabel = 'Not signed in';
        this.settleReady();
        this.emit();
        return;
      }
      var lib = window.supabase;
      if (!lib || typeof lib.createClient !== 'function') {
        this.errorText = 'Cloud library failed to load. You can keep playing as a guest.';
        this.syncLabel = 'Error';
        this.settleReady();
        this.emit();
        return;
      }
      try {
        this.client = lib.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
          auth: {
            flowType: 'pkce',
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
            lock: function (_name, _timeout, fn) { return fn(); }
          }
        });
        this.client.auth.onAuthStateChange(function (event, session) {
          setTimeout(function () { self.handleAuthEvent(event, session); }, 0);
        });
        var pendingInit = this.client.auth.initializePromise;
        if (pendingInit && pendingInit.then) pendingInit.then(function () { stripOAuthParams(); }, function () { stripOAuthParams(); });
        this.attachNativeAuth();
      } catch (e) {
        this.client = null;
        this.errorText = friendlyError(e);
        this.syncLabel = 'Error';
        this.settleReady();
        this.emit();
        return;
      }
      setTimeout(function () { if (!self.readySettled) self.settleReady(); }, 12000);
      window.addEventListener('online', function () { self.flush(); });
      window.addEventListener('pageshow', function () { self.flush(); });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') self.flush();
      });
      this.emit();
    },

    settleReady: function () {
      if (this.readySettled) return;
      this.readySettled = true;
      if (this._resolveReady) this._resolveReady();
    },

    handleAuthEvent: function (event, session) {
      var self = this;
      if (event === 'PASSWORD_RECOVERY') {
        this.recovery = true;
        if (PB.Account && PB.Account.open) PB.Account.open('recovery');
      }
      if (event === 'TOKEN_REFRESHED' && session) {
        this.session = session;
        this._hadSession = true;
        this.emit();
        return;
      }
      if (event === 'SIGNED_OUT') {
        this.session = null;
        this.pending = null;
        this.accountName = null;
        this.nameSuggestion = '';
        this.namePrompt = false;
        this.nameNote = '';
        if (this._hadSession && !this._loggingOut) {
          this.errorText = 'Your session expired. Sign in again. Progress on this device is unchanged.';
          this.syncLabel = 'Error';
        } else if (this._deleting) {
          this.errorText = DELETED_TEXT;
          this.syncLabel = 'Not signed in';
          this._deleting = false;
        } else if (this._loggingOut) {
          this.errorText = 'Signed out. Progress on this device was kept.';
          this.syncLabel = 'Not signed in';
        } else {
          this.syncLabel = 'Not signed in';
        }
        this._loggingOut = false;
        this.settleReady();
        this.emit();
        return;
      }
      // supabase-js reports a password-reset code exchange as PASSWORD_RECOVERY
      // instead of SIGNED_IN, so it carries the new session too.
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || (event === 'PASSWORD_RECOVERY' && session && session.user)) {
        this.session = session && session.user ? session : null;
        if (this.session) {
          this._hadSession = true;
          this.loadAccountName(this.session);
          this.reconcile(this.session).then(function () { self.settleReady(); }, function () { self.settleReady(); });
        } else {
          this.syncLabel = 'Not signed in';
          this.settleReady();
          this.emit();
        }
      }
    },

    onChange: function (fn) { this._listeners.push(fn); },

    emit: function () {
      for (var i = 0; i < this._listeners.length; i++) {
        try { this._listeners[i](); } catch (e) { /* a badge must not break auth */ }
      }
      if (PB.Account && PB.Account.render) PB.Account.render();
    },

    badgeText: function () { return 'Account · ' + this.syncLabel; },

    providerEnabled: function (name) {
      var cfg = config();
      return usableConfig(cfg) && cfg.providers[name] === true && !forbiddenKey(cfg.supabaseAnonKey);
    },

    hasCredentials: function () { return usableConfig(config()); },

    setSync: function (label) {
      this.syncLabel = label;
      this.emit();
    },

    setError: function (text) {
      this.errorText = text || '';
      if (text) this.syncLabel = 'Error';
      this.emit();
    },

    snapshot: function () {
      var keys = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf('prismburst.save.backup.') === 0) keys.push(k);
        }
      } catch (e) { /* ignore */ }
      var meta = readMeta();
      var raw = null;
      try { raw = localStorage.getItem(SAVE_KEY); } catch (e2) { raw = null; }
      return {
        sync: this.syncLabel,
        error: this.errorText || '',
        signedIn: !!(this.session && this.session.user),
        userId: this.session && this.session.user ? this.session.user.id : null,
        email: this.session && this.session.user ? (this.session.user.email || '') : '',
        provider: this.providerName(),
        displayName: this.accountName || (PB.Profile && PB.Profile.guestName()) || '',
        nameSuggestion: this.nameSuggestion || '',
        namePrompt: !!this.namePrompt,
        nameNote: this.nameNote || '',
        queue: meta.queue,
        pending: this.pending ? { different: !!this.pending.different, hasRemote: !!this.pending.hasRemote } : null,
        backups: keys,
        save: raw,
        loading: this.loading,
        recovery: this.recovery,
        accountDeleted: !!this.accountDeleted,
        ready: this.readySettled,
        resetWait: this.resetWaitMs()
      };
    },

    providerName: function () {
      var user = this.session && this.session.user;
      if (!user) return '';
      var fromApp = user.app_metadata && user.app_metadata.provider;
      if (fromApp) return fromApp;
      var ids = user.identities || [];
      return ids[0] && ids[0].provider || 'email';
    },

    getClient: function () { return this.client; },

    noteLocalChange: function () {
      if (this._applying || this._suppress) return;
      var meta = readMeta();
      meta.clientUpdatedAt = new Date().toISOString();
      meta.queue = this.session && this.session.user ? {
        userId: this.session.user.id,
        at: meta.clientUpdatedAt,
        expectedRevision: meta.knownRevision || 0
      } : meta.queue;
      writeMeta(meta);
      if (!this.session || !this.session.user) {
        this.syncLabel = 'Not signed in';
        this.emit();
        return;
      }
      if (this.pending) {
        this.setSync('Sync pending');
        return;
      }
      if (!navigator.onLine) {
        this.setSync('Offline');
        return;
      }
      this.setSync('Sync pending');
      this.schedulePush();
    },

    schedulePush: function () {
      var self = this;
      clearTimeout(this._timer);
      this._timer = setTimeout(function () { self.flush(); }, 1000);
    },

    flush: function () {
      var self = this;
      clearTimeout(this._timer);
      if (!this.session || !this.session.user || this.pending) return Promise.resolve();
      if (!navigator.onLine) {
        var meta = readMeta();
        if (meta.queue) this.setSync('Offline');
        return Promise.resolve();
      }
      var run = this._chain.then(function () { return self.pushCurrent(); });
      this._chain = run.then(function () {}, function () {});
      return run;
    },

    pushCurrent: function () {
      var self = this;
      var userId = this.session.user.id;
      var meta = readMeta();
      if (meta.lastUserId && meta.lastUserId !== userId) return Promise.resolve();
      var expected = meta.knownRevision == null ? 0 : meta.knownRevision;
      return this.fetchRemote(userId).then(function (remote) {
        if (remote && remote.invalid) {
          self.setError('Cloud save was rejected: ' + remote.error + ' Progress on this device was not changed.');
          return;
        }
        if (remote && meta.knownRevision != null && remote.revision !== meta.knownRevision) {
          return self.mergeAndPush(userId, remote, meta.clientUpdatedAt, { reason: 'auto-merge' });
        }
        var payload = Sync.toCloudData(PB.Save.data, meta.clientUpdatedAt || new Date().toISOString());
        var check = Sync.validateCloudData(payload);
        if (!check.ok) {
          self.setError('This device save could not be uploaded: ' + check.error);
          return;
        }
        return self.pushPayload(userId, payload, remote ? remote.revision : expected, remote);
      }).catch(function (err) {
        if (isOfflineError(err)) self.setSync('Offline');
        else self.setError(friendlyError(err));
      });
    },

    reconcile: function (session) {
      var self = this;
      var user = session && session.user;
      if (!user || !user.id) return Promise.resolve();
      if (this._reconcilePromise && this._reconcileUser === user.id) return this._reconcilePromise;
      this._reconcileUser = user.id;
      this._reconcilePromise = this._reconcile(session).then(function () {
        self._reconcilePromise = null;
      }, function (err) {
        self._reconcilePromise = null;
        if (isOfflineError(err)) self.setSync('Offline');
        else self.setError(friendlyError(err));
      });
      return this._reconcilePromise;
    },

    _reconcile: function (session) {
      var self = this;
      var userId = session.user.id;
      return this.fetchRemote(userId).then(function (remote) {
        if (remote && remote.invalid) {
          self.setError('Cloud save was rejected: ' + remote.error + ' Progress on this device was not changed.');
          return;
        }
        var meta = readMeta();
        var local = PB.Save.data;
        var localProg = Sync.hasProgress(local);
        var cloudProg = !!(remote && Sync.hasProgress(remote.save));
        var different = !!(meta.lastUserId && meta.lastUserId !== userId);
        if (different || (!meta.lastUserId && localProg && cloudProg)) {
          self.pending = { userId: userId, remote: remote, different: different, hasRemote: !!remote, localAt: meta.clientUpdatedAt };
          self.setSync('Sync pending');
          if (PB.Account && PB.Account.open) PB.Account.open();
          return;
        }
        if (!remote) return self.uploadLocal(userId, meta.clientUpdatedAt);
        if (!localProg && cloudProg) {
          self.applyLocal(remote.save, 'auto-cloud', remote.cloudData);
          meta = readMeta();
          meta.lastUserId = userId;
          meta.knownRevision = remote.revision;
          meta.clientUpdatedAt = remote.clientUpdatedAt;
          meta.queue = null;
          writeMeta(meta);
          self.session = session;
          self.errorText = '';
          self.setSync('Synced');
          return;
        }
        return self.mergeAndPush(userId, remote, meta.clientUpdatedAt, { reason: 'auto-merge' });
      });
    },

    fetchRemote: function (userId) {
      var client = this.client;
      if (!client) return Promise.reject(new Error('Cloud is not set up.'));
      return withTimeout(client.from('player_saves').select('data,save_version,revision,client_updated_at').eq('user_id', userId).maybeSingle(), 15000).then(function (res) {
        if (res.error) {
          if (res.error.code === 'PGRST116') return null;
          throw res.error;
        }
        if (!res.data) return null;
        var check = Sync.validateCloudData(res.data.data);
        if (!check.ok) return { invalid: true, error: check.error };
        return {
          save: check.save,
          revision: res.data.revision,
          clientUpdatedAt: res.data.client_updated_at || check.clientUpdatedAt,
          cloudData: res.data.data
        };
      });
    },

    uploadLocal: function (userId, clientUpdatedAt) {
      var iso = clientUpdatedAt || new Date().toISOString();
      var payload = Sync.toCloudData(PB.Save.data, iso);
      var check = Sync.validateCloudData(payload);
      if (!check.ok) {
        this.setError('This device save could not be uploaded: ' + check.error);
        return Promise.resolve();
      }
      return this.pushPayload(userId, payload, 0, null);
    },

    mergeAndPush: function (userId, remote, localAt, opts) {
      var self = this;
      opts = opts || {};
      var merged = Sync.mergeProgress(PB.Save.data, remote.save, localAt, remote.clientUpdatedAt);
      var changed = !Sync.sameSave(PB.Save.data, merged.save);
      if (changed) this.applyLocal(merged.save, opts.reason || 'merge', remote.cloudData, !!opts.backedUp);
      var meta = readMeta();
      meta.clientUpdatedAt = merged.client_updated_at || localAt || remote.clientUpdatedAt || new Date().toISOString();
      writeMeta(meta);
      var payload = Sync.toCloudData(merged.save, meta.clientUpdatedAt);
      var sameCloud = remote.cloudData && JSON.stringify(payload) === JSON.stringify(remote.cloudData);
      if (sameCloud && !opts.force) {
        meta.lastUserId = userId;
        meta.knownRevision = remote.revision;
        meta.queue = null;
        writeMeta(meta);
        this.pending = null;
        this.errorText = '';
        this.setSync('Synced');
        return Promise.resolve();
      }
      return this.pushPayload(userId, payload, remote.revision, remote);
    },

    pushPayload: function (userId, payload, expected, remote) {
      var self = this;
      var attempt = 0;
      var revision = expected || 0;
      var body = payload;
      function once() {
        attempt += 1;
        return self.rpcUpsert(body, revision).then(function (res) {
          if (res.conflict) {
            if (attempt >= 3) throw new Error('Could not sync because the cloud save kept changing.');
            return self.fetchRemote(userId).then(function (next) {
              if (next && next.invalid) {
                self.setError('Cloud save was rejected: ' + next.error + ' Progress on this device was not changed.');
                return;
              }
              if (!next) {
                revision = 0;
                return once();
              }
              var meta = readMeta();
              var merged = Sync.mergeProgress(PB.Save.data, next.save, meta.clientUpdatedAt, next.clientUpdatedAt);
              if (!Sync.sameSave(PB.Save.data, merged.save)) self.applyLocal(merged.save, 'revision-retry', next.cloudData);
              meta = readMeta();
              meta.clientUpdatedAt = merged.client_updated_at || meta.clientUpdatedAt;
              writeMeta(meta);
              body = Sync.toCloudData(merged.save, meta.clientUpdatedAt);
              revision = next.revision;
              remote = next;
              return once();
            });
          }
          var meta = readMeta();
          meta.lastUserId = userId;
          meta.knownRevision = res.revision;
          meta.queue = null;
          if (body.client_updated_at) meta.clientUpdatedAt = body.client_updated_at;
          writeMeta(meta);
          self.pending = null;
          self.errorText = '';
          self.setSync('Synced');
        });
      }
      return once();
    },

    rpcUpsert: function (payload, expected) {
      var client = this.client;
      return withTimeout(client.rpc('upsert_player_save', {
        p_data: payload,
        p_save_version: Sync.SAVE_VERSION,
        p_client_updated_at: payload.client_updated_at,
        p_expected_revision: expected || 0
      }), 15000).then(function (res) {
        if (res.error) {
          if (isConflict(res.error)) return { conflict: true };
          throw res.error;
        }
        var row = res.data;
        var revision = row && (row.revision || (row[0] && row[0].revision));
        if (!revision) throw new Error('Cloud save did not return a revision.');
        return { conflict: false, revision: revision };
      });
    },

    applyLocal: function (clean, reason, cloud, alreadyBackedUp) {
      var raw = null;
      try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
      var next = JSON.stringify(Sync.toLocalSave(clean));
      var same = false;
      if (raw != null) {
        try { same = Sync.sameSave(JSON.parse(raw), clean); } catch (e2) { same = false; }
      }
      if (same || raw === next) return false;
      if (!alreadyBackedUp && raw != null) backupLocal(reason || 'cloud-apply', cloud || null);
      try { localStorage.setItem(SAVE_KEY, next); } catch (e3) {
        this.setError('Could not store the cloud save on this device. The previous progress is still here.');
        return false;
      }
      this._applying = true;
      try { PB.Save.load(); } finally { this._applying = false; }
      this.refreshMenu();
      return true;
    },

    refreshMenu: function () {
      try {
        var game = PB.game;
        if (!game || !game.scene || !game.scene.isActive('Menu')) return;
        game.scene.start('Menu');
      } catch (e) { /* menu refresh is optional */ }
    },

    choose: function (mode) {
      var self = this;
      var pending = this.pending;
      if (!pending || !this.session || !this.session.user) return Promise.resolve();
      if (mode !== 'merge' && mode !== 'cloud' && mode !== 'device') return Promise.resolve();
      var raw = null;
      try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
      if (raw != null) backupLocal('choice-' + mode, pending.remote && pending.remote.cloudData);
      this.loading = true;
      this.errorText = '';
      this.emit();
      var userId = pending.userId;
      var remote = pending.remote;
      var job;
      if (mode === 'cloud') {
        if (!remote) {
          this.loading = false;
          this.setError('This account has no cloud save yet.');
          return Promise.resolve();
        }
        var applied = this.applyLocal(remote.save, 'choice-cloud', remote.cloudData, true);
        if (!applied && this.syncLabel === 'Error') {
          this.loading = false;
          this.emit();
          return Promise.resolve();
        }
        var meta = readMeta();
        meta.lastUserId = userId;
        meta.knownRevision = remote.revision;
        meta.clientUpdatedAt = remote.clientUpdatedAt;
        meta.queue = null;
        writeMeta(meta);
        this.pending = null;
        this.loading = false;
        this.errorText = '';
        this.setSync('Synced');
        return Promise.resolve();
      }
      if (mode === 'device') {
        var stamped = readMeta();
        stamped.clientUpdatedAt = new Date().toISOString();
        writeMeta(stamped);
        if (!remote) job = this.uploadLocal(userId, stamped.clientUpdatedAt);
        else job = this.mergeAndPush(userId, remote, stamped.clientUpdatedAt, { reason: 'choice-device', backedUp: true, force: true });
      } else if (!remote) {
        job = this.uploadLocal(userId, readMeta().clientUpdatedAt);
      } else {
        job = this.mergeAndPush(userId, remote, readMeta().clientUpdatedAt, { reason: 'choice-merge', backedUp: true });
      }
      return Promise.resolve(job).then(function () {
        self.loading = false;
        self.emit();
      }, function (err) {
        self.loading = false;
        self.setError(friendlyError(err));
      });
    },

    busy: function (fn) {
      var self = this;
      if (this.loading) return Promise.resolve();
      this.loading = true;
      this.errorText = '';
      this.emit();
      return Promise.resolve().then(fn).then(function () {
        self.loading = false;
        self.emit();
      }, function (err) {
        self.loading = false;
        self.setError(friendlyError(err));
      });
    },

    signInOAuth: function (provider) {
      var self = this;
      if (!this.providerEnabled(provider)) {
        this.errorText = 'Not set up yet.';
        this.emit();
        return Promise.resolve();
      }
      return this.busy(function () {
        var native = isNativeApp();
        var options = {
          redirectTo: native ? NATIVE_AUTH_URL : pageUrl(),
          skipBrowserRedirect: native
        };
        if (provider === 'google') options.scopes = 'openid email profile';
        return withTimeout(self.client.auth.signInWithOAuth({
          provider: provider,
          options: options
        }), 15000).then(function (res) {
          if (res.error) throw res.error;
          if (!native) return;
          var url = res.data && res.data.url;
          if (!url) throw new Error('Sign-in could not start. Progress on this device is unchanged.');
          self._nativeAuthPending = true;
          self._nativeAuthHandled = false;
          return openExternalUrl(url);
        });
      });
    },

    signInEmail: function (email, password) {
      var self = this;
      var problem = this.checkEmailPassword(email, password);
      if (problem) { this.setError(problem); return Promise.resolve(); }
      if (!this.providerEnabled('email')) { this.setError('Not set up yet.'); return Promise.resolve(); }
      return this.busy(function () {
        return withTimeout(self.client.auth.signInWithPassword({ email: email, password: password }), 15000).then(function (res) {
          if (res.error) throw res.error;
          return self.afterAuthCall();
        });
      });
    },

    signUpEmail: function (email, password) {
      var self = this;
      var problem = this.checkEmailPassword(email, password);
      if (problem) { this.setError(problem); return Promise.resolve(); }
      if (!this.providerEnabled('email')) { this.setError('Not set up yet.'); return Promise.resolve(); }
      return this.busy(function () {
        return withTimeout(self.client.auth.signUp({
          email: email,
          password: password,
          options: { emailRedirectTo: authRedirectUrl() }
        }), 15000).then(function (res) {
          if (res.error) throw res.error;
          var session = res.data && res.data.session;
          if (!session) {
            self.errorText = 'Check your email to confirm the account. Your progress stays on this device until you sign in.';
            self.syncLabel = 'Not signed in';
            return;
          }
          return self.afterAuthCall();
        });
      });
    },

    resetWaitMs: function () {
      if (!this._resetAt) return 0;
      var left = RESET_COOLDOWN_MS - (Date.now() - this._resetAt);
      return left > 0 ? left : 0;
    },

    forgotEmail: function (email) {
      var self = this;
      email = String(email || '').trim();
      if (!this.providerEnabled('email')) { this.setError('Not set up yet.'); return Promise.resolve(); }
      if (!email || email.indexOf('@') < 1 || email.length > 320) { this.setError('Enter the email for that account.'); return Promise.resolve(); }
      if (this.resetWaitMs() > 0) {
        this.setError('A reset link was just sent. Wait ' + Math.ceil(this.resetWaitMs() / 1000) + ' seconds before asking again.');
        return Promise.resolve();
      }
      return this.busy(function () {
        return withTimeout(self.client.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirectUrl() }), 15000).then(function (res) {
          if (res.error) throw res.error;
          self._resetAt = Date.now();
          // Same text whether or not the address has an account.
          self.errorText = 'Password reset email sent. If that email has an account, open the link on this phone to choose a new password. Your progress stays on this device.';
          self.syncLabel = self.session ? self.syncLabel : 'Not signed in';
        });
      });
    },

    cancelRecovery: function () {
      this.recovery = false;
      this.emit();
    },

    updatePassword: function (password, confirmPassword) {
      var self = this;
      if (!password || password.length < 6) { this.setError('Use at least 6 characters in the password.'); return Promise.resolve(); }
      if (password.length > 72) { this.setError('Password is too long.'); return Promise.resolve(); }
      if (confirmPassword !== undefined && confirmPassword !== password) { this.setError('The two passwords do not match.'); return Promise.resolve(); }
      if (!this.client || !this.session) { this.setError('This reset link has expired. Ask for a new one. Progress on this device is unchanged.'); return Promise.resolve(); }
      return this.busy(function () {
        return withTimeout(self.client.auth.updateUser({ password: password }), 15000).then(function (res) {
          if (res.error) throw res.error;
          self.recovery = false;
          self.errorText = 'Password updated. You are signed in. Progress on this device was kept.';
        });
      });
    },

    logout: function () {
      var self = this;
      if (!this.client) return Promise.resolve();
      this._loggingOut = true;
      this.pending = null;
      return this.busy(function () {
        return withTimeout(self.client.auth.signOut(), 8000).catch(function () {
          return self.client.auth.signOut({ scope: 'local' });
        }).then(function () {
          self.session = null;
          self.pending = null;
          setTimeout(function () {
            if (!self._loggingOut) return;
            self._loggingOut = false;
            self.session = null;
            self.syncLabel = 'Not signed in';
            self.errorText = 'Signed out. Progress on this device was kept.';
            self.emit();
          }, 50);
        });
      });
    },

    // Permanently deletes the signed-in account and its cloud save on the
    // server through delete_my_account(). The device save is kept; the player
    // may clear it afterwards with clearDeviceProgress().
    deleteAccount: function (typed) {
      var self = this;
      var core = PB.DeleteCore;
      if (!core || !core.matches(typed)) {
        this.errorText = 'Type ' + (core ? core.PHRASE : 'DELETE') + ' in capitals to confirm. Nothing was deleted.';
        this.emit();
        return Promise.resolve(false);
      }
      if (!this.client || !this.session || !this.session.user) {
        this.setError('Sign in to the account you want to delete first. Nothing was deleted.');
        return Promise.resolve(false);
      }
      var ok = false;
      return this.busy(function () {
        clearTimeout(self._timer);
        self._deleting = true;
        self._loggingOut = true;
        return self._chain.then(function () {
          return core.run(self.client, typed);
        }).then(function () {
          ok = true;
          writeMeta(emptyMeta());
          self.session = null;
          self.pending = null;
          self.accountName = null;
          self.nameSuggestion = '';
          self.namePrompt = false;
          self.nameNote = '';
          self.syncLabel = 'Not signed in';
          self.accountDeleted = true;
        }, function (err) {
          self._deleting = false;
          self._loggingOut = false;
          var text = String(err && (err.message || err.details || err.code) || '').toLowerCase();
          if ((err && err.code === 'PGRST202') || text.indexOf('could not find the function') !== -1) {
            throw new Error('Account deletion is not switched on in the cloud yet. Nothing was deleted. Try again later.');
          }
          if (err && err.code === '42501') throw new Error('Sign in again, then delete. Nothing was deleted.');
          throw err;
        });
      }).then(function () {
        if (ok) {
          self.errorText = DELETED_TEXT;
          self.emit();
        }
        return ok;
      });
    },

    // Explicit choice after deletion (or from the delete page). Never automatic.
    clearDeviceProgress: function () {
      if (PB.DeleteCore) PB.DeleteCore.clearDevice(window.localStorage);
      PB.Save.reset();
      this.accountDeleted = false;
      this.errorText = 'Progress on this device was cleared.';
      this.emit();
      if (PB.game && PB.game.scene) {
        try {
          var scenes = PB.game.scene.getScenes(true);
          for (var i = 0; i < scenes.length; i++) {
            var key = scenes[i].scene.key;
            if (key === 'Menu' || key === 'Settings') { scenes[i].scene.restart(); break; }
          }
        } catch (e) { /* the next scene change redraws */ }
      }
    },

    keepDeviceProgress: function () {
      this.accountDeleted = false;
      this.errorText = 'Progress on this device was kept. You are playing as a guest.';
      this.emit();
    },

    // Opens a public page (privacy policy, delete account). In the Android app
    // it opens the published GitHub Pages copy in the system browser.
    openPage: function (rel) {
      var name = String(rel || '');
      if (!/^[a-z-]+\.html(#[a-z-]+)?$/.test(name)) return false;
      if (isNativeApp()) {
        openExternalUrl(PUBLIC_SITE + name).catch(function () { /* nothing to do */ });
        return true;
      }
      try { window.open(name, '_blank', 'noopener'); } catch (e) { return false; }
      return true;
    },

    afterAuthCall: function () {
      var self = this;
      return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
        if (self._reconcilePromise) return self._reconcilePromise;
      });
    },

    loadAccountName: function (session) {
      var self = this;
      var user = session && session.user;
      if (!user) return Promise.resolve();
      return this.fetchProfile(user.id).then(function (row) {
        if (!self.session || !self.session.user || self.session.user.id !== user.id) return;
        if (row && row.display_name) {
          self.accountName = row.display_name;
          self.nameSuggestion = '';
          self.namePrompt = false;
          self.nameNote = '';
          self.emit();
          return;
        }
        var guest = PB.Profile ? PB.Profile.guestName() : '';
        var suggested = PB.Profile ? PB.Profile.suggest(user.user_metadata, guest, user.email) : '';
        self.accountName = null;
        self.nameSuggestion = suggested;
        self.namePrompt = true;
        self.nameNote = suggested
          ? 'Save a display name for this account. You can edit the suggestion.'
          : 'Choose a display name for this account. It is not your email.';
        self.emit();
        if (PB.Account && PB.Account.open) PB.Account.open();
      }, function () {
        if (!self.session || !self.session.user || self.session.user.id !== user.id) return;
        self.nameNote = 'Could not load the display name. Your progress is unchanged.';
        self.emit();
      });
    },

    fetchProfile: function (userId) {
      var client = this.client;
      if (!client) return Promise.resolve(null);
      return withTimeout(client.from('profiles').select('display_name').eq('id', userId).maybeSingle(), 15000).then(function (res) {
        if (res.error) {
          if (res.error.code === 'PGRST116') return null;
          throw res.error;
        }
        return res.data || null;
      });
    },

    upsertProfile: function (userId, name) {
      var client = this.client;
      return withTimeout(client.from('profiles').update({ display_name: name }).eq('id', userId).select('display_name').maybeSingle(), 15000).then(function (res) {
        if (res.error && res.error.code !== 'PGRST116') throw res.error;
        if (res.data && res.data.display_name) return res.data.display_name;
        return withTimeout(client.from('profiles').insert({ id: userId, display_name: name }).select('display_name').single(), 15000).then(function (ins) {
          if (ins.error) throw ins.error;
          var row = ins.data;
          if (Array.isArray(row)) row = row[0];
          if (!row || !row.display_name) throw new Error('Name was not saved.');
          return row.display_name;
        });
      });
    },

    saveDisplayName: function (raw) {
      var self = this;
      var checked = PB.Profile.validate(raw);
      if (!checked.ok) {
        this.nameNote = checked.error;
        this.emit();
        return Promise.resolve();
      }
      if (!this.session || !this.session.user) {
        var local = PB.Profile.writeGuest(checked.name);
        this.nameNote = local.ok ? 'Name saved on this device.' : local.error;
        this.namePrompt = false;
        this.emit();
        return Promise.resolve();
      }
      if (this.loading) return Promise.resolve();
      this.loading = true;
      this.nameNote = '';
      this.emit();
      return this.upsertProfile(this.session.user.id, checked.name).then(function (saved) {
        self.accountName = saved;
        self.nameSuggestion = '';
        self.namePrompt = false;
        self.nameNote = 'Name saved.';
        self.loading = false;
        self.emit();
      }, function () {
        self.loading = false;
        self.nameNote = 'Could not save the name. Your progress is unchanged.';
        self.emit();
      });
    },

    attachNativeAuth: function () {
      if (this._nativeAuthListening || !isNativeApp()) return;
      var app = nativePlugin('App');
      var browser = nativePlugin('Browser');
      if (!app || typeof app.addListener !== 'function') return;
      this._nativeAuthListening = true;
      var self = this;
      app.addListener('appUrlOpen', function (event) {
        self.handleNativeAuthUrl(event && event.url);
      });
      if (browser && typeof browser.addListener === 'function') {
        browser.addListener('browserFinished', function () {
          setTimeout(function () {
            if (!self._nativeAuthPending || self._nativeAuthHandled) return;
            self._nativeAuthPending = false;
            self.loading = false;
            self.errorText = 'Sign-in was cancelled.';
            if (!self.session) self.syncLabel = 'Not signed in';
            self.emit();
          }, 500);
        });
      }
    },

    handleNativeAuthUrl: function (raw) {
      var self = this;
      var parsed = parseNativeAuthUrl(raw);
      if (!parsed) return;
      this._nativeAuthHandled = true;
      this._nativeAuthPending = false;
      var browser = nativePlugin('Browser');
      if (browser && typeof browser.close === 'function') {
        Promise.resolve(browser.close()).catch(function () { /* the tab may already be closed */ });
      }
      if (parsed.error) {
        this.loading = false;
        this.setError(friendlyError({ message: parsed.error }));
        return;
      }
      if (parsed.type === 'recovery') {
        this.recovery = true;
        if (PB.Account && PB.Account.open) PB.Account.open('recovery');
      }
      if (!this.client) {
        this.loading = false;
        this.setError('Sign-in could not return to this page. Progress on this device is unchanged.');
        return;
      }
      var job = null;
      if (parsed.code) job = this.client.auth.exchangeCodeForSession(parsed.code);
      else if (parsed.accessToken && parsed.refreshToken) {
        job = this.client.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken });
      }
      if (!job) {
        this.loading = false;
        this.setError('Sign-in could not return to this page. Progress on this device is unchanged.');
        return;
      }
      this.loading = true;
      this.emit();
      Promise.resolve(job).then(function (res) {
        if (res && res.error) throw res.error;
        if (res && res.data && (res.data.redirectType === 'recovery' || res.data.redirectType === 'PASSWORD_RECOVERY') && !self.recovery) {
          self.recovery = true;
          if (PB.Account && PB.Account.open) PB.Account.open('recovery');
        }
        self.loading = false;
        self.emit();
      }, function (err) {
        self.loading = false;
        self.setError(friendlyError(err));
      });
    },

    checkEmailPassword: function (email, password) {
      if (!email || email.indexOf('@') < 1 || email.length > 320) return 'Enter a valid email address.';
      if (!password || password.length < 6) return 'Use at least 6 characters in the password.';
      if (password.length > 72) return 'Password is too long.';
      return '';
    }
  };

  var origPersist = PB.Save.persist;
  PB.Save.persist = function () {
    var ok = origPersist.apply(this, arguments);
    try { if (ok) Cloud.noteLocalChange(); } catch (e) { /* never block a local save */ }
    return ok;
  };
  var origReset = PB.Save.reset;
  PB.Save.reset = function () {
    Cloud._suppress = true;
    try { return origReset.apply(this, arguments); }
    finally { Cloud._suppress = false; }
  };

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    if (reason && reason.__isAuthError) {
      event.preventDefault();
      Cloud.setError(friendlyError(reason));
    }
  });

  Cloud.init();
})();
