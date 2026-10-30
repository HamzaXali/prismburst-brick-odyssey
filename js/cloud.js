/*
 * PRISMBURST — cloud.js
 * Firebase Auth + Firestore cloud save (Spark / free plan). There is no fake
 * or simulated sign-in in this file. With PLACEHOLDER_ Firebase config the
 * game never creates a client. Automated tests inject a mock SDK; they do
 * not turn on a back door here.
 *
 * The device save prismburst.save.v1 is never removed by login, logout,
 * account switch, or an auth error. Before a cloud copy overwrites it, a
 * timestamped backup is written under prismburst.save.backup.<time>.
 *
 * Network retries use capped exponential backoff (no tight retry loops).
 */
(function () {
  'use strict';
  var PB = window.PB = window.PB || {};
  var Sync = PB.SaveSync;
  var SAVE_KEY = Sync.SAVE_KEY;
  var META_KEY = 'prismburst.cloud.meta.v1';
  var AUTH_STATE_KEY = 'prismburst.auth.bridge.v1';
  var APP_VERSION = '1.5.0';
  var NATIVE_AUTH_URL = 'com.prismburst.brickodyssey://auth';
  var PUBLIC_SITE = 'https://hamzaxali.github.io/prismburst-brick-odyssey/';
  var DELETED_TEXT = 'Your account and its cloud save were deleted. Progress on this device was kept.';
  var RESET_COOLDOWN_MS = 30000;
  var MAX_BACKOFF_MS = 8000;
  var nativePlugins = {};

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

  function isNativeApp() {
    try {
      return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    } catch (e) { return false; }
  }

  function purgeNativeServiceWorker() {
    if (!isNativeApp()) return;
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          (regs || []).forEach(function (reg) {
            try { reg.unregister(); } catch (e1) { /* keep playing */ }
          });
        }, function () { /* ignore */ });
      }
      if (window.caches && caches.keys) {
        caches.keys().then(function (keys) {
          (keys || []).forEach(function (key) {
            try { caches.delete(key); } catch (e2) { /* keep playing */ }
          });
        }, function () { /* ignore */ });
      }
    } catch (e) { /* keep playing */ }
  }
  purgeNativeServiceWorker();

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

  function browserDiag(step, detail) {
    var safe = String(detail || '')
      .replace(/https?:\/\/[^\s]+/gi, '[url]')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
      .slice(0, 80);
    return 'Could not open the browser [v' + APP_VERSION + ' step=' + step +
      (safe ? ':' + safe : '') +
      ']. Progress on this device is unchanged.';
  }

  function openExternalUrl(url) {
    var target = String(url || '');
    if (!target) return Promise.reject(new Error(browserDiag('no-url')));
    var browser = nativePlugin('Browser');
    if (browser && typeof browser.open === 'function') {
      return Promise.resolve(browser.open({ url: target })).then(function () {
        return { via: 'browser' };
      }, function (err) {
        return openExternalUrlFallback(target, 'browser-reject', err);
      });
    }
    return openExternalUrlFallback(target, browser ? 'no-browser-open' : 'no-plugin', null);
  }

  function openExternalUrlFallback(url, why, priorErr) {
    var openUrl = nativePlugin('OpenUrl');
    if (openUrl && typeof openUrl.open === 'function') {
      return Promise.resolve(openUrl.open({ url: url })).then(function () {
        return { via: 'openurl', after: why };
      }, function (err) {
        return openExternalUrlWebFallback(url, why, priorErr || err, 'openurl-reject');
      });
    }
    return openExternalUrlWebFallback(url, why, priorErr, openUrl ? 'no-openurl-open' : 'no-openurl');
  }

  function openExternalUrlWebFallback(url, why, priorErr, mid) {
    var prior = priorErr && (priorErr.message || priorErr.code || priorErr);
    try {
      var opened = window.open(url, '_system');
      if (opened) return Promise.resolve({ via: 'window-system', after: why });
    } catch (e1) { /* try next */ }
    try {
      var blank = window.open(url, '_blank', 'noopener');
      if (blank) return Promise.resolve({ via: 'window-blank', after: why });
    } catch (e2) { /* try next */ }
    try {
      var a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { try { document.body.removeChild(a); } catch (e3) { /* gone */ } }, 0);
      return Promise.reject(new Error(browserDiag(
        mid + '+anchor-noop+window-open-null',
        prior || why
      )));
    } catch (e4) {
      return Promise.reject(new Error(browserDiag(
        mid + '+anchor-throw',
        (e4 && e4.message) || prior || why
      )));
    }
  }

  function authRedirectUrl() {
    return isNativeApp() ? NATIVE_AUTH_URL : pageUrl();
  }

  function recoveryRedirectUrl() {
    return pageUrl() + (pageUrl().indexOf('?') >= 0 ? '&' : '?') + 'mode=resetPassword';
  }

  function parseNativeAuthUrl(raw) {
    var url;
    try { url = new URL(String(raw)); } catch (e) { return null; }
    if (String(url.protocol || '').toLowerCase() !== 'com.prismburst.brickodyssey:') return null;
    if (String(url.hostname || '').toLowerCase() !== 'auth') return null;
    var hash = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    return {
      idToken: url.searchParams.get('id_token') || hash.get('id_token') || '',
      state: url.searchParams.get('state') || hash.get('state') || '',
      error: url.searchParams.get('error_description') || url.searchParams.get('error') || hash.get('error_description') || hash.get('error') || '',
      type: url.searchParams.get('type') || hash.get('type') || '',
      oobCode: url.searchParams.get('oobCode') || hash.get('oobCode') || '',
      mode: url.searchParams.get('mode') || hash.get('mode') || ''
    };
  }

  function randomToken() {
    var bytes = new Uint8Array(16);
    try {
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
      else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    } catch (e) {
      for (var j = 0; j < bytes.length; j++) bytes[j] = Math.floor(Math.random() * 256);
    }
    var out = '';
    for (var k = 0; k < bytes.length; k++) out += ('0' + bytes[k].toString(16)).slice(-2);
    return out;
  }

  function firebaseConfig() {
    var raw = window.PB_FIREBASE || {};
    return {
      apiKey: String(raw.apiKey || '').trim(),
      authDomain: String(raw.authDomain || '').trim(),
      projectId: String(raw.projectId || '').trim(),
      storageBucket: String(raw.storageBucket || '').trim(),
      messagingSenderId: String(raw.messagingSenderId || '').trim(),
      appId: String(raw.appId || '').trim()
    };
  }

  function providersConfig() {
    var cfg = window.PB_CONFIG || {};
    return {
      email: !!(cfg.providers && cfg.providers.email === true),
      google: !!(cfg.providers && cfg.providers.google === true),
      facebook: !!(cfg.providers && cfg.providers.facebook === true)
    };
  }

  function isPlaceholder(value) {
    return !value || /^PLACEHOLDER_/i.test(String(value));
  }

  function looksLikeServiceAccount(cfg) {
    var blob = JSON.stringify(cfg || {}).toLowerCase();
    if (blob.indexOf('private_key') !== -1) return true;
    if (blob.indexOf('begin private key') !== -1) return true;
    var sa = 'service' + '_account';
    if (blob.indexOf('"type":"' + sa + '"') !== -1) return true;
    if (blob.indexOf(sa) !== -1 && blob.indexOf('client_email') !== -1) return true;
    return false;
  }

  function usableFirebase(cfg) {
    if (!cfg) return false;
    if (looksLikeServiceAccount(cfg)) return false;
    var keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    for (var i = 0; i < keys.length; i++) {
      if (isPlaceholder(cfg[keys[i]])) return false;
    }
    return true;
  }

  function friendlyError(err) {
    var code = String(err && (err.code || err.errorCode) || '');
    var msg = err && (err.message || err.error_description || err.msg) || '';
    var low = String(msg).toLowerCase();
    var name = err && err.name || '';
    if (!err) return 'Something went wrong. Progress on this device is unchanged.';
    if (code === 'auth/email-already-in-use' || low.indexOf('email-already-in-use') !== -1 || low.indexOf('already in use') !== -1) {
      return 'This email already has an account. Log in or use Forgot password.';
    }
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/user-not-found' ||
        low.indexOf('wrong-password') !== -1 || low.indexOf('invalid-credential') !== -1 || low.indexOf('invalid login') !== -1) {
      return 'That email or password is incorrect.';
    }
    if (code === 'auth/too-many-requests' || low.indexOf('too-many-requests') !== -1 || low.indexOf('too many') !== -1) {
      return 'Too many tries. Wait a minute, then try again. Progress on this device is unchanged.';
    }
    if (code === 'auth/network-request-failed' || low === 'timeout' || low.indexOf('failed to fetch') !== -1 ||
        low.indexOf('network') !== -1 || name === 'FirebaseError' && low.indexOf('network') !== -1) {
      return 'You appear to be offline. Your progress stays on this device.';
    }
    if (code === 'auth/requires-recent-login' || low.indexOf('requires-recent-login') !== -1) {
      return 'For security, sign in again, then delete the account. Nothing was deleted.';
    }
    if (code === 'auth/weak-password' || (low.indexOf('password') !== -1 && low.indexOf('at least') !== -1)) {
      return 'Use at least 6 characters in the password.';
    }
    if (code === 'auth/invalid-email') return 'Enter a valid email address.';
    if (code === 'auth/user-disabled') return 'This account is disabled. Progress on this device is unchanged.';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' ||
        low.indexOf('denied') !== -1 || low.indexOf('cancel') !== -1) {
      return 'Sign-in was cancelled.';
    }
    if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code' ||
        (low.indexOf('link') !== -1 && low.indexOf('expired') !== -1)) {
      return 'This link has expired or was opened in a different browser. Ask for a new reset link and open it on this phone. Progress on this device is unchanged.';
    }
    if (low.indexOf('not set up') !== -1 || low.indexOf('cloud save not set up') !== -1) {
      return 'Cloud save not set up yet.';
    }
    if (err.status >= 500) return 'The account server had a problem. Your progress stays on this device.';
    return msg || 'Sign-in failed. Progress on this device is unchanged.';
  }

  function isOfflineError(error) {
    var code = String(error && error.code || '');
    var msg = String(error && error.message || error || '').toLowerCase();
    return code === 'auth/network-request-failed' || msg.indexOf('failed to fetch') !== -1 ||
      msg.indexOf('network') !== -1 || msg === 'timeout' || msg.indexOf('unavailable') !== -1;
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

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function backoffDelay(attempt) {
    var base = 250 * Math.pow(2, Math.max(0, attempt - 1));
    return Math.min(MAX_BACKOFF_MS, base);
  }

  function withBackoff(fn, maxAttempts) {
    maxAttempts = maxAttempts || 3;
    var attempt = 0;
    function once() {
      attempt += 1;
      return Promise.resolve().then(fn).then(function (value) {
        return value;
      }, function (err) {
        if (attempt >= maxAttempts || !isOfflineError(err)) throw err;
        return sleep(backoffDelay(attempt)).then(once);
      });
    }
    return once();
  }

  function stripOAuthParams() {
    var u;
    try { u = new URL(window.location.href); } catch (e) { return; }
    var dirty = false;
    ['code', 'state', 'error', 'error_description', 'error_code', 'apiKey', 'oobCode', 'mode', 'lang'].forEach(function (key) {
      if (u.searchParams.has(key)) { u.searchParams.delete(key); dirty = true; }
    });
    if (u.hash && (/id_token=|access_token=|error=/.test(u.hash))) {
      u.hash = '';
      dirty = true;
    }
    if (!dirty) return;
    try { history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e2) { /* keep the url */ }
  }

  function sessionFromUser(user) {
    if (!user) return null;
    return { user: user };
  }

  function providerFromUser(user) {
    if (!user) return '';
    var data = user.providerData || [];
    if (data[0] && data[0].providerId) {
      var id = data[0].providerId;
      if (id === 'google.com') return 'google';
      if (id === 'password') return 'email';
      if (id === 'facebook.com') return 'facebook';
      return id;
    }
    return user.isAnonymous ? 'anonymous' : 'email';
  }

  var Cloud = PB.Cloud = {
    client: null,
    auth: null,
    db: null,
    session: null,
    syncLabel: 'Not signed in',
    errorText: '',
    loading: false,
    pendingConfirmEmail: '',
    lastSignupOutcome: '',
    pending: null,
    recovery: false,
    recoveryOobCode: '',
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
    _authUnsub: null,
    ready: null,

    init: function () {
      var self = this;
      if (this._started) return;
      this._started = true;
      try { if (PB.Profile) PB.Profile.ensureGuest(); } catch (e) { /* a name must not block play */ }
      this.ready = new Promise(function (resolve) { self._resolveReady = resolve; });
      try {
        var u0 = new URL(window.location.href);
        if (u0.searchParams.get('mode') === 'resetPassword' && u0.searchParams.get('oobCode')) {
          this.recovery = true;
          this.recoveryOobCode = u0.searchParams.get('oobCode');
        }
      } catch (e1) { /* ignore */ }

      var cfg = firebaseConfig();
      if (looksLikeServiceAccount(cfg) || looksLikeServiceAccount(window.PB_FIREBASE)) {
        this.errorText = 'That config looks like a service account. The game only accepts the public Firebase web config. Nothing was sent. Progress on this device is unchanged.';
        this.syncLabel = 'Error';
        this.settleReady();
        this.emit();
        return;
      }
      if (!usableFirebase(cfg)) {
        this.syncLabel = 'Not signed in';
        this.errorText = '';
        this.settleReady();
        this.emit();
        return;
      }
      var firebase = window.firebase;
      if (!firebase || typeof firebase.initializeApp !== 'function') {
        this.errorText = 'Cloud library failed to load. You can keep playing as a guest.';
        this.syncLabel = 'Error';
        this.settleReady();
        this.emit();
        return;
      }
      try {
        if (!firebase.apps || !firebase.apps.length) {
          this.client = firebase.initializeApp(cfg);
        } else {
          this.client = firebase.app();
        }
        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this._authUnsub = this.auth.onAuthStateChanged(function (user) {
          setTimeout(function () { self.handleAuthUser(user); }, 0);
        });
        this.attachNativeAuth();
        this.consumeWebResetLink();
      } catch (e2) {
        this.client = null;
        this.auth = null;
        this.db = null;
        this.errorText = friendlyError(e2);
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

    handleAuthUser: function (user) {
      var self = this;
      if (!user) {
        this.session = null;
        this.pending = null;
        this.accountName = null;
        this.nameSuggestion = '';
        this.namePrompt = false;
        this.nameNote = '';
        if (this._hadSession && !this._loggingOut && !this._deleting) {
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
      this.session = sessionFromUser(user);
      this._hadSession = true;
      if (user.email && user.emailVerified === false && providerFromUser(user) === 'email' && !this.recovery) {
        // keep session for password update / verification flows, but cloud sync waits until verified
      }
      this.loadAccountName(this.session);
      this.reconcile(this.session).then(function () { self.settleReady(); }, function () { self.settleReady(); });
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
      var providers = providersConfig();
      return usableFirebase(firebaseConfig()) && providers[name] === true;
    },

    hasCredentials: function () { return usableFirebase(firebaseConfig()); },

    setSync: function (label) {
      this.syncLabel = label;
      this.emit();
    },

    setError: function (text) {
      this.errorText = text || '';
      if (text) this.syncLabel = 'Error';
      this.emit();
    },

    notSetUpMessage: function () {
      return 'Cloud save not set up yet.';
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
      var user = this.session && this.session.user;
      return {
        sync: this.syncLabel,
        error: this.errorText || '',
        signedIn: !!user,
        userId: user ? user.uid : null,
        email: user ? (user.email || '') : '',
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
        resetWait: this.resetWaitMs(),
        confirmWait: this.confirmWaitMs(),
        pendingConfirmEmail: this.pendingConfirmEmail || '',
        lastSignupOutcome: this.lastSignupOutcome || '',
        cloudReady: this.hasCredentials()
      };
    },

    providerName: function () {
      return providerFromUser(this.session && this.session.user);
    },

    getClient: function () { return this.client; },

    noteLocalChange: function () {
      if (this._applying || this._suppress) return;
      var meta = readMeta();
      meta.clientUpdatedAt = new Date().toISOString();
      meta.queue = this.session && this.session.user ? {
        userId: this.session.user.uid,
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
      var userId = this.session.user.uid;
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
      if (!user || !user.uid) return Promise.resolve();
      if (this._reconcilePromise && this._reconcileUser === user.uid) return this._reconcilePromise;
      this._reconcileUser = user.uid;
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
      var userId = session.user.uid;
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

    saveDoc: function (userId) {
      return this.db.collection('saves').doc(userId);
    },

    profileDoc: function (userId) {
      return this.db.collection('profiles').doc(userId);
    },

    fetchRemote: function (userId) {
      var self = this;
      if (!this.db) return Promise.reject(new Error('Cloud is not set up.'));
      return withBackoff(function () {
        return withTimeout(self.saveDoc(userId).get(), 15000).then(function (snap) {
          if (!snap || !snap.exists) return null;
          var data = snap.data() || {};
          var check = Sync.validateCloudData(data.data);
          if (!check.ok) return { invalid: true, error: check.error };
          return {
            save: check.save,
            revision: typeof data.revision === 'number' ? data.revision : 0,
            clientUpdatedAt: data.client_updated_at || check.clientUpdatedAt,
            cloudData: data.data
          };
        });
      }, 3);
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
        return self.rpcUpsert(userId, body, revision).then(function (res) {
          if (res.conflict) {
            if (attempt >= 3) throw new Error('Could not sync because the cloud save kept changing.');
            return sleep(backoffDelay(attempt)).then(function () {
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

    rpcUpsert: function (userId, payload, expected) {
      var self = this;
      var db = this.db;
      if (!db) return Promise.reject(new Error('Cloud is not set up.'));
      return withTimeout(db.runTransaction(function (tx) {
        var ref = self.saveDoc(userId);
        return tx.get(ref).then(function (snap) {
          var cur = snap.exists ? (snap.data() || {}) : null;
          var curRev = cur && typeof cur.revision === 'number' ? cur.revision : 0;
          if (cur && curRev !== (expected || 0)) {
            return { conflict: true };
          }
          var nextRev = curRev + 1;
          var row = {
            data: payload,
            save_version: Sync.SAVE_VERSION,
            revision: nextRev,
            client_updated_at: payload.client_updated_at,
            updated_at: new Date().toISOString()
          };
          tx.set(ref, row, { merge: true });
          return { conflict: false, revision: nextRev };
        });
      }), 15000).then(function (res) {
        if (res && res.conflict) return { conflict: true };
        if (!res || !res.revision) throw new Error('Cloud save did not return a revision.');
        return res;
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
      if (provider === 'facebook') {
        this.errorText = 'Facebook login is coming soon.';
        this.emit();
        return Promise.resolve();
      }
      if (!this.providerEnabled(provider)) {
        this.errorText = this.hasCredentials() ? 'Not set up yet.' : this.notSetUpMessage();
        this.emit();
        return Promise.resolve();
      }
      return this.busy(function () {
        if (provider !== 'google') throw new Error('Not set up yet.');
        if (isNativeApp()) return self.signInGoogleNative();
        return self.signInGoogleWeb();
      });
    },

    signInGoogleWeb: function () {
      var self = this;
      var firebase = window.firebase;
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('openid');
      provider.addScope('email');
      provider.addScope('profile');
      return withTimeout(self.auth.signInWithPopup(provider), 60000).then(function (cred) {
        if (!cred || !cred.user) throw new Error('Sign-in could not finish. Progress on this device is unchanged.');
        return self.afterAuthCall();
      });
    },

    signInGoogleNative: function () {
      var self = this;
      var state = randomToken();
      var nonce = randomToken();
      try {
        sessionStorage.setItem(AUTH_STATE_KEY, JSON.stringify({ state: state, nonce: nonce, at: Date.now() }));
      } catch (e) {
        try { localStorage.setItem(AUTH_STATE_KEY, JSON.stringify({ state: state, nonce: nonce, at: Date.now() })); } catch (e2) { /* continue */ }
      }
      var bridge = PUBLIC_SITE + 'auth-bridge.html?state=' + encodeURIComponent(state) + '&nonce=' + encodeURIComponent(nonce);
      self._nativeAuthPending = true;
      self._nativeAuthHandled = false;
      self._nativeAuthState = state;
      return openExternalUrl(bridge);
    },

    signInEmail: function (email, password) {
      var self = this;
      var problem = this.checkEmailPassword(email, password);
      if (problem) { this.setError(problem); return Promise.resolve(); }
      if (!this.providerEnabled('email')) {
        this.setError(this.hasCredentials() ? 'Not set up yet.' : this.notSetUpMessage());
        return Promise.resolve();
      }
      return this.busy(function () {
        return withTimeout(self.auth.signInWithEmailAndPassword(String(email).trim(), password), 15000).then(function (cred) {
          var user = cred && cred.user;
          if (user && user.emailVerified === false) {
            self.pendingConfirmEmail = user.email || String(email).trim();
            self._loggingOut = true;
            self._hadSession = false;
            return self.auth.signOut().then(function () {
              return new Promise(function (resolve) {
                setTimeout(function () {
                  self._loggingOut = false;
                  self.session = null;
                  self.lastSignupOutcome = '';
                  self.errorText = 'Confirm your email before signing in. Check your inbox and spam/junk folder.';
                  self.syncLabel = 'Not signed in';
                  self.emit();
                  resolve();
                }, 50);
              });
            });
          }
          return self.afterAuthCall();
        });
      });
    },

    signUpEmail: function (email, password) {
      var self = this;
      var problem = this.checkEmailPassword(email, password);
      if (problem) { this.setError(problem); return Promise.resolve(); }
      if (!this.providerEnabled('email')) {
        this.setError(this.hasCredentials() ? 'Not set up yet.' : this.notSetUpMessage());
        return Promise.resolve();
      }
      email = String(email || '').trim();
      this.lastSignupOutcome = '';
      return this.busy(function () {
        return withTimeout(self.auth.createUserWithEmailAndPassword(email, password), 15000).then(function (cred) {
          var user = cred && cred.user;
          if (!user) throw new Error('Sign-up could not finish. Progress on this device is unchanged.');
          var action = {
            url: authRedirectUrl(),
            handleCodeInApp: false
          };
          return withTimeout(user.sendEmailVerification(action), 15000).then(function () {
            self.pendingConfirmEmail = email;
            self.lastSignupOutcome = 'confirm';
            self._confirmAt = Date.now();
            self._loggingOut = true;
            self._hadSession = false;
            return self.auth.signOut().then(function () {
              return new Promise(function (resolve) {
                setTimeout(function () {
                  self._loggingOut = false;
                  self.session = null;
                  self.errorText = 'Check your inbox and spam/junk folder for the confirmation email. The link opens back into the game. Your progress stays on this device.';
                  self.syncLabel = 'Not signed in';
                  self.emit();
                  resolve();
                }, 50);
              });
            });
          });
        }, function (err) {
          if (err && (err.code === 'auth/email-already-in-use' || /already.?in.?use/i.test(String(err.message || '')))) {
            self.pendingConfirmEmail = '';
            self.lastSignupOutcome = 'exists';
            self.errorText = 'This email already has an account. Log in or use Forgot password.';
            self.syncLabel = 'Not signed in';
            return;
          }
          throw err;
        });
      });
    },

    confirmWaitMs: function () {
      if (!this._confirmAt) return 0;
      var left = RESET_COOLDOWN_MS - (Date.now() - this._confirmAt);
      return left > 0 ? left : 0;
    },

    resendConfirmEmail: function (email) {
      var self = this;
      email = String(email || this.pendingConfirmEmail || '').trim();
      if (!this.providerEnabled('email')) {
        this.setError(this.hasCredentials() ? 'Not set up yet.' : this.notSetUpMessage());
        return Promise.resolve();
      }
      if (!email || email.indexOf('@') < 1 || email.length > 320) {
        this.setError('Enter the email for that account.');
        return Promise.resolve();
      }
      if (this.confirmWaitMs() > 0) {
        this.setError('A confirmation email was just sent. Wait ' + Math.ceil(this.confirmWaitMs() / 1000) + ' seconds before asking again.');
        return Promise.resolve();
      }
      return this.busy(function () {
        // Re-auth is not required: create a temporary credential attempt is unsafe.
        // Firebase needs a signed-in user for sendEmailVerification. Sign in silently
        // only when the player already typed the password on the form.
        var passEl = document.getElementById('pb-password-input');
        var password = passEl ? String(passEl.value || '') : '';
        if (!password) {
          self.errorText = 'Enter your password, then tap Resend confirmation email.';
          self.syncLabel = 'Not signed in';
          return;
        }
        return withTimeout(self.auth.signInWithEmailAndPassword(email, password), 15000).then(function (cred) {
          var user = cred && cred.user;
          if (!user) throw new Error('Could not resend. Progress on this device is unchanged.');
          if (user.emailVerified) {
            return self.auth.signOut().then(function () {
              self.pendingConfirmEmail = '';
              self.errorText = 'This email is already confirmed. Log in instead.';
              self.syncLabel = 'Not signed in';
            });
          }
          return withTimeout(user.sendEmailVerification({ url: authRedirectUrl(), handleCodeInApp: false }), 15000).then(function () {
            self._confirmAt = Date.now();
            self.pendingConfirmEmail = email;
            self._loggingOut = true;
            self._hadSession = false;
            return self.auth.signOut().then(function () {
              return new Promise(function (resolve) {
                setTimeout(function () {
                  self._loggingOut = false;
                  self.session = null;
                  self.errorText = 'Confirmation email sent again. Check your inbox and spam/junk folder. Your progress stays on this device.';
                  self.syncLabel = 'Not signed in';
                  self.emit();
                  resolve();
                }, 50);
              });
            });
          });
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
      if (!this.providerEnabled('email')) {
        this.setError(this.hasCredentials() ? 'Not set up yet.' : this.notSetUpMessage());
        return Promise.resolve();
      }
      if (!email || email.indexOf('@') < 1 || email.length > 320) { this.setError('Enter the email for that account.'); return Promise.resolve(); }
      if (this.resetWaitMs() > 0) {
        this.setError('A reset link was just sent. Wait ' + Math.ceil(this.resetWaitMs() / 1000) + ' seconds before asking again.');
        return Promise.resolve();
      }
      return this.busy(function () {
        var action = { url: recoveryRedirectUrl(), handleCodeInApp: false };
        return withTimeout(self.auth.sendPasswordResetEmail(email, action), 15000).then(function () {
          self._resetAt = Date.now();
          self.errorText = 'Password reset email sent. If that email has an account, open the link on this phone to choose a new password. Your progress stays on this device.';
          self.syncLabel = self.session ? self.syncLabel : 'Not signed in';
        });
      });
    },

    cancelRecovery: function () {
      this.recovery = false;
      this.recoveryOobCode = '';
      this.emit();
    },

    consumeWebResetLink: function () {
      if (!this.recovery || !this.recoveryOobCode) return;
      if (PB.Account && PB.Account.open) PB.Account.open('recovery');
      stripOAuthParams();
    },

    updatePassword: function (password, confirmPassword) {
      var self = this;
      if (!password || password.length < 6) { this.setError('Use at least 6 characters in the password.'); return Promise.resolve(); }
      if (password.length > 72) { this.setError('Password is too long.'); return Promise.resolve(); }
      if (confirmPassword !== undefined && confirmPassword !== password) { this.setError('The two passwords do not match.'); return Promise.resolve(); }
      if (!this.auth) { this.setError('This reset link has expired. Ask for a new one. Progress on this device is unchanged.'); return Promise.resolve(); }
      return this.busy(function () {
        if (self.recoveryOobCode) {
          return withTimeout(self.auth.confirmPasswordReset(self.recoveryOobCode, password), 15000).then(function () {
            self.recovery = false;
            self.recoveryOobCode = '';
            self.errorText = 'Password updated. Log in with your new password. Progress on this device was kept.';
            self.syncLabel = 'Not signed in';
          });
        }
        var user = self.auth.currentUser;
        if (!user) { throw new Error('This reset link has expired. Ask for a new one. Progress on this device is unchanged.'); }
        return withTimeout(user.updatePassword(password), 15000).then(function () {
          self.recovery = false;
          self.errorText = 'Password updated. You are signed in. Progress on this device was kept.';
        });
      });
    },

    logout: function () {
      var self = this;
      if (!this.auth) return Promise.resolve();
      this._loggingOut = true;
      this.pending = null;
      return this.busy(function () {
        return withTimeout(self.auth.signOut(), 8000).then(function () {
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

    deleteAccount: function (typed) {
      var self = this;
      var core = PB.DeleteCore;
      if (!core || !core.matches(typed)) {
        this.errorText = 'Type ' + (core ? core.PHRASE : 'DELETE') + ' in capitals to confirm. Nothing was deleted.';
        this.emit();
        return Promise.resolve(false);
      }
      if (!this.auth || !this.session || !this.session.user) {
        this.setError('Sign in to the account you want to delete first. Nothing was deleted.');
        return Promise.resolve(false);
      }
      var ok = false;
      return this.busy(function () {
        clearTimeout(self._timer);
        self._deleting = true;
        self._loggingOut = true;
        return self._chain.then(function () {
          return core.run({ auth: self.auth, db: self.db, user: self.session.user }, typed);
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
      return this.fetchProfile(user.uid).then(function (row) {
        if (!self.session || !self.session.user || self.session.user.uid !== user.uid) return;
        if (row && row.display_name) {
          self.accountName = row.display_name;
          self.nameSuggestion = '';
          self.namePrompt = false;
          self.nameNote = '';
          self.emit();
          return;
        }
        var guest = PB.Profile ? PB.Profile.guestName() : '';
        var meta = {
          full_name: user.displayName || '',
          name: user.displayName || '',
          avatar_url: user.photoURL || ''
        };
        var suggested = PB.Profile ? PB.Profile.suggest(meta, guest, user.email) : '';
        self.accountName = null;
        self.nameSuggestion = suggested;
        self.namePrompt = true;
        self.nameNote = suggested
          ? 'Save a display name for this account. You can edit the suggestion.'
          : 'Choose a display name for this account. It is not your email.';
        self.emit();
        if (PB.Account && PB.Account.open) PB.Account.open();
      }, function () {
        if (!self.session || !self.session.user || self.session.user.uid !== user.uid) return;
        self.nameNote = 'Could not load the display name. Your progress is unchanged.';
        self.emit();
      });
    },

    fetchProfile: function (userId) {
      var self = this;
      if (!this.db) return Promise.resolve(null);
      return withTimeout(self.profileDoc(userId).get(), 15000).then(function (snap) {
        if (!snap || !snap.exists) return null;
        return snap.data() || null;
      });
    },

    upsertProfile: function (userId, name) {
      var self = this;
      return withTimeout(self.profileDoc(userId).set({ display_name: name, updated_at: new Date().toISOString() }, { merge: true }), 15000).then(function () {
        return name;
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
      return this.upsertProfile(this.session.user.uid, checked.name).then(function (saved) {
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

    readBridgeState: function () {
      var raw = null;
      try { raw = sessionStorage.getItem(AUTH_STATE_KEY); } catch (e) { raw = null; }
      if (!raw) {
        try { raw = localStorage.getItem(AUTH_STATE_KEY); } catch (e2) { raw = null; }
      }
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e3) { return null; }
    },

    clearBridgeState: function () {
      try { sessionStorage.removeItem(AUTH_STATE_KEY); } catch (e) { /* ignore */ }
      try { localStorage.removeItem(AUTH_STATE_KEY); } catch (e2) { /* ignore */ }
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
        this.clearBridgeState();
        this.setError(friendlyError({ message: parsed.error }));
        return;
      }
      if (parsed.mode === 'resetPassword' && parsed.oobCode) {
        this.recovery = true;
        this.recoveryOobCode = parsed.oobCode;
        if (PB.Account && PB.Account.open) PB.Account.open('recovery');
        this.loading = false;
        this.emit();
        return;
      }
      if (!this.auth || !window.firebase) {
        this.loading = false;
        this.setError('Sign-in could not return to this page. Progress on this device is unchanged.');
        return;
      }
      var expected = this.readBridgeState();
      if (!parsed.idToken) {
        this.loading = false;
        this.clearBridgeState();
        this.setError('Sign-in could not return to this page. Progress on this device is unchanged.');
        return;
      }
      if (!expected || !expected.state || parsed.state !== expected.state) {
        this.loading = false;
        this.clearBridgeState();
        this.setError('Sign-in could not be verified. Progress on this device is unchanged.');
        return;
      }
      this.clearBridgeState();
      this.loading = true;
      this.emit();
      var credential = window.firebase.auth.GoogleAuthProvider.credential(parsed.idToken);
      // Never log or display tokens.
      Promise.resolve(this.auth.signInWithCredential(credential)).then(function () {
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

  // Guest / placeholder: show friendly label when UI asks to sign in without config
  var _origProviderEnabled = Cloud.providerEnabled;
  Cloud.providerEnabled = function (name) {
    if (!usableFirebase(firebaseConfig())) return false;
    return _origProviderEnabled.call(this, name);
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
    if (reason && (reason.code && String(reason.code).indexOf('auth/') === 0)) {
      event.preventDefault();
      Cloud.setError(friendlyError(reason));
    }
  });

  // Expose helpers for unit tests (no secrets)
  Cloud._test = {
    usableFirebase: usableFirebase,
    isPlaceholder: isPlaceholder,
    friendlyError: friendlyError,
    backoffDelay: backoffDelay,
    parseNativeAuthUrl: parseNativeAuthUrl,
    firebaseConfig: firebaseConfig,
    MAX_BACKOFF_MS: MAX_BACKOFF_MS
  };

  Cloud.init();
})();
