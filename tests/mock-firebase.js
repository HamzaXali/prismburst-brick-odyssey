/* TEST-ONLY. Injected into the page. Not shipped. */
'use strict';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function testFirebaseConfig() {
  return {
    apiKey: 'AIzaSyTestOnlyNotReal00000000000000000',
    authDomain: 'prismburst-test.firebaseapp.com',
    projectId: 'prismburst-test',
    storageBucket: 'prismburst-test.appspot.com',
    messagingSenderId: '123456789012',
    appId: '1:123456789012:web:abcdef0123456789'
  };
}

function configBody(providers) {
  return 'window.PB_FIREBASE = ' + JSON.stringify(testFirebaseConfig()) + ';\n' +
    'window.PB_CONFIG = ' + JSON.stringify({
      providers: providers || { email: true, google: true, facebook: false }
    }) + ';';
}

function emptyConfigBody() {
  return 'window.PB_FIREBASE = ' + JSON.stringify({
    apiKey: 'PLACEHOLDER_API_KEY',
    authDomain: 'PLACEHOLDER_AUTH_DOMAIN',
    projectId: 'PLACEHOLDER_PROJECT_ID',
    storageBucket: 'PLACEHOLDER_STORAGE_BUCKET',
    messagingSenderId: 'PLACEHOLDER_MESSAGING_SENDER_ID',
    appId: 'PLACEHOLDER_APP_ID'
  }) + ';\n' +
    'window.PB_CONFIG = ' + JSON.stringify({
      providers: { email: true, google: true, facebook: false }
    }) + ';';
}

function createState(opts) {
  return Object.assign({
    users: {
      'ali@example.com': { uid: USER_A, email: 'ali@example.com', password: 'secret12', emailVerified: true, providerData: [{ providerId: 'password' }] },
      'other@example.com': { uid: USER_B, email: 'other@example.com', password: 'secret12', emailVerified: true, providerData: [{ providerId: 'password' }] }
    },
    saves: {},
    profiles: {},
    profileWrites: [],
    upserts: [],
    conflicts: 0,
    networkDown: false,
    forceUnverified: false,
    currentUser: null,
    authListeners: [],
    popupResult: null,
    credentialLog: [],
    bridgeTokens: []
  }, opts || {});
}

