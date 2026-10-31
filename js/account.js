/*
 * PRISMBURST — account.js
 * DOM account sheet in the neon-crystal style. Phaser draws the menu badge;
 * email fields are real inputs so the phone keyboard and password manager work.
 */
(function () {
  'use strict';
  var PB = window.PB;

  function $(id) { return document.getElementById(id); }

  function setDisabled(el, disabled) {
    if (!el) return;
    el.disabled = !!disabled;
    el.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  }

  function setGameInput(enabled) {
    var game = PB.game;
    if (!game || !game.scene) return;
    var scenes;
    try { scenes = game.scene.getScenes(true); } catch (e) { return; }
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].input) scenes[i].input.enabled = enabled;
    }
  }

  var VIEWS = ['auth', 'forgot', 'recovery', 'account', 'delete', 'deleted'];

  function show(el, on) { if (el) el.hidden = !on; }

  function providerLabel(name) {
    if (name === 'google') return 'Google';
    if (name === 'facebook') return 'Facebook';
    if (name === 'email') return 'Email';
    return 'your account';
  }

  var Account = PB.Account = {
    view: 'auth',
    tab: 'login',
    open: function (view) {
      var root = $('pb-account');
      if (!root) return;
      if (view === 'forgot') this.view = 'forgot';
      else if (view === 'delete') { this.view = 'delete'; this.wantDelete = true; this.clearArmed = false; }
      else if (view === 'auth' || view === 'recovery' || root.hidden) this.view = 'auth';
      root.hidden = false;
      setGameInput(false);
      this.render();
    },
    close: function () {
      var root = $('pb-account');
      if (root) root.hidden = true;
      var confirm = $('pb-confirm');
      if (confirm) confirm.hidden = true;
      this.view = 'auth';
      this.wantDelete = false;
      this.clearArmed = false;
      var del = $('pb-delete-input');
      if (del) del.value = '';
      setGameInput(true);
    },
    setTab: function (tab) {
      this.tab = tab === 'signup' ? 'signup' : 'login';
      this.render();
    },
    showView: function (view) {
      this.view = view === 'forgot' ? 'forgot' : 'auth';
      this.render();
    },
    currentView: function (snap) {
      if (snap.recovery) return 'recovery';
      if (snap.accountDeleted) return 'deleted';
      if (this.view === 'forgot') return 'forgot';
      if (snap.signedIn && this.wantDelete) return 'delete';
      return snap.signedIn ? 'account' : 'auth';
    },
    attachInputGuard: function () {
      if (this._guard || !PB.game || !PB.game.events) return;
      this._guard = true;
      PB.game.events.on('poststep', function () {
        var root = $('pb-account');
        if (!root || root.hidden) return;
        setGameInput(false);
      });
      var root = $('pb-account');
      if (root && !root.hidden) setGameInput(false);
    },
    render: function () {
      var cloud = PB.Cloud;
      if (!cloud || !$('pb-account')) return;
      var snap = cloud.snapshot();
      var view = this.currentView(snap);
      var who = $('pb-acct-who');
      // Email addresses and tokens are never written into the page.
      if (snap.signedIn) {
        var parts = [];
        if (snap.displayName) parts.push(snap.displayName);
        parts.push('Signed in with ' + providerLabel(snap.provider));
        who.textContent = parts.join(' · ');
      } else {
        who.textContent = snap.displayName ? snap.displayName + ' · Guest on this device' : 'Guest on this device';
      }
      var title = $('pb-acct-title');
      if (title) {
        title.textContent = view === 'auth' ? (this.tab === 'signup' ? 'SIGN UP' : 'LOG IN')
          : view === 'forgot' ? 'RESET PASSWORD'
          : view === 'recovery' ? 'NEW PASSWORD'
          : view === 'delete' ? 'DELETE ACCOUNT'
          : view === 'deleted' ? 'ACCOUNT DELETED' : 'ACCOUNT';
      }
      VIEWS.forEach(function (name) {
        var el = document.querySelector('[data-view="' + name + '"]');
        show(el, name === view);
      });
      var shown = $('pb-name-shown');
      if (shown) {
        shown.textContent = snap.displayName || '';
        // The name already leads the status line above, so it is not drawn twice.
        shown.hidden = true;
      }
      var nameMsg = $('pb-name-msg');
      if (nameMsg) nameMsg.textContent = snap.nameNote || '';
      var nameInput = $('pb-name-input');
      if (nameInput && document.activeElement !== nameInput) {
        nameInput.value = snap.namePrompt ? (snap.nameSuggestion || '') : (snap.displayName || '');
      }
      show($('pb-name-box'), view === 'auth' || view === 'account');
      $('pb-acct-sync').textContent = snap.sync;
      $('pb-acct-msg').textContent = snap.error || '';
      $('pb-acct-loading').hidden = !snap.loading;
      var ver = $('pb-acct-version');
      if (ver) ver.textContent = 'v' + (PB.VERSION || '');

      // Log in / Sign up tabs.
      var signup = this.tab === 'signup';
      document.querySelectorAll('[data-tab]').forEach(function (tab) {
        var on = tab.getAttribute('data-tab') === (signup ? 'signup' : 'login');
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.classList.toggle('is-on', on);
      });
      var lead = $('pb-auth-lead');
      if (lead) lead.textContent = signup
        ? 'Create an account to keep your progress in the cloud. Or play as a guest.'
        : 'Log in to keep your progress in the cloud. Or play as a guest.';
      show($('pb-password2-row'), signup);
      show(document.querySelector('[data-action="login"]'), !signup);
      show(document.querySelector('[data-action="signup"]'), signup);
      show(document.querySelector('#pb-email-form [data-action="forgot"]'), !signup);
      var resendBtn = document.querySelector('[data-action="resend-confirm"]');
      var pendingConfirm = !!(snap.pendingConfirmEmail);
      show(resendBtn, pendingConfirm && view === 'auth');
      if (resendBtn) {
        var cWait = snap.confirmWait || 0;
        resendBtn.textContent = cWait > 0
          ? 'Resend confirmation · wait ' + Math.ceil(cWait / 1000) + 's'
          : 'Resend confirmation email';
        if (cWait > 0 && !this._tick) {
          var selfConfirm = this;
          this._tick = setTimeout(function () { selfConfirm._tick = null; selfConfirm.render(); }, 1000);
        }
      }
      var pass = $('pb-password-input');
      if (pass) pass.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');

      var guest = document.querySelector('[data-action="guest"]');
      var link = document.querySelector('[data-action="link"]');
      var logout = document.querySelector('[data-action="logout"]');
      if (guest) guest.hidden = snap.signedIn;
      if (logout) logout.hidden = !snap.signedIn || view !== 'account';
      var delStart = document.querySelector('[data-action="delete-start"]');
      if (delStart) { delStart.hidden = !snap.signedIn || view !== 'account'; setDisabled(delStart, snap.loading); }
      var delInput = $('pb-delete-input');
      var delBtn = document.querySelector('[data-action="delete-confirm"]');
      if (delBtn) setDisabled(delBtn, snap.loading || !PB.DeleteCore || !PB.DeleteCore.matches(delInput ? delInput.value : ''));
      if (delInput) setDisabled(delInput, snap.loading);
      var clearBtn = document.querySelector('[data-action="clear-device"]');
      if (clearBtn) clearBtn.textContent = this.clearArmed ? 'Tap again to clear this device' : 'Also clear this device\'s progress';
      var progress = PB.SaveSync.hasProgress(PB.Save.data);
      if (link) link.hidden = snap.signedIn || !progress;
      this.paintProvider('google', snap.loading);
      this.paintProvider('facebook', snap.loading);
      this.paintProvider('email', snap.loading);

      // Set a new password after the reset link returns.
      var recForm = $('pb-recovery-form');
      var recState = $('pb-recovery-state');
      var retry = $('pb-recovery-retry');
      if (view === 'recovery') {
        var checking = !snap.signedIn && (snap.loading || !snap.ready);
        var failed = !snap.signedIn && !checking;
        show(recForm, snap.signedIn);
        show(retry, failed);
        if (recState) {
          recState.textContent = snap.signedIn ? 'Type a new password twice. Your progress stays on this device.'
            : checking ? 'Checking your reset link…'
            : 'This reset link could not be used here. Ask for a new link and open it on this phone.';
        }
      }
      var sendReset = document.querySelector('[data-action="send-reset"]');
      if (sendReset) {
        var wait = snap.resetWait || 0;
        sendReset.textContent = wait > 0 ? 'Link sent · resend in ' + Math.ceil(wait / 1000) + 's' : 'Send reset link';
        if (wait > 0 && !this._tick) {
          var self = this;
          this._tick = setTimeout(function () { self._tick = null; self.render(); }, 1000);
        }
      }

      var migrate = $('pb-migrate');
      if (migrate) {
        migrate.hidden = !snap.pending;
        if (snap.pending) {
          $('pb-migrate-title').textContent = snap.pending.different
            ? 'This device was synced with a different account'
            : 'This device and the account both have progress';
          $('pb-migrate-body').textContent = 'Merge keeps the best scores, stars, unlocks and skins from both sides. Coins, equipped items, settings and today\'s missions come from whichever save was changed more recently. Use cloud replaces this device with the account copy. Keep this device keeps this phone\'s coins and settings, and still keeps any better scores from the account.';
          document.querySelectorAll('[data-choice]').forEach(function (btn) {
            var blockCloud = btn.getAttribute('data-choice') === 'cloud' && !snap.pending.hasRemote;
            setDisabled(btn, snap.loading || blockCloud);
          });
        }
      }
      var sheetBusy = snap.loading;
      var emailOn = cloud.providerEnabled('email');
      document.querySelectorAll('[data-action="save-name"], #pb-name-input').forEach(function (el) {
        setDisabled(el, sheetBusy);
      });
      var emailIds = ['pb-email-input', 'pb-password-input', 'pb-password2-input', 'pb-forgot-email'];
      var emailActions = ['login', 'signup', 'forgot', 'send-reset', 'resend-confirm'];
      document.querySelectorAll('#pb-account input, #pb-account button').forEach(function (el) {
        if (el.closest && el.closest('#pb-migrate, #pb-confirm')) return;
        var action = el.getAttribute('data-action') || '';
        if (emailIds.indexOf(el.id) >= 0 || emailActions.indexOf(action) >= 0) {
          var block = sheetBusy || !emailOn;
          if (action === 'send-reset' && (snap.resetWait || 0) > 0) block = true;
          if (action === 'resend-confirm' && (snap.confirmWait || 0) > 0) block = true;
          setDisabled(el, block);
        } else if (action === 'set-password' || el.id === 'pb-new-password' || el.id === 'pb-new-password2') {
          setDisabled(el, sheetBusy || !snap.signedIn);
        } else if (action === 'guest' || action === 'logout' || action === 'link') {
          setDisabled(el, sheetBusy);
        }
      });
    },
    paintProvider: function (name, loading) {
      var on = PB.Cloud.providerEnabled(name);
      var enabled = on && !loading;
      var note = $('pb-note-' + name);
      if (note) {
        if (on) note.textContent = '';
        else note.textContent = name === 'facebook' ? 'Coming soon. Not set up yet.' : 'Not set up yet.';
      }
      if (name === 'facebook') show($('pb-soon-facebook'), !on);
      if (name === 'email') return;
      var btn = document.querySelector('[data-action="' + name + '"]');
      setDisabled(btn, !enabled);
    }
  };

  function emailValue() { return ($('pb-email-input').value || '').trim(); }
  function passwordValue() { return $('pb-password-input').value || ''; }

  function submitEmail() {
    if (Account.tab === 'signup') {
      var second = $('pb-password2-input').value || '';
      if (second !== passwordValue()) {
        PB.Cloud.errorText = 'The two passwords do not match.';
        Account.render();
        return;
      }
      PB.Cloud.signUpEmail(emailValue(), passwordValue()).then(function () {
        if (PB.Cloud.session) return;
        var outcome = PB.Cloud.lastSignupOutcome || '';
        if (outcome === 'exists' || /already has an account/i.test(PB.Cloud.errorText || '')) {
          Account.tab = 'login';
          $('pb-password2-input').value = '';
          // Keep email prefilled; clear password so they type it for login.
          $('pb-password-input').value = '';
          Account.render();
          return;
        }
        if (outcome === 'confirm') {
          // Stay on Sign up so Resend confirmation stays visible; email stays filled.
          $('pb-password2-input').value = '';
          Account.render();
        }
      });
      return;
    }
    PB.Cloud.signInEmail(emailValue(), passwordValue());
  }

  document.getElementById('pb-account').addEventListener('click', function (event) {
    var choice = event.target.closest ? event.target.closest('[data-choice]') : null;
    var actionEl = event.target.closest ? event.target.closest('[data-action]') : null;
    var tabEl = event.target.closest ? event.target.closest('[data-tab]') : null;
    if (choice) {
      event.preventDefault();
      PB.Cloud.choose(choice.getAttribute('data-choice'));
      return;
    }
    if (tabEl) {
      event.preventDefault();
      PB.Cloud.errorText = '';
      Account.setTab(tabEl.getAttribute('data-tab'));
      return;
    }
    if (!actionEl) return;
    var action = actionEl.getAttribute('data-action');
    if (action === 'close' || action === 'guest' || action === 'decide-later') {
      event.preventDefault();
      Account.close();
      return;
    }
    if (action === 'google' || action === 'facebook') {
      event.preventDefault();
      // Facebook stays off until its OAuth app is configured: no request is made.
      if (!PB.Cloud.providerEnabled(action)) {
        PB.Cloud.errorText = action === 'facebook' ? 'Facebook login is coming soon.' : 'Not set up yet.';
        Account.render();
        return;
      }
      PB.Cloud.signInOAuth(action);
      return;
    }
    if (action === 'toggle-password') {
      event.preventDefault();
      var showing = $('pb-password-input').type === 'text';
      ['pb-password-input', 'pb-password2-input'].forEach(function (id) { var el = $(id); if (el) el.type = showing ? 'password' : 'text'; });
      actionEl.textContent = showing ? 'Show' : 'Hide';
      actionEl.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      return;
    }
    if (action === 'signup') {
      event.preventDefault();
      submitEmail();
      return;
    }
    if (action === 'forgot') {
      event.preventDefault();
      var typed = emailValue();
      var box = $('pb-forgot-email');
      if (box && typed && !box.value) box.value = typed;
      if (PB.Cloud.recovery) PB.Cloud.recovery = false;
      PB.Cloud.errorText = '';
      Account.showView('forgot');
      if (box && !box.disabled) box.focus();
      return;
    }
    if (action === 'send-reset') {
      event.preventDefault();
      PB.Cloud.forgotEmail(($('pb-forgot-email').value || '').trim());
      return;
    }
    if (action === 'resend-confirm') {
      event.preventDefault();
      var email = emailValue() || (PB.Cloud.pendingConfirmEmail || '');
      if (email && $('pb-email-input') && !$('pb-email-input').value) {
        $('pb-email-input').value = email;
      }
      PB.Cloud.resendConfirmEmail(email);
      return;
    }
    if (action === 'to-login') {
      event.preventDefault();
      PB.Cloud.errorText = '';
      Account.tab = 'login';
      Account.showView('auth');
      return;
    }
    if (action === 'cancel-recovery') {
      event.preventDefault();
      PB.Cloud.errorText = '';
      PB.Cloud.cancelRecovery();
      Account.showView('auth');
      return;
    }
    if (action === 'link') {
      event.preventDefault();
      PB.Cloud.errorText = 'Sign in below to link the progress on this device. You will be asked before anything is replaced.';
      Account.tab = 'login';
      Account.render();
      var input = $('pb-email-input');
      if (input && !input.disabled) input.focus();
      return;
    }
    if (action === 'open-page') {
      event.preventDefault();
      PB.Cloud.openPage(actionEl.getAttribute('data-page'));
      return;
    }
    if (action === 'delete-start') {
      event.preventDefault();
      PB.Cloud.errorText = '';
      Account.open('delete');
      var delBox = $('pb-delete-input');
      if (delBox && !delBox.disabled) delBox.focus();
      return;
    }
    if (action === 'delete-cancel') {
      event.preventDefault();
      Account.wantDelete = false;
      Account.view = 'auth';
      $('pb-delete-input').value = '';
      PB.Cloud.errorText = 'Nothing was deleted.';
      Account.render();
      return;
    }
    if (action === 'delete-confirm') {
      event.preventDefault();
      PB.Cloud.deleteAccount($('pb-delete-input').value).then(function (ok) {
        if (ok) {
          Account.wantDelete = false;
          Account.clearArmed = false;
          $('pb-delete-input').value = '';
        }
        Account.render();
      });
      return;
    }
    if (action === 'keep-device') {
      event.preventDefault();
      Account.clearArmed = false;
      PB.Cloud.keepDeviceProgress();
      return;
    }
    if (action === 'clear-device') {
      event.preventDefault();
      if (!Account.clearArmed) {
        Account.clearArmed = true;
        Account.render();
        return;
      }
      Account.clearArmed = false;
      PB.Cloud.clearDeviceProgress();
      return;
    }
    if (action === 'logout') {
      event.preventDefault();
      $('pb-confirm').hidden = false;
      return;
    }
    if (action === 'confirm-cancel') {
      event.preventDefault();
      $('pb-confirm').hidden = true;
      return;
    }
    if (action === 'confirm-logout') {
      event.preventDefault();
      $('pb-confirm').hidden = true;
      PB.Cloud.logout();
      return;
    }
    if (action === 'save-name') {
      event.preventDefault();
      PB.Cloud.saveDisplayName($('pb-name-input').value);
      return;
    }
    if (action === 'set-password') {
      event.preventDefault();
      PB.Cloud.updatePassword($('pb-new-password').value || '', $('pb-new-password2').value || '').then(function () {
        if (!PB.Cloud.recovery) {
          $('pb-new-password').value = '';
          $('pb-new-password2').value = '';
        }
        Account.render();
      });
    }
  });

  $('pb-email-form').addEventListener('submit', function (event) {
    event.preventDefault();
    submitEmail();
  });

  $('pb-delete-input').addEventListener('input', function () { Account.render(); });

  $('pb-forgot-email').addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    PB.Cloud.forgotEmail(($('pb-forgot-email').value || '').trim());
  });

  Account.render();
  if (PB.Cloud.pending || PB.Cloud.errorText || PB.Cloud.recovery) Account.open();
})();
