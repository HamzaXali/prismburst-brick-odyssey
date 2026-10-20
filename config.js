/*
 * PRISMBURST cloud config.
 * Only the Supabase project URL and the publishable (anon) key belong here.
 * Never put the dashboard secret key in this file or anywhere else in the repo.
 * Leave the strings empty to keep the game fully offline.
 *
 * A provider button is active only when its flag below is true AND both
 * strings are filled in. Google and Facebook ship off; turn them on only
 * after that provider's OAuth client is saved in the Supabase dashboard.
 * Email is allowed here, but the button stays off until the URL and key exist.
 */
window.PB_CONFIG = {
  supabaseUrl: 'https://qogqnutpqzatxnbhcznc.supabase.co',
  supabaseAnonKey: 'sb_publishable_GXcDg41LoH39qGsu_zY9Zw_0I_elhPq',
  providers: {
    email: true,
    google: true,
    facebook: false
  }
};