/** Returns a function source string for page.addInitScript / evaluate. */
function installMockSource() {
  return String(function (state) {
    function emitAuth(user) {
      state.currentUser = user;
      authApi && (authApi._cu = user);
      (state.authListeners || []).forEach(function (fn) {
        try { fn(user); } catch (e) {}
      });
    }
    function makeUser(rec) {
      if (!rec) return null;
      return {
        uid: rec.uid,
        email: rec.email,
        emailVerified: !!rec.emailVerified,
        displayName: rec.displayName || null,
        photoURL: rec.photoURL || null,
        providerData: rec.providerData || [{ providerId: 'password' }],
        getIdToken: function () { return Promise.resolve('id-token-' + rec.uid); },
        sendEmailVerification: function () {
          state.lastVerification = rec.email;
          return Promise.resolve();
        },
        updatePassword: function (password) {
          rec.password = password;
          return Promise.resolve();
        },
        delete: function () {
          Object.keys(state.users).forEach(function (k) {
            if (state.users[k].uid === rec.uid) delete state.users[k];
          });
          delete state.saves[rec.uid];
          delete state.profiles[rec.uid];
          emitAuth(null);
          return Promise.resolve();
        }
      };
    }
    function authError(code, message) {
      var err = new Error(message || code);
      err.code = code;
      return err;
    }
    function DocRef(col, id) {
      this._col = col; this._id = id;
    }
    DocRef.prototype.get = function () {
      if (state.networkDown) return Promise.reject(authError('unavailable', 'network'));
      var bag = this._col === 'saves' ? state.saves : state.profiles;
      var data = bag[this._id];
      return Promise.resolve({
        exists: !!data,
        data: function () { return data ? JSON.parse(JSON.stringify(data)) : undefined; }
      });
    };
    DocRef.prototype.set = function (row, opts) {
      if (state.networkDown) return Promise.reject(authError('unavailable', 'network'));
      var bag = this._col === 'saves' ? state.saves : state.profiles;
      if (this._col === 'profiles') state.profileWrites.push({ method: opts && opts.merge ? 'MERGE' : 'SET', body: row, id: this._id });
      if (this._col === 'saves') state.upserts.push({ expected: row.revision, body: row });
      bag[this._id] = Object.assign({}, bag[this._id] || {}, row);
      return Promise.resolve();
    };
    DocRef.prototype.delete = function () {
      var bag = this._col === 'saves' ? state.saves : state.profiles;
      delete bag[this._id];
      return Promise.resolve();
    };
    var authApi = {
      onAuthStateChanged: function (fn) {
        state.authListeners.push(fn);
        setTimeout(function () {
          var user = null;
          if (state.currentUser) {
            var rec = null;
            Object.keys(state.users).forEach(function (k) {
              if (state.users[k].uid === state.currentUser.uid) rec = state.users[k];
            });
            user = makeUser(rec || state.currentUser);
          }
          fn(user);
        }, 0);
        return function () {};
      },
      signInWithEmailAndPassword: function (email, password) {
        if (state.networkDown) return Promise.reject(authError('auth/network-request-failed', 'network'));
        var rec = state.users[String(email).trim()];
        if (!rec || rec.password !== password) return Promise.reject(authError('auth/wrong-password', 'wrong'));
        if (state.forceUnverified) rec.emailVerified = false;
        var user = makeUser(rec);
        emitAuth(user);
        return Promise.resolve({ user: user });
      },
      createUserWithEmailAndPassword: function (email, password) {
        if (state.networkDown) return Promise.reject(authError('auth/network-request-failed', 'network'));
        email = String(email).trim();
        if (state.users[email]) return Promise.reject(authError('auth/email-already-in-use', 'already in use'));
        var rec = { uid: 'new-' + Object.keys(state.users).length, email: email, password: password, emailVerified: false, providerData: [{ providerId: 'password' }] };
        state.users[email] = rec;
        var user = makeUser(rec);
        emitAuth(user);
        return Promise.resolve({ user: user });
      },
      sendPasswordResetEmail: function (email) {
        state.lastReset = email;
        return Promise.resolve();
      },
      confirmPasswordReset: function (code, password) {
        state.lastConfirmReset = { code: code, password: password };
        return Promise.resolve();
      },
      signOut: function () {
        authApi.currentUser = null;
        emitAuth(null);
        return Promise.resolve();
      },
      signInWithPopup: function (provider) {
        if (state.popupError) return Promise.reject(state.popupError);
        var rec = state.popupResult || {
          uid: USER_A, email: 'ali@example.com', emailVerified: true,
          displayName: 'Ali Prism', providerData: [{ providerId: 'google.com' }]
        };
        state.users[rec.email] = Object.assign({}, state.users[rec.email] || {}, rec);
        var user = makeUser(state.users[rec.email]);
        emitAuth(user);
        return Promise.resolve({ user: user });
      },
      signInWithCredential: function (cred) {
        state.credentialLog.push({ hasIdToken: !!(cred && cred.idToken), hasAccessToken: !!(cred && cred.accessToken) });
        var rec = state.users['ali@example.com'] || {
          uid: USER_A, email: 'ali@example.com', emailVerified: true,
          displayName: 'Ali Prism', providerData: [{ providerId: 'google.com' }], password: 'x'
        };
        rec.providerData = [{ providerId: 'google.com' }];
        state.users[rec.email] = rec;
        var user = makeUser(rec);
        emitAuth(user);
        return Promise.resolve({ user: user });
      }
    };
    Object.defineProperty(authApi, 'currentUser', {
      get: function () { return state.currentUser; },
      set: function (v) { state.currentUser = v; }
    });

    var firestoreApi = {
      collection: function (name) {
        return {
          doc: function (id) { return new DocRef(name, id); }
        };
      },
      runTransaction: function (fn) {
        if (state.networkDown) return Promise.reject(authError('unavailable', 'network'));
        var tx = {
          get: function (ref) { return ref.get(); },
          set: function (ref, row, opts) { return ref.set(row, opts); }
        };
        // Conflict simulation: if state.conflicts > 0, first write sees mismatched revision
        return Promise.resolve(fn(tx)).then(function (res) {
          if (state.conflicts > 0 && res && !res.conflict) {
            // handled inside cloud.js via revision check on get
          }
          return res;
        });
      }
    };

    window.firebase = {
      apps: [],
      initializeApp: function (cfg) {
        window.firebase.apps.push({ options: cfg });
        return { name: '[DEFAULT]', options: cfg };
      },
      app: function () { return window.firebase.apps[0]; },
      auth: function () { return authApi; },
      firestore: function () { return firestoreApi; }
    };
    window.firebase.auth.GoogleAuthProvider = function () {
      this.addScope = function () {};
      this.setCustomParameters = function () {};
    };
    window.firebase.auth.GoogleAuthProvider.credential = function (idToken, accessToken) {
      return { idToken: idToken, accessToken: accessToken || null, providerId: 'google.com' };
    };
    window.firebase.auth.GoogleAuthProvider.credentialFromResult = function (result) {
      var c = result && result.credential;
      return c || { idToken: 'mock-google-id-token', accessToken: 'mock-google-access', providerId: 'google.com' };
    };
    window.__PB_MOCK_STATE = state;
  });
}

module.exports = {
  USER_A, USER_B, testFirebaseConfig, configBody, emptyConfigBody, createState, installMockSource
};
