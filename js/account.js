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

  var Account = PB.Account = {
    open: function () {
      var root = $('pb-account');
      if (!root) return;
      root.hidden = false;
      setGameInput(false);
      this.render();
    },
    close: function () {
      var root = $('pb-account');
      if (root) root.hidden = true;
      var confirm = $('pb-confirm');
      if (confirm) confirm.hidden = true;
      setGameInput(true);
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
      var who = $('pb-acct-who');
      if (snap.signedIn) {
        var provider = snap.provider ? snap.provider.charAt(0).toUpperCase() + snap.provider.slice(1) : 'Account';
        who.textContent = (snap.email || 'Signed in') + ' · ' + provider;
      } else {
        who.textContent = 'Guest on this device';
      }
      $('pb-acct-sync').textContent = snap.sync;
      $('pb-acct-msg').textContent = snap.error || '';
      $('pb-acct-loading').hidden = !snap.loading;
      var guest = document.querySelector('[data-action="guest"]');
      var link = document.querySelector('[data-action="link"]');
      var logout = document.querySelector('[data-action="logout"]');
      if (guest) guest.hidden = snap.signedIn;
      if (logout) logout.hidden = !snap.signedIn;
      var progress = PB.SaveSync.hasProgress(PB.Save.data);
      if (link) link.hidden = snap.signedIn || !progress;
      this.paintProvider('google', snap.loading);
      this.paintProvider('facebook', snap.loading);
      this.paintProvider('email', snap.loading);
      var recovery = $('pb-recovery');
      if (recovery) recovery.hidden = !(snap.signedIn && snap.recovery);
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
      document.querySelectorAll('#pb-email-form button, #pb-email-form input, [data-action="guest"], [data-action="logout"], [data-action="link"], [data-action="set-password"]').forEach(function (el) {
        if (el.closest && el.closest('#pb-migrate')) return;
        if (el.id === 'pb-email-input' || el.id === 'pb-password-input' || el.getAttribute('data-action') === 'login' || el.getAttribute('data-action') === 'signup' || el.getAttribute('data-action') === 'forgot') {
          setDisabled(el, sheetBusy || !cloud.providerEnabled('email'));
        } else if (!el.hidden) {
          setDisabled(el, sheetBusy);
        }
      });
    },
    paintProvider: function (name, loading) {
      var enabled = PB.Cloud.providerEnabled(name) && !loading;
      var note = $('pb-note-' + name);
      if (note) note.textContent = enabled ? '' : 'Not set up yet.';
      if (name === 'email') return;
      var btn = document.querySelector('[data-action="' + name + '"]');
      setDisabled(btn, !enabled);
    }
  };

  function emailValue() { return ($('pb-email-input').value || '').trim(); }
  function passwordValue() { return $('pb-password-input').value || ''; }

  document.getElementById('pb-account').addEventListener('click', function (event) {
    var choice = event.target.closest ? event.target.closest('[data-choice]') : null;
    var actionEl = event.target.closest ? event.target.closest('[data-action]') : null;
    if (choice) {
      event.preventDefault();
      PB.Cloud.choose(choice.getAttribute('data-choice'));
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
      if (!PB.Cloud.providerEnabled(action)) {
        PB.Cloud.errorText = 'Not set up yet.';
        Account.render();
        return;
      }
      PB.Cloud.signInOAuth(action);
      return;
    }
    if (action === 'signup') {
      event.preventDefault();
      $('pb-password-input').setAttribute('autocomplete', 'new-password');
      PB.Cloud.signUpEmail(emailValue(), passwordValue());
      return;
    }
    if (action === 'forgot') {
      event.preventDefault();
      PB.Cloud.forgotEmail(emailValue());
      return;
    }
    if (action === 'link') {
      event.preventDefault();
      PB.Cloud.errorText = 'Sign in below to link the progress on this device. You will be asked before anything is replaced.';
      Account.render();
      var input = $('pb-email-input');
      if (input && !input.disabled) input.focus();
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
    if (action === 'set-password') {
      event.preventDefault();
      PB.Cloud.updatePassword($('pb-new-password').value || '');
    }
  });

  $('pb-email-form').addEventListener('submit', function (event) {
    event.preventDefault();
    $('pb-password-input').setAttribute('autocomplete', 'current-password');
    PB.Cloud.signInEmail(emailValue(), passwordValue());
  });

  Account.render();
  if (PB.Cloud.pending || PB.Cloud.errorText) Account.open();
})();
