/*
 * PRISMBURST cloud config (provider switches only).
 * Firebase project values live in js/firebase-config.js.
 * Never put a service-account JSON, private key, or Admin SDK credential here.
 *
 * A provider button is active only when its flag below is true AND
 * js/firebase-config.js has real (non-PLACEHOLDER_) values.
 * Facebook stays off until you explicitly enable it after OAuth setup.
 */
window.PB_CONFIG = {
  providers: {
    email: true,
    google: true,
    facebook: false
  }
};
